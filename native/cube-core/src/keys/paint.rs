//! 키 칸의 면 색(사이트 `keys/key-colors.ts` `keyPaint`·`calmTint`·`calmLine`·`stripeImage`·`stripedColor`,
//! 그리기는 `components/KeyPaint.tsx`). 단축키 표(F1)가 처음 방향(흰 위·초록 앞)으로 칠하는 값이다. 사이트와 같은지는
//! 공통 시험 자료 `fixtures/keypaint.json`으로 본다(docs/52 5-7).
//!
//! - 면 돌리기(넓게·안쪽 층 포함): 칸 바탕에 그 면 색을 옅게([`calm_tint`]). 선은 없다
//! - x·y·z: 칸 아래 점선, M·E·S: 칸 아래 가운데 짧은 선. 색은 같은 쪽으로 도는 면 색을 빌린다(x = R, y = U, z = F,
//!   M = L, E = D, S = F), 선 색은 [`calm_line`]
//! - 반대 방향(′)은 색을 바꾸지 않고 바탕을 더 옅게, 선을 흐리게
//! - 색약 친화·높은 대비 배색은 주황(L 면 색) 칸 바탕에 옅은 사선 무늬([`striped_color`]·[`stripe_tint`])

use super::actions::{canonical_notation, notation_to_move};

/// 칸 하나의 칠하기
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyPaint {
    /// 면 돌리기: 칸 바탕에 그 면 색(면 번호 U R F D L B)
    Face { color: u8, prime: bool, wide: bool },
    /// 큐브 돌리기(`whole`)·가운데 층: 칸 아래 선에 빌린 면 색
    Sweep { color: u8, prime: bool, whole: bool },
}

impl KeyPaint {
    pub fn color(self) -> u8 {
        match self {
            KeyPaint::Face { color, .. } | KeyPaint::Sweep { color, .. } => color,
        }
    }
    pub fn prime(self) -> bool {
        match self {
            KeyPaint::Face { prime, .. } | KeyPaint::Sweep { prime, .. } => prime,
        }
    }
}

fn face_of(letter: char) -> Option<u8> {
    Some(match letter {
        'U' => 0,
        'R' => 1,
        'F' => 2,
        'D' => 3,
        'L' => 4,
        'B' => 5,
        _ => return None,
    })
}

/// 큐브 돌리기·가운데 층이 빌리는 면(사이트 `SWEEP_FACE`)
fn sweep_face(letter: char) -> Option<u8> {
    Some(match letter {
        'x' => 1,
        'y' => 0,
        'z' => 2,
        'M' => 4,
        'E' => 3,
        'S' => 2,
        _ => return None,
    })
}

/// 동작 하나(표기)의 칠하기, 처음 방향 기준(사이트 `keyPaint(n, HOME_ORIENT, action)`). 수가 아니면 `None`
pub fn key_paint(n: usize, action: &str) -> Option<KeyPaint> {
    notation_to_move(n, action)?;
    let name = canonical_notation(n, action);
    let prime = name.ends_with('\'');
    let body = name.trim_start_matches(|c: char| c.is_ascii_digit());
    let mut chars = body.chars();
    let first = chars.next()?;
    let digits = body.len() != name.len();
    if let Some(color) = face_of(first) {
        return Some(KeyPaint::Face {
            color,
            prime,
            wide: chars.next() == Some('w'),
        });
    }
    if digits {
        return None;
    }
    // 소문자 넓게(r = Rw)
    if "rludfb".contains(first) {
        return face_of(first.to_ascii_uppercase()).map(|color| KeyPaint::Face {
            color,
            prime,
            wide: true,
        });
    }
    sweep_face(first).map(|color| KeyPaint::Sweep {
        color,
        prime,
        whole: matches!(first, 'x' | 'y' | 'z'),
    })
}

/// 칸 색을 섞는 바탕(사이트 `KEY_TONE.page`, neutral-900)
pub const PAGE: u32 = 0x171717;

/// 두 색 섞기: `rgb`를 `alpha`만큼, 나머지는 [`PAGE`](사이트 `mixRgb`, 채널마다 반올림)
pub fn mix_rgb(rgb: u32, alpha: f64) -> u32 {
    let ch = |shift: u32| -> u32 {
        let a = f64::from((rgb >> shift) & 255);
        let b = f64::from((PAGE >> shift) & 255);
        // JS Math.round(x)는 0.5를 위로 올린다(음수 없음)
        (a * alpha + b * (1.0 - alpha) + 0.5).floor() as u32
    };
    (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/// 면 돌리기 칸 바탕(사이트 `calmTint`, `KEY_CALM.tint` 0.16·반대 0.08)
pub fn calm_tint(rgb: u32, prime: bool) -> u32 {
    mix_rgb(rgb, if prime { 0.08 } else { 0.16 })
}

/// x·y·z·M·E·S 선 색(사이트 `calmLine`, 0.7). 반대 방향은 그리는 쪽이 불투명도 [`PRIME_MARK`]로 흐리게
pub fn calm_line(rgb: u32) -> u32 {
    mix_rgb(rgb, 0.7)
}

/// 반대 방향 선의 불투명도(사이트 `KEY_CALM.primeMark`)
pub const PRIME_MARK: f64 = 0.6;

/// 사선 무늬 색(사이트 `stripeImage`, 0.34·반대 0.2). 2px 선·5px 틈, 135°
pub fn stripe_tint(rgb: u32, prime: bool) -> u32 {
    mix_rgb(rgb, if prime { 0.2 } else { 0.34 })
}

/// 그 배색에서 이 색(면 번호)의 칸에 사선 무늬를 넣나(사이트 `KEY_STRIPE`: 색약 친화·높은 대비의 주황)
pub fn striped_color(scheme: &str, color: u8) -> bool {
    matches!(scheme, "colorblind" | "highContrast") && color == 4
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn faces_and_sweeps() {
        assert_eq!(
            key_paint(3, "R'"),
            Some(KeyPaint::Face {
                color: 1,
                prime: true,
                wide: false
            })
        );
        // 3×3의 2L′은 M′(가운데 층, 빌린 L 면 색)
        assert_eq!(
            key_paint(3, "2L'"),
            Some(KeyPaint::Sweep {
                color: 4,
                prime: true,
                whole: false
            })
        );
        assert_eq!(
            key_paint(4, "x"),
            Some(KeyPaint::Sweep {
                color: 1,
                prime: false,
                whole: true
            })
        );
        assert_eq!(key_paint(3, "undo"), None);
        // 같은 섞기 비율이면 사이트 mixRgb와 같은 반올림
        assert_eq!(calm_tint(0xffffff, false), 0x3c3c3c);
    }
}
