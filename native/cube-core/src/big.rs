//! 4×4~7×7 사람 흉내(축소법, 사이트 `packages/cube-ai` `big.ts` `solveBigHuman`).

use crate::human::{HumanSolve, SolveError, R};
use crate::state::State;

/// 축소법(초보자): 축소 뒤 배우는 방식 3×3 초보자(사이트 `solveHuman("beginner", n, state, undefined, { taught: true })`)
pub fn solve_big_beginner(_n: usize, _state: &State) -> R<HumanSolve> {
    Err(SolveError("큰 큐브 시연은 아직 없다"))
}

/// 축소법(프리드리히): 축소 뒤 3×3 프리드리히(사이트 `solveHuman("advanced", n, state, undefined, { first })`)
pub fn solve_big_cfop(_n: usize, _state: &State, _first: usize) -> R<HumanSolve> {
    Err(SolveError("큰 큐브 시연은 아직 없다"))
}
