//! 해법기(`packages/cube-solver`): 조각 표현, 2×2 거리표, 3×3 2단계 해법. 섞기 만들기가 쓴다.
//!
//! 표는 처음 부를 때 만든다(3×3 표 약 4MB, 2×2 거리표 약 3.6MB).

pub mod cubie;
pub mod perm;
pub mod pocket;
pub mod two_phase;

/// 18가지 바깥 면 수 번호(면 × 3 + 돌린 횟수 - 1, 면 순서 U R F D L B) → WCA 표기
pub fn move_name(m: u8) -> String {
    let face = crate::topology::FACE_NAMES[(m / 3) as usize];
    format!("{face}{}", ["", "2", "'"][(m % 3) as usize])
}

/// 표기를 거꾸로: 순서를 뒤집고 방향을 바꾼다(`R U'` → `U R'`). `packages/cube-solver` `invertAlgorithm`
pub fn invert_algorithm(text: &str) -> String {
    text.split_whitespace()
        .rev()
        .map(|t| {
            if let Some(s) = t.strip_suffix("2'") {
                format!("{s}2")
            } else if t.ends_with('2') {
                t.to_string()
            } else if let Some(s) = t.strip_suffix('\'') {
                s.to_string()
            } else {
                format!("{t}'")
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
