//! 홈 시연 한 판(Cubie 미니가 떠 있을 때, 다시 볼 판이 없으면): 섞기 → 쥐는 방향 맞추기 → 사람 해법 풀이.
//!
//! 옮긴 원본(웹 `apps/web/src/cube/`):
//! - `piece-marks.ts`: 조각 묶음(십자 엣지·첫 층 코너·둘째 층 엣지·F2L 짝), 보이는 세 면에서 찾는 돌리기, 강조 사건,
//!   마지막 층 단계의 맞출 칸·알아볼 모양
//! - `hero/present.ts`: 보여 주기 변환(첫 층을 위에서 보이기, 넣는 칸을 앞-오른쪽으로, 이미 맞은 조각 확인, 쉬는 자리)
//! - `hero/loop.ts`: 시간(`heroTiming`), 무작위 섞기(`randomScramble`), 쥐는 방향(`orientForSolve`), 연출 걸음
//!   (`scrambleSteps`·`orientSteps`·`solveSteps`, 강조 「잠깐」), 회전 시간(`heroMoveMs`)
//! - `hero/methods.ts`: 꼬리표(`heroStageLabel`)와 해법 표 전부(`HERO_METHODS`: 2×2 초보자·공식, 3×3 초보자·프리드리히·
//!   루·ZZ, 4×4~7×7 축소법 초보자·프리드리히, 4×4 야우)와 첫 면 색 고르기(`solveWithFirst`)
//!
//! 사이트와 같은지는 공통 시험 자료 `fixtures/hero-show.json`(2×2·3×3)·`hero-show-big.json`(4×4~7×7)으로 본다(docs/52 5-10).

use std::collections::HashSet;

use crate::hero::solve_with_cheapest_first;
use crate::human::{solve_cfop_first, solve_intermediate2, HumanSolve, SolveError, StageName};
use crate::notation::{format_move, parse_moves, CubeMove};
use crate::roux_zz::{solve_roux, solve_zz};
use crate::state::{apply_alg, apply_move, apply_moves, face_colors, solved_cube, State};
use crate::taught::{solve_beginner2_taught, solve_beginner3_taught};
use crate::topology::{cube_topology, PieceKind};

// ── 조각 강조(사이트 `piece-marks.ts`) ─────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarkKind {
    /// 넣을 곳
    Slot,
    /// 찾은 조각
    Found,
    /// 맞춘 조각
    Placed,
}

impl MarkKind {
    pub fn id(self) -> &'static str {
        match self {
            MarkKind::Slot => "slot",
            MarkKind::Found => "found",
            MarkKind::Placed => "placed",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PieceMark {
    pub kind: MarkKind,
    /// 스티커 정체 번호
    pub stickers: Vec<usize>,
    pub solo: bool,
    pub check: bool,
}

fn mark(kind: MarkKind, stickers: Vec<usize>, solo: bool) -> PieceMark {
    PieceMark {
        kind,
        stickers,
        solo,
        check: false,
    }
}

/// 한 번에 넣는 조각들(맞춘 큐브의 조각 자리 번호)
#[derive(Clone, Debug, PartialEq, Eq)]
struct Unit {
    pieces: Vec<usize>,
}

const SEARCH_ORDER: [&str; 7] = ["y", "y", "y", "x2", "y", "y", "y"];

fn piece_faces(p: usize) -> Vec<usize> {
    let t = cube_topology(3);
    t.pieces[p]
        .stickers
        .iter()
        .map(|&s| t.stickers[s].face)
        .collect()
}

fn pieces_of_kind(kind: PieceKind) -> Vec<usize> {
    let t = cube_topology(3);
    (0..t.pieces.len())
        .filter(|&i| t.pieces[i].kind == kind)
        .collect()
}

fn units_for_stage(n: usize, stage: &str, first: usize) -> Option<Vec<Unit>> {
    if n != 3 {
        return None;
    }
    let white = first;
    let yellow = (first + 3) % 6;
    let edges = pieces_of_kind(PieceKind::Edge);
    let corners = pieces_of_kind(PieceKind::Corner);
    let has = |p: usize, f: usize| piece_faces(p).contains(&f);
    let one = |list: Vec<usize>| list.into_iter().map(|p| Unit { pieces: vec![p] }).collect();
    match stage {
        "cross" => Some(one(edges.into_iter().filter(|&p| has(p, white)).collect())),
        "corners" => Some(one(corners
            .into_iter()
            .filter(|&p| has(p, white))
            .collect())),
        "middle" => Some(one(edges
            .into_iter()
            .filter(|&p| !has(p, white) && !has(p, yellow))
            .collect())),
        s if s.starts_with("f2l-") => Some(
            corners
                .iter()
                .filter(|&&c| has(c, white))
                .map(|&c| {
                    let others: Vec<usize> =
                        piece_faces(c).into_iter().filter(|&f| f != white).collect();
                    let e = *edges
                        .iter()
                        .find(|&&p| {
                            let fs = piece_faces(p);
                            fs.len() == 2 && others.iter().all(|f| fs.contains(f))
                        })
                        .expect("짝 엣지");
                    Unit { pieces: vec![c, e] }
                })
                .collect(),
        ),
        _ => None,
    }
}

fn location_of(state: &State, p: usize) -> Option<usize> {
    let t = cube_topology(3);
    (0..state.perm.len())
        .find(|&s| t.stickers[state.perm[s] as usize].piece == p)
        .map(|s| t.stickers[s].piece)
}

fn center_colors(state: &State) -> [u8; 6] {
    let c = face_colors(3, state);
    [0, 1, 2, 3, 4, 5].map(|f| c[f * 9 + 4])
}

fn piece_solved(state: &State, p: usize) -> bool {
    let t = cube_topology(3);
    let colors = face_colors(3, state);
    let centers = center_colors(state);
    let Some(at) = location_of(state, p) else {
        return false;
    };
    t.pieces[at]
        .stickers
        .iter()
        .all(|&s| colors[s] == centers[t.stickers[s].face])
}

fn unit_solved(state: &State, u: &Unit) -> bool {
    u.pieces.iter().all(|&p| piece_solved(state, p))
}

fn unit_visible(state: &State, u: &Unit) -> bool {
    let t = cube_topology(3);
    u.pieces.iter().any(|&p| {
        location_of(state, p).is_some_and(|at| {
            t.pieces[at]
                .stickers
                .iter()
                .any(|&s| t.stickers[s].face < 3)
        })
    })
}

fn unit_stickers(u: &Unit) -> Vec<usize> {
    let t = cube_topology(3);
    u.pieces
        .iter()
        .flat_map(|&p| t.pieces[p].stickers.clone())
        .collect()
}

fn sorted<T: Ord + Clone>(v: &[T]) -> Vec<T> {
    let mut v = v.to_vec();
    v.sort();
    v
}

/// 묶음이 들어갈 곳에 지금 붙은 스티커 정체(사이트 `slotStickers`)
fn unit_slot_stickers(state: &State, u: &Unit) -> Vec<usize> {
    let t = cube_topology(3);
    let centers = center_colors(state);
    let mut out = vec![];
    for &p in &u.pieces {
        let want = sorted(&piece_faces(p).iter().map(|&f| f as u8).collect::<Vec<_>>());
        let kind = t.pieces[p].kind;
        let home = t.pieces.iter().position(|q| {
            q.kind == kind
                && sorted(
                    &q.stickers
                        .iter()
                        .map(|&s| centers[t.stickers[s].face])
                        .collect::<Vec<_>>(),
                ) == want
        });
        if let Some(h) = home {
            for &s in &t.pieces[h].stickers {
                out.push(state.perm[s] as usize);
            }
        }
    }
    out
}

fn alg(state: &State, text: &str) -> State {
    apply_alg(3, state, text).expect("표기")
}

fn search_turns(state: &State, units: &[Unit]) -> Option<Vec<&'static str>> {
    let seen = |s: &State| units.iter().any(|u| unit_visible(s, u));
    if seen(state) {
        return Some(vec![]);
    }
    let mut out = vec![];
    let mut s = state.clone();
    for t in SEARCH_ORDER {
        s = alg(&s, t);
        out.push(t);
        if seen(&s) {
            return Some(out);
        }
    }
    None
}

fn split_by_units(
    states: &[State],
    from: usize,
    to: usize,
    units: &[Unit],
    guard: &[Unit],
) -> Vec<(usize, Vec<Unit>)> {
    let (Some(start), Some(end)) = (states.get(from), states.get(to)) else {
        return vec![];
    };
    let fresh: Vec<&Unit> = units
        .iter()
        .filter(|u| !unit_solved(start, u) && unit_solved(end, u))
        .collect();
    if fresh.len() <= 1 {
        return fresh
            .first()
            .map(|u| vec![(to, vec![(*u).clone()])])
            .unwrap_or_default();
    }
    let kept: Vec<&Unit> = guard.iter().filter(|u| unit_solved(start, u)).collect();
    let mut groups: Vec<(usize, Vec<Unit>)> = vec![];
    for u in fresh {
        let mut at = to;
        while at - 1 > from && unit_solved(&states[at - 1], u) {
            at -= 1;
        }
        while at < to && !kept.iter().all(|k| unit_solved(&states[at], k)) {
            at += 1;
        }
        match groups.iter_mut().find(|g| g.0 == at) {
            Some(g) => g.1.push(u.clone()),
            None => groups.push((at, vec![u.clone()])),
        }
    }
    groups.sort_by_key(|g| g.0);
    groups
}

fn ids_at(state: &State, positions: &[usize]) -> Vec<usize> {
    positions.iter().map(|&p| state.perm[p] as usize).collect()
}

fn unit_at(state: &State, u: &Unit, positions: &[usize]) -> bool {
    let want: HashSet<usize> = unit_stickers(u).into_iter().collect();
    let here = ids_at(state, positions);
    here.len() == want.len() && here.iter().all(|id| want.contains(id))
}

// 마지막 층

const U_EDGES: [usize; 4] = [1, 3, 5, 7];
const U_ALL: [usize; 9] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const EDGE_SIDES: [usize; 4] = [10, 19, 37, 46];
const TOP_CORNERS: [[usize; 3]; 4] = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11]];
const SIDE_ROWS: [[usize; 3]; 4] = [[18, 19, 20], [9, 10, 11], [45, 46, 47], [36, 37, 38]];

#[derive(Clone, Copy, PartialEq, Eq)]
enum Ll {
    UEdges,
    UFace,
    Corners,
    EdgeSides,
    SideRows,
}

fn ll_kind(stage: &str) -> Option<Ll> {
    Some(match stage {
        "eo" => Ll::UEdges,
        "co" | "oll" | "ll-corner-twist" => Ll::UFace,
        "cp" | "ll-corner-place" => Ll::Corners,
        "ep" | "ll-edges" => Ll::EdgeSides,
        "pll" => Ll::SideRows,
        _ => return None,
    })
}

fn ll_positions(kind: Ll) -> Vec<usize> {
    match kind {
        Ll::UEdges => U_EDGES.to_vec(),
        Ll::UFace => U_ALL.to_vec(),
        Ll::Corners => TOP_CORNERS.concat(),
        Ll::EdgeSides => EDGE_SIDES.to_vec(),
        Ll::SideRows => SIDE_ROWS.concat(),
    }
}

fn ll_target_ids(state: &State, stage: &str) -> Vec<usize> {
    ll_kind(stage).map_or(vec![], |k| ids_at(state, &ll_positions(k)))
}

fn ll_correct_positions(state: &State, kind: Ll) -> Vec<usize> {
    let colors = face_colors(3, state);
    let centers = center_colors(state);
    if kind == Ll::Corners {
        return TOP_CORNERS
            .iter()
            .filter(|c| sorted(&c.map(|p| colors[p])) == sorted(&c.map(|p| centers[p / 9])))
            .flatten()
            .copied()
            .collect();
    }
    ll_positions(kind)
        .into_iter()
        .filter(|&p| colors[p] == centers[p / 9])
        .collect()
}

fn ll_correct_ids(state: &State, stage: &str) -> Vec<usize> {
    ll_kind(stage).map_or(vec![], |k| ids_at(state, &ll_correct_positions(state, k)))
}

fn ll_shape_ids(state: &State, stage: &str, after: &State) -> Vec<usize> {
    let Some(kind) = ll_kind(stage) else {
        return vec![];
    };
    let colors = face_colors(3, state);
    let yellow = colors[4];
    if stage == "ll-corner-twist" {
        let was: HashSet<usize> = ids_at(
            state,
            &[0, 2, 6, 8]
                .into_iter()
                .filter(|&p| colors[p] == yellow)
                .collect::<Vec<_>>(),
        )
        .into_iter()
        .collect();
        let now = face_colors(3, after);
        let mut out: Vec<usize> = vec![];
        for c in TOP_CORNERS
            .iter()
            .filter(|c| now[c[0]] == yellow && !was.contains(&(after.perm[c[0]] as usize)))
        {
            for id in ids_at(after, c) {
                if !out.contains(&id) {
                    out.push(id);
                }
            }
        }
        return out;
    }
    match kind {
        Ll::UEdges => {
            let mut pos = vec![4];
            pos.extend(U_EDGES.iter().filter(|&&p| colors[p] == yellow));
            ids_at(state, &pos)
        }
        Ll::UFace => {
            let pos: Vec<usize> = U_ALL
                .iter()
                .chain(SIDE_ROWS.iter().flatten())
                .copied()
                .filter(|&p| colors[p] == yellow)
                .collect();
            ids_at(state, &pos)
        }
        Ll::EdgeSides => {
            let mut best = vec![];
            for t in ["", "U", "U2", "U'"] {
                let s = alg(state, t);
                let ids = ids_at(&s, &ll_correct_positions(&s, Ll::EdgeSides));
                if ids.len() > best.len() {
                    best = ids;
                }
            }
            best
        }
        Ll::Corners => ids_at(state, &ll_correct_positions(state, Ll::Corners)),
        Ll::SideRows => {
            let marked: Vec<usize> = SIDE_ROWS
                .iter()
                .flat_map(|row| {
                    row.iter()
                        .copied()
                        .filter(|&p| row.iter().any(|&q| q != p && colors[q] == colors[p]))
                        .collect::<Vec<_>>()
                })
                .collect();
            if marked.is_empty() {
                ids_at(state, &SIDE_ROWS.concat())
            } else {
                ids_at(state, &marked)
            }
        }
    }
}

// ── 보여 주기 변환(사이트 `hero/present.ts`) ─────────────────

/// 화면에 보이는 방향 규칙(사이트 `HeroView`)
#[derive(Clone, Debug, Default)]
pub struct HeroView {
    pub up: Vec<&'static str>,
    pub mirror: Vec<&'static str>,
    pub search: bool,
    pub keep_y: Vec<&'static str>,
    pub bring: Vec<&'static str>,
}

/// 보여 주기 변환 뒤의 풀이(사이트 `PresentOutput`)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Presented {
    pub moves: Vec<String>,
    /// (단계 이름, 시작, 끝)
    pub stages: Vec<(String, usize, usize)>,
    pub looks: Vec<usize>,
    pub searches: Vec<usize>,
    pub marks: Vec<(usize, PieceMark)>,
    pub gaps: Vec<usize>,
}

const KEEP: [&str; 13] = [
    "centers-ud",
    "centers-rest",
    "edges",
    "last-edges",
    "fb",
    "sb",
    "cmll",
    "lse-eo",
    "lse-ulur",
    "lse-ep",
    "eoline",
    "zz-left",
    "zz-right",
];

#[derive(Clone, Copy, PartialEq, Eq)]
enum SlotKind {
    Corner,
    Edge,
    Pair,
    TopCorner,
    TopEdge,
}

fn insert_kind(name: &str) -> Option<SlotKind> {
    if name == "corners" || name == "first-layer" {
        return Some(SlotKind::Corner);
    }
    if name == "middle" {
        return Some(SlotKind::Edge);
    }
    if name.starts_with("f2l-") {
        return Some(SlotKind::Pair);
    }
    None
}

type Mat = [i32; 9];
const I: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const QUARTER: [Mat; 3] = [
    [1, 0, 0, 0, 0, 1, 0, -1, 0],
    [0, 0, -1, 0, 1, 0, 1, 0, 0],
    [0, 1, 0, -1, 0, 0, 0, 0, 1],
];

fn mul(a: &Mat, b: &Mat) -> Mat {
    let mut out = [0; 9];
    for r in 0..3 {
        for c in 0..3 {
            out[r * 3 + c] = (0..3).map(|k| a[r * 3 + k] * b[k * 3 + c]).sum();
        }
    }
    out
}

fn transpose(a: &Mat) -> Mat {
    [0, 3, 6, 1, 4, 7, 2, 5, 8].map(|i| a[i])
}

fn rotation_mat(axis: u8, turns: u8) -> Mat {
    let mut m = I;
    for _ in 0..turns {
        m = mul(&QUARTER[axis as usize], &m);
    }
    m
}

fn token_mat(token: &str) -> Mat {
    let axis = match token.as_bytes()[0] {
        b'x' => 0,
        b'y' => 1,
        _ => 2,
    };
    let turns = if token.ends_with('2') {
        2
    } else if token.ends_with('\'') {
        3
    } else {
        1
    };
    rotation_mat(axis, turns)
}

fn token_lists() -> &'static Vec<Vec<String>> {
    static L: std::sync::OnceLock<Vec<Vec<String>>> = std::sync::OnceLock::new();
    L.get_or_init(|| {
        let single: Vec<String> = ["x", "y", "z"]
            .iter()
            .flat_map(|a| [a.to_string(), format!("{a}'"), format!("{a}2")])
            .collect();
        let mut out: Vec<Vec<String>> = vec![vec![]];
        for t in ["y", "y'", "y2", "z2", "x2", "x", "x'", "z", "z'"] {
            out.push(vec![t.to_string()]);
        }
        for a in &single {
            for b in &single {
                if a.as_bytes()[0] != b.as_bytes()[0] {
                    out.push(vec![a.clone(), b.clone()]);
                }
            }
        }
        out
    })
}

fn list_mat(list: &[String]) -> Mat {
    list.iter().fold(I, |acc, t| mul(&token_mat(t), &acc))
}

fn tokens_for(m: &Mat) -> Vec<String> {
    token_lists()
        .iter()
        .find(|l| list_mat(l) == *m)
        .cloned()
        .expect("돌리기 표기")
}

fn conjugate(n: usize, g: &Mat, m: &CubeMove) -> CubeMove {
    let a = m.axis as usize;
    let col = [g[a], g[3 + a], g[6 + a]];
    let b = col.iter().position(|&v| v != 0).expect("돌리기 행렬");
    if col[b] > 0 {
        return CubeMove {
            axis: b as u8,
            ..*m
        };
    }
    CubeMove {
        axis: b as u8,
        from: n + 1 - m.to,
        to: n + 1 - m.from,
        turns: 4 - m.turns,
    }
}

fn slot_stickers(n: usize, kind: SlotKind) -> Vec<usize> {
    let nn = n * n;
    let at = |f: usize, r: usize, c: usize| f * nn + r * n + c;
    let m = n / 2;
    let dfr = vec![at(3, 0, n - 1), at(2, n - 1, n - 1), at(1, n - 1, 0)];
    let fr = vec![at(2, m, n - 1), at(1, m, 0)];
    match kind {
        SlotKind::TopCorner => vec![at(0, n - 1, n - 1), at(2, 0, n - 1), at(1, 0, 0)],
        SlotKind::TopEdge => vec![at(0, n - 1, m), at(2, 0, m)],
        SlotKind::Corner => dfr,
        SlotKind::Edge => fr,
        SlotKind::Pair => [dfr, fr].concat(),
    }
}

fn slot_solved(n: usize, colors: &[u8], slot: SlotKind) -> bool {
    let nn = n * n;
    let c = n / 2;
    slot_stickers(n, slot)
        .iter()
        .all(|&i| colors[i] == colors[(i / nn) * nn + c * n + c])
}

const Y_TURNS: [&str; 4] = ["", "y", "y2", "y'"];

fn y_view_state(n: usize, state: &State, k: usize) -> State {
    if k == 0 {
        state.clone()
    } else {
        apply_alg(n, state, Y_TURNS[k]).expect("표기")
    }
}

fn slot_turn(n: usize, before: &State, after: &State, slot: SlotKind) -> usize {
    let views: Vec<(Vec<u8>, Vec<u8>)> = (0..4)
        .map(|k| {
            (
                face_colors(n, &y_view_state(n, before, k)),
                face_colors(n, &y_view_state(n, after, k)),
            )
        })
        .collect();
    let pick = |list: &[usize]| if list.contains(&0) { 0 } else { list[0] };
    if n >= 3 {
        let fresh: Vec<usize> = (0..4)
            .filter(|&k| !slot_solved(n, &views[k].0, slot) && slot_solved(n, &views[k].1, slot))
            .collect();
        if !fresh.is_empty() {
            return pick(&fresh);
        }
    }
    let idx = slot_stickers(n, slot);
    let changed: Vec<usize> = (0..4)
        .filter(|&k| idx.iter().any(|&i| views[k].0[i] != views[k].1[i]))
        .collect();
    if changed.is_empty() {
        0
    } else {
        pick(&changed)
    }
}

fn first_face(n: usize, state: &State, first: usize) -> usize {
    let colors = face_colors(n, state);
    let nn = n * n;
    let mut best = 0;
    let mut best_count: i32 = -1;
    for f in 0..6 {
        let count = (0..nn)
            .filter(|&i| colors[f * nn + i] as usize == first)
            .count() as i32;
        if count > best_count {
            best = f;
            best_count = count;
        }
    }
    best
}

const NORMAL: [[i32; 3]; 6] = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
    [-1, 0, 0],
    [0, 0, -1],
];

fn lift_to_up(face: usize) -> Vec<String> {
    let v = NORMAL[face];
    for list in token_lists() {
        if list.len() > 1 {
            break;
        }
        let acc = list_mat(list);
        if acc[3] * v[0] + acc[4] * v[1] + acc[5] * v[2] == 1 {
            return list.clone();
        }
    }
    unreachable!("면을 위로 들 돌리기")
}

#[derive(Clone)]
struct Out {
    m: CubeMove,
    look: bool,
    stage: usize,
    search: bool,
    events: Vec<PieceMark>,
}

fn is_whole(n: usize, m: &CubeMove) -> bool {
    m.from == 1 && m.to == n
}

struct Presenter<'a> {
    n: usize,
    g: Mat,
    state: State,
    carry_look: bool,
    pending: Vec<PieceMark>,
    out: Vec<Out>,
    look_set: HashSet<usize>,
    parsed: Vec<Vec<CubeMove>>,
    stage_names: Vec<&'a str>,
    keep_y: &'a [&'static str],
    raw_states: Vec<State>,
    guard: Vec<Unit>,
    known: HashSet<Vec<usize>>,
}

impl Presenter<'_> {
    fn push(&mut self, m: CubeMove, stage: usize, look: bool, search: bool) {
        let item = Out {
            m,
            look: look || self.carry_look,
            stage,
            search,
            events: std::mem::take(&mut self.pending),
        };
        self.out.push(item);
        self.carry_look = false;
        self.state = apply_move(self.n, &self.state, &m);
    }

    fn turn(&mut self, tokens: &[String], stage: usize, look: bool, search: bool) {
        for (i, t) in tokens.iter().enumerate() {
            let m = parse_moves(self.n, t).expect("돌리기")[0];
            self.push(m, stage, look && i == 0, search);
            self.g = mul(&token_mat(t), &self.g);
        }
    }

    fn play(&mut self, from: usize, to: usize, stage: usize, keep: bool) {
        let y_kept = self.keep_y.contains(&self.stage_names[stage]);
        for i in from..to {
            if self.look_set.contains(&i) {
                self.carry_look = true;
            }
            for m in self.parsed[i].clone() {
                if !keep && is_whole(self.n, &m) {
                    self.g = mul(&self.g, &transpose(&rotation_mat(m.axis, m.turns)));
                    continue;
                }
                if y_kept && !is_whole(self.n, &m) && self.g != I {
                    let back = tokens_for(&transpose(&self.g));
                    self.turn(&back, stage, false, false);
                }
                let c = conjugate(self.n, &self.g, &m);
                self.push(c, stage, false, false);
            }
        }
    }

    fn peek(&self, from: usize, to: usize, keep: bool) -> State {
        let mut gg = self.g;
        let mut st = self.state.clone();
        for i in from..to {
            for m in &self.parsed[i] {
                if !keep && is_whole(self.n, m) {
                    gg = mul(&gg, &transpose(&rotation_mat(m.axis, m.turns)));
                    continue;
                }
                st = apply_move(self.n, &st, &conjugate(self.n, &gg, m));
            }
        }
        st
    }

    fn find_units(&mut self, units: &[Unit], from: usize, stage_start: usize, stage: usize) {
        let tokens: Vec<String> = search_turns(&self.state, units)
            .unwrap_or_default()
            .into_iter()
            .map(String::from)
            .collect();
        let look = self.look_set.contains(&from) && from != stage_start;
        if !tokens.is_empty() {
            self.turn(&tokens, stage, look, true);
            if look {
                self.look_set.remove(&from);
            }
        }
        let slot: Vec<usize> = units
            .iter()
            .flat_map(|u| unit_slot_stickers(&self.state, u))
            .collect();
        let found: Vec<usize> = units.iter().flat_map(unit_stickers).collect();
        self.pending.push(mark(MarkKind::Slot, slot, false));
        self.pending.push(mark(MarkKind::Found, found, false));
        if !tokens.is_empty() {
            let back = tokens_for(&transpose(&list_mat(&tokens)));
            self.turn(&back, stage, false, true);
        }
    }

    fn y_to_slot(&self, u: &Unit, slot: SlotKind) -> Option<usize> {
        let at = slot_stickers(self.n, slot);
        (0..4).find(|&k| unit_at(&y_view_state(self.n, &self.state, k), u, &at))
    }

    fn check_units(&mut self, list: Vec<Unit>, slot: SlotKind, stage: usize) {
        let mut left: Vec<Unit> = list
            .into_iter()
            .filter(|u| !self.known.contains(&u.pieces))
            .collect();
        let cost = |k: usize| if k == 3 { 1 } else { k };
        while !left.is_empty() {
            let mut bi = 0;
            let mut best_k = self.y_to_slot(&left[0], slot).unwrap_or(0);
            for (i, u) in left.iter().enumerate().skip(1) {
                let k = self.y_to_slot(u, slot).unwrap_or(0);
                if cost(k) < cost(best_k) {
                    bi = i;
                    best_k = k;
                }
            }
            if best_k != 0 {
                self.turn(&[Y_TURNS[best_k].to_string()], stage, false, false);
            }
            let best = left.remove(bi);
            self.pending.push(PieceMark {
                kind: MarkKind::Placed,
                stickers: unit_stickers(&best),
                solo: true,
                check: true,
            });
            self.known.insert(best.pieces);
        }
    }
}

fn is_u_turn(m: &CubeMove) -> bool {
    m.axis == 1 && m.from == 1 && m.to == 1
}

fn cuts_of(looks: &[usize], start: usize, end: usize) -> Vec<usize> {
    let mut cuts = vec![start];
    cuts.extend(looks.iter().copied().filter(|&l| l > start && l < end));
    cuts.push(end);
    cuts
}

/// 사이트 `presentSolve`. `stages`는 (이름, 시작, 끝), `first`는 해법이 첫 면으로 맞춘 색
pub fn present_solve(
    n: usize,
    start: &State,
    moves: &[String],
    stages: &[(String, usize, usize)],
    looks: &[usize],
    view: &HeroView,
    first: usize,
) -> Presented {
    let up = &view.up;
    let parsed: Vec<Vec<CubeMove>> = moves
        .iter()
        .map(|t| parse_moves(n, t).expect("해법 수"))
        .collect();
    let mut raw_states = vec![];
    if view.search {
        let mut s = start.clone();
        raw_states.push(s.clone());
        for ms in &parsed {
            s = apply_moves(n, &s, ms);
            raw_states.push(s.clone());
        }
    }
    let mut p = Presenter {
        n,
        g: I,
        state: start.clone(),
        carry_look: false,
        pending: vec![],
        out: vec![],
        look_set: looks.iter().copied().collect(),
        parsed,
        stage_names: stages.iter().map(|s| s.0.as_str()).collect(),
        keep_y: &view.keep_y,
        raw_states,
        guard: vec![],
        known: HashSet::new(),
    };
    let up_idx: Vec<usize> = (0..stages.len())
        .filter(|&i| up.contains(&stages[i].0.as_str()))
        .collect();
    let first_up = up_idx.first().copied();
    let last_up = up_idx.last().copied();
    let mut down_checked = !up_idx.is_empty();
    let shaped =
        |name: &str| !KEEP.contains(&name) && (up.contains(&name) || insert_kind(name).is_some());
    let last_shaped = (0..stages.len()).rev().find(|&i| shaped(&stages[i].0));

    for (si, (name, st_start, st_end)) in stages.iter().enumerate() {
        let (name, st_start, st_end) = (name.as_str(), *st_start, *st_end);
        if view.search && n == 3 && ll_kind(name).is_some() && st_end > st_start {
            // 마지막 층 단계
            p.pending
                .push(mark(MarkKind::Slot, ll_target_ids(&p.state, name), true));
            let cuts = cuts_of(looks, st_start, st_end);
            for c in 0..cuts.len() - 1 {
                let (from, to) = (cuts[c], cuts[c + 1]);
                let formula = p.parsed[from..to]
                    .iter()
                    .flatten()
                    .any(|m| !is_whole(n, m) && !is_u_turn(m));
                if formula {
                    let after = p.peek(from, to, true);
                    let shape = ll_shape_ids(&p.state, name, &after);
                    if !shape.is_empty() {
                        p.pending.push(mark(MarkKind::Found, shape, true));
                    }
                }
                let before: HashSet<usize> = ll_correct_ids(&p.state, name).into_iter().collect();
                p.play(from, to, si, true);
                let fresh: Vec<usize> = ll_correct_ids(&p.state, name)
                    .into_iter()
                    .filter(|id| !before.contains(id))
                    .collect();
                if formula && !fresh.is_empty() {
                    p.pending.push(mark(MarkKind::Placed, fresh, false));
                }
            }
            let all = ll_correct_ids(&p.state, name);
            p.pending.push(mark(MarkKind::Placed, all, true));
            continue;
        }
        if !shaped(name) {
            if view.mirror.contains(&name) {
                let mut i = st_start;
                while i < st_end && p.parsed[i].iter().all(|m| is_whole(n, m)) {
                    i += 1;
                }
                p.play(st_start, i, si, true);
                p.turn(&["y2".to_string()], si, false, false);
                p.play(i, st_end, si, true);
                p.turn(&["y2".to_string()], si, false, false);
            } else {
                p.play(st_start, st_end, si, true);
            }
            continue;
        }
        if Some(si) == first_up {
            if let Some(lu) = last_up {
                let face = first_face(n, &p.peek(st_start, stages[lu].2, false), first);
                let mut lead = I;
                for i in st_start..st_end {
                    let ms = &p.parsed[i];
                    if !ms.iter().all(|m| is_whole(n, m)) {
                        break;
                    }
                    for m in ms {
                        lead = mul(&rotation_mat(m.axis, m.turns), &lead);
                    }
                }
                let tokens = if view.keep_y.contains(&name) {
                    tokens_for(&lead)
                } else {
                    lift_to_up(face)
                };
                p.turn(&tokens, si, false, false);
            }
        }
        let kind = insert_kind(name);
        if kind.is_some() && !down_checked {
            down_checked = true;
            let face = first_face(n, &p.peek(st_start, st_end, false), first);
            let lift = list_mat(&lift_to_up(face));
            let tokens = tokens_for(&mul(&rotation_mat(2, 2), &lift));
            p.turn(&tokens, si, false, false);
        }
        let units = if view.search {
            units_for_stage(n, name, first)
        } else {
            None
        };
        if let Some(us) = &units {
            for u in us {
                if !p.guard.iter().any(|g| g.pieces == u.pieces) {
                    p.guard.push(u.clone());
                }
            }
        }
        if kind.is_none() && units.is_none() {
            p.play(st_start, st_end, si, false);
        } else {
            let slot = match kind {
                None => None,
                Some(SlotKind::Corner) if up.contains(&name) => Some(SlotKind::TopCorner),
                k => k,
            };
            let check_slot = slot.unwrap_or(SlotKind::TopEdge);
            if let Some(us) = &units {
                let solved: Vec<Unit> = us
                    .iter()
                    .filter(|u| unit_solved(&p.state, u))
                    .cloned()
                    .collect();
                p.check_units(solved, check_slot, si);
            }
            let cuts = cuts_of(looks, st_start, st_end);
            let per_unit = name != "cross" || cuts.len() > 2;
            for c in 0..cuts.len() - 1 {
                let (cut_from, cut_to) = (cuts[c], cuts[c + 1]);
                let mut parts: Vec<(usize, usize, Vec<Unit>)> = vec![];
                let mut incidental: Vec<Unit> = vec![];
                let mut prev = cut_from;
                if let Some(us) = &units {
                    let groups = split_by_units(&p.raw_states, cut_from, cut_to, us, &p.guard);
                    if per_unit {
                        let main = groups.iter().position(|g| g.0 == cut_to);
                        for (gi, g) in groups.iter().enumerate() {
                            if Some(gi) != main {
                                incidental.extend(g.1.iter().cloned());
                            }
                        }
                        parts.push((
                            cut_from,
                            cut_to,
                            main.map(|m| groups[m].1.clone()).unwrap_or_default(),
                        ));
                        prev = cut_to;
                    } else {
                        for g in groups {
                            parts.push((prev, g.0, g.1));
                            prev = g.0;
                        }
                    }
                }
                if prev < cut_to {
                    parts.push((prev, cut_to, vec![]));
                }
                for (from, to, part_units) in parts {
                    if !part_units.is_empty() {
                        p.find_units(&part_units, from, st_start, si);
                    }
                    if let Some(sl) = slot {
                        let after = p.peek(from, to, false);
                        let k = slot_turn(n, &p.state, &after, sl);
                        let look = p.look_set.contains(&from) && from != st_start;
                        if k != 0 {
                            p.turn(&[Y_TURNS[k].to_string()], si, look, false);
                            if look {
                                p.look_set.remove(&from);
                            }
                        }
                    }
                    p.play(from, to, si, false);
                    if !part_units.is_empty() {
                        let stickers: Vec<usize> =
                            part_units.iter().flat_map(unit_stickers).collect();
                        p.pending.push(mark(MarkKind::Placed, stickers, false));
                        for u in part_units {
                            p.known.insert(u.pieces);
                        }
                    }
                }
                if !incidental.is_empty() {
                    let solved: Vec<Unit> = incidental
                        .into_iter()
                        .filter(|u| unit_solved(&p.state, u))
                        .collect();
                    p.check_units(solved, check_slot, si);
                }
            }
        }
        if Some(si) == last_up {
            p.turn(&["z2".to_string()], si, false, false);
        }
        if Some(si) == last_shaped && p.g != I {
            let back = tokens_for(&transpose(&p.g));
            p.turn(&back, si, false, false);
        }
    }
    let names: Vec<&str> = stages.iter().map(|s| s.0.as_str()).collect();
    finish(n, p.out, &names, p.pending, &view.bring)
}

fn is_rotation_name(m: &str) -> bool {
    m.starts_with(['x', 'y', 'z'])
}

fn bring_gaps(
    moves: &[String],
    stages: &[(String, usize, usize)],
    bring: &[&str],
    cuts: &HashSet<usize>,
) -> Vec<usize> {
    let mut out = vec![];
    for (name, start, end) in stages {
        if !bring.contains(&name.as_str()) {
            continue;
        }
        for i in start + 1..*end {
            let prev = &moves[i - 1];
            let cur = &moves[i];
            if !prev.starts_with('D') || cur.starts_with('D') || is_rotation_name(cur) {
                continue;
            }
            let lead =
                i - 1 == *start || cuts.contains(&(i - 1)) || is_rotation_name(&moves[i - 2]);
            if lead && !cuts.contains(&i) {
                out.push(i);
            }
        }
    }
    out
}

fn finish(
    n: usize,
    out: Vec<Out>,
    names: &[&str],
    tail: Vec<PieceMark>,
    bring: &[&str],
) -> Presented {
    let mut merged: Vec<Out> = vec![];
    let mut carry = false;
    let mut carry_events: Vec<PieceMark> = vec![];
    for item in out {
        let m = item.m;
        let barrier = item.look
            || item.search
            || !item.events.is_empty()
            || merged.last().is_some_and(|l| l.search);
        if let Some(last) = merged.last().cloned() {
            if last.stage == item.stage && !barrier {
                if last.m.axis == m.axis && last.m.from == m.from && last.m.to == m.to {
                    let turns = (last.m.turns + m.turns) % 4;
                    merged.pop();
                    if turns != 0 {
                        merged.push(Out {
                            m: CubeMove { turns, ..m },
                            ..last
                        });
                    } else {
                        carry = carry || last.look;
                        carry_events.extend(last.events);
                    }
                    continue;
                }
                if is_whole(n, &last.m) && is_whole(n, &m) {
                    let mat = mul(
                        &rotation_mat(m.axis, m.turns),
                        &rotation_mat(last.m.axis, last.m.turns),
                    );
                    let tokens = tokens_for(&mat);
                    if tokens.len() < 2 {
                        merged.pop();
                        for t in &tokens {
                            let r = parse_moves(n, t).expect("돌리기")[0];
                            merged.push(Out {
                                m: r,
                                look: last.look,
                                stage: item.stage,
                                search: false,
                                events: last.events.clone(),
                            });
                        }
                        if tokens.is_empty() {
                            carry = carry || last.look;
                            carry_events.extend(last.events);
                        }
                        continue;
                    }
                }
            }
        }
        let mut events = std::mem::take(&mut carry_events);
        events.extend(item.events.iter().cloned());
        merged.push(Out {
            look: item.look || carry,
            events,
            ..item
        });
        carry = false;
    }
    let mut moves: Vec<String> = vec![];
    let mut looks = vec![];
    let mut searches = vec![];
    let mut marks: Vec<(usize, PieceMark)> = vec![];
    let mut result = vec![];
    for (si, name) in names.iter().enumerate() {
        let start_at = moves.len();
        for item in merged.iter().filter(|x| x.stage == si) {
            if item.look && moves.len() > start_at {
                looks.push(moves.len());
            }
            for e in &item.events {
                marks.push((moves.len(), e.clone()));
            }
            if item.search {
                searches.push(moves.len());
            }
            moves.push(format_move(n, &item.m));
        }
        result.push((name.to_string(), start_at, moves.len()));
    }
    for e in carry_events.into_iter().chain(tail) {
        marks.push((moves.len(), e));
    }
    let cuts: HashSet<usize> = looks
        .iter()
        .copied()
        .chain(marks.iter().map(|m| m.0))
        .collect();
    let gaps = bring_gaps(&moves, &result, bring, &cuts);
    Presented {
        moves,
        stages: result,
        looks,
        searches,
        marks,
        gaps,
    }
}

// ── 연출 차례(사이트 `hero/loop.ts`) ─────────────────────────

/// 시간(ms, 사이트 `heroTiming`). 크기마다 다르다(큰 큐브는 풀이가 길어 수를 빠르게 둔다)
#[derive(Clone, Copy, Debug)]
pub struct HeroTiming {
    pub scramble_move: f64,
    pub after_scramble: f64,
    pub solve_move: f64,
    pub stage: f64,
    pub look: f64,
    pub search_move: f64,
    pub mark: f64,
    pub order: f64,
    pub solved: f64,
    pub scramble_length: usize,
}

/// 크기 `n`(2~7)의 시간(사이트 `heroTiming(n)`. 워커 기다림 상한 `workerWait`·`solveWait`는 앱이 쓰지 않는다)
pub fn hero_timing(n: usize) -> HeroTiming {
    let base = HeroTiming {
        scramble_move: 110.0,
        after_scramble: 3000.0,
        solve_move: 240.0,
        stage: 450.0,
        look: 220.0,
        search_move: 160.0,
        mark: 500.0,
        order: 250.0,
        solved: 1800.0,
        scramble_length: 20,
    };
    match n {
        2 => HeroTiming {
            scramble_move: 120.0,
            solve_move: 280.0,
            search_move: 180.0,
            scramble_length: 11,
            ..base
        },
        3 => base,
        _ => HeroTiming {
            stage: 350.0,
            look: 120.0,
            order: 150.0,
            scramble_move: 80.0,
            solve_move: if n == 4 { 120.0 } else { 100.0 },
            search_move: 80.0,
            scramble_length: match n {
                4 => 30,
                5 => 36,
                6 => 40,
                _ => 44,
            },
            ..base
        },
    }
}

pub fn hero_timing3() -> HeroTiming {
    hero_timing(3)
}

pub const SCRAMBLING_LABEL: &str = "섞는 중";
pub const SOLVED_LABEL: &str = "맞춤";
pub const ORIENT_LABEL: &str = "방향 맞추기";
pub const ROTATION_SLOWER: f64 = 1.5;
pub const HERO_ANIM_SHARE: f64 = 0.75;

/// 연출 걸음 하나. `mv`가 None이면 멈춤(`marks`는 그 멈춤에 빛낼 사건 수)
#[derive(Clone, Debug, PartialEq)]
pub struct HeroStep {
    pub mv: Option<String>,
    pub ms: f64,
    pub label: String,
    pub marks: usize,
}

fn mv(m: &str, ms: f64, label: &str) -> HeroStep {
    HeroStep {
        mv: Some(m.to_string()),
        ms,
        label: label.to_string(),
        marks: 0,
    }
}

fn wait(ms: f64, label: &str, marks: usize) -> HeroStep {
    HeroStep {
        mv: None,
        ms,
        label: label.to_string(),
        marks,
    }
}

/// JS `Math.round`(0.5는 올림)
fn round(x: f64) -> f64 {
    (x + 0.5).floor()
}

const FACES: [&str; 6] = ["U", "D", "R", "L", "F", "B"];
const SLICES: [&str; 3] = ["M", "E", "S"];
const ROTATIONS: [&str; 3] = ["x", "y", "z"];
const SUFFIXES: [&str; 3] = ["", "'", "2"];

fn pick<'a, T: AsRef<str>>(rng: &mut dyn FnMut() -> f64, list: &'a [T]) -> &'a str {
    list[(rng() * list.len() as f64).floor() as usize].as_ref()
}

fn random_base(rng: &mut dyn FnMut() -> f64, n: usize) -> String {
    let r = rng();
    if r < 0.1 {
        return pick(rng, &ROTATIONS).to_string();
    }
    if n >= 3 && r < 0.25 {
        let mut inner: Vec<String> = vec![];
        if n % 2 == 1 {
            inner.extend(SLICES.iter().map(|s| s.to_string()));
        }
        for layer in 2..=n / 2 {
            if !(n % 2 == 1 && layer == n.div_ceil(2)) {
                for f in FACES {
                    inner.push(format!("{layer}{f}"));
                }
            }
        }
        if !inner.is_empty() {
            return pick(rng, &inner).to_string();
        }
    }
    let face = pick(rng, &FACES).to_string();
    if n >= 4 && rng() < 0.4 {
        format!("{face}w")
    } else {
        face
    }
}

/// 무작위 섞기(사이트 `randomScramble`): 면 돌리기에 큐브 돌리기·가운데 층이 섞인다. `rng`는 [0, 1) 수
pub fn random_scramble(rng: &mut dyn FnMut() -> f64, length: usize, n: usize) -> Vec<String> {
    let whole = |m: &CubeMove| m.from == 1 && m.to == n;
    let overlaps =
        |a: &CubeMove, b: &CubeMove| a.axis == b.axis && a.from <= b.to && b.from <= a.to;
    let mut out: Vec<String> = vec![];
    for _ in 0..50 {
        out.clear();
        let mut parsed: Vec<CubeMove> = vec![];
        while out.len() < length {
            let base = random_base(rng, n);
            let m = parse_moves(n, &base).expect("섞기 수")[0];
            let prev = parsed.last().copied();
            let prev2 = if parsed.len() >= 2 {
                Some(parsed[parsed.len() - 2])
            } else {
                None
            };
            if prev.is_some_and(|p| overlaps(&p, &m)) {
                continue;
            }
            if let (Some(p), Some(p2)) = (prev, prev2) {
                if p.axis == m.axis && p2.axis == m.axis {
                    continue;
                }
            }
            if prev.is_some_and(|p| whole(&p) && whole(&m)) {
                continue;
            }
            parsed.push(m);
            out.push(format!("{base}{}", pick(rng, &SUFFIXES)));
        }
        let has_rotation = parsed.iter().any(whole);
        let has_slice = parsed.iter().any(|m| m.from > 1 && m.to < n);
        if has_rotation && (has_slice || n < 3) {
            break;
        }
    }
    out
}

/// 풀기 전에 흰 센터 위·초록 앞으로 쥐는 가장 짧은 큐브 돌리기(사이트 `orientForSolve`). 짝수 크기는 빈 목록
pub fn orient_for_solve(n: usize, state: &State) -> Vec<String> {
    if n % 2 == 0 {
        return vec![];
    }
    let nn = n * n;
    let c = (n - 1) / 2;
    let home = |s: &State| {
        let colors = face_colors(n, s);
        (0..6).all(|f| colors[f * nn + c * n + c] as usize == f)
    };
    let single: Vec<String> = ROTATIONS
        .iter()
        .flat_map(|a| [a.to_string(), format!("{a}'"), format!("{a}2")])
        .collect();
    let mut lists: Vec<Vec<String>> = vec![vec![]];
    lists.extend(single.iter().map(|t| vec![t.clone()]));
    for a in &single {
        for b in &single {
            if a.as_bytes()[0] != b.as_bytes()[0] {
                lists.push(vec![a.clone(), b.clone()]);
            }
        }
    }
    for list in lists {
        let s = if list.is_empty() {
            state.clone()
        } else {
            apply_alg(n, state, &list.join(" ")).expect("돌리기")
        };
        if home(&s) {
            return list;
        }
    }
    unreachable!("쥐는 방향")
}

fn is_rotation_token(m: &str) -> bool {
    is_rotation_name(m)
}

pub fn scramble_steps(scramble: &[String], method_label: &str, t: &HeroTiming) -> Vec<HeroStep> {
    let mut steps: Vec<HeroStep> = scramble
        .iter()
        .map(|m| {
            let ms = if is_rotation_token(m) {
                round(t.scramble_move * ROTATION_SLOWER)
            } else {
                t.scramble_move
            };
            mv(m, ms, SCRAMBLING_LABEL)
        })
        .collect();
    steps.push(wait(t.after_scramble, method_label, 0));
    steps
}

pub fn orient_steps(tokens: &[String], method_label: &str, t: &HeroTiming) -> Vec<HeroStep> {
    if tokens.is_empty() {
        return vec![];
    }
    let label = format!("{method_label} · {ORIENT_LABEL}");
    let mut steps: Vec<HeroStep> = tokens
        .iter()
        .map(|m| mv(m, round(t.solve_move * ROTATION_SLOWER), &label))
        .collect();
    steps.push(wait(t.stage, &label, 0));
    steps
}

/// 꼬리표를 붙인 풀이(사이트 `HeroSolve`)
#[derive(Clone, Debug)]
pub struct HeroSolve {
    pub first: usize,
    pub presented: Presented,
    pub labels: Vec<String>,
}

/// 맞추기 차례(사이트 `solveSteps`, 강조 「잠깐」)
pub fn solve_steps(solve: &HeroSolve, method_label: &str, t: &HeroTiming) -> Vec<HeroStep> {
    let p = &solve.presented;
    let looks: HashSet<usize> = p.looks.iter().copied().collect();
    let searches: HashSet<usize> = p.searches.iter().copied().collect();
    let gaps: HashSet<usize> = p.gaps.iter().copied().collect();
    let marks_at = |i: usize| -> Vec<&PieceMark> {
        p.marks.iter().filter(|m| m.0 == i).map(|m| &m.1).collect()
    };
    let groups_at = |i: usize| -> Vec<Vec<&PieceMark>> {
        let mut out: Vec<Vec<&PieceMark>> = vec![];
        for m in marks_at(i) {
            let join = out.last().and_then(|g| g.last()).is_some_and(|prev| {
                !m.solo
                    && !prev.solo
                    && (m.kind == MarkKind::Placed) == (prev.kind == MarkKind::Placed)
            });
            if join {
                out.last_mut().expect("묶음").push(m);
            } else {
                out.push(vec![m]);
            }
        }
        out
    };
    let is_placed = |g: &[&PieceMark]| g.first().is_some_and(|m| m.kind == MarkKind::Placed);
    let mut steps: Vec<HeroStep> = vec![];
    let pauses = |steps: &mut Vec<HeroStep>, i: usize, label: &str, stage_start: bool| {
        let groups = groups_at(i);
        let mut k = 0;
        if stage_start {
            let g = if groups.first().is_some_and(|g| is_placed(g)) {
                k += 1;
                Some(&groups[0])
            } else {
                None
            };
            let ms = if g.is_some() {
                t.stage.max(t.mark)
            } else {
                t.stage
            };
            steps.push(wait(ms, label, g.map_or(0, |g| g.len())));
        }
        let mut look = !stage_start && looks.contains(&i);
        while k < groups.len() {
            let g = &groups[k];
            let ms = if !is_placed(g) && look {
                t.look.max(t.mark)
            } else {
                t.mark
            };
            if !is_placed(g) {
                look = false;
            }
            steps.push(wait(ms, label, g.len()));
            k += 1;
        }
        if look {
            steps.push(wait(t.look, label, 0));
        }
    };
    let mut first = true;
    for (si, (_, start, end)) in p.stages.iter().enumerate() {
        if end <= start {
            continue;
        }
        let label = format!("{method_label} · {}", solve.labels[si]);
        pauses(&mut steps, *start, &label, !first);
        first = false;
        for i in *start..*end {
            let m = &p.moves[i];
            if i != *start {
                let before = steps.len();
                pauses(&mut steps, i, &label, false);
                let prev = &p.moves[i - 1];
                if steps.len() == before
                    && (is_rotation_token(prev) != is_rotation_token(m) || gaps.contains(&i))
                {
                    steps.push(wait(t.order, &label, 0));
                }
            }
            let ms = if searches.contains(&i) {
                t.search_move
            } else if is_rotation_token(m) {
                round(t.solve_move * ROTATION_SLOWER)
            } else {
                t.solve_move
            };
            steps.push(mv(m, ms, &label));
        }
    }
    let end = marks_at(p.moves.len())
        .into_iter()
        .filter(|m| m.kind == MarkKind::Placed)
        .count();
    steps.push(wait(
        t.solved,
        &format!("{method_label} · {SOLVED_LABEL}"),
        end,
    ));
    steps
}

/// 3D 장면이 돌릴 시간(사이트 `heroMoveMs`): 반 바퀴는 1.4배 길게 도니 그만큼 줄여 걸음 시간의 3/4 안에 끝나게
pub fn hero_move_ms(step_ms: f64, parsed: &[CubeMove]) -> f64 {
    let longest = parsed
        .iter()
        .map(|m| if m.turns == 2 { 1.4 } else { 1.0 })
        .fold(1.0f64, f64::max);
    (step_ms * HERO_ANIM_SHARE / longest).floor().min(200.0)
}

// ── 해법 표(사이트 `hero/methods.ts` `HERO_METHODS`) ─────────────

/// 시연 해법(사이트 `HERO_METHODS`의 id)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HeroMethod {
    /// `2-beginner` 초보자 해법(배우는 방식, 첫 면 늘 흰색)
    Beginner2,
    /// `2-algs` 공식 해법(첫 면은 첫 층이 가장 싼 색)
    Algs2,
    /// `3-beginner` 초보자 해법(배우는 방식, 첫 면 늘 흰색)
    Beginner3,
    /// `3-cfop` 프리드리히(첫 면은 십자가 가장 싼 색)
    Cfop3,
    /// `3-roux` 루(첫 면은 첫 블록이 가장 싼 색)
    Roux3,
    /// `3-zz` ZZ(첫 면은 EO라인이 가장 싼 색)
    Zz3,
    /// `n-beginner` 축소법(초보자): 축소 뒤 배우는 방식 3×3 초보자(첫 면 흰색), 4~7
    BigBeginner(u8),
    /// `n-cfop` 축소법(프리드리히): 축소 뒤 3×3 프리드리히(첫 면은 십자가 가장 싼 색), 4~7
    BigCfop(u8),
    /// `4-yau` 야우(배우기 단원의 경우별 길, 첫 면은 십자 셋이 가장 싼 색)
    Yau4,
}

/// 첫 면 색 고르기(사이트 `HeroMethodDef.first`)
enum FirstRule {
    White,
    Cheapest(StageName),
}

impl HeroMethod {
    /// 표 차례(사이트 `HERO_METHODS`): 크기마다 「번갈아」 차례도 이 차례다
    pub fn all() -> Vec<HeroMethod> {
        let mut out = vec![
            HeroMethod::Beginner2,
            HeroMethod::Algs2,
            HeroMethod::Beginner3,
            HeroMethod::Cfop3,
            HeroMethod::Roux3,
            HeroMethod::Zz3,
        ];
        for n in 4..=7 {
            out.push(HeroMethod::BigBeginner(n));
            out.push(HeroMethod::BigCfop(n));
            if n == 4 {
                out.push(HeroMethod::Yau4);
            }
        }
        out
    }

    pub fn from_id(id: &str) -> Option<Self> {
        HeroMethod::all().into_iter().find(|m| m.id() == id)
    }

    pub fn id(self) -> String {
        match self {
            HeroMethod::Beginner2 => "2-beginner".into(),
            HeroMethod::Algs2 => "2-algs".into(),
            HeroMethod::Beginner3 => "3-beginner".into(),
            HeroMethod::Cfop3 => "3-cfop".into(),
            HeroMethod::Roux3 => "3-roux".into(),
            HeroMethod::Zz3 => "3-zz".into(),
            HeroMethod::BigBeginner(n) => format!("{n}-beginner"),
            HeroMethod::BigCfop(n) => format!("{n}-cfop"),
            HeroMethod::Yau4 => "4-yau".into(),
        }
    }

    pub fn size(self) -> usize {
        match self {
            HeroMethod::Beginner2 | HeroMethod::Algs2 => 2,
            HeroMethod::Beginner3 | HeroMethod::Cfop3 | HeroMethod::Roux3 | HeroMethod::Zz3 => 3,
            HeroMethod::BigBeginner(n) | HeroMethod::BigCfop(n) => n as usize,
            HeroMethod::Yau4 => 4,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            HeroMethod::Beginner2 | HeroMethod::Beginner3 => "초보자 해법",
            HeroMethod::Algs2 => "공식 해법",
            HeroMethod::Cfop3 => "프리드리히",
            HeroMethod::Roux3 => "루",
            HeroMethod::Zz3 => "ZZ",
            HeroMethod::BigBeginner(_) => "축소법(초보자)",
            HeroMethod::BigCfop(_) => "축소법(프리드리히)",
            HeroMethod::Yau4 => "야우",
        }
    }

    pub fn view(self) -> HeroView {
        match self {
            HeroMethod::Beginner2 => HeroView {
                up: vec!["first-layer"],
                ..HeroView::default()
            },
            HeroMethod::Algs2 => HeroView::default(),
            HeroMethod::Beginner3 => HeroView {
                up: vec!["cross", "corners"],
                search: true,
                keep_y: vec!["cross"],
                bring: vec!["cross", "corners"],
                ..HeroView::default()
            },
            HeroMethod::Cfop3 => HeroView {
                up: vec!["cross"],
                search: true,
                ..HeroView::default()
            },
            // 첫 블록·왼쪽 블록은 왼쪽 아래라 카메라에서 가려진다: y2로 돌려 오른쪽에 보이고 되돌린다
            HeroMethod::Roux3 => HeroView {
                mirror: vec!["fb"],
                ..HeroView::default()
            },
            HeroMethod::Zz3 => HeroView {
                mirror: vec!["zz-left"],
                ..HeroView::default()
            },
            HeroMethod::BigBeginner(_) | HeroMethod::Yau4 => HeroView {
                up: vec!["cross", "corners"],
                ..HeroView::default()
            },
            HeroMethod::BigCfop(_) => HeroView {
                up: vec!["cross"],
                ..HeroView::default()
            },
        }
    }

    fn first_rule(self) -> FirstRule {
        match self {
            HeroMethod::Beginner2 | HeroMethod::Beginner3 | HeroMethod::BigBeginner(_) => {
                FirstRule::White
            }
            HeroMethod::Algs2 => FirstRule::Cheapest(StageName::FirstLayer),
            HeroMethod::Cfop3 | HeroMethod::BigCfop(_) => FirstRule::Cheapest(StageName::Cross),
            HeroMethod::Roux3 => FirstRule::Cheapest(StageName::Fb),
            HeroMethod::Zz3 => FirstRule::Cheapest(StageName::Eoline),
            HeroMethod::Yau4 => FirstRule::Cheapest(StageName::YauCross3),
        }
    }

    /// 첫 면 색 `first`로 푼다(사이트 `def.solve(state, first)`)
    fn solve_first(self, state: &State, first: usize) -> Result<HumanSolve, SolveError> {
        match self {
            HeroMethod::Beginner2 => solve_beginner2_taught(state),
            HeroMethod::Algs2 => solve_intermediate2(state, first),
            HeroMethod::Beginner3 => solve_beginner3_taught(state),
            HeroMethod::Cfop3 => solve_cfop_first(state, first),
            HeroMethod::Roux3 => solve_roux(state, first),
            HeroMethod::Zz3 => solve_zz(state, first),
            HeroMethod::BigBeginner(n) => crate::big::solve_big_beginner(n as usize, state),
            HeroMethod::BigCfop(n) => crate::big::solve_big_cfop(n as usize, state, first),
            HeroMethod::Yau4 => crate::yau::solve_yau_human(state, first),
        }
    }

    /// 첫 면 색을 골라 푼다(사이트 `solveWithFirst`)
    fn solve(self, state: &State) -> Result<(HumanSolve, usize), SolveError> {
        match self.first_rule() {
            FirstRule::White => Ok((self.solve_first(state, 0)?, 0)),
            FirstRule::Cheapest(stage) => {
                solve_with_cheapest_first(state, stage, |s, f| self.solve_first(s, f))
            }
        }
    }
}

const COLOR_WORDS: [&str; 6] = ["흰", "빨간", "초록", "노란", "주황", "파란"];
/// 이름 꼴(「흰·노랑 센터」)
const COLOR_NOUNS: [&str; 6] = ["흰", "빨강", "초록", "노랑", "주황", "파랑"];

/// 꼬리표 글(사이트 `heroStageLabel`)
pub fn hero_stage_label(name: &str, first: usize, label: &str) -> String {
    let color = COLOR_WORDS[first % 6];
    let opposite = COLOR_WORDS[(first + 3) % 6];
    match name {
        "cross" => format!("{color} 십자"),
        "eo" => format!("{opposite} 십자"),
        "co" => format!("{opposite} 면"),
        // 야우는 첫 면 색과 그 맞은편 센터부터, 그 색 십자 셋
        "yau-centers" => format!(
            "{}·{} 센터",
            COLOR_NOUNS[first % 6],
            COLOR_NOUNS[(first + 3) % 6]
        ),
        "yau-cross3" => format!("{color} 십자 셋"),
        _ => label.to_string(),
    }
}

/// 첫 면 색을 골라 풀고 보여 주기 변환·꼬리표까지(사이트 `solveForHero`)
pub fn solve_for_hero(method: HeroMethod, state: &State) -> Result<HeroSolve, SolveError> {
    let (raw, first) = method.solve(state)?;
    let stages: Vec<(String, usize, usize)> = raw
        .stages
        .iter()
        .map(|s| (s.name.id().to_string(), s.start, s.end))
        .collect();
    let presented = present_solve(
        method.size(),
        state,
        &raw.moves,
        &stages,
        &raw.looks,
        &method.view(),
        first,
    );
    let labels = raw
        .stages
        .iter()
        .map(|s| hero_stage_label(s.name.id(), first, s.name.label()))
        .collect();
    Ok(HeroSolve {
        first,
        presented,
        labels,
    })
}

/// 한 판(사이트 `HeroLoop`의 한 바퀴): 섞기, 쥐는 방향, 풀이, 모든 걸음
#[derive(Clone, Debug)]
pub struct HeroShow {
    pub scramble: Vec<String>,
    pub orient: Vec<String>,
    pub solve: HeroSolve,
    pub steps: Vec<HeroStep>,
}

/// 한 판의 섞기와 쥐는 방향(풀이 전, 사이트 `beginCycle`): 섞기 글, 쥐는 돌리기, 풀 상태
pub fn hero_scramble(n: usize, rng: &mut dyn FnMut() -> f64) -> (Vec<String>, Vec<String>, State) {
    let t = hero_timing(n);
    let scramble = random_scramble(rng, t.scramble_length, n);
    let mut state = solved_cube(n);
    for m in &scramble {
        state = apply_alg(n, &state, m).expect("섞기 수");
    }
    let orient = orient_for_solve(n, &state);
    if !orient.is_empty() {
        state = apply_alg(n, &state, &orient.join(" ")).expect("쥐는 방향");
    }
    (scramble, orient, state)
}

/// 맞춘 큐브에서 한 판을 짠다. 못 풀면(생기지 않는다) 다른 섞기로 몇 번 더 해 본다(사이트도 그 판을 건너뛰고 다시 섞는다)
pub fn hero_show(method: HeroMethod, rng: &mut dyn FnMut() -> f64) -> Result<HeroShow, SolveError> {
    let n = method.size();
    let t = hero_timing(n);
    let mut last = SolveError("풀지 못했다");
    for _ in 0..5 {
        let (scramble, orient, state) = hero_scramble(n, rng);
        match solve_for_hero(method, &state) {
            Ok(solve) => {
                let mut steps = scramble_steps(&scramble, method.label(), &t);
                steps.extend(orient_steps(&orient, method.label(), &t));
                steps.extend(solve_steps(&solve, method.label(), &t));
                return Ok(HeroShow {
                    scramble,
                    orient,
                    solve,
                    steps,
                });
            }
            Err(e) => last = e,
        }
    }
    Err(last)
}

/// 앱이 돌릴 시각표 한 줄: 시각(판 시작에서 ms), 수, 3D 회전 시간(`hero_move_ms`)
#[derive(Clone, Debug, PartialEq)]
pub struct HeroCue {
    pub at: f64,
    pub mv: String,
    pub move_ms: f64,
}

/// 걸음 → 시각표와 「맞춤」 멈춤이 시작하는 시각. 미니 화면은 그 멈춤에 들어서면 1.5초 보이고 끝낸다
/// (사이트 `MiniCubeApp` hero: 꼬리표가 「… · 맞춤」이 되면 1500ms 뒤 멈춤)
pub fn hero_timeline(n: usize, steps: &[HeroStep]) -> (Vec<HeroCue>, f64) {
    let mut at = 0.0;
    let mut cues = vec![];
    for s in steps {
        if s.mv.is_none() && s.label.ends_with(SOLVED_LABEL) {
            return (cues, at);
        }
        if let Some(m) = &s.mv {
            let parsed = parse_moves(n, m).expect("연출 수");
            cues.push(HeroCue {
                at,
                mv: m.clone(),
                move_ms: hero_move_ms(s.ms, &parsed),
            });
        }
        at += s.ms;
    }
    (cues, at)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::Rng;

    #[test]
    fn timeline_ends_solved_and_moves_match_steps() {
        for method in HeroMethod::all().into_iter().filter(|m| m.size() <= 3) {
            let n = method.size();
            let mut rng = Rng::new(7);
            let show = hero_show(method, &mut || rng.next_float()).expect("한 판");
            let (cues, end) = hero_timeline(method.size(), &show.steps);
            let moves = show.steps.iter().filter(|s| s.mv.is_some()).count();
            assert_eq!(cues.len(), moves);
            assert!(cues.windows(2).all(|w| w[0].at < w[1].at));
            assert!(end > cues.last().expect("수").at);
            // 맞춘 큐브에서 모든 수를 두면 다시 맞춘 큐브(초보자는 흰 면이 아래인 채로 끝난다, 사이트와 같다)
            let all: Vec<&str> = cues.iter().map(|c| c.mv.as_str()).collect();
            let s = apply_alg(n, &solved_cube(n), &all.join(" ")).expect("표기");
            assert!(crate::state::is_solved(n, &s), "{}", method.id());
        }
        // 반 바퀴는 회전을 줄여 걸음 시간의 3/4 안에, 상한 200ms
        assert_eq!(
            hero_move_ms(240.0, &parse_moves(3, "R2").expect("R2")),
            128.0
        );
        assert_eq!(hero_move_ms(360.0, &parse_moves(3, "y").expect("y")), 200.0);
    }
}
