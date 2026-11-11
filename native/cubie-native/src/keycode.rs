//! 맥 가상 키 코드(`NSEvent.keyCode`, Carbon `kVK_*`) → `KeyboardEvent.code`. 키 배치가 자판 위치(`code`)로 적혀 있어
//! 한글 입력 상태에서도 같은 자리로 동작한다(사이트와 같다). 배치에 쓰는 키와 명령 키만 둔다.

pub fn mac_key_code(key: u16) -> Option<&'static str> {
    Some(match key {
        0 => "KeyA",
        1 => "KeyS",
        2 => "KeyD",
        3 => "KeyF",
        4 => "KeyH",
        5 => "KeyG",
        6 => "KeyZ",
        7 => "KeyX",
        8 => "KeyC",
        9 => "KeyV",
        11 => "KeyB",
        12 => "KeyQ",
        13 => "KeyW",
        14 => "KeyE",
        15 => "KeyR",
        16 => "KeyY",
        17 => "KeyT",
        18 => "Digit1",
        19 => "Digit2",
        20 => "Digit3",
        21 => "Digit4",
        22 => "Digit6",
        23 => "Digit5",
        24 => "Equal",
        25 => "Digit9",
        26 => "Digit7",
        27 => "Minus",
        28 => "Digit8",
        29 => "Digit0",
        30 => "BracketRight",
        31 => "KeyO",
        32 => "KeyU",
        33 => "BracketLeft",
        34 => "KeyI",
        35 => "KeyP",
        36 => "Enter",
        37 => "KeyL",
        38 => "KeyJ",
        39 => "Quote",
        40 => "KeyK",
        41 => "Semicolon",
        42 => "Backslash",
        43 => "Comma",
        44 => "Slash",
        45 => "KeyN",
        46 => "KeyM",
        47 => "Period",
        48 => "Tab",
        49 => "Space",
        50 => "Backquote",
        51 => "Backspace",
        53 => "Escape",
        76 => "NumpadEnter",
        122 => "F1",
        123 => "ArrowLeft",
        124 => "ArrowRight",
        125 => "ArrowDown",
        126 => "ArrowUp",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn letters_and_digits_have_distinct_codes() {
        let mut seen = std::collections::HashSet::new();
        for k in 0..128 {
            if let Some(c) = mac_key_code(k) {
                assert!(seen.insert(c), "겹침 {c}");
            }
        }
        // 두 손 배치의 손가락 자리(I·K·D·E)와 숫자 줄
        assert_eq!(mac_key_code(34), Some("KeyI"));
        assert_eq!(mac_key_code(40), Some("KeyK"));
        assert_eq!(mac_key_code(23), Some("Digit5"));
        assert_eq!(mac_key_code(22), Some("Digit6"));
    }

    /// 두 손·표기 배치에 쓰인 키는 모두 맥 키 코드로 들어올 수 있다
    #[test]
    fn every_preset_key_is_reachable() {
        let known: std::collections::HashSet<_> = (0..128).filter_map(mac_key_code).collect();
        for table in [
            cube_core::keymap_data::TWO_HAND,
            cube_core::keymap_data::NOTATION,
        ] {
            for (code, _, action) in table {
                assert!(known.contains(code), "{code}({action})");
            }
        }
    }
}
