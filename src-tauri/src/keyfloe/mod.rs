//! Keyfloe feature modules, layered on top of the Handy (MIT) base.
//!
//! Each submodule is a self-contained feature (built in isolation, then wired
//! into `lib.rs`): dictation parity, the Floe voice agent, interview mode, AI
//! snapshot, and the tap/hold key-remap engine. The key-remap engine emits
//! `feature_trigger` / `<feature>_trigger` events that the other features
//! consume (see keybinding/INTEGRATION.md §6).

pub mod agent;
pub mod dictation;
pub mod interview;
pub mod keybinding;
pub mod shell;
pub mod snapshot;
