//! 키 배치·해석기가 사이트와 같은지 본다(`fixtures/keys.json`, 사이트 `KeyInterpreter`가 만듦).
//! 사례마다 같은 배치·크기의 새 해석기에 키를 차례로 넣고, 키마다 결과(수·깊이·층 수·명령, 먹지 않으면 없음)를 견준다.

mod json;

use cube_core::keys::{preset_keymap, KeyInput, KeyInterpreter, KeyResult, Preset};
use cube_core::notation::AXIS_NAMES;
use json::Json;

/// 결과를 한 줄 글로(양쪽을 같은 꼴로 견준다)
fn describe(r: &Option<KeyResult>) -> String {
    match r {
        None => "없음".into(),
        Some(KeyResult::Move {
            action,
            notation,
            mv,
        }) => format!(
            "수 {action} → {notation} ({} {}-{} ×{})",
            AXIS_NAMES[mv.axis as usize], mv.from, mv.to, mv.turns
        ),
        Some(KeyResult::Depth { action, depth }) => format!("깊이 {action} {depth}"),
        Some(KeyResult::Layers {
            action,
            left,
            right,
        }) => format!("층 수 {action} {left}/{right}"),
        Some(KeyResult::Command { action, command }) => {
            format!("명령 {action} {}", command.id())
        }
    }
}

fn describe_site(r: &Json) -> String {
    if r.is_null() {
        return "없음".into();
    }
    let action = r.get("action").str();
    match r.get("kind").str() {
        "move" => {
            let m = r.get("move");
            format!(
                "수 {action} → {} ({} {}-{} ×{})",
                r.get("notation").str(),
                m.get("axis").str(),
                m.get("from").num(),
                m.get("to").num(),
                m.get("turns").num()
            )
        }
        "depth" => format!("깊이 {action} {}", r.get("depth").num()),
        "layers" => format!(
            "층 수 {action} {}/{}",
            r.get("left").num(),
            r.get("right").num()
        ),
        "command" => format!("명령 {action} {}", r.get("command").str()),
        other => panic!("모르는 결과 {other}"),
    }
}

fn flag(k: &Json, name: &str) -> bool {
    k.has(name) && k.get(name).bool()
}

#[test]
fn key_sequences_match_site() {
    let text = include_str!("../fixtures/keys.json");
    let cases = json::parse(text).get("cases").arr().to_vec();
    let mut total = 0;
    let mut bad = vec![];
    for c in &cases {
        let preset = Preset::from_id(c.get("preset").str()).expect("배치");
        let n = c.get("n").num() as usize;
        let mut it = KeyInterpreter::new(n, preset_keymap(preset));
        for (i, (k, want)) in c
            .get("keys")
            .arr()
            .iter()
            .zip(c.get("results").arr())
            .enumerate()
        {
            total += 1;
            let input = KeyInput {
                code: k.get("code").str(),
                shift: flag(k, "shiftKey"),
                alt: flag(k, "altKey"),
                ctrl: flag(k, "ctrlKey"),
                meta: flag(k, "metaKey"),
                repeat: flag(k, "repeat"),
            };
            let have = describe(&it.handle(&input));
            let want = describe_site(want);
            if have != want {
                bad.push(format!(
                    "{} {n}×{n} {i}번째 {input:?}\n    코어: {have}\n    사이트: {want}",
                    preset.id()
                ));
            }
        }
    }
    println!(
        "키 해석: 차례 {}개, 키 {total}개, 어긋남 {}개",
        cases.len(),
        bad.len()
    );
    assert!(total > 0);
    assert!(bad.is_empty(), "어긋남 {}개\n{}", bad.len(), bad.join("\n"));
}
