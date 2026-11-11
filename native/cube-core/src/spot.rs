//! 3×3 윗면 상황(OLL·PLL·2단계) 알아보기와 Cubie 「공식 보기」의 마지막 층 힌트.
//! `apps/web/src/cube/algs/spot.ts`(spotCase·spotHold), `algs/check.ts`(묶음 역할), `mini/hint-pick.ts`(F2L 뒤 갈래).
//!
//! F2L이 끝난 3×3을 흰 센터가 아래로 오게 쥔 네 방향마다, 상황의 대표 공식을 (앞 윗면 돌리기 넷과 함께) 해 보고
//! 그 묶음의 목표가 되면 그 상황이다.

use std::sync::OnceLock;

use crate::judge::{goal_met, ll_done, Goal};
use crate::notation::{parse_moves, CubeMove};
use crate::state::{apply_moves, face_colors, is_solved, State};
use crate::topology::{D, U};

/// 상황 묶음(사이트 `AlgSet` 가운데 알아보기가 보는 넷)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlgSet {
    Oll,
    Pll,
    TwoLookOll,
    TwoLookPll,
}

impl AlgSet {
    pub fn id(self) -> &'static str {
        match self {
            AlgSet::Oll => "oll",
            AlgSet::Pll => "pll",
            AlgSet::TwoLookOll => "2look-oll",
            AlgSet::TwoLookPll => "2look-pll",
        }
    }
}

/// 공식 상황 하나(사이트 `AlgCase`에서 알아보기에 쓰는 칸)
#[derive(Clone, Copy, Debug)]
pub struct AlgCase {
    pub id: &'static str,
    pub set: AlgSet,
    pub group: Option<&'static str>,
    pub name: &'static str,
    /// 대표 공식(사이트 `algs[0]`)
    pub alg: &'static str,
}

const AUF: [&str; 4] = ["", "U", "U2", "U'"];

fn orients() -> &'static [(String, Vec<CubeMove>)] {
    static CACHE: OnceLock<Vec<(String, Vec<CubeMove>)>> = OnceLock::new();
    CACHE.get_or_init(|| {
        let mut out = Vec::new();
        for a in ["", "x", "x2", "x'", "z", "z'"] {
            for b in ["", "y", "y2", "y'"] {
                let text = format!("{a} {b}").trim().to_string();
                let moves = parse_moves(3, &text).unwrap();
                out.push((text, moves));
            }
        }
        out
    })
}

/// 흰 센터가 아래(D)에 오게 쥔 방향들(넷). `rot`은 지금 쥔 큐브에서 그 방향으로 가는 큐브 돌리기
fn white_down_holds(s: &State) -> Vec<(&'static str, State)> {
    orients()
        .iter()
        .filter_map(|(r, moves)| {
            let t = if r.is_empty() {
                s.clone()
            } else {
                apply_moves(3, s, moves)
            };
            (face_colors(3, &t)[D * 9 + 4] == U as u8).then_some((r.as_str(), t))
        })
        .collect()
}

/// 묶음의 목표(검사기 역할): 공식 뒤에 이 상태가 되면 그 상황을 푼 것
fn role_met(c: &AlgCase, s: &State) -> bool {
    match c.set {
        AlgSet::Oll => goal_met(3, s, Goal::Oll),
        AlgSet::Pll => ll_done(3, s),
        AlgSet::TwoLookOll => {
            if c.group == Some("edges") {
                goal_met(3, s, Goal::YellowCross)
            } else {
                goal_met(3, s, Goal::Oll)
            }
        }
        AlgSet::TwoLookPll => {
            if c.group == Some("corners") {
                goal_met(3, s, Goal::YellowCorners)
            } else {
                ll_done(3, s)
            }
        }
    }
}

fn auf_moves() -> &'static [Vec<CubeMove>; 4] {
    static CACHE: OnceLock<[Vec<CubeMove>; 4]> = OnceLock::new();
    CACHE.get_or_init(|| AUF.map(|a| parse_moves(3, a).unwrap()))
}

/// 이 큐브(흰 면 아래)에서 공식이 그 상황의 목표를 만드는 앞 윗면 돌리기("", "U", "U2", "U'"). 못 풀면 None
pub fn auf_before(c: &AlgCase, moves: &[CubeMove], start: &State) -> Option<&'static str> {
    for (k, pre) in AUF.iter().enumerate() {
        let s0 = apply_moves(3, start, &auf_moves()[k]);
        if role_met(c, &apply_moves(3, &s0, moves)) {
            return Some(pre);
        }
    }
    None
}

/// 3×3 큐브가 `cases` 중 어느 상황인가(첫 번째). F2L이 끝나지 않았거나 목록 밖이면 None (사이트 `spotCase`)
pub fn spot_case<'a>(state: &State, cases: &'a [AlgCase]) -> Option<&'a AlgCase> {
    if cases.is_empty() || !goal_met(3, state, Goal::F2l) {
        return None;
    }
    let holds = white_down_holds(state);
    cases.iter().find(|c| {
        let moves = parse_moves(3, c.alg).expect("상황 공식");
        holds
            .iter()
            .any(|(_, t)| auf_before(c, &moves, t).is_some())
    })
}

/// 알아본 상황과 쥐는 법: 큐브 돌리기(`rot`, 예 "y2"), 공식 앞 윗면 돌리기(`pre`, 예 "U'")
#[derive(Clone, Debug)]
pub struct SpottedHold<'a> {
    pub case: &'a AlgCase,
    pub rot: &'static str,
    pub pre: &'static str,
}

/// `spot_case`처럼 상황을 찾되 쥐는 법까지 돌려준다(사이트 `spotHold`)
pub fn spot_hold<'a>(state: &State, cases: &'a [AlgCase]) -> Option<SpottedHold<'a>> {
    if cases.is_empty() || !goal_met(3, state, Goal::F2l) {
        return None;
    }
    let holds = white_down_holds(state);
    for c in cases {
        let moves = parse_moves(3, c.alg).expect("상황 공식");
        for (rot, t) in &holds {
            if let Some(pre) = auf_before(c, &moves, t) {
                return Some(SpottedHold { case: c, rot, pre });
            }
        }
    }
    None
}

/// Cubie 「공식 보기」의 마지막 층 갈래(사이트 `pickHint`의 3×3, F2L 뒤)
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LastLayerHint {
    /// 이미 맞음(힌트 없음)
    Solved,
    /// 2단계 OLL·PLL 상황 하나
    Formula {
        /// 「OLL 1단계(노란 십자)」 같은 단계 이름
        stage: &'static str,
        case_id: &'static str,
        name: &'static str,
        /// 공식 앞에 쥐는 법(큐브 돌리기·윗면 돌리기), 없으면 ""
        before: String,
        alg: &'static str,
    },
    /// 윗면 돌리기 하나만 남음
    Finish { alg: &'static str },
    /// 마지막 층이 아니다(F2L 전 등). 사이트는 컴퓨터 해법의 다음 단계를 낸다(이 코어에는 아직 없다)
    NotLastLayer,
}

fn two_look_stage(c: &AlgCase) -> &'static str {
    match (c.set, c.group) {
        (AlgSet::TwoLookOll, Some("edges")) => "OLL 1단계(노란 십자)",
        (AlgSet::TwoLookOll, _) => "OLL 2단계(노란 면)",
        (_, Some("corners")) => "PLL 1단계(코너)",
        _ => "PLL 2단계(엣지)",
    }
}

/// 3×3 상태의 마지막 층 힌트
pub fn last_layer_hint(state: &State) -> LastLayerHint {
    if is_solved(3, state) {
        return LastLayerHint::Solved;
    }
    if !goal_met(3, state, Goal::F2l) {
        return LastLayerHint::NotLastLayer;
    }
    if let Some(h) = spot_hold(state, crate::data::TWO_LOOK_CASES) {
        let before = [h.rot, h.pre]
            .iter()
            .filter(|s| !s.is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join(" ");
        return LastLayerHint::Formula {
            stage: two_look_stage(h.case),
            case_id: h.case.id,
            name: h.case.name,
            before,
            alg: h.case.alg,
        };
    }
    for (k, u) in AUF.iter().enumerate().skip(1) {
        if is_solved(3, &apply_moves(3, state, &auf_moves()[k])) {
            return LastLayerHint::Finish { alg: u };
        }
    }
    LastLayerHint::NotLastLayer
}
