//! 혼자 맞추기 한 판(그리기 장치와 상관없음): 키 → 코어 해석기 → 수, 섞기(코어 섞기)와 섞기 연출, 되돌리기, 맞춤 판정,
//! 돌리는 연출 줄.
//!
//! 논리 상태(`state`)는 수를 받는 즉시 바뀌고, 화면 상태(`shown`)는 연출 줄을 따라간다. 줄을 꺼내는 길은 둘이다.
//! - [`Game::frame`]: 시간을 밖에서 넣어 준다(ms). wgpu 그리기가 장마다 부른다. 시험은 시간을 직접 넣어 연출이 끝난
//!   순간을 정확히 본다.
//! - [`Game::take_turn`]: 다음에 돌릴 수 하나와 그 시간을 꺼내고 화면 상태에 바로 넣는다. Core Animation 그리기(docs/52 5-5)는
//!   합성기가 시간을 맡으므로, 수 하나를 꺼내 애니메이션으로 넘기고 끝나면 화면 상태의 색으로 다시 칠한다.

use std::collections::VecDeque;

use cube_core::keys::{two_hand_keymap, Command, KeyInput, KeyInterpreter, KeyResult, Keymap};
use cube_core::notation::format_move;
use cube_core::scramble::{scramble, ScrambleEvent};
use cube_core::session::{SessionCue, SolvePhase, SolveRecord, SolveSession};
use cube_core::state::{apply_move, is_solved, State};
use cube_core::{parse_moves, solved_cube, CubeMove};

/// 한 수를 돌리는 시간(사이트 설정 기본값 `moveMs`)
pub const MOVE_MS: f64 = 90.0;
/// 줄이 이보다 길면 앞의 수는 그리지 않고 바로 넘긴다(사이트 `MAX_BACKLOG`)
pub const MAX_BACKLOG: usize = 4;
/// 반 바퀴(turns 2)는 이만큼 느리게(사이트 `HALF_TURN_SLOWER`)
pub const HALF_TURN_SLOWER: f64 = 1.4;
/// 섞기 연출 「크기에 맞게」에서 하나씩 빠르게를 쓰는 가장 큰 크기(사이트 `AUTO_MOVES_MAX_N`)
pub const AUTO_MOVES_MAX_N: usize = 5;
/// 짧은 연출(큐브가 세로축으로 한 바퀴)의 길이(사이트 `SPIN_MS`)
pub const SPIN_MS: f64 = 500.0;

/// 섞기 연출(사이트 `scramble-show.ts`)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScrambleShow {
    /// 섞인 모양으로 바로
    Instant,
    /// 맞춘 큐브에서 섞기 수를 차례로 빠르게
    Moves,
    /// 큐브가 한 바퀴 돌고 반 바퀴에서 섞인 모양으로(앱이 돌리고 칠한다)
    Spin,
}

impl ScrambleShow {
    /// 「크기에 맞게」: 5×5까지 하나씩 빠르게, 6×6·7×7은 짧은 연출
    pub fn auto(n: usize) -> Self {
        if n <= AUTO_MOVES_MAX_N {
            ScrambleShow::Moves
        } else {
            ScrambleShow::Spin
        }
    }
}

/// 하나씩 빠르게의 전체 시간(ms, 사이트 `movesShowMs`): 20수 1초 기준 √로 늘고 2초를 넘지 않는다
pub fn moves_show_ms(count: usize) -> f64 {
    if count == 0 {
        return 0.0;
    }
    (1000.0 * (count as f64 / 20.0).sqrt()).round().min(2000.0)
}

/// 한 수를 돌리는 시간(사이트 `moveDuration`, 기본 설정)
pub fn move_duration(m: &CubeMove) -> f64 {
    move_duration_with(m, MOVE_MS)
}

/// 한 수를 돌리는 시간(설정 `moveMs`), 반 바퀴는 1.4배
pub fn move_duration_with(m: &CubeMove, move_ms: f64) -> f64 {
    if m.turns == 2 {
        move_ms * HALF_TURN_SLOWER
    } else {
        move_ms
    }
}

/// 연출 줄의 수 하나. `ms`가 있으면 섞기 연출 수(그 시간으로, 밀려도 넘기지 않는다)
#[derive(Clone, Copy, Debug, PartialEq)]
struct Queued {
    mv: CubeMove,
    ms: Option<f64>,
}

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
    /// 보기만 바꾸는 명령(살짝 보기 뒤·아래, 처음 각도로). 앱이 보는 각을 바꾼다
    View(Command),
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
    queue: VecDeque<Queued>,
    turning: Option<(CubeMove, f64, f64)>,
    /// 연출 없이 한 번 다시 그려야 함(섞기·맞춘 상태로·창 크기)
    dirty: bool,
    /// 마지막으로 둔 수의 표기(되돌리기면 거꾸로 돌린 수)와 큐브 돌리기(x·y·z)인지
    last_notation: String,
    last_rotation: bool,
    /// 한 수를 돌리는 시간(사이트 설정 `moveMs`, 0~200)
    move_ms: f64,
    /// 마지막으로 둔 수가 되돌리기였나
    last_undo: bool,
    /// 마지막 섞기 글
    scramble_text: String,
    /// 한 판 기록(사이트 `SolveSession` 혼자·살펴보기 없음, 코어 `session.rs`). 시각은 앱이 넣는 포커스 시계
    session: SolveSession,
    now: f64,
    /// 다 맞춰 생긴 기록(앱이 꺼내 간다)과 이정표가 새로 켜졌는지(소리)
    record: Option<SolveRecord>,
    milestone: bool,
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
            last_notation: String::new(),
            last_rotation: false,
            move_ms: MOVE_MS,
            last_undo: false,
            scramble_text: String::new(),
            session: SolveSession::new(n),
            now: 0.0,
            record: None,
            milestone: false,
        }
    }

    /// 키 배치를 바꾼다(사용자 배치·「표기」). 기억해 둔 깊이는 버린다
    pub fn set_keymap(&mut self, keymap: Keymap) {
        self.interp.set_keymap(keymap);
    }

    pub fn keymap(&self) -> &Keymap {
        self.interp.keymap()
    }

    /// 한 수를 돌리는 시간(사이트 설정 `moveMs`, 0~200ms)
    pub fn set_move_ms(&mut self, ms: f64) {
        self.move_ms = if ms.is_finite() {
            ms.clamp(0.0, 200.0)
        } else {
            MOVE_MS
        };
    }

    /// 마지막으로 둔 수의 표기(사이트 기록에 적는 가장 짧은 이름, 되돌리기면 거꾸로 돌린 수)
    pub fn last_notation(&self) -> &str {
        &self.last_notation
    }

    /// 마지막으로 둔 수가 큐브 돌리기(x·y·z)인가
    pub fn last_rotation(&self) -> bool {
        self.last_rotation
    }

    /// 마지막으로 둔 수가 되돌리기였나
    pub fn last_undo(&self) -> bool {
        self.last_undo
    }

    /// 마지막 섞기 글(WCA 표기)
    pub fn scramble_text(&self) -> &str {
        &self.scramble_text
    }

    /// 다음 키·섞기의 시각(ms, 앱의 포커스 시계)
    pub fn set_now(&mut self, now: f64) {
        self.now = now;
    }

    /// 섞은 뒤 맞추는 중인가(첫 수 전 포함, 힌트를 볼 수 있는 때)
    pub fn solving(&self) -> bool {
        matches!(self.session.phase, SolvePhase::Ready | SolvePhase::Solving)
    }

    /// 다 맞춰 생긴 기록을 꺼낸다(한 번만)
    pub fn take_record(&mut self) -> Option<SolveRecord> {
        self.record.take()
    }

    /// 시험용: 키 대신 수 하나를 둔다(키 해석 없이, 표기는 가장 짧은 이름)
    #[doc(hidden)]
    pub fn key_move_for_test(&mut self, mv: CubeMove) -> bool {
        let notation = format_move(self.n, &mv);
        self.feed(mv, &notation);
        self.play(mv)
    }

    /// 꺼낸 기록을 되돌려 둔다(앱의 자리가 모자랐을 때)
    pub fn put_back_record(&mut self, r: SolveRecord) {
        self.record = Some(r);
    }

    /// 이정표가 새로 켜졌는가를 꺼낸다(한 번만)
    pub fn take_milestone(&mut self) -> bool {
        std::mem::take(&mut self.milestone)
    }

    /// 섞기 글과 씨앗(기록에 남긴다)
    pub fn session_scramble(&self) -> (&str, Option<u32>) {
        (&self.session.scramble, self.session.seed)
    }

    fn feed(&mut self, mv: CubeMove, notation: &str) {
        let out = self.session.input(mv, notation, self.now);
        if out.cues.contains(&SessionCue::Milestone) {
            self.milestone = true;
        }
        if out.record.is_some() {
            self.record = out.record;
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
                self.last_undo = false;
                self.last_notation = notation.clone();
                self.last_rotation = mv.is_rotation(self.n);
                self.feed(mv, &notation);
                let solved = self.play(mv);
                Outcome::Moved { notation, solved }
            }
            Some(KeyResult::Command { command, .. }) => match command {
                Command::Scramble => self.scramble(seed),
                // 미니 모드는 「맞춘 상태로」(Esc)·살펴보기 건너뛰기(Space)를 쓰지 않는다(사이트 `MiniCubeApp`, docs/47 15-4).
                // Esc는 앱이 먼저 가로채고, 사용자 배치가 다른 키에 놓았어도 진행을 버리지 않는다
                Command::Reset | Command::InspectionSkip => Outcome::Consumed,
                Command::Undo => match self.history.pop() {
                    Some(m) => {
                        self.last_undo = true;
                        let inv = m.inverse();
                        self.state = apply_move(self.n, &self.state, &inv);
                        self.last_notation = format_move(self.n, &inv);
                        self.last_rotation = inv.is_rotation(self.n);
                        let text = self.last_notation.clone();
                        self.feed(inv, &text);
                        self.push(inv);
                        Outcome::Moved {
                            notation: self.last_notation.clone(),
                            solved: false,
                        }
                    }
                    None => Outcome::Consumed,
                },
                Command::PeekBack | Command::PeekDown | Command::ViewHome => Outcome::View(command),
            },
            Some(_) => Outcome::Consumed,
        }
    }

    /// 수 하나를 둔다. 섞인 큐브를 다 맞췄으면 true
    pub fn play(&mut self, m: CubeMove) -> bool {
        self.state = apply_move(self.n, &self.state, &m);
        self.history.push(m);
        self.push(m);
        if self.scrambled && self.is_solved() {
            self.scrambled = false;
            return true;
        }
        false
    }

    fn push(&mut self, mv: CubeMove) {
        // 섞기 연출이 도는 중에 손이 들어오면 연출을 끝낸 자리에서 이어 간다(사이트 `ScrambleShow.finish`)
        self.finish_show();
        self.queue.push_back(Queued { mv, ms: None });
    }

    /// 섞기 연출 수가 줄에 남았으면 바로 끝낸 자리로(화면 상태에 넣는다). 남았던 게 있으면 true
    pub fn finish_show(&mut self) -> bool {
        let mut any = false;
        while let Some(q) = self.queue.front() {
            if q.ms.is_none() {
                break;
            }
            let q = self.queue.pop_front().expect("줄");
            self.shown = apply_move(self.n, &self.shown, &q.mv);
            any = true;
        }
        if any {
            self.dirty = true;
        }
        any
    }

    /// 코어 섞기(같은 씨앗이면 사이트와 같은 섞기). 연출 없이 바로 섞인 모습으로
    pub fn scramble(&mut self, seed: u32) -> Outcome {
        self.scramble_with(seed, ScrambleShow::Instant)
    }

    /// 코어 섞기와 연출. 하나씩 빠르게면 화면은 맞춘 모양에서 섞기 수를 줄에 넣고, 그 밖은 바로 섞인 모양으로
    /// (짧은 연출의 한 바퀴는 앱이 돌린다)
    pub fn scramble_with(&mut self, seed: u32, show: ScrambleShow) -> Outcome {
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
        self.scramble_text = s.text.clone();
        let moves = parse_moves(self.n, &s.text).expect("섞기 글");
        let mut st = solved_cube(self.n);
        for m in &moves {
            st = apply_move(self.n, &st, m);
        }
        self.jump(st);
        self.scrambled = true;
        self.record = None;
        self.milestone = false;
        let _ = self.session.start(&s.text, Some(seed), self.now);
        if show == ScrambleShow::Moves && !moves.is_empty() {
            self.shown = solved_cube(self.n);
            let step = moves_show_ms(moves.len()) / moves.len() as f64;
            self.queue
                .extend(moves.into_iter().map(|mv| Queued { mv, ms: Some(step) }));
        }
        Outcome::Scrambled { text: s.text }
    }

    pub fn reset(&mut self) {
        self.jump(solved_cube(self.n));
        self.scrambled = false;
        self.session.reset();
        self.record = None;
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

    /// 화면에 보이는 상태([`Game::frame`]은 돌리는 중인 수를 아직 넣지 않은 것, [`Game::take_turn`]은 꺼낸 수까지 넣은 것)
    pub fn shown(&self) -> &State {
        &self.shown
    }

    /// 섞인 큐브를 맞추는 중인가(섞었고 아직 다 맞추지 않음). 거울 판을 보일지 정할 때 쓴다
    pub fn is_scrambled(&self) -> bool {
        self.scrambled
    }

    /// 줄에 돌릴 수가 남았나
    pub fn has_turns(&self) -> bool {
        !self.queue.is_empty()
    }

    /// 보기만 하는 연출(떠 있을 때 다시 보기·조금 섞기, docs/47 15-5): 화면 상태를 `st`로 두고 줄을 비운다. 논리 상태는
    /// 그대로다. 끝나면 [`Game::show_restore`]로 논리 상태로 돌린다
    pub fn show_jump(&mut self, st: State) {
        self.shown = st;
        self.queue.clear();
        self.turning = None;
        self.dirty = true;
    }

    /// 보기만 하는 수를 줄에 넣는다(그 시간으로, 밀려도 넘기지 않는다). 표기를 읽지 못하면 false
    pub fn show_push(&mut self, notation: &str, ms: f64) -> bool {
        let Ok(moves) = parse_moves(self.n, notation) else {
            return false;
        };
        let step = if moves.is_empty() {
            ms
        } else {
            ms / moves.len() as f64
        };
        self.queue
            .extend(moves.into_iter().map(|mv| Queued { mv, ms: Some(step) }));
        true
    }

    /// 보기만 하던 연출을 끝내고 화면을 논리 상태로
    pub fn show_restore(&mut self) {
        let st = self.state.clone();
        self.show_jump(st);
    }

    /// 다음에 돌릴 수 하나와 그 시간(ms)을 꺼낸다. 꺼낸 수는 화면 상태에 바로 넣는다(그리는 쪽은 그 수를 애니메이션으로
    /// 돌리고, 끝나면 화면 상태 색으로 다시 칠한다). 손으로 둔 수가 [`MAX_BACKLOG`]보다 많이 밀렸으면 앞의 것은 바로 넘긴다
    pub fn take_turn(&mut self) -> Option<(CubeMove, f64)> {
        self.dirty = false;
        while self.queue.len() > MAX_BACKLOG && self.queue.front().is_some_and(|q| q.ms.is_none()) {
            let q = self.queue.pop_front().expect("줄");
            self.shown = apply_move(self.n, &self.shown, &q.mv);
        }
        let q = self.queue.pop_front()?;
        self.shown = apply_move(self.n, &self.shown, &q.mv);
        Some((
            q.mv,
            q.ms.unwrap_or_else(|| move_duration_with(&q.mv, self.move_ms)),
        ))
    }

    /// 시각 `now`(ms)의 화면: 돌리는 중인 수와 진행 0..1(보이는 상태는 [`Game::shown`]). 끝난 연출은 화면 상태에 넣는다
    pub fn frame(&mut self, now: f64) -> Option<(CubeMove, f32)> {
        self.dirty = false;
        loop {
            if let Some((m, start, ms)) = self.turning {
                let p = (now - start) / ms;
                if p < 1.0 {
                    let e = ease_in_out(p.max(0.0) as f32);
                    return Some((m, e));
                }
                self.shown = apply_move(self.n, &self.shown, &m);
                self.turning = None;
                continue;
            }
            // 밀린 수가 많으면 앞의 것은 바로 넘긴다
            while self.queue.len() > MAX_BACKLOG
                && self.queue.front().is_some_and(|q| q.ms.is_none())
            {
                let q = self.queue.pop_front().expect("줄");
                self.shown = apply_move(self.n, &self.shown, &q.mv);
            }
            match self.queue.pop_front() {
                Some(q) => self.turning = Some((q.mv, now, q.ms.unwrap_or(MOVE_MS))),
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

    #[test]
    fn take_turn_moves_shown_state_one_at_a_time() {
        let mut g = Game::new(3);
        assert!(!g.has_turns());
        g.key(&key("KeyI"), 0); // R
        g.key(&key("KeyJ"), 0); // U
        let (m, ms) = g.take_turn().expect("R");
        assert_eq!(m, parse_moves(3, "R").unwrap()[0]);
        assert_eq!(ms, MOVE_MS);
        // 꺼낸 수는 화면 상태에 이미 들어 있다
        assert_eq!(g.shown(), &apply_move(3, &solved_cube(3), &m));
        let _ = g.take_turn().expect("U");
        assert_eq!(g.shown(), g.state());
        assert!(g.take_turn().is_none());
    }

    #[test]
    fn take_turn_skips_long_backlog_and_slows_half_turns() {
        let mut g = Game::new(3);
        for _ in 0..10 {
            g.key(&key("KeyJ"), 0);
        }
        // 앞의 여섯은 바로 넘기고 남은 넷을 돌린다
        let mut n = 0;
        while g.take_turn().is_some() {
            n += 1;
        }
        assert_eq!(n, MAX_BACKLOG);
        assert_eq!(g.shown(), g.state());
        assert_eq!(
            move_duration(&parse_moves(3, "U2").unwrap()[0]),
            MOVE_MS * HALF_TURN_SLOWER
        );
    }

    #[test]
    fn scramble_show_moves_plays_from_solved_and_finishes_on_key() {
        let mut g = Game::new(3);
        let text = match g.scramble_with(7, ScrambleShow::Moves) {
            Outcome::Scrambled { text } => text,
            o => panic!("{o:?}"),
        };
        let moves = parse_moves(3, &text).unwrap();
        // 화면은 맞춘 모양에서 시작하고, 논리 상태는 이미 섞였다
        assert_eq!(g.shown(), &solved_cube(3));
        assert!(!g.is_solved());
        let step = moves_show_ms(moves.len()) / moves.len() as f64;
        // 밀려도 넘기지 않고 섞기 수를 하나씩 내준다
        let (m0, ms0) = g.take_turn().unwrap();
        assert_eq!((m0, ms0), (moves[0], step));
        // 손으로 한 수를 두면 연출을 끝낸 자리에서 이어 간다
        g.key(&key("KeyI"), 0);
        let (m, _) = g.take_turn().unwrap();
        assert_eq!(m, parse_moves(3, "R").unwrap()[0]);
        assert_eq!(g.shown(), g.state());
    }

    #[test]
    fn scramble_show_timing_matches_site() {
        assert_eq!(moves_show_ms(20), 1000.0);
        assert_eq!(moves_show_ms(11), 742.0);
        assert_eq!(moves_show_ms(60), 1732.0);
        assert_eq!(moves_show_ms(100), 2000.0);
        assert_eq!(ScrambleShow::auto(5), ScrambleShow::Moves);
        assert_eq!(ScrambleShow::auto(6), ScrambleShow::Spin);
    }
}
