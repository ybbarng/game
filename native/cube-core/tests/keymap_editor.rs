//! 사용자 키 배치 편집(`fixtures/keymap-editor.json`, 사이트 `apps/web/src/cube/native/core-fixtures-keymap-editor.ts`):
//! 동작 목록, 키 이름, 가져오기, 설정 화면 대본(걸음마다 저장 글·알림·묻는 글·키 없는 동작·겹친 키·가져오기 오류).

mod json;

use cube_core::keys::editor::{
    action_label, actions_for, ask_before_assign, assign, chord_from_event, chord_key, chord_label,
    clear_action, code_label, conflicts_text, custom_from, export_keymap, import_keymap,
    keyless_actions, keyless_text, keys_of, load, preset, reset_text, stored_json, to_custom,
    unbind, Chord, EditKeymap, IMPORTED_TEXT,
};
use cube_core::keys::Preset;
use json::Json;

fn fnv(text: &str) -> String {
    let mut h: u32 = 0x811c_9dc5;
    for b in text.bytes() {
        h ^= u32::from(b);
        h = h.wrapping_mul(0x0100_0193);
    }
    format!("{h:08x}")
}

fn opt(j: &Json) -> Option<String> {
    j.opt_str().map(str::to_string)
}

fn preset_of(id: &str) -> Preset {
    Preset::from_id(id).expect("묶음")
}

#[test]
fn keymap_editor_matches_site() {
    let cases = json::parse(include_str!("../fixtures/keymap-editor.json"))
        .get("cases")
        .arr()
        .to_vec();
    let mut bad: Vec<String> = vec![];
    let mut check = |what: String, have: String, want: String| {
        if have != want {
            bad.push(format!("{what}\n    코어: {have}\n    사이트: {want}"));
        }
    };
    for c in &cases {
        match c.get("kind").str() {
            "actions" => {
                let n = c.get("n").num() as usize;
                let have: Vec<String> = actions_for(n)
                    .iter()
                    .map(|a| format!("{}/{}/{}/{}", a.id, a.group, a.label, action_label(&a.id)))
                    .collect();
                let labels = c.get("labels").arr();
                let want: Vec<String> = c
                    .get("actions")
                    .arr()
                    .iter()
                    .zip(labels)
                    .map(|(a, l)| {
                        let a = a.arr();
                        format!("{}/{}/{}/{}", a[0].str(), a[1].str(), a[2].str(), l.str())
                    })
                    .collect();
                check(
                    format!("{n}×{n} 동작 목록"),
                    have.join("\n"),
                    want.join("\n"),
                );
                for (i, p) in [Preset::TwoHand, Preset::Notation].into_iter().enumerate() {
                    let e = preset(p);
                    check(
                        format!("{n}×{n} {} 키 없는 동작", p.id()),
                        keyless_text(&keyless_actions(&e, n)),
                        c.get("keyless").arr()[i].str().to_string(),
                    );
                }
            }
            "labels" => {
                const MODS: [u8; 6] = [0, 1, 2, 4, 3, 7];
                for row in c.get("codes").arr() {
                    let r = row.arr();
                    let code = r[0].str();
                    let mut have = vec![code.to_string(), code_label(code)];
                    have.extend(MODS.iter().map(|&m| chord_label(code, m)));
                    have.extend(MODS.iter().map(|&m| chord_key(code, m)));
                    let want: Vec<String> = r.iter().map(|x| x.str().to_string()).collect();
                    check(format!("키 이름 {code}"), have.join(" "), want.join(" "));
                }
                for ev in c.get("events").arr() {
                    let e = ev.arr();
                    let have = chord_from_event(
                        e[0].str(),
                        e[1].bool(),
                        e[2].bool(),
                        e[3].bool(),
                        e[4].bool(),
                    )
                    .map(|k| chord_key(&k.code, k.mods));
                    check(
                        format!("키 누름 {:?}", e[0].str()),
                        format!("{have:?}"),
                        format!("{:?}", opt(&e[5])),
                    );
                }
                let mut e = custom_from(Preset::TwoHand);
                for code in [
                    "KeyZ",
                    "KeyA",
                    "Digit9",
                    "Digit1",
                    "Semicolon",
                    "Slash",
                    "Space",
                    "ArrowUp",
                    "Backquote",
                    "BracketLeft",
                ] {
                    for m in [0, 1, 2, 4, 3, 7] {
                        e = assign(
                            &e,
                            "R",
                            &Chord {
                                code: code.into(),
                                mods: m,
                            },
                        )
                        .0;
                    }
                }
                let have: Vec<String> = keys_of(&e, "R")
                    .iter()
                    .map(|k| chord_key(&k.code, k.mods))
                    .collect();
                let want: Vec<String> = c
                    .get("order")
                    .arr()
                    .iter()
                    .map(|x| x.str().to_string())
                    .collect();
                check("키 차례".into(), have.join(" "), want.join(" "));
            }
            "import" => {
                let text = c.get("text").str();
                let r = import_keymap(text);
                let what = format!("가져오기 {}", text.chars().take(60).collect::<String>());
                check(
                    what.clone(),
                    format!("{:?}", r.as_ref().ok().map(stored_json)),
                    format!("{:?}", opt(c.get("ok"))),
                );
                check(
                    what.clone(),
                    format!("{:?}", r.as_ref().ok().map(export_keymap)),
                    format!("{:?}", opt(c.get("export"))),
                );
                check(
                    what,
                    format!("{:?}", r.err()),
                    format!("{:?}", opt(c.get("error"))),
                );
            }
            _ => {
                let n = c.get("n").num() as usize;
                let seed = c.get("seed").num();
                let mut e: EditKeymap = load(c.get("start").opt_str());
                let mut message: Option<String> = None;
                let mut import_error: Option<String> = None;
                for (i, (op, want)) in c
                    .get("ops")
                    .arr()
                    .iter()
                    .zip(c.get("steps").arr())
                    .enumerate()
                {
                    let op = op.arr();
                    let mut question: Option<String> = None;
                    match op[0].str() {
                        "assign" => {
                            let action = op[1].str();
                            let chord = Chord {
                                code: op[2].str().into(),
                                mods: op[3].num() as u8,
                            };
                            message = None;
                            question = ask_before_assign(&e, action, &chord);
                            if question.is_none() || op[4].str() == "yes" {
                                let (next, text) = assign(&e, action, &chord);
                                e = next;
                                message = Some(text);
                            }
                        }
                        "unbind" => e = unbind(&e, op[1].str()),
                        "clear" => e = clear_action(&e, op[1].str()),
                        "customFrom" => {
                            let p = preset_of(op[1].str());
                            e = custom_from(p);
                            message = Some(reset_text(p));
                        }
                        "preset" => {
                            e = preset(preset_of(op[1].str()));
                            message = None;
                        }
                        "toCustom" => e = to_custom(&e),
                        "mouse" => e.mouse_rotate = op[1].bool(),
                        _ => match import_keymap(op[1].str()) {
                            Ok(k) => {
                                e = k;
                                import_error = None;
                                message = Some(IMPORTED_TEXT.into());
                            }
                            Err(err) => import_error = Some(err),
                        },
                    }
                    let w = want.arr();
                    let have = format!(
                        "{} {:?} {:?} {:?} {:?} {:?}",
                        fnv(&stored_json(&e)),
                        message,
                        question,
                        keyless_text(&keyless_actions(&e, n)),
                        conflicts_text(&e),
                        import_error
                    );
                    let want_s = format!(
                        "{} {:?} {:?} {:?} {:?} {:?}",
                        w[0].str(),
                        opt(&w[1]),
                        opt(&w[2]),
                        w[3].str(),
                        w[4].str(),
                        opt(&w[5])
                    );
                    if have != want_s {
                        check(
                            format!("대본 씨앗 {seed} {n}×{n} 걸음 {i} {:?}", op[0].str()),
                            have,
                            want_s,
                        );
                        break;
                    }
                }
                check(
                    format!("대본 씨앗 {seed} 끝 저장 글"),
                    stored_json(&e),
                    c.get("stored").str().into(),
                );
                check(
                    format!("대본 씨앗 {seed} 내보내기"),
                    fnv(&export_keymap(&e)),
                    c.get("export").str().into(),
                );
            }
        }
    }
    println!(
        "키 배치 편집: 사례 {}개, 어긋남 {}개",
        cases.len(),
        bad.len()
    );
    assert!(
        bad.is_empty(),
        "어긋남 {}개\n{}",
        bad.len(),
        bad.iter().take(8).cloned().collect::<Vec<_>>().join("\n")
    );
}
