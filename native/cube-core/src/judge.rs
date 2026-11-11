//! 목표 판정(`apps/web/src/cube/learn/judge.ts`의 층 목표, `algs/check.ts`의 `llDone`).
//! 모두 "지금 보이는 색"으로 본다. 홀수 크기는 면 정가운데 색이 기준이고, 짝수 크기는 큐브 전체 방향 24가지 중 하나라도
//! 맞으면 맞은 것으로 본다. 힌트(OLL·PLL 알아보기)에 쓰는 목표만 옮겼다.

use crate::groups::cube_groups;
use crate::notation::CubeMove;
use crate::state::{apply_move, face_colors, is_solved, rotated_solved, State};
use crate::topology::{cube_rotations, cube_topology, OPPOSITE_FACE, U};

const WHITE: u8 = U as u8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Goal {
    /// 다 맞춤(큐브 전체 방향만 봐준다)
    Solved,
    /// 흰 십자
    Cross,
    /// 첫 두 층(십자 + 첫 층 코너 + 둘째 층 엣지 + 센터)
    F2l,
    /// F2L + 윗면 엣지 방향(노란 십자)
    YellowCross,
    /// F2L + 윗면 한 색
    Oll,
    /// OLL + 윗면 돌리기 하나로 윗층 코너가 맞음
    YellowCorners,
}

/// 큐브 전체 방향 24가지마다 "자리 면 → 있어야 할 색"
fn all_frames(n: usize) -> Vec<[u8; 6]> {
    let nn = n * n;
    cube_rotations()
        .iter()
        .map(|g| {
            let c = face_colors(n, &rotated_solved(n, g));
            std::array::from_fn(|f| c[f * nn])
        })
        .collect()
}

/// 판정에 쓸 기준 방향들. 홀수 크기는 정가운데 색 하나로 정해진다
fn frames_of(n: usize, colors: &[u8]) -> Vec<[u8; 6]> {
    if n % 2 == 0 {
        return all_frames(n);
    }
    let nn = n * n;
    let mid = (nn - 1) / 2;
    vec![std::array::from_fn(|f| colors[f * nn + mid])]
}

struct View<'a> {
    n: usize,
    colors: &'a [u8],
    frame: [u8; 6],
    top: usize,
}

fn piece_ok(v: &View, piece: usize) -> bool {
    let topo = cube_topology(v.n);
    topo.pieces[piece]
        .stickers
        .iter()
        .all(|&s| v.colors[s] == v.frame[topo.stickers[s].face])
}

fn all_ok(v: &View, pieces: &[usize]) -> bool {
    pieces.iter().all(|&p| piece_ok(v, p))
}

fn face_is(n: usize, colors: &[u8], f: usize, color: u8) -> bool {
    let nn = n * n;
    (0..nn).all(|k| colors[f * nn + k] == color)
}

fn top_edges_oriented(v: &View, edges: &[usize]) -> bool {
    let topo = cube_topology(v.n);
    edges.iter().all(|&p| {
        topo.pieces[p]
            .stickers
            .iter()
            .all(|&s| topo.stickers[s].face != v.top || v.colors[s] == v.frame[v.top])
    })
}

/// 면 f를 바깥에서 볼 때 시계 방향으로 한 번 돌리는 수
pub fn face_turn(n: usize, f: usize) -> CubeMove {
    // U R F는 + 쪽 1층, D L B는 - 쪽(n층)을 반대 방향으로
    let (axis, positive) = [
        (1, true),
        (0, true),
        (2, true),
        (1, false),
        (0, false),
        (2, false),
    ][f];
    if positive {
        CubeMove {
            axis,
            from: 1,
            to: 1,
            turns: 1,
        }
    } else {
        CubeMove {
            axis,
            from: n,
            to: n,
            turns: 3,
        }
    }
}

/// 자리 면 f를 k번 돌린 상태
fn turn_face(n: usize, state: &State, f: usize, k: usize) -> State {
    let m = face_turn(n, f);
    let mut s = state.clone();
    for _ in 0..k {
        s = apply_move(n, &s, &m);
    }
    s
}

fn frame_goal(goal: Goal, v: &View, state: &State) -> bool {
    let n = v.n;
    let white = v.frame.iter().position(|&c| c == WHITE).unwrap_or(0);
    let g = cube_groups(n, white);
    match goal {
        Goal::Solved => unreachable!(),
        Goal::Cross => all_ok(v, &g.cross),
        Goal::F2l => all_ok(v, &g.f2l),
        Goal::YellowCross => all_ok(v, &g.f2l) && top_edges_oriented(v, &g.last_layer_edges),
        Goal::Oll => all_ok(v, &g.f2l) && face_is(n, v.colors, v.top, v.frame[v.top]),
        Goal::YellowCorners => {
            if !frame_goal(Goal::Oll, v, state) {
                return false;
            }
            (0..4).any(|k| {
                let s = turn_face(n, state, v.top, k);
                let colors = face_colors(n, &s);
                let tv = View {
                    colors: &colors,
                    ..*v
                };
                all_ok(&tv, &g.last_layer_corners)
            })
        }
    }
}

/// 목표가 됐나(사이트 `goalMet`)
pub fn goal_met(n: usize, state: &State, goal: Goal) -> bool {
    if goal == Goal::Solved {
        return is_solved(n, state);
    }
    let colors = face_colors(n, state);
    frames_of(n, &colors).into_iter().any(|frame| {
        let white = frame.iter().position(|&c| c == WHITE).unwrap_or(0);
        let v = View {
            n,
            colors: &colors,
            frame,
            top: OPPOSITE_FACE[white],
        };
        frame_goal(goal, &v, state)
    })
}

/// 홀수 크기에서 흰 센터 맞은편(윗면) 자리 면
fn top_face_odd(n: usize, state: &State) -> usize {
    let colors = face_colors(n, state);
    let nn = n * n;
    let mid = (nn - 1) / 2;
    let white = (0..6).find(|&f| colors[f * nn + mid] == WHITE).unwrap_or(0);
    OPPOSITE_FACE[white]
}

/// 윗면 돌리기 하나만 남았거나 다 맞음(사이트 `check.ts` `llDone`). 2×2는 위·아래 층 돌리기를 모두 봐준다
pub fn ll_done(n: usize, state: &State) -> bool {
    if n % 2 == 1 {
        let top = top_face_odd(n, state);
        return (0..4).any(|k| is_solved(n, &turn_face(n, state, top, k)));
    }
    (0..4).any(|a| {
        let s = turn_face(n, state, crate::topology::U, a);
        (0..4).any(|b| is_solved(n, &turn_face(n, &s, crate::topology::D, b)))
    })
}
