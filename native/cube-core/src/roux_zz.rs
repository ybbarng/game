//! 루(Roux)·ZZ 사람 흉내 해법(3×3, 홈 시연 「루」·「ZZ」, 사이트 `packages/cube-ai` `solveRoux`·`solveZZ`).
//!
//! 옮긴 원본: `methods-roux-zz.ts`(단계 차례), `piece-search.ts`(가운데 층 M·두 층 r을 넣은 조각 몇 개의 작은 탐색).
//! 같은 상태면 사이트와 같은 수가 나온다(공통 시험 자료 `fixtures/hero-show.json`).
//!
//! - 루: 첫 블록(왼쪽 1×2×3) → 둘째 블록(오른쪽, R·r·M·U만) → CMLL(위 코너 방향 7 + 자리 2) → LSE(EO → 왼쪽·오른쪽 위
//!   엣지 → 가운데 줄 엣지, M·U만).
//! - ZZ: EO라인 → 왼쪽·오른쪽 블록(R·U·L만) → 윗면(코너 7) → PLL.
//!
//! 루는 가운데 층을 돌리므로 조각 좌표를 처음 정한 기준 방향(고정 frame)에서 읽고, 가운데 층이 돈 만큼은 따로 센다.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use crate::human::{
    apply_match, coords_of, f2l_ok, facelets_first, finish, read_cubie, top_oriented, white_down,
    HumanSolve, Solve, SolveError, StageName, Tracked, R,
};
use crate::human_data;
use crate::notation::parse_moves;
use crate::state::{move_table, State};

// ── 작은 탐색(사이트 `piece-search.ts`) ─────────────────────

/// 수 하나의 조각 좌표 표(사이트 `PieceMove`)
pub(crate) struct PieceMove {
    name: String,
    corner: [u8; 24],
    edge: [u8; 24],
    /// 가운데 층이 도는 만큼(0..3)
    center: u8,
    axis: u8,
    /// 같은 축 안 차례
    order: u8,
}

/// 위 가운데 자리의 글자(면 번호) → 가운데 층이 돈 만큼(사이트 `CENTER_OFFSET` U B D F)
const CENTER_OFFSET: [u8; 4] = [0, 5, 3, 2];

fn layer_of(c: char) -> (u8, u8) {
    match c {
        'U' => (1, 0),
        'D' => (1, 1),
        'R' => (0, 0),
        'r' => (0, 1),
        'M' => (0, 2),
        'L' => (0, 3),
        'F' => (2, 0),
        'B' => (2, 1),
        _ => unreachable!("수 이름"),
    }
}

fn piece_move(name: &str) -> PieceMove {
    let mut f: Vec<u8> = (0..54).map(|i| (i / 9) as u8).collect();
    for m in parse_moves(3, name).expect("수 이름") {
        let dest = &move_table(3, &m).dest;
        let mut out = vec![0u8; 54];
        for (i, &c) in f.iter().enumerate() {
            out[dest[i] as usize] = c;
        }
        f = out;
    }
    let mm = read_cubie(&f, 3).expect("맞춘 큐브에 수 하나");
    let mut corner = [0u8; 24];
    let mut edge = [0u8; 24];
    for s2 in 0..8 {
        let s = mm.cp[s2] as usize;
        for o in 0..3 {
            corner[s * 3 + o] = (s2 * 3 + (o + mm.co[s2] as usize) % 3) as u8;
        }
    }
    for s2 in 0..12 {
        let s = mm.ep[s2] as usize;
        for o in 0..2 {
            edge[s * 2 + o] = (s2 * 2 + (o + mm.eo[s2] as usize) % 2) as u8;
        }
    }
    let center = CENTER_OFFSET
        .iter()
        .position(|&x| x == f[4])
        .expect("위 가운데") as u8;
    let (axis, order) = layer_of(name.chars().next().expect("수 이름"));
    PieceMove {
        name: name.to_string(),
        corner,
        edge,
        center,
        axis,
        order,
    }
}

/// 면 글자들의 수 셋(R → R R2 R', 사이트 `moveSet`)
fn move_set(layers: &str) -> Arc<Vec<PieceMove>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Arc<Vec<PieceMove>>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().unwrap().get(layers) {
        return hit.clone();
    }
    let set: Vec<PieceMove> = layers
        .chars()
        .flat_map(|l| ["", "2", "'"].map(|t| piece_move(&format!("{l}{t}"))))
        .collect();
    let set = Arc::new(set);
    cache
        .lock()
        .unwrap()
        .insert(layers.to_string(), set.clone());
    set
}

fn step(t: Tracked, coord: u8, m: &PieceMove) -> u8 {
    if t.0 {
        m.corner[coord as usize]
    } else {
        m.edge[coord as usize]
    }
}

fn home_of(t: Tracked) -> u8 {
    if t.0 {
        t.1 * 3
    } else {
        t.1 * 2
    }
}

type PdbCache = Mutex<HashMap<String, Arc<Vec<u8>>>>;

/// 조각 묶음(4개까지)의 거리 표(칸 번호 = Σ 좌표_k × 24^k, 사이트 `pdb`)
fn pdb(group: &[Tracked], layers: &str) -> Arc<Vec<u8>> {
    static CACHE: OnceLock<PdbCache> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let key = format!(
        "{}|{layers}",
        group
            .iter()
            .map(|t| format!("{}{}", if t.0 { 'c' } else { 'e' }, t.1))
            .collect::<Vec<_>>()
            .join(",")
    );
    if let Some(hit) = cache.lock().unwrap().get(&key) {
        return hit.clone();
    }
    let moves = move_set(layers);
    let k = group.len();
    let size = 24usize.pow(k as u32);
    let mut dist = vec![255u8; size];
    let mut queue = vec![0u32; size];
    let mut start = 0usize;
    for i in (0..k).rev() {
        start = start * 24 + home_of(group[i]) as usize;
    }
    dist[start] = 0;
    queue[0] = start as u32;
    let (mut head, mut tail) = (0, 1);
    let mut cur = vec![0u8; k];
    while head < tail {
        let idx = queue[head] as usize;
        head += 1;
        let mut rest = idx;
        for c in cur.iter_mut() {
            *c = (rest % 24) as u8;
            rest /= 24;
        }
        let d = dist[idx];
        for m in moves.iter() {
            let mut next = 0usize;
            for i in (0..k).rev() {
                next = next * 24 + step(group[i], cur[i], m) as usize;
            }
            if dist[next] == 255 {
                dist[next] = d + 1;
                queue[tail] = next as u32;
                tail += 1;
            }
        }
    }
    let table = Arc::new(dist);
    cache.lock().unwrap().insert(key, table.clone());
    table
}

/// 어림값: 조각 좌표와 가운데 층이 돈 만큼 → 남은 수의 아래 한도
type Heur = Box<dyn Fn(&[u8], u8) -> u8>;
type Goal = Box<dyn Fn(&[u8], u8) -> bool>;

/// 지켜볼 조각을 셋씩 묶은 거리 표의 가장 큰 값(사이트 `chunkHeuristic`)
fn chunk_heuristic(tracked: &[Tracked], layers: &str) -> Heur {
    let mut groups: Vec<(Vec<usize>, Arc<Vec<u8>>)> = vec![];
    let mut i = 0;
    while i < tracked.len() {
        let members: Vec<usize> = (i..(i + 3).min(tracked.len())).collect();
        let sub: Vec<Tracked> = members.iter().map(|&j| tracked[j]).collect();
        groups.push((members, pdb(&sub, layers)));
        i += 3;
    }
    Box::new(move |c, _| {
        let mut best = 0;
        for (members, table) in &groups {
            let mut idx = 0usize;
            for &m in members.iter().rev() {
                idx = idx * 24 + c[m] as usize;
            }
            best = best.max(table[idx]);
        }
        best
    })
}

/// 탐색 하나(사이트 `SearchSpec`)
struct Spec {
    tracked: Vec<Tracked>,
    start: Vec<u8>,
    center: u8,
    layers: &'static str,
    h: Heur,
    goal: Option<Goal>,
}

/// IDA*(사이트 `pieceSearch`). `depth`면 그 길이만, 아니면 `max_depth`까지 늘려 간다
fn piece_search(
    spec: &Spec,
    depth: Option<usize>,
    max_depth: Option<usize>,
) -> Option<Vec<String>> {
    let moves = move_set(spec.layers);
    let k = spec.tracked.len();
    let homes: Vec<u8> = spec.tracked.iter().map(|&t| home_of(t)).collect();
    struct Ctx<'a> {
        spec: &'a Spec,
        moves: &'a [PieceMove],
        homes: Vec<u8>,
        stack: Vec<Vec<u8>>,
        path: Vec<usize>,
    }
    fn dfs(c: &mut Ctx, depth: usize, togo: usize, center: u8, prev: Option<usize>) -> bool {
        if togo == 0 {
            let x = &c.stack[depth];
            return match &c.spec.goal {
                Some(g) => g(x, center),
                None => *x == c.homes,
            };
        }
        let k = c.spec.tracked.len();
        if c.stack.len() <= depth + 1 {
            c.stack.push(vec![0; k]);
        }
        for mi in 0..c.moves.len() {
            let m = &c.moves[mi];
            if let Some(p) = prev {
                let pm = &c.moves[p];
                if pm.axis == m.axis && m.order <= pm.order {
                    continue;
                }
            }
            for i in 0..k {
                let v = step(c.spec.tracked[i], c.stack[depth][i], m);
                c.stack[depth + 1][i] = v;
            }
            let nc = (center + m.center) % 4;
            if usize::from((c.spec.h)(&c.stack[depth + 1], nc)) > togo - 1 {
                continue;
            }
            if c.path.len() <= depth {
                c.path.push(mi);
            } else {
                c.path[depth] = mi;
            }
            if dfs(c, depth + 1, togo - 1, nc, Some(mi)) {
                return true;
            }
        }
        false
    }
    let _ = k;
    let mut ctx = Ctx {
        spec,
        moves: &moves,
        homes,
        stack: vec![spec.start.clone()],
        path: vec![],
    };
    let h0 = usize::from((spec.h)(&spec.start, spec.center));
    let lo = depth.unwrap_or(h0);
    let hi = depth.or(max_depth).unwrap_or(20);
    for d in lo..=hi {
        if d < h0 {
            continue;
        }
        if dfs(&mut ctx, 0, d, spec.center, None) {
            return Some(
                ctx.path[..d]
                    .iter()
                    .map(|&i| moves[i].name.clone())
                    .collect(),
            );
        }
    }
    None
}

// ── 단계(사이트 `methods-roux-zz.ts`) ─────────────────────

const fn c(piece: u8) -> Tracked {
    (true, piece)
}
const fn e(piece: u8) -> Tracked {
    (false, piece)
}

// 자리 번호: 코너 DFR 4, DLF 5, DBL 6, DRB 7 / 엣지 DR 4, DF 5, DL 6, DB 7, FR 8, FL 9, BL 10, BR 11
const LEFT_SQUARES: [[Tracked; 3]; 2] = [[e(6), c(5), e(9)], [e(6), c(6), e(10)]];
const LEFT_PAIRS: [[Tracked; 2]; 2] = [[c(6), e(10)], [c(5), e(9)]];
const RIGHT_SQUARES: [[Tracked; 3]; 2] = [[e(4), c(4), e(8)], [e(4), c(7), e(11)]];
const RIGHT_PAIRS: [[Tracked; 2]; 2] = [[c(7), e(11)], [c(4), e(8)]];
const LEFT_BLOCK: [Tracked; 5] = [e(6), e(9), e(10), c(5), c(6)];
const RIGHT_BLOCK: [Tracked; 5] = [e(4), e(8), e(11), c(4), c(7)];

const OUTER: &str = "URFDLB";
const FB_MOVES: &str = "URFDLBM";
const SB_MOVES: &str = "URrM";
const LSE_MOVES: &str = "UM";
const RUL_MOVES: &str = "RUL";
const Y_TURNS: [&str; 4] = ["", "y", "y2", "y'"];

fn probe_with(s: &Solve, alg: &str) -> Solve {
    let mut t = s.probe();
    t.apply(alg);
    t
}

fn center_of(s: &Solve) -> u8 {
    let up = s.rel()[4];
    CENTER_OFFSET.iter().position(|&x| x == up).unwrap_or(0) as u8
}

fn pieces_home(s: &Solve, tracked: &[Tracked]) -> R<bool> {
    let cb = s.cubie()?;
    Ok(tracked.iter().all(|&(corner, p)| {
        let p = p as usize;
        if corner {
            cb.cp[p] as usize == p && cb.co[p] == 0
        } else {
            cb.ep[p] as usize == p && cb.eo[p] == 0
        }
    }))
}

/// 후보 하나: 먼저 둘 큐브 돌리기와 그 뒤 상태에서 만드는 탐색
struct Candidate {
    pre: &'static str,
    spec: Box<dyn Fn(&Solve) -> R<Spec>>,
}

/// 후보 가운데 가장 짧게 끝나는 것을 길이 0부터 함께 찾아 둔다(사이트 `bestOf`)
fn best_of(s: &mut Solve, cands: &[Candidate], max_depth: usize) -> R<()> {
    let mut ready = vec![];
    for cand in cands {
        let t = probe_with(s, cand.pre);
        ready.push((cand.pre, (cand.spec)(&t)?));
    }
    for d in 0..=max_depth {
        for (pre, spec) in &ready {
            if let Some(path) = piece_search(spec, Some(d), None) {
                s.apply(pre);
                if !path.is_empty() {
                    s.apply(&path.join(" "));
                }
                return Ok(());
            }
        }
    }
    Err(SolveError("블록을 찾지 못했다"))
}

/// 지켜볼 조각이 모두 제자리가 되게(사이트 `blockSpec`)
fn block_spec(tracked: Vec<Tracked>, layers: &'static str) -> Box<dyn Fn(&Solve) -> R<Spec>> {
    Box::new(move |t| {
        Ok(Spec {
            start: coords_of(&t.cubie()?, &tracked),
            tracked: tracked.clone(),
            center: 0,
            layers,
            h: chunk_heuristic(&tracked, layers),
            goal: None,
        })
    })
}

/// 사각형(1×2×2) 후보 둘 중 쉬운 쪽 → 남은 짝(사이트 `squareThenPair`)
fn square_then_pair(
    s: &mut Solve,
    keep: &[Tracked],
    squares: &[[Tracked; 3]; 2],
    pairs: &[[Tracked; 2]; 2],
    layers: &'static str,
    turns: &[&'static str],
) -> R<()> {
    let mut cands = vec![];
    for &pre in turns {
        for sq in squares {
            let tracked: Vec<Tracked> = keep.iter().chain(sq.iter()).copied().collect();
            cands.push(Candidate {
                pre,
                spec: block_spec(tracked, layers),
            });
        }
    }
    best_of(s, &cands, 20)?;
    let mut i = None;
    for (k, sq) in squares.iter().enumerate() {
        let tracked: Vec<Tracked> = keep.iter().chain(sq.iter()).copied().collect();
        if pieces_home(s, &tracked)? {
            i = Some(k);
            break;
        }
    }
    let i = i.unwrap_or(0);
    let tracked: Vec<Tracked> = keep
        .iter()
        .chain(squares[i].iter())
        .chain(pairs[i].iter())
        .copied()
        .collect();
    best_of(
        s,
        &[Candidate {
            pre: "",
            spec: block_spec(tracked, layers),
        }],
        20,
    )
}

// ── 루 ─────────────────────────────────────────────────

fn blocks_ok(t: &Solve) -> bool {
    let all: Vec<Tracked> = LEFT_BLOCK
        .iter()
        .chain(RIGHT_BLOCK.iter())
        .copied()
        .collect();
    pieces_home(t, &all).unwrap_or(false)
}

/// CMLL(2단계): 위 코너 방향(공식 7가지) → 자리(2가지). 두 블록을 지킨다
fn cmll(s: &mut Solve) -> R<()> {
    apply_match(
        s,
        human_data::OCLL,
        &|t| blocks_ok(t) && t.cubie().is_ok_and(|cb| (0..4).all(|i| cb.co[i] == 0)),
        false,
    )?;
    apply_match(
        s,
        human_data::CPLL,
        &|t| {
            blocks_ok(t)
                && t.cubie().is_ok_and(|cb| {
                    cb.cp
                        .iter()
                        .enumerate()
                        .all(|(i, &p)| p as usize == i && cb.co[i] == 0)
                })
        },
        true,
    )
}

// LSE가 보는 조각: 위 엣지 넷(UR UF UL UB), 아래 앞·뒤(DF DB), 코너 하나(윗면 돌리기를 보려고)
const LSE_TRACKED: [Tracked; 7] = [e(0), e(1), e(2), e(3), e(5), e(7), c(0)];
const LSE_HOME: [u8; 7] = [0, 2, 4, 6, 10, 14, 0];

fn lse_eo_done(x: &[u8], center: u8) -> bool {
    center % 2 == 0 && (0..6).all(|i| x[i] % 2 == 0)
}

fn ulur_done(x: &[u8], center: u8) -> bool {
    lse_eo_done(x, center) && x[0] == LSE_HOME[0] && x[2] == LSE_HOME[2] && x[6] == LSE_HOME[6]
}

fn lse_solved(x: &[u8], center: u8) -> bool {
    center == 0 && LSE_HOME.iter().enumerate().all(|(i, &h)| x[i] == h)
}

fn lse(s: &mut Solve) -> R<()> {
    let names = [StageName::LseEo, StageName::LseUlur, StageName::LseEp];
    for (k, name) in names.into_iter().enumerate() {
        s.look();
        let (h, goal): (Heur, Goal) = match k {
            0 => (Box::new(|_, _| 0), Box::new(lse_eo_done)),
            1 => {
                let ulur = pdb(&[e(0), e(2), c(0)], LSE_MOVES);
                (
                    Box::new(move |x, _| {
                        ulur[x[0] as usize + 24 * x[2] as usize + 576 * x[6] as usize]
                    }),
                    Box::new(ulur_done),
                )
            }
            _ => (
                chunk_heuristic(&LSE_TRACKED, LSE_MOVES),
                Box::new(lse_solved),
            ),
        };
        let spec = Spec {
            tracked: LSE_TRACKED.to_vec(),
            start: coords_of(&s.cubie()?, &LSE_TRACKED),
            center: center_of(s),
            layers: LSE_MOVES,
            h,
            goal: Some(goal),
        };
        let path =
            piece_search(&spec, None, Some(20)).ok_or(SolveError("LSE 단계를 찾지 못했다"))?;
        if !path.is_empty() {
            s.apply(&path.join(" "));
        }
        s.stage(name);
    }
    Ok(())
}

/// 3×3 루(사이트 `solveRoux(state, { first })`): 첫 블록 → 둘째 블록 → CMLL → LSE
pub fn solve_roux(state: &State, first: usize) -> R<HumanSolve> {
    let f = facelets_first(3, state, first);
    let frame: [u8; 6] = std::array::from_fn(|k| f[k * 9 + 4]);
    let mut s = Solve::new(3, f, Some(frame));
    white_down(&mut s)?;
    square_then_pair(&mut s, &[], &LEFT_SQUARES, &LEFT_PAIRS, FB_MOVES, &Y_TURNS)?;
    s.stage(StageName::Fb);
    square_then_pair(&mut s, &[], &RIGHT_SQUARES, &RIGHT_PAIRS, SB_MOVES, &[""])?;
    s.stage(StageName::Sb);
    cmll(&mut s)?;
    s.stage(StageName::Cmll);
    lse(&mut s)?;
    finish(&s)
}

// ── ZZ ─────────────────────────────────────────────────

const DF_HOME: u8 = 10;
const DB_HOME: u8 = 14;

/// 엣지 방향(자리마다 뒤집힘 12비트)의 거리 표(사이트 `eoDistances`)
fn eo_distances() -> &'static Vec<u8> {
    static TABLE: OnceLock<Vec<u8>> = OnceLock::new();
    TABLE.get_or_init(|| {
        let moves = move_set(OUTER);
        let mut dist = vec![255u8; 4096];
        let mut queue: Vec<usize> = vec![0];
        dist[0] = 0;
        let mut head = 0;
        while head < queue.len() {
            let bits = queue[head];
            head += 1;
            for m in moves.iter() {
                let mut next = 0usize;
                for slot in 0..12 {
                    let to = m.edge[slot * 2 + ((bits >> slot) & 1)] as usize;
                    next |= (to & 1) << (to >> 1);
                }
                if dist[next] == 255 {
                    dist[next] = dist[bits] + 1;
                    queue.push(next);
                }
            }
        }
        dist
    })
}

fn eo_bits(x: &[u8]) -> usize {
    let mut bits = 0usize;
    for &v in &x[..12] {
        bits |= ((v & 1) as usize) << (v >> 1);
    }
    bits
}

fn eo_line_done(x: &[u8], _: u8) -> bool {
    eo_bits(x) == 0 && x[5] == DF_HOME && x[7] == DB_HOME
}

fn eo_line_spec(t: &Solve) -> R<Spec> {
    let edges: Vec<Tracked> = (0..12).map(e).collect();
    let eo = eo_distances();
    let line = pdb(&[e(5), e(7)], OUTER);
    Ok(Spec {
        start: coords_of(&t.cubie()?, &edges),
        tracked: edges,
        center: 0,
        layers: OUTER,
        h: Box::new(move |x, _| eo[eo_bits(x)].max(line[x[5] as usize + 24 * x[7] as usize])),
        goal: Some(Box::new(eo_line_done)),
    })
}

/// 3×3 ZZ(사이트 `solveZZ(state, { first })`): EO라인 → 왼쪽 블록 → 오른쪽 블록(R·U·L만) → 윗면(코너 7) → PLL
pub fn solve_zz(state: &State, first: usize) -> R<HumanSolve> {
    let mut s = Solve::new(3, facelets_first(3, state, first), None);
    white_down(&mut s)?;
    let cands: Vec<Candidate> = Y_TURNS
        .iter()
        .map(|&pre| Candidate {
            pre,
            spec: Box::new(eo_line_spec),
        })
        .collect();
    best_of(&mut s, &cands, 20)?;
    s.stage(StageName::Eoline);
    square_then_pair(&mut s, &[], &LEFT_SQUARES, &LEFT_PAIRS, RUL_MOVES, &[""])?;
    s.stage(StageName::ZzLeft);
    square_then_pair(
        &mut s,
        &LEFT_BLOCK,
        &RIGHT_SQUARES,
        &RIGHT_PAIRS,
        RUL_MOVES,
        &[""],
    )?;
    s.stage(StageName::ZzRight);
    apply_match(
        &mut s,
        human_data::OCLL,
        &|t| f2l_ok(t) && top_oriented(&t.rel(), 3),
        false,
    )?;
    s.stage(StageName::Oll);
    let pll: Vec<&str> = human_data::PLL.iter().map(|(_, alg)| *alg).collect();
    apply_match(&mut s, &pll, &|t| t.is_solved(), true)?;
    s.stage(StageName::Pll);
    finish(&s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{apply_alg, solved_cube};

    #[test]
    fn roux_and_zz_solve() {
        let s = apply_alg(3, &solved_cube(3), "R U2 F' L D B2 R' U F2 D' L2 B U' R2 F").unwrap();
        for solve in [solve_roux(&s, 0).unwrap(), solve_zz(&s, 0).unwrap()] {
            let all = solve.moves.join(" ");
            assert!(crate::is_solved(3, &apply_alg(3, &s, &all).unwrap()));
        }
    }
}
