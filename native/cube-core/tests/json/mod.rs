//! 시험 자료를 읽는 작은 JSON 읽개(의존을 두지 않으려고 직접 짰다). 자료는 사이트 시험이 `JSON.stringify`로 쓴다.

#![allow(dead_code)]

use std::collections::BTreeMap;

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
    pub fn get(&self, key: &str) -> &Json {
        match self {
            Json::Obj(m) => m.get(key).unwrap_or(&Json::Null),
            _ => &Json::Null,
        }
    }
    pub fn has(&self, key: &str) -> bool {
        matches!(self, Json::Obj(m) if m.contains_key(key))
    }
    pub fn str(&self) -> &str {
        match self {
            Json::Str(s) => s,
            other => panic!("글이 아니다: {other:?}"),
        }
    }
    pub fn num(&self) -> f64 {
        match self {
            Json::Num(v) => *v,
            other => panic!("수가 아니다: {other:?}"),
        }
    }
    pub fn opt_num(&self) -> Option<f64> {
        match self {
            Json::Null => None,
            v => Some(v.num()),
        }
    }
    pub fn opt_str(&self) -> Option<&str> {
        match self {
            Json::Null => None,
            v => Some(v.str()),
        }
    }
    pub fn bool(&self) -> bool {
        match self {
            Json::Bool(b) => *b,
            other => panic!("참거짓이 아니다: {other:?}"),
        }
    }
    pub fn arr(&self) -> &[Json] {
        match self {
            Json::Arr(a) => a,
            other => panic!("목록이 아니다: {other:?}"),
        }
    }
    pub fn is_null(&self) -> bool {
        matches!(self, Json::Null)
    }
}

pub fn parse(text: &str) -> Json {
    let mut p = Parser {
        s: text.as_bytes(),
        i: 0,
    };
    let v = p.value();
    p.ws();
    assert_eq!(p.i, p.s.len(), "JSON 뒤에 남은 글자");
    v
}

struct Parser<'a> {
    s: &'a [u8],
    i: usize,
}

impl Parser<'_> {
    fn ws(&mut self) {
        while self.i < self.s.len() && self.s[self.i].is_ascii_whitespace() {
            self.i += 1;
        }
    }

    fn eat(&mut self, c: u8) {
        self.ws();
        assert_eq!(self.s[self.i], c, "{}번째 바이트", self.i);
        self.i += 1;
    }

    fn value(&mut self) -> Json {
        self.ws();
        match self.s[self.i] {
            b'{' => {
                self.i += 1;
                let mut m = BTreeMap::new();
                self.ws();
                if self.s[self.i] == b'}' {
                    self.i += 1;
                    return Json::Obj(m);
                }
                loop {
                    self.ws();
                    let k = self.string();
                    self.eat(b':');
                    let v = self.value();
                    m.insert(k, v);
                    self.ws();
                    let c = self.s[self.i];
                    self.i += 1;
                    if c == b'}' {
                        return Json::Obj(m);
                    }
                    assert_eq!(c, b',');
                }
            }
            b'[' => {
                self.i += 1;
                let mut a = Vec::new();
                self.ws();
                if self.s[self.i] == b']' {
                    self.i += 1;
                    return Json::Arr(a);
                }
                loop {
                    a.push(self.value());
                    self.ws();
                    let c = self.s[self.i];
                    self.i += 1;
                    if c == b']' {
                        return Json::Arr(a);
                    }
                    assert_eq!(c, b',');
                }
            }
            b'"' => Json::Str(self.string()),
            b't' => {
                self.i += 4;
                Json::Bool(true)
            }
            b'f' => {
                self.i += 5;
                Json::Bool(false)
            }
            b'n' => {
                self.i += 4;
                Json::Null
            }
            _ => {
                let start = self.i;
                while self.i < self.s.len() && b"+-.eE0123456789".contains(&self.s[self.i]) {
                    self.i += 1;
                }
                let t = std::str::from_utf8(&self.s[start..self.i]).unwrap();
                Json::Num(t.parse().unwrap_or_else(|_| panic!("수: {t}")))
            }
        }
    }

    fn string(&mut self) -> String {
        assert_eq!(self.s[self.i], b'"');
        self.i += 1;
        let mut out: Vec<u16> = Vec::new();
        let mut bytes: Vec<u8> = Vec::new();
        let flush = |bytes: &mut Vec<u8>, out: &mut Vec<u16>| {
            out.extend(std::str::from_utf8(bytes).unwrap().encode_utf16());
            bytes.clear();
        };
        loop {
            let c = self.s[self.i];
            self.i += 1;
            match c {
                b'"' => break,
                b'\\' => {
                    flush(&mut bytes, &mut out);
                    let e = self.s[self.i];
                    self.i += 1;
                    match e {
                        b'n' => out.push(10),
                        b't' => out.push(9),
                        b'r' => out.push(13),
                        b'b' => out.push(8),
                        b'f' => out.push(12),
                        b'u' => {
                            let h = std::str::from_utf8(&self.s[self.i..self.i + 4]).unwrap();
                            out.push(u16::from_str_radix(h, 16).unwrap());
                            self.i += 4;
                        }
                        other => out.push(u16::from(other)),
                    }
                }
                _ => bytes.push(c),
            }
        }
        flush(&mut bytes, &mut out);
        String::from_utf16(&out).unwrap()
    }
}
