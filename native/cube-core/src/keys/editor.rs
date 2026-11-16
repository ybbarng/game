//! 「사용자」 키 배치 편집(Cubie 설정 창, 사이트 설정 화면 `components/CubeSettingsApp.tsx` `KeymapSection`).
//!
//! 옮긴 원본(웹 `apps/web/src/cube/`): `keymap-editor.ts`(키 지정·겹친 키 묻기·알림 글·키 없는 동작·기본으로 되돌리기),
//! `input/keymaps.ts`(묶기·빼기·겹친 키·키 이름), `input/storage.ts`(저장 글·내보내기·가져오기), `input/actions.ts`
//! (`actionsFor`·`actionLabel`·`isKnownAction`), 설정 화면의 묶음 이름과 글 조립. 사이트와 같은지는 공통 시험 자료
//! `fixtures/keymap-editor.json`으로 본다.
//!
//! 배치는 앱 저장소의 `cube.keymap.v1` 글 그대로 주고받는다(사이트 `saveKeymap`과 같은 꼴).

use super::actions::{notation_to_move, parse_action, ParsedAction, MAX_N, MIN_N};
use super::keymap::{preset_keymap, KeyBinding, Keymap, Preset, ALT, CTRL, SHIFT};
use super::route::{route_for, HOME_LAYERS};

/// 편집 중인 배치(사이트 `Keymap`: 묶음·키 목록·마우스로 큐브 돌리기)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EditKeymap {
    pub keymap: Keymap,
    pub mouse_rotate: bool,
}

/// 키 하나(조합 포함)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Chord {
    pub code: String,
    /// [`SHIFT`]·[`ALT`]·[`CTRL`]
    pub mods: u8,
}

// ── 동작 목록(사이트 `actionsFor`) ─────────────────────────

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActionInfo {
    pub id: String,
    pub group: &'static str,
    pub label: String,
}

const COMMANDS: [(&str, &str); 7] = [
    ("undo", "되돌리기"),
    ("reset", "맞춘 상태로"),
    ("scramble", "다시 섞기"),
    ("inspectionSkip", "살펴보기 접기·블라인드 시작/끝"),
    ("peekBack", "뒤 살짝 보기(누르는 동안)"),
    ("peekDown", "아래 살짝 보기(누르는 동안)"),
    ("viewHome", "처음 각도로"),
];

/// 설정 화면의 묶음 이름(사이트 `GROUP_LABEL`)
pub fn group_label(group: &str) -> &'static str {
    match group {
        "face" => "면 돌리기",
        "wide" => "넓게 돌리기",
        "inner" => "안쪽 한 층",
        "slice" => "가운데 층",
        "rotate" => "큐브 돌리기",
        "depth" => "다음 수 깊이",
        _ => "명령",
    }
}

/// 묶음 이름(사이트 `PRESET_LABEL`)
pub fn preset_label(p: Preset) -> &'static str {
    match p {
        Preset::TwoHand => "두 손",
        Preset::Notation => "표기",
        Preset::Custom => "사용자",
    }
}

fn layers_label(id: &str) -> Option<String> {
    let rest = id.strip_prefix("layers:")?;
    let b = rest.as_bytes();
    if b.len() != 2 || !matches!(b[0], b'L' | b'R') || !matches!(b[1], b'+' | b'-') {
        return None;
    }
    Some(format!(
        "{} 층 수 {}",
        if b[0] == b'L' { "왼손" } else { "오른손" },
        if b[1] == b'+' { "+1" } else { "−1" }
    ))
}

/// 동작 이름(사이트 `actionLabel`)
pub fn action_label(id: &str) -> String {
    match parse_action(id) {
        None => id.to_string(),
        Some(ParsedAction::Layers { .. }) => layers_label(id).unwrap_or_else(|| id.to_string()),
        Some(ParsedAction::Command(c)) => COMMANDS
            .iter()
            .find(|(k, _)| *k == c.id())
            .map_or(id, |(_, l)| *l)
            .to_string(),
        Some(ParsedAction::Depth(d)) => format!("깊이 {d}"),
        Some(ParsedAction::Move(m)) => m.to_string(),
    }
}

/// 크기 n에서 쓸 수 있는 동작 목록(사이트 `actionsFor`)
pub fn actions_for(n: usize) -> Vec<ActionInfo> {
    let mut out = vec![];
    let moves = |out: &mut Vec<ActionInfo>, group: &'static str, base: &str| {
        for s in ["", "'", "2"] {
            out.push(ActionInfo {
                id: format!("{base}{s}"),
                group,
                label: format!("{base}{s}"),
            });
        }
    };
    const FACES: [&str; 6] = ["R", "L", "U", "D", "F", "B"];
    for f in FACES {
        moves(&mut out, "face", f);
    }
    if n >= 3 {
        for f in FACES {
            moves(&mut out, "wide", &format!("{f}w"));
        }
    }
    if n >= 4 {
        let half = n.div_ceil(2);
        for k in 2..=half {
            for f in FACES {
                moves(&mut out, "inner", &format!("{k}{f}"));
            }
        }
        for k in 3..=half {
            for f in FACES {
                moves(&mut out, "wide", &format!("{k}{f}w"));
            }
        }
    }
    if n >= 3 && n % 2 == 1 {
        for s in ["M", "E", "S"] {
            moves(&mut out, "slice", s);
        }
    }
    for r in ["x", "y", "z"] {
        moves(&mut out, "rotate", r);
    }
    if n >= 4 {
        for id in ["layers:L-", "layers:L+", "layers:R+", "layers:R-"] {
            out.push(ActionInfo {
                id: id.to_string(),
                group: "depth",
                label: layers_label(id).unwrap_or_default(),
            });
        }
        for d in 2..n {
            out.push(ActionInfo {
                id: format!("depth:{d}"),
                group: "depth",
                label: format!("다음 수 깊이 {d}"),
            });
        }
    }
    for (id, label) in COMMANDS {
        out.push(ActionInfo {
            id: id.to_string(),
            group: "command",
            label: label.to_string(),
        });
    }
    out
}

/// 어느 크기에서든 뜻이 있는 동작 이름인지(사이트 `isKnownAction`, 가져오기 검증)
pub fn is_known_action(id: &str) -> bool {
    match parse_action(id) {
        None => false,
        Some(ParsedAction::Move(m)) => (MIN_N..=MAX_N).any(|n| notation_to_move(n, m).is_some()),
        Some(_) => true,
    }
}

// ── 키 이름(사이트 `chordKey`·`codeLabel`·`chordLabel`) ─────────

fn mod_prefix(mods: u8) -> String {
    format!(
        "{}{}{}",
        if mods & CTRL != 0 { "Ctrl+" } else { "" },
        if mods & ALT != 0 { "Alt+" } else { "" },
        if mods & SHIFT != 0 { "Shift+" } else { "" }
    )
}

pub fn chord_key(code: &str, mods: u8) -> String {
    format!("{}{code}", mod_prefix(mods))
}

pub fn code_label(code: &str) -> String {
    if let Some(r) = code.strip_prefix("Key") {
        return r.to_string();
    }
    if let Some(r) = code.strip_prefix("Digit") {
        return r.to_string();
    }
    match code {
        "Semicolon" => ";",
        "Comma" => ",",
        "Period" => ".",
        "Slash" => "/",
        "Quote" => "'",
        "BracketLeft" => "[",
        "BracketRight" => "]",
        "Backquote" => "`",
        "Minus" => "-",
        "Equal" => "=",
        "Backslash" => "\\",
        "Space" => "Space",
        "Backspace" => "⌫",
        "Escape" => "Esc",
        "Enter" => "Enter",
        "ArrowLeft" => "←",
        "ArrowRight" => "→",
        "ArrowUp" => "↑",
        "ArrowDown" => "↓",
        other => other,
    }
    .to_string()
}

pub fn chord_label(code: &str, mods: u8) -> String {
    format!("{}{}", mod_prefix(mods), code_label(code))
}

const MODIFIER_CODES: [&str; 10] = [
    "ShiftLeft",
    "ShiftRight",
    "AltLeft",
    "AltRight",
    "ControlLeft",
    "ControlRight",
    "MetaLeft",
    "MetaRight",
    "CapsLock",
    "Fn",
];

/// 키 누름 → 지정할 키(사이트 `chordFromEvent`). 조합 키만 눌렀거나 ⌘ 조합이면 None
pub fn chord_from_event(
    code: &str,
    shift: bool,
    alt: bool,
    ctrl: bool,
    meta: bool,
) -> Option<Chord> {
    if code.is_empty() || MODIFIER_CODES.contains(&code) || meta {
        return None;
    }
    Some(Chord {
        code: code.to_string(),
        mods: (if shift { SHIFT } else { 0 })
            | (if alt { ALT } else { 0 })
            | (if ctrl { CTRL } else { 0 }),
    })
}

/// 자바스크립트 `localeCompare`(ICU 기본 차례)를 키 이름에 쓰는 만큼: 글자는 대소문자를 가리지 않고 견주고(문장부호 <
/// 숫자 < 글자), 같으면 소문자가 앞
fn locale_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let class = |c: char| -> (u8, char) {
        if c.is_ascii_alphabetic() {
            (2, c.to_ascii_lowercase())
        } else if c.is_ascii_digit() {
            (1, c)
        } else {
            (0, c)
        }
    };
    let pa: Vec<(u8, char)> = a.chars().map(class).collect();
    let pb: Vec<(u8, char)> = b.chars().map(class).collect();
    pa.cmp(&pb).then_with(|| {
        let ta: Vec<bool> = a.chars().map(|c| c.is_ascii_uppercase()).collect();
        let tb: Vec<bool> = b.chars().map(|c| c.is_ascii_uppercase()).collect();
        ta.cmp(&tb)
    })
}

// ── 편집(사이트 `keymap-editor.ts`·`keymaps.ts`) ─────────────

fn lookup<'k>(km: &'k Keymap, c: &Chord) -> Option<&'k str> {
    km.bindings
        .iter()
        .find(|b| b.code == c.code && b.mods == c.mods)
        .map(|b| b.action.as_str())
}

/// 키 하나에 동작을 놓는다(그 키에 있던 동작은 빼고, 끝에 더함). 「사용자」가 된다(사이트 `bind`)
pub fn bind(e: &EditKeymap, c: &Chord, action: &str) -> EditKeymap {
    let k = chord_key(&c.code, c.mods);
    let mut bindings: Vec<KeyBinding> = e
        .keymap
        .bindings
        .iter()
        .filter(|b| chord_key(&b.code, b.mods) != k)
        .cloned()
        .collect();
    bindings.push(KeyBinding {
        code: c.code.clone(),
        mods: c.mods,
        action: action.to_string(),
    });
    EditKeymap {
        keymap: Keymap {
            preset: Preset::Custom,
            bindings,
        },
        mouse_rotate: e.mouse_rotate,
    }
}

/// 키 하나를 비운다(사이트 `unbind`)
pub fn unbind(e: &EditKeymap, key: &str) -> EditKeymap {
    EditKeymap {
        keymap: Keymap {
            preset: Preset::Custom,
            bindings: e
                .keymap
                .bindings
                .iter()
                .filter(|b| chord_key(&b.code, b.mods) != key)
                .cloned()
                .collect(),
        },
        mouse_rotate: e.mouse_rotate,
    }
}

/// 동작에 놓인 키를 모두 지운다(사이트 `clearAction`)
pub fn clear_action(e: &EditKeymap, action: &str) -> EditKeymap {
    EditKeymap {
        keymap: Keymap {
            preset: Preset::Custom,
            bindings: e
                .keymap
                .bindings
                .iter()
                .filter(|b| b.action != action)
                .cloned()
                .collect(),
        },
        mouse_rotate: e.mouse_rotate,
    }
}

/// 기본 묶음 그대로(사이트 `presetKeymap`, 마우스 돌리기 끔)
pub fn preset(p: Preset) -> EditKeymap {
    EditKeymap {
        keymap: preset_keymap(p),
        mouse_rotate: false,
    }
}

/// 「사용자」 배치를 기본 묶음에서 새로 시작한다(사이트 `customFrom`)
pub fn custom_from(p: Preset) -> EditKeymap {
    let mut e = preset(p);
    e.keymap.preset = Preset::Custom;
    e
}

/// 지금 배치를 「사용자」로(사이트 `toCustom`)
pub fn to_custom(e: &EditKeymap) -> EditKeymap {
    let mut out = e.clone();
    out.keymap.preset = Preset::Custom;
    out
}

/// 동작에 놓인 키 목록(사이트 `keysOf`, 키 이름 차례)
pub fn keys_of(e: &EditKeymap, action: &str) -> Vec<Chord> {
    let mut list: Vec<Chord> = e
        .keymap
        .bindings
        .iter()
        .filter(|b| b.action == action)
        .map(|b| Chord {
            code: b.code.clone(),
            mods: b.mods,
        })
        .collect();
    list.sort_by(|a, b| locale_cmp(&chord_key(&a.code, a.mods), &chord_key(&b.code, b.mods)));
    list
}

/// 키를 지정하기 전 겹침(사이트 `checkAssign`): 그 키에 지금 놓인 다른 동작과, 바꾸면 그 동작에 남는 키가 없는지
pub fn check_assign(e: &EditKeymap, action: &str, c: &Chord) -> Option<(String, bool)> {
    let current = lookup(&e.keymap, c)?;
    if current == action {
        return None;
    }
    let k = chord_key(&c.code, c.mods);
    let orphan = !e
        .keymap
        .bindings
        .iter()
        .any(|b| b.action == current && chord_key(&b.code, b.mods) != k);
    Some((current.to_string(), orphan))
}

/// 묻는 글(사이트 `conflictQuestion`)
pub fn conflict_question(key: &str, current: &str, next: &str, orphan: bool) -> String {
    let q = format!("{key} 키는 지금 「{current}」 동작이에요. 「{next}」 동작으로 바꿀까요?");
    if orphan {
        format!("{q} 바꾸면 「{current}」 동작에는 키가 없어요.")
    } else {
        q
    }
}

/// 바꾼 뒤 알림(사이트 `assignedText`)
pub fn assigned_text(key: &str, next: &str, replaced: Option<&str>, rest: &[String]) -> String {
    let head = format!("{key} 키를 「{next}」 동작에 놓았어요.");
    match replaced {
        None => head,
        Some(r) if rest.is_empty() => {
            format!("{head} 「{r}」 동작에는 이제 키가 없어요. 다른 키를 지정해 주세요.")
        }
        Some(r) => format!("{head} 「{r}」 동작은 남은 키({})로 쳐요.", rest.join("·")),
    }
}

/// 키가 겹치면 묻는 글, 아니면 None(설정 화면 키 지정: `checkAssign` → `conflictQuestion`)
pub fn ask_before_assign(e: &EditKeymap, action: &str, c: &Chord) -> Option<String> {
    check_assign(e, action, c).map(|(current, orphan)| {
        conflict_question(
            &chord_label(&c.code, c.mods),
            &action_label(&current),
            &action_label(action),
            orphan,
        )
    })
}

/// 키를 놓고 알림 글까지(설정 화면 `apply`: `assignKey` → `assignedText`)
pub fn assign(e: &EditKeymap, action: &str, c: &Chord) -> (EditKeymap, String) {
    let before = lookup(&e.keymap, c).map(str::to_string);
    let next = bind(e, c, action);
    let replaced = before.filter(|b| b != action);
    let rest: Vec<String> = replaced
        .as_deref()
        .map(|r| {
            keys_of(&next, r)
                .iter()
                .map(|k| chord_label(&k.code, k.mods))
                .collect()
        })
        .unwrap_or_default();
    let text = assigned_text(
        &chord_label(&c.code, c.mods),
        &action_label(action),
        replaced.as_deref().map(action_label).as_deref(),
        &rest,
    );
    (next, text)
}

/// 「기본으로 되돌리기」 뒤 알림(설정 화면)
pub fn reset_text(p: Preset) -> String {
    format!("「{}」 배치로 되돌렸어요.", preset_label(p))
}

/// 가져오기가 된 뒤 알림(설정 화면)
pub const IMPORTED_TEXT: &str = "배치를 가져왔어요.";

/// 칠 길이 하나도 없는 기본 동작(사이트 `keylessActions`)
pub fn keyless_actions(e: &EditKeymap, n: usize) -> Vec<String> {
    const CORE: [&str; 5] = ["face", "wide", "slice", "rotate", "command"];
    actions_for(n)
        .into_iter()
        .filter(|a| CORE.contains(&a.group) && !a.id.starts_with(|c: char| c.is_ascii_digit()))
        .filter(|a| {
            if a.group == "command" {
                e.keymap.bindings.iter().all(|b| b.action != a.id)
            } else {
                route_for(&e.keymap, n, &a.id, HOME_LAYERS).is_none()
            }
        })
        .map(|a| a.id)
        .collect()
}

/// 키 없는 동작 알림 글(설정 화면), 없으면 빈 글
pub fn keyless_text(keyless: &[String]) -> String {
    if keyless.is_empty() {
        return String::new();
    }
    let labels: Vec<String> = keyless.iter().map(|a| action_label(a)).collect();
    format!(
        "키가 없는 동작: {}. 「키 지정」으로 놓아 주세요.",
        labels.join(", ")
    )
}

/// 한 키에 서로 다른 동작이 둘 이상 놓인 곳(사이트 `findConflicts`, 처음 나온 키 차례)
pub fn find_conflicts(e: &EditKeymap) -> Vec<(String, Vec<String>)> {
    let mut by: Vec<(String, Vec<String>)> = vec![];
    for b in &e.keymap.bindings {
        let k = chord_key(&b.code, b.mods);
        match by.iter_mut().find(|x| x.0 == k) {
            Some(x) => {
                if !x.1.contains(&b.action) {
                    x.1.push(b.action.clone());
                }
            }
            None => by.push((k, vec![b.action.clone()])),
        }
    }
    by.into_iter().filter(|x| x.1.len() > 1).collect()
}

/// 겹친 키 알림 글(설정 화면), 없으면 빈 글
pub fn conflicts_text(e: &EditKeymap) -> String {
    let list = find_conflicts(e);
    if list.is_empty() {
        return String::new();
    }
    let parts: Vec<String> = list
        .iter()
        .map(|(k, a)| format!("{k}({})", a.join("·")))
        .collect();
    format!("겹친 키: {}", parts.join(", "))
}

// ── 저장 글·내보내기·가져오기(사이트 `storage.ts`) ──────────────

fn quote(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn binding_fields(b: &KeyBinding) -> Vec<(&'static str, String)> {
    let mut f = vec![("code", quote(&b.code))];
    if b.mods & SHIFT != 0 {
        f.push(("shift", "true".into()));
    }
    if b.mods & ALT != 0 {
        f.push(("alt", "true".into()));
    }
    if b.mods & CTRL != 0 {
        f.push(("ctrl", "true".into()));
    }
    f.push(("action", quote(&b.action)));
    f
}

/// `JSON.stringify(keymap)`(빈칸 없음). `stored`면 기본 묶음은 키 목록을 비운다(사이트 `saveKeymap`)
fn json_compact(e: &EditKeymap, stored: bool) -> String {
    let list: Vec<String> = if stored && e.keymap.preset != Preset::Custom {
        vec![]
    } else {
        e.keymap
            .bindings
            .iter()
            .map(|b| {
                let f: Vec<String> = binding_fields(b)
                    .into_iter()
                    .map(|(k, v)| format!("\"{k}\":{v}"))
                    .collect();
                format!("{{{}}}", f.join(","))
            })
            .collect()
    };
    format!(
        "{{\"version\":1,\"preset\":{},\"bindings\":[{}],\"mouseRotate\":{}}}",
        quote(e.keymap.preset.id()),
        list.join(","),
        e.mouse_rotate
    )
}

/// 앱 저장소에 쓸 글(사이트 `saveKeymap`)
pub fn stored_json(e: &EditKeymap) -> String {
    json_compact(e, true)
}

/// 내보내기 글(사이트 `exportKeymap`, `JSON.stringify(keymap, null, 2)`)
pub fn export_keymap(e: &EditKeymap) -> String {
    let bindings = if e.keymap.bindings.is_empty() {
        "[]".to_string()
    } else {
        let items: Vec<String> = e
            .keymap
            .bindings
            .iter()
            .map(|b| {
                let f: Vec<String> = binding_fields(b)
                    .into_iter()
                    .map(|(k, v)| format!("      \"{k}\": {v}"))
                    .collect();
                format!("    {{\n{}\n    }}", f.join(",\n"))
            })
            .collect();
        format!("[\n{}\n  ]", items.join(",\n"))
    };
    format!(
        "{{\n  \"version\": 1,\n  \"preset\": {},\n  \"bindings\": {bindings},\n  \"mouseRotate\": {}\n}}",
        quote(e.keymap.preset.id()),
        e.mouse_rotate
    )
}

/// 가져오기(사이트 `importKeymap`). 모양이 맞지 않으면 까닭 글
pub fn import_keymap(text: &str) -> Result<EditKeymap, String> {
    let err = |s: &str| Err(s.to_string());
    let Some(data) = json::parse(text) else {
        return err("JSON 글이 아니에요.");
    };
    let json::Json::Obj(_) = &data else {
        return err("배치 모양이 아니에요.");
    };
    if !matches!(data.get("version"), Some(json::Json::Num(v)) if *v == 1.0) {
        return err("지원하지 않는 배치 판이에요.");
    }
    let named = match data.get("preset") {
        Some(json::Json::Str(s)) => Preset::from_id(s),
        _ => None,
    };
    let Some(preset_id) = named else {
        return err("배치 묶음 이름이 맞지 않아요.");
    };
    let opt_bool = |v: Option<&json::Json>| matches!(v, None | Some(json::Json::Bool(_)));
    if !opt_bool(data.get("mouseRotate")) {
        return err("mouseRotate는 참·거짓이어야 해요.");
    }
    let mouse_rotate = matches!(data.get("mouseRotate"), Some(json::Json::Bool(true)));
    if preset_id != Preset::Custom {
        return Ok(preset(preset_id));
    }
    let Some(json::Json::Arr(raw)) = data.get("bindings") else {
        return err("키 목록이 없어요.");
    };
    if raw.len() > 500 {
        return err("키가 너무 많아요.");
    }
    let mut bindings = vec![];
    for (i, b) in raw.iter().enumerate() {
        let code = match b.get("code") {
            Some(json::Json::Str(s)) => Some(s.as_str()),
            _ => None,
        };
        let shape_ok = matches!(b, json::Json::Obj(_))
            && code.is_some_and(|c| {
                (1..=32).contains(&c.chars().count())
                    && c.chars().all(|ch| ch.is_ascii_alphanumeric())
            })
            && opt_bool(b.get("shift"))
            && opt_bool(b.get("alt"))
            && opt_bool(b.get("ctrl"));
        if !shape_ok {
            return Err(format!("{}번째 키 모양이 맞지 않아요.", i + 1));
        }
        let action = match b.get("action") {
            Some(json::Json::Str(s)) if is_known_action(s) => s.clone(),
            other => {
                return Err(format!(
                    "{}번째 키의 동작({})을 몰라요.",
                    i + 1,
                    other.map_or("undefined".to_string(), json::js_string)
                ))
            }
        };
        let flag = |k: &str| matches!(b.get(k), Some(json::Json::Bool(true)));
        bindings.push(KeyBinding {
            code: code.unwrap_or_default().to_string(),
            mods: (if flag("shift") { SHIFT } else { 0 })
                | (if flag("alt") { ALT } else { 0 })
                | (if flag("ctrl") { CTRL } else { 0 }),
            action,
        });
    }
    Ok(EditKeymap {
        keymap: Keymap {
            preset: Preset::Custom,
            bindings,
        },
        mouse_rotate,
    })
}

/// 저장소 글 → 편집할 배치(사이트 `loadKeymap`: 없거나 읽을 수 없으면 「두 손」)
pub fn load(stored: Option<&str>) -> EditKeymap {
    stored
        .and_then(|t| (!t.is_empty()).then(|| import_keymap(t).ok()).flatten())
        .unwrap_or_else(|| preset(Preset::TwoHand))
}

/// `JSON.parse`가 받는 글만 받는 작은 읽기(가져오기 검증용)
pub mod json {
    #[derive(Clone, Debug, PartialEq)]
    pub enum Json {
        Null,
        Bool(bool),
        Num(f64),
        Str(String),
        Arr(Vec<Json>),
        Obj(Vec<(String, Json)>),
    }

    impl Json {
        /// 같은 이름이 여럿이면 뒤의 것(`JSON.parse`와 같다)
        pub fn get(&self, k: &str) -> Option<&Json> {
            match self {
                Json::Obj(m) => m.iter().rev().find(|(key, _)| key == k).map(|(_, v)| v),
                _ => None,
            }
        }
    }

    /// 자바스크립트 `String(v)`
    pub fn js_string(v: &Json) -> String {
        match v {
            Json::Null => "null".into(),
            Json::Bool(b) => b.to_string(),
            Json::Num(n) => {
                if n.fract() == 0.0 && n.abs() < 1e21 {
                    format!("{}", *n as i64)
                } else {
                    format!("{n}")
                }
            }
            Json::Str(s) => s.clone(),
            Json::Arr(a) => a
                .iter()
                .map(|x| match x {
                    Json::Null => String::new(),
                    other => js_string(other),
                })
                .collect::<Vec<_>>()
                .join(","),
            Json::Obj(_) => "[object Object]".into(),
        }
    }

    struct P<'a> {
        s: &'a [u8],
        i: usize,
    }

    impl P<'_> {
        fn ws(&mut self) {
            while self.i < self.s.len() && matches!(self.s[self.i], b' ' | b'\t' | b'\n' | b'\r') {
                self.i += 1;
            }
        }
        fn eat(&mut self, lit: &[u8]) -> Option<()> {
            if self.s[self.i..].starts_with(lit) {
                self.i += lit.len();
                Some(())
            } else {
                None
            }
        }
        fn value(&mut self, depth: usize) -> Option<Json> {
            if depth > 512 {
                return None;
            }
            self.ws();
            match *self.s.get(self.i)? {
                b'n' => self.eat(b"null").map(|_| Json::Null),
                b't' => self.eat(b"true").map(|_| Json::Bool(true)),
                b'f' => self.eat(b"false").map(|_| Json::Bool(false)),
                b'"' => self.string().map(Json::Str),
                b'[' => {
                    self.i += 1;
                    let mut out = vec![];
                    self.ws();
                    if self.s.get(self.i) == Some(&b']') {
                        self.i += 1;
                        return Some(Json::Arr(out));
                    }
                    loop {
                        out.push(self.value(depth + 1)?);
                        self.ws();
                        match *self.s.get(self.i)? {
                            b',' => self.i += 1,
                            b']' => {
                                self.i += 1;
                                return Some(Json::Arr(out));
                            }
                            _ => return None,
                        }
                    }
                }
                b'{' => {
                    self.i += 1;
                    let mut out = vec![];
                    self.ws();
                    if self.s.get(self.i) == Some(&b'}') {
                        self.i += 1;
                        return Some(Json::Obj(out));
                    }
                    loop {
                        self.ws();
                        if self.s.get(self.i) != Some(&b'"') {
                            return None;
                        }
                        let k = self.string()?;
                        self.ws();
                        if self.s.get(self.i) != Some(&b':') {
                            return None;
                        }
                        self.i += 1;
                        let v = self.value(depth + 1)?;
                        out.push((k, v));
                        self.ws();
                        match *self.s.get(self.i)? {
                            b',' => self.i += 1,
                            b'}' => {
                                self.i += 1;
                                return Some(Json::Obj(out));
                            }
                            _ => return None,
                        }
                    }
                }
                _ => self.number(),
            }
        }
        fn number(&mut self) -> Option<Json> {
            let start = self.i;
            let digits = |p: &mut Self| {
                let s = p.i;
                while p.i < p.s.len() && p.s[p.i].is_ascii_digit() {
                    p.i += 1;
                }
                p.i > s
            };
            if self.s.get(self.i) == Some(&b'-') {
                self.i += 1;
            }
            if self.s.get(self.i) == Some(&b'0') {
                self.i += 1;
            } else if !digits(self) {
                return None;
            }
            if self.s.get(self.i) == Some(&b'.') {
                self.i += 1;
                if !digits(self) {
                    return None;
                }
            }
            if matches!(self.s.get(self.i), Some(b'e' | b'E')) {
                self.i += 1;
                if matches!(self.s.get(self.i), Some(b'+' | b'-')) {
                    self.i += 1;
                }
                if !digits(self) {
                    return None;
                }
            }
            std::str::from_utf8(&self.s[start..self.i])
                .ok()?
                .parse()
                .ok()
                .map(Json::Num)
        }
        fn hex4(&mut self) -> Option<u32> {
            let h = std::str::from_utf8(self.s.get(self.i..self.i + 4)?).ok()?;
            if !h.bytes().all(|c| c.is_ascii_hexdigit()) {
                return None;
            }
            self.i += 4;
            u32::from_str_radix(h, 16).ok()
        }
        fn string(&mut self) -> Option<String> {
            self.i += 1;
            let mut units: Vec<u16> = vec![];
            loop {
                let c = *self.s.get(self.i)?;
                match c {
                    b'"' => {
                        self.i += 1;
                        return Some(String::from_utf16_lossy(&units));
                    }
                    b'\\' => {
                        self.i += 1;
                        let e = *self.s.get(self.i)?;
                        self.i += 1;
                        let u = match e {
                            b'"' => '"' as u32,
                            b'\\' => '\\' as u32,
                            b'/' => '/' as u32,
                            b'b' => 8,
                            b'f' => 12,
                            b'n' => 10,
                            b'r' => 13,
                            b't' => 9,
                            b'u' => self.hex4()?,
                            _ => return None,
                        };
                        units.push(u as u16);
                    }
                    0..=0x1f => return None,
                    _ => {
                        let rest = std::str::from_utf8(&self.s[self.i..]).ok()?;
                        let ch = rest.chars().next()?;
                        self.i += ch.len_utf8();
                        let mut buf = [0u16; 2];
                        units.extend_from_slice(ch.encode_utf16(&mut buf));
                    }
                }
            }
        }
    }

    pub fn parse(text: &str) -> Option<Json> {
        let mut p = P {
            s: text.as_bytes(),
            i: 0,
        };
        let v = p.value(0)?;
        p.ws();
        (p.i == p.s.len()).then_some(v)
    }
}
