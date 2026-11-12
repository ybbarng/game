//! 혼자 맞추기 한 판(`apps/web/src/cube/solve-session.ts`의 `SolveSession`, Cubie 미니가 쓰는 꼴: mode "solo",
//! 살펴보기 없음, 제한 없음). 시계를 갖지 않고 시각(ms, 포커스 시계 기준)을 밖에서 받아 결정적이다.
//!
//! 흐름: [`SolveSession::start`](섞기 글) → ready → 첫 면 돌리기로 solving(그 순간부터 시간) → 다 맞추면 done과
//! 기록 칸([`SolveRecord`]). 큐브 돌리기(x·y·z)는 시간을 열지 않는다.

use crate::combo::{push_combo, ComboState, COMBO_SHOW};
use crate::notation::{format_move, parse_moves, CubeMove, NotationError};
use crate::progress::{flow_score, milestones_of, solve_progress, Milestone, SolveProgress};
use crate::replay::{format_replay, format_splits};
use crate::state::{apply_move, apply_moves, is_solved, solved_cube, State};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SolvePhase {
    /// 맞춘 큐브, 마음대로
    Free,
    /// 섞였고 첫 면 돌리기를 기다림
    Ready,
    Solving,
    Done,
}

/// 소리·알림(사이트 `SessionCue` 가운데 미니에 생기는 것)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionCue {
    /// 맞추는 동안 이정표가 하나 이상 새로 켜짐(같은 수에 여럿이어도 한 번, 다 맞춘 수는 빼고)
    Milestone,
    Solved,
}

/// 한 판이 끝나 남길 기록 칸(사이트 `SolveRecord`에서 at·n·mode·scramble·seed를 뺀 것)
#[derive(Clone, Debug, PartialEq)]
pub struct SolveRecord {
    /// 맞춘 시간(ms, 벌점 빼고)
    pub ms: f64,
    /// 벌점(ms). 미니는 살펴보기가 없어 늘 0
    pub penalty: f64,
    /// 면 돌린 수(되돌리기도 한 수, 큐브 돌리기는 빼고)
    pub moves: u32,
    /// 다시 보기 글 "R@120 U'@380"
    pub replay: String,
    /// 구간 기록 글 "cross@3210 f2l1@8020". 지난 이정표가 없으면 None
    pub splits: Option<String>,
    /// 가장 긴 흐름 콤보. [`COMBO_SHOW`]수 아래면 None
    pub combo: Option<u32>,
}

/// 수 하나를 넣은 결과
#[derive(Clone, Debug, PartialEq)]
pub struct InputOutcome {
    /// 이 수로 생긴 알림(차례대로)
    pub cues: Vec<SessionCue>,
    /// 이 수로 판이 끝났으면 기록
    pub record: Option<SolveRecord>,
}

/// 지금 판에 넣은 수 하나
#[derive(Clone, Debug, PartialEq)]
pub struct MoveEntry {
    pub notation: String,
    pub mv: CubeMove,
    /// 맞추기 시작부터 ms. 시작 전 큐브 돌리기는 음수
    pub t: f64,
}

pub struct SolveSession {
    pub n: usize,
    pub phase: SolvePhase,
    pub state: State,
    pub scramble: String,
    pub seed: Option<u32>,
    pub history: Vec<MoveEntry>,
    undo_stack: Vec<CubeMove>,
    pub move_count: u32,
    /// 이정표를 처음 지난 시각(맞추기 시작부터 ms), 지난 차례대로
    pub splits: Vec<(Milestone, f64)>,
    /// 이번 판 진행 막대의 가장 높았던 값
    pub best_progress: f64,
    combo: ComboState,
    combo_best: u32,
    progress_cache: Option<(State, SolveProgress)>,
    phase_start: f64,
    solve_start: f64,
    solve_end: f64,
    pub result_ms: Option<f64>,
}

impl SolveSession {
    pub fn new(n: usize) -> Self {
        SolveSession {
            n,
            phase: SolvePhase::Free,
            state: solved_cube(n),
            scramble: String::new(),
            seed: None,
            history: vec![],
            undo_stack: vec![],
            move_count: 0,
            splits: vec![],
            best_progress: 0.0,
            combo: ComboState::default(),
            combo_best: 0,
            progress_cache: None,
            phase_start: 0.0,
            solve_start: 0.0,
            solve_end: 0.0,
            result_ms: None,
        }
    }

    fn clear(&mut self) {
        self.history.clear();
        self.undo_stack.clear();
        self.move_count = 0;
        self.splits.clear();
        self.best_progress = 0.0;
        self.combo = ComboState::default();
        self.combo_best = 0;
        self.solve_end = 0.0;
        self.result_ms = None;
    }

    /// 섞기 글을 받아 새 판을 연다(첫 면 돌리기를 기다림). `now`부터 ready 시간을 잰다
    pub fn start(
        &mut self,
        scramble: &str,
        seed: Option<u32>,
        now: f64,
    ) -> Result<(), NotationError> {
        let moves = parse_moves(self.n, scramble)?;
        self.clear();
        self.state = apply_moves(self.n, &solved_cube(self.n), &moves);
        self.scramble = scramble.to_string();
        self.seed = seed;
        self.phase = SolvePhase::Ready;
        self.phase_start = now;
        Ok(())
    }

    /// 맞춘 상태로(판을 버린다)
    pub fn reset(&mut self) {
        self.clear();
        self.phase = SolvePhase::Free;
        self.state = solved_cube(self.n);
        self.scramble.clear();
        self.seed = None;
    }

    /// 지금 보여 줄 시간(ms)
    pub fn elapsed(&self, now: f64) -> f64 {
        match self.phase {
            SolvePhase::Ready => now - self.phase_start,
            SolvePhase::Solving => now - self.solve_start,
            SolvePhase::Done => self.result_ms.unwrap_or(0.0),
            _ => 0.0,
        }
    }

    /// 끝난 판이 맞추기 시작부터 걸린 시간(ms)
    pub fn played_ms(&self) -> f64 {
        if self.phase == SolvePhase::Done {
            (self.solve_end - self.solve_start).max(0.0)
        } else {
            0.0
        }
    }

    /// 지금 상태의 진행(같은 상태면 다시 세지 않는다)
    pub fn progress(&mut self) -> SolveProgress {
        if let Some((s, v)) = &self.progress_cache {
            if *s == self.state {
                return *v;
            }
        }
        let v = solve_progress(self.n, &self.state);
        self.progress_cache = Some((self.state.clone(), v));
        v
    }

    /// 지금 상태의 흐름 콤보 진행 칸
    pub fn flow_score(&mut self) -> u32 {
        let p = self.progress();
        flow_score(self.n, &self.state, &p.pieces)
    }

    /// 이번 판 가장 긴 흐름 콤보
    pub fn longest_combo(&self) -> u32 {
        self.combo_best
    }

    /// 지금 흐름 콤보 상태(띠 그리기용, [`crate::combo::combo_now`]로 지금 값을 본다)
    pub fn combo_state(&self) -> &ComboState {
        &self.combo
    }

    /// 표기 하나(한 수)를 넣는다
    pub fn input_notation(
        &mut self,
        notation: &str,
        now: f64,
    ) -> Result<InputOutcome, NotationError> {
        let moves = parse_moves(self.n, notation)?;
        let mut out = InputOutcome {
            cues: vec![],
            record: None,
        };
        for m in moves {
            let r = self.input(m, &format_move(self.n, &m), now);
            out.cues.extend(r.cues);
            if r.record.is_some() {
                out.record = r.record;
            }
        }
        Ok(out)
    }

    /// 수 하나. `notation`은 다시 보기에 남길 이름
    pub fn input(&mut self, m: CubeMove, notation: &str, now: f64) -> InputOutcome {
        let r = self.apply(m, notation, now);
        self.undo_stack.push(m);
        r
    }

    /// 마지막 수를 거꾸로 돌린다(되돌리기도 한 수로 센다). 돌린 수를 돌려준다
    pub fn undo(&mut self, now: f64) -> Option<(CubeMove, InputOutcome)> {
        let last = *self.undo_stack.last()?;
        let inv = last.inverse();
        let r = self.apply(inv, &format_move(self.n, &inv), now);
        self.undo_stack.pop();
        Some((inv, r))
    }

    fn apply(&mut self, m: CubeMove, notation: &str, now: f64) -> InputOutcome {
        let mut out = InputOutcome {
            cues: vec![],
            record: None,
        };
        let n = self.n;
        let rotation = m.is_rotation(n);
        if !rotation && self.phase == SolvePhase::Ready {
            for e in &mut self.history {
                e.t -= now - self.solve_start;
            }
            self.solve_start = now;
            self.phase = SolvePhase::Solving;
        }
        self.state = apply_move(n, &self.state, &m);
        if matches!(self.phase, SolvePhase::Solving | SolvePhase::Ready) {
            self.history.push(MoveEntry {
                notation: notation.to_string(),
                mv: m,
                t: now - self.solve_start,
            });
        }
        if !rotation {
            self.move_count += 1;
        }
        let solving = self.phase == SolvePhase::Solving;
        let solved = solving && is_solved(n, &self.state);
        if solving && !rotation {
            self.track(now - self.solve_start, solved, &mut out);
        }
        if solving {
            let progress = (!rotation).then(|| self.flow_score());
            self.combo = push_combo(&self.combo, n, &m, now, progress);
            self.combo_best = self.combo_best.max(self.combo.combo);
        }
        if solved {
            self.solve_end = now;
            let ms = now - self.solve_start;
            self.result_ms = Some(ms);
            self.phase = SolvePhase::Done;
            out.cues.push(SessionCue::Solved);
            out.record = Some(self.record(ms));
        }
        out
    }

    fn track(&mut self, t: f64, solved: bool, out: &mut InputOutcome) {
        let value = self.progress().value;
        if value > self.best_progress {
            self.best_progress = value;
        }
        let mut fresh = false;
        for id in milestones_of(self.n, &self.state) {
            if !self.splits.iter().any(|(x, _)| *x == id) {
                self.splits.push((id, t));
                fresh = true;
            }
        }
        if fresh && !solved {
            out.cues.push(SessionCue::Milestone);
        }
    }

    fn record(&self, ms: f64) -> SolveRecord {
        let splits: Vec<(String, f64)> = self
            .splits
            .iter()
            .map(|(id, t)| (id.id().to_string(), *t))
            .collect();
        let events: Vec<(String, f64)> = self
            .history
            .iter()
            .map(|e| (e.notation.clone(), e.t))
            .collect();
        SolveRecord {
            ms,
            penalty: 0.0,
            moves: self.move_count,
            replay: format_replay(&events),
            splits: (!splits.is_empty()).then(|| format_splits(&splits)),
            combo: (self.combo_best >= COMBO_SHOW).then_some(self.combo_best),
        }
    }
}
