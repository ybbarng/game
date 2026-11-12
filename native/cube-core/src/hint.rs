//! Cubie 「공식 보기」의 공식 고르기(`apps/web/src/cube/mini/hint-pick.ts`의 `pickHint`, docs/47 15-15).
//!
//! - 3×3, F2L이 끝났으면: 2단계 OLL → 2단계 PLL 상황과 쥐는 법([`crate::spot::last_layer_hint`]), 윗면 돌리기만
//!   남았으면 그 한 수.
//! - 3×3, F2L 전: 고수 해법([`solve_cfop`])이 낸 다음 단계(십자 또는 F2L 짝 하나)의 수.
//! - 2×2: 고수 해법([`solve_advanced2`])의 다음 단계 수.
//! - 4×4~7×7: 판정이 없다(`Unsupported`).

use crate::human::{solve_advanced2, solve_cfop, HumanSolve, StageName};
use crate::spot::{last_layer_hint, LastLayerHint};
use crate::state::{is_solved, State};

/// 공식 하나(사이트 `FormulaHint`)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FormulaHint {
    /// 단계 이름(「OLL 1단계(노란 십자)」·「F2L 짝 하나」 등)
    pub stage: String,
    /// 상황 이름(있으면)
    pub name: Option<String>,
    /// 공식 앞에 쥐는 법(큐브 돌리기·윗면 돌리기). 없으면 ""
    pub before: String,
    /// 공식(WCA 표기)
    pub alg: String,
    /// 더 배우는 단원 id(`/cube/learn?lesson=`)
    pub lesson: Option<&'static str>,
}

/// 사이트 `HintAnswer`
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HintAnswer {
    Hint(FormulaHint),
    /// 이 크기는 판정이 없다
    Unsupported,
    /// 낼 공식이 없다(이미 맞음 등)
    None,
}

const LESSON_CROSS: &str = "cfop-cross";
const LESSON_F2L: &str = "cfop-f2l-pair";
const LESSON_2LOOK_OLL: &str = "cfop-2look-oll";
const LESSON_2LOOK_PLL: &str = "cfop-2look-pll";

fn is_rotation(t: &str) -> bool {
    t.starts_with(['x', 'y', 'z'])
}

/// 해법이 낸 다음 단계(수가 있는 첫 단계). 앞의 큐브 돌리기는 쥐는 법으로 뗀다
fn next_stage(
    solve: &HumanSolve,
    label: impl Fn(StageName) -> (String, Option<&'static str>),
) -> HintAnswer {
    for st in &solve.stages {
        if st.end <= st.start {
            continue;
        }
        let moves = &solve.moves[st.start..st.end];
        let k = moves.iter().take_while(|m| is_rotation(m)).count();
        if k == moves.len() {
            continue;
        }
        let before: Vec<&str> = solve.moves[..st.start]
            .iter()
            .filter(|m| is_rotation(m))
            .chain(&moves[..k])
            .map(String::as_str)
            .collect();
        let (stage, lesson) = label(st.name);
        return HintAnswer::Hint(FormulaHint {
            stage,
            name: None,
            before: before.join(" "),
            alg: moves[k..].join(" "),
            lesson,
        });
    }
    HintAnswer::None
}

/// 지금 상태에 맞는 공식 하나(사이트 `pickHint`). 해법이 끝까지 가지 못하면(엔진이 만든 상태에서는 생기지 않음) `None`
pub fn pick_hint(n: usize, state: &State) -> HintAnswer {
    if n != 2 && n != 3 {
        return HintAnswer::Unsupported;
    }
    if is_solved(n, state) {
        return HintAnswer::None;
    }
    if n == 2 {
        return match solve_advanced2(state) {
            Ok(s) => next_stage(&s, |name| (name.label().to_string(), None)),
            Err(_) => HintAnswer::None,
        };
    }
    match last_layer_hint(state) {
        LastLayerHint::Formula {
            stage,
            case_id,
            name,
            before,
            alg,
        } => {
            let oll = crate::data::TWO_LOOK_CASES
                .iter()
                .find(|c| c.id == case_id)
                .is_some_and(|c| c.set == crate::spot::AlgSet::TwoLookOll);
            return HintAnswer::Hint(FormulaHint {
                stage: stage.to_string(),
                name: Some(name.to_string()),
                before,
                alg: alg.to_string(),
                lesson: Some(if oll {
                    LESSON_2LOOK_OLL
                } else {
                    LESSON_2LOOK_PLL
                }),
            });
        }
        LastLayerHint::Finish { alg } => {
            return HintAnswer::Hint(FormulaHint {
                stage: "마무리(윗면 맞추기)".to_string(),
                name: None,
                before: String::new(),
                alg: alg.to_string(),
                lesson: None,
            });
        }
        LastLayerHint::Solved | LastLayerHint::NotLastLayer => {}
    }
    match solve_cfop(state) {
        Ok(s) => next_stage(&s, |name| match name {
            StageName::Cross => ("십자".to_string(), Some(LESSON_CROSS)),
            StageName::F2l1 | StageName::F2l2 | StageName::F2l3 | StageName::F2l4 => {
                ("F2L 짝 하나".to_string(), Some(LESSON_F2L))
            }
            other => (other.label().to_string(), None),
        }),
        Err(_) => HintAnswer::None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scramble::{scramble, ScrambleEvent};
    use crate::state::{apply_alg, solved_cube};

    #[test]
    fn sizes_without_judge_and_solved_cube() {
        assert_eq!(pick_hint(4, &solved_cube(4)), HintAnswer::Unsupported);
        assert_eq!(pick_hint(3, &solved_cube(3)), HintAnswer::None);
    }

    /// 처음 부를 때 거리 표를 만든다. 앱이 기다릴 시간을 보려고 찍어 둔다(판정은 하지 않는다)
    #[test]
    fn first_call_builds_tables() {
        let t0 = std::time::Instant::now();
        let s3 = apply_alg(
            3,
            &solved_cube(3),
            &scramble(ScrambleEvent::from_id("333").unwrap(), 5).text,
        )
        .unwrap();
        let t1 = std::time::Instant::now();
        assert!(matches!(pick_hint(3, &s3), HintAnswer::Hint(_)));
        let t2 = std::time::Instant::now();
        assert!(matches!(pick_hint(3, &s3), HintAnswer::Hint(_)));
        let t3 = std::time::Instant::now();
        let s2 = apply_alg(2, &solved_cube(2), "R U2 F' R2 U F2 R'").unwrap();
        assert!(matches!(pick_hint(2, &s2), HintAnswer::Hint(_)));
        let t4 = std::time::Instant::now();
        println!(
            "섞기 {:?}, 3×3 처음 {:?}, 다시 {:?}, 2×2 처음 {:?}",
            t1 - t0,
            t2 - t1,
            t3 - t2,
            t4 - t3
        );
    }
}
