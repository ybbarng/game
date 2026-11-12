//! 사람 흉내 해법(`packages/cube-ai`): 3×3 CFOP(`solveCfop`, 십자 → F2L 네 쌍 → OLL 57 → PLL 21)와 2×2 고수
//! (`solveAdvanced2`, 가장 짧은 첫 층 → 윗면 7 → 윗층 2). 사이트와 같은 탐색 차례라 같은 상태면 같은 수가 나온다.
//!
//! 옮긴 원본: `methods.ts`(해당 해법과 쓰는 단계), `solve.ts`(판·단계·수 합치기), `search.ts`(조각 몇 개의 IDA*),
//! `cubie.ts`(조각 표현·조각 좌표 수 표), `facelets.ts`(엔진 상태 → 스티커 글자), `ll.ts`(윗층 판정·공식 고르기).
//! 공식 표는 사이트 `algs.ts`에서 만든 [`crate::human_data`]다.
//!
//! 스티커 글자는 면 번호(0~5 = U R F D L B)로 든다. 해법기 스티커 차례는 엔진 스티커 차례와 같아서(사이트
//! `facelets.ts` 머리말), 수는 엔진 수 표([`move_table`])의 자리 옮김을 그대로 쓴다.

use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex, OnceLock};

use crate::human_data;
use crate::notation::{format_move, parse_moves, CubeMove};
use crate::state::{face_colors, move_table, State};

/// 해법이 끝까지 가지 못함(사이트는 `Error`를 던진다). 엔진이 만든 올바른 상태에서는 생기지 않는다
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SolveError(pub &'static str);

impl fmt::Display for SolveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

impl std::error::Error for SolveError {}

type R<T> = Result<T, SolveError>;

// ── 단계 이름 ─────────────────────────────────────────

/// 이 코어의 해법이 내는 단계(사이트 `StageName` 가운데)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StageName {
    Cross,
    F2l1,
    F2l2,
    F2l3,
    F2l4,
    Oll,
    Pll,
    FirstLayer,
}

impl StageName {
    /// 사이트 이름("f2l-1" 등)
    pub fn id(self) -> &'static str {
        match self {
            StageName::Cross => "cross",
            StageName::F2l1 => "f2l-1",
            StageName::F2l2 => "f2l-2",
            StageName::F2l3 => "f2l-3",
            StageName::F2l4 => "f2l-4",
            StageName::Oll => "oll",
            StageName::Pll => "pll",
            StageName::FirstLayer => "first-layer",
        }
    }

    /// 사이트 `STAGE_LABELS`
    pub fn label(self) -> &'static str {
        match self {
            StageName::Cross => "십자",
            StageName::F2l1 => "F2L 첫째 짝",
            StageName::F2l2 => "F2L 둘째 짝",
            StageName::F2l3 => "F2L 셋째 짝",
            StageName::F2l4 => "F2L 넷째 짝",
            StageName::Oll => "윗면(OLL)",
            StageName::Pll => "윗층 자리(PLL)",
            StageName::FirstLayer => "첫 층",
        }
    }
}

const PAIR_NAMES: [StageName; 4] = [
    StageName::F2l1,
    StageName::F2l2,
    StageName::F2l3,
    StageName::F2l4,
];

/// 해법의 단계 하나(`moves` 안 번호)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SolveStage {
    pub name: StageName,
    pub start: usize,
    /// 마지막 수 다음 번호. start == end면 수 없이 지나간 단계
    pub end: usize,
}

/// 사이트 `HumanSolve`
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HumanSolve {
    /// WCA 표기 수 목록(큐브 돌리기 x·y·z, 3×3의 M·E·S 포함)
    pub moves: Vec<String>,
    pub stages: Vec<SolveStage>,
    /// 단계 안에서 다음 모양을 살피는 자리(이 번호의 수 앞)
    pub looks: Vec<usize>,
}

// ── 판(사이트 `Solve`) ─────────────────────────────────

const OPPOSITE: [u8; 6] = [3, 4, 5, 0, 1, 2];
const SOLVED_FRAME: [u8; 6] = [0, 1, 2, 3, 4, 5];

#[derive(Clone)]
struct Solve {
    n: usize,
    /// 자리마다 실제 색 글자(면 번호)
    f: Vec<u8>,
    /// 2×2만: 면 k에 와야 할 색. 3×3은 None(가운데 색을 본다)
    frame: Option<[u8; 6]>,
    moves: Vec<CubeMove>,
    stage_list: Vec<SolveStage>,
    look_list: Vec<usize>,
}

impl Solve {
    fn new(n: usize, f: Vec<u8>, frame: Option<[u8; 6]>) -> Self {
        Solve {
            n,
            f,
            frame: frame.or(if n == 3 { None } else { Some(SOLVED_FRAME) }),
            moves: vec![],
            stage_list: vec![],
            look_list: vec![],
        }
    }

    /// 수 목록 없이 스티커만(공식을 시험해 볼 때)
    fn probe(&self) -> Solve {
        Solve {
            n: self.n,
            f: self.f.clone(),
            frame: self.frame,
            moves: vec![],
            stage_list: vec![],
            look_list: vec![],
        }
    }

    fn apply(&mut self, alg: &str) -> &mut Self {
        for m in parse_moves(self.n, alg).expect("해법 공식") {
            self.apply_move(m);
        }
        self
    }

    fn apply_move(&mut self, m: CubeMove) {
        let dest = &move_table(self.n, &m).dest;
        let mut out = vec![0u8; self.f.len()];
        for (i, &c) in self.f.iter().enumerate() {
            out[dest[i] as usize] = c;
        }
        self.f = out;
        if let Some(frame) = self.frame {
            if m.is_rotation(self.n) {
                self.frame = Some(rotate_frame(&frame, &m));
            }
        }
        self.moves.push(m);
    }

    /// 기준 방향 글자
    fn rel(&self) -> Vec<u8> {
        let nn = self.n * self.n;
        let mut to_rel = [0u8; 6];
        for k in 0..6 {
            let color = match self.frame {
                Some(fr) => fr[k],
                None => self.f[k * nn + (nn - 1) / 2],
            };
            to_rel[color as usize] = k as u8;
        }
        self.f.iter().map(|&c| to_rel[c as usize]).collect()
    }

    fn cubie(&self) -> R<Cubie> {
        read_cubie(&self.rel(), self.n)
    }

    fn is_solved(&self) -> bool {
        let nn = self.n * self.n;
        self.f
            .iter()
            .enumerate()
            .all(|(i, &c)| c == self.f[(i / nn) * nn])
    }

    fn stage(&mut self, name: StageName) {
        let start = self.stage_list.last().map_or(0, |s| s.end);
        self.stage_list.push(SolveStage {
            name,
            start,
            end: self.moves.len(),
        });
    }

    fn look(&mut self) {
        if self.look_list.last() != Some(&self.moves.len()) {
            self.look_list.push(self.moves.len());
        }
    }

    fn result(&self) -> HumanSolve {
        let mut moves = Vec::new();
        let mut stages = Vec::new();
        let mut looks = Vec::new();
        for st in &self.stage_list {
            let raw: Vec<(CubeMove, bool)> = (st.start..st.end)
                .map(|i| (self.moves[i], self.look_list.contains(&i)))
                .collect();
            let start = moves.len();
            for (i, (m, look)) in merge_marked(&raw).into_iter().enumerate() {
                if look && i > 0 {
                    looks.push(moves.len());
                }
                moves.push(format_move(self.n, &m));
            }
            stages.push(SolveStage {
                name: st.name,
                start,
                end: moves.len(),
            });
        }
        HumanSolve {
            moves,
            stages,
            looks,
        }
    }
}

/// 이어진 같은 층 수 합치기(사이트 `mergeMarked`, 살피는 자리 막기 없음)
fn merge_marked(list: &[(CubeMove, bool)]) -> Vec<(CubeMove, bool)> {
    let mut out: Vec<(CubeMove, bool)> = Vec::new();
    let mut carry = false;
    for &(m, look) in list {
        match out.last().copied() {
            Some((last, last_look))
                if last.axis == m.axis && last.from == m.from && last.to == m.to =>
            {
                let turns = (last.turns + m.turns) % 4;
                out.pop();
                if turns != 0 {
                    out.push((CubeMove { turns, ..m }, last_look || look || carry));
                    carry = false;
                } else {
                    carry = carry || last_look || look;
                }
            }
            _ => {
                out.push((m, look || carry));
                carry = false;
            }
        }
    }
    out
}

fn rotate_frame(frame: &[u8; 6], m: &CubeMove) -> [u8; 6] {
    let dest = &move_table(
        3,
        &CubeMove {
            from: 1,
            to: 3,
            ..*m
        },
    )
    .dest;
    let mut out = *frame;
    for k in 0..6 {
        out[dest[k * 9 + 4] as usize / 9] = frame[k];
    }
    out
}

fn u_turn(a: usize) -> &'static str {
    ["", "U", "U2", "U'"][a % 4]
}

// ── 조각 표현(사이트 `cubie.ts`) ─────────────────────────

struct Cubie {
    cp: Vec<u8>,
    co: Vec<u8>,
    ep: Vec<u8>,
    eo: Vec<u8>,
}

const CORNER_FACELETS_3: [[usize; 3]; 8] = [
    [8, 9, 20],
    [6, 18, 38],
    [0, 36, 47],
    [2, 45, 11],
    [29, 26, 15],
    [27, 44, 24],
    [33, 53, 42],
    [35, 17, 51],
];

const EDGE_FACELETS: [[usize; 2]; 12] = [
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

/// URF UFL ULB UBR DFR DLF DBL DRB(면 번호)
const CORNER_NAMES: [[u8; 3]; 8] = [
    [0, 1, 2],
    [0, 2, 4],
    [0, 4, 5],
    [0, 5, 1],
    [3, 2, 1],
    [3, 4, 2],
    [3, 5, 4],
    [3, 1, 5],
];

/// UR UF UL UB DR DF DL DB FR FL BL BR
const EDGE_NAMES: [[u8; 2]; 12] = [
    [0, 1],
    [0, 2],
    [0, 4],
    [0, 5],
    [3, 1],
    [3, 2],
    [3, 4],
    [3, 5],
    [2, 1],
    [2, 4],
    [5, 4],
    [5, 1],
];

fn corner_facelets(n: usize) -> [[usize; 3]; 8] {
    CORNER_FACELETS_3.map(|corner| {
        corner.map(|i| {
            let face = i / 9;
            let p = i % 9;
            let r = if p / 3 == 0 { 0 } else { n - 1 };
            let c = if p % 3 == 0 { 0 } else { n - 1 };
            face * n * n + r * n + c
        })
    })
}

fn read_cubie(rel: &[u8], n: usize) -> R<Cubie> {
    let mut c = Cubie {
        cp: vec![],
        co: vec![],
        ep: vec![],
        eo: vec![],
    };
    for slot in corner_facelets(n) {
        let t = slot.map(|i| rel[i]);
        let ori = t
            .iter()
            .position(|&x| x == 0 || x == 3)
            .ok_or(SolveError("꼭짓점 색 조합이 없다"))?;
        let name = [t[ori], t[(ori + 1) % 3], t[(ori + 2) % 3]];
        let piece = CORNER_NAMES
            .iter()
            .position(|&x| x == name)
            .ok_or(SolveError("꼭짓점 색 조합이 없다"))?;
        c.cp.push(piece as u8);
        c.co.push(ori as u8);
    }
    if n == 3 {
        for [a, b] in EDGE_FACELETS {
            let (x, y) = (rel[a], rel[b]);
            let (piece, ori) = match EDGE_NAMES.iter().position(|&e| e == [x, y]) {
                Some(p) => (p, 0),
                None => (
                    EDGE_NAMES
                        .iter()
                        .position(|&e| e == [y, x])
                        .ok_or(SolveError("모서리 색 조합이 없다"))?,
                    1,
                ),
            };
            c.ep.push(piece as u8);
            c.eo.push(ori);
        }
    }
    Ok(c)
}

const FACE_MOVE_COUNT: usize = 18;
const FACE_LETTERS: [&str; 6] = ["U", "R", "F", "D", "L", "B"];

fn face_move_name(m: usize) -> String {
    format!("{}{}", FACE_LETTERS[m / 3], ["", "2", "'"][m % 3])
}

struct CoordTables {
    corner: Vec<u8>,
    edge: Vec<u8>,
}

fn coord_tables() -> &'static CoordTables {
    static CACHE: OnceLock<CoordTables> = OnceLock::new();
    CACHE.get_or_init(|| {
        let mut corner = vec![0u8; 24 * FACE_MOVE_COUNT];
        let mut edge = vec![0u8; 24 * FACE_MOVE_COUNT];
        let solved: Vec<u8> = (0..54).map(|i| (i / 9) as u8).collect();
        for m in 0..FACE_MOVE_COUNT {
            let face = m / 3;
            let positive = face < 3;
            let turns = (m % 3 + 1) as u8;
            let layer = if positive { 1 } else { 3 };
            let axis = [1, 0, 2][face % 3];
            let mut s = Solve::new(3, solved.clone(), None);
            s.apply_move(CubeMove {
                axis,
                from: layer,
                to: layer,
                turns: if positive { turns } else { 4 - turns },
            });
            let mm = read_cubie(&s.f, 3).expect("맞춘 큐브");
            for s2 in 0..8 {
                let s = mm.cp[s2] as usize;
                for o in 0..3 {
                    corner[(s * 3 + o) * FACE_MOVE_COUNT + m] =
                        (s2 * 3 + (o + mm.co[s2] as usize) % 3) as u8;
                }
            }
            for s2 in 0..12 {
                let s = mm.ep[s2] as usize;
                for o in 0..2 {
                    edge[(s * 2 + o) * FACE_MOVE_COUNT + m] =
                        (s2 * 2 + (o + mm.eo[s2] as usize) % 2) as u8;
                }
            }
        }
        CoordTables { corner, edge }
    })
}

// ── 조각 몇 개의 탐색(사이트 `search.ts`) ──────────────────

/// 지켜볼 조각: (꼭짓점인가, 조각 번호)
type Tracked = (bool, u8);

fn home_coord(t: Tracked) -> u8 {
    if t.0 {
        t.1 * 3
    } else {
        t.1 * 2
    }
}

fn coords_of(c: &Cubie, tracked: &[Tracked]) -> Vec<u8> {
    tracked
        .iter()
        .map(|&(corner, piece)| {
            if corner {
                let s = c.cp.iter().position(|&p| p == piece).unwrap();
                (s * 3) as u8 + c.co[s]
            } else {
                let s = c.ep.iter().position(|&p| p == piece).unwrap();
                (s * 2) as u8 + c.eo[s]
            }
        })
        .collect()
}

type TableCache = Mutex<HashMap<Vec<Tracked>, Arc<Vec<u8>>>>;

/// 조각 묶음의 거리 표(칸 번호 = Σ 좌표_k × 24^k). 묶음마다 한 번 만들어 모든 스레드가 함께 쓴다
fn distance_table(tracked: &[Tracked]) -> Arc<Vec<u8>> {
    static CACHE: OnceLock<TableCache> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().unwrap().get(tracked) {
        return hit.clone();
    }
    let t = coord_tables();
    let k = tracked.len();
    let size = 24usize.pow(k as u32);
    let mut dist = vec![255u8; size];
    let mut queue = vec![0u32; size];
    let mut start = 0usize;
    for i in (0..k).rev() {
        start = start * 24 + home_coord(tracked[i]) as usize;
    }
    dist[start] = 0;
    queue[0] = start as u32;
    let (mut head, mut tail) = (0, 1);
    let mut cur = vec![0usize; k];
    while head < tail {
        let idx = queue[head] as usize;
        head += 1;
        let mut rest = idx;
        for c in cur.iter_mut() {
            *c = rest % 24;
            rest /= 24;
        }
        let d = dist[idx];
        for m in 0..FACE_MOVE_COUNT {
            let mut next = 0usize;
            for i in (0..k).rev() {
                let table = if tracked[i].0 { &t.corner } else { &t.edge };
                next = next * 24 + table[cur[i] * FACE_MOVE_COUNT + m] as usize;
            }
            if dist[next] == 255 {
                dist[next] = d + 1;
                queue[tail] = next as u32;
                tail += 1;
            }
        }
    }
    let table = Arc::new(dist);
    cache
        .lock()
        .unwrap()
        .insert(tracked.to_vec(), table.clone());
    table
}

struct Heuristic {
    members: Vec<usize>,
    table: Arc<Vec<u8>>,
}

fn heuristic(tracked: &[Tracked], members: Vec<usize>) -> Heuristic {
    let sub: Vec<Tracked> = members.iter().map(|&i| tracked[i]).collect();
    Heuristic {
        table: distance_table(&sub),
        members,
    }
}

#[derive(Clone, Copy, Default)]
struct SearchOpts {
    max_depth: Option<usize>,
    depth: Option<usize>,
}

struct Ida<'a> {
    tracked: &'a [Tracked],
    hs: &'a [Heuristic],
    moves: &'a [usize],
    goal: Vec<u8>,
    stack: Vec<Vec<u8>>,
    path: Vec<usize>,
}

impl Ida<'_> {
    fn h(&self, c: &[u8]) -> u8 {
        let mut best = 0;
        for hh in self.hs {
            let mut idx = 0usize;
            for &mi in hh.members.iter().rev() {
                idx = idx * 24 + c[mi] as usize;
            }
            best = best.max(hh.table[idx]);
        }
        best
    }

    fn dfs(&mut self, depth: usize, togo: usize, prev_face: Option<usize>) -> bool {
        if togo == 0 {
            return self.stack[depth] == self.goal;
        }
        if self.stack.len() <= depth + 1 {
            self.stack.push(vec![0; self.tracked.len()]);
        }
        let t = coord_tables();
        for mi in 0..self.moves.len() {
            let m = self.moves[mi];
            let face = m / 3;
            if let Some(p) = prev_face {
                if face == p || face + 3 == p {
                    continue;
                }
            }
            for i in 0..self.tracked.len() {
                let table = if self.tracked[i].0 {
                    &t.corner
                } else {
                    &t.edge
                };
                self.stack[depth + 1][i] =
                    table[self.stack[depth][i] as usize * FACE_MOVE_COUNT + m];
            }
            if usize::from(self.h(&self.stack[depth + 1])) > togo - 1 {
                continue;
            }
            if self.path.len() <= depth {
                self.path.push(m);
            } else {
                self.path[depth] = m;
            }
            if self.dfs(depth + 1, togo - 1, Some(face)) {
                return true;
            }
        }
        false
    }
}

/// 지켜볼 조각이 모두 제자리·제방향이 되는 가장 짧은 수(사이트 `idaSearch`)
fn ida_search(
    start: Vec<u8>,
    tracked: &[Tracked],
    hs: &[Heuristic],
    moves: &[usize],
    opts: SearchOpts,
) -> Option<Vec<usize>> {
    let mut ida = Ida {
        tracked,
        hs,
        moves,
        goal: tracked.iter().map(|&t| home_coord(t)).collect(),
        stack: vec![start],
        path: vec![],
    };
    let h0 = usize::from(ida.h(&ida.stack[0]));
    let lo = opts.depth.unwrap_or(h0);
    let hi = opts.depth.or(opts.max_depth).unwrap_or(20);
    for d in lo..=hi {
        if d < h0 {
            continue;
        }
        if ida.dfs(0, d, None) {
            ida.path.truncate(d);
            return Some(ida.path);
        }
    }
    None
}

fn all_moves() -> Vec<usize> {
    (0..FACE_MOVE_COUNT).collect()
}

/// F2L은 D를 돌리지 않는다
fn no_d_moves() -> Vec<usize> {
    (0..FACE_MOVE_COUNT).filter(|m| m / 3 != 3).collect()
}

fn apply_path(s: &mut Solve, path: &[usize]) {
    let text: Vec<String> = path.iter().map(|&m| face_move_name(m)).collect();
    s.apply(&text.join(" "));
}

// ── 윗층 판정과 공식 고르기(사이트 `ll.ts`) ─────────────────

fn lower_solved(rel: &[u8], n: usize) -> bool {
    let nn = n * n;
    (0..nn).all(|i| rel[3 * nn + i] == 3)
        && [1usize, 2, 4, 5]
            .iter()
            .all(|&face| (n..nn).all(|i| rel[face * nn + i] == face as u8))
}

fn top_oriented(rel: &[u8], n: usize) -> bool {
    rel[..n * n].iter().all(|&c| c == 0)
}

fn reached(s: &Solve, goal: &dyn Fn(&Solve) -> bool, post_auf: bool) -> Option<usize> {
    if !post_auf {
        return goal(s).then_some(0);
    }
    (0..4).find(|&b| {
        if b == 0 {
            goal(s)
        } else {
            goal(s.probe().apply(u_turn(b)))
        }
    })
}

/// 목표에 닿는 공식을 찾아 실제로 둔다(사이트 `applyMatch`)
fn apply_match(
    s: &mut Solve,
    algs: &[&str],
    goal: &dyn Fn(&Solve) -> bool,
    post_auf: bool,
) -> R<()> {
    if let Some(post) = reached(s, goal, post_auf) {
        s.apply(u_turn(post));
        return Ok(());
    }
    for pre in 0..4 {
        let mut base = s.probe();
        base.apply(u_turn(pre));
        for alg in algs {
            let mut t = base.probe();
            t.apply(alg);
            if let Some(post) = reached(&t, goal, post_auf) {
                s.apply(u_turn(pre)).apply(alg).apply(u_turn(post));
                return Ok(());
            }
        }
    }
    Err(SolveError("맞는 공식을 찾지 못했다"))
}

fn f2l_ok(s: &Solve) -> bool {
    lower_solved(&s.rel(), s.n)
}

// ── 3×3 CFOP ───────────────────────────────────────────

fn white_down(s: &mut Solve) -> R<()> {
    for r in ["", "z2", "x", "x'", "z", "z'"] {
        let mut t = s.probe();
        t.apply(r);
        if t.f[31] == 0 {
            s.apply(r);
            return Ok(());
        }
    }
    Err(SolveError("흰 가운데를 찾지 못했다"))
}

const CROSS_EDGES: [u8; 4] = [4, 5, 6, 7];

fn cross_optimal(s: &mut Solve) -> R<()> {
    let tracked: Vec<Tracked> = CROSS_EDGES.iter().map(|&p| (false, p)).collect();
    let hs = [heuristic(&tracked, vec![0, 1, 2, 3])];
    let start = coords_of(&s.cubie()?, &tracked);
    let path = ida_search(
        start,
        &tracked,
        &hs,
        &all_moves(),
        SearchOpts {
            max_depth: Some(8),
            depth: None,
        },
    )
    .ok_or(SolveError("십자를 찾지 못했다"))?;
    apply_path(s, &path);
    Ok(())
}

/// F2L 네 쌍: 남은 쌍마다 지키며 넣는 가장 짧은 수를 길이 0부터 함께 찾아 가장 짧은 쌍부터(사이트 `insertBySearch`)
fn f2l_pairs(s: &mut Solve) -> R<()> {
    let moves = no_d_moves();
    let mut done: Vec<u8> = vec![];
    for name in PAIR_NAMES {
        s.look();
        let remaining: Vec<u8> = (0..4).filter(|p| !done.contains(p)).collect();
        let cubie = s.cubie()?;
        let mut found: Option<(u8, Vec<usize>)> = None;
        'depth: for depth in 0..=16 {
            for &pair in &remaining {
                let mut tracked: Vec<Tracked> = CROSS_EDGES.iter().map(|&p| (false, p)).collect();
                let mut hs = vec![heuristic(&tracked, vec![0, 1, 2, 3])];
                for &q in done.iter().chain(std::iter::once(&pair)) {
                    tracked.push((true, 4 + q));
                    tracked.push((false, 8 + q));
                    let len = tracked.len();
                    hs.push(heuristic(&tracked, vec![len - 2, len - 1]));
                }
                let path = ida_search(
                    coords_of(&cubie, &tracked),
                    &tracked,
                    &hs,
                    &moves,
                    SearchOpts {
                        max_depth: None,
                        depth: Some(depth),
                    },
                );
                if let Some(path) = path {
                    found = Some((pair, path));
                    break 'depth;
                }
            }
        }
        let (pair, path) = found.ok_or(SolveError("넣을 수를 찾지 못했다"))?;
        apply_path(s, &path);
        done.push(pair);
        s.stage(name);
    }
    Ok(())
}

fn finish(s: &Solve) -> R<HumanSolve> {
    if !s.is_solved() {
        return Err(SolveError("다 맞추지 못했다"));
    }
    Ok(s.result())
}

/// 3×3 고수(사이트 `solveCfop`, 첫 면 흰색): 흰 면 아래로 쥐고 십자(가장 짧게) → F2L 네 쌍 → OLL 57 → PLL 21
pub fn solve_cfop(state: &State) -> R<HumanSolve> {
    let mut s = Solve::new(3, face_colors(3, state), None);
    white_down(&mut s)?;
    cross_optimal(&mut s)?;
    s.stage(StageName::Cross);
    f2l_pairs(&mut s)?;
    apply_match(
        &mut s,
        human_data::OLL,
        &|t| f2l_ok(t) && top_oriented(&t.rel(), 3),
        false,
    )?;
    s.stage(StageName::Oll);
    let pll: Vec<&str> = human_data::PLL.iter().map(|(_, alg)| *alg).collect();
    apply_match(&mut s, &pll, &|t| t.is_solved(), true)?;
    s.stage(StageName::Pll);
    finish(&s)
}

// ── 2×2 ───────────────────────────────────────────────

/// 2×2 기준 방향: 흰 꼭짓점 하나(아래층에 있으면 그것)를 아래 앞 오른쪽 조각으로 본다(사이트 `start2`)
fn start2(state: &State) -> R<Solve> {
    let f = face_colors(2, state);
    let slots = corner_facelets(2);
    for slot in [4, 5, 6, 7, 0, 1, 2, 3] {
        let t = slots[slot].map(|i| f[i]);
        let Some(w) = t.iter().position(|&x| x == 0) else {
            continue;
        };
        let (down, front, right) = (t[w], t[(w + 1) % 3], t[(w + 2) % 3]);
        let mut frame = SOLVED_FRAME;
        frame[3] = down;
        frame[2] = front;
        frame[1] = right;
        frame[0] = OPPOSITE[down as usize];
        frame[5] = OPPOSITE[front as usize];
        frame[4] = OPPOSITE[right as usize];
        return Ok(Solve::new(2, f, Some(frame)));
    }
    Err(SolveError("흰 꼭짓점을 찾지 못했다"))
}

/// 2×2 고수(사이트 `solveAdvanced2`): 가장 짧은 첫 층 → 윗면 공식 7개 → 윗층 공식 2개
pub fn solve_advanced2(state: &State) -> R<HumanSolve> {
    let mut s = start2(state)?;
    let tracked: Vec<Tracked> = [4, 5, 6, 7].iter().map(|&p| (true, p)).collect();
    let hs = [heuristic(&tracked, vec![0, 1, 2, 3])];
    let path = ida_search(
        coords_of(&s.cubie()?, &tracked),
        &tracked,
        &hs,
        &all_moves(),
        SearchOpts::default(),
    )
    .ok_or(SolveError("첫 층을 찾지 못했다"))?;
    apply_path(&mut s, &path);
    s.stage(StageName::FirstLayer);
    apply_match(
        &mut s,
        human_data::OCLL_2X2,
        &|t| f2l_ok(t) && top_oriented(&t.rel(), 2),
        false,
    )?;
    s.stage(StageName::Oll);
    apply_match(&mut s, human_data::CPLL, &|t| t.is_solved(), true)?;
    s.stage(StageName::Pll);
    finish(&s)
}
