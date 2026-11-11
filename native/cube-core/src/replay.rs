//! 다시 보기 글과 구간 기록 글(`apps/web/src/cube/records.ts`, `replay-player.ts`).
//!
//! - 다시 보기: 수와 시각(맞추기 시작부터 ms) "R@120 U'@380". 저장할 때 시각은 반올림한다.
//! - 구간 기록: 이정표를 처음 지난 시각 "cross@3210 f2l1@8020".

use crate::notation::{parse_moves, CubeMove};
use crate::tier::js_round;

/// 오래 멈춘 곳은 이만큼으로 줄인다(사이트 `REPLAY_MAX_PAUSE_MS`)
pub const REPLAY_MAX_PAUSE_MS: f64 = 1_000.0;

/// 자바스크립트 `Number(text)`: 빈 글은 0, 앞뒤 빈칸 무시, 10진수·지수, 0x·0o·0b. 못 읽으면 NaN
pub fn js_number(text: &str) -> f64 {
    let s = text.trim_matches(|c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}');
    if s.is_empty() {
        return 0.0;
    }
    match s {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0o", 8),
        ("0O", 8),
        ("0b", 2),
        ("0B", 2),
    ] {
        if let Some(rest) = s.strip_prefix(prefix) {
            if rest.is_empty() || !rest.chars().all(|c| c.is_digit(radix)) {
                return f64::NAN;
            }
            return rest.chars().fold(0.0, |v, c| {
                v * f64::from(radix) + f64::from(c.to_digit(radix).unwrap())
            });
        }
    }
    // 10진수: [+-]? (숫자[.숫자?] | .숫자) ([eE][+-]?숫자)?
    let ok = s
        .chars()
        .all(|c| c.is_ascii_digit() || matches!(c, '.' | 'e' | 'E' | '+' | '-'));
    if !ok {
        return f64::NAN;
    }
    s.parse::<f64>().unwrap_or(f64::NAN)
}

/// 다시 보기 글 → [표기, 시각] 목록(사이트 `parseReplay`). 빈 표기·시각이 수가 아닌 토막은 뺀다
pub fn parse_replay(text: &str) -> Vec<(String, f64)> {
    if text.is_empty() {
        return vec![];
    }
    text.split(' ')
        .filter_map(|part| {
            let mut it = part.split('@');
            let m = it.next().unwrap_or("");
            let t = it.next().map_or(f64::NAN, js_number);
            (!m.is_empty() && t.is_finite()).then(|| (m.to_string(), t))
        })
        .collect()
}

/// 수와 시각 → 다시 보기 글(사이트 `formatReplay`)
pub fn format_replay(events: &[(String, f64)]) -> String {
    events
        .iter()
        .map(|(m, t)| format!("{m}@{}", js_round(*t) as i64))
        .collect::<Vec<_>>()
        .join(" ")
}

/// 다시 보기 걸음: 시작부터 ms와 그때 둘 수
#[derive(Clone, Debug, PartialEq)]
pub struct ReplayStep {
    pub at: f64,
    pub moves: Vec<CubeMove>,
}

/// 다시 보기 글 → 걸음(사이트 `solveSteps`의 맞춘 과정). 첫 수가 `offset`, 수 사이 멈춤은 `max_pause_ms`까지.
/// 읽지 못하는 수는 건너뛴다
pub fn replay_steps(n: usize, text: &str, max_pause_ms: f64, offset: f64) -> Vec<ReplayStep> {
    let mut out = Vec::new();
    let mut at = offset;
    let mut prev: Option<f64> = None;
    for (notation, t) in parse_replay(text) {
        if let Some(p) = prev {
            at += max_pause_ms.min((t - p).max(0.0));
        }
        prev = Some(t);
        let Ok(moves) = parse_moves(n, &notation) else {
            continue;
        };
        if !moves.is_empty() {
            out.push(ReplayStep { at, moves });
        }
    }
    out
}

/// 다시 보기 글을 돌리는 데 걸리는 시간(ms, 멈춤을 줄인 뒤). 사이트 `replayLength`
pub fn replay_length(text: &str, max_pause_ms: f64) -> f64 {
    let mut total = 0.0;
    let mut prev: Option<f64> = None;
    for (_, t) in parse_replay(text) {
        if let Some(p) = prev {
            total += max_pause_ms.min((t - p).max(0.0));
        }
        prev = Some(t);
    }
    total
}

/// 구간 기록 → 저장 글(사이트 `formatSplits`)
pub fn format_splits(splits: &[(String, f64)]) -> String {
    format_replay(splits)
}

/// 저장 글 → 구간 기록(사이트 `parseSplits`). 모르는 꼴은 건너뛰고, 같은 이정표는 처음 것만
pub fn parse_splits(text: &str) -> Vec<(String, f64)> {
    let mut out: Vec<(String, f64)> = Vec::new();
    if text.is_empty() {
        return out;
    }
    for part in text.split(' ') {
        let Some((id, ms)) = part.split_once('@') else {
            continue;
        };
        let id_ok = !id.is_empty()
            && id
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
        let ms_ok = !ms.is_empty() && ms.chars().all(|c| c.is_ascii_digit());
        if !id_ok || !ms_ok || out.iter().any(|(seen, _)| seen == id) {
            continue;
        }
        out.push((id.to_string(), js_number(ms)));
    }
    out
}
