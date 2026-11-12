//! 키 배치와 해석기(`apps/web/src/cube/input/`): 키 누름 → 동작 → 수·명령. 사이트와 같은 결과를 내는지는
//! 공통 시험 자료 `fixtures/keys.json`으로 본다.

pub mod actions;
pub mod interpreter;
pub mod keymap;
pub mod route;

pub use actions::{canonical_notation, notation_to_move, Command};
pub use interpreter::{with_layers, KeyInterpreter, KeyResult};
pub use keymap::{notation_keymap, preset_keymap, two_hand_keymap, KeyInput, Keymap, Preset};
pub use route::{
    keycap_label, keycaps_for_move, keys_for_move, keys_for_move_from, normalize_move, route_for,
    HandLayers, KeyChord, KeyRoute, HOME_LAYERS,
};
