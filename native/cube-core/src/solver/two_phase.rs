//! 3×3 2단계 해법(Kociemba two-phase). `packages/cube-solver/src/two-phase.ts`를 그대로 옮겼다.
//! 탐색 차례가 같아야 같은 해(= 같은 섞기 글)가 나온다.
//!
//! 1단계: 아무 수(18가지)로 G1 = <U, D, R2, L2, F2, B2> 안으로. 2단계: G1 안의 수(10가지)로 맞춘다.
//! 1단계 길이를 0부터 늘려 가며, 1단계 끝마다 남은 길이 안에서 2단계를 찾고, 처음 찾은 해를 낸다.

use std::sync::OnceLock;

use super::cubie::{corner_multiply, edge_multiply, face_move_cubies, CubieCube, SOLVED};
use super::move_name;
use super::perm::{rank_permutation, unrank_permutation};

const N_TWIST: usize = 2187;
const N_FLIP: usize = 2048;
const N_SLICE: usize = 495;
const N_PERM8: usize = 40320;
const N_SLICE_PERM: usize = 24;
const N_MOVES: usize = 18;

/// 2단계에서 쓰는 수: U U2 U' D D2 D' R2 F2 L2 B2
const P2_MOVES: [usize; 10] = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16];
const N_P2: usize = 10;

fn is_p2_move(m: usize) -> bool {
    P2_MOVES.contains(&m)
}

struct SliceIndex {
    masks: Vec<u16>,
    index: Vec<i16>,
    solved: usize,
}

fn slice_index() -> &'static SliceIndex {
    static CACHE: OnceLock<SliceIndex> = OnceLock::new();
    CACHE.get_or_init(|| {
        let mut masks = Vec::new();
        let mut index = vec![-1i16; 1 << 12];
        for mask in 0..(1u16 << 12) {
            if mask.count_ones() == 4 {
                index[mask as usize] = masks.len() as i16;
                masks.push(mask);
            }
        }
        let solved = index[0b1111_0000_0000] as usize;
        SliceIndex {
            masks,
            index,
            solved,
        }
    })
}

fn twist_of(c: &CubieCube) -> usize {
    c.co[..7].iter().fold(0, |t, &o| t * 3 + o as usize)
}

fn set_twist(c: &mut CubieCube, mut t: usize) {
    let mut sum = 0;
    for i in (0..7).rev() {
        let o = (t % 3) as u8;
        c.co[i] = o;
        sum += o;
        t /= 3;
    }
    c.co[7] = (3 - (sum % 3)) % 3;
}

fn flip_of(c: &CubieCube) -> usize {
    c.eo[..11].iter().fold(0, |t, &o| t * 2 + o as usize)
}

fn set_flip(c: &mut CubieCube, mut t: usize) {
    let mut sum = 0;
    for i in (0..11).rev() {
        let o = (t & 1) as u8;
        c.eo[i] = o;
        sum += o;
        t >>= 1;
    }
    c.eo[11] = sum % 2;
}

fn slice_of(c: &CubieCube) -> usize {
    let mut mask = 0usize;
    for i in 0..12 {
        if c.ep[i] >= 8 {
            mask |= 1 << i;
        }
    }
    slice_index().index[mask] as usize
}

fn set_slice(c: &mut CubieCube, s: usize) {
    let mask = slice_index().masks[s];
    let mut slice = 8;
    let mut other = 0;
    for i in 0..12 {
        if mask & (1 << i) != 0 {
            c.ep[i] = slice;
            slice += 1;
        } else {
            c.ep[i] = other;
            other += 1;
        }
    }
}

fn cperm_of(c: &CubieCube) -> usize {
    rank_permutation(&c.cp) as usize
}

fn ud_edge_of(c: &CubieCube) -> usize {
    rank_permutation(&c.ep[..8]) as usize
}

fn slice_perm_of(c: &CubieCube) -> usize {
    let p: Vec<u8> = c.ep[8..].iter().map(|e| e - 8).collect();
    rank_permutation(&p) as usize
}

struct Tables {
    twist_move: Vec<u16>,
    flip_move: Vec<u16>,
    slice_move: Vec<u16>,
    cperm_move: Vec<u16>,
    ud_edge_move: Vec<u16>,
    slice_perm_move: Vec<u16>,
    prune_twist: Vec<u8>,
    prune_flip: Vec<u8>,
    prune_cperm: Vec<u8>,
    prune_ud_edge: Vec<u8>,
}

#[derive(Clone, Copy)]
enum Part {
    Corner,
    Edge,
}

fn build_move_table(
    count: usize,
    moves: &[usize],
    set: impl Fn(&mut CubieCube, usize),
    get: impl Fn(&CubieCube) -> usize,
    part: Part,
) -> Vec<u16> {
    let all = face_move_cubies();
    let mut table = vec![0u16; count * moves.len()];
    let mut a = SOLVED;
    let mut out = SOLVED;
    for x in 0..count {
        set(&mut a, x);
        for (k, &m) in moves.iter().enumerate() {
            match part {
                Part::Corner => corner_multiply(&a, &all[m], &mut out),
                Part::Edge => edge_multiply(&a, &all[m], &mut out),
            }
            table[x * moves.len() + k] = get(&out) as u16;
        }
    }
    table
}

/// 두 좌표 짝(a: 가운데 층 쪽, b: 다른 쪽)의 거리표. 번호는 a × count_b + b
fn build_prune_table(
    count_a: usize,
    move_a: &[u16],
    count_b: usize,
    move_b: &[u16],
    n_moves: usize,
    start_a: usize,
) -> Vec<u8> {
    let total = count_a * count_b;
    let mut t = vec![255u8; total];
    t[start_a * count_b] = 0;
    let mut filled = 1;
    let mut row_a = vec![0usize; n_moves];
    let mut d: u8 = 0;
    while filled < total {
        let backward = filled > total / 2;
        let want = if backward { 255 } else { d };
        let before = filled;
        let mut i = 0;
        for a in 0..count_a {
            for m in 0..n_moves {
                row_a[m] = move_a[a * n_moves + m] as usize * count_b;
            }
            for b in 0..count_b {
                if t[i] == want {
                    let row_b = b * n_moves;
                    for m in 0..n_moves {
                        let j = row_a[m] + move_b[row_b + m] as usize;
                        if backward {
                            if t[j] == d {
                                t[i] = d + 1;
                                filled += 1;
                                break;
                            }
                        } else if t[j] == 255 {
                            t[j] = d + 1;
                            filled += 1;
                        }
                    }
                }
                i += 1;
            }
        }
        assert!(filled != before, "가지치기 표를 다 채우지 못했다");
        d += 1;
    }
    t
}

fn tables() -> &'static Tables {
    static CACHE: OnceLock<Tables> = OnceLock::new();
    CACHE.get_or_init(|| {
        let all18: Vec<usize> = (0..N_MOVES).collect();
        let twist_move = build_move_table(N_TWIST, &all18, set_twist, twist_of, Part::Corner);
        let flip_move = build_move_table(N_FLIP, &all18, set_flip, flip_of, Part::Edge);
        let slice_move = build_move_table(N_SLICE, &all18, set_slice, slice_of, Part::Edge);
        // 2단계 수는 위아래 층 엣지를 위아래 층 안에서만 옮긴다(사이트는 같은 표를 더 빠른 방법으로 만든다)
        let cperm_move = build_move_table(
            N_PERM8,
            &P2_MOVES,
            |c, x| {
                let p = unrank_permutation(x as u32, 8);
                c.cp.copy_from_slice(&p);
            },
            cperm_of,
            Part::Corner,
        );
        let ud_edge_move = build_move_table(
            N_PERM8,
            &P2_MOVES,
            |c, x| {
                let p = unrank_permutation(x as u32, 8);
                c.ep[..8].copy_from_slice(&p);
                for i in 8..12 {
                    c.ep[i] = i as u8;
                }
            },
            ud_edge_of,
            Part::Edge,
        );
        let slice_perm_move = build_move_table(
            N_SLICE_PERM,
            &P2_MOVES,
            |c, x| {
                let p = unrank_permutation(x as u32, 4);
                for i in 0..8 {
                    c.ep[i] = i as u8;
                }
                for i in 0..4 {
                    c.ep[8 + i] = p[i] + 8;
                }
            },
            slice_perm_of,
            Part::Edge,
        );
        let solved = slice_index().solved;
        let prune_twist =
            build_prune_table(N_SLICE, &slice_move, N_TWIST, &twist_move, N_MOVES, solved);
        let prune_flip =
            build_prune_table(N_SLICE, &slice_move, N_FLIP, &flip_move, N_MOVES, solved);
        let prune_cperm = build_prune_table(
            N_SLICE_PERM,
            &slice_perm_move,
            N_PERM8,
            &cperm_move,
            N_P2,
            0,
        );
        let prune_ud_edge = build_prune_table(
            N_SLICE_PERM,
            &slice_perm_move,
            N_PERM8,
            &ud_edge_move,
            N_P2,
            0,
        );
        Tables {
            twist_move,
            flip_move,
            slice_move,
            cperm_move,
            ud_edge_move,
            slice_perm_move,
            prune_twist,
            prune_flip,
            prune_cperm,
            prune_ud_edge,
        }
    })
}

/// 3×3 해법 표를 미리 만든다(처음 풀 때 저절로 만들어진다)
pub fn init_3x3() {
    tables();
}

struct Search<'a> {
    t: &'a Tables,
    seq: [u8; 64],
    start: CubieCube,
    limit: usize,
    /// 첫 수로 막은 축(0 U·D, 1 R·L, 2 F·B)
    banned_first_axis: Option<usize>,
    solution_length: usize,
    slice_solved: usize,
}

impl Search<'_> {
    /// 직전 수 다음에 두지 않을 수: 같은 면, 그리고 맞은편 면은 U·R·F 쪽이 먼저 오게
    fn skip(&self, face: usize, depth: usize) -> bool {
        if depth == 0 {
            return Some(face % 3) == self.banned_first_axis;
        }
        let prev = (self.seq[depth - 1] / 3) as usize;
        face == prev || face + 3 == prev
    }

    fn phase1(
        &mut self,
        twist: usize,
        flip: usize,
        slice: usize,
        depth: usize,
        togo: usize,
    ) -> bool {
        if togo == 0 {
            if twist != 0 || flip != 0 || slice != self.slice_solved {
                return false;
            }
            // 2단계 수로 끝나면 그 수를 뺀 더 짧은 1단계 해가 이미 있다
            if depth > 0 && is_p2_move(self.seq[depth - 1] as usize) {
                return false;
            }
            return self.phase2_start(depth);
        }
        let t = self.t;
        for m in 0..N_MOVES {
            if self.skip(m / 3, depth) {
                continue;
            }
            let nt = t.twist_move[twist * N_MOVES + m] as usize;
            let nf = t.flip_move[flip * N_MOVES + m] as usize;
            let ns = t.slice_move[slice * N_MOVES + m] as usize;
            let h = t.prune_twist[ns * N_TWIST + nt].max(t.prune_flip[ns * N_FLIP + nf]) as usize;
            if h + 1 > togo {
                continue;
            }
            self.seq[depth] = m as u8;
            if self.phase1(nt, nf, ns, depth + 1, togo - 1) {
                return true;
            }
        }
        false
    }

    fn phase2_start(&mut self, depth1: usize) -> bool {
        let moves = face_move_cubies();
        let mut c = self.start;
        let mut out = SOLVED;
        for i in 0..depth1 {
            let mv = &moves[self.seq[i] as usize];
            corner_multiply(&c, mv, &mut out);
            edge_multiply(&c, mv, &mut out);
            c = out;
        }
        let cp = cperm_of(&c);
        let ue = ud_edge_of(&c);
        let sp = slice_perm_of(&c);
        let t = self.t;
        let h0 = t.prune_cperm[sp * N_PERM8 + cp].max(t.prune_ud_edge[sp * N_PERM8 + ue]) as usize;
        if self.limit < depth1 {
            return false;
        }
        for d2 in h0..=(self.limit - depth1) {
            if self.phase2(cp, ue, sp, depth1, d2) {
                self.solution_length = depth1 + d2;
                return true;
            }
        }
        false
    }

    fn phase2(&mut self, cp: usize, ue: usize, sp: usize, depth: usize, togo: usize) -> bool {
        if togo == 0 {
            return cp == 0 && ue == 0 && sp == 0;
        }
        let t = self.t;
        for (k, &m) in P2_MOVES.iter().enumerate() {
            if self.skip(m / 3, depth) {
                continue;
            }
            let ncp = t.cperm_move[cp * N_P2 + k] as usize;
            let nue = t.ud_edge_move[ue * N_P2 + k] as usize;
            let nsp = t.slice_perm_move[sp * N_P2 + k] as usize;
            let h = t.prune_cperm[nsp * N_PERM8 + ncp].max(t.prune_ud_edge[nsp * N_PERM8 + nue])
                as usize;
            if h + 1 > togo {
                continue;
            }
            self.seq[depth] = m as u8;
            if self.phase2(ncp, nue, nsp, depth + 1, togo - 1) {
                return true;
            }
        }
        false
    }
}

/// 3×3 조각 표현을 맞추는 수(WCA 표기). 맞춘 상태면 빈 문자열, `max_length`(기본 21) 안에 없으면 None.
/// `first_axis_not`: 해의 첫 수로 두지 않을 축(0 U·D, 1 R·L, 2 F·B).
pub fn solve_3x3(
    cube: &CubieCube,
    max_length: usize,
    first_axis_not: Option<usize>,
) -> Option<String> {
    let t = tables();
    let mut s = Search {
        t,
        seq: [0; 64],
        start: *cube,
        limit: max_length,
        banned_first_axis: first_axis_not,
        solution_length: 0,
        slice_solved: slice_index().solved,
    };
    let twist = twist_of(cube);
    let flip = flip_of(cube);
    let slice = slice_of(cube);
    for d1 in 0..=max_length {
        if s.phase1(twist, flip, slice, 0, d1) {
            let out: Vec<String> = s.seq[..s.solution_length]
                .iter()
                .map(|&m| move_name(m))
                .collect();
            return Some(out.join(" "));
        }
    }
    None
}
