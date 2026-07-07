//! Virtual-key <-> Keyfloe keyId mapping and left/right discrimination.
//!
//! The Windows low-level keyboard hook (`WH_KEYBOARD_LL`) reports the specific
//! left/right virtual-key codes for Ctrl/Alt/Shift (VK_LCONTROL/VK_RCONTROL,
//! etc.) in `KBDLLHOOKSTRUCT.vkCode`. As a safety net we also fold the generic
//! VK_CONTROL/VK_MENU/VK_SHIFT codes using the `LLKHF_EXTENDED` flag (right
//! Ctrl/Alt are extended keys).
//!
//! Cross-platform: pure integer logic, so it compiles and tests on any OS.

// Windows virtual-key constants (subset). Values are the stable Win32 VK_*.
pub const VK_SHIFT: u32 = 0x10;
pub const VK_CONTROL: u32 = 0x11;
pub const VK_MENU: u32 = 0x12; // Alt
pub const VK_CAPITAL: u32 = 0x14;
pub const VK_LWIN: u32 = 0x5B;
pub const VK_RWIN: u32 = 0x5C;
pub const VK_APPS: u32 = 0x5D;
pub const VK_LSHIFT: u32 = 0xA0;
pub const VK_RSHIFT: u32 = 0xA1;
pub const VK_LCONTROL: u32 = 0xA2;
pub const VK_RCONTROL: u32 = 0xA3;
pub const VK_LMENU: u32 = 0xA4;
pub const VK_RMENU: u32 = 0xA5;

/// Resolve a hook event to a Keyfloe keyId string. `extended` is the
/// `LLKHF_EXTENDED` flag from `KBDLLHOOKSTRUCT.flags`.
///
/// Returns ids for the modifier-ish keys Keyfloe can watch. Non-modifier keys
/// return `None` (they are only used as activity pings for tap disqualification).
pub fn key_id_from_vk(vk: u32, extended: bool) -> Option<&'static str> {
    let id = match vk {
        VK_CAPITAL => "caps",
        VK_LWIN => "lwin",
        VK_RWIN => "rwin",
        VK_APPS => "apps",
        VK_LSHIFT => "lshift",
        VK_RSHIFT => "rshift",
        VK_LCONTROL => "lctrl",
        VK_RCONTROL => "rctrl",
        VK_LMENU => "lalt",
        VK_RMENU => "ralt",
        // Generic fallbacks: discriminate L/R via the extended-key flag.
        VK_SHIFT => {
            if extended {
                "rshift"
            } else {
                "lshift"
            }
        }
        VK_CONTROL => {
            if extended {
                "rctrl"
            } else {
                "lctrl"
            }
        }
        VK_MENU => {
            if extended {
                "ralt"
            } else {
                "lalt"
            }
        }
        _ => return None,
    };
    Some(id)
}

/// The canonical VK a keyId maps to (for tests / documentation). Left/right
/// specific where applicable.
pub fn vk_for_key_id(id: &str) -> Option<u32> {
    Some(match id {
        "caps" => VK_CAPITAL,
        "lwin" => VK_LWIN,
        "rwin" => VK_RWIN,
        "apps" => VK_APPS,
        "lshift" => VK_LSHIFT,
        "rshift" => VK_RSHIFT,
        "lctrl" => VK_LCONTROL,
        "rctrl" => VK_RCONTROL,
        "lalt" => VK_LMENU,
        "ralt" => VK_RMENU,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_right_modifiers() {
        assert_eq!(key_id_from_vk(VK_RCONTROL, true), Some("rctrl"));
        assert_eq!(key_id_from_vk(VK_RMENU, true), Some("ralt"));
        assert_eq!(key_id_from_vk(VK_CAPITAL, false), Some("caps"));
        assert_eq!(key_id_from_vk(VK_APPS, false), Some("apps"));
    }

    #[test]
    fn generic_control_uses_extended_flag() {
        assert_eq!(key_id_from_vk(VK_CONTROL, true), Some("rctrl"));
        assert_eq!(key_id_from_vk(VK_CONTROL, false), Some("lctrl"));
    }

    #[test]
    fn letters_return_none() {
        assert_eq!(key_id_from_vk(0x41 /* 'A' */, false), None);
    }
}
