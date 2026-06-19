import { invoke } from "@tauri-apps/api/core";

/// Auto-paste: type `text` into whatever field currently has OS focus, via the
/// Rust `type_text` command (SendInput on Windows / CGEvent on macOS). This is
/// the foundation for Mac-style dictation (speak → words land in the focused
/// field).
///
/// NOTE: for true dictation the caller must restore the previously-focused
/// window before calling this (otherwise it types into the Keyfloe pill, which
/// took focus when its mic button was clicked). That foreground-window
/// save/restore is Windows-native and still to be wired + verified on Windows.
export async function pasteText(text: string): Promise<void> {
  const t = text?.trim();
  if (!t) return;
  try {
    await invoke("type_text", { text: t });
  } catch (e) {
    console.error("pasteText (type_text) failed:", e);
  }
}
