//! C 머리 파일(`apps/cubie/Sources/CubieNativeC/include/cubie_native.h`, 손으로 쓴다)과 Rust C ABI(`src/ffi_game.rs`·
//! `ffi_records.rs`·`ffi_keymap.rs`)가 어긋나지 않았는지 본다(docs/52 5-20). 앱(Swift)은 머리 파일만 보고 부르므로, 한쪽만
//! 고치면 컴파일은 되는데 실행 중에 엉뚱한 값을 읽는다.
//! - 함수: 이름 목록이 같고, 함수마다 돌려주는 타입과 인자 타입이 차례대로 같다(인자 이름은 보지 않는다)
//! - `#[repr(C)]` 구조체: 머리 파일의 같은 이름 구조체와 필드 이름·타입·차례가 같다
//! - 머리 파일의 상수(`CUBIE_KEY_MOVED = 2`, `#define CUBIE_COLOR_MASKED 6`): Rust에 앞의 `CUBIE_`를 뗀 같은 이름·같은 값
//!
//! 의존 없이 글로 읽는다(cbindgen을 들이지 않는다). 머리 파일이 쓰는 꼴(줄 주석, `typedef struct … { … } …;`, 이름 없는
//! `enum { … };`, 한 줄 `#define`)만 읽는다.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

const RUST_FILES: [&str; 3] = ["src/ffi_game.rs", "src/ffi_records.rs", "src/ffi_keymap.rs"];

fn crate_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn header_text() -> String {
    let p = crate_dir().join("../../apps/cubie/Sources/CubieNativeC/include/cubie_native.h");
    fs::read_to_string(&p).unwrap_or_else(|e| panic!("머리 파일을 읽지 못함 {}: {e}", p.display()))
}

/// 세 파일을 이은 글. 파일마다 끝의 시험 묶음(`#[cfg(test)]` 아래)은 뗀다
fn rust_text() -> String {
    RUST_FILES
        .iter()
        .map(|f| {
            let t = fs::read_to_string(crate_dir().join(f)).expect(f);
            t.split("#[cfg(test)]").next().unwrap_or("").to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// 함수 하나: 돌려주는 타입과 인자 타입들(Rust 꼴로 맞춘 글)
#[derive(Debug, PartialEq, Eq)]
struct Sig {
    ret: String,
    params: Vec<String>,
}

#[derive(Debug, Default)]
struct Api {
    funcs: BTreeMap<String, Sig>,
    structs: BTreeMap<String, Vec<(String, String)>>,
    consts: BTreeMap<String, String>,
}

// MARK: C 머리 파일

fn strip_line_comments(s: &str) -> String {
    s.lines()
        .map(|l| l.split("//").next().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("\n")
}

/// C 타입 글(이름은 뗀 것) → Rust 꼴. 앞의 const는 첫 포인터가 가리키는 것, `*` 뒤 const는 그 포인터 자체(바깥 포인터가
/// 가리키는 것)를 고정한다
fn c_type(tokens: &[&str]) -> String {
    let mut lead_const = false;
    let mut base = None;
    let mut i = 0;
    while i < tokens.len() && tokens[i] != "*" {
        if tokens[i] == "const" {
            lead_const = true;
        } else {
            base = Some(tokens[i]);
        }
        i += 1;
    }
    let base = base.unwrap_or_else(|| panic!("C 타입을 못 읽음: {tokens:?}"));
    let mut cur = match base {
        "void" => "()",
        "bool" => "bool",
        "char" => "c_char",
        "double" => "f64",
        "uint8_t" => "u8",
        "uint16_t" => "u16",
        "uint32_t" => "u32",
        "int32_t" => "i32",
        other => other,
    }
    .to_string();
    let mut const_next = lead_const;
    while i < tokens.len() {
        assert_eq!(tokens[i], "*", "C 타입을 못 읽음: {tokens:?}");
        cur = format!("{} {cur}", if const_next { "*const" } else { "*mut" });
        i += 1;
        const_next = i < tokens.len() && tokens[i] == "const";
        if const_next {
            i += 1;
        }
    }
    cur
}

/// 「타입 이름」 하나(인자·필드) → (이름, Rust 꼴 타입)
fn c_decl(decl: &str) -> (String, String) {
    let spaced = decl.replace('*', " * ");
    let tokens: Vec<&str> = spaced.split_whitespace().collect();
    let (name, ty) = tokens
        .split_last()
        .unwrap_or_else(|| panic!("빈 선언: {decl:?}"));
    (name.to_string(), c_type(ty))
}

fn parse_header(text: &str) -> Api {
    let mut api = Api::default();
    let text = strip_line_comments(text);
    let mut rest = String::new();
    for line in text.lines() {
        let t = line.trim();
        if let Some(def) = t.strip_prefix("#define ") {
            let mut it = def.split_whitespace();
            if let (Some(name), Some(v)) = (it.next(), it.next()) {
                if name.starts_with("CUBIE_") && v.parse::<i64>().is_ok() {
                    api.consts.insert(name.to_string(), v.to_string());
                }
            }
            continue;
        }
        if t.starts_with('#') || t == "extern \"C\" {" || t == "}" {
            continue;
        }
        rest.push_str(line);
        rest.push('\n');
    }
    // 이름 없는 enum: CUBIE_X = n,
    while let Some(start) = rest.find("enum {") {
        let end = start + rest[start..].find("};").expect("enum 끝");
        for item in rest[start + 6..end].split(',') {
            if let Some((k, v)) = item.split_once('=') {
                api.consts
                    .insert(k.trim().to_string(), v.trim().to_string());
            }
        }
        rest.replace_range(start..end + 2, "");
    }
    // typedef struct Name { 필드; … } Name;  필드 없는 typedef struct Name Name;은 불투명 타입이라 넘긴다
    while let Some(start) = rest.find("typedef struct") {
        let semi = start + rest[start..].find(';').expect("typedef 끝");
        let brace = rest[start..].find('{').map(|b| start + b);
        match brace {
            Some(b) if b < semi => {
                let name = rest[start + 14..b].trim().to_string();
                let close = b + rest[b..].find('}').expect("구조체 끝");
                let fields = rest[b + 1..close]
                    .split(';')
                    .map(str::trim)
                    .filter(|f| !f.is_empty())
                    .map(c_decl)
                    .collect();
                api.structs.insert(name, fields);
                let end = close + rest[close..].find(';').expect("typedef 이름 끝");
                rest.replace_range(start..end + 1, "");
            }
            _ => rest.replace_range(start..semi + 1, ""),
        }
    }
    // 남은 것은 함수 선언: 돌려주는 타입 이름(인자, …);
    for decl in rest.split(';') {
        let d = decl.split_whitespace().collect::<Vec<_>>().join(" ");
        let Some(open) = d.find('(') else { continue };
        let close = d.rfind(')').expect("인자 끝");
        let (name, ret) = c_decl(&d[..open]);
        let params = d[open + 1..close]
            .split(',')
            .map(str::trim)
            .filter(|p| !p.is_empty() && *p != "void")
            .map(|p| c_decl(p).1)
            .collect();
        api.funcs.insert(name, Sig { ret, params });
    }
    api
}

// MARK: Rust C ABI

/// Rust 타입 글을 견줄 꼴로(빈칸 하나, 경로 떼기)
fn rust_type(t: &str) -> String {
    let t = t
        .replace("std::ffi::", "")
        .replace("core::ffi::", "")
        .replace("std::os::raw::", "");
    let t = t.replace('*', " *");
    t.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// 괄호 짝을 따라 `open`(여는 괄호 자리)의 닫는 자리
fn matching(s: &str, open: usize) -> usize {
    let mut depth = 0;
    for (i, c) in s[open..].char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return open + i;
                }
            }
            _ => {}
        }
    }
    panic!("닫는 괄호가 없음")
}

fn parse_rust(text: &str) -> Api {
    let mut api = Api::default();
    let code = text;
    let mut at = 0;
    while let Some(off) = code[at..].find("extern \"C\" fn ") {
        let start = at + off + "extern \"C\" fn ".len();
        let open = start + code[start..].find('(').expect("인자 시작");
        let name = code[start..open].trim().to_string();
        let close = matching(&code, open);
        let body = close + code[close..].find('{').expect("함수 몸");
        let after = code[close + 1..body].trim();
        let ret = after
            .strip_prefix("->")
            .map(|r| rust_type(r.trim()))
            .unwrap_or_else(|| "()".into());
        let params = code[open + 1..close]
            .split(',')
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .map(|p| rust_type(p.split_once(':').expect("인자 타입").1))
            .collect();
        api.funcs.insert(name, Sig { ret, params });
        at = body;
    }
    // #[repr(C)] 구조체: 필드 `pub 이름: 타입,`(문서 주석 줄은 넘긴다)
    at = 0;
    while let Some(off) = code[at..].find("#[repr(C)]") {
        let s = at + off;
        let head =
            s + code[s..].find("pub struct ").expect("repr(C) 뒤 구조체") + "pub struct ".len();
        let brace = head + code[head..].find('{').expect("구조체 몸");
        let name = code[head..brace].trim().to_string();
        let close = brace + code[brace..].find('}').expect("구조체 끝");
        let fields = code[brace + 1..close]
            .lines()
            .map(str::trim)
            .filter(|l| l.starts_with("pub "))
            .map(|l| {
                let (n, t) = l["pub ".len()..]
                    .trim_end_matches(',')
                    .split_once(':')
                    .expect("필드");
                (n.trim().to_string(), rust_type(t))
            })
            .collect();
        api.structs.insert(name, fields);
        at = close;
    }
    // pub const 이름: 타입 = 값;
    for line in code.lines() {
        if let Some(rest) = line.trim().strip_prefix("pub const ") {
            if let (Some((name, _)), Some((_, v))) = (rest.split_once(':'), rest.split_once('=')) {
                api.consts.insert(
                    name.trim().to_string(),
                    v.trim().trim_end_matches(';').trim().to_string(),
                );
            }
        }
    }
    api
}

// MARK: 시험

#[test]
fn every_header_function_exists_in_rust_with_the_same_signature() {
    let h = parse_header(&header_text());
    let r = parse_rust(&rust_text());
    assert!(
        h.funcs.len() > 50,
        "머리 파일에서 읽은 함수가 너무 적다: {}",
        h.funcs.len()
    );
    let only_h: Vec<_> = h
        .funcs
        .keys()
        .filter(|k| !r.funcs.contains_key(*k))
        .collect();
    let only_r: Vec<_> = r
        .funcs
        .keys()
        .filter(|k| !h.funcs.contains_key(*k))
        .collect();
    assert!(
        only_h.is_empty(),
        "머리 파일에만 있는 함수(Rust에 없다): {only_h:?}"
    );
    assert!(
        only_r.is_empty(),
        "Rust에만 있는 함수(머리 파일에 적지 않았다): {only_r:?}"
    );
    for (name, sig) in &h.funcs {
        assert_eq!(
            sig, &r.funcs[name],
            "{name}: 머리 파일(왼쪽)과 Rust(오른쪽)의 타입이 다르다"
        );
    }
}

#[test]
fn every_repr_c_struct_matches_the_header_field_by_field() {
    let h = parse_header(&header_text());
    let r = parse_rust(&rust_text());
    let mut h_names: Vec<_> = h.structs.keys().collect();
    let mut r_names: Vec<_> = r.structs.keys().collect();
    h_names.sort();
    r_names.sort();
    assert_eq!(
        h_names, r_names,
        "구조체 목록이 다르다(왼쪽 머리 파일, 오른쪽 Rust #[repr(C)])"
    );
    for (name, fields) in &h.structs {
        assert_eq!(
            fields, &r.structs[name],
            "{name}: 필드 이름·타입·차례가 다르다(왼쪽 머리 파일)"
        );
    }
}

#[test]
fn header_constants_have_the_same_value_in_rust() {
    let h = parse_header(&header_text());
    let r = parse_rust(&rust_text());
    assert!(
        h.consts.len() > 15,
        "머리 파일에서 읽은 상수가 너무 적다: {}",
        h.consts.len()
    );
    for (name, v) in &h.consts {
        let short = name.strip_prefix("CUBIE_").expect("CUBIE_로 시작");
        assert_eq!(
            r.consts.get(short),
            Some(v),
            "{name}: Rust `{short}` 값이 다르거나 없다"
        );
    }
}

/// 읽는 틀 자체: 포인터 꼴과 고정(const) 자리를 Rust 꼴로 맞추는지
#[test]
fn c_types_map_to_rust_pointer_spelling() {
    assert_eq!(
        c_decl("const char *const *codes"),
        ("codes".into(), "*const *const c_char".into())
    );
    assert_eq!(c_decl("uint8_t *out"), ("out".into(), "*mut u8".into()));
    assert_eq!(
        c_decl("const CubieGame *game"),
        ("game".into(), "*const CubieGame".into())
    );
    assert_eq!(
        c_decl("CubieGame *cubie_game_new"),
        ("cubie_game_new".into(), "*mut CubieGame".into())
    );
    assert_eq!(
        rust_type("*const *const std::ffi::c_char"),
        "*const *const c_char"
    );
}
