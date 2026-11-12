//! 단축키 표(F1)의 칸마다 적는 글(사이트 `keys/layout.ts`의 `keyLayers`·`allLayerLines`, Cubie 미니 표
//! `KeysPanelPage` = `KeyboardMap` 「모두」). Cubie 네이티브 표가 이 글을 그대로 그린다. 사이트와 같은지는
//! `fixtures/keytable.json`으로 본다.
//!
//! - 수는 가장 짧은 이름(3×3의 `2L'` → `M'`, 7×7의 `3Rw` 그대로, [`canonical_notation`])
//! - 깊이 키는 그냥 칠 때 「3번째 층」, Shift와 함께면 「바깥 3층」
//! - 그 크기에서 못 쓰는 수는 흐리게 남기고(`usable` false), 못 쓰는 깊이·층 수 키는 뺀다
//! - 화살표는 그냥 칠 때 한 줄

use super::actions::{canonical_notation, is_available, parse_action, ParsedAction};
use super::keymap::{resolve_action, KeyInput, Keymap, ALT, SHIFT};

/// 칸의 한 줄
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TableLine {
    /// 이 줄의 조합 키(0 그냥·[`SHIFT`]·[`ALT`]·둘 다)
    pub mods: u8,
    /// 배치에 적힌 동작 이름(면 색을 고를 때 쓴다)
    pub action: String,
    /// 칸에 적는 글
    pub label: String,
    /// 이 크기에서 쓸 수 있나(없으면 흐리게)
    pub usable: bool,
}

/// 키 칸 하나(위에서부터 줄)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TableCell {
    pub code: String,
    pub lines: Vec<TableLine>,
}

/// 표에 그리는 키(사이트 `KEYBOARD_ROWS` 차례, 조합 키 칸과 빈칸은 뺀다). 화살표는 ↑ ← ↓ →
pub const TABLE_CODES: &[&str] = &[
    "Escape",
    "Backquote",
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Digit6",
    "Digit7",
    "Digit8",
    "Digit9",
    "Digit0",
    "Minus",
    "Equal",
    "Backspace",
    "KeyQ",
    "KeyW",
    "KeyE",
    "KeyR",
    "KeyT",
    "KeyY",
    "KeyU",
    "KeyI",
    "KeyO",
    "KeyP",
    "BracketLeft",
    "BracketRight",
    "Backslash",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyF",
    "KeyG",
    "KeyH",
    "KeyJ",
    "KeyK",
    "KeyL",
    "Semicolon",
    "Quote",
    "Enter",
    "KeyZ",
    "KeyX",
    "KeyC",
    "KeyV",
    "KeyB",
    "KeyN",
    "KeyM",
    "Comma",
    "Period",
    "Slash",
    "Space",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
];

/// 명령의 짧은 이름(사이트 `SHORT_COMMAND`)
fn short_command(id: &str) -> Option<&'static str> {
    Some(match id {
        "undo" => "되돌리기",
        "reset" => "처음으로",
        "scramble" => "섞기",
        "inspectionSkip" => "살펴보기",
        "peekBack" => "뒤 보기",
        "peekDown" => "아래 보기",
        "viewHome" => "처음 각도",
        _ => return None,
    })
}

/// 동작 하나를 칸에 적는 글(사이트 `keyLayers`의 `label`). `shift`: Shift를 함께 치는 줄인가
pub fn key_label(n: usize, action: &str, shift: bool) -> String {
    match parse_action(action) {
        Some(ParsedAction::Move(text)) => canonical_notation(n, text),
        Some(ParsedAction::Depth(d)) if shift => format!("바깥 {d}층"),
        Some(ParsedAction::Depth(d)) => format!("{d}번째 층"),
        // 「층 +1」은 줄이 접혀도 붙어 있게 줄 바꿈 없는 빈칸(U+00A0)
        Some(ParsedAction::Layers { hand, delta }) => format!(
            "{} 층\u{a0}{}",
            if hand == super::actions::Hand::Left {
                "왼손"
            } else {
                "오른손"
            },
            if delta > 0 { "+1" } else { "−1" }
        ),
        _ => short_command(action).unwrap_or(action).to_string(),
    }
}

/// 다음 키의 뜻을 바꾸는 키(깊이·층 수)인가
fn is_key_mode(action: &str) -> bool {
    matches!(
        parse_action(action),
        Some(ParsedAction::Depth(_) | ParsedAction::Layers { .. })
    )
}

fn line(keymap: &Keymap, n: usize, code: &str, mods: u8) -> Option<TableLine> {
    let input = KeyInput {
        code,
        shift: mods & SHIFT != 0,
        alt: mods & ALT != 0,
        ..KeyInput::default()
    };
    let action = resolve_action(keymap, &input)?;
    Some(TableLine {
        mods,
        action: action.to_string(),
        label: key_label(n, action, mods & SHIFT != 0),
        usable: is_available(n, action),
    })
}

/// 키 하나의 줄: 그냥(굵게)·Shift·Alt(없으면 Alt+Shift)·둘 다 있으면 Alt+Shift(사이트 `allLayerLines`). 화살표는 그냥 한 줄
pub fn cell_lines(keymap: &Keymap, n: usize, code: &str) -> Vec<TableLine> {
    if code.starts_with("Arrow") {
        return line(keymap, n, code, 0).into_iter().collect();
    }
    let plain = line(keymap, n, code, 0);
    let shift = line(keymap, n, code, SHIFT);
    let alt = line(keymap, n, code, ALT);
    let alt_shift = line(keymap, n, code, ALT | SHIFT);
    let both = alt.is_some() && alt_shift.is_some();
    let third = alt.or_else(|| alt_shift.clone());
    let fourth = if both { alt_shift } else { None };
    [plain, shift, third, fourth]
        .into_iter()
        .flatten()
        .filter(|l| l.usable || !is_key_mode(&l.action))
        .collect()
}

/// 표 전체: 적을 줄이 있는 키만 [`TABLE_CODES`] 차례로
pub fn key_table(keymap: &Keymap, n: usize) -> Vec<TableCell> {
    TABLE_CODES
        .iter()
        .filter_map(|&code| {
            let lines = cell_lines(keymap, n, code);
            (!lines.is_empty()).then(|| TableCell {
                code: code.to_string(),
                lines,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::two_hand_keymap;

    fn labels(n: usize, code: &str) -> Vec<String> {
        cell_lines(&two_hand_keymap(), n, code)
            .into_iter()
            .map(|l| l.label)
            .collect()
    }

    #[test]
    fn middle_layer_keys_use_slice_names() {
        // 「두 손」 X·. 는 3×3에서 M′(docs/53 10절), 큰 큐브에서는 둘째 층
        assert_eq!(labels(3, "KeyX"), ["M'"]);
        assert_eq!(labels(3, "Period"), ["M'"]);
        assert_eq!(labels(4, "KeyX"), ["2L'"]);
        assert_eq!(labels(3, "KeyT"), ["M'"]);
        assert_eq!(labels(3, "Digit3"), ["3번째 층", "바깥 3층"]);
        assert_eq!(labels(3, "ArrowUp"), ["처음 각도"]);
    }
}
