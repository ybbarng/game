//! 4×4~7×7 사람 흉내(축소법, 홈 시연 「축소법(초보자)」·「축소법(프리드리히)」, 사이트 `packages/cube-ai` `big.ts`
//! `solveBigHuman`).
//!
//! 가운데 → 모서리 짝 → 마지막 두 모서리는 축소법([`crate::reduction`]) 그대로, 그 뒤는 축소가 끝난 큐브를 3×3처럼 보고
//! 같은 단계의 3×3 사람 해법 차례(사이트 `BEGINNER3_TAUGHT_STEPS`·`CFOP_STEPS`)를 돌린다. 3×3 수는 n×n 수로 옮긴다
//! (바깥층은 바깥층, 3×3 가운데 층은 n×n 안쪽 층 전부). 짝수 크기 패리티는 차례 속 「oll-parity」(OLL 앞)·「pll-parity」
//! (PLL 앞) 칸에서 알아차려 공식을 넣는다. 같은 상태면 사이트와 같은 수가 나온다(공통 자료 `fixtures/hero-show-big.json`).

use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};

use crate::human::{
    apply_match, cross_optimal, f2l_ok, f2l_pairs, first_face_map, top_oriented, white_down,
    HumanSolve, Solve, SolveError, SolveStage, StageName, R,
};
use crate::human_data;
use crate::notation::{format_move, parse_moves, CubeMove};
use crate::reduction::{
    oll_parity_text, pll_parity_text, solve_reduction, three_parity, to_three_facelets, Reduction,
    ReductionStage,
};
use crate::state::{apply_alg, apply_moves, face_colors, State};
use crate::taught::{
    corners_taught, cross_taught, ll_corner_place_taught, ll_corner_twist_taught, ll_edges_taught,
    middle_taught, white_up, yellow_cross_taught,
};

/// 3×3 해법 차례 한 칸(사이트 `Step`): 3×3 수를 두는 단계, 또는 패리티를 알아차리는 자리
enum Step {
    Run(fn(&mut Solve) -> R<()>),
    OllParity,
    PllParity,
}

fn beginner_first_two(s: &mut Solve) -> R<()> {
    s.look_barrier = true;
    white_up(s)?;
    cross_taught(s)?;
    s.stage(StageName::Cross);
    corners_taught(s)?;
    s.apply("z2");
    s.stage(StageName::Corners);
    middle_taught(s)?;
    s.stage(StageName::Middle);
    Ok(())
}

fn beginner_eo(s: &mut Solve) -> R<()> {
    yellow_cross_taught(s)?;
    s.stage(StageName::Eo);
    Ok(())
}

fn beginner_rest(s: &mut Solve) -> R<()> {
    ll_edges_taught(s)?;
    s.stage(StageName::LlEdges);
    ll_corner_place_taught(s)?;
    s.stage(StageName::LlCornerPlace);
    ll_corner_twist_taught(s, true)?;
    s.stage(StageName::LlCornerTwist);
    Ok(())
}

/// 배우는 방식 3×3 초보자 차례(사이트 `BEGINNER3_TAUGHT_STEPS`)
const BEGINNER_TAUGHT_STEPS: [Step; 5] = [
    Step::Run(beginner_first_two),
    Step::OllParity,
    Step::Run(beginner_eo),
    Step::PllParity,
    Step::Run(beginner_rest),
];

fn cfop_first_two(s: &mut Solve) -> R<()> {
    white_down(s)?;
    cross_optimal(s)?;
    s.stage(StageName::Cross);
    f2l_pairs(s)
}

fn cfop_oll(s: &mut Solve) -> R<()> {
    apply_match(
        s,
        human_data::OLL,
        &|t| f2l_ok(t) && top_oriented(&t.rel(), 3),
        false,
    )?;
    s.stage(StageName::Oll);
    Ok(())
}

fn cfop_pll(s: &mut Solve) -> R<()> {
    let pll: Vec<&str> = human_data::PLL.iter().map(|(_, alg)| *alg).collect();
    apply_match(s, &pll, &|t| t.is_solved(), true)?;
    s.stage(StageName::Pll);
    Ok(())
}

/// 3×3 프리드리히 차례(사이트 `CFOP_STEPS`)
const CFOP_STEPS: [Step; 5] = [
    Step::Run(cfop_first_two),
    Step::OllParity,
    Step::Run(cfop_oll),
    Step::PllParity,
    Step::Run(cfop_pll),
];

/// 축소법이 막히면 이 차례로 돌려 쥐고 다시 푼다(사이트 `REGRIPS`)
const REGRIPS: [&str; 6] = ["", "y", "x", "x'", "y2", "x2"];

/// 돌려 쥐며 축소법으로 푼다(사이트 `reduceWithRegrip`). 돌려 쥔 수는 첫 단계 맨 앞에 붙인다
fn reduce_with_regrip(n: usize, state: &State) -> R<Reduction> {
    for grip in REGRIPS {
        let start = if grip.is_empty() {
            state.clone()
        } else {
            apply_alg(n, state, grip).expect("돌려 쥐기")
        };
        if let Ok(red) = solve_reduction(n, &start) {
            if grip.is_empty() {
                return Ok(red);
            }
            let mut moves = vec![grip.to_string()];
            moves.extend(red.moves);
            let stages = red
                .stages
                .iter()
                .enumerate()
                .map(|(i, &(id, from, to))| (id, if i == 0 { 0 } else { from + 1 }, to + 1))
                .collect();
            return Ok(Reduction { moves, stages });
        }
    }
    Err(SolveError("축소법이 막혔다"))
}

type ReductionCache = Mutex<VecDeque<((usize, Vec<u8>), Reduction)>>;

/// 같은 섞기를 첫 면 색마다 여섯 번 풀 때 축소는 한 번만(사이트 `reductionCache`, 최근 8개)
fn reduction(n: usize, state: &State) -> R<Reduction> {
    static CACHE: OnceLock<ReductionCache> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(VecDeque::new()));
    let key = (n, face_colors(n, state));
    if let Some((_, hit)) = cache.lock().unwrap().iter().find(|(k, _)| *k == key) {
        return Ok(hit.clone());
    }
    let red = reduce_with_regrip(n, state)?;
    let mut c = cache.lock().unwrap();
    c.push_back((key, red.clone()));
    if c.len() > 8 {
        c.pop_front();
    }
    Ok(red)
}

/// 3×3 수 → n×n 수(사이트 `liftMove`): 층 1은 1, 층 3은 n, 층 2(가운데)는 안쪽 층 2~n−1
fn lift_move(n: usize, m: &CubeMove) -> CubeMove {
    let from = match m.from {
        1 => 1,
        2 => 2,
        _ => n,
    };
    let to = match m.to {
        1 => 1,
        2 => n - 1,
        _ => n,
    };
    CubeMove { from, to, ..*m }
}

fn three_view(n: usize, state: &State, first: usize) -> Solve {
    let map = first_face_map(first);
    Solve::new(3, to_three_facelets(n, &face_colors(n, state), &map), None)
}

fn stage_of(id: ReductionStage) -> StageName {
    match id {
        ReductionStage::CentersUd => StageName::CentersUd,
        ReductionStage::CentersRest => StageName::CentersRest,
        ReductionStage::Edges => StageName::Edges,
        ReductionStage::LastEdges => StageName::LastEdges,
    }
}

fn solve_big_human(steps: &[Step], n: usize, state: &State, first: usize) -> R<HumanSolve> {
    let red = reduction(n, state)?;
    let mut moves: Vec<String> = vec![];
    let mut stages: Vec<SolveStage> = vec![];
    let mut looks: Vec<usize> = vec![];
    for &(id, from, to) in &red.stages {
        let start = moves.len();
        moves.extend(red.moves[from..to].iter().cloned());
        stages.push(SolveStage {
            name: stage_of(id),
            start,
            end: moves.len(),
        });
    }
    let mut cur = apply_alg(n, state, &moves.join(" ")).expect("축소 수");
    let mut s = three_view(n, &cur, first);

    let flush = |s: &Solve,
                 cur: &mut State,
                 moves: &mut Vec<String>,
                 stages: &mut Vec<SolveStage>,
                 looks: &mut Vec<usize>| {
        let r = s.result();
        let offset = moves.len();
        let lifted: Vec<CubeMove> = parse_moves(3, &r.moves.join(" "))
            .expect("3×3 수")
            .iter()
            .map(|m| lift_move(n, m))
            .collect();
        moves.extend(lifted.iter().map(|m| format_move(n, m)));
        for st in &r.stages {
            stages.push(SolveStage {
                name: st.name,
                start: st.start + offset,
                end: st.end + offset,
            });
        }
        looks.extend(r.looks.iter().map(|l| l + offset));
        *cur = apply_moves(n, cur, &lifted);
    };

    for step in steps {
        let (oll, name) = match step {
            Step::Run(f) => {
                f(&mut s)?;
                continue;
            }
            Step::OllParity => (true, StageName::OllParity),
            Step::PllParity => (false, StageName::PllParity),
        };
        if n % 2 == 1 {
            continue;
        }
        let (p_oll, p_pll) =
            three_parity(&s.rel()).ok_or(SolveError("3×3로 읽은 조각의 색 조합이 맞지 않는다"))?;
        if !(if oll { p_oll } else { p_pll }) {
            continue;
        }
        flush(&s, &mut cur, &mut moves, &mut stages, &mut looks);
        let text = if oll {
            oll_parity_text(n)
        } else {
            pll_parity_text(n)
        };
        let alg = parse_moves(n, &text).expect("패리티 공식");
        let start = moves.len();
        moves.extend(alg.iter().map(|m| format_move(n, m)));
        stages.push(SolveStage {
            name,
            start,
            end: moves.len(),
        });
        cur = apply_moves(n, &cur, &alg);
        s = three_view(n, &cur, first);
    }
    if !s.is_solved() {
        return Err(SolveError("다 맞추지 못했다"));
    }
    flush(&s, &mut cur, &mut moves, &mut stages, &mut looks);
    Ok(HumanSolve {
        moves,
        stages,
        looks,
    })
}

/// 축소법(초보자): 축소 뒤 배우는 방식 3×3 초보자(사이트 `solveHuman("beginner", n, state, undefined, { taught: true })`)
pub fn solve_big_beginner(n: usize, state: &State) -> R<HumanSolve> {
    solve_big_human(&BEGINNER_TAUGHT_STEPS, n, state, 0)
}

/// 축소법(프리드리히): 축소 뒤 3×3 프리드리히(사이트 `solveHuman("advanced", n, state, undefined, { first })`)
pub fn solve_big_cfop(n: usize, state: &State, first: usize) -> R<HumanSolve> {
    solve_big_human(&CFOP_STEPS, n, state, first)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::solved_cube;

    #[test]
    fn big_solves() {
        for n in 4..=5 {
            let s = apply_alg(
                n,
                &solved_cube(n),
                "R U2 Rw F' L D B2 Uw R' U F2 Fw D' L2 B U' R2 F Dw2 Lw'",
            )
            .unwrap();
            for solve in [
                solve_big_beginner(n, &s).unwrap(),
                solve_big_cfop(n, &s, 2).unwrap(),
            ] {
                let after = apply_alg(n, &s, &solve.moves.join(" ")).unwrap();
                assert!(crate::is_solved(n, &after), "{n}");
            }
        }
    }
}
