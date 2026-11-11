//! 동작 이름 → 수(`apps/web/src/cube/input/actions.ts`).
//!
//! 동작 이름(배치에 그대로 적는 글):
//! - 수: WCA 표기 한 수. `R` `R'` `R2` `Rw` `3Rw'` `2R` `r` `M` `E'` `S2` `x` `y'` `z2`
//! - 다음 수 깊이: `depth:2` … `depth:7`
//! - 층 수: `layers:L-` `layers:L+` `layers:R+` `layers:R-`(큰 큐브, 왼손·오른손 키가 돌리는 바깥 층 수)
//! - 명령: `undo` `reset` `scramble` `inspectionSkip` `peekBack` `peekDown` `viewHome`

use crate::notation::CubeMove;

/// 이 프로그램이 다루는 가장 큰 큐브
pub const MAX_N: usize = 7;
pub const MIN_N: usize = 2;

/// 명령(사이트 `COMMANDS` 차례)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    Undo,
    Reset,
    Scramble,
    InspectionSkip,
    PeekBack,
    PeekDown,
    ViewHome,
}

impl Command {
    pub const ALL: [Command; 7] = [
        Command::Undo,
        Command::Reset,
        Command::Scramble,
        Command::InspectionSkip,
        Command::PeekBack,
        Command::PeekDown,
        Command::ViewHome,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Command::Undo => "undo",
            Command::Reset => "reset",
            Command::Scramble => "scramble",
            Command::InspectionSkip => "inspectionSkip",
            Command::PeekBack => "peekBack",
            Command::PeekDown => "peekDown",
            Command::ViewHome => "viewHome",
        }
    }

    pub fn from_id(id: &str) -> Option<Command> {
        Command::ALL.into_iter().find(|c| c.id() == id)
    }
}

/// 왼손(L·Lw 키) 또는 오른손(R·Rw 키)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Hand {
    Left,
    Right,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ParsedAction<'a> {
    Move(&'a str),
    Depth(usize),
    Layers { hand: Hand, delta: i32 },
    Command(Command),
}

/// `R` `3Rw'` `r` `M2` `x'` 같은 표기 한 수를 뜯은 것(사이트 `MOVE_RE`)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Token {
    /// 숫자(없으면 None, 너무 크면 usize::MAX), 면 글자(대문자), w가 붙었나
    Face(Option<usize>, u8, bool),
    /// 소문자 면 글자(대문자로 바꿔 둠)
    Lower(u8),
    /// M·E·S
    Slice(u8),
    /// x·y·z
    Rotation(u8),
}

/// 돌리는 양: 없음 1, `2` 2, `'` 3
fn split_suffix(text: &str) -> (&str, u8) {
    if let Some(head) = text.strip_suffix('2') {
        // `2`만 있는 글(숫자 접두만)은 아래에서 걸러진다
        (head, 2)
    } else if let Some(head) = text.strip_suffix('\'') {
        (head, 3)
    } else {
        (text, 1)
    }
}

fn tokenize(text: &str) -> Option<(Token, u8)> {
    let (body, turns) = split_suffix(text);
    let b = body.as_bytes();
    if b.is_empty() {
        return None;
    }
    let digits = b.iter().take_while(|c| c.is_ascii_digit()).count();
    let rest = &b[digits..];
    if digits > 0 || matches!(rest.first(), Some(b'R' | b'L' | b'U' | b'D' | b'F' | b'B')) {
        let prefix = (digits > 0).then(|| {
            body[..digits]
                .bytes()
                .try_fold(0usize, |acc, d| {
                    acc.checked_mul(10)?.checked_add(usize::from(d - b'0'))
                })
                .unwrap_or(usize::MAX)
        });
        return match rest {
            [f @ (b'R' | b'L' | b'U' | b'D' | b'F' | b'B')] => {
                Some((Token::Face(prefix, *f, false), turns))
            }
            [f @ (b'R' | b'L' | b'U' | b'D' | b'F' | b'B'), b'w'] => {
                Some((Token::Face(prefix, *f, true), turns))
            }
            _ => None,
        };
    }
    match b {
        [c @ (b'r' | b'l' | b'u' | b'd' | b'f' | b'b')] => {
            Some((Token::Lower(c.to_ascii_uppercase()), turns))
        }
        [c @ (b'M' | b'E' | b'S')] => Some((Token::Slice(*c), turns)),
        [c @ (b'x' | b'y' | b'z')] => Some((Token::Rotation(*c), turns)),
        _ => None,
    }
}

/// 면 글자 → 축(0 x·1 y·2 z)과 + 끝 면인지
fn face_axis(face: u8) -> (u8, bool) {
    match face {
        b'R' => (0, true),
        b'L' => (0, false),
        b'U' => (1, true),
        b'D' => (1, false),
        b'F' => (2, true),
        _ => (2, false), // B
    }
}

/// 면 기준 층 범위 [a, b](그 면에서부터 1..)를 계약의 수로. - 끝 면이면 층 번호와 방향을 뒤집는다
fn face_move(n: usize, face: u8, a: usize, b: usize, turns: u8) -> CubeMove {
    let (axis, plus) = face_axis(face);
    if plus {
        CubeMove {
            axis,
            from: a,
            to: b,
            turns,
        }
    } else {
        CubeMove {
            axis,
            from: n + 1 - b,
            to: n + 1 - a,
            turns: 4 - turns,
        }
    }
}

/// 표기가 수 한 개의 꼴인가(사이트 `MOVE_RE.test`)
pub fn is_move_text(text: &str) -> bool {
    tokenize(text).is_some()
}

/// 표기 한 수 → 계약의 수. 그 크기에서 뜻이 없으면 None(짝수 크기의 M, 크기보다 깊은 층 등)
pub fn notation_to_move(n: usize, text: &str) -> Option<CubeMove> {
    let (token, turns) = tokenize(text)?;
    match token {
        Token::Face(prefix, face, wide) => {
            let k = prefix.unwrap_or(if wide { 2 } else { 1 });
            if k < 1 || k > n {
                return None;
            }
            // 숫자만 붙은 `1R`은 쓰지 않는다(그냥 R)
            if prefix.is_some() && !wide && k == 1 {
                return None;
            }
            Some(if wide {
                face_move(n, face, 1, k, turns)
            } else {
                face_move(n, face, k, k, turns)
            })
        }
        Token::Lower(face) => (n >= 2).then(|| face_move(n, face, 1, 2, turns)),
        Token::Slice(s) => {
            if n < 3 || n % 2 == 0 {
                return None;
            }
            let mid = (n + 1) / 2;
            let face = match s {
                b'M' => b'L',
                b'E' => b'D',
                _ => b'F',
            };
            Some(face_move(n, face, mid, mid, turns))
        }
        Token::Rotation(r) => {
            let face = match r {
                b'x' => b'R',
                b'y' => b'U',
                _ => b'F',
            };
            Some(face_move(n, face, 1, n, turns))
        }
    }
}

pub fn parse_action(id: &str) -> Option<ParsedAction<'_>> {
    if let Some(c) = Command::from_id(id) {
        return Some(ParsedAction::Command(c));
    }
    if let Some(rest) = id.strip_prefix("layers:") {
        let hand = match rest.as_bytes() {
            [b'L', _] => Hand::Left,
            [b'R', _] => Hand::Right,
            _ => return None,
        };
        let delta = match rest.as_bytes()[1] {
            b'+' => 1,
            b'-' => -1,
            _ => return None,
        };
        return Some(ParsedAction::Layers { hand, delta });
    }
    if let Some(rest) = id.strip_prefix("depth:") {
        if !rest.is_empty() && rest.bytes().all(|c| c.is_ascii_digit()) {
            let depth: usize = rest.parse().unwrap_or(usize::MAX);
            return (2..=MAX_N)
                .contains(&depth)
                .then_some(ParsedAction::Depth(depth));
        }
    }
    is_move_text(id).then_some(ParsedAction::Move(id))
}

/// 면 글자 하나(대문자)면 그 글자
fn face_letter(c: u8) -> bool {
    matches!(c, b'R' | b'L' | b'U' | b'D' | b'F' | b'B')
}

/// 꼬리(`''`·`2`·`2'`·`'`)가 이 꼴 가운데 하나인가: 넓게 허용하는 사이트 정규식 `(2'?|'?)`
fn tail_2_prime(s: &str) -> bool {
    matches!(s, "" | "'" | "2" | "2'")
}

/// 꼬리 `(2|')?`
fn tail_2_or_prime(s: &str) -> bool {
    matches!(s, "" | "'" | "2")
}

/// 다음 수 깊이를 붙인다. 면 수(`R` `R'` `Rw` `r`)에만 붙고, 이미 숫자가 있거나 가운데 층·큐브 돌리기면 그대로
pub fn with_depth(notation: &str, depth: usize) -> String {
    let b = notation.as_bytes();
    if let Some(&f) = b.first() {
        if face_letter(f) {
            let rest = &notation[1..];
            let (w, tail) = match rest.strip_prefix('w') {
                Some(t) => ("w", t),
                None => ("", rest),
            };
            if tail_2_or_prime(tail) {
                return format!("{depth}{}{w}{tail}", f as char);
            }
        }
        if matches!(f, b'r' | b'l' | b'u' | b'd' | b'f' | b'b') && tail_2_or_prime(&notation[1..]) {
            return format!(
                "{depth}{}w{}",
                f.to_ascii_uppercase() as char,
                &notation[1..]
            );
        }
    }
    notation.to_string()
}

/// `(\d+)?([RLUDFB])(w)?(꼬리)` 꼴을 뜯는다: (숫자 글, 면, w, 꼬리)
fn split_face_notation(notation: &str) -> Option<(&str, u8, bool, &str)> {
    let digits = notation.bytes().take_while(u8::is_ascii_digit).count();
    let rest = &notation[digits..];
    let f = *rest.as_bytes().first()?;
    if !face_letter(f) {
        return None;
    }
    let rest = &rest[1..];
    let (wide, tail) = match rest.strip_prefix('w') {
        Some(t) => (true, t),
        None => (false, rest),
    };
    Some((&notation[..digits], f, wide, tail))
}

/// 면 → 가운데 층 이름과 그 면과 같은 쪽인가(E는 D, S는 F, M은 L과 같은 쪽)
fn slice_of(face: u8) -> (char, bool) {
    match face {
        b'U' => ('E', false),
        b'D' => ('E', true),
        b'F' => ('S', true),
        b'B' => ('S', false),
        b'R' => ('M', false),
        _ => ('M', true), // L
    }
}

/// 홀수 크기에서 한가운데 층을 면 글자와 깊이로 적은 수(3×3의 2U, 5×5의 3U)의 보통 이름(E'·S·M …). 그 밖은 None
pub fn middle_slice_name(n: usize, notation: &str) -> Option<String> {
    if n % 2 == 0 {
        return None;
    }
    let (num, face, wide, tail) = split_face_notation(notation)?;
    if num.is_empty() || wide || !tail_2_prime(tail) {
        return None;
    }
    if num.parse::<usize>().ok()? != (n + 1) / 2 {
        return None;
    }
    let (name, same) = slice_of(face);
    if tail.starts_with('2') {
        return Some(format!("{name}2"));
    }
    let prime = tail == "'";
    Some(format!("{name}{}", if prime == same { "'" } else { "" }))
}

fn opposite_letter(face: u8) -> char {
    match face {
        b'R' => 'L',
        b'L' => 'R',
        b'U' => 'D',
        b'D' => 'U',
        b'F' => 'B',
        _ => 'F', // B
    }
}

/// 면 → 큐브 전체 돌리기와 그 면과 같은 쪽인가
fn rotation_of(face: u8) -> (char, bool) {
    match face {
        b'R' => ('x', true),
        b'L' => ('x', false),
        b'U' => ('y', true),
        b'D' => ('y', false),
        b'F' => ('z', true),
        _ => ('z', false), // B
    }
}

fn flip(sfx: &str) -> &'static str {
    if sfx.starts_with('2') {
        if sfx == "2" {
            "2"
        } else {
            "2'"
        }
    } else if sfx == "'" {
        ""
    } else {
        "'"
    }
}

/// 수를 가장 짧은 이름으로(사이트 `canonicalNotation`): 반대쪽이 더 가까우면 반대 면, 홀수 크기 한가운데 층은 M·E·S,
/// 넓게 n층은 큐브 전체, 넓게 1층은 그 면, 넓게 2층은 Rw. 바꿀 것이 없으면 그대로
pub fn canonical_notation(n: usize, notation: &str) -> String {
    let Some((num, face, wide, suffix)) = split_face_notation(notation) else {
        return notation.to_string();
    };
    if !tail_2_prime(suffix) {
        return notation.to_string();
    }
    let f = face as char;
    if wide {
        let k = if num.is_empty() {
            2
        } else {
            num.parse::<usize>().unwrap_or(usize::MAX)
        };
        if k >= n {
            let (rot, same) = rotation_of(face);
            return format!("{rot}{}", if same { suffix } else { flip(suffix) });
        }
        if k == 1 {
            return format!("{f}{suffix}");
        }
        return if k == 2 {
            format!("{f}w{suffix}")
        } else {
            format!("{k}{f}w{suffix}")
        };
    }
    if num.is_empty() {
        return notation.to_string();
    }
    let k = num.parse::<usize>().unwrap_or(usize::MAX);
    if let Some(slice) = middle_slice_name(n, &format!("{k}{f}{suffix}")) {
        return slice;
    }
    if k <= n {
        let back = n + 1 - k;
        if back < k {
            let other = opposite_letter(face);
            return if back == 1 {
                format!("{other}{}", flip(suffix))
            } else {
                format!("{back}{other}{}", flip(suffix))
            };
        }
    }
    if k == 1 {
        format!("{f}{suffix}")
    } else {
        notation.to_string()
    }
}

/// 크기 n에서 이 동작을 쓸 수 있는지
pub fn is_available(n: usize, id: &str) -> bool {
    let Some(p) = parse_action(id) else {
        return false;
    };
    match p {
        ParsedAction::Command(_) => true,
        ParsedAction::Layers { .. } => n >= 4,
        // 다음 수 깊이: 3×3부터, 1~n층을 모두 받는다
        ParsedAction::Depth(d) => n >= 3 && d <= n,
        ParsedAction::Move(text) => {
            // 3×3의 둘째 층(2U 등)은 가운데 층으로 받는다
            if n == 3 && middle_slice_name(n, text).is_some() {
                return true;
            }
            let b = text.as_bytes();
            // 안쪽 한 층(2R 등)과 깊이 붙은 넓게(3Rw)는 4×4부터, 넓게는 3×3부터
            if b[0].is_ascii_digit() && n < 4 {
                return false;
            }
            let wide_face = face_letter(b[0]) && b.get(1) == Some(&b'w');
            let lower = matches!(b[0], b'r' | b'l' | b'u' | b'd' | b'f' | b'b');
            if (wide_face || lower) && n < 3 {
                return false;
            }
            notation_to_move(n, text).is_some()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_moves_follow_contract() {
        let m = |axis, from, to, turns| CubeMove {
            axis,
            from,
            to,
            turns,
        };
        assert_eq!(notation_to_move(3, "R"), Some(m(0, 1, 1, 1)));
        assert_eq!(notation_to_move(3, "L"), Some(m(0, 3, 3, 3)));
        assert_eq!(notation_to_move(3, "x'"), Some(m(0, 1, 3, 3)));
        assert_eq!(notation_to_move(4, "3Rw2"), Some(m(0, 1, 3, 2)));
        assert_eq!(notation_to_move(3, "M"), Some(m(0, 2, 2, 3)));
        assert_eq!(notation_to_move(4, "M"), None);
        assert_eq!(notation_to_move(3, "1R"), None);
        assert_eq!(notation_to_move(3, "99999999999999999999999R"), None);
    }

    #[test]
    fn canonical_names() {
        assert_eq!(canonical_notation(3, "3R"), "L'");
        assert_eq!(canonical_notation(4, "3R"), "2L'");
        assert_eq!(canonical_notation(3, "2R"), "M'");
        assert_eq!(canonical_notation(5, "3U"), "E'");
        assert_eq!(canonical_notation(3, "3Rw"), "x");
        assert_eq!(canonical_notation(3, "3Lw2'"), "x2'");
        assert_eq!(with_depth("r'", 3), "3Rw'");
        assert_eq!(with_depth("M", 3), "M");
    }
}
