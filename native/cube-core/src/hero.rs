//! 홈 시연(사이트 첫 화면·Cubie 미니 떠 있을 때의 사람 해법 풀이, 웹 `hero/methods.ts`)의 해법 고르기.
//!
//! 첫 면 색 규칙(고정 규칙 2-1절, docs/47 0절): 초보자 해법은 늘 흰색, 그 밖은 여섯 색으로 모두 풀어 첫 단계(3×3
//! 프리드리히는 십자)의 수가 가장 적은 색(같으면 흰색 먼저, 그다음 색 번호 차례). 사이트 `solveWithFirst`와 같은지는
//! 공통 시험 자료 `fixtures/hero.json`으로 본다.
//!
//! 지금 옮긴 것은 3×3 프리드리히(`3-cfop`)의 첫 면 색 고르기와 풀이다. 보여 주기 변환(`hero/present.ts`: 첫 층을
//! 위에서 보이기·조각 찾기 돌리기·강조), 연출 차례와 시간(`hero/loop.ts`), 초보자·루·ZZ·2×2·큰 큐브 해법은 남았다
//! (docs/52 5-6 「남은 것」 1).

use crate::human::{solve_cfop_first, HumanSolve, SolveError, StageName};
use crate::state::State;

/// 색 중립에서 견줄 색 차례(사이트 `FIRST_COLOR_ORDER`)
pub const FIRST_COLOR_ORDER: [usize; 6] = [0, 1, 2, 3, 4, 5];

/// 단계 `stage`의 수(큐브 돌리기 x·y·z는 세지 않는다, 사이트 `stageCost`)
pub fn stage_cost(solve: &HumanSolve, stage: StageName) -> usize {
    solve
        .stages
        .iter()
        .filter(|st| st.name == stage)
        .map(|st| {
            solve.moves[st.start..st.end]
                .iter()
                .filter(|m| !m.starts_with(['x', 'y', 'z']))
                .count()
        })
        .sum()
}

/// 첫 면 색을 골라 푼다: 여섯 색으로 모두 풀어 `stage` 수가 가장 적은 색(같으면 앞 차례). 사이트 `solveWithFirst`
pub fn solve_with_cheapest_first(
    state: &State,
    stage: StageName,
    solve: impl Fn(&State, usize) -> Result<HumanSolve, SolveError>,
) -> Result<(HumanSolve, usize), SolveError> {
    let mut best: Option<(HumanSolve, usize, usize)> = None;
    for first in FIRST_COLOR_ORDER {
        let raw = solve(state, first)?;
        let cost = stage_cost(&raw, stage);
        if best.as_ref().is_none_or(|b| cost < b.2) {
            best = Some((raw, first, cost));
        }
    }
    best.map(|(raw, first, _)| (raw, first))
        .ok_or(SolveError("풀지 못했다"))
}

/// 3×3 프리드리히 홈 시연 풀이(사이트 `3-cfop`): 십자가 가장 싼 색으로
pub fn hero_cfop(state: &State) -> Result<(HumanSolve, usize), SolveError> {
    solve_with_cheapest_first(state, StageName::Cross, solve_cfop_first)
}
