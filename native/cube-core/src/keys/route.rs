//! 표기 한 수를 지금 배치에서 어떤 키 차례로 치는가(`apps/web/src/cube/keys/move-keys.ts`의 `normalizeMove`·
//! `keysForMove`·`keycapLabel`, `keys/reach.ts`의 `routeFor`·`routesAt`·`HOME_LAYERS`). 앱 힌트 말풍선의 키캡 줄
//! (「I J K」)과 공식 연습의 키 비용이 쓴다.
//!
//! - 그 수를 일으키는 키 하나, 없으면 같은 층을 도는 키를 두 번(R2), 없으면 깊이 키 + 면 키, 없으면 그것을 두 번
//! - 층 수 키(`layers:*`)를 든 「사용자」 배치의 4×4 이상은 층 수를 바꾼 뒤 면 키(층 수는 그대로 남는다)

use super::actions::{
    canonical_notation, is_available, notation_to_move, parse_action, with_depth, ParsedAction,
};
use super::interpreter::with_layers;
use super::keymap::{KeyBinding, Keymap, ALT, CTRL, SHIFT};
use crate::notation::CubeMove;

/// 키 하나(조합 키 포함)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KeyChord<'a> {
    pub code: &'a str,
    /// [`SHIFT`]·[`ALT`]·[`CTRL`]을 더한 값
    pub mods: u8,
}

impl KeyChord<'_> {
    pub fn modifier_count(&self) -> u32 {
        [SHIFT, ALT, CTRL]
            .iter()
            .filter(|&&m| self.mods & m != 0)
            .count() as u32
    }
}

/// 큰 큐브의 층 수(왼손 L·Lw, 오른손 R·Rw 키가 함께 돌리는 바깥 층 수, 사이트 `HandLayers`)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HandLayers {
    pub left: usize,
    pub right: usize,
}

pub const HOME_LAYERS: HandLayers = HandLayers { left: 1, right: 1 };

/// 키 차례 하나와 다 친 뒤의 층 수(사이트 `KeyRoute`)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KeyRoute<'a> {
    pub presses: Vec<KeyChord<'a>>,
    pub layers: HandLayers,
}

fn bare(b: &KeyBinding) -> KeyChord<'_> {
    KeyChord {
        code: &b.code,
        mods: b.mods,
    }
}

/// 공식 글의 한 수를 배치가 읽는 이름으로(사이트 `normalizeMove`): 소문자 넓게는 `Rw` 꼴, `R2'`는 `R2`
pub fn normalize_move(notation: &str) -> String {
    let mut t = notation.trim().to_string();
    if t.ends_with("2'") {
        t.pop();
    }
    let b = t.as_bytes();
    if !b.is_empty() && b"rludfb".contains(&b[0]) && matches!(&t[1..], "" | "2" | "'") {
        return format!("{}w{}", (b[0] as char).to_ascii_uppercase(), &t[1..]);
    }
    t
}

/// 동작 하나를 그 층 수(또는 깊이)에서 쳤을 때 도는 수(사이트 `playedMove`)
fn played_move(
    n: usize,
    action: &str,
    layers: HandLayers,
    depth: Option<usize>,
) -> Option<CubeMove> {
    if !is_available(n, action) {
        return None;
    }
    let ParsedAction::Move(notation) = parse_action(action)? else {
        return None;
    };
    let raw = match depth {
        None => with_layers(notation, layers.left, layers.right),
        Some(d) => with_depth(notation, d),
    };
    notation_to_move(n, &canonical_notation(n, &raw))
}

fn same_layers(a: &CubeMove, b: &CubeMove) -> bool {
    a.axis == b.axis && a.from == b.from && a.to == b.to
}

/// 수 이름의 글자(`3Rw'` → R, `M` → M)
fn letter_of(notation: &str) -> Option<char> {
    notation
        .chars()
        .find(|c| "RLUDFBMESXYZ".contains(c.to_ascii_uppercase()))
        .map(|c| c.to_ascii_uppercase())
}

struct Way<'a> {
    presses: Vec<KeyChord<'a>>,
    rank: [u32; 3],
}

/// 층 수 하나에서 그 수를 치는 길들(층 수 키 없이, 사이트 `routesAt`)
fn routes_at<'k>(
    keymap: &'k Keymap,
    n: usize,
    target: &CubeMove,
    letter: Option<char>,
    layers: HandLayers,
) -> Vec<Vec<KeyChord<'k>>> {
    let mut direct: Vec<Way> = vec![];
    let mut double: Vec<Way> = vec![];
    let mut deep: Vec<Way> = vec![];
    let mut deep_double: Vec<Way> = vec![];
    // 바깥 면 한 층·큐브 전체는 깊이 길로 찾지 않는다
    let outer = (target.from == target.to && (target.from == 1 || target.from == n))
        || (target.from == 1 && target.to == n);
    let mods = |b: &KeyBinding| bare(b).modifier_count();
    let all_depth: Vec<&KeyBinding> = keymap
        .bindings
        .iter()
        .filter(|b| matches!(parse_action(&b.action), Some(ParsedAction::Depth(_))))
        .collect();
    let depth_keys: Vec<&KeyBinding> = if outer {
        vec![]
    } else {
        all_depth
            .iter()
            .copied()
            .filter(|b| {
                mods(b) == 0
                    || !all_depth
                        .iter()
                        .any(|o| o.action == b.action && mods(o) == 0)
            })
            .collect()
    };
    let slice_face = match letter {
        Some('M') => Some('L'),
        Some('E') => Some('D'),
        Some('S') => Some('F'),
        _ => None,
    };
    let rank = |action: &str, presses: &[KeyChord], ccw: bool| -> [u32; 3] {
        let l = letter_of(action);
        [
            if l == letter {
                0
            } else if l.is_some() && l == slice_face {
                1
            } else {
                2
            },
            presses.iter().map(KeyChord::modifier_count).sum(),
            u32::from(ccw),
        ]
    };
    for b in &keymap.bindings {
        let m = played_move(n, &b.action, layers, None);
        if let Some(m) = m.filter(|m| same_layers(m, target)) {
            if m.turns == target.turns {
                let presses = vec![bare(b)];
                let r = rank(&b.action, &presses, false);
                direct.push(Way { presses, rank: r });
            } else if target.turns == 2 && m.turns != 2 {
                let presses = vec![bare(b), bare(b)];
                let r = rank(&b.action, &presses, m.turns == 3);
                double.push(Way { presses, rank: r });
            }
        }
        for d in &depth_keys {
            let Some(ParsedAction::Depth(depth)) = parse_action(&d.action) else {
                continue;
            };
            let Some(dm) = played_move(n, &b.action, layers, Some(depth)) else {
                continue;
            };
            // 깊이를 붙여도 그대로인 키(가운데 층·큐브 돌리기)는 바로 친 길에 이미 있다
            let same = m.is_some_and(|m| same_layers(&dm, &m) && dm.turns == m.turns);
            if same || !same_layers(&dm, target) {
                continue;
            }
            if dm.turns == target.turns {
                let presses = vec![bare(d), bare(b)];
                let r = rank(&b.action, &presses, false);
                deep.push(Way { presses, rank: r });
            } else if target.turns == 2 && dm.turns != 2 {
                let presses = vec![bare(d), bare(b), bare(d), bare(b)];
                let r = rank(&b.action, &presses, b.action.ends_with('\''));
                deep_double.push(Way { presses, rank: r });
            }
        }
    }
    // 앞 무리에 길이 있으면 그것만
    let doubled =
        direct.is_empty() && (!double.is_empty() || (deep.is_empty() && !deep_double.is_empty()));
    let mut first = [direct, double, deep, deep_double]
        .into_iter()
        .find(|l| !l.is_empty())
        .unwrap_or_default();
    first.sort_by(|a, b| a.rank.cmp(&b.rank));
    // 공식과 같은 글자의 키가 있으면 그것만
    let best = first.first().map(|o| o.rank[0]);
    let sorted: Vec<Vec<KeyChord>> = first
        .into_iter()
        .filter(|o| Some(o.rank[0]) == best)
        .map(|o| o.presses)
        .collect();
    // 반 바퀴는 어느 쪽 키든 맞지만 글로는 하나만
    if doubled {
        sorted.into_iter().take(1).collect()
    } else {
        sorted
    }
}

/// 층 수를 바꾸는 키: L+ L- R+ R- 차례, 없는 것은 None. 큰 큐브가 아니거나 하나도 없으면 None
fn layer_keys(keymap: &Keymap, n: usize) -> Option<[Option<KeyChord<'_>>; 4]> {
    if n < 4 {
        return None;
    }
    let out = ["layers:L+", "layers:L-", "layers:R+", "layers:R-"]
        .map(|a| keymap.bindings.iter().find(|b| b.action == a).map(bare));
    out.iter().any(Option::is_some).then_some(out)
}

/// 층 수 from → to로 가는 키(못 가면 None). 왼손 먼저
fn layer_path<'k>(
    keys: &[Option<KeyChord<'k>>; 4],
    from: HandLayers,
    to: HandLayers,
) -> Option<Vec<KeyChord<'k>>> {
    let mut out = vec![];
    for (side, a, b) in [(0, from.left, to.left), (2, from.right, to.right)] {
        if a == b {
            continue;
        }
        let k = keys[side + usize::from(b < a)]?;
        out.extend(std::iter::repeat_n(k, a.abs_diff(b)));
    }
    Some(out)
}

/// 층 수 `from`에서 그 수를 치는 가장 짧은 길(층 수 키 포함, 사이트 `routeFor`). 못 치면 None
pub fn route_for<'k>(
    keymap: &'k Keymap,
    n: usize,
    notation: &str,
    from: HandLayers,
) -> Option<KeyRoute<'k>> {
    if !is_available(n, notation) {
        return None;
    }
    let target = notation_to_move(n, &canonical_notation(n, notation))?;
    let letter = letter_of(notation);
    if let Some(here) = routes_at(keymap, n, &target, letter, from)
        .into_iter()
        .next()
    {
        return Some(KeyRoute {
            presses: here,
            layers: from,
        });
    }
    let keys = layer_keys(keymap, n)?;
    let mut best: Option<(KeyRoute, usize)> = None;
    for left in 1..n {
        for right in 1..n {
            let cost = left.abs_diff(from.left) + right.abs_diff(from.right);
            if cost == 0 || best.as_ref().is_some_and(|(_, c)| cost > *c) {
                continue;
            }
            let to = HandLayers { left, right };
            let Some(path) = layer_path(&keys, from, to) else {
                continue;
            };
            let Some(tail) = routes_at(keymap, n, &target, letter, to).into_iter().next() else {
                continue;
            };
            let mut presses = path;
            presses.extend(tail);
            let better = match &best {
                None => true,
                Some((r, c)) => cost < *c || presses.len() < r.presses.len(),
            };
            if better {
                best = Some((
                    KeyRoute {
                        presses,
                        layers: to,
                    },
                    cost,
                ));
            }
        }
    }
    best.map(|(r, _)| r)
}

/// 수 하나(표기) → 그 배치에서 치는 키 차례(사이트 `keysForMove`). 쓸 수 없거나 놓인 키가 없으면 None
pub fn keys_for_move<'k>(
    keymap: &'k Keymap,
    n: usize,
    notation: &str,
) -> Option<Vec<KeyChord<'k>>> {
    keys_for_move_from(keymap, n, notation, HOME_LAYERS)
}

/// [`keys_for_move`]를 지금 손이 잡은 층 수에서
pub fn keys_for_move_from<'k>(
    keymap: &'k Keymap,
    n: usize,
    notation: &str,
    layers: HandLayers,
) -> Option<Vec<KeyChord<'k>>> {
    route_for(keymap, n, &normalize_move(notation), layers).map(|r| r.presses)
}

/// 키 하나를 키캡에 넣을 짧은 글로(`⇧I`, `Alt+R`, `;`, 사이트 `keycapLabel`)
pub fn keycap_label(c: &KeyChord) -> String {
    let code = c.code;
    let base = if let Some(k) = code.strip_prefix("Key") {
        k
    } else if let Some(d) = code.strip_prefix("Digit") {
        d
    } else {
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
            other => other,
        }
    };
    format!(
        "{}{}{}{base}",
        if c.mods & CTRL != 0 { "Ctrl+" } else { "" },
        if c.mods & ALT != 0 { "Alt+" } else { "" },
        if c.mods & SHIFT != 0 { "⇧" } else { "" },
    )
}

/// 공식 한 수의 키캡 줄(「I I」). 키가 없으면 None(사이트는 「?」로 보인다)
pub fn keycaps_for_move(keymap: &Keymap, n: usize, notation: &str) -> Option<String> {
    keys_for_move(keymap, n, notation)
        .map(|keys| keys.iter().map(keycap_label).collect::<Vec<_>>().join(" "))
}
