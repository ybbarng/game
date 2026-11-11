//! 혼자 맞추기 한 판(그리기 장치와 상관없음): 키 → 코어 해석기 → 수, 섞기(코어 섞기), 되돌리기, 맞춤 판정, 돌리는 연출 줄.
//!
//! 논리 상태(`state`)는 수를 받는 즉시 바뀌고, 화면 상태(`shown`)는 돌리는 연출이 끝날 때마다 따라간다. 시간은 밖에서
//! 넣어 준다(ms). 그래서 시험은 시간을 직접 넣어 연출이 끝난 순간을 정확히 본다.

use std::collections::VecDeque;

use cube_core::keys::{two_hand_keymap, Command, KeyInput, KeyInterpreter, KeyResult};
use cube_core::scramble::{scramble, ScrambleEvent};
use cube_core::state::{apply_move, is_solved, State};
use cube_core::{parse_moves, solved_cube, CubeMove};

/// 한 수를 돌리는 시간(사이트 설정 기본값 `moveMs`)
pub const MOVE_MS: f64 = 90.0;
/// 줄이 이보다 길면 앞의 수는 그리지 않고 바로 넘긴다(사이트 `MAX_BACKLOG`)
pub const MAX_BACKLOG: usize = 4;

/// 키 하나를 처리한 결과(앱에 알릴 것)
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Outcome {
    /// 키를 먹지 않음(배치에 없거나 이 크기에서 쓸 수 없음)
    Ignored,
    /// 키를 먹었지만 상태는 그대로(깊이·층 수, 이 시제품이 다루지 않는 명령)
    Consumed,
    /// 수를 둠. `solved`는 섞인 큐브를 이 수로 다 맞췄을 때
    Moved {
        notation: String,
        solved: bool,
    },
    Scrambled {
        text: String,
    },
    Reset,
}

pub struct Game {
    pub n: usize,
    interp: KeyInterpreter,
    state: State,
    /// 섞은 뒤 둔 수(되돌리기·수 세기)
    history: Vec<CubeMove>,
    scrambled: bool,
    /// 화면에 보이는 상태와 남은 연출
    shown: State,
    queue: VecDeque<CubeMove>,
    turning: Option<(CubeMove, f64)>,
    /// 연출 없이 한 번 다시 그려야 함(섞기·맞춘 상태로·창 크기)
    dirty: bool,
}

impl Game {
    pub fn new(n: usize) -> Self {
        Game {
            n,
            interp: KeyInterpreter::new(n, two_hand_keymap()),
            state: solved_cube(n),
            history: vec![],
            scrambled: false,
            shown: solved_cube(n),
            queue: VecDeque::new(),
            turning: None,
            dirty: true,
        }
    }

    pub fn state(&self) -> &State {
        &self.state
    }

    pub fn is_solved(&self) -> bool {
        is_solved(self.n, &self.state)
    }

    pub fn move_count(&self) -> usize {
        self.history.len()
    }

    /// 키 누름 하나
    pub fn key(&mut self, input: &KeyInput, seed: u32) -> Outcome {
        match self.interp.handle(input) {
            None => Outcome::Ignored,
            Some(KeyResult::Move { notation, mv, .. }) => {
                let solved = self.play(mv);
                Outcome::Moved { notation, solved }
            }
            Some(KeyResult::Command { command, .. }) => match command {
                Command::Scramble => self.scramble(seed),
                Command::Reset => {
                    self.reset();
                    Outcome::Reset
                }
                Command::Undo => match self.history.pop() {
                    Some(m) => {
                        let inv = m.inverse();
                        self.state = apply_move(self.n, &self.state, &inv);
                        self.queue.push_back(inv);
                        Outcome::Moved {
                            notation: String::new(),
                            solved: false,
                        }
                    }
                    None => Outcome::Consumed,
                },
                _ => Outcome::Consumed,
            },
            Some(_) => Outcome::Consumed,
        }
    }

    /// 수 하나를 둔다. 섞인 큐브를 다 맞췄으면 true
    pub fn play(&mut self, m: CubeMove) -> bool {
        self.state = apply_move(self.n, &self.state, &m);
        self.history.push(m);
        self.queue.push_back(m);
        if self.scrambled && self.is_solved() {
            self.scrambled = false;
            return true;
        }
        false
    }

    /// 코어 섞기(같은 씨앗이면 사이트와 같은 섞기). 연출 없이 바로 섞인 모습으로
    pub fn scramble(&mut self, seed: u32) -> Outcome {
        let event = match self.n {
            2 => ScrambleEvent::from_id("222"),
            4 => ScrambleEvent::from_id("444"),
            5 => ScrambleEvent::from_id("555"),
            6 => ScrambleEvent::from_id("666"),
            7 => ScrambleEvent::from_id("777"),
            _ => ScrambleEvent::from_id("333"),
        }
        .expect("종목");
        let s = scramble(event, seed);
        let moves = parse_moves(self.n, &s.text).expect("섞기 글");
        let mut st = solved_cube(self.n);
        for m in &moves {
            st = apply_move(self.n, &st, m);
        }
        self.jump(st);
        self.scrambled = true;
        Outcome::Scrambled { text: s.text }
    }

    pub fn reset(&mut self) {
        self.jump(solved_cube(self.n));
        self.scrambled = false;
    }

    fn jump(&mut self, st: State) {
        self.state = st.clone();
        self.shown = st;
        self.history.clear();
        self.queue.clear();
        self.turning = None;
        self.dirty = true;
    }

    /// 다시 그려야 할 때(창 크기·보임이 바뀜)
    pub fn invalidate(&mut self) {
        self.dirty = true;
    }

    /// 지금 그릴 것이 있나(돌리는 중이거나 다시 그려야 함). 없으면 앱은 그리기를 멈춘다
    pub fn needs_frame(&self) -> bool {
        self.dirty || self.turning.is_some() || !self.queue.is_empty()
    }

    /// 화면에 보이는 상태(돌리는 중인 수는 아직 넣지 않은 것)
    pub fn shown(&self) -> &State {
        &self.shown
    }

    /// 시각 `now`(ms)의 화면: 돌리는 중인 수와 진행 0..1(보이는 상태는 [`Game::shown`]). 끝난 연출은 화면 상태에 넣는다
    pub fn frame(&mut self, now: f64) -> Option<(CubeMove, f32)> {
        self.dirty = false;
        loop {
            if let Some((m, start)) = self.turning {
                let p = (now - start) / MOVE_MS;
                if p < 1.0 {
                    let e = ease_in_out(p.max(0.0) as f32);
                    return Some((m, e));
                }
                self.shown = apply_move(self.n, &self.shown, &m);
                self.turning = None;
                continue;
            }
            // 밀린 수가 많으면 앞의 것은 바로 넘긴다
            while self.queue.len() > MAX_BACKLOG {
                let m = self.queue.pop_front().expect("줄");
                self.shown = apply_move(self.n, &self.shown, &m);
            }
            match self.queue.pop_front() {
                Some(m) => self.turning = Some((m, now)),
                None => return None,
            }
        }
    }
}

/// 사이트 `easeInOut`(세제곱)
pub fn ease_in_out(p: f32) -> f32 {
    if p < 0.5 {
        4.0 * p * p * p
    } else {
        1.0 - (-2.0 * p + 2.0).powi(3) / 2.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(code: &str) -> KeyInput<'_> {
        KeyInput {
            code,
            ..Default::default()
        }
    }

    #[test]
    fn keys_turn_the_cube_and_undo() {
        let mut g = Game::new(3);
        // 두 손: I = R, J = U
        assert!(
            matches!(g.key(&key("KeyI"), 0), Outcome::Moved { ref notation, .. } if notation == "R")
        );
        assert!(
            matches!(g.key(&key("KeyJ"), 0), Outcome::Moved { ref notation, .. } if notation == "U")
        );
        assert_eq!(g.move_count(), 2);
        assert_eq!(g.key(&key("Tab"), 0), Outcome::Ignored);
        g.key(&key("Backspace"), 0);
        g.key(&key("Backspace"), 0);
        assert!(g.is_solved());
        assert_eq!(g.move_count(), 0);
    }

    #[test]
    fn scramble_then_solve_reports_once() {
        let mut g = Game::new(3);
        assert!(matches!(
            g.key(&key("Enter"), 42),
            Outcome::Scrambled { .. }
        ));
        assert!(!g.is_solved());
        // 섞기를 거꾸로 두면 맞는다
        let text = scramble(ScrambleEvent::from_id("333").unwrap(), 42).text;
        let inverse = cube_core::notation::invert_moves(&parse_moves(3, &text).unwrap());
        let last = inverse.len() - 1;
        for (i, m) in inverse.into_iter().enumerate() {
            assert_eq!(g.play(m), i == last);
        }
        assert!(g.is_solved());
        // 맞춘 뒤 다시 돌려 맞춰도 또 알리지 않는다(섞어야 다시 센다)
        g.key(&key("KeyI"), 0);
        assert!(matches!(
            g.key(&key("KeyK"), 0),
            Outcome::Moved { solved: false, .. }
        ));
    }

    #[test]
    fn frames_only_while_turning() {
        let mut g = Game::new(3);
        assert!(g.needs_frame());
        let _ = g.frame(0.0);
        assert!(!g.needs_frame());
        g.key(&key("KeyI"), 0);
        assert!(g.needs_frame());
        assert!(g.frame(1000.0).is_some());
        assert!(g.frame(1000.0 + MOVE_MS / 2.0).is_some());
        assert!(g.frame(1000.0 + MOVE_MS).is_none());
        assert_eq!(
            g.shown(),
            &apply_move(3, &solved_cube(3), &parse_moves(3, "R").unwrap()[0])
        );
        assert!(!g.needs_frame());
    }

    #[test]
    fn long_backlog_skips_to_the_last_moves() {
        let mut g = Game::new(3);
        let _ = g.frame(0.0);
        for _ in 0..10 {
            g.key(&key("KeyJ"), 0);
        }
        // 첫 프레임에 앞의 여섯은 바로 넘기고 일곱째를 돌린다
        let _ = g.frame(10.0);
        for k in 1..=4 {
            let _ = g.frame(10.0 + MOVE_MS * k as f64);
        }
        assert!(g.frame(10.0 + MOVE_MS * 5.0).is_none());
        assert_eq!(g.shown(), g.state());
    }
}
