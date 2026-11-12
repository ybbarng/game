//! 흐름 콤보(`apps/web/src/cube/flow/combo.ts`, docs/51 2-1). 화면을 모르는 순수 함수다.
//! - 면 돌리기 사이가 [`COMBO_GAP_MS`] 안쪽이면 1 오른다. 멈추면 끊긴다(다음 수가 1).
//! - 되돌리는 수(같은 층을 이어 돌려 합이 한 바퀴)는 끊는다(0). 큐브 돌리기 뒤에는 면 이름을 바꿔 같은 층인지 본다.
//! - 진행이 없으면 끊는다(0): 콤보가 [`combo_step_moves`]수 늘 때마다 진행 칸이 시작보다 한 칸씩 더 올라 있어야 한다
//!   (최근 [`COMBO_LOOK_BACK`]수 가운데 가장 높은 값으로 본다).
//! - 큐브 돌리기는 콤보를 올리지도 끊지도 않는다.

use crate::notation::{Axis, CubeMove};

pub const COMBO_GAP_MS: f64 = 1_000.0;
/// 이만큼 이어 쳐야 콤보를 보인다(기록에도 이만큼부터 남긴다)
pub const COMBO_SHOW: u32 = 4;
pub const COMBO_STEP_MOVES: u32 = 10;
pub const COMBO_STEP_MOVES_2: u32 = 20;
pub const COMBO_LOOK_BACK: usize = 12;

pub fn combo_step_moves(n: usize) -> u32 {
    if n == 2 {
        COMBO_STEP_MOVES_2
    } else {
        COMBO_STEP_MOVES
    }
}

/// 이어 돌린 같은 층과 그 합(4분의 1 바퀴 단위, 0~3)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Run {
    pub axis: Axis,
    pub from: usize,
    pub to: usize,
    pub sum: u8,
}

/// 사이트 `ComboState`
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ComboState {
    pub combo: u32,
    pub turn_at: Option<f64>,
    pub run: Option<Run>,
    pub start: Option<u32>,
    pub recent: Vec<u32>,
}

/// 축 `rot`를 + 쪽에서 볼 때 시계 90°로 큐브를 돌리면 다른 축 방향이 어디로 가나(축, 쪽)
fn quarter(rot: Axis, axis: Axis) -> Option<(Axis, i8)> {
    match (rot, axis) {
        (0, 1) => Some((2, -1)),
        (0, 2) => Some((1, 1)),
        (1, 2) => Some((0, -1)),
        (1, 0) => Some((2, 1)),
        (2, 0) => Some((1, -1)),
        (2, 1) => Some((0, 1)),
        _ => None,
    }
}

fn turn_dir(mut axis: Axis, mut sign: i8, rot: Axis, turns: u8) -> (Axis, i8) {
    for _ in 0..turns {
        let Some((a, s)) = quarter(rot, axis) else {
            break;
        };
        axis = a;
        sign *= s;
    }
    (axis, sign)
}

fn run_after_rotation(n: usize, run: Run, rot: &CubeMove) -> Run {
    let (axis, sign) = turn_dir(run.axis, 1, rot.axis, rot.turns);
    if sign == 1 {
        return Run { axis, ..run };
    }
    Run {
        axis,
        from: n + 1 - run.to,
        to: n + 1 - run.from,
        sum: (4 - run.sum) % 4,
    }
}

/// 수 하나를 콤보에 더한다(사이트 `pushCombo`). `progress`는 이 수를 둔 뒤의 진행 칸
pub fn push_combo(
    c: &ComboState,
    n: usize,
    m: &CubeMove,
    at: f64,
    progress: Option<u32>,
) -> ComboState {
    if m.is_rotation(n) {
        return match c.run {
            Some(run) => ComboState {
                run: Some(run_after_rotation(n, run, m)),
                ..c.clone()
            },
            None => c.clone(),
        };
    }
    let joined = c.turn_at.is_some_and(|t| at - t <= COMBO_GAP_MS);
    let fresh = |combo: u32, run: Run| ComboState {
        combo,
        turn_at: Some(at),
        run: Some(run),
        start: progress,
        recent: progress.into_iter().collect(),
    };
    let same = c
        .run
        .is_some_and(|r| r.axis == m.axis && r.from == m.from && r.to == m.to);
    let run = Run {
        axis: m.axis,
        from: m.from,
        to: m.to,
        sum: ((if same { c.run.map_or(0, |r| r.sum) } else { 0 }) + m.turns) % 4,
    };
    if same && run.sum == 0 {
        return fresh(0, run);
    }
    if !joined {
        return fresh(1, run);
    }
    let combo = c.combo + 1;
    let Some(p) = progress else {
        return ComboState {
            combo,
            turn_at: Some(at),
            run: Some(run),
            ..c.clone()
        };
    };
    let Some(start) = c.start.filter(|_| c.combo != 0) else {
        return fresh(combo, run);
    };
    let mut recent = c.recent.clone();
    recent.push(p);
    if recent.len() > COMBO_LOOK_BACK {
        recent.drain(..recent.len() - COMBO_LOOK_BACK);
    }
    let step = combo_step_moves(n);
    let top = recent.iter().copied().max().unwrap_or(0);
    if combo % step == 0 && top < start + combo / step {
        return fresh(0, run);
    }
    ComboState {
        combo,
        turn_at: Some(at),
        run: Some(run),
        start: Some(start),
        recent,
    }
}

/// 지금 콤보: 마지막 면 돌리기에서 [`COMBO_GAP_MS`]가 지나면 0(사이트 `comboNow`)
pub fn combo_now(c: &ComboState, now: f64) -> u32 {
    match c.turn_at {
        Some(t) if now - t <= COMBO_GAP_MS => c.combo,
        _ => 0,
    }
}
