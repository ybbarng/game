//! 혼자 맞추기의 진행 판정(`packages/cube-engine/src/solve-progress.ts`): 조각 점수·큰 큐브 센터·엣지 짝, 막대 값,
//! 흐름 콤보의 진행 칸(`flowScore`), 이정표. 모두 지금 보이는 색만 보는 순수 함수라 큐브를 어떻게 들든 같은 값이다.

use std::collections::HashMap;
use std::sync::OnceLock;

use crate::notation::CubeMove;
use crate::state::{apply_move, face_colors, is_solved, rotated_solved, State};
use crate::topology::{
    cube_rotations, cube_topology, PieceKind, MAX_SIZE, MIN_SIZE, OPPOSITE_FACE,
};

/// frame[f] = 자리 면 f에 있어야 할 색
type Frame = [u8; 6];

fn all_frames(n: usize) -> &'static [Frame] {
    static CACHE: OnceLock<Vec<Vec<Frame>>> = OnceLock::new();
    let all = CACHE.get_or_init(|| {
        (MIN_SIZE..=MAX_SIZE)
            .map(|n| {
                let nn = n * n;
                cube_rotations()
                    .iter()
                    .map(|g| {
                        let c = face_colors(n, &rotated_solved(n, g));
                        std::array::from_fn(|f| c[f * nn])
                    })
                    .collect()
            })
            .collect()
    });
    &all[n - MIN_SIZE]
}

/// 홀수 크기: 면 정가운데 색 하나. 짝수 크기: 24가지 모두
fn frames_of(n: usize, colors: &[u8]) -> Vec<Frame> {
    if n % 2 == 0 {
        return all_frames(n).to_vec();
    }
    let nn = n * n;
    let mid = (nn - 1) / 2;
    vec![std::array::from_fn(|f| colors[f * nn + mid])]
}

/// 점수에 세는 조각(스티커 묶음): 코너, 3×3 엣지, 큰 큐브는 엣지 한 줄
struct Unit {
    stickers: Vec<usize>,
    faces: Vec<usize>,
    /// 닿은 면(서로 다른 것만, 작은 차례)
    sides: Vec<usize>,
}

fn unit_of(stickers: Vec<usize>, face_of: impl Fn(usize) -> usize) -> Unit {
    let faces: Vec<usize> = stickers.iter().map(|&s| face_of(s)).collect();
    let mut sides = faces.clone();
    sides.sort_unstable();
    sides.dedup();
    Unit {
        stickers,
        faces,
        sides,
    }
}

fn units_of(n: usize) -> &'static [Unit] {
    static CACHE: OnceLock<Vec<Vec<Unit>>> = OnceLock::new();
    let all = CACHE.get_or_init(|| (MIN_SIZE..=MAX_SIZE).map(build_units).collect());
    &all[n - MIN_SIZE]
}

fn build_units(n: usize) -> Vec<Unit> {
    let topo = cube_topology(n);
    let face_of = |s: usize| topo.stickers[s].face;
    let mut out = Vec::new();
    // 줄 열쇠(닿은 면들) → 스티커, 처음 나온 차례
    let mut lines: Vec<(Vec<usize>, Vec<usize>)> = Vec::new();
    for p in &topo.pieces {
        let edge3 = n == 3 && p.kind == PieceKind::Edge;
        if p.kind == PieceKind::Corner || edge3 {
            out.push(unit_of(p.stickers.clone(), face_of));
        } else if matches!(p.kind, PieceKind::Edge | PieceKind::Wing) {
            let mut key: Vec<usize> = p.stickers.iter().map(|&s| face_of(s)).collect();
            key.sort_unstable();
            match lines.iter_mut().find(|(k, _)| *k == key) {
                Some((_, list)) => list.extend(&p.stickers),
                None => lines.push((key, p.stickers.clone())),
            }
        }
    }
    for (_, stickers) in lines {
        out.push(unit_of(stickers, face_of));
    }
    out
}

fn unit_ok(u: &Unit, colors: &[u8], frame: &Frame) -> bool {
    u.stickers
        .iter()
        .zip(&u.faces)
        .all(|(&s, &f)| colors[s] == frame[f])
}

/// 면마다 한 색으로 묶였는가(면 → 색, 묶이지 않으면 None)
fn colors_by_face(u: &Unit, colors: &[u8]) -> Option<Vec<(usize, u8)>> {
    let mut by_face: Vec<(usize, u8)> = Vec::with_capacity(3);
    for (&s, &f) in u.stickers.iter().zip(&u.faces) {
        let c = colors[s];
        match by_face.iter().find(|(face, _)| *face == f) {
            None => by_face.push((f, c)),
            Some(&(_, seen)) if seen != c => return None,
            _ => {}
        }
    }
    Some(by_face)
}

fn unit_placed(u: &Unit, colors: &[u8], frame: &Frame) -> bool {
    let Some(by_face) = colors_by_face(u, colors) else {
        return false;
    };
    let mut have: Vec<u8> = by_face.iter().map(|&(_, c)| c).collect();
    have.sort_unstable();
    let mut want: Vec<u8> = u.sides.iter().map(|&f| frame[f]).collect();
    want.sort_unstable();
    have == want
}

/// 자리 면 f의 바깥 한 층을 k번(시계) 돌리는 수
fn outer_turn(n: usize, f: usize, k: u8) -> CubeMove {
    const AXIS_OF: [u8; 6] = [1, 0, 2, 1, 0, 2];
    let plus = f < 3;
    CubeMove {
        axis: AXIS_OF[f],
        from: if plus { 1 } else { n },
        to: if plus { 1 } else { n },
        turns: if plus { k } else { 4 - k },
    }
}

fn with_one_face_turned(n: usize, state: &State) -> Vec<State> {
    let mut out = vec![state.clone()];
    for f in 0..6 {
        for k in 1..=3 {
            out.push(apply_move(n, state, &outer_turn(n, f, k)));
        }
    }
    out
}

/// 조각 점수(사이트 `PieceScore`)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PieceScore {
    /// 방향까지 1점, 자리만 0.5점. 다 맞지 않았으면 만점보다 0.5점 아래에서 멈춘다
    pub score: f64,
    /// 만점(3×3 20, 2×2 8, 큰 큐브 20)
    pub max: f64,
    pub placed: i32,
    pub oriented: i32,
}

/// 조각 점수(사이트 `pieceScore`)
pub fn piece_score(n: usize, state: &State) -> PieceScore {
    let units = units_of(n);
    let max = units.len() as f64;
    let (mut placed_best, mut oriented_best) = (-1i32, -1i32);
    let mut best_value = -1i32;
    for s in with_one_face_turned(n, state) {
        let colors = face_colors(n, &s);
        for frame in frames_of(n, &colors) {
            let (mut placed, mut oriented) = (0, 0);
            for u in units {
                if unit_ok(u, &colors, &frame) {
                    placed += 1;
                    oriented += 1;
                } else if unit_placed(u, &colors, &frame) {
                    placed += 1;
                }
            }
            let v = placed + oriented;
            if v > best_value || (v == best_value && oriented > oriented_best) {
                best_value = v;
                placed_best = placed;
                oriented_best = oriented;
            }
        }
    }
    let raw = f64::from(best_value) / 2.0;
    let score = if is_solved(n, state) {
        max
    } else {
        raw.min(max - 0.5)
    };
    PieceScore {
        score,
        max,
        placed: placed_best,
        oriented: oriented_best,
    }
}

/// 센터 블럭이 모두 한 색인 면 수(0~6). 3×3 이하는 늘 6
pub fn solved_center_faces(n: usize, state: &State) -> u32 {
    if n <= 3 {
        return 6;
    }
    let topo = cube_topology(n);
    let colors = face_colors(n, state);
    // 면 → 색(-1 = 섞임), 처음 나온 차례
    let mut by_face: Vec<(usize, i32)> = Vec::new();
    for p in &topo.pieces {
        if !matches!(p.kind, PieceKind::Center | PieceKind::InnerCenter) {
            continue;
        }
        for &s in &p.stickers {
            let f = topo.stickers[s].face;
            let c = i32::from(colors[s]);
            match by_face.iter_mut().find(|(face, _)| *face == f) {
                None => by_face.push((f, c)),
                Some((_, seen)) if *seen != c => *seen = -1,
                _ => {}
            }
        }
    }
    by_face.iter().filter(|(_, c)| *c != -1).count() as u32
}

/// 두 면 모두 한 색으로 묶인 엣지 줄 수(0~12). 3×3 이하는 늘 12
pub fn paired_edge_lines(n: usize, state: &State) -> u32 {
    if n <= 3 {
        return 12;
    }
    let colors = face_colors(n, state);
    units_of(n)
        .iter()
        .filter(|u| u.sides.len() == 2 && colors_by_face(u, &colors).is_some())
        .count() as u32
}

/// 지금 보여 줄 숫자
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProgressFocus {
    Centers,
    Edges,
    Pieces,
}

/// 막대 하나로 보일 진행(사이트 `SolveProgress`)
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SolveProgress {
    /// 막대 값(0~1). 맞춘 큐브만 1
    pub value: f64,
    pub pieces: PieceScore,
    pub centers: u32,
    pub pairs: u32,
    pub focus: ProgressFocus,
}

/// 사이트 `solveProgress`
pub fn solve_progress(n: usize, state: &State) -> SolveProgress {
    let pieces = piece_score(n, state);
    if n <= 3 {
        return SolveProgress {
            value: pieces.score / pieces.max,
            pieces,
            centers: 6,
            pairs: 12,
            focus: ProgressFocus::Pieces,
        };
    }
    let centers = solved_center_faces(n, state);
    let pairs = paired_edge_lines(n, state);
    let value = if is_solved(n, state) {
        1.0
    } else {
        ((f64::from(centers) / 6.0 + f64::from(pairs) / 12.0 + pieces.score / pieces.max) / 3.0)
            .min(0.99)
    };
    SolveProgress {
        value,
        pieces,
        centers,
        pairs,
        focus: if centers < 6 {
            ProgressFocus::Centers
        } else if pairs < 12 {
            ProgressFocus::Edges
        } else {
            ProgressFocus::Pieces
        },
    }
}

// ── 흐름 콤보의 진행 칸 ─────────────────────────────────

struct FlowGroups {
    centers: Vec<Vec<usize>>,
    lines: Vec<Vec<(usize, usize)>>,
}

fn flow_groups(n: usize) -> &'static FlowGroups {
    static CACHE: OnceLock<Vec<FlowGroups>> = OnceLock::new();
    let all = CACHE.get_or_init(|| {
        (MIN_SIZE..=MAX_SIZE)
            .map(|n| {
                let topo = cube_topology(n);
                let face_of = |s: usize| topo.stickers[s].face;
                let mut centers = vec![Vec::new(); 6];
                let mut lines: Vec<((usize, usize), Vec<(usize, usize)>)> = Vec::new();
                for p in &topo.pieces {
                    match p.kind {
                        PieceKind::Center | PieceKind::InnerCenter => {
                            for &s in &p.stickers {
                                centers[face_of(s)].push(s);
                            }
                        }
                        PieceKind::Edge | PieceKind::Wing => {
                            let (mut a, mut b) = (p.stickers[0], p.stickers[1]);
                            if face_of(b) < face_of(a) {
                                std::mem::swap(&mut a, &mut b);
                            }
                            let key = (face_of(a), face_of(b));
                            match lines.iter_mut().find(|(k, _)| *k == key) {
                                Some((_, l)) => l.push((a, b)),
                                None => lines.push((key, vec![(a, b)])),
                            }
                        }
                        PieceKind::Corner => {}
                    }
                }
                FlowGroups {
                    centers,
                    lines: lines.into_iter().map(|(_, l)| l).collect(),
                }
            })
            .collect()
    });
    &all[n - MIN_SIZE]
}

fn most_common(values: impl Iterator<Item = u32>) -> u32 {
    let mut count: HashMap<u32, u32> = HashMap::new();
    let mut best = 0;
    for v in values {
        let c = count.entry(v).or_insert(0);
        *c += 1;
        best = best.max(*c);
    }
    best
}

/// 흐름 콤보가 「나아갔나」를 보는 진행 칸(사이트 `flowScore`). `pieces`는 이미 센 조각 점수
pub fn flow_score(n: usize, state: &State, pieces: &PieceScore) -> u32 {
    let half = (pieces.score * 2.0).round() as u32;
    if n <= 3 {
        return half;
    }
    let colors = face_colors(n, state);
    let g = flow_groups(n);
    let centers: u32 = g
        .centers
        .iter()
        .map(|face| most_common(face.iter().map(|&s| u32::from(colors[s]))))
        .sum();
    let pairs: u32 = g
        .lines
        .iter()
        .map(|line| {
            most_common(
                line.iter()
                    .map(|&(a, b)| u32::from(colors[a]) * 8 + u32::from(colors[b])),
            ) - 1
        })
        .sum();
    half + centers + pairs
}

// ── 이정표 ────────────────────────────────────────────

/// 이정표 id(사이트 `MilestoneId`)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Milestone {
    Centers,
    Edges,
    Cross,
    F2l1,
    F2l2,
    F2l3,
    Layer1,
    Layer2,
    Oll,
    Ll,
    Roux1,
    Roux2,
    Eoline,
    Corners,
}

impl Milestone {
    /// 사이트 `MILESTONES`의 차례
    pub const ALL: [Milestone; 14] = [
        Milestone::Centers,
        Milestone::Edges,
        Milestone::Cross,
        Milestone::F2l1,
        Milestone::F2l2,
        Milestone::F2l3,
        Milestone::Layer1,
        Milestone::Layer2,
        Milestone::Oll,
        Milestone::Roux1,
        Milestone::Roux2,
        Milestone::Eoline,
        Milestone::Corners,
        Milestone::Ll,
    ];

    /// 저장 글의 id(구간 기록 "cross@3210")
    pub fn id(self) -> &'static str {
        match self {
            Milestone::Centers => "centers",
            Milestone::Edges => "edges",
            Milestone::Cross => "cross",
            Milestone::F2l1 => "f2l1",
            Milestone::F2l2 => "f2l2",
            Milestone::F2l3 => "f2l3",
            Milestone::Layer1 => "layer1",
            Milestone::Layer2 => "layer2",
            Milestone::Oll => "oll",
            Milestone::Ll => "ll",
            Milestone::Roux1 => "roux1",
            Milestone::Roux2 => "roux2",
            Milestone::Eoline => "eoline",
            Milestone::Corners => "corners",
        }
    }

    /// 칩 이름(사이트 `milestoneLabel`)
    pub fn label(self) -> &'static str {
        match self {
            Milestone::Centers => "센터",
            Milestone::Edges => "엣지 짝",
            Milestone::Cross => "십자",
            Milestone::F2l1 => "F2L 1/4",
            Milestone::F2l2 => "F2L 2/4",
            Milestone::F2l3 => "F2L 3/4",
            Milestone::Layer1 => "첫 층",
            Milestone::Layer2 => "둘째 층",
            Milestone::Oll => "윗면",
            Milestone::Ll => "윗층",
            Milestone::Roux1 => "첫 블록",
            Milestone::Roux2 => "둘째 블록",
            Milestone::Eoline => "EOLine",
            Milestone::Corners => "코너 8",
        }
    }

    pub fn from_id(id: &str) -> Option<Milestone> {
        Milestone::ALL.into_iter().find(|m| m.id() == id)
    }
}

/// 그 크기에서 켜질 수 있는 이정표(차례대로)
pub fn milestones_for(n: usize) -> Vec<Milestone> {
    use Milestone::*;
    match n {
        2 => vec![Layer1, Oll, Ll],
        3 => Milestone::ALL
            .into_iter()
            .filter(|m| !matches!(m, Centers | Edges))
            .collect(),
        _ => vec![Centers, Edges, Ll],
    }
}

struct Pieces3 {
    edges_on: Vec<Vec<usize>>,
    corners_on: Vec<Vec<usize>>,
    edge_between: HashMap<Vec<usize>, usize>,
    corner_between: HashMap<Vec<usize>, usize>,
}

fn pieces3() -> &'static Pieces3 {
    static CACHE: OnceLock<Pieces3> = OnceLock::new();
    CACHE.get_or_init(|| {
        let mut p = Pieces3 {
            edges_on: vec![Vec::new(); 6],
            corners_on: vec![Vec::new(); 6],
            edge_between: HashMap::new(),
            corner_between: HashMap::new(),
        };
        for (i, u) in units_of(3).iter().enumerate() {
            if u.sides.len() == 2 {
                p.edge_between.insert(u.sides.clone(), i);
                for &f in &u.sides {
                    p.edges_on[f].push(i);
                }
            } else {
                p.corner_between.insert(u.sides.clone(), i);
                for &f in &u.sides {
                    p.corners_on[f].push(i);
                }
            }
        }
        p
    })
}

fn key_of(faces: &[usize]) -> Vec<usize> {
    let mut k = faces.to_vec();
    k.sort_unstable();
    k
}

fn perpendicular(a: usize, b: usize) -> [usize; 2] {
    let c = 3 - a % 3 - b % 3;
    [c, c + 3]
}

fn face_is(colors: &[u8], f: usize, color: u8) -> bool {
    (0..9).all(|k| colors[f * 9 + k] == color)
}

fn layer_milestones(colors: &[u8], frame: &Frame, out: &mut Vec<Milestone>) {
    let p = pieces3();
    let units = units_of(3);
    let ok = |i: usize| unit_ok(&units[i], colors, frame);
    for f in 0..6 {
        if !p.edges_on[f].iter().all(|&i| ok(i)) {
            continue;
        }
        out.push(Milestone::Cross);
        let top = OPPOSITE_FACE[f];
        let (mut pairs, mut corners) = (0, 0);
        for &c in &p.corners_on[f] {
            if !ok(c) {
                continue;
            }
            corners += 1;
            let sides: Vec<usize> = units[c].sides.iter().copied().filter(|&x| x != f).collect();
            if let Some(&edge) = p.edge_between.get(&key_of(&sides)) {
                if ok(edge) {
                    pairs += 1;
                }
            }
        }
        if pairs >= 1 {
            out.push(Milestone::F2l1);
        }
        if pairs >= 2 {
            out.push(Milestone::F2l2);
        }
        if pairs >= 3 {
            out.push(Milestone::F2l3);
        }
        if corners == 4 {
            out.push(Milestone::Layer1);
        }
        if pairs == 4 {
            out.push(Milestone::Layer2);
            if face_is(colors, top, frame[top]) {
                out.push(Milestone::Oll);
            }
        }
    }
}

fn block_pieces(s: usize, d: usize) -> Vec<usize> {
    let p = pieces3();
    let [a, b] = perpendicular(s, d);
    [
        p.edge_between.get(&key_of(&[s, d])),
        p.edge_between.get(&key_of(&[s, a])),
        p.edge_between.get(&key_of(&[s, b])),
        p.corner_between.get(&key_of(&[s, d, a])),
        p.corner_between.get(&key_of(&[s, d, b])),
    ]
    .into_iter()
    .flatten()
    .copied()
    .collect()
}

fn roux_milestones(state: &State, out: &mut Vec<Milestone>) {
    let units = units_of(3);
    for axis in 0u8..3 {
        let sides: [usize; 2] = match axis {
            0 => [1, 4],
            1 => [0, 3],
            _ => [2, 5],
        };
        for k in 0u8..4 {
            let s = if k == 0 {
                state.clone()
            } else {
                apply_move(
                    3,
                    state,
                    &CubeMove {
                        axis,
                        from: 2,
                        to: 2,
                        turns: k,
                    },
                )
            };
            let colors = face_colors(3, &s);
            let frame = frames_of(3, &colors)[0];
            let ok = |i: usize| unit_ok(&units[i], &colors, &frame);
            for d in 0..6 {
                if d % 3 == sides[0] % 3 {
                    continue;
                }
                let first = sides
                    .iter()
                    .filter(|&&side| block_pieces(side, d).into_iter().all(ok))
                    .count();
                if first >= 1 {
                    out.push(Milestone::Roux1);
                }
                if first == 2 {
                    out.push(Milestone::Roux2);
                }
            }
        }
    }
}

fn edges_oriented(colors: &[u8], frame: &Frame, a: usize) -> bool {
    let axis_a = a % 3;
    let axis_p = (axis_a + 1) % 3;
    let mut home: HashMap<u8, usize> = HashMap::new();
    for (f, &c) in frame.iter().enumerate() {
        home.insert(c, f);
    }
    for u in units_of(3) {
        if u.sides.len() != 2 {
            continue;
        }
        let slot_prime = |i: usize| u.faces[i] % 3 == axis_p;
        let slot_idx = if slot_prime(0) {
            0
        } else if slot_prime(1) || u.faces[0] % 3 != axis_a {
            1
        } else {
            0
        };
        let home_of = |i: usize| home.get(&colors[u.stickers[i]]).copied();
        let piece_p = |i: usize| home_of(i).is_some_and(|h| h % 3 == axis_p);
        let piece_idx = if piece_p(0) {
            0
        } else if piece_p(1) || !home_of(0).is_some_and(|h| h % 3 == axis_a) {
            1
        } else {
            0
        };
        if slot_idx != piece_idx {
            return false;
        }
    }
    true
}

fn eoline_milestone(colors: &[u8], frame: &Frame, out: &mut Vec<Milestone>) {
    let p = pieces3();
    let units = units_of(3);
    let ok = |i: Option<&usize>| i.is_some_and(|&i| unit_ok(&units[i], colors, frame));
    for a in 0..3 {
        let line = (0..6).any(|d| {
            d % 3 != a
                && ok(p.edge_between.get(&key_of(&[d, a])))
                && ok(p.edge_between.get(&key_of(&[d, a + 3])))
        });
        if line && edges_oriented(colors, frame, a) {
            out.push(Milestone::Eoline);
            return;
        }
    }
}

fn corners_milestone(n: usize, colors: &[u8], out: &mut Vec<Milestone>) {
    let units = units_of(n);
    let ok = all_frames(n).iter().any(|fr| {
        units
            .iter()
            .filter(|u| u.sides.len() == 3)
            .all(|u| unit_ok(u, colors, fr))
    });
    if ok {
        out.push(Milestone::Corners);
    }
}

fn pocket_milestones(colors: &[u8], out: &mut Vec<Milestone>) {
    let corners = units_of(2);
    for fr in all_frames(2) {
        for f in 0..6 {
            if !corners
                .iter()
                .filter(|u| u.sides.contains(&f))
                .all(|u| unit_ok(u, colors, fr))
            {
                continue;
            }
            out.push(Milestone::Layer1);
            let top = OPPOSITE_FACE[f];
            if (0..4).all(|k| colors[top * 4 + k] == fr[top]) {
                out.push(Milestone::Oll);
            }
        }
    }
}

/// 지금 상태에서 켜진 이정표(크기마다 `milestones_for`의 차례대로, 사이트 `milestonesOf`)
pub fn milestones_of(n: usize, state: &State) -> Vec<Milestone> {
    let mut out = Vec::new();
    let colors = face_colors(n, state);
    if is_solved(n, state) {
        return milestones_for(n);
    }
    if n == 2 {
        pocket_milestones(&colors, &mut out);
    } else if n == 3 {
        let frame = frames_of(3, &colors)[0];
        layer_milestones(&colors, &frame, &mut out);
        roux_milestones(state, &mut out);
        eoline_milestone(&colors, &frame, &mut out);
        corners_milestone(3, &colors, &mut out);
    } else {
        if solved_center_faces(n, state) == 6 {
            out.push(Milestone::Centers);
        }
        if paired_edge_lines(n, state) == 12 {
            out.push(Milestone::Edges);
        }
    }
    milestones_for(n)
        .into_iter()
        .filter(|m| out.contains(m))
        .collect()
}
