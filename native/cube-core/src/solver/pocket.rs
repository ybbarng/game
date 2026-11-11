//! 2×2 최적 해(`packages/cube-solver/src/pocket.ts`).
//!
//! DBL 꼭짓점을 고정하고 U·R·F만 쓴다. 상태는 나머지 꼭짓점 7개의 순열(5040) × 방향(729) = 3,674,160개.
//! 처음 부를 때 맞춘 상태에서 너비 우선으로 모든 상태의 거리를 구해 둔다.

use std::sync::OnceLock;

use super::cubie::{corner_multiply, face_move_cubies, CubieCube, SOLVED};
use super::move_name;
use super::perm::{rank_permutation, unrank_permutation};

const PERM_COUNT: usize = 5040;
const ORI_COUNT: usize = 729;
pub const POCKET_STATE_COUNT: u32 = (PERM_COUNT * ORI_COUNT) as u32;

/// 고정한 DBL을 뺀 꼭짓점 자리
const SLOTS: [usize; 7] = [0, 1, 2, 3, 4, 5, 7];
const DBL: usize = 6;

struct Tables {
    perm_move: Vec<u16>,
    ori_move: Vec<u16>,
    dist: Vec<u8>,
}

fn to_slot(piece: u8) -> u8 {
    if (piece as usize) < DBL {
        piece
    } else {
        piece - 1
    }
}

fn perm_coord(c: &CubieCube) -> u32 {
    let p: Vec<u8> = SLOTS.iter().map(|&i| to_slot(c.cp[i])).collect();
    rank_permutation(&p)
}

fn ori_coord(c: &CubieCube) -> u32 {
    let mut t = 0;
    for &slot in &SLOTS[..6] {
        t = t * 3 + u32::from(c.co[slot]);
    }
    t
}

fn set_perm(c: &mut CubieCube, coord: u32) {
    let p = unrank_permutation(coord, 7);
    for k in 0..7 {
        c.cp[SLOTS[k]] = SLOTS[p[k] as usize] as u8;
    }
    c.cp[DBL] = DBL as u8;
}

fn set_ori(c: &mut CubieCube, mut coord: u32) {
    let mut sum = 0;
    for k in (0..6).rev() {
        let o = (coord % 3) as u8;
        c.co[SLOTS[k]] = o;
        sum += o;
        coord /= 3;
    }
    c.co[7] = (3 - (sum % 3)) % 3;
    c.co[DBL] = 0;
}

fn tables() -> &'static Tables {
    static CACHE: OnceLock<Tables> = OnceLock::new();
    CACHE.get_or_init(build)
}

fn build() -> Tables {
    let moves = face_move_cubies();
    let mut perm_move = vec![0u16; PERM_COUNT * 9];
    let mut ori_move = vec![0u16; ORI_COUNT * 9];
    let mut a = SOLVED;
    let mut out = SOLVED;
    for p in 0..PERM_COUNT {
        set_perm(&mut a, p as u32);
        for k in 0..9 {
            corner_multiply(&a, &moves[k], &mut out);
            perm_move[p * 9 + k] = perm_coord(&out) as u16;
        }
    }
    a.cp = SOLVED.cp;
    for o in 0..ORI_COUNT {
        set_ori(&mut a, o as u32);
        for k in 0..9 {
            corner_multiply(&a, &moves[k], &mut out);
            ori_move[o * 9 + k] = ori_coord(&out) as u16;
        }
    }

    let total = PERM_COUNT * ORI_COUNT;
    let mut dist = vec![255u8; total];
    dist[0] = 0;
    let mut filled = 1;
    let mut row = [0usize; 9];
    let mut d: u8 = 0;
    while filled < total {
        let backward = filled > total / 2;
        let want = if backward { 255 } else { d };
        let before = filled;
        let mut s = 0;
        for p in 0..PERM_COUNT {
            for k in 0..9 {
                row[k] = perm_move[p * 9 + k] as usize * ORI_COUNT;
            }
            for o in 0..ORI_COUNT {
                if dist[s] == want {
                    let col = o * 9;
                    for k in 0..9 {
                        let t = row[k] + ori_move[col + k] as usize;
                        if backward {
                            if dist[t] == d {
                                dist[s] = d + 1;
                                filled += 1;
                                break;
                            }
                        } else if dist[t] == 255 {
                            dist[t] = d + 1;
                            filled += 1;
                        }
                    }
                }
                s += 1;
            }
        }
        assert!(filled != before, "2×2 거리표를 다 채우지 못했다");
        d += 1;
    }
    Tables {
        perm_move,
        ori_move,
        dist,
    }
}

/// 2×2 상태 번호의 최적 해 길이(HTM)
pub fn pocket_distance(index: u32) -> u8 {
    tables().dist[index as usize]
}

/// 상태 번호에 수 하나(0~8: U U2 U' R R2 R' F F2 F')를 돌린 상태 번호
pub fn pocket_apply(index: u32, mv: usize) -> u32 {
    let t = tables();
    let p = index as usize / ORI_COUNT;
    let o = index as usize - p * ORI_COUNT;
    (t.perm_move[p * 9 + mv] as usize * ORI_COUNT + t.ori_move[o * 9 + mv] as usize) as u32
}

/// 상태 번호 → 조각 표현(꼭짓점만, DBL 고정)
pub fn pocket_cubie(index: u32) -> CubieCube {
    let mut c = SOLVED;
    set_perm(&mut c, index / ORI_COUNT as u32);
    set_ori(&mut c, index % ORI_COUNT as u32);
    c
}

/// 상태 번호의 최적 해. U·R·F만 쓴 WCA 표기, 맞춘 상태면 빈 문자열
pub fn solve_pocket_index(index: u32) -> String {
    let mut out = Vec::new();
    let mut s = index;
    let mut d = pocket_distance(s);
    while d > 0 {
        let next = (0..9)
            .map(|k| (k, pocket_apply(s, k)))
            .find(|&(_, t)| pocket_distance(t) == d - 1)
            .expect("2×2 거리표가 어긋났다");
        out.push(move_name(next.0 as u8));
        s = next.1;
        d -= 1;
    }
    out.join(" ")
}
