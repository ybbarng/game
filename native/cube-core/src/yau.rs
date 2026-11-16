//! 4×4 야우(홈 시연 「야우」, 사이트 `apps/web/src/cube/learn/yau-solve.ts` `solveYau`와 `yau-hero.ts` `solveYauHuman`).
//!
//! 배우기 단원의 경우별 정해진 길을 야우 차례로 잇는다: 흰·노랑 센터(축소법 센터 규칙을 두 색만) → 흰 십자 셋 → 옆 센터
//! 넷 → 마지막 십자 엣지 → 엣지 여덟(축소법 처음 엣지 규칙) → 3×3처럼(3×3 처음 맞추기 차례, 패리티 포함). 탐색하지
//! 않고 모양만 보고 경우를 골라 결정적이다.
//!
//! 옮긴 원본(웹 `apps/web/src/cube/learn/`):
//! - `beginner-path.ts`: 3×3 처음 맞추기 단계마다 다음 한 걸음(흰 십자 ~ 코너 방향)
//! - `big-path.ts`: 4×4 센터(`runCenters`, 흰·노랑 두 색만), 처음 엣지 여덟(`nextFirstEdge`)·마지막 넷(`nextLastEdge`)
//! - `big-solve.ts`: 바깥 층만 본 3×3(`project`)과 「3×3처럼」·패리티(`solveReduced`, 4×4)
//! - `yau-path.ts`: 옆 센터 넷, 흰 십자 셋, 마지막 십자 엣지
//! - `yau-solve.ts`·`yau-hero.ts`: 단계 잇기, 첫 면 색(스티커 색 바꾸기), 시연이 읽는 사람 해법 꼴
//!
//! 사이트와 같은지는 공통 시험 자료 `fixtures/hero-show-yau.json`으로 본다(docs/52 5-10).

use std::collections::HashSet;

use crate::human::{first_face_map, HumanSolve, SolveError, SolveStage, StageName};
use crate::state::{apply_alg, face_colors, solved_cube, State};
use crate::topology::{cube_topology, PieceKind};

type R<T> = Result<T, SolveError>;

const U: usize = 0;
const RR: usize = 1;
const F: usize = 2;
const D: usize = 3;
const L: usize = 4;
const B: usize = 5;

const WHITE: u8 = 0;
const RED: u8 = 1;
const GREEN: u8 = 2;
const YELLOW: u8 = 3;
const ORANGE: u8 = 4;
const BLUE: u8 = 5;

/// 수를 둔다(빈 글이면 그대로)
fn play(n: usize, s: &State, alg: &str) -> State {
    if alg.trim().is_empty() {
        return s.clone();
    }
    apply_alg(n, s, alg).expect("야우 수 표기")
}

/// 빈 글을 빼고 띄어 잇는다(사이트 `join`)
fn join(xs: &[&str]) -> String {
    xs.iter()
        .flat_map(|x| x.split_whitespace())
        .collect::<Vec<_>>()
        .join(" ")
}

fn tokens(text: &str) -> Vec<String> {
    text.split_whitespace().map(str::to_string).collect()
}

/// 거꾸로 한 수
fn inv(m: &str) -> String {
    if m.ends_with('2') {
        m.to_string()
    } else if let Some(x) = m.strip_suffix('\'') {
        x.to_string()
    } else {
        format!("{m}'")
    }
}

fn first_turn<'a>(
    n: usize,
    s: &State,
    turns: &[&'a str],
    ok: impl Fn(&State) -> bool,
) -> R<&'a str> {
    turns
        .iter()
        .copied()
        .find(|x| ok(&play(n, s, x)))
        .ok_or(SolveError("돌릴 방향을 찾지 못했다"))
}

fn turns4(m: &str) -> [String; 4] {
    [
        String::new(),
        m.to_string(),
        format!("{m}'"),
        format!("{m}2"),
    ]
}

fn first_turn_owned(
    n: usize,
    s: &State,
    turns: &[String],
    ok: impl Fn(&State) -> bool,
) -> Option<String> {
    turns.iter().find(|x| ok(&play(n, s, x))).cloned()
}

/// 큐브 돌리기 24가지(사이트 `ROTATIONS`: x 쪽 여섯 × y 넷)
fn rotations(firsts: [&str; 6]) -> Vec<String> {
    let mut out = vec![];
    for a in firsts {
        for b in ["", "y", "y'", "y2"] {
            out.push(join(&[a, b]));
        }
    }
    out
}

fn rotation_list() -> Vec<String> {
    rotations(["", "x", "x'", "x2", "z", "z'"])
}

/// 맞춘 큐브에 이 큐브 돌리기를 한 것의 면 색(면마다 왼쪽 위 칸)
fn frame_colors(n: usize, turns: &str) -> [u8; 6] {
    let c = face_colors(n, &play(n, &solved_cube(n), turns));
    let nn = n * n;
    [c[0], c[nn], c[2 * nn], c[3 * nn], c[4 * nn], c[5 * nn]]
}

// ── 3×3 처음 맞추기(beginner-path.ts) ─────────────────

const TWIST: &str = "R' D' R D";
const TWIST_BACK: &str = "D' R' D R";
const RIGHT: &str = "U R U' R' U' F' U F";
const FROM_RIGHT: &str = "U' F' U F U R U' R'";
const YELLOW_CROSS: &str = "F R U R' U' F'";
const YELLOW_CROSS_BACK: &str = "F U R U' R' F'";
const EDGE_SWAP: &str = "R U R' U R U2 R' U";
const CORNER_CYCLE: &str = "U R U' L' U R' U' L";
const CORNER_CYCLE_BACK: &str = "L' U R U' L U R' U'";
const CROSS_SIDE_UP: &str = "F D' F' y F";

fn reps(alg: &str, k: usize) -> String {
    vec![alg; k].join(" ")
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum PathStage {
    Cross,
    Corners,
    Second,
    YellowCross,
    Edges,
    CornerPlace,
    CornerTwist,
}

/// 한 걸음: 쥐는 수와 칠 공식
#[derive(Clone, Debug)]
struct PathStep {
    case_id: &'static str,
    hold: String,
    alg: String,
}

impl PathStep {
    fn moves(&self) -> String {
        join(&[&self.hold, &self.alg])
    }
}

fn step(case_id: &'static str, hold: &str, alg: String) -> PathStep {
    PathStep {
        case_id,
        hold: hold.to_string(),
        alg,
    }
}

const EDGE_SLOTS: [[usize; 2]; 12] = [
    [5, 10],
    [7, 19],
    [3, 37],
    [1, 46],
    [32, 16],
    [28, 25],
    [30, 43],
    [34, 52],
    [23, 12],
    [21, 41],
    [50, 39],
    [48, 14],
];
const CORNER_SLOTS: [[usize; 3]; 8] = [
    [8, 9, 20],
    [6, 18, 38],
    [0, 36, 47],
    [2, 45, 11],
    [29, 26, 15],
    [27, 44, 24],
    [33, 53, 42],
    [35, 17, 51],
];

fn face_of_sticker(i: usize) -> usize {
    i / 9
}

struct View {
    col: Vec<u8>,
}

impl View {
    fn new(s: &State) -> View {
        View {
            col: face_colors(3, s),
        }
    }
    fn center_of(&self, c: u8) -> usize {
        (0..6).find(|&k| self.col[k * 9 + 4] == c).unwrap_or(6)
    }
    fn color_of(&self, f: usize) -> u8 {
        self.col[f * 9 + 4]
    }
}

/// 조각(색 묶음)이 든 자리: 색마다 그 스티커가 보는 면
fn find(v: &View, colors: &[u8]) -> Option<Vec<(u8, usize)>> {
    let mut want = colors.to_vec();
    want.sort_unstable();
    let slots: Vec<&[usize]> = if colors.len() == 2 {
        EDGE_SLOTS.iter().map(|s| &s[..]).collect()
    } else {
        CORNER_SLOTS.iter().map(|s| &s[..]).collect()
    };
    for slot in slots {
        let got: Vec<u8> = slot.iter().map(|&i| v.col[i]).collect();
        let mut sorted = got.clone();
        sorted.sort_unstable();
        if sorted != want {
            continue;
        }
        return Some(
            slot.iter()
                .zip(&got)
                .map(|(&i, &c)| (c, face_of_sticker(i)))
                .collect(),
        );
    }
    None
}

fn get(m: &[(u8, usize)], c: u8) -> usize {
    m.iter().find(|(x, _)| *x == c).map(|p| p.1).unwrap_or(6)
}

fn faces_of(m: &[(u8, usize)]) -> HashSet<usize> {
    m.iter().map(|p| p.1).collect()
}

fn same_set(a: &HashSet<usize>, b: &[usize]) -> bool {
    a.len() == b.len() && b.iter().all(|f| a.contains(f))
}

fn found(v: &View, colors: &[u8]) -> Vec<(u8, usize)> {
    find(v, colors).unwrap_or_default()
}

fn piece_ok(v: &View, colors: &[u8]) -> bool {
    find(v, colors).is_some_and(|m| m.iter().all(|&(c, f)| v.center_of(c) == f))
}

const Y4: [&str; 4] = ["", "y", "y'", "y2"];
const D4: [&str; 4] = ["", "D", "D'", "D2"];
const U4: [&str; 4] = ["", "U", "U'", "U2"];
const U_AROUND: [&str; 4] = ["", "U", "U2", "U'"];

const SIDE_COLORS: [u8; 4] = [GREEN, RED, BLUE, ORANGE];
const WHITE_CORNERS: [[u8; 3]; 4] = [
    [WHITE, GREEN, RED],
    [WHITE, RED, BLUE],
    [WHITE, BLUE, ORANGE],
    [WHITE, ORANGE, GREEN],
];
const MIDDLE_EDGES: [[u8; 2]; 4] = [[GREEN, RED], [RED, BLUE], [BLUE, ORANGE], [ORANGE, GREEN]];

fn cross_next(s: &State) -> R<Option<PathStep>> {
    let v = View::new(s);
    let Some(&c) = SIDE_COLORS.iter().find(|&&c| !piece_ok(&v, &[WHITE, c])) else {
        return Ok(None);
    };
    let e = found(&v, &[WHITE, c]);
    let wf = get(&e, WHITE);
    let cf = get(&e, c);
    let at =
        |t: &State, faces: &[usize]| same_set(&faces_of(&found(&View::new(t), &[WHITE, c])), faces);
    if wf == D || cf == D {
        let side = cf == D;
        let y = first_turn(3, s, &Y4, |t| {
            View::new(t).center_of(c) == if side { RR } else { F }
        })?;
        let d = first_turn(3, &play(3, s, y), &D4, |t| {
            at(t, &[D, if side { RR } else { F }])
        })?;
        return Ok(Some(if side {
            step("down-side", &join(&[y, d]), CROSS_SIDE_UP.into())
        } else {
            step("down", &join(&[y, d]), "F2".into())
        }));
    }
    if wf != U && cf != U {
        let y = first_turn(3, s, &Y4, |t| {
            get(&found(&View::new(t), &[WHITE, c]), c) == F
        })?;
        let t = play(3, s, y);
        let right = at(&t, &[F, RR]);
        if v.center_of(c) == cf {
            return Ok(Some(step(
                "middle",
                y,
                if right { "F'" } else { "F" }.into(),
            )));
        }
        return Ok(Some(step(
            "middle-other",
            y,
            if right { "F D F'" } else { "F' D' F" }.into(),
        )));
    }
    let y = first_turn(3, s, &Y4, |t| at(t, &[U, F]))?;
    Ok(Some(if wf == U {
        step("top-wrong", y, "F2".into())
    } else {
        step("top-side", y, "F".into())
    }))
}

fn corners_next(s: &State) -> R<Option<PathStep>> {
    let v = View::new(s);
    let todo: Vec<&[u8; 3]> = WHITE_CORNERS
        .iter()
        .filter(|cc| !piece_ok(&v, &cc[..]))
        .collect();
    if todo.is_empty() {
        return Ok(None);
    }
    let low: Vec<&[u8; 3]> = todo
        .iter()
        .copied()
        .filter(|cc| faces_of(&found(&v, &cc[..])).contains(&D))
        .collect();
    let cc = *if low.is_empty() { todo[0] } else { low[0] };
    let place = faces_of(&found(&v, &cc));
    let home_at_fr = |t: &State| {
        let tv = View::new(t);
        same_set(
            &[tv.center_of(cc[1]), tv.center_of(cc[2])]
                .into_iter()
                .collect(),
            &[F, RR],
        )
    };
    let white_face = |t: &State| get(&found(&View::new(t), &cc), WHITE);
    if place.contains(&D) {
        let y = first_turn(3, s, &Y4, home_at_fr)?;
        let d = first_turn(3, &play(3, s, y), &D4, |t| {
            same_set(&faces_of(&found(&View::new(t), &cc)), &[D, F, RR])
        })?;
        let hold = join(&[y, d]);
        let w = white_face(&play(3, s, &hold));
        return Ok(Some(match w {
            RR => step("bottom-right", &hold, TWIST.into()),
            F => step("bottom-front", &hold, TWIST_BACK.into()),
            _ => step("bottom-down", &hold, reps(TWIST, 3)),
        }));
    }
    let home = same_set(&place, &[U, v.center_of(cc[1]), v.center_of(cc[2])]);
    if home {
        let y = first_turn(3, s, &Y4, home_at_fr)?;
        let w = white_face(&play(3, s, y));
        return Ok(Some(if w == RR {
            step("slot-right", y, reps(TWIST, 2))
        } else {
            step("slot-front", y, reps(TWIST_BACK, 2))
        }));
    }
    let y = first_turn(3, s, &Y4, |t| {
        same_set(&faces_of(&found(&View::new(t), &cc)), &[U, F, RR])
    })?;
    Ok(Some(step("stuck", y, TWIST.into())))
}

fn second_next(s: &State) -> R<Option<PathStep>> {
    let v = View::new(s);
    let todo: Vec<&[u8; 2]> = MIDDLE_EDGES
        .iter()
        .filter(|p| !piece_ok(&v, &p[..]))
        .collect();
    if todo.is_empty() {
        return Ok(None);
    }
    if let Some(&&p) = todo
        .iter()
        .find(|p| faces_of(&found(&v, &p[..])).contains(&U))
    {
        let m = found(&v, &p);
        let side = *p.iter().find(|&&c| get(&m, c) != U).unwrap_or(&p[0]);
        let up = *p.iter().find(|&&c| get(&m, c) == U).unwrap_or(&p[0]);
        let u = first_turn(3, s, &U4, |t| {
            let tv = View::new(t);
            get(&found(&tv, &p), side) == tv.center_of(side)
        })?;
        let su = play(3, s, u);
        let y = first_turn(3, &su, &Y4, |t| View::new(t).center_of(side) == F)?;
        let hold = join(&[u, y]);
        let front = View::new(&play(3, s, &hold)).center_of(up) == RR;
        if front {
            return Ok(Some(step("front", &hold, RIGHT.into())));
        }
        let yr = first_turn(3, &su, &Y4, |t| View::new(t).center_of(side) == RR)?;
        return Ok(Some(step("left", &join(&[u, yr]), FROM_RIGHT.into())));
    }
    let p = *todo[0];
    let y = first_turn(3, s, &Y4, |t| {
        same_set(&faces_of(&found(&View::new(t), &p)), &[F, RR])
    })?;
    Ok(Some(step("stuck", y, RIGHT.into())))
}

/// 윗면 엣지 가운데 노란 칸이 위를 보는 쪽(뒤 · 왼쪽 · 오른쪽 · 앞 차례)
fn yellow_up(s: &State) -> Vec<usize> {
    let col = face_colors(3, s);
    [(B, 1), (L, 3), (RR, 5), (F, 7)]
        .into_iter()
        .filter(|&(_, i)| col[i] == YELLOW)
        .map(|(f, _)| f)
        .collect()
}

fn yellow_cross_next(s: &State) -> R<Option<PathStep>> {
    let up = yellow_up(s);
    if up.len() == 4 {
        return Ok(None);
    }
    if up.is_empty() {
        return Ok(Some(step("dot", "", YELLOW_CROSS.into())));
    }
    let has = |t: &State, a: usize, b: usize| {
        let x = yellow_up(t);
        x.len() == 2 && x.contains(&a) && x.contains(&b)
    };
    let line = (up.contains(&L) && up.contains(&RR)) || (up.contains(&F) && up.contains(&B));
    if line {
        let u = first_turn(3, s, &U4, |t| has(t, L, RR))?;
        return Ok(Some(step("line", u, YELLOW_CROSS.into())));
    }
    let u = first_turn(3, s, &U4, |t| has(t, B, L))?;
    Ok(Some(step("ell", u, YELLOW_CROSS_BACK.into())))
}

/// 윗층 엣지의 옆 색이 그 면 센터와 같은 쪽(앞 · 오른쪽 · 뒤 · 왼쪽 차례)
fn edges_matched(s: &State) -> Vec<usize> {
    let v = View::new(s);
    [(F, 19), (RR, 10), (B, 46), (L, 37)]
        .into_iter()
        .filter(|&(f, i)| v.col[i] == v.color_of(f))
        .map(|(f, _)| f)
        .collect()
}

fn is_pair(m: &[usize], a: usize, b: usize) -> bool {
    m.len() == 2 && m.contains(&a) && m.contains(&b)
}

fn edges_next(s: &State) -> R<Option<PathStep>> {
    if edges_matched(s).len() == 4 {
        return Ok(None);
    }
    let u = U_AROUND
        .iter()
        .copied()
        .find(|x| edges_matched(&play(3, s, x)).len() >= 2)
        .ok_or(SolveError("맞은 엣지 둘이 있는 자리가 없다"))?;
    let t = play(3, s, u);
    let m = edges_matched(&t);
    if m.len() == 4 {
        return Ok(Some(step("align", u, String::new())));
    }
    let adj = [(F, RR), (RR, B), (B, L), (L, F)];
    if adj.iter().any(|&(a, b)| is_pair(&m, a, b)) {
        let y = first_turn(3, &t, &Y4, |x| is_pair(&edges_matched(x), B, RR))?;
        return Ok(Some(step("next", &join(&[u, y]), EDGE_SWAP.into())));
    }
    let y = first_turn(3, &t, &Y4, |x| is_pair(&edges_matched(x), F, B))?;
    Ok(Some(step("opposite", &join(&[u, y]), EDGE_SWAP.into())))
}

/// 위 층 코너 가운데 제자리(방향은 안 봄)인 자리 번호
fn placed_corners(s: &State) -> Vec<usize> {
    let v = View::new(s);
    (0..4)
        .filter(|&k| {
            let slot = CORNER_SLOTS[k];
            let mut got: Vec<u8> = slot.iter().map(|&i| v.col[i]).collect();
            let mut want: Vec<u8> = slot
                .iter()
                .map(|&i| v.color_of(face_of_sticker(i)))
                .collect();
            got.sort_unstable();
            want.sort_unstable();
            got == want
        })
        .collect()
}

fn corner_place_next(s: &State) -> R<Option<PathStep>> {
    let placed = placed_corners(s);
    if placed.len() == 4 {
        return Ok(None);
    }
    if placed.is_empty() {
        return Ok(Some(step("none", "", CORNER_CYCLE.into())));
    }
    if placed.len() != 1 {
        return Err(SolveError("제자리 코너가 하나가 아니다"));
    }
    let y = first_turn(3, s, &Y4, |t| placed_corners(t).contains(&0))?;
    let v = View::new(&play(3, s, y));
    let home: HashSet<usize> = CORNER_SLOTS[1]
        .iter()
        .map(|&i| v.center_of(v.col[i]))
        .collect();
    Ok(Some(if same_set(&home, &[U, B, RR]) {
        step("diagonal", y, CORNER_CYCLE.into())
    } else {
        step("behind", y, CORNER_CYCLE_BACK.into())
    }))
}

fn yellow_at_front_right(s: &State) -> usize {
    let col = face_colors(3, s);
    CORNER_SLOTS[0]
        .iter()
        .find(|&&x| col[x] == YELLOW)
        .map(|&i| face_of_sticker(i))
        .unwrap_or(6)
}

fn corner_twist_next(s: &State) -> R<Option<PathStep>> {
    let twisted = |t: &State| yellow_at_front_right(t) != U;
    if !U4.iter().any(|u| twisted(&play(3, s, u))) {
        let u = first_turn(3, s, &U4, |t| edges_matched(t).len() == 4)?;
        return Ok(if u.is_empty() {
            None
        } else {
            Some(step("align", u, String::new()))
        });
    }
    let u = first_turn(3, s, &U_AROUND, twisted)?;
    Ok(Some(if yellow_at_front_right(&play(3, s, u)) == RR {
        step("right", u, reps(TWIST, 2))
    } else {
        step("front", u, reps(TWIST_BACK, 2))
    }))
}

fn next_step(stage: PathStage, s: &State) -> R<Option<PathStep>> {
    match stage {
        PathStage::Cross => cross_next(s),
        PathStage::Corners => corners_next(s),
        PathStage::Second => second_next(s),
        PathStage::YellowCross => yellow_cross_next(s),
        PathStage::Edges => edges_next(s),
        PathStage::CornerPlace => corner_place_next(s),
        PathStage::CornerTwist => corner_twist_next(s),
    }
}

/// 그 단계를 규칙대로 끝까지(걸음 수 상한 12)
fn run_stage(stage: PathStage, s: &State) -> R<Vec<PathStep>> {
    let mut steps = vec![];
    let mut state = s.clone();
    while let Some(st) = next_step(stage, &state)? {
        state = play(3, &state, &st.moves());
        steps.push(st);
        if steps.len() > 12 {
            return Err(SolveError("단계가 끝나지 않는다"));
        }
    }
    Ok(steps)
}

// ── 4×4 날개·줄(big-path.ts·yau-path.ts) ──────────────

const LINE_NAMES: [(&str, usize, usize); 12] = [
    ("UF", U, F),
    ("UR", U, RR),
    ("UB", U, B),
    ("UL", U, L),
    ("DF", D, F),
    ("DR", D, RR),
    ("DB", D, B),
    ("DL", D, L),
    ("FR", F, RR),
    ("FL", F, L),
    ("BR", B, RR),
    ("BL", B, L),
];

struct Line {
    name: &'static str,
    /// 날개 조각 둘(높이 차례, 위 먼저)
    wings: [usize; 2],
}

/// 엣지 줄 열둘(두 면 사이 날개 둘)
fn lines() -> Vec<Line> {
    let topo = cube_topology(4);
    LINE_NAMES
        .iter()
        .map(|&(name, a, b)| {
            let mut wings: Vec<usize> = (0..topo.pieces.len())
                .filter(|&i| {
                    let p = &topo.pieces[i];
                    p.kind == PieceKind::Wing
                        && p.stickers.len() == 2
                        && [a, b]
                            .iter()
                            .all(|&f| p.stickers.iter().any(|&st| topo.stickers[st].face == f))
                })
                .collect();
            wings.sort_by_key(|&i| -topo.pieces[i].position[1]);
            Line {
                name,
                wings: [wings[0], wings[1]],
            }
        })
        .collect()
}

fn line<'a>(ls: &'a [Line], name: &str) -> &'a Line {
    ls.iter().find(|l| l.name == name).expect("줄 이름")
}

/// 날개 자리에 든 조각의 두 색(차례 없음)
fn wing_colors(col: &[u8], piece: usize) -> (u8, u8) {
    let st = &cube_topology(4).pieces[piece].stickers;
    let (a, b) = (col[st[0]], col[st[1]]);
    (a.min(b), a.max(b))
}

fn line_paired(col: &[u8], l: &Line) -> bool {
    wing_colors(col, l.wings[0]) == wing_colors(col, l.wings[1])
}

// ── 4×4 센터(big-path.ts runCenters, 4×4만) ───────────

const CENTER_IN: &str = "2R U 2R'";
const CENTER_IN_DOWN: &str = "2R2 U 2R2";
const EDGE_FLIP: &str = "R U R' F R' F' R";
const STORE_UP: &str = "R U R'";
const DROP_FROM_UP: &str = "L' U' L";
const DROP_FROM_DOWN: &str = "L D L'";
const CELLS: [(usize, usize); 4] = [(1, 1), (1, 2), (2, 1), (2, 2)];

fn at4(f: usize, r: usize, c: usize) -> usize {
    f * 16 + r * 4 + c
}

fn hold_ok(fc: &[u8; 6], color: u8) -> bool {
    if fc[U] != color {
        return false;
    }
    if color == 0 || color == 3 {
        return fc[F] == if color == 0 { 2 } else { 5 };
    }
    fc[RR] == 0
}

fn first_turn_rot(ok: impl Fn(&[u8; 6]) -> bool, before: &str) -> R<String> {
    rotation_list()
        .into_iter()
        .find(|r| ok(&frame_colors(4, &join(&[before, r]))))
        .ok_or(SolveError("쥘 방향을 찾지 못했다"))
}

/// 센터 한 걸음(그 면이 다 들었으면 None): 쥐는 수, 공식, 쥐기 가운데 큐브 돌리기
fn next_center_step(
    s: &State,
    color: u8,
    turns: &str,
    done: &[u8],
) -> R<Option<(String, &'static str, &'static str)>> {
    let col = face_colors(4, s);
    let on_face = |f: usize| {
        CELLS
            .iter()
            .filter(|&&(r, c)| col[at4(f, r, c)] == color)
            .count()
    };
    if on_face(U) == 4 {
        return Ok(None);
    }
    let fc = frame_colors(4, turns);
    let free = |f: usize| fc[f] != color && !done.contains(&fc[f]);
    let mut sources: Vec<(usize, &'static str)> = vec![];
    for (face, y) in [(F, ""), (B, "y2"), (RR, "y"), (L, "y'")] {
        if (face == RR || face == L) && done.len() >= 2 {
            continue;
        }
        if free(face) && on_face(face) > 0 {
            sources.push((face, y));
        }
    }
    if free(D) && on_face(D) > 0 {
        sources.push((D, ""));
    }
    let Some(&(face, y)) = sources.first() else {
        return Err(SolveError("가져올 센터 블럭이 없다"));
    };
    let t1 = play(4, s, y);
    let down = face == D;
    let from_face = if down { D } else { F };
    let f = first_turn(
        4,
        &t1,
        &if down { D4 } else { ["", "F", "F'", "F2"] },
        |t| face_colors(4, t)[at4(from_face, 2, 2)] == color,
    )?;
    let u = first_turn(4, &play(4, &t1, f), &U4, |t| {
        face_colors(4, t)[at4(U, 1, 1)] != color
    })?;
    Ok(Some((
        join(&[y, f, u]),
        if down { CENTER_IN_DOWN } else { CENTER_IN },
        y,
    )))
}

/// 센터를 규칙대로(4×4, 넣을 색 차례 `colors`). 걸음마다 친 수
fn run_centers(start: &State, colors: &[u8]) -> R<Vec<String>> {
    let mut steps = vec![];
    let mut s = start.clone();
    let mut turns = String::new();
    let mut done: Vec<u8> = vec![];
    for &color in colors {
        let rot = first_turn_rot(|fc| hold_ok(fc, color), &turns)?;
        s = play(4, &s, &rot);
        turns = join(&[&turns, &rot]);
        let mut first = true;
        for guard in 0.. {
            if guard > 8 {
                return Err(SolveError("센터가 끝나지 않는다"));
            }
            let Some((hold, alg, y)) = next_center_step(&s, color, &turns, &done)? else {
                break;
            };
            s = play(4, &s, &join(&[&hold, alg]));
            turns = join(&[&turns, y]);
            steps.push(join(&[if first { &rot } else { "" }, &hold, alg]));
            first = false;
        }
        done.push(color);
    }
    Ok(steps)
}

// ── 4×4 엣지(big-path.ts nextFirstEdge·nextLastEdge) ──

const SLOTS: [&str; 4] = ["FR", "FL", "BR", "BL"];

fn y_to_fr(slot: &str) -> &'static str {
    match slot {
        "FL" => "y'",
        "BR" => "y",
        "BL" => "y2",
        _ => "",
    }
}

/// 앞-오른쪽 날개(위 0·아래 1)와 같은 색 날개가 다른 줄의 어디에 있나
fn partner_of(ls: &[Line], s: &State, level: usize) -> Option<(&'static str, usize)> {
    let col = face_colors(4, s);
    let want = wing_colors(&col, line(ls, "FR").wings[level]);
    for slot in &SLOTS[1..] {
        for lv in [0, 1] {
            if wing_colors(&col, line(ls, slot).wings[lv]) == want {
                return Some((slot, lv));
            }
        }
    }
    None
}

fn next_last_edge(ls: &[Line], s: &State) -> Option<String> {
    let col = face_colors(4, s);
    let open: Vec<&str> = SLOTS
        .iter()
        .copied()
        .filter(|sl| !line_paired(&col, line(ls, sl)))
        .collect();
    if open.is_empty() {
        return None;
    }
    let slot = if open.contains(&"FR") { "FR" } else { open[0] };
    let y = y_to_fr(slot);
    let t = play(4, s, y);
    if let Some((ps, 1)) = partner_of(ls, &t, 1) {
        let dw = match ps {
            "FL" => "Dw",
            "BR" => "Dw'",
            "BL" => "Dw2",
            _ => "",
        };
        return Some(join(&[y, dw, EDGE_FLIP, &inv(dw)]));
    }
    if let Some((ps, 0)) = partner_of(ls, &t, 0) {
        let uw = match ps {
            "FL" => "Uw'",
            "BR" => "Uw",
            "BL" => "Uw2",
            _ => "",
        };
        return Some(join(&[y, uw, EDGE_FLIP, &inv(uw)]));
    }
    Some(join(&[y, EDGE_FLIP]))
}

fn open_outer<'a>(ls: &'a [Line], col: &[u8], layer: char) -> Vec<&'a Line> {
    ls.iter()
        .filter(|l| l.name.starts_with(layer) && !line_paired(col, l))
        .collect()
}

fn next_first_edge(ls: &[Line], s: &State) -> R<Option<String>> {
    let col = face_colors(4, s);
    if open_outer(ls, &col, 'U').is_empty() && open_outer(ls, &col, 'D').is_empty() {
        return Ok(None);
    }
    let fr = line(ls, "FR");
    if line_paired(&col, fr) {
        if open_outer(ls, &col, 'U').is_empty() {
            return Ok(Some("x2".into()));
        }
        let u = first_turn(4, s, &U4, |t| {
            !line_paired(&face_colors(4, t), line(ls, "UB"))
        })?;
        return Ok(Some(join(&[u, STORE_UP])));
    }
    let partner_of_wing = |wing: usize| -> R<&Line> {
        let w = wing_colors(&col, wing);
        ls.iter()
            .find(|l| l.name != "FR" && l.wings.iter().any(|&x| wing_colors(&col, x) == w))
            .ok_or(SolveError("짝 날개가 없다"))
    };
    let want = wing_colors(&col, fr.wings[1]);
    let partner = partner_of_wing(fr.wings[1])?;
    let outside = |l: &Line| l.name.starts_with('U') || l.name.starts_with('D');
    let up = partner.name.starts_with('U');
    if outside(partner) && outside(partner_of_wing(fr.wings[0])?) {
        let target = line(ls, if up { "UB" } else { "DB" });
        let turn = first_turn(4, s, if up { &U4 } else { &D4 }, |t| {
            let c = face_colors(4, t);
            target.wings.iter().any(|&w| wing_colors(&c, w) == want)
        })?;
        return Ok(Some(join(&[
            turn,
            if up { DROP_FROM_UP } else { DROP_FROM_DOWN },
        ])));
    }
    next_last_edge(ls, s)
        .map(Some)
        .ok_or(SolveError("앞-오른쪽이 묶이지 않았는데 걸음이 없다"))
}

/// 센터가 맞은 4×4의 엣지 열둘: 처음 여덟(올려 모으기, 상한 80) → 마지막 넷(상한 12). 걸음마다 친 수
fn run_edges444(s: &State) -> R<Vec<String>> {
    let ls = lines();
    let mut steps = vec![];
    let mut state = s.clone();
    while let Some(st) = next_first_edge(&ls, &state)? {
        state = play(4, &state, &st);
        steps.push(st);
        if steps.len() > 80 {
            return Err(SolveError("처음 엣지가 끝나지 않는다"));
        }
    }
    let mut last = 0;
    while let Some(st) = next_last_edge(&ls, &state) {
        state = play(4, &state, &st);
        steps.push(st);
        last += 1;
        if last > 12 {
            return Err(SolveError("엣지 짝이 끝나지 않는다"));
        }
    }
    Ok(steps)
}

// ── 3×3처럼(big-solve.ts solveReduced, 4×4) ───────────

const OLL_PARITY_ALG: &str = "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'";
const PLL_PARITY_ALG: &str = "2R2 U2 2R2 Uw2 2R2 Uw2 U2";

/// 큰 큐브 바깥 층만 본 3×3(센터는 한가운데, 엣지는 바깥에서 둘째 칸)
fn project(s: &State) -> R<State> {
    let n = 4;
    let col = face_colors(n, s);
    let m = |v: usize| match v {
        0 => 0,
        2 => n - 1,
        _ => 1,
    };
    let at3 = |i: usize| {
        let (f, r, c) = (i / 9, (i % 9) / 3, i % 3);
        col[f * n * n + m(r) * n + m(c)]
    };
    let topo = cube_topology(3);
    let mut perm = vec![0u16; 54];
    let mut used = vec![false; topo.pieces.len()];
    for piece in &topo.pieces {
        let here: Vec<u8> = piece.stickers.iter().map(|&i| at3(i)).collect();
        let mut key = here.clone();
        key.sort_unstable();
        let home = (0..topo.pieces.len()).find(|&qi| {
            let q = &topo.pieces[qi];
            if used[qi] || q.stickers.len() != piece.stickers.len() {
                return false;
            }
            let mut fs: Vec<u8> = q
                .stickers
                .iter()
                .map(|&x| face_of_sticker(x) as u8)
                .collect();
            fs.sort_unstable();
            fs == key
        });
        let Some(home) = home else {
            return Err(SolveError("3×3로 볼 수 없다(센터·엣지가 덜 맞음)"));
        };
        used[home] = true;
        for (k, &pos) in piece.stickers.iter().enumerate() {
            let st = topo.pieces[home]
                .stickers
                .iter()
                .copied()
                .find(|&x| face_of_sticker(x) as u8 == here[k])
                .ok_or(SolveError("스티커 자리"))?;
            perm[pos] = st as u16;
        }
    }
    Ok(State {
        perm,
        twist: vec![0; 54],
    })
}

/// 윗면 색·앞면 색이 그 색이 되게 쥐는 큐브 돌리기
fn hold_faces(s: &State, up: u8, front: u8) -> R<String> {
    let face = |t: &State, f: usize| face_colors(4, t)[f * 16 + 2 * 4 + 2];
    rotation_list()
        .into_iter()
        .find(|x| {
            let t = play(4, s, x);
            face(&t, U) == up && face(&t, F) == front
        })
        .ok_or(SolveError("쥘 방향이 없다"))
}

/// 「3×3처럼」의 작은 단계(사이트 `ReducedStage`): 이름과 걸음마다 친 수(첫 걸음은 단계 앞 쥐기를 함께 든다)
struct Part {
    name: StageName,
    steps: Vec<String>,
}

fn part(name: StageName, lead: &str, steps: Vec<String>) -> Part {
    let mut steps: Vec<String> = steps
        .into_iter()
        .map(|x| join(&[&x]))
        .filter(|x| !x.is_empty())
        .collect();
    if steps.is_empty() {
        if !lead.trim().is_empty() {
            steps.push(join(&[lead]));
        }
    } else {
        steps[0] = join(&[lead, &steps[0]]);
    }
    Part { name, steps }
}

fn solve_reduced(start: &State) -> R<Vec<Part>> {
    let mut parts = vec![];
    let hold = hold_faces(start, 0, 2)?;
    let mut s = play(4, start, &hold);
    let mut pending = hold;
    let run = |s: &mut State,
               pending: &mut String,
               stage: PathStage,
               name: StageName,
               before: &str|
     -> R<Part> {
        *s = play(4, s, before);
        let steps: Vec<String> = run_stage(stage, &project(s)?)?
            .iter()
            .map(PathStep::moves)
            .collect();
        let lead = join(&[pending, before]);
        pending.clear();
        *s = play(4, s, &steps.join(" "));
        Ok(part(name, &lead, steps))
    };
    parts.push(run(
        &mut s,
        &mut pending,
        PathStage::Cross,
        StageName::Cross,
        "",
    )?);
    parts.push(run(
        &mut s,
        &mut pending,
        PathStage::Corners,
        StageName::Corners,
        "",
    )?);
    parts.push(run(
        &mut s,
        &mut pending,
        PathStage::Second,
        StageName::Middle,
        "z2",
    )?);
    // ① OLL 패리티
    let up_edges = |s: &State| -> R<usize> {
        let col = face_colors(3, &project(s)?);
        Ok([1, 3, 5, 7].iter().filter(|&&i| col[i] == YELLOW).count())
    };
    if up_edges(&s)? % 2 == 1 {
        let mut u = "";
        for x in U4 {
            if face_colors(3, &project(&play(4, &s, x))?)[7] != YELLOW {
                u = x;
                break;
            }
        }
        let front = face_colors(4, &s)[2 * 16 + 4 + 1];
        s = play(4, &s, &join(&[u, OLL_PARITY_ALG]));
        let back = hold_faces(&s, YELLOW, front)?;
        s = play(4, &s, &back);
        parts.push(part(
            StageName::OllParity,
            &join(&[u, OLL_PARITY_ALG, &back]),
            vec![],
        ));
    }
    parts.push(run(
        &mut s,
        &mut pending,
        PathStage::YellowCross,
        StageName::Eo,
        "",
    )?);
    parts.push(run(
        &mut s,
        &mut pending,
        PathStage::Edges,
        StageName::LlEdges,
        "",
    )?);
    // ② PLL 패리티: 제자리 코너가 꼭 둘이거나, 「제자리 없음」 공식 뒤에도 꼭 하나가 아니면
    let placed = |s: &State| -> R<usize> { Ok(placed_corners(&project(s)?).len()) };
    let mut parity = placed(&s)? == 2;
    if !parity && placed(&s)? == 0 {
        if let Some(first) = next_step(PathStage::CornerPlace, &project(&s)?)? {
            if first.case_id == "none" {
                let after = play(4, &s, &first.moves());
                let k = placed(&after)?;
                if k != 1 && k != 4 {
                    s = after;
                    parts.push(part(StageName::LlCornerPlace, "", vec![first.moves()]));
                    parity = true;
                }
            }
        }
    }
    if parity {
        s = play(4, &s, PLL_PARITY_ALG);
        parts.push(part(StageName::PllParity, PLL_PARITY_ALG, vec![]));
        parts.push(run(
            &mut s,
            &mut pending,
            PathStage::Edges,
            StageName::LlEdges,
            "",
        )?);
    }
    parts.push(run(
        &mut s,
        &mut pending,
        PathStage::CornerPlace,
        StageName::LlCornerPlace,
        "",
    )?);
    parts.push(run(
        &mut s,
        &mut pending,
        PathStage::CornerTwist,
        StageName::LlCornerTwist,
        "",
    )?);
    Ok(parts)
}

// ── 야우 옆 센터(yau-path.ts) ─────────────────────────

const YAU_PARK: &str = "2U 2D'";

fn yau_bring(top: bool, face: usize) -> &'static str {
    match (top, face) {
        (true, B) => "2U",
        (true, L) => "2U2",
        (true, _) => "2U'",
        (false, F) => "2D",
        (false, L) => "2D2",
        (false, _) => "2D'",
    }
}

/// 흰 면 쪽 십자 줄의 날개(아랫면과 그 옆면의 날개 둘)
fn line_wings(side: usize) -> Vec<usize> {
    let topo = cube_topology(4);
    (0..topo.pieces.len())
        .filter(|&i| {
            let p = &topo.pieces[i];
            p.kind == PieceKind::Wing
                && [D, side]
                    .iter()
                    .all(|&f| p.stickers.iter().any(|&st| topo.stickers[st].face == f))
        })
        .collect()
}

fn line_ok(col: &[u8], fc: &[u8; 6], side: usize) -> bool {
    let topo = cube_topology(4);
    line_wings(side).iter().all(|&p| {
        topo.pieces[p]
            .stickers
            .iter()
            .all(|&st| col[st] == fc[topo.stickers[st].face])
    })
}

/// 지금 쥔 방향에서 면마다 맞출 색. 흰 면이 아래이고 흰 십자 엣지가 앞·왼쪽·뒤 자리에 있어야 한다
fn yau_side_targets(s: &State) -> R<[u8; 6]> {
    let col = face_colors(4, s);
    for rot in rotation_list() {
        let fc = frame_colors(4, &rot);
        if fc[D] != WHITE {
            continue;
        }
        if [F, L, B].iter().all(|&side| line_ok(&col, &fc, side)) {
            return Ok(fc);
        }
    }
    Err(SolveError("흰 면 아래·흰 십자 엣지 셋으로 쥐지 않았다"))
}

fn side_count(s: &State, face: usize, color: u8) -> usize {
    let col = face_colors(4, s);
    CELLS
        .iter()
        .filter(|&&(r, c)| col[at4(face, r, c)] == color)
        .count()
}

fn next_yau_side_step(s: &State) -> R<Option<String>> {
    let fc = yau_side_targets(s)?;
    let full = |face: usize, color: u8| side_count(s, face, color) == 4;
    if [RR, F, L, B].iter().all(|&f| full(f, fc[f])) {
        return Ok(None);
    }
    let (color, sources): (u8, &[usize]) = if full(L, fc[L]) && full(F, fc[F]) {
        (fc[RR], &[B])
    } else if full(F, fc[L]) {
        (fc[F], &[B, L])
    } else {
        (fc[L], &[B, L, F])
    };
    if full(RR, color) {
        return Ok(Some(YAU_PARK.into()));
    }
    let col = face_colors(4, s);
    let mut spots: Vec<(usize, usize, usize)> = vec![];
    for &face in sources {
        for (r, c) in CELLS {
            if col[at4(face, r, c)] == color {
                spots.push((face, r, c));
            }
        }
    }
    if spots.is_empty() {
        return Err(SolveError("넣을 센터 블럭이 없다"));
    }
    let r_turns = ["", "R", "R'", "R2"];
    // 둘 넣기: 한 면의 같은 높이 두 칸이 모두 그 색이고, R로 오른쪽 면 맞은편 두 칸을 그 색이 아닌 블럭으로 채울 수 있으면
    for &face in sources {
        for r in [1, 2] {
            if !spots.contains(&(face, r, 1)) || !spots.contains(&(face, r, 2)) {
                continue;
            }
            let Some(hold2) = r_turns.iter().find(|h| {
                let cc = face_colors(4, &play(4, s, h));
                [1, 2].iter().all(|&cl| cc[at4(RR, 3 - r, cl)] != color)
            }) else {
                continue;
            };
            let bring2 = yau_bring(r == 1, face);
            return Ok(Some(join(&[hold2, bring2, "R2", &inv(bring2)])));
        }
    }
    let (face, r, c) = spots[0];
    let top = r == 1;
    let bring = yau_bring(top, face);
    let turn = if top == (c == 1) { "R'" } else { "R" };
    let hold = r_turns
        .iter()
        .find(|h| face_colors(4, &play(4, s, h))[at4(RR, 3 - r, 3 - c)] != color)
        .ok_or(SolveError("비울 칸이 없다"))?;
    Ok(Some(join(&[hold, bring, turn, &inv(bring)])))
}

fn run_yau_side_centers(start: &State) -> R<Vec<String>> {
    let mut steps = vec![];
    let mut s = start.clone();
    while let Some(st) = next_yau_side_step(&s)? {
        s = play(4, &s, &st);
        steps.push(st);
        if steps.len() > 16 {
            return Err(SolveError("옆 센터가 끝나지 않는다"));
        }
    }
    Ok(steps)
}

// ── 야우 흰 십자 셋·마지막 십자 엣지(yau-path.ts) ─────

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct WingAt {
    line: &'static str,
    /// 가운데 층 줄에서 0 = 위(2U 층), 1 = 아래(2D 층)
    level: usize,
    /// 흰 스티커가 있는 면
    white_face: usize,
}

impl WingAt {
    fn is_mid(&self) -> bool {
        !self.line.starts_with('U') && !self.line.starts_with('D')
    }
}

/// 흰-그 색 날개 둘이 있는 곳
fn white_wings(ls: &[Line], s: &State, color: u8) -> Vec<WingAt> {
    let topo = cube_topology(4);
    let col = face_colors(4, s);
    let mut out = vec![];
    for l in ls {
        for (level, &w) in l.wings.iter().enumerate() {
            let sts = &topo.pieces[w].stickers;
            let cs: Vec<u8> = sts.iter().map(|&st| col[st]).collect();
            if cs.contains(&WHITE) && cs.contains(&color) {
                let ws = *sts.iter().find(|&&st| col[st] == WHITE).expect("흰 스티커");
                out.push(WingAt {
                    line: l.name,
                    level,
                    white_face: topo.stickers[ws].face,
                });
            }
        }
    }
    out
}

fn cross_placed(ls: &[Line], s: &State, color: u8, slot: usize) -> bool {
    let name = format!("D{}", &"URFDLB"[slot..slot + 1]);
    let ws = white_wings(ls, s, color);
    ws.len() == 2 && ws.iter().all(|w| w.line == name && w.white_face == D)
}

fn white_down_list() -> Vec<String> {
    rotations(["", "z2", "x", "x'", "z", "z'"])
}

fn white_center_down(s: &State) -> bool {
    face_colors(4, s)[at4(D, 1, 1)] == WHITE
}

/// 흰 십자 셋의 다음 넣을 엣지 블럭과 쥐기(셋 다 들었으면 None)
fn yau_cross_target(ls: &[Line], s: &State) -> Option<(u8, String)> {
    let downs: Vec<String> = white_down_list()
        .into_iter()
        .filter(|r| white_center_down(&play(4, s, r)))
        .collect();
    let Some(base) = downs
        .iter()
        .find(|r| cross_placed(ls, &play(4, s, r), GREEN, F))
    else {
        return Some((GREEN, downs.first().cloned().unwrap_or_default()));
    };
    let t = play(4, s, base);
    for (color, slot) in [(GREEN, F), (RED, L), (BLUE, B)] {
        if cross_placed(ls, &t, color, slot) {
            continue;
        }
        let green_at = if slot == L { RR } else { B };
        let rot = downs
            .iter()
            .find(|r| cross_placed(ls, &play(4, s, r), GREEN, green_at))
            .cloned()
            .unwrap_or_default();
        return Some((color, rot));
    }
    None
}

fn layer_of(level: usize) -> &'static str {
    if level == 0 {
        "2U"
    } else {
        "2D"
    }
}

fn next_yau_cross_step(ls: &[Line], s: &State) -> R<Option<String>> {
    let Some((color, rot)) = yau_cross_target(ls, s) else {
        return Ok(None);
    };
    let t = play(4, s, &rot);
    let wings = white_wings(ls, &t, color);
    let clear = |other: Option<&WingAt>| match other {
        Some(o) if o.is_mid() && o.line.starts_with('F') => format!("{}2", layer_of(o.level)),
        _ => String::new(),
    };
    let other_of = |i: usize| wings.iter().enumerate().find(|(k, _)| *k != i).map(|p| p.1);
    if let Some(fi) = wings.iter().position(|w| w.line == "DF") {
        return Ok(Some(join(&[&rot, &clear(other_of(fi)), "F"])));
    }
    let ups: Vec<usize> = (0..wings.len())
        .filter(|&i| wings[i].line.starts_with('U'))
        .collect();
    if !ups.is_empty() {
        let a = wings[ups[0]];
        if ups.len() > 1 && a.line == wings[ups[1]].line && a.white_face == U {
            let u = first_turn_owned(4, &t, &turns4("U"), |x| {
                white_wings(ls, x, color).iter().all(|w| w.line == "UF")
            })
            .unwrap_or_default();
            return Ok(Some(join(&[&rot, &u, "F2"])));
        }
        let pre = clear(other_of(ups[0]));
        let t2 = play(4, &t, &pre);
        let u = first_turn_owned(4, &t2, &turns4("U"), |x| {
            white_wings(ls, x, color).iter().any(|w| w.line == "UF")
        })
        .unwrap_or_default();
        return Ok(Some(join(&[&rot, &pre, &u, "F"])));
    }
    if let Some(down) = wings.iter().find(|w| w.line.starts_with('D')) {
        return Ok(Some(join(&[&rot, &format!("{}2", &down.line[1..2])])));
    }
    if wings.len() < 2 {
        return Err(SolveError("흰 십자 날개가 둘이 아니다"));
    }
    let (a, b) = (wings[0], wings[1]);
    if a.level == b.level {
        let m = first_turn_owned(4, &t, &turns4(layer_of(a.level)), |x| {
            let ws = white_wings(ls, x, color);
            ws.iter().any(|w| w.line == "FR") && ws.iter().all(|w| w.line != "FL")
        })
        .unwrap_or_default();
        return Ok(Some(join(&[&rot, &m, "F2"])));
    }
    let side_ok = |w: &WingAt| {
        (w.line == "FR" && w.white_face == RR) || (w.line == "FL" && w.white_face == L)
    };
    let turn_for = |level: usize, base: &State| {
        first_turn_owned(4, base, &turns4(layer_of(level)), |x| {
            white_wings(ls, x, color)
                .iter()
                .any(|w| w.level == level && w.is_mid() && side_ok(w))
        })
        .ok_or(SolveError("짝이 되지 않았다"))
    };
    let mu = turn_for(0, &t)?;
    let md = turn_for(1, &play(4, &t, &mu))?;
    let after = white_wings(ls, &play(4, &t, &join(&[&mu, &md])), color);
    let slot = after.first().map(|w| w.line).unwrap_or("");
    if !after.iter().all(|w| w.line == slot && side_ok(w)) {
        return Err(SolveError("짝이 되지 않았다"));
    }
    Ok(Some(join(&[
        &rot,
        &mu,
        &md,
        if slot == "FR" { "F" } else { "F'" },
    ])))
}

fn run_yau_cross(ls: &[Line], start: &State) -> R<Vec<String>> {
    let mut steps = vec![];
    let mut s = start.clone();
    while let Some(st) = next_yau_cross_step(ls, &s)? {
        s = play(4, &s, &st);
        steps.push(st);
        if steps.len() > 30 {
            return Err(SolveError("흰 십자 셋이 끝나지 않는다"));
        }
    }
    Ok(steps)
}

const INSERT_SIDE: &str = "R U' R' F";

fn lift(line: &str) -> &'static str {
    match line {
        "FR" => "R U R'",
        "FL" => "L' U' L",
        "BR" => "R' U R",
        "BL" => "L U' L'",
        _ => "",
    }
}

fn next_yau_last_cross_step(ls: &[Line], s: &State) -> R<Option<String>> {
    let downs: Vec<String> = white_down_list()
        .into_iter()
        .filter(|r| white_center_down(&play(4, s, r)))
        .collect();
    let front = downs
        .iter()
        .find(|r| face_colors(4, &play(4, s, r))[at4(F, 1, 1)] == ORANGE)
        .ok_or(SolveError("센터가 맞지 않았다"))?
        .clone();
    let t = play(4, s, &front);
    let wings = white_wings(ls, &t, ORANGE);
    if wings.len() < 2 {
        return Err(SolveError("흰-주황 날개가 둘이 아니다"));
    }
    let (a, b) = (wings[0], wings[1]);
    if a.line == b.line {
        if a.line == "DF" && a.white_face == D {
            return Ok(None);
        }
        if a.line == "DF" {
            return Ok(Some(join(&[&front, "F2"])));
        }
        if a.line.starts_with('U') {
            let u = first_turn_owned(4, &t, &turns4("U"), |x| {
                white_wings(ls, x, ORANGE).iter().all(|w| w.line == "UF")
            })
            .unwrap_or_default();
            return Ok(Some(join(&[
                &front,
                &u,
                if a.white_face == U { "F2" } else { INSERT_SIDE },
            ])));
        }
        if a.line == "FR" && a.white_face == RR {
            return Ok(Some(join(&[&front, "F"])));
        }
        if a.line == "FL" && a.white_face == L {
            return Ok(Some(join(&[&front, "F'"])));
        }
        return Ok(Some(join(&[&front, lift(a.line)])));
    }
    if let Some(fi) = wings.iter().position(|w| w.line == "DF") {
        let other = wings[if fi == 0 { 1 } else { 0 }];
        let u = if other.line == "UF" { "U" } else { "" };
        return Ok(Some(join(&[&front, u, "F2"])));
    }
    let Some(mid) = wings.iter().find(|w| w.is_mid()).copied() else {
        let u = first_turn_owned(4, &t, &turns4("U"), |x| {
            white_wings(ls, x, ORANGE).iter().any(|w| w.line == "UB")
        })
        .unwrap_or_default();
        return Ok(Some(join(&[&front, &u, STORE_UP])));
    };
    // 고른 날개의 줄을 앞-오른쪽으로(y는 가운데 줄의 위 자리·아래 자리를 바꾸지 않는다)
    let want = face_colors(4, &play(4, &t, y_to_fr(mid.line)));
    let rot = downs
        .iter()
        .find(|r| face_colors(4, &play(4, s, r)) == want)
        .cloned()
        .unwrap_or_default();
    let t2 = play(4, s, &rot);
    let ws2 = white_wings(ls, &t2, ORANGE);
    let here_i = ws2
        .iter()
        .position(|w| w.line == "FR" && w.level == mid.level)
        .ok_or(SolveError("앞-오른쪽 날개가 없다"))?;
    let here = ws2[here_i];
    let partner = ws2
        .iter()
        .enumerate()
        .find(|(k, _)| *k != here_i)
        .map(|p| *p.1)
        .ok_or(SolveError("짝 날개가 없다"))?;
    if partner.line.starts_with('U') {
        let u = first_turn_owned(4, &t2, &turns4("U"), |x| {
            white_wings(ls, x, ORANGE).iter().any(|w| w.line == "UB")
        })
        .unwrap_or_default();
        return Ok(Some(join(&[&rot, &u, DROP_FROM_UP])));
    }
    if partner.level != here.level {
        return Ok(Some(join(&[&rot, EDGE_FLIP])));
    }
    let wide = match (here.level, partner.line) {
        (1, "FL") => "Dw",
        (1, "BR") => "Dw'",
        (1, "BL") => "Dw2",
        (0, "FL") => "Uw'",
        (0, "BR") => "Uw",
        (0, "BL") => "Uw2",
        _ => return Err(SolveError("넓은 돌리기가 없다")),
    };
    Ok(Some(join(&[&rot, wide, EDGE_FLIP, &inv(wide)])))
}

fn run_yau_last_cross(ls: &[Line], start: &State) -> R<Vec<String>> {
    let mut steps = vec![];
    let mut s = start.clone();
    while let Some(st) = next_yau_last_cross_step(ls, &s)? {
        s = play(4, &s, &st);
        steps.push(st);
        if steps.len() > 12 {
            return Err(SolveError("마지막 십자 엣지가 끝나지 않는다"));
        }
    }
    Ok(steps)
}

// ── 야우 잇기(yau-solve.ts)와 시연 꼴(yau-hero.ts) ────

/// 흰 면 아래·흰 십자 엣지 셋(앞·왼쪽·뒤)이 되는 쥐기(돌리기 적은 것 먼저)
fn side_hold(s: &State) -> R<String> {
    let mut holds = rotations(["", "x", "x2", "x'", "z", "z'"]);
    holds.sort_by_key(|h| h.split(' ').count());
    holds
        .into_iter()
        .find(|h| yau_side_targets(&play(4, s, h)).is_ok())
        .ok_or(SolveError("흰 십자 셋이 맞지 않았다"))
}

/// 섞인 4×4를 야우 차례로 끝까지(흰색 먼저). 단계마다 이름과 걸음마다 친 수
fn solve_yau(start: &State) -> R<Vec<Part>> {
    let ls = lines();
    let mut out: Vec<Part> = vec![];
    let mut s = start.clone();
    let mut push = |s: &mut State, name: StageName, steps: Vec<String>| {
        let steps: Vec<String> = steps
            .into_iter()
            .map(|x| join(&[&x]))
            .filter(|x| !x.is_empty())
            .collect();
        *s = play(4, s, &steps.join(" "));
        out.push(Part { name, steps });
    };
    let centers = run_centers(&s, &[WHITE, YELLOW])?;
    push(&mut s, StageName::YauCenters, centers);
    let cross = run_yau_cross(&ls, &s)?;
    push(&mut s, StageName::YauCross3, cross);
    let side = side_hold(&s)?;
    let mut sides = run_yau_side_centers(&play(4, &s, &side))?;
    if sides.is_empty() {
        sides.push(side);
    } else {
        sides[0] = join(&[&side, &sides[0]]);
    }
    push(&mut s, StageName::CentersRest, sides);
    let last = run_yau_last_cross(&ls, &s)?;
    push(&mut s, StageName::YauLastCross, last);
    let edges = run_edges444(&s)?;
    push(&mut s, StageName::Edges, edges);
    out.extend(solve_reduced(&s)?);
    Ok(out)
}

/// 4×4 스티커 색을 바꾼 상태(색 `c`가 `map[c]`가 된다, 사이트 `recolor`)
fn recolor(s: &State, map: &[u8; 6]) -> State {
    State {
        perm: s
            .perm
            .iter()
            .map(|&p| u16::from(map[(p / 16) as usize]) * 16 + p % 16)
            .collect(),
        twist: s.twist.clone(),
    }
}

/// 홈 시연 4×4 야우(사이트 `solveYauHuman`): 첫 면 색 `first`를 흰색으로 읽어 풀고, 수 하나씩·단계 경계·걸음마다
/// 살피는 자리로 낸다. 큐브 돌리기뿐인 3×3 십자 단계는 첫 층 코너에 붙인다
pub fn solve_yau_human(state: &State, first: usize) -> Result<HumanSolve, SolveError> {
    let start = if first == 0 {
        state.clone()
    } else {
        recolor(state, &first_face_map(first))
    };
    let mut groups: Vec<Part> = vec![];
    let mut carry: Vec<String> = vec![];
    for mut p in solve_yau(&start)? {
        let is_rot = |m: &String| m.starts_with(['x', 'y', 'z']);
        if p.name == StageName::Cross && p.steps.iter().flat_map(|x| tokens(x)).all(|m| is_rot(&m))
        {
            carry = p.steps.iter().flat_map(|x| tokens(x)).collect();
            continue;
        }
        if !carry.is_empty() {
            let head = p.steps.first().cloned().unwrap_or_default();
            let joined = join(&[&carry.join(" "), &head]);
            if p.steps.is_empty() {
                p.steps.push(joined);
            } else {
                p.steps[0] = joined;
            }
            carry.clear();
        }
        groups.push(p);
    }
    let mut moves: Vec<String> = vec![];
    let mut stages = vec![];
    let mut looks = vec![];
    for g in groups {
        let start = moves.len();
        for st in &g.steps {
            let t = tokens(st);
            if t.is_empty() {
                continue;
            }
            if moves.len() > start {
                looks.push(moves.len());
            }
            moves.extend(t);
        }
        stages.push(SolveStage {
            name: g.name,
            start,
            end: moves.len(),
        });
    }
    Ok(HumanSolve {
        moves,
        stages,
        looks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hero_show::hero_scramble;
    use crate::rng::Rng;
    use crate::state::is_solved;

    #[test]
    fn every_first_color_solves_hero_scrambles() {
        // 사이트 `yau-hero.test.ts`와 같은 확인: 첫 면 색마다 끝까지 맞추고, 십자 셋 끝에 그 색 센터가 아랫면에 있다
        for seed in 1..=12u32 {
            let mut rng = Rng::new(seed);
            let (_, _, state) = hero_scramble(4, &mut || rng.next_float());
            for first in 0..6 {
                let r = solve_yau_human(&state, first).expect("야우");
                let end = apply_alg(4, &state, &r.moves.join(" ")).expect("수");
                assert!(is_solved(4, &end), "씨앗 {seed} 첫 면 {first}");
                let cross = r
                    .stages
                    .iter()
                    .find(|st| st.name == StageName::YauCross3)
                    .expect("십자 셋");
                let at = apply_alg(4, &state, &r.moves[..cross.end].join(" ")).expect("수");
                let c = face_colors(4, &at);
                assert!([53, 54, 57, 58].iter().all(|&i| c[i] as usize == first));
            }
        }
    }
}
