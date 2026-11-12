//! 큐브 창이 칠하는 화면 상태가 사이트와 같은지 본다(docs/52 5-7).
//! `fixtures/mask.json`: 가리기 이름 × 크기, 공식 연습 단계마다 첫 상황의 시작 모양에서 자리마다 칠할 값.

mod json;

use cube_core::keys::keymap::KeyBinding;
use cube_core::keys::paint::{calm_line, calm_tint, stripe_tint, striped_color};
use cube_core::keys::{key_paint, key_table, preset_keymap, KeyPaint, Keymap, Preset};
use cube_core::mask::{mask_at_slots, mask_for, Visibility};
use cube_core::practice::{case_start, stage_by_id, PRACTICE_N};
use cube_core::state::face_colors;
use json::Json;

/// 사용자 배치(층 수 키를 든 옛 배치, keycaps.json의 custom. `tests/keys.rs`와 같다)
fn custom_keymap(root: &Json) -> Keymap {
    Keymap {
        preset: Preset::Custom,
        bindings: root
            .get("custom")
            .arr()
            .iter()
            .map(|b| {
                let b = b.arr();
                KeyBinding {
                    code: b[0].str().to_string(),
                    mods: b[1].num() as u8,
                    action: b[2].str().to_string(),
                }
            })
            .collect(),
    }
}

fn letters(m: &[Visibility]) -> String {
    m.iter().map(|v| v.letter()).collect()
}

#[test]
fn mask_matches_site() {
    let root = json::parse(include_str!("../fixtures/mask.json"));
    let (mut total, mut bad) = (0, vec![]);
    for c in root.get("cases").arr() {
        total += 1;
        match c.get("kind").str() {
            "mask" => {
                let name = c.get("name").str();
                let n = c.get("n").num() as usize;
                let have = mask_for(n, name).map(|m| letters(&m)).unwrap_or_default();
                if have != c.get("mask").str() {
                    bad.push(format!("{name} {n}×{n}"));
                }
            }
            "stage" => {
                let id = c.get("stage").str();
                let stage = stage_by_id(id).expect("단계");
                assert_eq!(stage.mask, c.get("mask").str(), "{id} 가리기 이름");
                let case = stage.case(c.get("case").str()).expect("상황");
                let start = case_start(stage, case, "");
                let colors: String = face_colors(PRACTICE_N, &start)
                    .iter()
                    .map(|c| char::from(b'0' + c))
                    .collect();
                assert_eq!(colors, c.get("colors").str(), "{id} 시작 모양");
                let have = mask_for(PRACTICE_N, stage.mask)
                    .map(|m| letters(&mask_at_slots(&start, &m)))
                    .unwrap_or_default();
                if have != c.get("slots").str() {
                    bad.push(format!("단계 {id}"));
                }
            }
            other => panic!("모르는 꼴 {other}"),
        }
    }
    assert!(total > 0);
    assert!(bad.is_empty(), "{}/{total} 어긋남: {bad:?}", bad.len());
}

/// 단축키 표(F1) 칸 색: 칸마다 칠하기(사이트 `KeyboardMap` 「모두」 + `keyPaint`)와 배색마다 칸 바탕·선·사선 색
#[test]
fn key_paint_matches_site() {
    let custom = custom_keymap(&json::parse(include_str!("../fixtures/keycaps.json")));
    let root = json::parse(include_str!("../fixtures/keypaint.json"));
    let (mut total, mut bad) = (0, vec![]);
    for c in root.get("cases").arr() {
        total += 1;
        match c.get("kind").str() {
            "cells" => {
                let preset = c.get("preset").str();
                let mut keymap = match preset {
                    "custom" => custom.clone(),
                    id => preset_keymap(Preset::from_id(id).expect("배치")),
                };
                keymap
                    .bindings
                    .retain(|b| b.action != "reset" && b.action != "inspectionSkip");
                let n = c.get("n").num() as usize;
                let want: Vec<String> = c
                    .get("cells")
                    .arr()
                    .iter()
                    .map(|cell| {
                        let f = cell.arr();
                        format!(
                            "{} {}{}{}{}",
                            f[0].str(),
                            f[1].str(),
                            f[2].num(),
                            f[3].num(),
                            f[4].num()
                        )
                    })
                    .collect();
                let have: Vec<String> = key_table(&keymap, n)
                    .iter()
                    .filter(|cell| !cell.code.starts_with("Arrow"))
                    .filter_map(|cell| {
                        let plain = cell.lines.iter().find(|l| l.mods == 0 && l.usable)?;
                        let p = key_paint(n, &plain.action)?;
                        Some(match p {
                            KeyPaint::Face { color, prime, wide } => {
                                format!(
                                    "{} f{color}{}{}",
                                    cell.code,
                                    u8::from(prime),
                                    u8::from(wide)
                                )
                            }
                            KeyPaint::Sweep {
                                color,
                                prime,
                                whole,
                            } => format!(
                                "{} s{color}{}{}",
                                cell.code,
                                u8::from(prime),
                                u8::from(whole)
                            ),
                        })
                    })
                    .collect();
                if have != want {
                    bad.push(format!("{preset} {n}×{n}: {have:?} != {want:?}"));
                }
            }
            "tone" => {
                let scheme = c.get("scheme").str();
                let color = c.get("color").num() as u8;
                let prime = c.get("prime").num() == 1.0;
                let rgb = scheme_colors(scheme)[color as usize];
                let have = (
                    calm_tint(rgb, prime),
                    calm_line(rgb),
                    stripe_tint(rgb, prime),
                    striped_color(scheme, color),
                );
                let want = (
                    c.get("tint").num() as u32,
                    c.get("line").num() as u32,
                    c.get("stripe").num() as u32,
                    c.get("striped").num() == 1.0,
                );
                if have != want {
                    bad.push(format!("{scheme} {color} {prime}: {have:?} != {want:?}"));
                }
            }
            other => panic!("모르는 꼴 {other}"),
        }
    }
    assert!(total > 0);
    assert!(bad.is_empty(), "{}/{total} 어긋남: {bad:?}", bad.len());
}

/// 사이트 `COLOR_SCHEMES`(앱 `CubeSettings.schemes`와 같은 값)
fn scheme_colors(scheme: &str) -> [u32; 6] {
    match scheme {
        "standard" => [0xffffff, 0xc8102e, 0x009b48, 0xffd500, 0xff5800, 0x0046ad],
        "highContrast" => [0xffffff, 0xe00000, 0x00b000, 0xffee00, 0xff8a00, 0x0040ff],
        "colorblind" => [0xffffff, 0xd55e00, 0x009e73, 0xf0e442, 0xe69f00, 0x0072b2],
        other => panic!("모르는 배색 {other}"),
    }
}
