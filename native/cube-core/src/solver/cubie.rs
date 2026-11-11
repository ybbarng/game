//! 꼭짓점·모서리 조각 표현(cubie). `packages/cube-solver/src/cubie.ts`
//!
//! - 꼭짓점 자리 순서: URF UFL ULB UBR DFR DLF DBL DRB (0..7)
//! - 모서리 자리 순서: UR UF UL UB DR DF DL DB FR FL BL BR (0..11)
//! - `cp[i]`는 자리 i에 있는 꼭짓점 번호, `co[i]`는 그 꼭짓점의 돌아간 정도(0..2). 모서리도 같다.
//! - 상태 A에 수 M을 두면 A·M.

use std::sync::OnceLock;

use crate::notation::CubeMove;
use crate::state::{apply_move, face_colors, solved_cube};
use crate::topology::{B, D, F, L, R, U};

use super::perm::parity;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CubieCube {
    pub cp: [u8; 8],
    pub co: [u8; 8],
    pub ep: [u8; 12],
    pub eo: [u8; 12],
}

pub const SOLVED: CubieCube = CubieCube {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0; 8],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0; 12],
};

/// 3×3 스티커 번호로 적은 꼭짓점 스티커 자리(U·D 스티커가 먼저, 그다음 시계 방향)
const CORNER_FACELETS: [[usize; 3]; 8] = [
    [8, 9, 20],
    [6, 18, 38],
    [0, 36, 47],
    [2, 45, 11],
    [29, 26, 15],
    [27, 44, 24],
    [33, 53, 42],
    [35, 17, 51],
];

const EDGE_FACELETS: [[usize; 2]; 12] = [
    [5, 10],
    [7, 19],
    [3, 37],
    [1, 46],
    [32, 16],
    [28, 25],
    [30, 43],
    [34, 52],
    [23, 12],
    [21, 41],
    [50, 39],
    [48, 14],
];

const CORNER_COLORS: [[usize; 3]; 8] = [
    [U, R, F],
    [U, F, L],
    [U, L, B],
    [U, B, R],
    [D, F, R],
    [D, L, F],
    [D, B, L],
    [D, R, B],
];

const EDGE_COLORS: [[usize; 2]; 12] = [
    [U, R],
    [U, F],
    [U, L],
    [U, B],
    [D, R],
    [D, F],
    [D, L],
    [D, B],
    [F, R],
    [F, L],
    [B, L],
    [B, R],
];

pub fn corner_multiply(a: &CubieCube, b: &CubieCube, out: &mut CubieCube) {
    for i in 0..8 {
        let from = b.cp[i] as usize;
        out.cp[i] = a.cp[from];
        out.co[i] = (a.co[from] + b.co[i]) % 3;
    }
}

pub fn edge_multiply(a: &CubieCube, b: &CubieCube, out: &mut CubieCube) {
    for i in 0..12 {
        let from = b.ep[i] as usize;
        out.ep[i] = a.ep[from];
        out.eo[i] = (a.eo[from] + b.eo[i]) % 2;
    }
}

/// 상태 a 다음에 b를 둔 결과(a·b)
pub fn multiply(a: &CubieCube, b: &CubieCube) -> CubieCube {
    let mut r = SOLVED;
    corner_multiply(a, b, &mut r);
    edge_multiply(a, b, &mut r);
    r
}

/// 3×3 색(면 번호, 가운데가 기본 방향)을 조각 표현으로. 맞출 수 없는 색 조합이면 None
pub fn colors_to_cubie(f: &[u8]) -> Option<CubieCube> {
    let mut c = SOLVED;
    for (i, facelets) in CORNER_FACELETS.iter().enumerate() {
        let ori = (0..3).find(|&o| matches!(f[facelets[o]] as usize, U | D))?;
        let top = f[facelets[ori]] as usize;
        let c1 = f[facelets[(ori + 1) % 3]] as usize;
        let c2 = f[facelets[(ori + 2) % 3]] as usize;
        let j = CORNER_COLORS.iter().position(|col| *col == [top, c1, c2])?;
        c.cp[i] = j as u8;
        c.co[i] = ori as u8;
    }
    for (i, [a, b]) in EDGE_FACELETS.iter().enumerate() {
        let (fa, fb) = (f[*a] as usize, f[*b] as usize);
        let (j, o) = EDGE_COLORS.iter().enumerate().find_map(|(j, col)| {
            if fa == col[0] && fb == col[1] {
                Some((j, 0))
            } else if fa == col[1] && fb == col[0] {
                Some((j, 1))
            } else {
                None
            }
        })?;
        c.ep[i] = j as u8;
        c.eo[i] = o;
    }
    let mut seen_c = c.cp;
    seen_c.sort_unstable();
    let mut seen_e = c.ep;
    seen_e.sort_unstable();
    let ok = seen_c == SOLVED.cp
        && seen_e == SOLVED.ep
        && c.co.iter().map(|&x| u32::from(x)).sum::<u32>() % 3 == 0
        && c.eo.iter().map(|&x| u32::from(x)).sum::<u32>() % 2 == 0
        && parity(&c.cp) == parity(&c.ep);
    ok.then_some(c)
}

/// 18가지 바깥 면 수의 조각 표현. 번호 m = 면×3 + (돌린 횟수-1), 면 순서 U R F D L B.
/// 사이트처럼 스티커 엔진으로 맞춘 큐브에 수를 두고 읽어 만든다(두 표현이 어긋나지 않는다).
pub fn face_move_cubies() -> &'static [CubieCube; 18] {
    static CACHE: OnceLock<[CubieCube; 18]> = OnceLock::new();
    CACHE.get_or_init(|| {
        let mut out = [SOLVED; 18];
        // 면 U R F D L B를 엔진의 축·층으로: + 쪽 면은 1층, - 쪽 면은 3층을 반대 방향으로
        let faces: [(u8, bool); 6] = [
            (1, true),
            (0, true),
            (2, true),
            (1, false),
            (0, false),
            (2, false),
        ];
        for (fi, (axis, positive)) in faces.iter().enumerate() {
            for turns in 1..=3u8 {
                let m = if *positive {
                    CubeMove {
                        axis: *axis,
                        from: 1,
                        to: 1,
                        turns,
                    }
                } else {
                    CubeMove {
                        axis: *axis,
                        from: 3,
                        to: 3,
                        turns: 4 - turns,
                    }
                };
                let s = apply_move(3, &solved_cube(3), &m);
                out[fi * 3 + turns as usize - 1] =
                    colors_to_cubie(&face_colors(3, &s)).expect("면 수의 조각 표현");
            }
        }
        out
    })
}
