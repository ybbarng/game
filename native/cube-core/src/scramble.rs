//! 대회 규칙 섞기(`packages/cube-scramble/src/index.ts`). 같은 씨앗이면 사이트와 같은 섞기 글이 나온다.
//!
//! - 2×2: 4수 이상 필요한 무작위 상태를 딱 11수의 U·R·F로 만든다.
//! - 3×3·3×3 블라인드: 2수 이상 필요한 무작위 상태를 해법기로 풀고 그 해의 거꾸로(21수 이하). 블라인드는 끝에 방향 돌리기.
//! - 4×4: 무작위 수 40수(`official: false`). 5×5·6×6·7×7: 무작위 수 60·80·100수.

use crate::rng::Rng;
use crate::solver::cubie::{face_move_cubies, CubieCube, SOLVED};
use crate::solver::invert_algorithm;
use crate::solver::perm::parity;
use crate::solver::pocket::{pocket_apply, pocket_distance, POCKET_STATE_COUNT};
use crate::solver::two_phase::solve_3x3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScrambleEvent {
    E222,
    E333,
    E333bf,
    E444,
    E555,
    E666,
    E777,
}

impl ScrambleEvent {
    pub const ALL: [ScrambleEvent; 7] = [
        ScrambleEvent::E222,
        ScrambleEvent::E333,
        ScrambleEvent::E333bf,
        ScrambleEvent::E444,
        ScrambleEvent::E555,
        ScrambleEvent::E666,
        ScrambleEvent::E777,
    ];

    /// WCA 종목 번호("222", "333bf" 등)
    pub fn id(self) -> &'static str {
        match self {
            ScrambleEvent::E222 => "222",
            ScrambleEvent::E333 => "333",
            ScrambleEvent::E333bf => "333bf",
            ScrambleEvent::E444 => "444",
            ScrambleEvent::E555 => "555",
            ScrambleEvent::E666 => "666",
            ScrambleEvent::E777 => "777",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|e| e.id() == id)
    }

    /// 큐브 크기
    pub fn size(self) -> usize {
        (self.id().as_bytes()[0] - b'0') as usize
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Scramble {
    pub event: ScrambleEvent,
    /// WCA 표기, 공백으로 나눈다
    pub text: String,
    /// 대회 공식 섞기와 같은 방식인가(4×4 무작위 수는 아니다)
    pub official: bool,
}

pub const MIN_222_DISTANCE: u8 = 4;
pub const SCRAMBLE_222_LENGTH: usize = 11;
pub const MAX_333_LENGTH: usize = 21;

pub fn scramble(event: ScrambleEvent, seed: u32) -> Scramble {
    let mut rng = Rng::new(seed);
    let (text, official) = match event {
        ScrambleEvent::E222 => (scramble_222(&mut rng), true),
        ScrambleEvent::E333 => (scramble_333(&mut rng, None), true),
        ScrambleEvent::E333bf => {
            // 방향 돌리기를 먼저 고르고, 섞기 마지막 수가 그 첫 수와 같은 축이 되지 않게 한다
            let orientation = random_orientation(&mut rng);
            let axis = orientation.first().map(|m| match &m[..1] {
                "R" => 1,
                "F" => 2,
                _ => 0,
            });
            let text = scramble_333(&mut rng, axis);
            let mut parts = vec![text];
            parts.extend(orientation.iter().map(|s| s.to_string()));
            (parts.join(" "), true)
        }
        ScrambleEvent::E444 => (random_moves(4, &mut rng), false),
        ScrambleEvent::E555 => (random_moves(5, &mut rng), true),
        ScrambleEvent::E666 => (random_moves(6, &mut rng), true),
        ScrambleEvent::E777 => (random_moves(7, &mut rng), true),
    };
    Scramble {
        event,
        text,
        official,
    }
}

fn scramble_222(rng: &mut Rng) -> String {
    loop {
        let index = rng.next_int(POCKET_STATE_COUNT);
        if pocket_distance(index) < MIN_222_DISTANCE {
            continue;
        }
        if let Some(text) = pocket_scramble_exactly(index, SCRAMBLE_222_LENGTH) {
            return text;
        }
    }
}

/// 해 수(0~8: U U2 U' R R2 R' F F2 F')의 거꾸로 = 섞기 글에 적는 수
const POCKET_INVERSE: [&str; 9] = ["U'", "U2", "U", "R'", "R2", "R", "F'", "F2", "F"];

/// 2×2 상태를 딱 `length`수의 U·R·F로 만드는 섞기(TNoodle `generateExactly`). 손가락 비용이 가장 낮은 해의 거꾸로
pub fn pocket_scramble_exactly(index: u32, length: usize) -> Option<String> {
    struct Ctx {
        solution: Vec<u8>,
        best: Option<Vec<u8>>,
        best_cost: u32,
        length: usize,
    }
    fn search(ctx: &mut Ctx, state: u32, depth: usize, last_face: Option<u8>) {
        let togo = ctx.length - depth;
        if togo == 0 {
            if state != 0 {
                return;
            }
            let cost = scramble_cost(&ctx.solution, ctx.length as i32 - 1, 0, 0);
            if cost < ctx.best_cost {
                ctx.best_cost = cost;
                ctx.best = Some(ctx.solution.clone());
            }
            return;
        }
        if pocket_distance(state) as usize > togo {
            return;
        }
        for mv in 0..9u8 {
            let face = mv / 3;
            if Some(face) == last_face {
                continue;
            }
            ctx.solution[depth] = mv;
            search(ctx, pocket_apply(state, mv as usize), depth + 1, Some(face));
        }
    }
    let mut ctx = Ctx {
        solution: vec![0; length],
        best: None,
        best_cost: u32::MAX,
        length,
    };
    search(&mut ctx, index, 0, None);
    let found = ctx.best?;
    Some(
        found
            .iter()
            .rev()
            .map(|&m| POCKET_INVERSE[m as usize])
            .collect::<Vec<_>>()
            .join(" "),
    )
}

/// 섞기를 손으로 돌리는 비용(TNoodle `computeCost`). `grip`은 오른손 엄지 자리: -1 아래, 0 앞, 1 위
fn scramble_cost(solution: &[u8], index: i32, cost: u32, grip: i32) -> u32 {
    if index < 0 {
        return cost;
    }
    let next = |add: u32, g: i32| scramble_cost(solution, index - 1, cost + add, g);
    const REGRIP: u32 = 20;
    match solution[index as usize] {
        0 => next(7, grip),
        1 => next(10, grip),
        2 => {
            if grip == 0 {
                next(8, 0)
            } else if grip == -1 {
                next(REGRIP + 8, 0).min(next(20, grip))
            } else {
                next(REGRIP + 8, 0)
            }
        }
        3 => {
            if grip > -1 {
                next(6, grip - 1)
            } else {
                next(REGRIP + 6, -1)
            }
        }
        4 => {
            if grip != 0 {
                next(10, -grip)
            } else {
                next(REGRIP + 10, -1).min(next(REGRIP + 10, 1))
            }
        }
        5 => {
            if grip < 1 {
                next(6, grip + 1)
            } else {
                next(REGRIP + 6, 1)
            }
        }
        6 => {
            if grip != 0 {
                next(19, grip)
            } else {
                next(REGRIP + 19, -1).min(next(REGRIP + 19, 1))
            }
        }
        7 => {
            if grip == -1 {
                next(30, -1)
            } else {
                next(REGRIP + 30, -1)
            }
        }
        _ => {
            if grip == -1 {
                next(10, -1)
            } else {
                next(REGRIP + 10, -1)
            }
        }
    }
}

fn random_cube_333(rng: &mut Rng) -> CubieCube {
    let mut cp = [0u8, 1, 2, 3, 4, 5, 6, 7];
    rng.shuffle(&mut cp);
    let mut ep = [0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    rng.shuffle(&mut ep);
    if parity(&cp) != parity(&ep) {
        ep.swap(0, 1);
    }
    let mut co = [0u8; 8];
    for c in co.iter_mut().take(7) {
        *c = rng.next_int(3) as u8;
    }
    let sum: u32 = co[..7].iter().map(|&x| u32::from(x)).sum();
    co[7] = ((3 - sum % 3) % 3) as u8;
    let mut eo = [0u8; 12];
    for e in eo.iter_mut().take(11) {
        *e = rng.next_int(2) as u8;
    }
    let sum: u32 = eo[..11].iter().map(|&x| u32::from(x)).sum();
    eo[11] = (sum % 2) as u8;
    CubieCube { cp, co, ep, eo }
}

/// 1수 이하로 풀리는가(맞춘 상태 포함). 사이트 `solvableWithin(facelets, 1)`과 같다:
/// 가운데가 기본 방향인 3×3에서 「한 수 두면 맞음」은 「그 수의 거꾸로와 같은 상태」다
fn trivial_333(c: &CubieCube) -> bool {
    *c == SOLVED || face_move_cubies().iter().any(|m| m == c)
}

fn scramble_333(rng: &mut Rng, last_axis_not: Option<usize>) -> String {
    loop {
        let cube = random_cube_333(rng);
        if trivial_333(&cube) {
            continue;
        }
        let solution =
            solve_3x3(&cube, MAX_333_LENGTH, last_axis_not).expect("21수 안에서 해를 찾지 못했다");
        return invert_algorithm(&solution);
    }
}

/// 블라인드 방향 돌리기(TNoodle `getRandomOrientationMoves`): 24가지가 같은 확률, 0~2수
pub fn random_orientation(rng: &mut Rng) -> Vec<&'static str> {
    let o = rng.next_int(24) as usize;
    let up = ["", "Rw", "Rw2", "Rw'", "Fw", "Fw'"][o / 4];
    let turn = ["", "Uw", "Uw2", "Uw'"][o % 4];
    [up, turn].into_iter().filter(|s| !s.is_empty()).collect()
}

/// 크기별 수 종류(면 + 두께)와 축(0 x, 1 y, 2 z). TNoodle `getScrambleSuccessors`와 같다
pub fn move_kinds(n: usize) -> Vec<(String, u8)> {
    let outer = ["U", "D", "R", "L", "F", "B"];
    let mut names: Vec<String> = outer.iter().map(|s| s.to_string()).collect();
    if n == 4 {
        names.extend(["Uw", "Rw", "Fw"].iter().map(|s| s.to_string()));
    } else {
        names.extend(outer.iter().map(|f| format!("{f}w")));
    }
    if n == 6 {
        names.extend(["3Uw", "3Rw", "3Fw"].iter().map(|s| s.to_string()));
    }
    if n == 7 {
        names.extend(outer.iter().map(|f| format!("3{f}w")));
    }
    names
        .into_iter()
        .map(|name| {
            let face = name.chars().find(|c| "URFDLB".contains(*c)).unwrap();
            let axis = match face {
                'U' | 'D' => 1,
                'R' | 'L' => 0,
                _ => 2,
            };
            (name, axis)
        })
        .collect()
}

pub fn random_move_length(n: usize) -> usize {
    match n {
        4 => 40,
        5 => 60,
        6 => 80,
        _ => 100,
    }
}

/// 무작위 수 섞기(WCA 4b3e). 앞 수들과 합쳐지는 수(이어지는 같은 축 묶음 안에 이미 있는 종류)면 다시 고른다
fn random_moves(n: usize, rng: &mut Rng) -> String {
    let kinds = move_kinds(n);
    let mut out: Vec<String> = Vec::new();
    let mut run_axis: Option<u8> = None;
    let mut in_run: Vec<usize> = Vec::new();
    while out.len() < random_move_length(n) {
        let pick = rng.next_int(kinds.len() as u32 * 3) as usize;
        let k = pick / 3;
        let axis = kinds[k].1;
        if Some(axis) == run_axis && in_run.contains(&k) {
            continue;
        }
        if Some(axis) != run_axis {
            run_axis = Some(axis);
            in_run.clear();
        }
        in_run.push(k);
        out.push(format!("{}{}", kinds[k].0, ["", "2", "'"][pick % 3]));
    }
    out.join(" ")
}
