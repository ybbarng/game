//! 공식 연습 진행기(웹 `apps/web/src/cube/practice/`, Cubie 미니 `mini/practice.ts`, docs/47 16-9·16-11).
//!
//! 옮긴 원본: `stages.ts`(단계 목록은 사이트에서 만든 [`crate::practice_data`]), `key-cost.ts`(키 비용),
//! `pick-alg.ts`(키 배치마다 가장 싼 공식), `deck.ts`(씨앗 → 10문제), `problem.ts`(시작 모양·보일 공식),
//! `follow.ts`·`keys/formula.ts`·`keys/reach.ts` `MoveMatcher`(따라 치기 판정), `round.ts`(한 판·콤보·판 끝),
//! `store.ts`·`learn/progress.ts`(기록 갱신, 저장은 앱이 한다), `session.ts`(진행기).
//!
//! 시계를 갖지 않는다. 시각(ms)은 부르는 쪽이 넣고, 「맞춘 모습 잠깐 보이기」(700ms)와 「틀린 키 잠깐 보이기」(1.5초)는
//! [`PracticeSession::tick`]이 그 시각까지 닿은 것을 처리한다(수를 넣을 때도 먼저 처리한다).

use std::collections::HashMap;

use crate::judge::{goal_met, Goal};
use crate::keys::{keys_for_move, notation_to_move, Keymap};
use crate::notation::{invert_moves, parse_moves, CubeMove};
use crate::practice_data::PRACTICE_STAGES;
use crate::rng::Rng;
use crate::state::{apply_move, apply_moves, solved_cube, State};
use crate::tier::js_round;

pub const PRACTICE_N: usize = 3;
pub const ROUND_SIZE: usize = 10;
/// 다 맞춘 모습을 보이는 시간
pub const SOLVED_PAUSE_MS: f64 = 700.0;
/// 틀린 수의 키를 보이는 시간
pub const WRONG_SHOW_MS: f64 = 1500.0;

// ── 자료 ──────────────────────────────────────────────

/// 연습 상황 하나(사이트 `DrillCase`)
#[derive(Debug)]
pub struct DrillCase {
    pub id: &'static str,
    pub name: &'static str,
    pub group: Option<&'static str>,
    /// 자료의 공식들. 첫 공식이 실물에서 흔한 공식
    pub algs: &'static [&'static str],
    /// 단원이 그 상황을 만드는 공식(쥐기 뒤). 없으면 대표의 거꾸로
    pub setup: Option<&'static str>,
    /// 고를 수 있는 공식: 자료 다음에 후보(사이트 `choicesOf`)
    pub choices: &'static [&'static str],
    /// 보고 치기의 통과 모양(사이트 목표 이름)
    pub goal: &'static str,
    /// 공식 모음 상황 id(내 공식을 고를 수 있는 상황만)
    pub source: Option<&'static str>,
}

/// 연습 단계 하나(사이트 `PracticeStage`)
#[derive(Debug)]
pub struct PracticeStage {
    pub id: &'static str,
    pub title: &'static str,
    /// "beginner" · "cfop" · "zz"
    pub method: &'static str,
    /// 메뉴 묶음 이름(「초보자」·「CFOP」·「ZZ」)
    pub method_title: &'static str,
    /// 시작할 때 쥐는 큐브 돌리기("" 또는 "z2")
    pub hold: &'static str,
    /// 가리기 이름(사이트 `MaskName`). 그리기는 앱이 한다
    pub mask: &'static str,
    /// 익숙해진 상황은 윗면을 돌려 둔 채 낸다
    pub auf: bool,
    pub cases: &'static [DrillCase],
}

impl PracticeStage {
    pub fn case(&self, id: &str) -> Option<&'static DrillCase> {
        self.cases.iter().find(|c| c.id == id)
    }
}

pub fn stage_by_id(id: &str) -> Option<&'static PracticeStage> {
    PRACTICE_STAGES.iter().find(|s| s.id == id)
}

/// 앱 메뉴 「공식 연습 ▸」에 보일 단계(사이트 `MENU_STAGES`)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MenuStage {
    pub id: &'static str,
    pub title: &'static str,
    /// 묶음 이름(「초보자」·「CFOP」·「ZZ」)
    pub group: &'static str,
}

pub fn menu_stages() -> Vec<MenuStage> {
    PRACTICE_STAGES
        .iter()
        .map(|s| MenuStage {
            id: s.id,
            title: s.title,
            group: s.method_title,
        })
        .collect()
}

fn goal_of(c: &DrillCase) -> Goal {
    Goal::from_id(c.goal).expect("연습 상황의 통과 모양")
}

/// 공식 글 → 낱말(괄호는 빈칸으로, 사이트 `algTokens`)
pub fn alg_tokens(alg: &str) -> Vec<String> {
    alg.replace(['(', ')', '[', ']'], " ")
        .split_whitespace()
        .map(str::to_string)
        .collect()
}

fn is_rotation_token(t: &str) -> bool {
    t.starts_with(['x', 'y', 'z'])
}

/// 공식의 수 개수(큐브 돌리기 빼고, R2는 한 수)
pub fn count_moves(tokens: &[String]) -> u32 {
    tokens.iter().filter(|t| !is_rotation_token(t)).count() as u32
}

// ── 키 비용(사이트 `key-cost.ts`) ─────────────────────────

const PRESS: f64 = 1.0;
const SAME_KEY: f64 = 0.3;
const SAME_FINGER: f64 = 1.0;
const SAME_HAND: f64 = 0.2;
const MODIFIER: f64 = 0.8;
const ROTATION: f64 = 1.0;
const NO_KEY: f64 = 10.0;

/// 키 자리 → (오른손인가, 손가락 0 엄지 ~ 4 새끼). 스페이스는 엄지, 모르는 키는 오른 새끼
fn finger_of(code: &str) -> (bool, u8) {
    const COLUMNS: [(bool, u8, &str); 8] = [
        (false, 4, "Backquote Digit1 KeyQ KeyA KeyZ Tab CapsLock"),
        (false, 3, "Digit2 KeyW KeyS KeyX"),
        (false, 2, "Digit3 KeyE KeyD KeyC"),
        (false, 1, "Digit4 Digit5 KeyR KeyT KeyF KeyG KeyV KeyB"),
        (true, 1, "Digit6 Digit7 KeyY KeyU KeyH KeyJ KeyN KeyM"),
        (true, 2, "Digit8 KeyI KeyK Comma"),
        (true, 3, "Digit9 KeyO KeyL Period"),
        (
            true,
            4,
            "Digit0 Minus Equal KeyP BracketLeft BracketRight Backslash Semicolon Quote Slash Enter Backspace",
        ),
    ];
    if code == "Space" {
        return (true, 0);
    }
    COLUMNS
        .iter()
        .find(|(_, _, codes)| codes.split(' ').any(|c| c == code))
        .map_or((true, 4), |&(right, finger, _)| (right, finger))
}

/// 공식 하나의 키 비용(작을수록 치기 쉽다, 0.1 단위)
pub fn key_cost(alg: &str, keymap: &Keymap, n: usize) -> f64 {
    let (mut presses, mut same_key, mut same_finger, mut same_hand) = (0u32, 0u32, 0u32, 0u32);
    let (mut modifiers, mut rotations, mut missing) = (0u32, 0u32, 0u32);
    let mut prev: Option<&str> = None;
    for tok in alg_tokens(alg) {
        if is_rotation_token(&tok) {
            rotations += 1;
        }
        let Some(keys) = keys_for_move(keymap, n, &tok) else {
            missing += 1;
            prev = None;
            continue;
        };
        for k in keys {
            presses += 1;
            modifiers += k.modifier_count();
            if let Some(p) = prev {
                let (a, b) = (finger_of(p), finger_of(k.code));
                if p == k.code {
                    same_key += 1;
                } else if a == b {
                    same_finger += 1;
                } else if a.0 == b.0 {
                    same_hand += 1;
                }
            }
            prev = Some(k.code);
        }
    }
    let total = f64::from(presses) * PRESS
        + f64::from(same_key) * SAME_KEY
        + f64::from(same_finger) * SAME_FINGER
        + f64::from(same_hand) * SAME_HAND
        + f64::from(modifiers) * MODIFIER
        + f64::from(rotations) * ROTATION
        + f64::from(missing) * NO_KEY;
    js_round(total * 10.0) / 10.0
}

// ── 공식 고르기(사이트 `pick-alg.ts`) ──────────────────────

/// 흔한 공식을 버리고 다른 공식을 고르려면 이만큼(키 하나) 이상 싸야 한다
pub const SWITCH_MARGIN: f64 = 1.0;

/// 내 공식(사이트 `CaseAlgs`): 상황마다 내가 넣은 공식과 쓰는 공식
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CaseAlgs {
    pub mine: Vec<String>,
    pub use_alg: Option<String>,
}

/// 공식 모음 상황 id → 내 공식
pub type AlgBook = HashMap<String, CaseAlgs>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PickWhy {
    Mine,
    Keys,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PickedAlg {
    pub alg: String,
    /// 실물에서 흔한 공식(자료의 첫 공식)
    pub common: &'static str,
    pub why: PickWhy,
}

/// 내 공식에서 고른 것이 있으면 그것, 없으면 키 비용이 가장 싼 공식(흔한 공식보다 [`SWITCH_MARGIN`] 넘게 쌀 때만)
pub fn pick_alg(c: &DrillCase, keymap: &Keymap, book: &AlgBook) -> PickedAlg {
    let common = c.algs[0];
    if let Some(src) = c.source {
        if let Some(entry) = book.get(src) {
            if let Some(use_alg) = &entry.use_alg {
                let known = c.choices.contains(&use_alg.as_str()) || entry.mine.contains(use_alg);
                if known {
                    return PickedAlg {
                        alg: use_alg.clone(),
                        common,
                        why: PickWhy::Mine,
                    };
                }
            }
        }
    }
    let common_cost = key_cost(common, keymap, PRACTICE_N);
    let (mut best, mut best_cost) = (common, common_cost);
    for &alg in c.choices {
        let cost = key_cost(alg, keymap, PRACTICE_N);
        if cost < best_cost {
            best = alg;
            best_cost = cost;
        }
    }
    if common_cost - best_cost < SWITCH_MARGIN {
        best = common;
    }
    PickedAlg {
        alg: best.to_string(),
        common,
        why: PickWhy::Keys,
    }
}

// ── 연습 기록(사이트 `learn/progress.ts`·`practice/store.ts`) ─────

/// 최근 시간을 이만큼 남긴다
pub const RECENT_TIMES: usize = 12;

/// 상황 하나의 기록(사이트 `CaseStats`)
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CaseStats {
    pub solves: u32,
    pub fails: u32,
    pub best: Option<f64>,
    /// 최근 시간(ms, 새것이 앞)
    pub times: Vec<f64>,
    pub moves: Vec<f64>,
}

/// 상황 id → 기록(사이트 `TrainBook`)
pub type TrainBook = HashMap<String, CaseStats>;

pub fn with_solve(book: &mut TrainBook, case_id: &str, ms: f64, moves: f64) {
    let s = book.entry(case_id.to_string()).or_default();
    s.solves += 1;
    s.best = Some(s.best.map_or(ms, |b| b.min(ms)));
    s.times.insert(0, ms);
    s.times.truncate(RECENT_TIMES);
    s.moves.insert(0, moves);
    s.moves.truncate(RECENT_TIMES);
}

pub fn with_fail(book: &mut TrainBook, case_id: &str) {
    book.entry(case_id.to_string()).or_default().fails += 1;
}

pub fn average_ms(s: Option<&CaseStats>) -> Option<f64> {
    let s = s?;
    if s.times.is_empty() {
        return None;
    }
    Some(s.times.iter().sum::<f64>() / s.times.len() as f64)
}

/// 공식 연습 기록(사이트 `PracticeRecord`, 저장소 `cube.practice.v1`·미니는 `cube.mini.practice.v1`)
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PracticeRecord {
    /// 따라 치기 상황별 기록(틀린 수가 있던 문제는 fails에도 하나)
    pub follow: TrainBook,
    /// 단계 id → (따라 치기 판 수, 보고 치기 판 수)
    pub rounds: HashMap<String, (u32, u32)>,
    /// 마지막으로 연 단계
    pub last: Option<String>,
}

/// 따라 치기 판 끝에 「외워서 쳐 보기」를 권하는 틀림 없이 친 횟수
pub const SEE_SUGGEST_CLEAN: u32 = 3;

pub fn clean_solves(s: Option<&CaseStats>) -> u32 {
    s.map_or(0, |s| s.solves.saturating_sub(s.fails))
}

pub fn suggest_see(rec: &PracticeRecord, case_ids: &[&str]) -> bool {
    !case_ids.is_empty()
        && case_ids
            .iter()
            .all(|id| clean_solves(rec.follow.get(*id)) >= SEE_SUGGEST_CLEAN)
}

// ── 출제(사이트 `deck.ts`) ──────────────────────────────

pub const FAMILIAR_SOLVES: u32 = 5;
pub const FAMILIAR_FAIL_RATE: f64 = 0.2;
pub const NEW_WEIGHT: f64 = 2.0;
const AUFS: [&str; 4] = ["", "U", "U2", "U'"];

fn fail_rate(s: &CaseStats) -> f64 {
    if s.solves + s.fails == 0 {
        0.0
    } else {
        f64::from(s.fails) / f64::from(s.solves + s.fails)
    }
}

pub fn familiar(s: Option<&CaseStats>) -> bool {
    s.is_some_and(|s| s.solves >= FAMILIAR_SOLVES && fail_rate(s) <= FAMILIAR_FAIL_RATE)
}

pub fn case_weight(s: Option<&CaseStats>, typical_ms: Option<f64>) -> f64 {
    let Some(st) = s.filter(|s| s.solves + s.fails > 0) else {
        return NEW_WEIGHT;
    };
    let slow = match (average_ms(s), typical_ms) {
        (Some(avg), Some(t)) if t != 0.0 => (avg / t).clamp(0.5, 3.0),
        _ => 1.0,
    };
    slow * (1.0 + 3.0 * fail_rate(st))
}

fn median(xs: &[f64]) -> Option<f64> {
    if xs.is_empty() {
        return None;
    }
    let mut s = xs.to_vec();
    s.sort_by(f64::total_cmp);
    let mid = s.len() / 2;
    Some(if s.len() % 2 == 1 {
        s[mid]
    } else {
        (s[mid - 1] + s[mid]) / 2.0
    })
}

/// 출제 하나: 상황과 시작 모양에 더할 윗면 돌리기
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Draw {
    pub case_id: String,
    pub turn: &'static str,
}

/// 출제 설정(사이트 `DrawOptions`)
#[derive(Clone, Copy, Debug)]
pub struct DrawOptions<'a> {
    pub seed: u32,
    pub book: Option<&'a TrainBook>,
    pub auf: bool,
    /// 윗면 돌리기를 모든 문제에 씨앗대로 붙인다(대결)
    pub every_turn: bool,
    pub count: usize,
}

/// 한 판의 문제들(사이트 `drawRound`). 씨앗과 기록이 같으면 같은 문제를 같은 차례로 낸다
pub fn draw_round(case_ids: &[&str], opts: DrawOptions) -> Vec<Draw> {
    let mut rng = Rng::new(opts.seed);
    let empty = TrainBook::new();
    let book = opts.book.unwrap_or(&empty);
    let avgs: Vec<f64> = case_ids
        .iter()
        .filter_map(|id| average_ms(book.get(*id)))
        .collect();
    let typical = median(&avgs);
    let weights: Vec<u32> = case_ids
        .iter()
        .map(|id| (js_round(case_weight(book.get(*id), typical) * 100.0) as u32).max(1))
        .collect();
    let mut out = Vec::new();
    let mut prev: Option<&str> = None;
    for _ in 0..opts.count {
        if case_ids.is_empty() {
            break;
        }
        let allowed: Vec<bool> = case_ids
            .iter()
            .map(|id| case_ids.len() == 1 || Some(*id) != prev)
            .collect();
        let total: u32 = weights
            .iter()
            .zip(&allowed)
            .map(|(w, a)| if *a { *w } else { 0 })
            .sum();
        let mut r = i64::from(rng.next_int(total));
        let mut pick = 0;
        for i in 0..case_ids.len() {
            if !allowed[i] {
                continue;
            }
            r -= i64::from(weights[i]);
            if r < 0 {
                pick = i;
                break;
            }
        }
        let id = case_ids[pick];
        let turn = AUFS[rng.next_int(4) as usize];
        let use_turn = opts.auf && (opts.every_turn || familiar(book.get(id)));
        out.push(Draw {
            case_id: id.to_string(),
            turn: if use_turn { turn } else { "" },
        });
        prev = Some(id);
    }
    out
}

// ── 문제(사이트 `problem.ts`) ───────────────────────────

/// 연습 문제 하나
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Problem {
    pub case_id: String,
    /// 시작 모양에 더한 윗면 돌리기
    pub turn: &'static str,
    /// 보일 공식(맞춤 + 공식)
    pub alg: String,
    /// 공식 앞에 붙인 맞춤("", "U", "y U'" …)
    pub pre_auf: &'static str,
}

/// 문제 하나의 판: 공식 낱말, 시작 상태, 통과 모양
#[derive(Clone, Debug, PartialEq)]
pub struct ProblemBoard {
    pub tokens: Vec<String>,
    pub start: State,
    pub goal: Goal,
}

fn parse3(alg: &str) -> Vec<CubeMove> {
    parse_moves(PRACTICE_N, alg).expect("연습 공식")
}

/// 쥐기 + 상황 만들기(단원의 setup, 없으면 흔한 공식의 거꾸로) + 윗면 돌리기
pub fn case_start(stage: &PracticeStage, c: &DrillCase, turn: &str) -> State {
    let mut moves = parse3(stage.hold);
    match c.setup {
        Some(s) => moves.extend(parse3(s)),
        None => moves.extend(invert_moves(&parse3(c.algs[0]))),
    }
    moves.extend(parse3(turn));
    apply_moves(PRACTICE_N, &solved_cube(PRACTICE_N), &moves)
}

fn align_prefixes() -> &'static [&'static str] {
    &[
        "", "U", "U'", "U2", "y", "y U", "y U'", "y U2", "y'", "y' U", "y' U'", "y' U2", "y2",
        "y2 U", "y2 U'", "y2 U2",
    ]
}

/// 이 모양을 이 공식으로 목표까지 풀려면 앞에 무엇을 붙여야 하나(사이트 `alignPrefix`)
pub fn align_prefix(c: &DrillCase, start: &State, alg: &str) -> Option<&'static str> {
    let body = parse_moves(PRACTICE_N, alg).ok()?;
    if body.is_empty() {
        return None;
    }
    let goal = goal_of(c);
    align_prefixes().iter().copied().find(|pre| {
        let mut moves = parse3(pre);
        moves.extend(&body);
        goal_met(PRACTICE_N, &apply_moves(PRACTICE_N, start, &moves), goal)
    })
}

fn join_alg(pre: &str, alg: &str) -> String {
    format!("{pre} {alg}").trim().to_string()
}

pub fn problem_for(
    stage: &PracticeStage,
    c: &DrillCase,
    turn: &'static str,
    alg: &str,
) -> Option<Problem> {
    let pre = align_prefix(c, &case_start(stage, c, turn), alg)?;
    Some(Problem {
        case_id: c.id.to_string(),
        turn,
        pre_auf: pre,
        alg: join_alg(pre, alg),
    })
}

/// 출제 하나 + 고른 공식 → 문제. 고른 공식이 그 모양을 풀지 못하면 흔한 공식으로
pub fn problem_of(stage: &PracticeStage, c: &DrillCase, turn: &'static str, alg: &str) -> Problem {
    problem_for(stage, c, turn, alg)
        .or_else(|| problem_for(stage, c, turn, c.algs[0]))
        .unwrap_or_else(|| Problem {
            case_id: c.id.to_string(),
            turn,
            pre_auf: "",
            alg: c.algs[0].to_string(),
        })
}

pub fn board_for(stage: &PracticeStage, c: &DrillCase, p: &Problem) -> ProblemBoard {
    ProblemBoard {
        tokens: alg_tokens(&p.alg),
        start: case_start(stage, c, p.turn),
        goal: goal_of(c),
    }
}

// ── 따라 치기 판정(사이트 `MoveMatcher`·`FormulaRun`·`FollowJudge`) ─────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum MatchResult {
    Hit,
    Partial,
    Miss,
}

/// 표기 한 수와 친 수를 맞춰 본다. 반 바퀴는 같은 층을 두 번(어느 쪽으로든) 돌려도 맞다
#[derive(Clone, Debug)]
struct MoveMatcher {
    target: Option<CubeMove>,
    pending: u8,
}

impl MoveMatcher {
    fn new(n: usize, notation: &str) -> Self {
        MoveMatcher {
            target: notation_to_move(n, notation),
            pending: 0,
        }
    }

    fn feed(&mut self, m: &CubeMove) -> MatchResult {
        let Some(t) = self
            .target
            .filter(|t| t.axis == m.axis && t.from == m.from && t.to == m.to)
        else {
            self.pending = 0;
            return MatchResult::Miss;
        };
        if t.turns != 2 {
            self.pending = 0;
            return if m.turns == t.turns {
                MatchResult::Hit
            } else {
                MatchResult::Miss
            };
        }
        if (self.pending + m.turns) % 4 == 2 {
            self.pending = 0;
            return MatchResult::Hit;
        }
        if self.pending == 0 && m.turns != 2 {
            self.pending = m.turns;
            return MatchResult::Partial;
        }
        self.pending = 0;
        MatchResult::Miss
    }
}

/// 따라 치기 한 수의 결과(사이트 `FollowStep`)
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FollowStep {
    Hit {
        index: usize,
    },
    /// 반 바퀴를 나눠 친 반쪽
    Partial {
        index: usize,
    },
    Done,
    /// 틀린 수: 큐브에 넣지 않는다. `undo`는 먼저 넣은 반쪽을 되돌릴 수
    Miss {
        index: usize,
        undo: Vec<CubeMove>,
    },
}

#[derive(Clone, Debug)]
pub struct FollowJudge {
    pub tokens: Vec<String>,
    i: usize,
    matcher: Option<MoveMatcher>,
    pending: Vec<CubeMove>,
    pub hits: u32,
    pub misses: u32,
}

impl FollowJudge {
    pub fn new(tokens: Vec<String>) -> Self {
        let matcher = tokens.first().map(|t| MoveMatcher::new(PRACTICE_N, t));
        FollowJudge {
            tokens,
            i: 0,
            matcher,
            pending: vec![],
            hits: 0,
            misses: 0,
        }
    }

    /// 지금 칠 낱말 차례(끝나면 tokens.len())
    pub fn index(&self) -> usize {
        self.i
    }

    pub fn expected(&self) -> Option<&str> {
        self.tokens.get(self.i).map(String::as_str)
    }

    pub fn feed(&mut self, m: &CubeMove) -> Option<FollowStep> {
        let at = self.i;
        let r = self.matcher.as_mut()?.feed(m);
        match r {
            MatchResult::Partial => {
                self.pending.push(*m);
                Some(FollowStep::Partial { index: at })
            }
            MatchResult::Miss => {
                self.misses += 1;
                let undo = invert_moves(&self.pending);
                self.pending.clear();
                Some(FollowStep::Miss { index: at, undo })
            }
            MatchResult::Hit => {
                self.pending.clear();
                self.hits += 1;
                self.i += 1;
                self.matcher = self
                    .tokens
                    .get(self.i)
                    .map(|t| MoveMatcher::new(PRACTICE_N, t));
                Some(if self.matcher.is_some() {
                    FollowStep::Hit { index: at }
                } else {
                    FollowStep::Done
                })
            }
        }
    }
}

// ── 한 판(사이트 `round.ts`) ────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PracticeMode {
    /// 따라 치기
    Follow,
    /// 보고 치기
    See,
}

impl PracticeMode {
    pub fn id(self) -> &'static str {
        match self {
            PracticeMode::Follow => "follow",
            PracticeMode::See => "see",
        }
    }

    /// 메뉴 이름(사이트 `MODE_TITLE`)
    pub fn title(self) -> &'static str {
        match self {
            PracticeMode::Follow => "따라 치기",
            PracticeMode::See => "보고 치기",
        }
    }
}

/// 공식 연습 콤보: 틀림 없이(보고 치기는 펼쳐 보지 않고) 이어 맞춘 공식 수
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PracticeCombo {
    pub current: u32,
    pub best: u32,
}

impl PracticeCombo {
    fn hit(&mut self) {
        self.current += 1;
        self.best = self.best.max(self.current);
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ProblemResult {
    pub case_id: String,
    /// 첫 수부터 다 맞출 때까지
    pub ms: f64,
    pub moves: u32,
    pub misses: u32,
    pub peeked: bool,
}

/// 판 끝 결과(사이트 `RoundSummary`)
#[derive(Clone, Debug, PartialEq)]
pub struct RoundSummary {
    /// 0~1
    pub accuracy: f64,
    pub avg_ms: f64,
    /// 1분에 친 수
    pub per_minute: f64,
    pub best_combo: u32,
    /// 수 하나에 오래 걸린 공식 셋(같은 상황은 한 번): (상황 id, ms)
    pub slow: Vec<(String, f64)>,
}

#[derive(Clone, Debug)]
pub struct PracticeRound {
    pub index: usize,
    pub problems: Vec<Problem>,
    pub mode: PracticeMode,
    pub results: Vec<ProblemResult>,
    pub combo: PracticeCombo,
    tokens: Vec<Vec<String>>,
    judge: Option<FollowJudge>,
    started_at: Option<f64>,
    typed: u32,
    misses: u32,
    peeked: bool,
    hits_all: u32,
    misses_all: u32,
}

impl PracticeRound {
    /// `tokens`: 문제마다 공식 낱말
    pub fn new(problems: Vec<Problem>, tokens: Vec<Vec<String>>, mode: PracticeMode) -> Self {
        let mut r = PracticeRound {
            index: 0,
            problems,
            mode,
            results: vec![],
            combo: PracticeCombo::default(),
            tokens,
            judge: None,
            started_at: None,
            typed: 0,
            misses: 0,
            peeked: false,
            hits_all: 0,
            misses_all: 0,
        };
        r.reset();
        r
    }

    pub fn current(&self) -> Option<&Problem> {
        self.problems.get(self.index)
    }

    pub fn over(&self) -> bool {
        self.index >= self.problems.len()
    }

    pub fn follow(&self) -> Option<&FollowJudge> {
        self.judge.as_ref()
    }

    fn reset(&mut self) {
        self.judge = match (self.mode, self.tokens.get(self.index)) {
            (PracticeMode::Follow, Some(t)) => Some(FollowJudge::new(t.clone())),
            _ => None,
        };
        self.started_at = None;
        self.typed = 0;
        self.misses = 0;
        self.peeked = false;
    }

    fn finish(&mut self, now: f64, moves: u32) -> ProblemResult {
        let p = &self.problems[self.index];
        let r = ProblemResult {
            case_id: p.case_id.clone(),
            ms: (now - self.started_at.unwrap_or(now)).max(0.0),
            moves,
            misses: self.misses,
            peeked: self.peeked,
        };
        self.results.push(r.clone());
        let clean = match self.mode {
            PracticeMode::Follow => r.misses == 0,
            PracticeMode::See => !r.peeked,
        };
        if clean {
            self.combo.hit();
        }
        r
    }

    /// 따라 치기: 수 하나. 문제가 끝나면 결과를 함께 돌려준다
    pub fn feed_follow(
        &mut self,
        m: &CubeMove,
        now: f64,
    ) -> Option<(FollowStep, Option<ProblemResult>)> {
        if self.over() {
            return None;
        }
        let step = self.judge.as_mut()?.feed(m)?;
        if self.started_at.is_none() {
            self.started_at = Some(now);
        }
        match step {
            FollowStep::Miss { .. } => {
                self.misses += 1;
                self.misses_all += 1;
                self.combo.current = 0;
                Some((step, None))
            }
            FollowStep::Partial { .. } => Some((step, None)),
            FollowStep::Done => {
                self.hits_all += 1;
                let moves = count_moves(
                    &self
                        .judge
                        .as_ref()
                        .map(|j| j.tokens.clone())
                        .unwrap_or_default(),
                );
                let r = self.finish(now, moves);
                Some((step, Some(r)))
            }
            FollowStep::Hit { .. } => {
                self.hits_all += 1;
                Some((step, None))
            }
        }
    }

    pub fn typed_see(&mut self, now: f64) {
        if self.started_at.is_none() {
            self.started_at = Some(now);
        }
        self.typed += 1;
    }

    pub fn peek(&mut self) {
        if self.peeked {
            return;
        }
        self.peeked = true;
        self.combo.current = 0;
    }

    pub fn solved_see(&mut self, now: f64) -> Option<ProblemResult> {
        if self.mode != PracticeMode::See || self.over() {
            return None;
        }
        Some(self.finish(now, self.typed))
    }

    /// 다음 문제로. 판이 끝났으면 false
    pub fn next(&mut self) -> bool {
        if self.over() {
            return false;
        }
        self.index += 1;
        self.reset();
        !self.over()
    }

    pub fn summary(&self) -> RoundSummary {
        let rs = &self.results;
        let total_ms: f64 = rs.iter().map(|r| r.ms).sum();
        let total_moves: f64 = rs.iter().map(|r| f64::from(r.moves)).sum();
        let accuracy = match self.mode {
            PracticeMode::Follow => {
                let all = self.hits_all + self.misses_all;
                if all == 0 {
                    0.0
                } else {
                    f64::from(self.hits_all) / f64::from(all)
                }
            }
            PracticeMode::See => {
                if rs.is_empty() {
                    0.0
                } else {
                    rs.iter().filter(|r| !r.peeked).count() as f64 / rs.len() as f64
                }
            }
        };
        let per = |r: &ProblemResult| r.ms / f64::from(r.moves.max(1));
        let mut sorted: Vec<&ProblemResult> = rs.iter().collect();
        sorted.sort_by(|a, b| per(b).total_cmp(&per(a)));
        let mut seen: Vec<&str> = vec![];
        let mut slow = vec![];
        for r in sorted {
            if seen.contains(&r.case_id.as_str()) {
                continue;
            }
            seen.push(&r.case_id);
            if slow.len() < 3 {
                slow.push((r.case_id.clone(), r.ms));
            }
        }
        RoundSummary {
            accuracy,
            avg_ms: if rs.is_empty() {
                0.0
            } else {
                total_ms / rs.len() as f64
            },
            per_minute: if total_ms == 0.0 {
                0.0
            } else {
                (total_moves * 60_000.0) / total_ms
            },
            best_combo: self.combo.best,
            slow,
        }
    }
}

// ── 진행기(사이트 `session.ts`) ─────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PracticePhase {
    Play,
    /// 다 맞춘 모습을 잠깐 보이는 중
    Pause,
    /// 판 끝(결과)
    Over,
}

/// 수 하나의 결과. Applied면 앱이 장면에 그 수를 넣는다
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PracticeInput {
    Applied,
    Rejected,
    Ignored,
}

/// 앱에 알릴 일([`PracticeSession::take_events`])
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PracticeEvent {
    /// 소리: 틀린 수
    Invalid,
    /// 소리: 문제 하나를 맞춤
    Solved,
    /// 장면을 [`PracticeSession::state`]로 통째 다시 칠한다(새 문제, 반 바퀴의 반쪽 되돌림, 처음으로)
    Repaint,
    /// 판이 끝났다. 앱은 [`PracticeSession::record`]를 저장한다
    RoundOver,
}

/// 공식 연습 한 판을 화면 없이 돌리는 진행기(사이트 `PracticeSession`). 기록은 들고 있다가 고치고, 저장은 앱이 한다
pub struct PracticeSession {
    pub stage: &'static PracticeStage,
    pub mode: PracticeMode,
    pub round: PracticeRound,
    pub board: Option<ProblemBoard>,
    pub state: Option<State>,
    pub phase: PracticePhase,
    /// 틀린 낱말(차례, 낱말). 키를 잠깐 보인다
    pub wrong: Option<(usize, String)>,
    /// 보고 치기에서 공식을 펼쳤나(이 문제)
    pub peeked: bool,
    pub summary: Option<RoundSummary>,
    /// 공식 연습 기록(따라 치기 상황별·판 수·마지막 단계)
    pub record: PracticeRecord,
    /// 보고 치기 상황별 기록(사이트 `cube.train.v1`)
    pub train: TrainBook,
    pub last_result: Option<ProblemResult>,
    picked: HashMap<&'static str, String>,
    common: HashMap<&'static str, &'static str>,
    history: Vec<CubeMove>,
    pause_at: Option<f64>,
    wrong_at: Option<f64>,
    events: Vec<PracticeEvent>,
}

impl PracticeSession {
    /// 단계·방식·키 배치·내 공식·지금까지의 기록으로 시작하고 첫 판(`seed`)을 낸다
    pub fn new(
        stage: &'static PracticeStage,
        mode: PracticeMode,
        keymap: &Keymap,
        book: &AlgBook,
        mut record: PracticeRecord,
        train: TrainBook,
        seed: u32,
    ) -> Self {
        let mut picked = HashMap::new();
        let mut common = HashMap::new();
        for c in stage.cases {
            let p = pick_alg(c, keymap, book);
            common.insert(c.id, p.common);
            picked.insert(c.id, p.alg);
        }
        record.last = Some(stage.id.to_string());
        let mut s = PracticeSession {
            stage,
            mode,
            round: PracticeRound::new(vec![], vec![], mode),
            board: None,
            state: None,
            phase: PracticePhase::Play,
            wrong: None,
            peeked: false,
            summary: None,
            record,
            train,
            last_result: None,
            picked,
            common,
            history: vec![],
            pause_at: None,
            wrong_at: None,
            events: vec![],
        };
        s.new_round(seed);
        s
    }

    /// 쌓인 일을 꺼낸다(차례대로)
    pub fn take_events(&mut self) -> Vec<PracticeEvent> {
        std::mem::take(&mut self.events)
    }

    pub fn current(&self) -> Option<&'static DrillCase> {
        self.round
            .current()
            .and_then(|p| self.stage.case(&p.case_id))
    }

    /// 공식 낱말
    pub fn tokens(&self) -> &[String] {
        self.board.as_ref().map_or(&[], |b| &b.tokens)
    }

    /// 따라 치기에서 지금 칠 낱말 차례(맞춘 모습을 보이는 동안은 끝)
    pub fn at(&self) -> usize {
        if self.phase != PracticePhase::Play {
            return self.tokens().len();
        }
        self.round.follow().map_or(0, FollowJudge::index)
    }

    /// 판 끝에 「외워서 쳐 보기」를 권하나
    pub fn suggest_see(&self) -> bool {
        let ids: Vec<&str> = self.stage.cases.iter().map(|c| c.id).collect();
        self.mode == PracticeMode::Follow && suggest_see(&self.record, &ids)
    }

    /// 고른 공식이 실물에서 흔한 공식과 다르면 흔한 공식
    pub fn common_alg(&self) -> Option<&'static str> {
        let p = self.round.current()?;
        let common = *self.common.get(p.case_id.as_str())?;
        (Some(common) != self.picked.get(p.case_id.as_str()).map(String::as_str)).then_some(common)
    }

    /// 상황마다 고른 공식
    pub fn picked_alg(&self, case_id: &str) -> Option<&str> {
        self.picked.get(case_id).map(String::as_str)
    }

    /// 새 판(10문제). 판 끝 결과를 보다가 「한 판 더」
    pub fn new_round(&mut self, seed: u32) {
        self.pause_at = None;
        self.wrong_at = None;
        let ids: Vec<&str> = self.stage.cases.iter().map(|c| c.id).collect();
        let book = match self.mode {
            PracticeMode::Follow => &self.record.follow,
            PracticeMode::See => &self.train,
        };
        let problems: Vec<Problem> = draw_round(
            &ids,
            DrawOptions {
                seed,
                book: Some(book),
                auf: self.stage.auf,
                every_turn: false,
                count: ROUND_SIZE,
            },
        )
        .into_iter()
        .map(|d| {
            let c = self.stage.case(&d.case_id).expect("상황");
            problem_of(self.stage, c, d.turn, &self.picked[c.id])
        })
        .collect();
        let tokens = problems.iter().map(|p| alg_tokens(&p.alg)).collect();
        self.round = PracticeRound::new(problems, tokens, self.mode);
        self.summary = None;
        self.show_problem();
    }

    fn show_problem(&mut self) {
        self.board = self.round.current().and_then(|p| {
            self.stage
                .case(&p.case_id)
                .map(|c| board_for(self.stage, c, p))
        });
        self.state = self.board.as_ref().map(|b| b.start.clone());
        self.phase = PracticePhase::Play;
        self.wrong = None;
        self.peeked = false;
        self.last_result = None;
        self.history.clear();
        if self.state.is_some() {
            self.events.push(PracticeEvent::Repaint);
        }
    }

    /// 시각 `now`까지 닿은 일(맞춘 모습 멈춤 끝, 틀린 키 보이기 끝)을 처리한다
    pub fn tick(&mut self, now: f64) {
        if self.wrong_at.is_some_and(|t| t <= now) {
            self.wrong_at = None;
            self.wrong = None;
        }
        if self.pause_at.is_some_and(|t| t <= now) {
            self.pause_at = None;
            if !self.round.next() {
                self.phase = PracticePhase::Over;
                self.summary = Some(self.round.summary());
                let r = self
                    .record
                    .rounds
                    .entry(self.stage.id.to_string())
                    .or_insert((0, 0));
                match self.mode {
                    PracticeMode::Follow => r.0 += 1,
                    PracticeMode::See => r.1 += 1,
                }
                self.events.push(PracticeEvent::RoundOver);
                return;
            }
            self.show_problem();
        }
    }

    /// 수 하나(시각 `now`). 판 끝·멈춤 중이면 받지 않는다
    pub fn input(&mut self, m: &CubeMove, now: f64) -> PracticeInput {
        self.tick(now);
        if self.phase != PracticePhase::Play || self.board.is_none() {
            return PracticeInput::Ignored;
        }
        let Some(state) = self.state.clone() else {
            return PracticeInput::Ignored;
        };
        let n = PRACTICE_N;
        if self.mode == PracticeMode::Follow {
            let Some((step, result)) = self.round.feed_follow(m, now) else {
                return PracticeInput::Ignored;
            };
            if let FollowStep::Miss { index, undo } = step {
                let expected = self
                    .round
                    .follow()
                    .and_then(FollowJudge::expected)
                    .unwrap_or("")
                    .to_string();
                self.wrong = Some((index, expected));
                self.wrong_at = Some(now + WRONG_SHOW_MS);
                self.events.push(PracticeEvent::Invalid);
                if !undo.is_empty() {
                    self.state = Some(apply_moves(n, &state, &undo));
                    self.events.push(PracticeEvent::Repaint);
                }
                return PracticeInput::Rejected;
            }
            self.state = Some(apply_move(n, &state, m));
            if let Some(r) = result {
                with_solve(
                    &mut self.record.follow,
                    &r.case_id,
                    js_round(r.ms),
                    f64::from(r.moves),
                );
                if r.misses > 0 {
                    with_fail(&mut self.record.follow, &r.case_id);
                }
                self.solved_problem(r, now);
            }
            return PracticeInput::Applied;
        }
        let next = apply_move(n, &state, m);
        self.history.push(*m);
        if !m.is_rotation(n) {
            self.round.typed_see(now);
        }
        let goal = self.board.as_ref().map(|b| b.goal).expect("판");
        self.state = Some(next.clone());
        if goal_met(n, &next, goal) {
            if let Some(r) = self.round.solved_see(now) {
                if !r.peeked {
                    with_solve(
                        &mut self.train,
                        &r.case_id,
                        js_round(r.ms),
                        f64::from(r.moves),
                    );
                }
                self.solved_problem(r, now);
            }
        }
        PracticeInput::Applied
    }

    /// 보고 치기: 마지막 수를 되돌린다(장면에 넣을 수를 돌려준다)
    pub fn undo(&mut self, now: f64) -> Option<CubeMove> {
        self.tick(now);
        if self.mode != PracticeMode::See || self.phase != PracticePhase::Play {
            return None;
        }
        let state = self.state.clone()?;
        let last = self.history.pop()?;
        let back = last.inverse();
        self.state = Some(apply_move(PRACTICE_N, &state, &back));
        Some(back)
    }

    /// 보고 치기: 처음 모양으로 되돌린다(장면은 다시 칠한다)
    pub fn reset(&mut self, now: f64) -> bool {
        self.tick(now);
        if self.mode != PracticeMode::See || self.phase != PracticePhase::Play {
            return false;
        }
        let Some(board) = &self.board else {
            return false;
        };
        self.state = Some(board.start.clone());
        self.history.clear();
        self.events.push(PracticeEvent::Repaint);
        true
    }

    /// 보고 치기: 공식을 펼친다(그 문제는 콤보에서 빠진다)
    pub fn peek(&mut self, now: f64) -> bool {
        self.tick(now);
        if self.mode != PracticeMode::See || self.phase != PracticePhase::Play || self.peeked {
            return false;
        }
        self.round.peek();
        self.peeked = true;
        true
    }

    fn solved_problem(&mut self, r: ProblemResult, now: f64) {
        self.wrong_at = None;
        self.wrong = None;
        self.last_result = Some(r);
        self.phase = PracticePhase::Pause;
        self.events.push(PracticeEvent::Solved);
        self.pause_at = Some(now + SOLVED_PAUSE_MS);
    }
}
