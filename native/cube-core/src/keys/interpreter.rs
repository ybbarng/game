//! 키 누름을 수·명령으로 바꾸는 해석기(`apps/web/src/cube/input/interpreter.ts`).

use super::actions::{
    canonical_notation, is_available, notation_to_move, parse_action, with_depth, Command, Hand,
    ParsedAction,
};
use super::keymap::{resolve_action, KeyInput, Keymap};
use crate::notation::CubeMove;

/// 키 하나를 처리한 결과
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum KeyResult {
    /// 수: 동작 이름, 기록에 적는 가장 짧은 이름, 계약의 수
    Move {
        action: String,
        notation: String,
        mv: CubeMove,
    },
    /// 다음 수 깊이를 기억함
    Depth {
        action: String,
        depth: usize,
    },
    /// 층 수가 바뀜(왼손 L·Lw, 오른손 R·Rw 키가 돌리는 바깥 층 수)
    Layers {
        action: String,
        left: usize,
        right: usize,
    },
    Command {
        action: String,
        command: Command,
    },
}

/// 「다음 수 깊이」를 기억했다가 다음 면 수에 붙이고, 큰 큐브의 층 수를 들고 있는다.
/// 크기 n에서 쓸 수 없는 동작이면 None(키를 먹지 않는다)
#[derive(Clone, Debug)]
pub struct KeyInterpreter {
    pub n: usize,
    keymap: Keymap,
    depth: Option<usize>,
    left: usize,
    right: usize,
}

impl KeyInterpreter {
    pub fn new(n: usize, keymap: Keymap) -> Self {
        KeyInterpreter {
            n,
            keymap,
            depth: None,
            left: 1,
            right: 1,
        }
    }

    pub fn set_keymap(&mut self, keymap: Keymap) {
        self.keymap = keymap;
        self.depth = None;
    }

    pub fn keymap(&self) -> &Keymap {
        &self.keymap
    }

    /// 기억해 둔 다음 수 깊이
    pub fn pending_depth(&self) -> Option<usize> {
        self.depth
    }

    /// (왼손, 오른손) 층 수
    pub fn layers(&self) -> (usize, usize) {
        (self.left, self.right)
    }

    pub fn handle(&mut self, input: &KeyInput) -> Option<KeyResult> {
        let action = resolve_action(&self.keymap, input)?.to_string();
        self.run(&action)
    }

    /// 동작 이름을 바로 처리한다
    pub fn run(&mut self, action: &str) -> Option<KeyResult> {
        if !is_available(self.n, action) {
            return None;
        }
        let owned = action.to_string();
        match parse_action(action)? {
            ParsedAction::Depth(depth) => {
                self.depth = Some(depth);
                Some(KeyResult::Depth {
                    action: owned,
                    depth,
                })
            }
            ParsedAction::Layers { hand, delta } => {
                let max = self.n as i32 - 1;
                let clamp = |v: usize| (v as i32 + delta).clamp(1, max) as usize;
                match hand {
                    Hand::Left => self.left = clamp(self.left),
                    Hand::Right => self.right = clamp(self.right),
                }
                Some(KeyResult::Layers {
                    action: owned,
                    left: self.left,
                    right: self.right,
                })
            }
            ParsedAction::Command(command) => {
                self.depth = None;
                if matches!(command, Command::Reset | Command::Scramble) {
                    self.left = 1;
                    self.right = 1;
                }
                Some(KeyResult::Command {
                    action: owned,
                    command,
                })
            }
            ParsedAction::Move(text) => {
                let depth = self.depth.take();
                let raw = match depth {
                    None => with_layers(text, self.left, self.right),
                    Some(d) => with_depth(text, d),
                };
                let notation = canonical_notation(self.n, &raw);
                let mv = notation_to_move(self.n, &notation)?;
                Some(KeyResult::Move {
                    action: owned,
                    notation,
                    mv,
                })
            }
        }
    }
}

/// 층 수를 붙인다(csTimer와 같음): R·L 키는 바깥 k층, Rw·Lw(r·l)는 k+1층. 안쪽 한 층 키(`2R`·`2L`)는 잡은 층 바로
/// 안쪽 한 층. 다른 면·가운데 층·큐브 돌리기는 그대로
pub fn with_layers(notation: &str, left: usize, right: usize) -> String {
    let hand = |face: u8| if face == b'R' { right } else { left };
    let tail_ok = |t: &str| matches!(t, "" | "2" | "'");
    let b = notation.as_bytes();
    if b.len() >= 2 && b[0] == b'2' && matches!(b[1], b'R' | b'L') && tail_ok(&notation[2..]) {
        return format!("{}{}{}", hand(b[1]) + 1, b[1] as char, &notation[2..]);
    }
    let (face, wide, sfx) = match b.first() {
        Some(&f @ (b'R' | b'L')) => match notation[1..].strip_prefix('w') {
            Some(t) if tail_ok(t) => (f, true, t),
            None if tail_ok(&notation[1..]) => (f, false, &notation[1..]),
            _ => return notation.to_string(),
        },
        Some(&f @ (b'r' | b'l')) if tail_ok(&notation[1..]) => {
            (f.to_ascii_uppercase(), true, &notation[1..])
        }
        _ => return notation.to_string(),
    };
    let k = hand(face) + usize::from(wide);
    let f = face as char;
    match k {
        1 => format!("{f}{sfx}"),
        2 => format!("{f}w{sfx}"),
        _ => format!("{k}{f}w{sfx}"),
    }
}
