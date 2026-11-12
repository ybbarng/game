//! 작은 JSON 읽기·쓰기(의존 없음). 공식 연습 기록(`cube.mini.practice.v1`·`cube.mini.train.v1`)과 내 공식
//! (`cube.algs.v1`)을 사이트와 같은 꼴로 읽고 쓴다(docs/52 5-6). 앱 저장소의 글을 그대로 받아 코어 구조체로 바꾼다.

use std::collections::{BTreeMap, HashMap};

use cube_core::practice::{AlgBook, CaseAlgs, CaseStats, PracticeRecord, TrainBook};

#[derive(Clone, Debug, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(BTreeMap<String, Json>),
}

impl Json {
    pub fn get(&self, k: &str) -> Option<&Json> {
        match self {
            Json::Obj(m) => m.get(k),
            _ => None,
        }
    }
    pub fn num(&self) -> Option<f64> {
        match self {
            Json::Num(v) => Some(*v),
            _ => None,
        }
    }
    pub fn str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s),
            _ => None,
        }
    }
}

/// 글 → 값. 꼴이 틀리면 None
pub fn parse(text: &str) -> Option<Json> {
    let b = text.as_bytes();
    let mut i = 0;
    let v = value(b, &mut i)?;
    ws(b, &mut i);
    (i == b.len()).then_some(v)
}

fn ws(b: &[u8], i: &mut usize) {
    while *i < b.len() && matches!(b[*i], b' ' | b'\n' | b'\r' | b'\t') {
        *i += 1;
    }
}

fn value(b: &[u8], i: &mut usize) -> Option<Json> {
    ws(b, i);
    match *b.get(*i)? {
        b'{' => {
            *i += 1;
            let mut m = BTreeMap::new();
            ws(b, i);
            if b.get(*i) == Some(&b'}') {
                *i += 1;
                return Some(Json::Obj(m));
            }
            loop {
                ws(b, i);
                let k = string(b, i)?;
                ws(b, i);
                if b.get(*i) != Some(&b':') {
                    return None;
                }
                *i += 1;
                let v = value(b, i)?;
                m.insert(k, v);
                ws(b, i);
                match b.get(*i)? {
                    b',' => *i += 1,
                    b'}' => {
                        *i += 1;
                        return Some(Json::Obj(m));
                    }
                    _ => return None,
                }
            }
        }
        b'[' => {
            *i += 1;
            let mut a = Vec::new();
            ws(b, i);
            if b.get(*i) == Some(&b']') {
                *i += 1;
                return Some(Json::Arr(a));
            }
            loop {
                a.push(value(b, i)?);
                ws(b, i);
                match b.get(*i)? {
                    b',' => *i += 1,
                    b']' => {
                        *i += 1;
                        return Some(Json::Arr(a));
                    }
                    _ => return None,
                }
            }
        }
        b'"' => string(b, i).map(Json::Str),
        b't' if b[*i..].starts_with(b"true") => {
            *i += 4;
            Some(Json::Bool(true))
        }
        b'f' if b[*i..].starts_with(b"false") => {
            *i += 5;
            Some(Json::Bool(false))
        }
        b'n' if b[*i..].starts_with(b"null") => {
            *i += 4;
            Some(Json::Null)
        }
        _ => {
            let start = *i;
            while *i < b.len() && matches!(b[*i], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') {
                *i += 1;
            }
            std::str::from_utf8(&b[start..*i])
                .ok()?
                .parse()
                .ok()
                .map(Json::Num)
        }
    }
}

fn string(b: &[u8], i: &mut usize) -> Option<String> {
    if b.get(*i) != Some(&b'"') {
        return None;
    }
    *i += 1;
    let mut out: Vec<u16> = Vec::new();
    let mut raw = Vec::new();
    let flush = |raw: &mut Vec<u8>, out: &mut Vec<u16>| {
        out.extend(String::from_utf8_lossy(raw).encode_utf16());
        raw.clear();
    };
    loop {
        let c = *b.get(*i)?;
        *i += 1;
        match c {
            b'"' => {
                flush(&mut raw, &mut out);
                return Some(String::from_utf16_lossy(&out));
            }
            b'\\' => {
                flush(&mut raw, &mut out);
                let e = *b.get(*i)?;
                *i += 1;
                match e {
                    b'n' => out.push(10),
                    b't' => out.push(9),
                    b'r' => out.push(13),
                    b'b' => out.push(8),
                    b'f' => out.push(12),
                    b'u' => {
                        let h = std::str::from_utf8(b.get(*i..*i + 4)?).ok()?;
                        out.push(u16::from_str_radix(h, 16).ok()?);
                        *i += 4;
                    }
                    other => out.push(other as u16),
                }
            }
            _ => raw.push(c),
        }
    }
}

/// 값 → 글(사이트 `JSON.stringify`처럼 빈칸 없이)
pub fn write(v: &Json) -> String {
    match v {
        Json::Null => "null".into(),
        Json::Bool(b) => b.to_string(),
        Json::Num(n) => num(*n),
        Json::Str(s) => quote(s),
        Json::Arr(a) => format!("[{}]", a.iter().map(write).collect::<Vec<_>>().join(",")),
        Json::Obj(m) => format!(
            "{{{}}}",
            m.iter()
                .map(|(k, v)| format!("{}:{}", quote(k), write(v)))
                .collect::<Vec<_>>()
                .join(",")
        ),
    }
}

fn num(n: f64) -> String {
    if !n.is_finite() {
        return "null".into();
    }
    if n.fract() == 0.0 && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

pub fn quote(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn nums(v: Option<&Json>) -> Option<Vec<f64>> {
    match v? {
        Json::Arr(a) => Some(a.iter().filter_map(Json::num).collect()),
        _ => None,
    }
}

/// 상황별 기록 하나(사이트 `isStats`: solves·fails 숫자, times·moves 배열)
fn stats(v: &Json) -> Option<CaseStats> {
    Some(CaseStats {
        solves: v.get("solves")?.num()? as u32,
        fails: v.get("fails")?.num()? as u32,
        best: v.get("best").and_then(Json::num),
        times: nums(v.get("times"))?,
        moves: nums(v.get("moves"))?,
    })
}

fn stats_json(s: &CaseStats) -> Json {
    let mut m = BTreeMap::new();
    m.insert("solves".into(), Json::Num(s.solves as f64));
    m.insert("fails".into(), Json::Num(s.fails as f64));
    if let Some(b) = s.best {
        m.insert("best".into(), Json::Num(b));
    }
    m.insert(
        "times".into(),
        Json::Arr(s.times.iter().map(|&t| Json::Num(t)).collect()),
    );
    m.insert(
        "moves".into(),
        Json::Arr(s.moves.iter().map(|&t| Json::Num(t)).collect()),
    );
    Json::Obj(m)
}

/// 상황별 기록 묶음(`cube.train.v1`과 같은 꼴). 망가진 칸은 버린다
pub fn train_book(text: &str) -> TrainBook {
    let mut out = HashMap::new();
    if let Some(Json::Obj(m)) = parse(text) {
        for (k, v) in m {
            if let Some(s) = stats(&v) {
                out.insert(k, s);
            }
        }
    }
    out
}

pub fn train_book_json(b: &TrainBook) -> String {
    write(&Json::Obj(
        b.iter().map(|(k, v)| (k.clone(), stats_json(v))).collect(),
    ))
}

/// 공식 연습 기록(사이트 `loadPractice`)
pub fn practice_record(text: &str) -> PracticeRecord {
    let mut r = PracticeRecord::default();
    let Some(v) = parse(text) else { return r };
    if let Some(Json::Obj(m)) = v.get("follow") {
        for (k, s) in m {
            if let Some(s) = stats(s) {
                r.follow.insert(k.clone(), s);
            }
        }
    }
    if let Some(Json::Obj(m)) = v.get("rounds") {
        for (k, x) in m {
            if matches!(x, Json::Obj(_)) {
                let f = x.get("follow").and_then(Json::num).unwrap_or(0.0) as u32;
                let s = x.get("see").and_then(Json::num).unwrap_or(0.0) as u32;
                r.rounds.insert(k.clone(), (f, s));
            }
        }
    }
    r.last = v.get("last").and_then(Json::str).map(String::from);
    r
}

pub fn practice_record_json(r: &PracticeRecord) -> String {
    let mut m = BTreeMap::new();
    m.insert(
        "follow".into(),
        Json::Obj(
            r.follow
                .iter()
                .map(|(k, v)| (k.clone(), stats_json(v)))
                .collect(),
        ),
    );
    m.insert(
        "rounds".into(),
        Json::Obj(
            r.rounds
                .iter()
                .map(|(k, (f, s))| {
                    let mut o = BTreeMap::new();
                    o.insert("follow".into(), Json::Num(*f as f64));
                    o.insert("see".into(), Json::Num(*s as f64));
                    (k.clone(), Json::Obj(o))
                })
                .collect(),
        ),
    );
    if let Some(l) = &r.last {
        m.insert("last".into(), Json::Str(l.clone()));
    }
    write(&Json::Obj(m))
}

/// 내 공식(사이트 `cube.algs.v1`: 상황 id → { mine: [..], use?: ".." })
pub fn alg_book(text: &str) -> AlgBook {
    let mut out = HashMap::new();
    if let Some(Json::Obj(m)) = parse(text) {
        for (k, v) in m {
            let mine: Vec<String> = match v.get("mine") {
                Some(Json::Arr(a)) => a.iter().filter_map(|x| x.str().map(String::from)).collect(),
                _ => vec![],
            };
            let use_alg = v.get("use").and_then(Json::str).map(String::from);
            if !mine.is_empty() || use_alg.is_some() {
                out.insert(k, CaseAlgs { mine, use_alg });
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_site_records() {
        let text = r#"{"follow":{"oll-1":{"solves":3,"fails":1,"best":812,"times":[812,900.5],"moves":[8,8]},"bad":{"x":1}},"rounds":{"cfop-oll":{"follow":2,"see":0}},"last":"cfop-oll"}"#;
        let r = practice_record(text);
        assert_eq!(r.follow.len(), 1);
        assert_eq!(r.follow["oll-1"].times, vec![812.0, 900.5]);
        assert_eq!(r.rounds["cfop-oll"], (2, 0));
        assert_eq!(r.last.as_deref(), Some("cfop-oll"));
        let again = practice_record(&practice_record_json(&r));
        assert_eq!(again.follow["oll-1"].best, Some(812.0));
        assert_eq!(practice_record("nope").follow.len(), 0);
        let b = alg_book(r#"{"pll-t":{"mine":["R U R' U'"],"use":"R U R' U'"},"x":{"mine":[]}}"#);
        assert_eq!(b.len(), 1);
        assert_eq!(b["pll-t"].use_alg.as_deref(), Some("R U R' U'"));
        assert_eq!(
            parse(r#"{"a":"é\n","b":[true,null,-1.5e2]}"#)
                .unwrap()
                .get("b"),
            Some(&Json::Arr(vec![
                Json::Bool(true),
                Json::Null,
                Json::Num(-150.0)
            ]))
        );
        assert_eq!(
            write(&parse(r#"{"k":"한 \"글\""}"#).unwrap()),
            r#"{"k":"한 \"글\""}"#
        );
    }
}
