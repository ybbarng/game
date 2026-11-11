//! 큐브 계산 코어(docs/52 4절 「권하는 구조」의 코어, 5절 2단계).
//!
//! 사이트 TypeScript 엔진을 그대로 옮겼다. 같은 입력이면 같은 결과를 내야 하고, `fixtures/*.json`(사이트 엔진이 만든
//! 공통 시험 자료)으로 양쪽이 같은지 본다.
//!
//! | 모듈 | 옮긴 원본 |
//! |---|---|
//! | [`rng`] | `packages/engine/src/rng.ts`(mulberry32) |
//! | [`topology`]·[`state`]·[`notation`]·[`groups`] | `packages/cube-engine`(스티커 순열·방향, 표기, 맞춤 판정, 조각 묶음) |
//! | [`solver`] | `packages/cube-solver`(조각 표현, 2×2 거리표, 3×3 2단계 해법) |
//! | [`scramble`] | `packages/cube-scramble`(대회 규칙 섞기) |
//! | [`judge`]·[`spot`] | `apps/web/src/cube/learn/judge.ts`·`algs/check.ts`·`algs/spot.ts`·`mini/hint-pick.ts`(OLL·PLL 알아보기) |
//! | [`tier`] | `apps/web/src/cube/timer/stats.ts`·`tiers/rank.ts`·`tiers/table.ts` |
//! | [`replay`] | `apps/web/src/cube/records.ts`·`replay-player.ts`(다시 보기·구간 기록 글) |
//! | [`keys`] | `apps/web/src/cube/input/`(키 배치·해석기: 키 → 수·명령) |
//!
//! [`data`]·[`keymap_data`]는 사이트 자료(공식 상황·티어 표·키 배치)에서 만든 파일이라 손으로 고치지 않는다.

#[rustfmt::skip]
pub mod data;
pub mod groups;
pub mod judge;
#[rustfmt::skip]
pub mod keymap_data;
pub mod keys;
pub mod notation;
pub mod replay;
pub mod rng;
pub mod scramble;
pub mod solver;
pub mod spot;
pub mod state;
pub mod tier;
pub mod topology;

pub use notation::{format_moves, parse_moves, CubeMove, NotationError};
pub use state::{apply_moves, is_solved, solved_cube, State};
