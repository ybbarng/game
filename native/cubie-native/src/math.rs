//! 그리기에 쓰는 작은 행렬 셈(열 우선 4×4, WGSL과 같은 배치). 의존을 두지 않으려고 직접 쓴다.

pub type Mat4 = [f32; 16];
pub type Vec3 = [f32; 3];

pub const IDENTITY: Mat4 = [
    1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
];

/// a·b(b를 먼저 적용)
pub fn mul(a: &Mat4, b: &Mat4) -> Mat4 {
    let mut out = [0.0; 16];
    for c in 0..4 {
        for r in 0..4 {
            let mut s = 0.0;
            for k in 0..4 {
                s += a[k * 4 + r] * b[c * 4 + k];
            }
            out[c * 4 + r] = s;
        }
    }
    out
}

pub fn translation(v: Vec3) -> Mat4 {
    let mut m = IDENTITY;
    m[12] = v[0];
    m[13] = v[1];
    m[14] = v[2];
    m
}

/// 축(0 x·1 y·2 z) 둘레로 오른손 방향 `angle` 라디안
pub fn rotation(axis: usize, angle: f32) -> Mat4 {
    let (s, c) = angle.sin_cos();
    let mut m = IDENTITY;
    let (i, j) = match axis {
        0 => (1, 2),
        1 => (2, 0),
        _ => (0, 1),
    };
    // 열 우선: m[col*4+row]
    m[i * 4 + i] = c;
    m[j * 4 + i] = -s;
    m[i * 4 + j] = s;
    m[j * 4 + j] = c;
    m
}

/// 점을 옮긴다(w = 1)
pub fn transform_point(m: &Mat4, p: Vec3) -> Vec3 {
    let w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    [
        (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
        (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
        (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
    ]
}

/// 방향을 돌린다(w = 0)
pub fn transform_dir(m: &Mat4, v: Vec3) -> Vec3 {
    [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
    ]
}

pub fn sub(a: Vec3, b: Vec3) -> Vec3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

pub fn dot(a: Vec3, b: Vec3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

pub fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

pub fn normalize(v: Vec3) -> Vec3 {
    let l = dot(v, v).sqrt();
    if l == 0.0 {
        v
    } else {
        [v[0] / l, v[1] / l, v[2] / l]
    }
}

/// 원근 투영(세로 시야각 `fovy` 라디안, 깊이 0..1)
pub fn perspective(fovy: f32, aspect: f32, near: f32, far: f32) -> Mat4 {
    let f = 1.0 / (fovy / 2.0).tan();
    let mut m = [0.0; 16];
    m[0] = f / aspect;
    m[5] = f;
    m[10] = far / (near - far);
    m[11] = -1.0;
    m[14] = near * far / (near - far);
    m
}

/// 눈 자리에서 목표를 보는 보기 행렬(위 +y)
pub fn look_at(eye: Vec3, target: Vec3) -> Mat4 {
    let f = normalize(sub(target, eye));
    let s = normalize(cross(f, [0.0, 1.0, 0.0]));
    let u = cross(s, f);
    [
        s[0],
        u[0],
        -f[0],
        0.0,
        s[1],
        u[1],
        -f[1],
        0.0,
        s[2],
        u[2],
        -f[2],
        0.0,
        -dot(s, eye),
        -dot(u, eye),
        dot(f, eye),
        1.0,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: Vec3, b: Vec3) -> bool {
        (0..3).all(|i| (a[i] - b[i]).abs() < 1e-5)
    }

    #[test]
    fn quarter_turn_matches_core_direction() {
        // 코어의 x축 시계 90°(R)는 (x, y, z) → (x, z, -y): 오른손 방향 -90°
        let m = rotation(0, -std::f32::consts::FRAC_PI_2);
        assert!(close(
            transform_point(&m, [1.0, 2.0, 3.0]),
            [1.0, 3.0, -2.0]
        ));
        // y축 시계(U): (x, y, z) → (-z, y, x)
        let m = rotation(1, -std::f32::consts::FRAC_PI_2);
        assert!(close(
            transform_point(&m, [1.0, 2.0, 3.0]),
            [-3.0, 2.0, 1.0]
        ));
        // z축 시계(F): (x, y, z) → (y, -x, z)
        let m = rotation(2, -std::f32::consts::FRAC_PI_2);
        assert!(close(
            transform_point(&m, [1.0, 2.0, 3.0]),
            [2.0, -1.0, 3.0]
        ));
    }

    #[test]
    fn camera_looks_at_origin() {
        let v = look_at([0.0, 0.0, 10.0], [0.0, 0.0, 0.0]);
        assert!(close(
            transform_point(&v, [0.0, 0.0, 0.0]),
            [0.0, 0.0, -10.0]
        ));
    }
}
