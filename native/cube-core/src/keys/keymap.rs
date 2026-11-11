//! 키 배치(`apps/web/src/cube/input/keymaps.ts`): 어느 키가 어느 동작인가. 키는 `KeyboardEvent.code`(자판 위치)로 적는다.
//! 기본 배치 둘(「두 손」·「표기」)은 사이트 배치에서 만든 [`crate::keymap_data`]를 그대로 읽는다. 사이트에서 배치를
//! 바꾸면 자료를 다시 쓰기만 하면 된다(`apps/web/src/cube/native/core-fixtures.ts` 머리말).

use crate::keymap_data;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Preset {
    TwoHand,
    Notation,
    Custom,
}

impl Preset {
    pub fn id(self) -> &'static str {
        match self {
            Preset::TwoHand => "twoHand",
            Preset::Notation => "notation",
            Preset::Custom => "custom",
        }
    }

    pub fn from_id(id: &str) -> Option<Preset> {
        [Preset::TwoHand, Preset::Notation, Preset::Custom]
            .into_iter()
            .find(|p| p.id() == id)
    }
}

/// 조합 키 비트(자료 파일과 같다)
pub const SHIFT: u8 = 1;
pub const ALT: u8 = 2;
pub const CTRL: u8 = 4;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KeyBinding {
    pub code: String,
    /// [`SHIFT`]·[`ALT`]·[`CTRL`]을 더한 값
    pub mods: u8,
    pub action: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Keymap {
    pub preset: Preset,
    pub bindings: Vec<KeyBinding>,
}

/// 키 누름 하나
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct KeyInput<'a> {
    pub code: &'a str,
    pub shift: bool,
    pub alt: bool,
    pub ctrl: bool,
    pub meta: bool,
    /// 키를 누르고 있어 저절로 되풀이된 누름
    pub repeat: bool,
}

impl KeyInput<'_> {
    fn mods(&self) -> u8 {
        (if self.shift { SHIFT } else { 0 })
            | (if self.alt { ALT } else { 0 })
            | (if self.ctrl { CTRL } else { 0 })
    }
}

fn from_table(preset: Preset, table: &[(&str, u8, &str)]) -> Keymap {
    Keymap {
        preset,
        bindings: table
            .iter()
            .map(|&(code, mods, action)| KeyBinding {
                code: code.to_string(),
                mods,
                action: action.to_string(),
            })
            .collect(),
    }
}

/// 「두 손」(기본, 빠르기)
pub fn two_hand_keymap() -> Keymap {
    from_table(Preset::TwoHand, keymap_data::TWO_HAND)
}

/// 「표기」(처음, 직관)
pub fn notation_keymap() -> Keymap {
    from_table(Preset::Notation, keymap_data::NOTATION)
}

pub fn preset_keymap(preset: Preset) -> Keymap {
    match preset {
        Preset::Notation => notation_keymap(),
        _ => two_hand_keymap(),
    }
}

/// 키 누름 → 동작. 되풀이 누름과 ⌘(Meta) 조합은 무시한다. 다만 ⌘Z는 Ctrl+Z에 놓인 동작이 되돌리기일 때만 되돌리기.
/// 조합 키는 정확히 같아야 한다
pub fn resolve_action<'k>(keymap: &'k Keymap, input: &KeyInput) -> Option<&'k str> {
    if input.repeat {
        return None;
    }
    if input.meta {
        let cmd_z = input.code == "KeyZ" && !input.ctrl && !input.shift && !input.alt;
        if !cmd_z {
            return None;
        }
        let action = resolve_action(
            keymap,
            &KeyInput {
                meta: false,
                ctrl: true,
                ..*input
            },
        );
        return action.filter(|a| *a == "undo");
    }
    let mods = input.mods();
    keymap
        .bindings
        .iter()
        .find(|b| b.code == input.code && b.mods == mods)
        .map(|b| b.action.as_str())
}
