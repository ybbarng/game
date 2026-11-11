//! 표기 읽기·쓰기(`packages/cube-engine/src/notation.ts`, `move.ts`의 `CubeMove`).
//!
//! 읽기: WCA 표기 `R U2 F' Rw 3Rw2 x y' z2`, 안쪽 한 층 `2R`, 여러 안쪽 층 `2-3Rw`, 소문자 `r u`(= Rw, `3r` = 3Rw),
//! 가운데 층 `M E S`(홀수 크기만), 큐브 돌리기 `x y z`. 괄호는 무시한다. 반대 표시는 `'`와 `’` 모두 받는다.
//! 돌리는 양 `R3`(= R')·`R2'`도 받는다.

use crate::topology::assert_size;

/// 축 번호: 0 = x(R 쪽), 1 = y(U 쪽), 2 = z(F 쪽)
pub type Axis = u8;
pub const AXIS_NAMES: [&str; 3] = ["x", "y", "z"];

/// n×n 큐브의 수 하나. 축을 따라 `from`~`to`층(1 = R·U·F 쪽 바깥층)을, 그 축의 + 쪽에서 볼 때 시계 방향으로 90° × `turns`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct CubeMove {
    pub axis: Axis,
    pub from: usize,
    pub to: usize,
    pub turns: u8,
}

impl CubeMove {
    pub fn is_valid(&self, n: usize) -> bool {
        self.axis < 3
            && self.from >= 1
            && self.from <= self.to
            && self.to <= n
            && (1..=3).contains(&self.turns)
    }

    /// 큐브 전체를 돌리는 수(x·y·z)인가
    pub fn is_rotation(&self, n: usize) -> bool {
        self.from == 1 && self.to == n
    }

    pub fn inverse(&self) -> CubeMove {
        CubeMove {
            turns: 4 - self.turns,
            ..*self
        }
    }
}

/// 되돌리는 수열(차례를 뒤집고 방향을 반대로)
pub fn invert_moves(moves: &[CubeMove]) -> Vec<CubeMove> {
    moves.iter().rev().map(CubeMove::inverse).collect()
}

/// 잘못된 표기. `index`는 잘못된 토막이 시작하는 글자 위치(0부터, 사이트처럼 UTF-16 단위)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotationError {
    pub reason: String,
    pub index: usize,
    pub token: String,
}

impl NotationError {
    /// 사이트 `NotationError.message`와 같은 글
    pub fn message(&self) -> String {
        format!(
            "{} ({}번째 글자 「{}」)",
            self.reason,
            self.index + 1,
            self.token
        )
    }
}

impl std::fmt::Display for NotationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message())
    }
}

impl std::error::Error for NotationError {}

struct FaceSpec {
    axis: Axis,
    positive: bool,
}

fn face_spec(letter: char) -> Option<FaceSpec> {
    let (axis, positive) = match letter {
        'R' => (0, true),
        'L' => (0, false),
        'U' => (1, true),
        'D' => (1, false),
        'F' => (2, true),
        'B' => (2, false),
        _ => return None,
    };
    Some(FaceSpec { axis, positive })
}

/// 가운데 층: M은 L, E는 D, S는 F와 같은 방향
fn slice_spec(letter: char) -> Option<FaceSpec> {
    let (axis, positive) = match letter {
        'M' => (0, false),
        'E' => (1, false),
        'S' => (2, true),
        _ => return None,
    };
    Some(FaceSpec { axis, positive })
}

fn to_axis_move(n: usize, spec: &FaceSpec, p: usize, q: usize, turns: u8) -> CubeMove {
    if spec.positive {
        CubeMove {
            axis: spec.axis,
            from: p,
            to: q,
            turns,
        }
    } else {
        CubeMove {
            axis: spec.axis,
            from: n + 1 - q,
            to: n + 1 - p,
            turns: 4 - turns,
        }
    }
}

/// 토막 하나를 사이트 정규식 `^(?:(\d+)(?:-(\d+))?)?([RLUDFBrludfbMESxyz])(w?)(\d?)(['’]?)$`처럼 나눈다
struct Parts {
    a: Option<u64>,
    b: Option<u64>,
    letter: char,
    w: bool,
    amount: Option<char>,
    prime: bool,
}

fn digits_value(s: &str) -> u64 {
    // 아주 긴 숫자도 범위 밖이라는 판정만 같으면 된다
    s.bytes().fold(0u64, |v, d| {
        v.saturating_mul(10).saturating_add(u64::from(d - b'0'))
    })
}

fn split_token(token: &str) -> Option<Parts> {
    let chars: Vec<char> = token.chars().collect();
    let mut i = 0;
    let take_digits = |i: &mut usize| -> Option<String> {
        let start = *i;
        while *i < chars.len() && chars[*i].is_ascii_digit() {
            *i += 1;
        }
        (*i > start).then(|| chars[start..*i].iter().collect())
    };
    let a = take_digits(&mut i);
    let mut b = None;
    if a.is_some() && i + 1 < chars.len() && chars[i] == '-' && chars[i + 1].is_ascii_digit() {
        i += 1;
        b = take_digits(&mut i);
    }
    let letter = *chars.get(i)?;
    if !"RLUDFBrludfbMESxyz".contains(letter) {
        return None;
    }
    i += 1;
    let w = chars.get(i) == Some(&'w');
    if w {
        i += 1;
    }
    let amount = chars.get(i).copied().filter(char::is_ascii_digit);
    if amount.is_some() {
        i += 1;
    }
    let prime = matches!(chars.get(i), Some('\'') | Some('’'));
    if prime {
        i += 1;
    }
    if i != chars.len() {
        return None;
    }
    Some(Parts {
        a: a.as_deref().map(digits_value),
        b: b.as_deref().map(digits_value),
        letter,
        w,
        amount,
        prime,
    })
}

fn parse_token(n: usize, token: &str, index: usize) -> Result<CubeMove, NotationError> {
    let fail = |why: &str| NotationError {
        reason: why.to_string(),
        index,
        token: token.to_string(),
    };
    let parts = split_token(token).ok_or_else(|| fail("알 수 없는 표기"))?;

    let mut turns: u8 = match parts.amount {
        Some('2') => 2,
        Some('3') => 3,
        None | Some('1') => 1,
        Some(_) => return Err(fail("돌리는 양은 1·2·3만")),
    };
    if parts.prime {
        turns = if turns == 2 { 2 } else { 4 - turns };
    }

    let letter = parts.letter;
    if matches!(letter, 'x' | 'y' | 'z') {
        if parts.a.is_some() || parts.w {
            return Err(fail("큐브 돌리기에는 층 번호·w를 붙이지 않는다"));
        }
        return Ok(CubeMove {
            axis: (letter as u8) - b'x',
            from: 1,
            to: n,
            turns,
        });
    }

    if let Some(slice) = slice_spec(letter) {
        if parts.a.is_some() || parts.w {
            return Err(fail("가운데 층에는 층 번호·w를 붙이지 않는다"));
        }
        if n % 2 == 0 {
            return Err(fail(&format!("{n}×{n}에는 정가운데 층이 없다")));
        }
        let mid = (n + 1) / 2;
        return Ok(to_axis_move(n, &slice, mid, mid, turns));
    }

    let lower = letter.is_ascii_lowercase();
    let spec = face_spec(letter.to_ascii_uppercase()).ok_or_else(|| fail("알 수 없는 면"))?;
    if lower && parts.w {
        return Err(fail("소문자 면에는 w를 붙이지 않는다"));
    }
    let wide = lower || parts.w;

    let (p, q) = if let Some(b) = parts.b {
        let a = parts.a.unwrap_or(0);
        if a > b {
            return Err(fail("층 범위는 작은 수부터"));
        }
        (a, b)
    } else if wide {
        (1, parts.a.unwrap_or(2))
    } else {
        let p = parts.a.unwrap_or(1);
        (p, p)
    };
    if p < 1 || q > n as u64 {
        return Err(fail(&format!("{n}×{n}에 없는 층")));
    }
    Ok(to_axis_move(n, &spec, p as usize, q as usize, turns))
}

/// 표기 → 수 목록. 잘못된 표기는 `NotationError`(위치 포함)
pub fn parse_moves(n: usize, text: &str) -> Result<Vec<CubeMove>, NotationError> {
    assert_size(n);
    let mut moves = Vec::new();
    // 토막: 빈칸·괄호가 아닌 글자의 이어짐. 위치는 UTF-16 단위로 센다(사이트 문자열 위치와 같게)
    let mut utf16 = 0;
    let mut start: Option<(usize, usize)> = None;
    let mut push = |text: &str, from: usize, to: usize, at: usize| -> Result<(), NotationError> {
        moves.push(parse_token(n, &text[from..to], at)?);
        Ok(())
    };
    for (byte, ch) in text.char_indices() {
        // 자바스크립트 정규식 `\s`: 유니코드 빈칸에서 U+0085를 빼고 U+FEFF를 더한 것
        let sep =
            (ch.is_whitespace() && ch != '\u{85}') || ch == '\u{feff}' || ch == '(' || ch == ')';
        if sep {
            if let Some((from, at)) = start.take() {
                push(text, from, byte, at)?;
            }
        } else if start.is_none() {
            start = Some((byte, utf16));
        }
        utf16 += ch.len_utf16();
    }
    if let Some((from, at)) = start {
        push(text, from, text.len(), at)?;
    }
    Ok(moves)
}

const SUFFIX: [&str; 4] = ["", "", "2", "'"];
const POS_FACE: [&str; 3] = ["R", "U", "F"];
const NEG_FACE: [&str; 3] = ["L", "D", "B"];
const SLICE_NAME: [&str; 3] = ["M", "E", "S"];

fn wide_name(face: &str, depth: usize) -> String {
    match depth {
        1 => face.to_string(),
        2 => format!("{face}w"),
        _ => format!("{depth}{face}w"),
    }
}

/// 수 하나 → 표기
pub fn format_move(n: usize, m: &CubeMove) -> String {
    let a = m.axis as usize;
    let t = m.turns as usize;
    let inv = 4 - t;
    if m.from == 1 && m.to == n {
        return format!("{}{}", AXIS_NAMES[a], SUFFIX[t]);
    }
    if m.from == 1 {
        return format!("{}{}", wide_name(POS_FACE[a], m.to), SUFFIX[t]);
    }
    if m.to == n {
        return format!("{}{}", wide_name(NEG_FACE[a], n + 1 - m.from), SUFFIX[inv]);
    }
    if m.from == m.to {
        let l = m.from;
        if n % 2 == 1 && l == (n + 1) / 2 {
            // M·E는 반대쪽(L·D) 방향, S는 F 방향
            return format!("{}{}", SLICE_NAME[a], SUFFIX[if a == 2 { t } else { inv }]);
        }
        if l <= n + 1 - l {
            return format!("{l}{}{}", POS_FACE[a], SUFFIX[t]);
        }
        return format!("{}{}{}", n + 1 - l, NEG_FACE[a], SUFFIX[inv]);
    }
    if m.from - 1 <= n - m.to {
        return format!("{}-{}{}w{}", m.from, m.to, POS_FACE[a], SUFFIX[t]);
    }
    format!(
        "{}-{}{}w{}",
        n + 1 - m.to,
        n + 1 - m.from,
        NEG_FACE[a],
        SUFFIX[inv]
    )
}

/// 수 목록 → 표기(빈칸으로 잇는다)
pub fn format_moves(n: usize, moves: &[CubeMove]) -> String {
    moves
        .iter()
        .map(|m| format_move(n, m))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_wca_tokens() {
        let m = parse_moves(3, "R U' (F2) M x").unwrap();
        assert_eq!(format_moves(3, &m), "R U' F2 M x");
        let e = parse_moves(4, "R M").unwrap_err();
        assert_eq!(e.index, 2);
    }
}
