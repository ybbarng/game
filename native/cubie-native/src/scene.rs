//! 큐브 장면(그리기 장치와 상관없는 부분): 조각 몸통·스티커의 모양, 상태와 돌리는 중인 수에서 인스턴스(자리·색) 만들기,
//! 카메라. 생김새는 사이트 `apps/web/src/cube/view/cube-view.ts`의 값을 따른다(조각 0.97, 모서리 0.1, 스티커 0.8,
//! 보는 각 yaw 32°·pitch 26°, 세로 시야 30°, 큐브를 감싸는 공이 짧은 변에 들어가는 거리).

use crate::math::{self, Mat4, Vec3};
use cube_core::state::{face_colors, State};
use cube_core::topology::cube_topology;
use cube_core::CubeMove;

/// 조각 한 변(간격 1)
pub const CUBIE: f32 = 0.97;
pub const CUBIE_RADIUS: f32 = 0.1;
/// 스티커가 조각 면에서 떠 있는 높이
pub const LIFT: f32 = 0.004;
pub const STICKER: f32 = 0.8;
pub const STICKER_RADIUS: f32 = 0.1;

pub const DEFAULT_YAW_DEG: f32 = 32.0;
pub const DEFAULT_PITCH_DEG: f32 = 26.0;
pub const FOV_DEG: f32 = 30.0;

/// 대회 표준 색(U R F D L B 차례, 사이트 `DEFAULT_COLORS`)
pub const DEFAULT_COLORS: [u32; 6] = [0xffffff, 0xc8102e, 0x009b48, 0xffd500, 0xff5800, 0x0046ad];
pub const BODY_COLOR: u32 = 0x0d0d0f;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vertex {
    pub pos: [f32; 3],
    pub normal: [f32; 3],
}

/// 인스턴스 하나: 모델 행렬과 색(rgb는 sRGB 0..1, a는 광택 세기)
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Instance {
    pub model: Mat4,
    pub color: [f32; 4],
}

fn rgb(hex: u32, shine: f32) -> [f32; 4] {
    [
        ((hex >> 16) & 0xff) as f32 / 255.0,
        ((hex >> 8) & 0xff) as f32 / 255.0,
        (hex & 0xff) as f32 / 255.0,
        shine,
    ]
}

/// 모서리가 둥근 상자(가운데가 원점, 한 변 `size`, 모서리 반지름 `radius`). 면마다 격자를 만들어 둥근 자리로 민다
pub fn rounded_box(size: f32, radius: f32, segments: usize) -> (Vec<Vertex>, Vec<u16>) {
    let h = size / 2.0;
    let inner = h - radius;
    // 한 축의 격자 값: 바깥 모서리 둥근 띠는 segments칸, 가운데 평평한 곳은 한 칸
    let mut ts = vec![];
    for i in 0..=segments {
        ts.push(-h + radius * i as f32 / segments as f32);
    }
    for i in 0..=segments {
        ts.push(inner + radius * i as f32 / segments as f32);
    }
    let k = ts.len();
    let mut verts = vec![];
    let mut idx = vec![];
    // 면: (법선 축, 부호, u 축, v 축)
    for (axis, sign) in [
        (0, 1.0),
        (0, -1.0),
        (1, 1.0),
        (1, -1.0),
        (2, 1.0),
        (2, -1.0),
    ] {
        let (ua, va) = ((axis + 1) % 3, (axis + 2) % 3);
        let base = verts.len() as u16;
        for &v in &ts {
            for &u in &ts {
                let mut p = [0.0f32; 3];
                p[axis] = sign * h;
                p[ua] = u;
                p[va] = v;
                let core = p.map(|c| c.clamp(-inner, inner));
                let d = math::sub(p, core);
                let n = if math::dot(d, d) < 1e-12 {
                    let mut n = [0.0; 3];
                    n[axis] = sign;
                    n
                } else {
                    math::normalize(d)
                };
                let pos = [
                    core[0] + n[0] * radius,
                    core[1] + n[1] * radius,
                    core[2] + n[2] * radius,
                ];
                verts.push(Vertex { pos, normal: n });
            }
        }
        for j in 0..k - 1 {
            for i in 0..k - 1 {
                let a = base + (j * k + i) as u16;
                let b = a + 1;
                let c = a + k as u16;
                let d = c + 1;
                idx.extend_from_slice(&[a, b, d, a, d, c]);
            }
        }
    }
    (verts, idx)
}

/// 스티커: +z를 향한 둥근 사각형(조각 면 위 `LIFT`)
pub fn sticker_mesh(size: f32, radius: f32, corner_steps: usize) -> (Vec<Vertex>, Vec<u16>) {
    let z = CUBIE / 2.0 + LIFT;
    let h = size / 2.0 - radius;
    let normal = [0.0, 0.0, 1.0];
    let mut verts = vec![Vertex {
        pos: [0.0, 0.0, z],
        normal,
    }];
    for (cx, cy, start) in [
        (h, h, 0.0f32),
        (-h, h, 90.0),
        (-h, -h, 180.0),
        (h, -h, 270.0),
    ] {
        for s in 0..=corner_steps {
            let a = (start + 90.0 * s as f32 / corner_steps as f32).to_radians();
            verts.push(Vertex {
                pos: [cx + radius * a.cos(), cy + radius * a.sin(), z],
                normal,
            });
        }
    }
    let ring = verts.len() as u16 - 1;
    let mut idx = vec![];
    for i in 0..ring {
        idx.extend_from_slice(&[0, 1 + i, 1 + (i + 1) % ring]);
    }
    (verts, idx)
}

/// +z를 법선 `n`(축 하나의 ±1)으로 돌리는 행렬
fn face_rotation(n: [i32; 3]) -> Mat4 {
    use std::f32::consts::{FRAC_PI_2, PI};
    match n {
        [0, 0, 1] => math::IDENTITY,
        [0, 0, -1] => math::rotation(1, PI),
        [1, 0, 0] => math::rotation(1, FRAC_PI_2),
        [-1, 0, 0] => math::rotation(1, -FRAC_PI_2),
        [0, 1, 0] => math::rotation(0, -FRAC_PI_2),
        _ => math::rotation(0, FRAC_PI_2),
    }
}

/// 돌리는 중인 수의 각(라디안, 오른손 방향). 시계 90°는 -90°, 반대(turns 3)는 +90°
pub fn move_angle(m: &CubeMove, progress: f32) -> f32 {
    let quarter = match m.turns {
        1 => -1.0,
        2 => -2.0,
        _ => 1.0,
    };
    quarter * std::f32::consts::FRAC_PI_2 * progress
}

/// 상태와 돌리는 중인 수(진행 0..1)에서 몸통·스티커 인스턴스를 만든다. CPU로 셈한 기준이다: 그리개는 [`home_instances`]를
/// 한 번 올리고 셰이더가 같은 셈을 하며, 둘이 같은지는 시험(`render::tests`)이 본다
pub fn instances(
    n: usize,
    state: &State,
    turning: Option<(CubeMove, f32)>,
) -> (Vec<Instance>, Vec<Instance>) {
    let topo = cube_topology(n);
    let colors = face_colors(n, state);
    let piece_matrix = |position: [i32; 3]| -> Mat4 {
        let center = position.map(|c| c as f32 / 2.0);
        let t = math::translation(center);
        match turning {
            Some((m, p)) => {
                let layer = topo.layer_of(position[m.axis as usize]);
                if layer >= m.from && layer <= m.to {
                    math::mul(&math::rotation(m.axis as usize, move_angle(&m, p)), &t)
                } else {
                    t
                }
            }
            None => t,
        }
    };
    let body_color = rgb(BODY_COLOR, 0.25);
    let bodies = topo
        .pieces
        .iter()
        .map(|p| Instance {
            model: piece_matrix(p.position),
            color: body_color,
        })
        .collect();
    let stickers = topo
        .stickers
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let piece = &topo.pieces[s.piece];
            Instance {
                model: math::mul(&piece_matrix(piece.position), &face_rotation(s.normal)),
                color: rgb(DEFAULT_COLORS[colors[i] as usize], 0.6),
            }
        })
        .collect();
    (bodies, stickers)
}

/// 그리개에 한 번만 올리는 인스턴스(맞춘 자리): 모델 행렬과 (조각 가운데 x·y·z, 스티커 자리 번호, 몸통은 -1).
/// 돌리는 층과 색은 장마다 셰이더가 immediates로 받아 계산한다([`instances`]와 같은 결과, 시험으로 맞춘다)
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HomeInstance {
    pub model: Mat4,
    pub extra: [f32; 4],
}

pub fn home_instances(n: usize) -> (Vec<HomeInstance>, Vec<HomeInstance>) {
    let topo = cube_topology(n);
    let center = |p: [i32; 3]| p.map(|c| c as f32 / 2.0);
    let bodies = topo
        .pieces
        .iter()
        .map(|p| {
            let c = center(p.position);
            HomeInstance {
                model: math::translation(c),
                extra: [c[0], c[1], c[2], -1.0],
            }
        })
        .collect();
    let stickers = topo
        .stickers
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let c = center(topo.pieces[s.piece].position);
            HomeInstance {
                model: math::mul(&math::translation(c), &face_rotation(s.normal)),
                extra: [c[0], c[1], c[2], i as f32],
            }
        })
        .collect();
    (bodies, stickers)
}

/// 스티커 자리마다 지금 색 번호를 한 바이트씩, 네 개씩 u32로(셰이더 `color_index`)
pub fn pack_colors(n: usize, state: &State, out: &mut [u32]) {
    out.fill(0);
    for (i, c) in face_colors(n, state).into_iter().enumerate() {
        out[i / 4] |= u32::from(c) << ((i % 4) * 8);
    }
}

/// 셰이더 색표: 면 여섯(U R F D L B)과 몸통. rgb는 sRGB, a는 광택
pub fn palette() -> [[f32; 4]; 7] {
    let mut p = [[0.0; 4]; 7];
    for (i, hex) in DEFAULT_COLORS.iter().enumerate() {
        p[i] = rgb(*hex, 0.6);
    }
    p[6] = rgb(BODY_COLOR, 0.25);
    p
}

/// 카메라: (보기·투영 행렬, 눈 자리). 큐브를 감싸는 공이 화면 짧은 쪽에 들어가도록 거리를 잡는다
pub fn camera(n: usize, aspect: f32) -> (Mat4, Vec3) {
    let yaw = DEFAULT_YAW_DEG.to_radians();
    let pitch = DEFAULT_PITCH_DEG.to_radians();
    let vfov = FOV_DEG.to_radians();
    let hfov = 2.0 * ((vfov / 2.0).tan() * aspect).atan();
    let radius = n as f32 * 3f32.sqrt() / 2.0;
    let dist = radius / (vfov.min(hfov) / 2.0).sin() * 1.02;
    let eye = [
        dist * pitch.cos() * yaw.sin(),
        dist * pitch.sin(),
        dist * pitch.cos() * yaw.cos(),
    ];
    let view = math::look_at(eye, [0.0, 0.0, 0.0]);
    let proj = math::perspective(vfov, aspect, 0.1, 200.0);
    (math::mul(&proj, &view), eye)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cube_core::state::apply_move;
    use cube_core::{parse_moves, solved_cube};

    /// 스티커 인스턴스의 (가운데 자리, 법선, 색)을 둘째 자리 반올림으로
    fn placed(inst: &[Instance]) -> Vec<([i32; 3], [i32; 3], [u32; 3])> {
        let mut v: Vec<_> = inst
            .iter()
            .map(|i| {
                let c = math::transform_point(&i.model, [0.0, 0.0, 0.0]);
                let nrm = math::transform_dir(&i.model, [0.0, 0.0, 1.0]);
                (
                    c.map(|x| (x * 2.0).round() as i32),
                    nrm.map(|x| x.round() as i32),
                    [0, 1, 2].map(|k| (i.color[k] * 255.0).round() as u32),
                )
            })
            .collect();
        v.sort();
        v
    }

    /// 돌리는 연출이 끝난 자리(진행 1)가 코어로 수를 둔 뒤의 상태와 같다: 그리는 방향이 코어의 수와 맞는다
    #[test]
    fn finished_turn_matches_core_state() {
        for n in [2, 3, 4, 5] {
            let start = parse_moves(n, "R U F' D2 L B' x y")
                .unwrap()
                .iter()
                .fold(solved_cube(n), |s, m| apply_move(n, &s, m));
            for text in ["R", "U'", "F2", "L", "D'", "B", "x", "y'", "z2"] {
                let m = parse_moves(n, text).unwrap()[0];
                let (_, during) = instances(n, &start, Some((m, 1.0)));
                let (_, after) = instances(n, &apply_move(n, &start, &m), None);
                assert_eq!(placed(&during), placed(&after), "{n}×{n} {text}");
            }
        }
    }

    #[test]
    fn meshes_have_sane_shape() {
        let (v, i) = rounded_box(CUBIE, CUBIE_RADIUS, 3);
        assert!(v
            .iter()
            .all(|v| v.pos.iter().all(|c| c.abs() <= CUBIE / 2.0 + 1e-5)));
        assert_eq!(i.len() % 3, 0);
        let (v, i) = sticker_mesh(STICKER, STICKER_RADIUS, 4);
        assert_eq!(i.len(), (v.len() - 1) * 3);
    }
}
