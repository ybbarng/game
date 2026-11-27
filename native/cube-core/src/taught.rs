//! 배우는 방식 3×3 초보자 해법(홈 시연 「초보자 해법」, 사이트 `packages/cube-ai` `solveBeginner3(state, { taught: true })`).
//!
//! 옮긴 원본: `methods.ts` `BEGINNER3_TAUGHT_STEPS`, `taught.ts`(흰 면 위 십자는 3×3 처음 맞추기 강의 길 그대로,
//! 첫 층 코너 지름길·둘째 층 앞-오른쪽 칸·마지막 층 노란 십자 → 옆면 맞추기 → 코너 자리 → 코너 방향).
//! 같은 상태면 사이트와 같은 수가 나온다(공통 시험 자료 `fixtures/hero-show.json`).
//!
//! 흐름: 흰 면을 위로 들고(맞추는 면은 돌리지 않는다) 넣을 조각을 아랫면으로 빼서 칸 밑에 둔 뒤 정해진 수로 넣는다.
//! 첫 층이 끝나면 z2로 뒤집어 둘째 층·마지막 층을 맞춘다. 살피는 자리 앞뒤의 수는 합치지 않는다(`look_barrier`).

use crate::human::{finish, u_turn, HumanSolve, Solve, SolveError, StageName, EDGE_FACELETS, R};
use crate::state::{face_colors, State};

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

// 흰 십자(사이트 `taught.ts`, 3×3 처음 맞추기 강의 `beginner-path.ts` 흰 십자와 같은 길, docs/47 16-34): 넣을 엣지
// 블럭은 짝 색 센터를 앞으로 쥐고(y) 아래 층에서 올린다. 아래 층 흰색 아래는 D로 아래-앞에 두고 F2, 흰색 옆은
// 아래-오른쪽에 두고 R F' R'. 가운데 층은 앞-오른쪽에 쥐고 R' D' R, 위 층은 위-앞에 쥐고 F2로 내린 뒤 올린다.

const CROSS_UP: &str = "F2";
const CROSS_SIDE_UP: &str = "R F' R'";
const CROSS_MIDDLE_DOWN: &str = "R' D' R";
const CROSS_TOP_DOWN: &str = "F2";
/// 쥐기를 찾는 차례(사이트 `Y4`·`D4`)
const Y4: [&str; 4] = ["", "y", "y'", "y2"];
const D4: [&str; 4] = ["", "D", "D'", "D2"];
/// 옆 색 차례: 초록·빨강·파랑·주황(사이트 `SIDE_COLORS`)
const SIDE_COLORS: [u8; 4] = [2, 1, 5, 4];

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
enum CrossCase {
    Down,
    DownSide,
    Middle,
    Top,
}

/// 흰-`color` 엣지 블럭의 흰 스티커·짝 색 스티커가 보는 면
fn white_edge_at(t: &Solve, color: u8) -> (u8, u8) {
    for [a, b] in EDGE_FACELETS {
        if t.f[a] == U && t.f[b] == color {
            return (face_of(a), face_of(b));
        }
        if t.f[b] == U && t.f[a] == color {
            return (face_of(b), face_of(a));
        }
    }
    unreachable!("흰 엣지 블럭이 없다")
}

/// 그 색 센터가 있는 면
fn center_face(t: &Solve, color: u8) -> u8 {
    (0..6u8)
        .find(|&k| t.f[k as usize * 9 + 4] == color)
        .unwrap_or(6)
}

fn cross_edge_ok(t: &Solve, color: u8) -> bool {
    let (wf, cf) = white_edge_at(t, color);
    wf == center_face(t, U) && cf == center_face(t, color)
}

fn edge_is_at(t: &Solve, color: u8, faces: [u8; 2]) -> bool {
    let (wf, cf) = white_edge_at(t, color);
    faces.contains(&wf) && faces.contains(&cf)
}

fn first_turn(s: &Solve, turns: &[&'static str], ok: impl Fn(&Solve) -> bool) -> R<&'static str> {
    turns
        .iter()
        .copied()
        .find(|x| ok(&probe_with(s, x)))
        .ok_or(SolveError("쥘 방향을 찾지 못했다"))
}

/// 흰 십자 한 걸음(사이트 `crossStep`): 경우, 쥐는 수, 공식
fn cross_step(s: &Solve, color: u8) -> R<(CrossCase, String, &'static str)> {
    const F: u8 = 2;
    const RR: u8 = 1;
    let (wf, cf) = white_edge_at(s, color);
    if wf == D || cf == D {
        let side = cf == D;
        let y = first_turn(s, &Y4, |t| center_face(t, color) == F)?;
        let d = first_turn(&probe_with(s, y), &D4, |t| {
            edge_is_at(t, color, [D, if side { RR } else { F }])
        })?;
        let hold = join(&[y, d]);
        return Ok(if side {
            (CrossCase::DownSide, hold, CROSS_SIDE_UP)
        } else {
            (CrossCase::Down, hold, CROSS_UP)
        });
    }
    if wf != U && cf != U {
        let y = first_turn(s, &Y4, |t| edge_is_at(t, color, [F, RR]))?;
        return Ok((CrossCase::Middle, y.to_string(), CROSS_MIDDLE_DOWN));
    }
    let y = first_turn(s, &Y4, |t| edge_is_at(t, color, [U, F]))?;
    Ok((CrossCase::Top, y.to_string(), CROSS_TOP_DOWN))
}

/// 그 엣지 블럭을 제자리에 넣을 때까지의 걸음(가운데·위 층이면 내리고 아래 층에서 올린다)
fn cross_piece(s: &Solve, color: u8) -> R<String> {
    let mut t = s.probe();
    let mut parts: Vec<String> = vec![];
    for i in 0.. {
        if cross_edge_ok(&t, color) {
            break;
        }
        guard(i, 1, "흰 엣지 블럭이 두 걸음 안에 들지 않는다")?;
        let (_, hold, alg) = cross_step(&t, color)?;
        let moves = join(&[&hold, alg]);
        t.apply(&moves);
        parts.push(moves);
    }
    Ok(parts.join(" "))
}

/// 다음에 넣을 흰 엣지 하나의 수(사이트 `nextCrossEdge`). 아래 층 블럭부터, 같은 경우 안에서는 수가 적은 것,
/// 같으면 초록·빨강·파랑·주황 차례. 십자가 다 됐으면 None
fn next_cross_edge(s: &Solve) -> R<Option<String>> {
    let mut best: Option<(CrossCase, String)> = None;
    for c in SIDE_COLORS {
        if cross_edge_ok(s, c) {
            continue;
        }
        let kind = cross_step(s, c)?.0;
        let alg = cross_piece(s, c)?;
        let better = match &best {
            None => true,
            Some((k, b)) => kind < *k || (kind == *k && alg_len(&alg) < alg_len(b)),
        };
        if better {
            best = Some((kind, alg));
        }
    }
    Ok(best.map(|b| b.1))
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

/// 십자 자리(UR UF UL UB)의 옆 스티커
const CROSS_SIDE: [usize; 4] = [10, 19, 37, 46];

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
