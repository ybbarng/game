//! 큐브 창이 칠하는 화면 상태가 사이트와 같은지 본다(docs/52 5-7).
//! `fixtures/mask.json`: 가리기 이름 × 크기, 공식 연습 단계마다 첫 상황의 시작 모양에서 자리마다 칠할 값.

mod json;

use cube_core::mask::{mask_at_slots, mask_for, Visibility};
use cube_core::practice::{case_start, stage_by_id, PRACTICE_N};
use cube_core::state::face_colors;

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
