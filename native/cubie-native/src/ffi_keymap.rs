//! 사용자 키 배치 편집 C ABI(Cubie 설정 창, 코어 `keys::editor`, docs/52 5-8). 배치는 앱 저장소의 `cube.keymap.v1` 글
//! 그대로 주고받는다. 판단과 글은 모두 코어가 만들고(사이트와 공통 시험 자료 어긋남 0), 앱은 그리기만 한다.

use std::ffi::c_char;

use crate::ffi_game::{c_str, write_str};
use cube_core::keys::editor::{
    actions_for, ask_before_assign, assign, chord_from_event, chord_key, chord_label, clear_action,
    conflicts_text, custom_from, export_keymap, group_label, import_keymap, keyless_actions,
    keyless_text, keys_of, load, preset, reset_text, stored_json, to_custom, unbind, Chord,
    IMPORTED_TEXT,
};
use cube_core::keys::Preset;

/// 편집기 화면 줄들(사이트 `KeymapSection` 차례):
/// `preset\t<id>` · `mouse\t0|1` · `keyless\t<글>` · `conflicts\t<글>`, 그다음 묶음마다
/// `group\t<id>\t<이름>\t<동작 수>\t<키 없는 동작 수>`와 그 묶음의 동작마다
/// `action\t<id>\t<이름>\t<키 없음 0|1>\t<키들>`(키는 「chordKey 0x1f 키 이름」을 0x1e로 이음, 키 이름 차례)
pub fn view_text(stored: Option<&str>, n: usize) -> String {
    let e = load(stored);
    let keyless = keyless_actions(&e, n);
    let mut lines = vec![
        format!("preset\t{}", e.keymap.preset.id()),
        format!("mouse\t{}", u8::from(e.mouse_rotate)),
        format!("keyless\t{}", keyless_text(&keyless)),
        format!("conflicts\t{}", conflicts_text(&e)),
    ];
    let actions = actions_for(n);
    let mut groups: Vec<&str> = vec![];
    for a in &actions {
        if !groups.contains(&a.group) {
            groups.push(a.group);
        }
    }
    for g in groups {
        let list: Vec<_> = actions.iter().filter(|a| a.group == g).collect();
        let missing = list.iter().filter(|a| keyless.contains(&a.id)).count();
        lines.push(format!(
            "group\t{g}\t{}\t{}\t{missing}",
            group_label(g),
            list.len()
        ));
        for a in list {
            let keys: Vec<String> = keys_of(&e, &a.id)
                .iter()
                .map(|k| {
                    format!(
                        "{}\u{1f}{}",
                        chord_key(&k.code, k.mods),
                        chord_label(&k.code, k.mods)
                    )
                })
                .collect();
            lines.push(format!(
                "action\t{}\t{}\t{}\t{}",
                a.id,
                a.label,
                u8::from(keyless.contains(&a.id)),
                keys.join("\u{1e}")
            ));
        }
    }
    lines.join("\n")
}

/// 편집 하나(설정 화면에서 누른 것). 첫 줄은 새 저장 글, 둘째 줄은 알림(`msg\t글`)이나 가져오기 오류(`err\t글`)가
/// 있을 때만. `op`: assign(arg 동작, code·mods 키) · unbind(arg chordKey) · clear(arg 동작) · customFrom(arg 묶음) ·
/// preset(arg 묶음) · toCustom · mouse(arg 1|0) · import(arg 글). 모르는 일이면 저장 글 그대로
pub fn edit_text(stored: Option<&str>, op: &str, arg: &str, code: &str, mods: u8) -> String {
    let e = load(stored);
    let preset_of = |s: &str| Preset::from_id(s).filter(|p| *p != Preset::Custom);
    let (next, note): (_, Option<String>) = match op {
        "assign" => {
            let (next, text) = assign(
                &e,
                arg,
                &Chord {
                    code: code.to_string(),
                    mods,
                },
            );
            (next, Some(format!("msg\t{text}")))
        }
        "unbind" => (unbind(&e, arg), None),
        "clear" => (clear_action(&e, arg), None),
        "customFrom" => match preset_of(arg) {
            Some(p) => (custom_from(p), Some(format!("msg\t{}", reset_text(p)))),
            None => (e, None),
        },
        "preset" => match preset_of(arg) {
            Some(p) => (preset(p), None),
            None => (e, None),
        },
        "toCustom" => (to_custom(&e), None),
        "mouse" => {
            let mut next = e;
            next.mouse_rotate = arg == "1";
            (next, None)
        }
        "import" => match import_keymap(arg) {
            Ok(k) => (k, Some(format!("msg\t{IMPORTED_TEXT}"))),
            Err(err) => (e, Some(format!("err\t{err}"))),
        },
        _ => (e, None),
    };
    let mut out = stored_json(&next);
    if let Some(n) = note {
        out.push('\n');
        out.push_str(&n);
    }
    out
}

/// 저장 글 → 편집기 화면 줄들([`view_text`]). 글 전체 바이트 수
///
/// # Safety
/// `stored`는 NULL이거나 NUL로 끝나는 C 글, `out`은 `len`바이트를 쓸 수 있는 자리(NULL이면 길이만).
#[no_mangle]
pub unsafe extern "C" fn cubie_keymap_view(
    stored: *const c_char,
    n: u32,
    out: *mut u8,
    len: u32,
) -> u32 {
    let text = view_text(unsafe { c_str(stored) }, n as usize);
    unsafe { write_str(&text, out, len) }
}

/// 키를 지정하기 전: 그 키에 다른 동작이 놓였으면 묻는 글, 아니면 빈 글. 글 전체 바이트 수
///
/// # Safety
/// 글은 NULL이거나 NUL로 끝나는 C 글, `out`은 `len`바이트를 쓸 수 있는 자리(NULL이면 길이만).
#[no_mangle]
pub unsafe extern "C" fn cubie_keymap_ask(
    stored: *const c_char,
    action: *const c_char,
    code: *const c_char,
    mods: u8,
    out: *mut u8,
    len: u32,
) -> u32 {
    let e = load(unsafe { c_str(stored) });
    let chord = Chord {
        code: unsafe { c_str(code) }.unwrap_or_default().to_string(),
        mods,
    };
    let text = ask_before_assign(&e, unsafe { c_str(action) }.unwrap_or_default(), &chord)
        .unwrap_or_default();
    unsafe { write_str(&text, out, len) }
}

/// 편집 하나([`edit_text`]). 글 전체 바이트 수
///
/// # Safety
/// 글은 NULL이거나 NUL로 끝나는 C 글, `out`은 `len`바이트를 쓸 수 있는 자리(NULL이면 길이만).
#[no_mangle]
pub unsafe extern "C" fn cubie_keymap_edit(
    stored: *const c_char,
    op: *const c_char,
    arg: *const c_char,
    code: *const c_char,
    mods: u8,
    out: *mut u8,
    len: u32,
) -> u32 {
    let text = edit_text(
        unsafe { c_str(stored) },
        unsafe { c_str(op) }.unwrap_or_default(),
        unsafe { c_str(arg) }.unwrap_or_default(),
        unsafe { c_str(code) }.unwrap_or_default(),
        mods,
    );
    unsafe { write_str(&text, out, len) }
}

/// 내보내기 글(사이트 `exportKeymap`). 글 전체 바이트 수
///
/// # Safety
/// `stored`는 NULL이거나 NUL로 끝나는 C 글, `out`은 `len`바이트를 쓸 수 있는 자리(NULL이면 길이만).
#[no_mangle]
pub unsafe extern "C" fn cubie_keymap_export(stored: *const c_char, out: *mut u8, len: u32) -> u32 {
    let text = export_keymap(&load(unsafe { c_str(stored) }));
    unsafe { write_str(&text, out, len) }
}

/// 키 누름 → 지정할 키의 조합 비트(사이트 `chordFromEvent`): 조합 키만 눌렀거나 ⌘ 조합이면 -1
///
/// # Safety
/// `code`는 NULL이거나 NUL로 끝나는 C 글.
#[no_mangle]
pub unsafe extern "C" fn cubie_keymap_chord(
    code: *const c_char,
    shift: bool,
    alt: bool,
    ctrl: bool,
    meta: bool,
) -> i32 {
    chord_from_event(
        unsafe { c_str(code) }.unwrap_or_default(),
        shift,
        alt,
        ctrl,
        meta,
    )
    .map_or(-1, |c| i32::from(c.mods))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn view_lists_groups_and_keys() {
        let v = view_text(None, 3);
        let lines: Vec<&str> = v.lines().collect();
        assert_eq!(lines[0], "preset\ttwoHand");
        assert_eq!(lines[1], "mouse\t0");
        assert_eq!(lines[2], "keyless\t");
        assert!(lines.contains(&"group\tface\t면 돌리기\t18\t0"));
        assert!(lines
            .iter()
            .any(|l| l.starts_with("action\tR\tR\t0\tKeyI\u{1f}I")));
    }

    #[test]
    fn edit_assign_reports_and_stores() {
        let start = stored_json(&custom_from(Preset::TwoHand));
        let out = edit_text(Some(&start), "assign", "U", "KeyI", 0);
        let mut lines = out.lines();
        let stored = lines.next().unwrap();
        assert!(stored.contains(r#"{"code":"KeyI","action":"U"}"#));
        assert_eq!(
            lines.next().unwrap(),
            "msg\tI 키를 「U」 동작에 놓았어요. 「R」 동작에는 이제 키가 없어요. 다른 키를 지정해 주세요."
        );
        let bad = edit_text(Some(&start), "import", "nope", "", 0);
        assert_eq!(bad.lines().nth(1), Some("err\tJSON 글이 아니에요."));
        assert_eq!(bad.lines().next(), Some(start.as_str()));
    }
}
