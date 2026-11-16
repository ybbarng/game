//! 배우는 방식 3×3 초보자 해법(홈 시연 「초보자 해법」, 사이트 `packages/cube-ai` `solveBeginner3(state, { taught: true })`).
//!
//! 옮긴 원본: `methods.ts` `BEGINNER3_TAUGHT_STEPS`, `taught.ts`(흰 면 위 십자·첫 층 코너 지름길·둘째 층 앞-오른쪽 칸·
//! 마지막 층 노란 십자 → 옆면 맞추기 → 코너 자리 → 코너 방향), `cross-front.ts`(흰 십자 엣지를 F·D·y로만 넣는 너비 우선
//! 탐색). 같은 상태면 사이트와 같은 수가 나온다(공통 시험 자료 `fixtures/hero-show.json`).
//!
//! 흐름: 흰 면을 위로 들고(맞추는 면은 돌리지 않는다) 넣을 조각을 아랫면으로 빼서 칸 밑에 둔 뒤 정해진 수로 넣는다.
//! 첫 층이 끝나면 z2로 뒤집어 둘째 층·마지막 층을 맞춘다. 살피는 자리 앞뒤의 수는 합치지 않는다(`look_barrier`).

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use crate::human::{finish, u_turn, HumanSolve, Solve, SolveError, StageName, EDGE_FACELETS, R};
use crate::notation::parse_moves;
use crate::state::{face_colors, move_table, State};

const TRIGGER: &str = "R' D' R D";
const TRIGGER_BACK: &str = "D' R' D R";
const SHORTCUT_RIGHT: &str = "R' D' R";
const SHORTCUT_FRONT: &str = "F D F'";
const SHORTCUT_DOWN: &str = "R' D2 R D R' D' R";
const SLOT_RIGHT: &str = "R' D' R D R' D' R";
const SLOT_FRONT: &str = "F D F' D' F D F'";
const MIDDLE_FROM_FRONT: &str = "U R U' R' U' F' U F";
const MIDDLE_FROM_RIGHT: &str = "U' F' U F U R U' R'";
const EO: &str = "F R U R' U' F'";
const EO_BACK: &str = "F U R U' R' F'";
const EDGE_SWAP: &str = "R U R' U R U2 R' U";
const CORNER_CYCLE: &str = "U R U' L' U R' U' L";
const CORNER_CYCLE_BACK: &str = "L' U R U' L U R' U'";

/// 면 글자 번호(U R F D L B)
const U: u8 = 0;
const D: u8 = 3;

fn y_turn(k: usize) -> &'static str {
    ["", "y", "y2", "y'"][k % 4]
}

fn d_turn(a: usize) -> &'static str {
    ["", "D", "D2", "D'"][a % 4]
}

fn alg_len(alg: &str) -> usize {
    alg.split_whitespace().count()
}

/// 앞 것들을 빈 칸 없이 잇는다(사이트 `[...].filter(Boolean).join(" ")`)
fn join(parts: &[&str]) -> String {
    parts
        .iter()
        .filter(|p| !p.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join(" ")
}

fn probe_with(s: &Solve, alg: &str) -> Solve {
    let mut t = s.probe();
    t.apply(alg);
    t
}

fn face_of(i: usize) -> u8 {
    (i / 9) as u8
}

fn corner_ok(cp: &[u8], co: &[u8], slot: usize) -> bool {
    cp[slot] as usize == slot && co[slot] == 0
}

fn guard(count: usize, limit: usize, what: &'static str) -> R<()> {
    if count > limit {
        return Err(SolveError(what));
    }
    Ok(())
}

// ── 흰 면 위로·흰 십자 ─────────────────────────────────

pub(crate) fn white_up(s: &mut Solve) -> R<()> {
    for r in ["", "x2", "x", "x'", "z", "z'"] {
        if probe_with(s, r).f[4] == 0 {
            s.apply(r);
            return Ok(());
        }
    }
    Err(SolveError("흰 가운데를 찾지 못했다"))
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct WhiteEdge {
    slot: usize,
    white: usize,
    color: u8,
}

fn white_edges(rel: &[u8]) -> Vec<WhiteEdge> {
    let mut out = vec![];
    for (slot, &[a, b]) in EDGE_FACELETS.iter().enumerate() {
        if rel[a] == U {
            out.push(WhiteEdge {
                slot,
                white: a,
                color: rel[b],
            });
        } else if rel[b] == U {
            out.push(WhiteEdge {
                slot,
                white: b,
                color: rel[a],
            });
        }
    }
    out
}

fn cross_solved_slots(rel: &[u8]) -> Vec<usize> {
    (0..4)
        .filter(|&j| {
            let [a, b] = EDGE_FACELETS[j];
            rel[a] == U && rel[b] == face_of(b)
        })
        .collect()
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum CrossCase {
    DownWhiteDown,
    DownWhiteSide,
    Middle,
    TopWrong,
    TopFlipped,
}

const CASE_ORDER: [CrossCase; 5] = [
    CrossCase::DownWhiteDown,
    CrossCase::DownWhiteSide,
    CrossCase::Middle,
    CrossCase::TopWrong,
    CrossCase::TopFlipped,
];

fn touches(slot: usize, face: u8) -> bool {
    EDGE_FACELETS[slot].iter().any(|&i| face_of(i) == face)
}

fn case_of(e: &WhiteEdge) -> CrossCase {
    if touches(e.slot, D) {
        return if face_of(e.white) == D {
            CrossCase::DownWhiteDown
        } else {
            CrossCase::DownWhiteSide
        };
    }
    if !touches(e.slot, U) {
        return CrossCase::Middle;
    }
    if face_of(e.white) == U {
        CrossCase::TopWrong
    } else {
        CrossCase::TopFlipped
    }
}

/// 다음에 넣을 흰 엣지 하나의 수(사이트 `nextCrossEdge`). 십자가 다 됐으면 None
fn next_cross_edge(s: &Solve) -> R<Option<String>> {
    let rel = s.rel();
    let solved = cross_solved_slots(&rel);
    if solved.len() == 4 {
        return Ok(None);
    }
    let todo: Vec<WhiteEdge> = white_edges(&rel)
        .into_iter()
        .filter(|e| !(e.slot < 4 && solved.contains(&e.slot)))
        .collect();
    for kind in CASE_ORDER {
        let mut best: Option<String> = None;
        for e in todo.iter().filter(|x| case_of(x) == kind) {
            let others: Vec<(usize, u8)> = todo
                .iter()
                .filter(|x| *x != e)
                .map(|x| (x.white, x.color))
                .collect();
            let alg = front_cross_insert(e.white, e.color, &solved, &others)?;
            if best.as_ref().is_none_or(|b| alg_len(&alg) < alg_len(b)) {
                best = Some(alg);
            }
        }
        if best.is_some() {
            return Ok(best);
        }
    }
    Err(SolveError("십자 엣지를 넣을 수를 찾지 못했다"))
}

pub(crate) fn cross_taught(s: &mut Solve) -> R<()> {
    for i in 0.. {
        guard(i, 4, "십자 단계가 끝나지 않는다")?;
        let Some(alg) = next_cross_edge(s)? else {
            return Ok(());
        };
        s.look();
        s.apply(&alg);
    }
    Ok(())
}

// ── 흰 십자 엣지를 F·D·y로만(사이트 `cross-front.ts`) ───────────

const MOVES: [&str; 9] = ["D", "D'", "D2", "F", "F'", "F2", "y", "y'", "y2"];
const LAYER: [u8; 9] = [0, 0, 0, 1, 1, 1, 2, 2, 2];
const CROSS_WHITE: [usize; 4] = [5, 7, 3, 1];
const CROSS_SIDE: [usize; 4] = [10, 19, 37, 46];
const SIDE_CENTERS: [usize; 4] = [13, 22, 40, 49];
const MAX_ROUNDS: u8 = 3;

/// 옆면 글자 → R F L B 차례 번호
fn side_index(face: u8) -> usize {
    match face {
        1 => 0,
        2 => 1,
        4 => 2,
        _ => 3,
    }
}

fn perms() -> &'static [Vec<u16>; 9] {
    static P: OnceLock<[Vec<u16>; 9]> = OnceLock::new();
    P.get_or_init(|| {
        MOVES.map(|name| {
            let m = parse_moves(3, name).expect("수")[0];
            move_table(3, &m).dest.clone()
        })
    })
}

fn partner_of(i: usize) -> usize {
    for [a, b] in EDGE_FACELETS {
        if a == i {
            return b;
        }
        if b == i {
            return a;
        }
    }
    unreachable!("엣지 스티커가 아니다")
}

/// 사이트 `frontCrossInsert`: 넣을 엣지의 흰 스티커 자리·다른 색, 이미 맞은 십자 자리, 아직 안 넣은 다른 흰 엣지
fn front_cross_insert(
    white: usize,
    color: u8,
    solved: &[usize],
    others: &[(usize, u8)],
) -> R<String> {
    static MEMO: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    let mut rest: Vec<String> = others
        .iter()
        .map(|&(w, c)| format!("{w}{}", ["U", "R", "F", "D", "L", "B"][c as usize]))
        .collect();
    rest.sort();
    let mut sol = solved.to_vec();
    sol.sort();
    let key = format!(
        "{white}|{color}|{}|{}",
        sol.iter().map(|j| j.to_string()).collect::<String>(),
        rest.join(",")
    );
    let memo = MEMO.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = memo.lock().expect("잠금").get(&key) {
        return Ok(hit.clone());
    }
    let alg = cross_search(white, color, solved, others)?;
    memo.lock().expect("잠금").insert(key, alg.clone());
    Ok(alg)
}

struct CrossProblem {
    want: Vec<usize>,
    others: Vec<usize>,
    from: usize,
}

impl CrossProblem {
    fn placed(p: &[u16], at: usize, c: usize) -> bool {
        p[at] < 9 && p[at + 1] / 9 == p[c] / 9
    }
    fn stray(&self, p: &[u16]) -> bool {
        self.others
            .iter()
            .enumerate()
            .any(|(k, &c)| Self::placed(p, self.from + k * 2, c))
    }
    fn done(&self, p: &[u16]) -> bool {
        self.want.iter().enumerate().all(|(e, &c)| {
            let w = p[4 + e * 2];
            let o = p[5 + e * 2];
            w < 9 && o / 9 == p[c] / 9
        })
    }
    fn low(p: &[u16]) -> bool {
        p[4] / 9 == 3 || p[5] / 9 == 3
    }
}

fn cross_search(white: usize, color: u8, solved: &[usize], others: &[(usize, u8)]) -> R<String> {
    let mut start: Vec<u16> = SIDE_CENTERS.iter().map(|&i| i as u16).collect();
    start.push(white as u16);
    start.push(partner_of(white) as u16);
    let mut want = vec![side_index(color)];
    for &j in solved {
        start.push(CROSS_WHITE[j] as u16);
        start.push(CROSS_SIDE[j] as u16);
        want.push(j);
    }
    let from = start.len();
    for &(w, _) in others {
        start.push(w as u16);
        start.push(partner_of(w) as u16);
    }
    let prob = CrossProblem {
        want,
        others: others.iter().map(|&(_, c)| side_index(c)).collect(),
        from,
    };
    let v0 = CrossProblem::low(&start);
    if prob.done(&start) {
        return Ok(String::new());
    }
    let guards: &[bool] = if others.is_empty() {
        &[false]
    } else {
        &[true, false]
    };
    for &g in guards {
        for max_rounds in 1..=MAX_ROUNDS {
            if let Some(found) = search_rounds(&prob, &start, v0, max_rounds, g) {
                return Ok(found);
            }
        }
    }
    Err(SolveError("F·D·y로 십자 엣지를 넣지 못했다"))
}

struct Node {
    p: Vec<u16>,
    path: Vec<usize>,
    ys: u32,
    v: bool,
    phase: u8,
    rounds: u8,
}

fn search_rounds(
    prob: &CrossProblem,
    start: &[u16],
    v0: bool,
    max_rounds: u8,
    use_stray: bool,
) -> Option<String> {
    let perms = perms();
    let mut seen: HashSet<(Vec<u16>, bool, u8, u8, u8)> = HashSet::new();
    let mut layer = vec![Node {
        p: start.to_vec(),
        path: vec![],
        ys: 0,
        v: v0,
        phase: 0,
        rounds: 1,
    }];
    let stray = |p: &[u16]| use_stray && prob.stray(p);
    for _depth in 1..=14 {
        let mut next: Vec<Node> = vec![];
        let mut best: Option<Node> = None;
        for node in &layer {
            let last = node.path.last().copied();
            let last_layer: i32 = last.map_or(-1, |l| LAYER[l] as i32);
            for mi in 0..MOVES.len() {
                let kind = LAYER[mi];
                let phase: u8;
                let mut rounds = node.rounds;
                if kind == 2 {
                    if node.phase == 0 {
                        phase = 1;
                    } else if node.phase == 3 && last_layer == 1 {
                        if rounds >= max_rounds || stray(&node.p) {
                            continue;
                        }
                        rounds += 1;
                        phase = 1;
                    } else {
                        continue;
                    }
                } else if kind == 0 {
                    if node.phase == 2 || last_layer == 0 {
                        continue;
                    }
                    phase = if node.phase == 3 { 3 } else { 2 };
                } else {
                    let lower_raise = matches!(last, Some(3) | Some(4)) && mi == 5;
                    if last_layer == 1 && !lower_raise {
                        continue;
                    }
                    phase = 3;
                }
                let perm = &perms[mi];
                let p: Vec<u16> = node.p.iter().map(|&i| perm[i as usize]).collect();
                let v = node.v || CrossProblem::low(&p);
                if !seen.insert((p.clone(), v, phase, rounds, kind)) {
                    continue;
                }
                let mut path = node.path.clone();
                path.push(mi);
                let child = Node {
                    ys: node.ys + u32::from(kind == 2),
                    p,
                    path,
                    v,
                    phase,
                    rounds,
                };
                if v && prob.done(&child.p) {
                    if stray(&child.p) {
                        continue;
                    }
                    if best.as_ref().is_none_or(|b| child.ys < b.ys) {
                        best = Some(child);
                    }
                    continue;
                }
                next.push(child);
            }
        }
        if let Some(b) = best {
            return Some(
                b.path
                    .iter()
                    .map(|&i| MOVES[i])
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        }
        layer = next;
    }
    None
}

// ── 첫 층 코너(흰 면 위, 지름길) ──────────────────────────

fn corner_shortcut_step(s: &mut Solve) -> R<()> {
    let mut best: Option<String> = None;
    for k in 0..4 {
        let t = probe_with(s, y_turn(k));
        let tc = t.cubie()?;
        if tc.cp.iter().position(|&p| p == 0).unwrap_or(usize::MAX) < 4 {
            continue;
        }
        let mut a = None;
        for x in 0..4 {
            if probe_with(&t, d_turn(x)).cubie()?.cp[4] == 0 {
                a = Some(x);
                break;
            }
        }
        let a = a.ok_or(SolveError("코너를 칸 밑에 둘 수가 없다"))?;
        let co = probe_with(&t, d_turn(a)).cubie()?.co[4];
        let alg = join(&[
            y_turn(k),
            d_turn(a),
            [SHORTCUT_DOWN, SHORTCUT_FRONT, SHORTCUT_RIGHT][co as usize],
        ]);
        if best.as_ref().is_none_or(|b| alg_len(&alg) < alg_len(b)) {
            best = Some(alg);
        }
    }
    if let Some(b) = best {
        s.apply(&b);
        return Ok(());
    }
    let mut wrong = vec![];
    for j in 0..4 {
        let t = probe_with(s, y_turn(j)).cubie()?;
        if !corner_ok(&t.cp, &t.co, 0) {
            wrong.push(j);
        }
    }
    for &j in &wrong {
        let t = probe_with(s, y_turn(j)).cubie()?;
        if t.cp[0] == 0 {
            let alg = if t.co[0] == 1 { SLOT_RIGHT } else { SLOT_FRONT };
            s.apply(y_turn(j)).apply(alg);
            return Ok(());
        }
    }
    let j = *wrong.first().ok_or(SolveError("뺄 코너가 없다"))?;
    s.apply(y_turn(j)).apply(TRIGGER);
    Ok(())
}

pub(crate) fn corners_taught(s: &mut Solve) -> R<()> {
    for iter in 0.. {
        guard(iter, 20, "첫 층 꼭짓점 단계가 끝나지 않는다")?;
        let c = s.cubie()?;
        if (0..4).all(|i| corner_ok(&c.cp, &c.co, i)) {
            return Ok(());
        }
        s.look();
        corner_shortcut_step(s)?;
    }
    Ok(())
}

// ── 둘째 층(흰 면 아래, 늘 앞-오른쪽 칸) ──────────────────

pub(crate) fn middle_taught(s: &mut Solve) -> R<()> {
    let ok = |ep: &[u8], eo: &[u8], i: usize| ep[i] as usize == i && eo[i] == 0;
    for iter in 0.. {
        guard(iter, 20, "둘째 층 단계가 끝나지 않는다")?;
        let c = s.cubie()?;
        if (8..12).all(|i| ok(&c.ep, &c.eo, i)) {
            return Ok(());
        }
        s.look();
        let mut best: Option<(String, &str)> = None;
        for k in 0..4 {
            for a in 0..4 {
                let pre = join(&[y_turn(k), u_turn(a)]);
                let t = probe_with(s, &pre);
                let r = t.rel();
                let ep = t.cubie()?.ep;
                let alg = if ep[1] >= 8 && r[19] == 2 && r[7] == 1 {
                    MIDDLE_FROM_FRONT
                } else if ep[0] >= 8 && r[10] == 1 && r[5] == 2 {
                    MIDDLE_FROM_RIGHT
                } else {
                    continue;
                };
                if best.as_ref().is_none_or(|b| alg_len(&pre) < alg_len(&b.0)) {
                    best = Some((pre, alg));
                }
            }
        }
        if let Some((pre, alg)) = best {
            s.apply(&pre).apply(alg);
            continue;
        }
        let mut k = None;
        for x in 0..4 {
            let t = probe_with(s, y_turn(x)).cubie()?;
            if !ok(&t.ep, &t.eo, 8) {
                k = Some(x);
                break;
            }
        }
        let k = k.ok_or(SolveError("뺄 엣지가 없다"))?;
        s.apply(y_turn(k)).apply(MIDDLE_FROM_FRONT);
    }
    Ok(())
}

// ── 마지막 층 ───────────────────────────────────────────

pub(crate) fn yellow_cross_taught(s: &mut Solve) -> R<()> {
    for iter in 0.. {
        guard(iter, 2, "노란 십자 단계가 끝나지 않는다")?;
        let r0 = s.rel();
        if [1, 3, 5, 7].iter().all(|&i| r0[i] == U) {
            return Ok(());
        }
        s.look();
        let mut next: Option<String> = None;
        for a in 0..4 {
            let r = probe_with(s, u_turn(a)).rel();
            let up = |i: usize| r[i] == U;
            if up(3) && up(5) && !up(1) && !up(7) {
                next = Some(join(&[u_turn(a), EO]));
            } else if up(1) && up(3) && !up(5) && !up(7) {
                next = Some(join(&[u_turn(a), EO_BACK]));
            }
            if next.is_some() {
                break;
            }
        }
        s.apply(next.as_deref().unwrap_or(EO));
    }
    Ok(())
}

fn edge_sides_matched(rel: &[u8]) -> [bool; 4] {
    CROSS_SIDE.map(|i| rel[i] == face_of(i))
}

pub(crate) fn ll_edges_taught(s: &mut Solve) -> R<()> {
    for iter in 0.. {
        guard(iter, 2, "옆면 맞추기 단계가 끝나지 않는다")?;
        if let Some(all) = (0..4).find(|&a| {
            edge_sides_matched(&probe_with(s, u_turn(a)).rel())
                .iter()
                .all(|&x| x)
        }) {
            s.apply(u_turn(all));
            return Ok(());
        }
        s.look();
        let a = (0..4)
            .find(|&a| {
                edge_sides_matched(&probe_with(s, u_turn(a)).rel())
                    .iter()
                    .filter(|&&x| x)
                    .count()
                    >= 2
            })
            .ok_or(SolveError("옆색이 맞은 모서리 둘을 찾지 못했다"))?;
        s.apply(u_turn(a));
        let k = (0..4)
            .find(|&k| {
                let m = edge_sides_matched(&probe_with(s, y_turn(k)).rel());
                (m[0] && m[3]) || (m[1] && m[3] && !m[0] && !m[2])
            })
            .ok_or(SolveError("옆면 맞추기를 쥘 자리가 없다"))?;
        s.apply(y_turn(k)).apply(EDGE_SWAP);
    }
    Ok(())
}

fn placed_top(s: &Solve) -> R<usize> {
    let cp = s.cubie()?.cp;
    Ok((0..4).filter(|&j| cp[j] as usize == j).count())
}

fn cycle_around(s: &mut Solve, back: bool) -> R<()> {
    let mut k = None;
    for x in 0..4 {
        if probe_with(s, y_turn(x)).cubie()?.cp[0] == 0 {
            k = Some(x);
            break;
        }
    }
    let k = k.ok_or(SolveError("제자리 꼭짓점을 찾지 못했다"))?;
    s.apply(y_turn(k));
    let behind = s.cubie()?.cp[1] == 2;
    s.apply(if back && behind {
        CORNER_CYCLE_BACK
    } else {
        CORNER_CYCLE
    });
    Ok(())
}

pub(crate) fn ll_corner_place_taught(s: &mut Solve) -> R<()> {
    for iter in 0.. {
        guard(iter, 2, "꼭짓점 자리 단계가 끝나지 않는다")?;
        let placed = placed_top(s)?;
        if placed == 4 {
            return Ok(());
        }
        s.look();
        if placed == 1 {
            cycle_around(s, true)?;
            continue;
        }
        if placed != 0 {
            return Err(SolveError("제자리 꼭짓점 수가 맞지 않는다"));
        }
        s.apply(CORNER_CYCLE);
    }
    Ok(())
}

pub(crate) fn ll_corner_twist_taught(s: &mut Solve, back: bool) -> R<()> {
    for iter in 0.. {
        guard(iter, 4, "꼭짓점 방향 단계가 끝나지 않는다")?;
        let c = s.cubie()?;
        if (0..4).all(|j| c.co[j] == 0) {
            break;
        }
        s.look();
        let mut a = None;
        for x in 0..4 {
            if probe_with(s, u_turn(x)).cubie()?.co[0] != 0 {
                a = Some(x);
                break;
            }
        }
        let a = a.ok_or(SolveError("돌릴 꼭짓점이 없다"))?;
        s.apply(u_turn(a));
        if back {
            let f = if s.cubie()?.co[0] == 1 {
                TRIGGER
            } else {
                TRIGGER_BACK
            };
            s.apply(&format!("{f} {f}"));
            continue;
        }
        let piece = s.cubie()?.cp[0];
        for r in 0.. {
            guard(r, 4, "꼭짓점 돌리기 단계가 끝나지 않는다")?;
            let t = s.cubie()?;
            if r > 0 && t.cp[0] == piece && t.co[0] == 0 {
                break;
            }
            s.apply(TRIGGER);
        }
    }
    let a = (0..4)
        .find(|&a| probe_with(s, u_turn(a)).is_solved())
        .ok_or(SolveError("꼭짓점 방향 뒤에 맞지 않았다"))?;
    s.apply(u_turn(a));
    Ok(())
}

/// 3×3 초보자, 배우는 방식(사이트 `solveBeginner3(state, { taught: true })`, 첫 면 흰색)
pub fn solve_beginner3_taught(state: &State) -> R<HumanSolve> {
    let mut s = Solve::new(3, face_colors(3, state), None);
    s.look_barrier = true;
    white_up(&mut s)?;
    cross_taught(&mut s)?;
    s.stage(StageName::Cross);
    corners_taught(&mut s)?;
    s.apply("z2");
    s.stage(StageName::Corners);
    middle_taught(&mut s)?;
    s.stage(StageName::Middle);
    yellow_cross_taught(&mut s)?;
    s.stage(StageName::Eo);
    ll_edges_taught(&mut s)?;
    s.stage(StageName::LlEdges);
    ll_corner_place_taught(&mut s)?;
    s.stage(StageName::LlCornerPlace);
    ll_corner_twist_taught(&mut s, true)?;
    s.stage(StageName::LlCornerTwist);
    finish(&s)
}

// ── 2×2(홈 시연 「초보자 해법」, 사이트 `solveBeginner2(state, { taught: true })`) ─────

/// 2×2 코너 자리(사이트 `cornerPlace2Taught`): U를 돌려 제자리가 꼭 하나인 자리를 앞-오른쪽 위에 쥐고 공식,
/// 그런 자리가 없으면 제자리가 0인 자리에서 한 번
fn corner_place2_taught(s: &mut Solve) -> R<()> {
    for iter in 0.. {
        guard(iter, 3, "꼭짓점 자리 단계가 끝나지 않는다")?;
        let mut counts = [0usize; 4];
        for (a, c) in counts.iter_mut().enumerate() {
            *c = placed_top(&probe_with(s, u_turn(a)))?;
        }
        if let Some(all) = counts.iter().position(|&c| c == 4) {
            s.apply(u_turn(all));
            return Ok(());
        }
        s.look();
        if let Some(one) = counts.iter().position(|&c| c == 1) {
            s.apply(u_turn(one));
            cycle_around(s, false)?;
            continue;
        }
        let zero = counts
            .iter()
            .position(|&c| c == 0)
            .ok_or(SolveError("제자리가 없는 U 자리를 찾지 못했다"))?;
        s.apply(u_turn(zero)).apply(CORNER_CYCLE);
    }
    Ok(())
}

/// 2×2 초보자, 배우는 방식(첫 면 흰색): 첫 층을 흰 면 위에서 지름길로 → z2 → 코너 자리 → 코너 방향
pub fn solve_beginner2_taught(state: &State) -> R<HumanSolve> {
    let mut s = crate::human::start2(state, 0)?;
    s.look_barrier = true;
    s.apply("z2");
    corners_taught(&mut s)?;
    s.apply("z2");
    s.stage(StageName::FirstLayer);
    corner_place2_taught(&mut s)?;
    s.stage(StageName::LlCornerPlace);
    ll_corner_twist_taught(&mut s, false)?;
    s.stage(StageName::LlCornerTwist);
    finish(&s)
}
