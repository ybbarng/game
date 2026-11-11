//! n×n 큐브의 생김새: 스티커 자리, 조각, 좌표(`packages/cube-engine/src/topology.ts`).
//!
//! - 면 번호는 U R F D L B 차례(0~5). 스티커 자리 번호 = 면 × n² + 줄 × n + 칸.
//! - 좌표: x 오른쪽(R), y 위(U), z 앞(F). 사이트는 조각 간격 1에 0.5 단위 좌표를 쓰고, 여기서는 정수로 두려고
//!   두 배 한 좌표를 쓴다(조각 중심 = 2 × 사이트 좌표, 스티커 중심 = 조각 중심 + 면 방향).
//! - 층 번호: 축(x·y·z)을 따라 + 쪽(R·U·F) 바깥층이 1, 반대쪽 바깥층이 n.

use std::sync::OnceLock;

pub type Vec3 = [i32; 3];
/// 3×3 정수 회전 행렬(행 우선 9칸)
pub type Rot = [i32; 9];

pub const U: usize = 0;
pub const R: usize = 1;
pub const F: usize = 2;
pub const D: usize = 3;
pub const L: usize = 4;
pub const B: usize = 5;

pub const FACE_NAMES: [&str; 6] = ["U", "R", "F", "D", "L", "B"];
pub const OPPOSITE_FACE: [usize; 6] = [D, L, B, U, R, F];

pub const FACE_NORMALS: [Vec3; 6] = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
    [-1, 0, 0],
    [0, 0, -1],
];

/// 자리마다 기준 "위" 방향
const FACE_UPS: [Vec3; 6] = [
    [0, 0, -1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
];

pub const MIN_SIZE: usize = 2;
pub const MAX_SIZE: usize = 7;

pub fn rotate(m: &Rot, v: Vec3) -> Vec3 {
    [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
    ]
}

/// a 다음 b: v → b(a(v)) 의 행렬 = b·a
fn mul_rot(a: &Rot, b: &Rot) -> Rot {
    let mut out = [0; 9];
    for r in 0..3 {
        for c in 0..3 {
            let mut s = 0;
            for k in 0..3 {
                s += b[r * 3 + k] * a[k * 3 + c];
            }
            out[r * 3 + c] = s;
        }
    }
    out
}

pub const ROT_IDENTITY: Rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/// 축의 + 쪽에서 볼 때 시계 방향 90°(R·U·F와 같은 방향). 차례는 x, y, z
pub const QUARTER_TURNS: [Rot; 3] = [
    [1, 0, 0, 0, 0, 1, 0, -1, 0],
    [0, 0, -1, 0, 1, 0, 1, 0, 0],
    [0, 1, 0, -1, 0, 0, 0, 0, 1],
];

pub fn rot_power(m: &Rot, times: u32) -> Rot {
    let mut out = ROT_IDENTITY;
    for _ in 0..times {
        out = mul_rot(&out, m);
    }
    out
}

/// 큐브 전체를 돌리는 24가지 회전(첫째는 그대로). 사이트와 같은 차례
pub fn cube_rotations() -> &'static [Rot] {
    static CACHE: OnceLock<Vec<Rot>> = OnceLock::new();
    CACHE.get_or_init(|| {
        let mut out = vec![ROT_IDENTITY];
        let mut i = 0;
        while i < out.len() {
            for g in [&QUARTER_TURNS[0], &QUARTER_TURNS[1]] {
                let next = mul_rot(&out[i], g);
                if !out.contains(&next) {
                    out.push(next);
                }
            }
            i += 1;
        }
        out
    })
}

pub fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

/// 자리 기준 위 방향 `up`을 면 방향 `normal` 둘레로 몇 번 돌려야 `v`가 되나(0~3)
pub fn quarter_turns_between(up: Vec3, normal: Vec3, v: Vec3) -> u8 {
    let mut t = up;
    for k in 0..4 {
        if t == v {
            return k;
        }
        t = cross(normal, t);
    }
    panic!("면 위의 방향이 아니다");
}

pub fn face_of_normal(v: Vec3) -> usize {
    FACE_NORMALS
        .iter()
        .position(|n| *n == v)
        .expect("면 방향이 아니다")
}

/// 조각 종류(사이트 `PieceKind`)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PieceKind {
    Corner,
    Edge,
    Wing,
    Center,
    InnerCenter,
}

#[derive(Clone, Debug)]
pub struct Piece {
    /// 조각 중심(두 배 좌표)
    pub position: Vec3,
    pub stickers: Vec<usize>,
    pub kind: PieceKind,
}

#[derive(Clone, Debug)]
pub struct Sticker {
    pub piece: usize,
    pub face: usize,
    pub row: usize,
    pub col: usize,
    pub normal: Vec3,
    pub up: Vec3,
}

#[derive(Debug)]
pub struct Topology {
    pub n: usize,
    pub sticker_count: usize,
    pub stickers: Vec<Sticker>,
    pub pieces: Vec<Piece>,
    span: i32,
    piece_index: Vec<i32>,
    sticker_index: Vec<i32>,
}

impl Topology {
    fn pos_key(&self, p: Vec3) -> Option<usize> {
        let n = self.n as i32;
        if p.iter().any(|&v| v < -n || v > n) {
            return None;
        }
        Some((((p[0] + n) * self.span + (p[1] + n)) * self.span + (p[2] + n)) as usize)
    }

    /// 좌표(조각 중심, 두 배)와 면으로 스티커 자리 찾기
    pub fn sticker_at(&self, position: Vec3, face: usize) -> Option<usize> {
        let k = self.pos_key(position)?;
        let v = self.sticker_index[k * 6 + face];
        (v >= 0).then_some(v as usize)
    }

    pub fn piece_at(&self, position: Vec3) -> Option<usize> {
        let k = self.pos_key(position)?;
        let v = self.piece_index[k];
        (v >= 0).then_some(v as usize)
    }

    /// 조각 좌표(두 배)의 축 값 → 층 번호(1 = + 쪽 바깥층)
    pub fn layer_of(&self, coord2: i32) -> usize {
        (((self.n as i32 - 1) - coord2) / 2 + 1) as usize
    }
}

/// 면 f의 줄 r·칸 c 스티커가 붙은 조각의 중심(두 배 좌표)
fn piece_position(n: usize, f: usize, r: usize, c: usize) -> Vec3 {
    let co = |i: usize| 2 * i as i32 - (n as i32 - 1);
    let m = n as i32 - 1;
    match f {
        U => [co(c), m, co(r)],
        R => [m, -co(r), -co(c)],
        F => [co(c), -co(r), m],
        D => [co(c), -m, -co(r)],
        L => [-m, -co(r), co(c)],
        _ => [-co(c), -co(r), -m],
    }
}

pub fn assert_size(n: usize) {
    assert!(
        (MIN_SIZE..=MAX_SIZE).contains(&n),
        "큐브 크기는 {MIN_SIZE}~{MAX_SIZE}: {n}"
    );
}

fn build(n: usize) -> Topology {
    let span = 2 * n as i32 + 1;
    let cells = (span * span * span) as usize;
    let mut topo = Topology {
        n,
        sticker_count: 6 * n * n,
        stickers: Vec::with_capacity(6 * n * n),
        pieces: Vec::new(),
        span,
        piece_index: vec![-1; cells],
        sticker_index: vec![-1; cells * 6],
    };
    for f in 0..6 {
        for r in 0..n {
            for c in 0..n {
                let pos = piece_position(n, f, r, c);
                let pk = topo.pos_key(pos).unwrap();
                let piece = if topo.piece_index[pk] >= 0 {
                    topo.piece_index[pk] as usize
                } else {
                    topo.piece_index[pk] = topo.pieces.len() as i32;
                    topo.pieces.push(Piece {
                        position: pos,
                        stickers: Vec::new(),
                        kind: PieceKind::Corner,
                    });
                    topo.pieces.len() - 1
                };
                let id = topo.stickers.len();
                topo.pieces[piece].stickers.push(id);
                topo.sticker_index[pk * 6 + f] = id as i32;
                topo.stickers.push(Sticker {
                    piece,
                    face: f,
                    row: r,
                    col: c,
                    normal: FACE_NORMALS[f],
                    up: FACE_UPS[f],
                });
            }
        }
    }
    for p in &mut topo.pieces {
        let zeros = p.position.iter().filter(|&&v| v == 0).count();
        p.kind = match p.stickers.len() {
            3 => PieceKind::Corner,
            2 if zeros == 1 => PieceKind::Edge,
            2 => PieceKind::Wing,
            _ if zeros == 2 => PieceKind::Center,
            _ => PieceKind::InnerCenter,
        };
    }
    topo
}

/// 크기별 생김새(한 번 만들어 둔다)
pub fn cube_topology(n: usize) -> &'static Topology {
    assert_size(n);
    static CACHE: OnceLock<Vec<Topology>> = OnceLock::new();
    &CACHE.get_or_init(|| (MIN_SIZE..=MAX_SIZE).map(build).collect())[n - MIN_SIZE]
}
