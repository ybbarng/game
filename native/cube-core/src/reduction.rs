//! 4×4~7×7 축소법(사이트 `packages/cube-reduction`): 가운데(흰 → 노랑 → 나머지 넷) → 모서리 짝(열 개 → 마지막 둘).
//!
//! 옮긴 원본: `geometry.ts`(가운데 자리·모서리 칸, 날개 홀짝, 칸 점수), `macros.ts`(공식 묶음과 패리티 공식), `sim.ts`
//! (색 배열 위 수, 바깥층 준비 수), `solve.ts`(단계마다 「짧은 준비 수 + 공식」 가운데 수 하나당 가장 많이 맞추는 것을
//! 되풀이), `three.ts`(축소가 끝난 큐브를 3×3으로 읽기, 3×3로 풀 수 없는 모양 알아보기). 같은 상태면 사이트와 같은
//! 수가 나온다(공통 시험 자료 `fixtures/hero-show-big.json`).
//!
//! 사이트 `solveReductionColors`는 축소 뒤 패리티·3×3(2단계 해법) 단계까지 낸다. 홈 시연(사람 흉내, `big.ts`)은 축소
//! 네 단계만 쓰고 그 뒤는 3×3 사람 해법으로 두므로 여기서는 축소 네 단계만 계산한다(앞 네 단계의 수는 같다).

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

use crate::notation::{format_move, parse_moves, CubeMove};
use crate::state::{move_table, State};
use crate::topology::{cube_topology, PieceKind};

/// 축소 단계(사이트 `ReductionStageId` 가운데 축소 넷)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReductionStage {
    CentersUd,
    CentersRest,
    Edges,
    LastEdges,
}

/// 축소법이 막혔다(사이트 `ReductionStuckError`). 부르는 쪽이 큐브를 돌려 쥐고 다시 푼다
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReductionStuck(pub ReductionStage);

/// 축소 해(사이트 `ReductionSolution`): 수(WCA 표기)와 단계마다 수 범위(이 번호부터 이 번호 앞까지)
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reduction {
    pub moves: Vec<String>,
    pub stages: Vec<(ReductionStage, usize, usize)>,
}

type Colors = Vec<u8>;

const FACE_LETTERS: [&str; 6] = ["U", "R", "F", "D", "L", "B"];

// ── 색 배열 위 수(사이트 `sim.ts`) ─────────────────────────

fn apply_move_colors(n: usize, colors: &[u8], m: &CubeMove) -> Colors {
    let dest = &move_table(n, m).dest;
    let mut next = vec![0u8; colors.len()];
    for (i, &c) in colors.iter().enumerate() {
        next[dest[i] as usize] = c;
    }
    next
}

fn apply_moves_colors(n: usize, colors: &[u8], moves: &[CubeMove]) -> Colors {
    let mut c = colors.to_vec();
    for m in moves {
        c = apply_move_colors(n, &c, m);
    }
    c
}

/// 수열을 돌린 뒤 자리 p의 스티커가 원래 어느 자리에 있었는지(사이트 `sourceMap`)
fn source_map(n: usize, moves: &[CubeMove]) -> Vec<u16> {
    let size = 6 * n * n;
    let mut cur: Vec<u16> = (0..size as u16).collect();
    for m in moves {
        let dest = &move_table(n, m).dest;
        let mut next = vec![0u16; size];
        for i in 0..size {
            next[dest[i] as usize] = cur[i];
        }
        cur = next;
    }
    cur
}

fn mv(n: usize, text: &str) -> Vec<CubeMove> {
    parse_moves(n, text).expect("축소법 공식")
}

fn invert(list: &[CubeMove]) -> Vec<CubeMove> {
    list.iter().rev().map(|m| m.inverse()).collect()
}

/// 같은 층을 잇달아 돌린 수를 하나로 합치고, 한 바퀴가 된 수는 지운다(사이트 `simplify`)
fn simplify(list: &[CubeMove]) -> Vec<CubeMove> {
    let mut out: Vec<CubeMove> = vec![];
    for m in list {
        match out.last().copied() {
            Some(last) if last.axis == m.axis && last.from == m.from && last.to == m.to => {
                let t = (last.turns + m.turns) % 4;
                out.pop();
                if t != 0 {
                    out.push(CubeMove { turns: t, ..*m });
                }
            }
            _ => out.push(*m),
        }
    }
    out
}

/// 바깥층 한 면 돌리기 18가지의 첫 수(사이트 `outerMoves(n).map(l => l[0])`)
fn single(n: usize) -> Vec<CubeMove> {
    let mut out = vec![];
    for f in FACE_LETTERS {
        for s in ["", "2", "'"] {
            out.push(mv(n, &format!("{f}{s}"))[0]);
        }
    }
    out
}

/// 바깥층 수 하나가 어느 면인지(0~5, 사이트 `outerFace`)
fn outer_face(m: &CubeMove) -> usize {
    let base = [1, 0, 2][m.axis as usize];
    if m.from == 1 {
        base
    } else {
        base + 3
    }
}

/// 바깥층 수만으로 된 수열(길이 0~`max`, 사이트 `outerSequences`)
fn outer_sequences(n: usize, max: usize) -> Vec<Vec<CubeMove>> {
    let singles = single(n);
    let mut out: Vec<Vec<CubeMove>> = vec![vec![]];
    let mut frontier: Vec<Vec<CubeMove>> = vec![vec![]];
    for _ in 1..=max {
        let mut next = vec![];
        for seq in &frontier {
            let last = seq.last();
            for m in &singles {
                if let Some(last) = last {
                    let (lf, mf) = (outer_face(last), outer_face(m));
                    if lf == mf || (last.axis == m.axis && lf > mf) {
                        continue;
                    }
                }
                let mut s = seq.clone();
                s.push(*m);
                next.push(s);
            }
        }
        out.extend(next.iter().cloned());
        frontier = next;
    }
    out
}

// ── 자리 묶음(사이트 `geometry.ts`) ─────────────────────────

struct EdgeSlot {
    pieces: Vec<[usize; 2]>,
    stickers: Vec<usize>,
    midge: Option<usize>,
    depth: Vec<usize>,
    anchor: Vec<usize>,
}

struct Geometry {
    centers: Vec<usize>,
    fixed_centers: Vec<usize>,
    slots: Vec<EdgeSlot>,
    slot_of: Vec<i8>,
    is_center: Vec<bool>,
}

fn face_of_sticker(n: usize, p: usize) -> usize {
    p / (n * n)
}

fn sticker_depth(n: usize, p: usize) -> usize {
    let i = p % (n * n);
    let (r, c) = (i / n, i % n);
    let t = if r == 0 || r == n - 1 { c } else { r };
    t.min(n - 1 - t)
}

fn wing_depths(n: usize) -> Vec<usize> {
    (1..=(n - 2) / 2).collect()
}

fn geometry(n: usize) -> &'static Geometry {
    static CACHE: OnceLock<Mutex<HashMap<usize, &'static Geometry>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(g) = cache.lock().unwrap().get(&n) {
        return g;
    }
    let topo = cube_topology(n);
    let mut centers = vec![];
    let mut fixed_centers = vec![usize::MAX; if n % 2 == 1 { 6 } else { 0 }];
    let mut slot_list: Vec<([usize; 2], Vec<usize>)> = vec![];
    for (pi, piece) in topo.pieces.iter().enumerate() {
        match piece.kind {
            PieceKind::InnerCenter => centers.extend(piece.stickers.iter().copied()),
            PieceKind::Center => {
                let s = piece.stickers[0];
                fixed_centers[topo.stickers[s].face] = s;
            }
            PieceKind::Edge | PieceKind::Wing => {
                let mut faces: Vec<usize> = piece
                    .stickers
                    .iter()
                    .map(|&s| topo.stickers[s].face)
                    .collect();
                faces.sort();
                let faces = [faces[0], faces[1]];
                match slot_list.iter_mut().find(|(f, _)| *f == faces) {
                    Some((_, list)) => list.push(pi),
                    None => slot_list.push((faces, vec![pi])),
                }
            }
            PieceKind::Corner => {}
        }
    }
    centers.sort();
    let mut slot_of = vec![-1i8; topo.sticker_count];
    let mut is_center = vec![false; topo.sticker_count];
    for &c in &centers {
        is_center[c] = true;
    }
    let slots = slot_list
        .iter()
        .enumerate()
        .map(|(i, (faces, list))| {
            let pieces: Vec<[usize; 2]> = list
                .iter()
                .map(|&pi| {
                    let st = &topo.pieces[pi].stickers;
                    let on = |f: usize| *st.iter().find(|&&s| topo.stickers[s].face == f).unwrap();
                    [on(faces[0]), on(faces[1])]
                })
                .collect();
            let stickers: Vec<usize> = pieces.iter().flatten().copied().collect();
            for &s in &stickers {
                slot_of[s] = i as i8;
            }
            let midge = list
                .iter()
                .position(|&pi| topo.pieces[pi].kind == PieceKind::Edge);
            let depth: Vec<usize> = pieces.iter().map(|p| sticker_depth(n, p[0])).collect();
            let inner = *depth.iter().max().unwrap();
            let anchor = match midge {
                Some(m) => vec![m],
                None => (0..depth.len()).filter(|&k| depth[k] == inner).collect(),
            };
            EdgeSlot {
                pieces,
                stickers,
                midge,
                depth,
                anchor,
            }
        })
        .collect();
    let g: &'static Geometry = Box::leak(Box::new(Geometry {
        centers,
        fixed_centers,
        slots,
        slot_of,
        is_center,
    }));
    cache.lock().unwrap().insert(n, g);
    g
}

/// 스티커 자리마다 「수로 서로 옮겨 갈 수 있는 자리 묶음」 번호(사이트 `stickerClasses`)
fn sticker_classes(n: usize) -> Vec<usize> {
    let size = 6 * n * n;
    let mut parent: Vec<usize> = (0..size).collect();
    fn find(parent: &[usize], x: usize) -> usize {
        let mut r = x;
        while parent[r] != r {
            r = parent[r];
        }
        r
    }
    for axis in 0..3u8 {
        for l in 1..=n {
            let dest = move_table(
                n,
                &CubeMove {
                    axis,
                    from: l,
                    to: l,
                    turns: 1,
                },
            )
            .dest
            .clone();
            for i in 0..size {
                let a = find(&parent, i);
                let b = find(&parent, dest[i] as usize);
                if a != b {
                    parent[a] = b;
                }
            }
        }
    }
    (0..size).map(|i| find(&parent, i)).collect()
}

fn perm_parity(perm: &[usize]) -> usize {
    let mut parity = 0;
    let mut seen = vec![false; perm.len()];
    for i in 0..perm.len() {
        if seen[i] {
            continue;
        }
        let mut len = 0;
        let mut j = i;
        while !seen[j] {
            seen[j] = true;
            len += 1;
            j = perm[j];
        }
        parity ^= (len + 1) & 1;
    }
    parity
}

/// 날개 조각 순열의 홀짝(사이트 `wingParity`). `depth`면 그 날개 묶음만
fn wing_parity(n: usize, colors: &[u8], depth: usize) -> usize {
    let g = geometry(n);
    let cls = sticker_classes(n);
    let mut wings: Vec<[usize; 2]> = vec![];
    for s in &g.slots {
        for (i, p) in s.pieces.iter().enumerate() {
            if Some(i) == s.midge || s.depth[i] != depth {
                continue;
            }
            wings.push(*p);
        }
    }
    let perm: Vec<usize> = wings
        .iter()
        .map(|&[q1, q2]| {
            let (x, y) = (colors[q1] as usize, colors[q2] as usize);
            wings
                .iter()
                .position(|&[s1, s2]| {
                    (face_of_sticker(n, s1) == x
                        && face_of_sticker(n, s2) == y
                        && cls[s1] == cls[q1])
                        || (face_of_sticker(n, s2) == x
                            && face_of_sticker(n, s1) == y
                            && cls[s2] == cls[q1])
                })
                .expect("날개 조각을 알아보지 못했다")
        })
        .collect();
    perm_parity(&perm)
}

fn slot_paired(slot: &EdgeSlot, colors: &[u8]) -> bool {
    let [a, b] = slot.pieces[0].map(|p| colors[p]);
    slot.pieces[1..]
        .iter()
        .all(|p| colors[p[0]] == a && colors[p[1]] == b)
}

// ── 공식 묶음(사이트 `macros.ts`) ─────────────────────────

struct Macro {
    moves: Vec<CubeMove>,
    src: Vec<u16>,
    centers: Vec<usize>,
    slots: Vec<usize>,
    moves_corners: bool,
    centers_keep_face: bool,
    center_faces: Vec<usize>,
}

fn compile_macro(n: usize, list: Vec<CubeMove>) -> Macro {
    let g = geometry(n);
    let src = source_map(n, &list);
    let mut centers = vec![];
    let mut slots: Vec<usize> = vec![];
    let mut moves_corners = false;
    let mut centers_keep_face = true;
    let mut center_faces: Vec<usize> = vec![];
    for p in 0..src.len() {
        let from = src[p] as usize;
        if from == p {
            continue;
        }
        if g.is_center[p] {
            centers.push(p);
            let (ff, tf) = (face_of_sticker(n, from), face_of_sticker(n, p));
            if ff != tf {
                centers_keep_face = false;
                for f in [ff, tf] {
                    if !center_faces.contains(&f) {
                        center_faces.push(f);
                    }
                }
            }
        } else if g.slot_of[p] >= 0 {
            let s = g.slot_of[p] as usize;
            if !slots.contains(&s) {
                slots.push(s);
            }
        } else if g.fixed_centers.contains(&p) {
            panic!("정가운데 조각을 움직이는 공식은 쓰지 않는다");
        } else {
            moves_corners = true;
        }
    }
    slots.sort();
    center_faces.sort();
    Macro {
        moves: list,
        src,
        centers,
        slots,
        moves_corners,
        centers_keep_face,
        center_faces,
    }
}

/// 안쪽 한 층 돌리기(사이트 `innerSlices`)
fn inner_slices(n: usize, with_middle: bool) -> Vec<CubeMove> {
    let mut out = vec![];
    for axis in 0..3u8 {
        for l in 2..n {
            if !with_middle && n % 2 == 1 && l == n.div_ceil(2) {
                continue;
            }
            for turns in 1..=3 {
                out.push(CubeMove {
                    axis,
                    from: l,
                    to: l,
                    turns,
                });
            }
        }
    }
    out
}

struct CenterMacros {
    inserts: Vec<Macro>,
    cycles: Vec<Macro>,
    /// 공식마다 준비 수(그 공식의 가운데가 들고 나는 면들을 0~3번씩, `face_setups`)
    insert_setups: Vec<Arc<Vec<FaceSetup>>>,
    cycle_setups: Vec<Arc<Vec<FaceSetup>>>,
}

fn center_macros(n: usize) -> Arc<CenterMacros> {
    static CACHE: OnceLock<Mutex<HashMap<usize, Arc<CenterMacros>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().unwrap().get(&n) {
        return hit.clone();
    }
    let g = geometry(n);
    let slices = inner_slices(n, false);
    let outer = single(n);
    let mut conj: Vec<Vec<CubeMove>> = vec![];
    for s in &slices {
        for x in &outer {
            if x.axis == s.axis {
                continue;
            }
            conj.push(vec![*s, *x, s.inverse()]);
        }
    }
    let inserts: Vec<Macro> = conj.iter().map(|l| compile_macro(n, l.clone())).collect();
    let mut pairs: Vec<(Vec<CubeMove>, Vec<CubeMove>)> = vec![];
    let a_list: Vec<Vec<CubeMove>> = slices
        .iter()
        .map(|s| vec![*s])
        .chain(conj.iter().cloned())
        .collect();
    let b_list: Vec<CubeMove> = outer.iter().chain(slices.iter()).copied().collect();
    for a in &a_list {
        for b in &b_list {
            pairs.push((a.clone(), vec![*b]));
        }
    }
    for m in inner_slices(n, true) {
        if m.turns == 2 {
            continue;
        }
        for x in &outer {
            if x.axis == m.axis {
                continue;
            }
            for s in &slices {
                if s.axis == x.axis || s.turns == 2 {
                    continue;
                }
                pairs.push((vec![m], vec![*x, *s, x.inverse()]));
            }
        }
    }
    let mut seen: HashSet<Vec<u16>> = HashSet::new();
    let mut cycles = vec![];
    for (a, b) in pairs {
        let mut list = a.clone();
        list.extend(b.iter().copied());
        list.extend(invert(&a));
        list.extend(invert(&b));
        let list = simplify(&list);
        let src = source_map(n, &list);
        let mut count = 0;
        let mut key: Vec<u16> = vec![];
        for &p in &g.centers {
            if src[p] as usize != p {
                if face_of_sticker(n, src[p] as usize) != face_of_sticker(n, p) {
                    count += 1;
                }
                key.push(p as u16);
                key.push(src[p]);
            }
        }
        let fixed = g.fixed_centers.iter().any(|&p| src[p] as usize != p);
        if fixed || count == 0 || count > 3 || seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        cycles.push(compile_macro(n, list));
    }
    let insert_setups = inserts
        .iter()
        .map(|m| face_setups(n, &m.center_faces))
        .collect();
    let cycle_setups = cycles
        .iter()
        .map(|m| face_setups(n, &m.center_faces))
        .collect();
    let result = Arc::new(CenterMacros {
        inserts,
        cycles,
        insert_setups,
        cycle_setups,
    });
    cache.lock().unwrap().insert(n, result.clone());
    result
}

/// 면 이름을 y축 돌리기만큼 바꾼 표기(R→F→L→B→R 차례로 `k`번, 사이트 `relabelY`)
fn relabel_y(text: &str, k: usize) -> String {
    let ring = ['R', 'F', 'L', 'B'];
    text.chars()
        .map(|c| match ring.iter().position(|&r| r == c) {
            Some(i) => ring[(i + k) % 4],
            None => c,
        })
        .collect()
}

/// 위아래를 뒤집은 표기(x2: U↔D, F↔B, 사이트 `flipUD`)
fn flip_ud(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            'U' => 'D',
            'D' => 'U',
            'F' => 'B',
            'B' => 'F',
            _ => c,
        })
        .collect()
}

fn invert_text(text: &str) -> String {
    text.split(' ')
        .rev()
        .map(|m| match m.strip_suffix('\'') {
            Some(base) => base.to_string(),
            None => format!("{m}'"),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

struct EdgeMacros {
    pairs: Vec<Macro>,
    cycles: Vec<Macro>,
    /// 칸마다 그 칸을 건드리는 공식 번호(`pairs`, `cycles`, 둘을 이은 것, 사이트 `macrosBySlot`)
    pairs_by_slot: Vec<Vec<usize>>,
    cycles_by_slot: Vec<Vec<usize>>,
}

fn by_slot(macros: &[Macro], count: usize) -> Vec<Vec<usize>> {
    let mut out = vec![vec![]; count];
    for (i, m) in macros.iter().enumerate() {
        for &s in &m.slots {
            out[s].push(i);
        }
    }
    out
}

fn edge_macros(n: usize) -> Arc<EdgeMacros> {
    static CACHE: OnceLock<Mutex<HashMap<usize, Arc<EdgeMacros>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().unwrap().get(&n) {
        return hit.clone();
    }
    let g = geometry(n);
    let outer = single(n);
    let y_slices: Vec<CubeMove> = inner_slices(n, false)
        .into_iter()
        .filter(|s| s.axis == 1 && s.turns != 2)
        .collect();
    let mut b_texts: Vec<String> = vec![];
    for x in ["R", "R'", "L", "L'", "F", "F'", "B", "B'"] {
        let xi = match x.strip_suffix('\'') {
            Some(b) => b.to_string(),
            None => format!("{x}'"),
        };
        for y in ["U", "U2", "U'", "D", "D2", "D'"] {
            b_texts.push(format!("{x} {y} {xi}"));
        }
    }
    for base in ["R U R' F R' F' R", "R F' U R' F"] {
        for k in 0..4 {
            for t in [base.to_string(), flip_ud(base)] {
                let text = relabel_y(&t, k);
                b_texts.push(text.clone());
                b_texts.push(invert_text(&text));
            }
        }
    }
    let mut seen: HashSet<Vec<u32>> = HashSet::new();
    let mut keep = |m: Macro, out: &mut Vec<Macro>| {
        if !m.centers_keep_face || m.slots.is_empty() {
            return;
        }
        let mut key: Vec<u32> = vec![];
        for &s in &m.slots {
            key.push(100_000 + s as u32);
            for &p in &g.slots[s].stickers {
                key.push(m.src[p] as u32);
            }
        }
        if seen.contains(&key) {
            return;
        }
        seen.insert(key);
        out.push(m);
    };
    let mut pairs = vec![];
    for s in &y_slices {
        for b in &b_texts {
            let mut list = vec![*s];
            list.extend(mv(n, b));
            list.push(s.inverse());
            keep(compile_macro(n, list), &mut pairs);
        }
    }
    let mut cycle_macros = vec![];
    let mut cycles: Vec<Vec<CubeMove>> = vec![];
    for s in inner_slices(n, false).into_iter().filter(|m| m.turns != 2) {
        for x in &outer {
            for y in &outer {
                if x.axis == y.axis || x.axis == s.axis {
                    continue;
                }
                let b = vec![*x, *y, x.inverse()];
                let mut list = vec![s];
                list.extend(b.iter().copied());
                list.push(s.inverse());
                list.extend(invert(&b));
                let m = compile_macro(n, list.clone());
                if !m.centers_keep_face || m.moves_corners || m.slots.len() > 3 {
                    continue;
                }
                keep(m, &mut cycle_macros);
                cycles.push(list);
            }
        }
    }
    for c in &cycles {
        for s in &y_slices {
            let mut list = vec![*s];
            list.extend(c.iter().copied());
            list.push(s.inverse());
            let m = compile_macro(n, list);
            if !m.centers_keep_face || m.slots.len() > 2 {
                continue;
            }
            keep(m, &mut cycle_macros);
        }
    }
    let count = g.slots.len();
    let result = Arc::new(EdgeMacros {
        pairs_by_slot: by_slot(&pairs, count),
        cycles_by_slot: by_slot(&cycle_macros, count),
        pairs,
        cycles: cycle_macros,
    });
    cache.lock().unwrap().insert(n, result.clone());
    result
}

/// 한 모서리(UF)의 두 날개 맞바꾸기(사이트 `EDGE_PARITY_TEXT`)
pub const EDGE_PARITY_TEXT: &str = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2";

/// 안쪽 한 층 `2R`·`2L`(낱말 처음)을 `f(면)`으로 바꾼다(사이트 `text.replace(/\b2([RL])/g, …)`)
fn replace_inner(text: &str, f: impl Fn(char) -> String) -> String {
    text.split(' ')
        .map(|tok| {
            let mut ch = tok.chars();
            match (ch.next(), ch.next()) {
                (Some('2'), Some(face @ ('R' | 'L'))) => format!("{}{}", f(face), &tok[2..]),
                _ => tok.to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn edge_parity_macros(n: usize, depth: usize) -> Arc<Vec<Macro>> {
    static CACHE: OnceLock<Mutex<HashMap<(usize, usize), Arc<Vec<Macro>>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().unwrap().get(&(n, depth)) {
        return hit.clone();
    }
    let base = replace_inner(EDGE_PARITY_TEXT, |f| format!("{}{f}", depth + 1));
    let mut out = vec![];
    for k in 0..4 {
        for t in [base.clone(), flip_ud(&base)] {
            out.push(compile_macro(n, mv(n, &relabel_y(&t, k))));
        }
    }
    let out = Arc::new(out);
    cache.lock().unwrap().insert((n, depth), out.clone());
    out
}

fn inner_block(n: usize, face: char) -> String {
    let h = n / 2;
    if h == 2 {
        format!("2{face}")
    } else {
        format!("2-{h}{face}w")
    }
}

/// 짝수 크기 OLL 패리티(사이트 `ollParityText`)
pub fn oll_parity_text(n: usize) -> String {
    replace_inner(EDGE_PARITY_TEXT, |f| inner_block(n, f))
}

/// 짝수 크기 PLL 패리티(사이트 `pllParityText`)
pub fn pll_parity_text(n: usize) -> String {
    let h = n / 2;
    let r = inner_block(n, 'R');
    let wide_u = if h == 2 {
        "Uw".to_string()
    } else {
        format!("{h}Uw")
    };
    format!("{r}2 U2 {r}2 {wide_u}2 {r}2 {}2", inner_block(n, 'U'))
}

// ── 단계(사이트 `solve.ts`) ─────────────────────────────

fn center_targets(n: usize, colors: &[u8]) -> [u8; 6] {
    if n % 2 == 0 {
        return [0, 1, 2, 3, 4, 5];
    }
    let g = geometry(n);
    std::array::from_fn(|f| colors[g.fixed_centers[f]])
}

struct FaceSetup {
    code: usize,
    moves: Vec<CubeMove>,
}

fn face_setups(n: usize, faces: &[usize]) -> Arc<Vec<FaceSetup>> {
    type Cache = Mutex<HashMap<(usize, Vec<usize>), Arc<Vec<FaceSetup>>>>;
    static CACHE: OnceLock<Cache> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let key = (n, faces.to_vec());
    if let Some(hit) = cache.lock().unwrap().get(&key) {
        return hit.clone();
    }
    let suffix = ["", "", "2", "'"];
    let mut out = vec![];
    for c in 0..4usize.pow(faces.len() as u32) {
        let mut rest = c;
        let mut code = 0;
        let mut list = vec![];
        for &f in faces {
            let t = rest % 4;
            rest /= 4;
            if t == 0 {
                continue;
            }
            code += t * 4usize.pow(f as u32);
            list.extend(mv(n, &format!("{}{}", FACE_LETTERS[f], suffix[t])));
        }
        out.push(FaceSetup { code, moves: list });
    }
    let out = Arc::new(out);
    cache.lock().unwrap().insert(key, out.clone());
    out
}

#[allow(clippy::too_many_arguments)]
fn solve_center_phase(
    stage: ReductionStage,
    n: usize,
    colors: Colors,
    target: &[u8; 6],
    weight: impl Fn(usize) -> f64,
    out: &mut Vec<CubeMove>,
    max_steps: usize,
) -> Result<Colors, ReductionStuck> {
    let g = geometry(n);
    let cm = center_macros(n);
    let size = 6 * n * n;
    let mut want = vec![0u8; size];
    let mut w = vec![0f64; size];
    for &p in &g.centers {
        want[p] = target[face_of_sticker(n, p)];
        w[p] = weight(face_of_sticker(n, p));
    }
    let mut face_of_color = [0usize; 6];
    for (f, &c) in target.iter().enumerate() {
        face_of_color[c as usize] = f;
    }
    let opposite = |p: usize, c: u8| {
        w[p] > 0.0 && face_of_color[c as usize] == (face_of_sticker(n, p) + 3) % 6
    };
    let mut cur = colors;
    for _ in 0..max_steps {
        if g.centers.iter().all(|&p| w[p] == 0.0 || cur[p] == want[p]) {
            return Ok(cur);
        }
        let mut setup_colors: Vec<Option<Colors>> = vec![None; 4096];
        let consider = |macros: &'_ [Macro],
                        setups: &'_ [Arc<Vec<FaceSetup>>],
                        prev: Option<(usize, usize, usize, f64)>,
                        sideways: bool,
                        setup_colors: &mut Vec<Option<Colors>>,
                        which: usize|
         -> Option<(usize, usize, usize, f64)> {
            // (어느 묶음, 공식 번호, 준비 수 번호, 비율)
            let mut best = prev;
            for (mi, m) in macros.iter().enumerate() {
                if !m.centers.iter().any(|&p| w[p] > 0.0) {
                    continue;
                }
                for (si, s) in setups[mi].iter().enumerate() {
                    let ca = setup_colors[s.code]
                        .get_or_insert_with(|| apply_moves_colors(n, &cur, &s.moves));
                    let mut gain = 0.0;
                    for &p in &m.centers {
                        let t = want[p];
                        let wp = w[p];
                        if ca[m.src[p] as usize] == t {
                            gain += wp;
                        }
                        if ca[p] == t {
                            gain -= wp;
                        }
                    }
                    let mut score = gain;
                    if sideways {
                        if gain != 0.0 {
                            continue;
                        }
                        let mut sc = 0i32;
                        for &p in &m.centers {
                            if opposite(p, ca[p]) {
                                sc += 1;
                            }
                            if opposite(p, ca[m.src[p] as usize]) {
                                sc -= 1;
                            }
                        }
                        score = sc as f64;
                    }
                    if score <= 0.0 {
                        continue;
                    }
                    let ratio = (s.moves.len() + m.moves.len()) as f64 / score;
                    if best.is_none_or(|b| ratio < b.3) {
                        best = Some((which, mi, si, ratio));
                    }
                }
            }
            best
        };
        let mut best = consider(
            &cm.inserts,
            &cm.insert_setups,
            None,
            false,
            &mut setup_colors,
            0,
        );
        if best.is_none_or(|b| b.3 > 3.0) {
            best = consider(
                &cm.cycles,
                &cm.cycle_setups,
                best,
                false,
                &mut setup_colors,
                1,
            );
        }
        if best.is_none() && n >= 6 {
            best = consider(
                &cm.cycles,
                &cm.cycle_setups,
                best,
                true,
                &mut setup_colors,
                1,
            );
        }
        let Some((which, mi, si, _)) = best else {
            return Err(ReductionStuck(stage));
        };
        let m = if which == 0 {
            &cm.inserts[mi]
        } else {
            &cm.cycles[mi]
        };
        let fs = if which == 0 {
            &cm.insert_setups[mi]
        } else {
            &cm.cycle_setups[mi]
        };
        let mut step = fs[si].moves.clone();
        step.extend(m.moves.iter().copied());
        cur = apply_moves_colors(n, &cur, &step);
        out.extend(step);
    }
    Err(ReductionStuck(stage))
}

fn paired_count(n: usize, colors: &[u8]) -> usize {
    geometry(n)
        .slots
        .iter()
        .filter(|s| slot_paired(s, colors))
        .count()
}

fn setups_of(n: usize, depth: usize) -> Arc<Vec<Vec<CubeMove>>> {
    type Cache = Mutex<HashMap<(usize, usize), Arc<Vec<Vec<CubeMove>>>>>;
    static CACHE: OnceLock<Cache> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().unwrap().get(&(n, depth)) {
        return hit.clone();
    }
    let out = Arc::new(outer_sequences(n, depth));
    cache.lock().unwrap().insert((n, depth), out.clone());
    out
}

/// 칸 점수를 빨리 세는 표(사이트 `SlotTable`)
struct SlotTable {
    start: Vec<usize>,
    count: Vec<usize>,
    stickers: Vec<usize>,
    anchors: usize,
}

fn slot_table(n: usize) -> SlotTable {
    let g = geometry(n);
    let mut start = vec![];
    let mut count = vec![];
    let mut list = vec![];
    for s in &g.slots {
        start.push(list.len());
        count.push(s.pieces.len());
        for &k in &s.anchor {
            list.extend(s.pieces[k]);
        }
        for (k, p) in s.pieces.iter().enumerate() {
            if !s.anchor.contains(&k) {
                list.extend(*p);
            }
        }
    }
    SlotTable {
        start,
        count,
        stickers: list,
        anchors: g.slots[0].anchor.len(),
    }
}

fn fast_slot_score(t: &SlotTable, slot: usize, ca: &[u8], src: Option<&[u16]>) -> usize {
    let st = &t.stickers;
    let mut k = t.start[slot];
    let end = k + 2 * t.count[slot];
    let at = |p: usize| match src {
        Some(s) => ca[s[p] as usize],
        None => ca[p],
    };
    let a = at(st[k]);
    let b = at(st[k + 1]);
    k += 2;
    let mut score = 0;
    if t.anchors == 2 {
        if at(st[k]) != a || at(st[k + 1]) != b {
            return 0;
        }
        score = 1;
        k += 2;
    }
    while k < end {
        if at(st[k]) == a && at(st[k + 1]) == b {
            score += 1;
        }
        k += 2;
    }
    score
}

fn parity_depths(n: usize, colors: &[u8]) -> Vec<usize> {
    let depths = wing_depths(n);
    if n % 2 == 1 {
        return depths
            .into_iter()
            .filter(|&d| wing_parity(n, colors, d) == 1)
            .collect();
    }
    let inner = *depths.last().unwrap();
    let want = wing_parity(n, colors, inner);
    depths
        .into_iter()
        .filter(|&d| d != inner && wing_parity(n, colors, d) != want)
        .collect()
}

/// 어느 공식 묶음에서 찾나
#[derive(Clone, Copy)]
enum Set {
    Pairs,
    Cycles,
    Both,
}

fn solve_edge_phase(
    stage: ReductionStage,
    n: usize,
    colors: Colors,
    goal: usize,
    out: &mut Vec<CubeMove>,
    max_steps: usize,
) -> Result<Colors, ReductionStuck> {
    let g = geometry(n);
    let t = slot_table(n);
    let em = edge_macros(n);
    let mut cur = colors;
    let slot_count = g.slots.len();
    let full = usize::from(t.anchors == 2) + t.count[0] - t.anchors;
    let macro_at = |set: Set, i: usize| -> &Macro {
        match set {
            Set::Pairs => &em.pairs[i],
            Set::Cycles => &em.cycles[i],
            Set::Both => {
                if i < em.pairs.len() {
                    &em.pairs[i]
                } else {
                    &em.cycles[i - em.pairs.len()]
                }
            }
        }
    };
    let by_slot_of = |set: Set, slot: usize| -> Vec<usize> {
        match set {
            Set::Pairs => em.pairs_by_slot[slot].clone(),
            Set::Cycles => em.cycles_by_slot[slot].clone(),
            Set::Both => em.pairs_by_slot[slot]
                .iter()
                .copied()
                .chain(em.cycles_by_slot[slot].iter().map(|&i| i + em.pairs.len()))
                .collect(),
        }
    };
    let by_all =
        |set: Set| -> Vec<Vec<usize>> { (0..slot_count).map(|s| by_slot_of(set, s)).collect() };
    let (by_pairs, by_cycles, by_both) =
        (by_all(Set::Pairs), by_all(Set::Cycles), by_all(Set::Both));
    // (준비 수, 묶음, 공식 번호, 비율)
    type Best = Option<(Vec<CubeMove>, Set, usize, f64)>;
    for _ in 0..max_steps {
        if paired_count(n, &cur) >= goal {
            return Ok(cur);
        }
        let search = |depth: usize, set: Set, prev: Best, cur: &[u8]| -> Best {
            let mut best = prev;
            let by = match set {
                Set::Pairs => &by_pairs,
                Set::Cycles => &by_cycles,
                Set::Both => &by_both,
            };
            let mut before = vec![0usize; slot_count];
            let mut open: Vec<usize> = vec![];
            for setup in setups_of(n, depth).iter() {
                if depth == 3 && setup.len() < 3 {
                    continue;
                }
                let ca = apply_moves_colors(n, cur, setup);
                open.clear();
                for (i, b) in before.iter_mut().enumerate() {
                    *b = fast_slot_score(&t, i, &ca, None);
                    if *b < full {
                        open.push(i);
                    }
                }
                for k in 0..open.len() {
                    for &mi in &by[open[k]] {
                        let m = macro_at(set, mi);
                        if open[..k].iter().any(|j| m.slots.contains(j)) {
                            continue;
                        }
                        let mut gain: i64 = 0;
                        for &si in &m.slots {
                            gain += fast_slot_score(&t, si, &ca, Some(&m.src)) as i64
                                - before[si] as i64;
                        }
                        if gain <= 0 {
                            continue;
                        }
                        let ratio = (setup.len() + m.moves.len()) as f64 / gain as f64;
                        if best.as_ref().is_none_or(|b| ratio < b.3) {
                            best = Some((setup.clone(), set, mi, ratio));
                        }
                    }
                }
            }
            best
        };
        let mut best = search(2, Set::Pairs, None, &cur);
        if best.as_ref().is_none_or(|b| b.3 > 5.0) {
            best = search(2, Set::Cycles, best, &cur);
        }
        let mut parity: Option<(Vec<CubeMove>, Vec<CubeMove>)> = None;
        if best.is_none() {
            let fix = parity_depths(n, &cur);
            if let Some(&d) = fix.first() {
                let pm = edge_parity_macros(n, d);
                'outer: for setup in setups_of(n, 2).iter() {
                    let ca = apply_moves_colors(n, &cur, setup);
                    for m in pm.iter() {
                        if m.slots
                            .iter()
                            .any(|&si| fast_slot_score(&t, si, &ca, None) < full)
                        {
                            parity = Some((setup.clone(), m.moves.clone()));
                            break 'outer;
                        }
                    }
                }
            }
        }
        let step: Vec<CubeMove> = if let Some((setup, moves)) = parity {
            setup.into_iter().chain(moves).collect()
        } else {
            if best.is_none() {
                best = search(3, Set::Both, None, &cur);
            }
            let Some((setup, set, mi, _)) = best else {
                return Err(ReductionStuck(stage));
            };
            setup
                .into_iter()
                .chain(macro_at(set, mi).moves.iter().copied())
                .collect()
        };
        cur = apply_moves_colors(n, &cur, &step);
        out.extend(step);
    }
    Err(ReductionStuck(stage))
}

const CENTER_STEPS: usize = 500;
const EDGE_STEPS: usize = 100;

/// 엔진 상태를 축소법으로(축소 네 단계, 사이트 `solveReductionState`의 앞 네 단계)
pub fn solve_reduction(n: usize, state: &State) -> Result<Reduction, ReductionStuck> {
    let colors = crate::state::face_colors(n, state);
    let target = center_targets(n, &colors);
    let mut all: Vec<CubeMove> = vec![];
    let mut stages = vec![];
    let mut cur = colors;
    let mut run = |id: ReductionStage,
                   cur: Colors,
                   body: &dyn Fn(Colors, &mut Vec<CubeMove>) -> Result<Colors, ReductionStuck>|
     -> Result<Colors, ReductionStuck> {
        let mut out = vec![];
        let next = body(cur, &mut out)?;
        let list = simplify(&out);
        stages.push((id, all.len(), all.len() + list.len()));
        all.extend(list);
        Ok(next)
    };
    use ReductionStage as S;
    cur = run(S::CentersUd, cur, &|c, out| {
        let up = solve_center_phase(
            S::CentersUd,
            n,
            c,
            &target,
            |f| if f == 0 { 1.0 } else { 0.0 },
            out,
            CENTER_STEPS,
        )?;
        solve_center_phase(
            S::CentersUd,
            n,
            up,
            &target,
            |f| match f {
                0 => 1000.0,
                3 => 1.0,
                _ => 0.0,
            },
            out,
            CENTER_STEPS,
        )
    })?;
    cur = run(S::CentersRest, cur, &|c, out| {
        solve_center_phase(
            S::CentersRest,
            n,
            c,
            &target,
            |f| if f == 0 || f == 3 { 1000.0 } else { 1.0 },
            out,
            CENTER_STEPS,
        )
    })?;
    cur = run(S::Edges, cur, &|c, out| {
        solve_edge_phase(S::Edges, n, c, 10, out, EDGE_STEPS)
    })?;
    let _ = run(S::LastEdges, cur, &|c, out| {
        solve_edge_phase(S::LastEdges, n, c, 12, out, EDGE_STEPS)
    })?;
    Ok(Reduction {
        moves: all.iter().map(|m| format_move(n, m)).collect(),
        stages,
    })
}

// ── 3×3로 읽기(사이트 `three.ts`) ─────────────────────────

fn map_index(n: usize, k: usize) -> usize {
    match k {
        0 => 0,
        2 => n - 1,
        _ => {
            if n % 2 == 1 {
                (n - 1) / 2
            } else {
                1
            }
        }
    }
}

/// n×n 색 배열 → 3×3 스티커 글자(면 번호). `face_of_color[색]`은 그 색이 맞아야 할 면(사이트 `toThreeFacelets`)
pub fn to_three_facelets(n: usize, colors: &[u8], face_of_color: &[u8; 6]) -> Vec<u8> {
    let mut out = Vec::with_capacity(54);
    for f in 0..6 {
        for r in 0..3 {
            for c in 0..3 {
                let p = f * n * n + map_index(n, r) * n + map_index(n, c);
                out.push(face_of_color[colors[p] as usize]);
            }
        }
    }
    out
}

const EDGES3: [[usize; 2]; 12] = crate::human::EDGE_FACELETS;
const CORNERS3: [[usize; 3]; 8] = [
    [8, 9, 20],
    [6, 18, 38],
    [0, 36, 47],
    [2, 45, 11],
    [29, 26, 15],
    [27, 44, 24],
    [33, 53, 42],
    [35, 17, 51],
];

fn key_of(f: &[u8], idx: &[usize]) -> Vec<u8> {
    let mut k: Vec<u8> = idx.iter().map(|&i| f[i]).collect();
    k.sort();
    k
}

/// 3×3로 볼 때 풀 수 없는 모양(사이트 `threeParity`): (모서리 하나 뒤집힘 = OLL 패리티, 두 모서리 바뀜 = PLL 패리티)
pub fn three_parity(f: &[u8]) -> Option<(bool, bool)> {
    let solved: Vec<u8> = (0..54).map(|i| (i / 9) as u8).collect();
    let edge_keys: Vec<Vec<u8>> = EDGES3.iter().map(|e| key_of(&solved, e)).collect();
    let corner_keys: Vec<Vec<u8>> = CORNERS3.iter().map(|c| key_of(&solved, c)).collect();
    let mut flips = 0;
    let mut ep = vec![];
    for &[a, b] in &EDGES3 {
        let (la, lb) = (f[a], f[b]);
        let ud = |x: u8| x == 0 || x == 3;
        let primary = if ud(la) || ud(lb) {
            if ud(la) {
                la
            } else {
                lb
            }
        } else if la == 2 || la == 5 {
            la
        } else {
            lb
        };
        if la != primary {
            flips += 1;
        }
        ep.push(edge_keys.iter().position(|k| *k == key_of(f, &[a, b]))?);
    }
    let mut cp = vec![];
    for c in &CORNERS3 {
        cp.push(corner_keys.iter().position(|k| *k == key_of(f, c))?);
    }
    Some((flips % 2 == 1, perm_parity(&cp) != perm_parity(&ep)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{apply_alg, solved_cube};

    #[test]
    fn parity_texts() {
        assert_eq!(oll_parity_text(4), EDGE_PARITY_TEXT);
        assert_eq!(
            oll_parity_text(6),
            "2-3Rw2 B2 U2 2-3Lw U2 2-3Rw' U2 2-3Rw U2 F2 2-3Rw F2 2-3Lw' B2 2-3Rw2"
        );
        assert_eq!(pll_parity_text(4), "2R2 U2 2R2 Uw2 2R2 2U2");
        assert_eq!(pll_parity_text(6), "2-3Rw2 U2 2-3Rw2 3Uw2 2-3Rw2 2-3Uw2");
    }

    #[test]
    fn reduces_4x4() {
        let s = apply_alg(
            4,
            &solved_cube(4),
            "R U2 Rw F' 2L D B2 Uw R' U F2 Fw D' L2 B U' 2R R2 F",
        )
        .unwrap();
        let red = solve_reduction(4, &s).unwrap();
        let after = apply_alg(4, &s, &red.moves.join(" ")).unwrap();
        assert_eq!(paired_count(4, &crate::state::face_colors(4, &after)), 12);
    }
}
