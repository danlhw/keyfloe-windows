//! WH_KEYBOARD_LL low-level keyboard hook on a dedicated thread with its own
//! message pump.
//!
//! Design borrows from the MIT/Apache donor `kbremap`
//! (`src/winapi/keyboard.rs`): the hook proc is trivial — it parses
//! `KBDLLHOOKSTRUCT`, ignores injected events (the `LLKHF_INJECTED` re-entrancy
//! guard), and either suppresses (returns 1) or passes through
//! (`CallNextHookEx`). All timing/policy lives off-thread in the engine.
//!
//! Unlike kbremap (which installs on the main thread and lets `winmsg-executor`
//! pump), we run the hook on our OWN thread with a hand-written `GetMessage`
//! pump. Per tauri#13919 the hook MUST NOT be installed on the webview thread
//! or it silently misses keys. Cross-thread transport is a `std::sync::mpsc`
//! `Sender<RawKey>` stored in a `OnceLock` (the hook proc is `extern "system"`
//! and cannot take state).
//!
//! Everything native is `#[cfg(windows)]`; a stub keeps non-Windows building.

use std::collections::HashSet;
use std::sync::mpsc::Sender;
use std::sync::{OnceLock, RwLock};
use std::time::Instant;

use super::engine::RawKey;

/// Cross-thread channel to the engine. Set once at init.
static ENGINE_TX: OnceLock<Sender<RawKey>> = OnceLock::new();
/// The set of keyIds currently bound (read by the hot hook path to decide
/// suppression). Guarded by an RwLock; reads are brief.
static MANAGED: RwLock<Option<HashSet<String>>> = RwLock::new(None);
/// Capture mode: when a captured key id is sent here, the UI is recording a key.
static CAPTURE_TX: OnceLock<Sender<String>> = OnceLock::new();
static CAPTURE_ON: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn clock() -> &'static Instant {
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now)
}

/// Monotonic milliseconds since first use. Shared by the hook proc (key
/// timestamps) and the engine runtime (hold ticks) so they use one clock.
pub fn now_ms() -> u64 {
    clock().elapsed().as_millis() as u64
}

pub fn set_sender(tx: Sender<RawKey>) {
    let _ = ENGINE_TX.set(tx);
}

pub fn set_managed(keys: HashSet<String>) {
    if let Ok(mut guard) = MANAGED.write() {
        *guard = Some(keys);
    }
}

fn is_managed(key_id: &str) -> bool {
    MANAGED
        .read()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.contains(key_id)))
        .unwrap_or(false)
}

/// Start capture mode. Captured key ids are pushed to `tx`.
pub fn begin_capture(tx: Sender<String>) {
    let _ = CAPTURE_TX.set(tx);
    CAPTURE_ON.store(true, std::sync::atomic::Ordering::SeqCst);
}

pub fn end_capture() {
    CAPTURE_ON.store(false, std::sync::atomic::Ordering::SeqCst);
}

// ===========================================================================
// Windows implementation
// ===========================================================================

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ptr;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        UnhookWindowsHookEx, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_EXTENDED, LLKHF_INJECTED, LLKHF_UP,
        MSG, WH_KEYBOARD_LL,
    };

    use crate::keyfloe::keybinding::keys::key_id_from_vk;

    unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code != HC_ACTION as i32 {
            return CallNextHookEx(ptr::null_mut(), code, wparam, lparam);
        }
        let p = &*(lparam as *const KBDLLHOOKSTRUCT);

        // Ignore our own SendInput (none today, but future-proof) to avoid loops.
        if p.flags & LLKHF_INJECTED != 0 {
            return CallNextHookEx(ptr::null_mut(), code, wparam, lparam);
        }

        let up = p.flags & LLKHF_UP != 0;
        let extended = p.flags & LLKHF_EXTENDED != 0;
        let key_id = key_id_from_vk(p.vkCode, extended);

        // Capture mode: swallow everything, report the physical key id on down.
        if CAPTURE_ON.load(std::sync::atomic::Ordering::SeqCst) {
            if !up {
                if let (Some(k), Some(tx)) = (key_id, CAPTURE_TX.get()) {
                    let _ = tx.send(k.to_string());
                }
            }
            return 1; // suppress so the key never reaches the app/UI
        }

        match key_id {
            Some(k) if is_managed(k) => {
                if let Some(tx) = ENGINE_TX.get() {
                    let _ = tx.send(RawKey::managed(k, !up, now_ms()));
                }
                1 // suppress: the key is fully repurposed by Keyfloe
            }
            _ => {
                // Unmanaged: forward downs as an activity ping so the engine can
                // disqualify an in-flight tap (chord detection), then pass the
                // key through to the OS untouched.
                if !up {
                    if let Some(tx) = ENGINE_TX.get() {
                        let _ = tx.send(RawKey::activity(now_ms()));
                    }
                }
                CallNextHookEx(ptr::null_mut(), code, wparam, lparam)
            }
        }
    }

    pub fn start() {
        // Prime the clock on the caller's thread.
        let _ = super::clock();
        std::thread::Builder::new()
            .name("keyfloe-keyhook".into())
            .spawn(|| unsafe {
                let hook =
                    SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), ptr::null_mut(), 0);
                if hook.is_null() {
                    log::error!("keybinding: failed to install WH_KEYBOARD_LL hook");
                    return;
                }
                log::info!("keybinding: WH_KEYBOARD_LL hook installed on dedicated thread");

                let mut msg: MSG = std::mem::zeroed();
                // LL hook callbacks are delivered while this thread pumps messages.
                while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                UnhookWindowsHookEx(hook);
                log::info!("keybinding: keyhook thread exited");
            })
            .expect("spawn keyhook thread");
    }
}

#[cfg(windows)]
pub use imp::start;

// ===========================================================================
// Non-Windows stub (keeps macOS/Linux CI building; hook is a no-op)
// ===========================================================================

#[cfg(not(windows))]
pub fn start() {
    log::info!("keybinding: native key hook is Windows-only; skipping on this platform");
}
