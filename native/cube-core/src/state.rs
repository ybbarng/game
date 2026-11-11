//! 큐브 상태와 수 적용, 맞춤 판정(`packages/cube-engine/src/state.ts`·`move.ts`, `packages/puzzle-core/src/perm.ts`).
//!
//! 상태는 스티커 자리마다 「지금 그 자리에 있는 스티커 번호」(`perm`)와 「스티커가 돌아간 정도 0~3」(`twist`)이다.
//! 스티커 번호를 n²로 나눈 몫이 그 스티커의 색(맞춘 상태에서 있던 면)이다.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use crate::notation::{parse_moves, CubeMove, NotationError};
use crate::topology::{
    cube_rotations, cube_topology, face_of_normal, quarter_turns_between, rot_power, rotate, Rot,
    QUARTER_TURNS,
};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct State {
    pub perm: Vec<u16>,
    pub twist: Vec<u8>,
}

/// 수 하나의 스티커 순열 표: 자리 i의 스티커는 `dest[i]`로 가고 방향이 `twist_delta[i]`만큼 돈다
#[derive(Debug)]
pub struct MoveTable {
    pub dest: Vec<u16>,
    pub twist_delta: Vec<u8>,
}

pub fn solved_cube(n: usize) -> State {
    let count = cube_topology(n).sticker_count;
    State {
        perm: (0..count as u16).collect(),
        twist: vec![0; count],
    }
}

fn build_move_table(n: usize, m: &CubeMove) -> MoveTable {
    assert!(m.is_valid(n), "{n}×{n}에 둘 수 없는 수: {m:?}");
    let topo = cube_topology(n);
    let rot: Rot = rot_power(&QUARTER_TURNS[m.axis as usize], u32::from(m.turns));
    let ai = m.axis as usize;
    let size = topo.sticker_count;
    let mut dest = vec![0u16; size];
    let mut twist_delta = vec![0u8; size];
    for (i, s) in topo.stickers.iter().enumerate() {
        let piece = &topo.pieces[s.piece];
        let layer = topo.layer_of(piece.position[ai]);
        if layer < m.from || layer > m.to {
            dest[i] = i as u16;
            continue;
        }
        let pos = rotate(&rot, piece.position);
        let normal = rotate(&rot, s.normal);
        let j = topo
            .sticker_at(pos, face_of_normal(normal))
            .expect("스티커 자리를 찾지 못했다");
        let target = &topo.stickers[j];
        dest[i] = j as u16;
        twist_delta[i] = quarter_turns_between(target.up, target.normal, rotate(&rot, s.up));
    }
    MoveTable { dest, twist_delta }
}

thread_local! {
    static TABLES: RefCell<HashMap<(usize, CubeMove), Rc<MoveTable>>> = RefCell::new(HashMap::new());
}

/// 수 하나의 표(크기·수마다 한 번 만들어 둔다)
pub fn move_table(n: usize, m: &CubeMove) -> Rc<MoveTable> {
    TABLES.with(|t| {
        t.borrow_mut()
            .entry((n, *m))
            .or_insert_with(|| Rc::new(build_move_table(n, m)))
            .clone()
    })
}

pub fn apply_move(n: usize, state: &State, m: &CubeMove) -> State {
    let table = move_table(n, m);
    let size = state.perm.len();
    let mut perm = vec![0u16; size];
    let mut twist = vec![0u8; size];
    for i in 0..size {
        let j = table.dest[i] as usize;
        perm[j] = state.perm[i];
        twist[j] = (state.twist[i] + table.twist_delta[i]) % 4;
    }
    State { perm, twist }
}

pub fn apply_moves(n: usize, state: &State, moves: &[CubeMove]) -> State {
    let mut s = state.clone();
    for m in moves {
        s = apply_move(n, &s, m);
    }
    s
}

/// 표기를 읽어 차례로 적용한다
pub fn apply_alg(n: usize, state: &State, text: &str) -> Result<State, NotationError> {
    Ok(apply_moves(n, state, &parse_moves(n, text)?))
}

/// 자리마다 지금 보이는 색(면 번호)
pub fn face_colors(n: usize, state: &State) -> Vec<u8> {
    let nn = (n * n) as u16;
    state.perm.iter().map(|&p| (p / nn) as u8).collect()
}

/// 맞춘 큐브를 통째로 `g`만큼 돌린 상태
pub fn rotated_solved(n: usize, g: &Rot) -> State {
    let topo = cube_topology(n);
    let count = topo.sticker_count;
    let mut perm = vec![0u16; count];
    let mut twist = vec![0u8; count];
    for (i, s) in topo.stickers.iter().enumerate() {
        let piece = &topo.pieces[s.piece];
        let normal = rotate(g, s.normal);
        let j = topo
            .sticker_at(rotate(g, piece.position), face_of_normal(normal))
            .expect("스티커 자리를 찾지 못했다");
        let target = &topo.stickers[j];
        perm[j] = i as u16;
        twist[j] = quarter_turns_between(target.up, normal, rotate(g, s.up));
    }
    State { perm, twist }
}

/// 맞춤 판정. 큐브 전체 방향은 상관없다.
/// - 기본: 면마다 한 색이면 맞춤.
/// - `orient_centers`: 스티커 하나하나의 자리와 방향까지 맞아야 맞춤(그림 큐브).
pub fn is_solved_with(n: usize, state: &State, orient_centers: bool) -> bool {
    if orient_centers {
        return cube_rotations()
            .iter()
            .any(|g| rotated_solved(n, g) == *state);
    }
    let nn = n * n;
    for f in 0..6 {
        let color = state.perm[f * nn] as usize / nn;
        for k in 1..nn {
            if state.perm[f * nn + k] as usize / nn != color {
                return false;
            }
        }
    }
    true
}

pub fn is_solved(n: usize, state: &State) -> bool {
    is_solved_with(n, state, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sexy_move_six_times_is_identity() {
        let s0 = solved_cube(3);
        let mut s = s0.clone();
        for _ in 0..6 {
            s = apply_alg(3, &s, "R U R' U'").unwrap();
        }
        assert_eq!(s, s0);
        assert!(is_solved_with(3, &apply_alg(3, &s0, "x y").unwrap(), true));
        assert!(!is_solved(3, &apply_alg(3, &s0, "R").unwrap()));
    }
}
