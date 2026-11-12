// 사이트 자료에서 만든 파일이다. 손으로 고치지 않는다.
// 다시 만들기: CUBE_CORE_FIXTURES=write pnpm vitest run apps/web/src/cube/native/
// 원본: apps/web/src/cube/learn/algs-*.ts(공식 상황), apps/web/src/cube/tiers/table.ts(티어 표)

use crate::spot::{AlgCase, AlgSet};

/// OLL 57(사이트 「OLL(57)」 묶음 차례)
pub const OLL_CASES: &[AlgCase] = &[
    AlgCase { id: "oll-1", set: AlgSet::Oll, group: Some("dot"), name: "OLL 1 점·옆줄 둘", alg: "R U2 R2 F R F' U2 R' F R F'" },
    AlgCase { id: "oll-2", set: AlgSet::Oll, group: Some("dot"), name: "OLL 2 점·옆줄 하나", alg: "r U r' U2 r U2 R' U2 R U' r'" },
    AlgCase { id: "oll-3", set: AlgSet::Oll, group: Some("dot"), name: "OLL 3 점·왼쪽 앞 코너", alg: "r' R2 U R' U r U2 r' U M'" },
    AlgCase { id: "oll-4", set: AlgSet::Oll, group: Some("dot"), name: "OLL 4 점·오른쪽 앞 코너", alg: "M U' r U2 r' U' R U' R' M'" },
    AlgCase { id: "oll-5", set: AlgSet::Oll, group: Some("square"), name: "OLL 5 네모 왼쪽", alg: "l' U2 L U L' U l" },
    AlgCase { id: "oll-6", set: AlgSet::Oll, group: Some("square"), name: "OLL 6 네모 오른쪽", alg: "r U2 R' U' R U' r'" },
    AlgCase { id: "oll-7", set: AlgSet::Oll, group: Some("small-lightning"), name: "OLL 7 작은 번개 왼쪽", alg: "r U R' U R U2 r'" },
    AlgCase { id: "oll-8", set: AlgSet::Oll, group: Some("small-lightning"), name: "OLL 8 작은 번개 오른쪽", alg: "l' U' L U' L' U2 l" },
    AlgCase { id: "oll-9", set: AlgSet::Oll, group: Some("fish"), name: "OLL 9 물고기 왼쪽", alg: "R U R' U' R' F R2 U R' U' F'" },
    AlgCase { id: "oll-10", set: AlgSet::Oll, group: Some("fish"), name: "OLL 10 물고기 오른쪽", alg: "R U R' U R' F R F' R U2 R'" },
    AlgCase { id: "oll-11", set: AlgSet::Oll, group: Some("small-lightning"), name: "OLL 11 작은 번개 왼쪽 2", alg: "r U R' U R' F R F' R U2 r'" },
    AlgCase { id: "oll-12", set: AlgSet::Oll, group: Some("small-lightning"), name: "OLL 12 작은 번개 오른쪽 2", alg: "M' R' U' R U' R' U2 R U' M" },
    AlgCase { id: "oll-13", set: AlgSet::Oll, group: Some("knight"), name: "OLL 13 기사 1", alg: "F U R U' R2 F' R U R U' R'" },
    AlgCase { id: "oll-14", set: AlgSet::Oll, group: Some("knight"), name: "OLL 14 기사 2", alg: "R' F R U R' F' R F U' F'" },
    AlgCase { id: "oll-15", set: AlgSet::Oll, group: Some("knight"), name: "OLL 15 기사 3", alg: "l' U' l L' U' L U l' U l" },
    AlgCase { id: "oll-16", set: AlgSet::Oll, group: Some("knight"), name: "OLL 16 기사 4", alg: "r U r' R U R' U' r U' r'" },
    AlgCase { id: "oll-17", set: AlgSet::Oll, group: Some("dot"), name: "OLL 17 점·대각 코너", alg: "F R' F' R2 r' U R U' R' U' M'" },
    AlgCase { id: "oll-18", set: AlgSet::Oll, group: Some("dot"), name: "OLL 18 점·뒤 코너 둘", alg: "r U R' U R U2 r2 U' R U' R' U2 r" },
    AlgCase { id: "oll-19", set: AlgSet::Oll, group: Some("dot"), name: "OLL 19 점·화살촉", alg: "r' R U R U R' U' M' R' F R F'" },
    AlgCase { id: "oll-20", set: AlgSet::Oll, group: Some("dot"), name: "OLL 20 점·코너 다 노랑", alg: "r U R' U' M2 U R U' R' U' M'" },
    AlgCase { id: "oll-21", set: AlgSet::Oll, group: Some("ocll"), name: "OLL 21 H", alg: "R U2 R' U' R U R' U' R U' R'" },
    AlgCase { id: "oll-22", set: AlgSet::Oll, group: Some("ocll"), name: "OLL 22 파이(Pi)", alg: "R U2 R2 U' R2 U' R2 U2 R" },
    AlgCase { id: "oll-23", set: AlgSet::Oll, group: Some("ocll"), name: "OLL 23 U", alg: "R2 D' R U2 R' D R U2 R" },
    AlgCase { id: "oll-24", set: AlgSet::Oll, group: Some("ocll"), name: "OLL 24 T(크로스 T)", alg: "r U R' U' r' F R F'" },
    AlgCase { id: "oll-25", set: AlgSet::Oll, group: Some("ocll"), name: "OLL 25 나비넥타이(L)", alg: "F' r U R' U' r' F R" },
    AlgCase { id: "oll-26", set: AlgSet::Oll, group: Some("ocll"), name: "OLL 26 안티수네", alg: "R U2 R' U' R U' R'" },
    AlgCase { id: "oll-27", set: AlgSet::Oll, group: Some("ocll"), name: "OLL 27 수네", alg: "R U R' U R U2 R'" },
    AlgCase { id: "oll-28", set: AlgSet::Oll, group: Some("edges-only"), name: "OLL 28 화살표", alg: "r U R' U' M U R U' R'" },
    AlgCase { id: "oll-29", set: AlgSet::Oll, group: Some("awkward"), name: "OLL 29 어색한 1", alg: "R U R' U' R U' R' F' U' F R U R'" },
    AlgCase { id: "oll-30", set: AlgSet::Oll, group: Some("awkward"), name: "OLL 30 어색한 2", alg: "F R' F R2 U' R' U' R U R' F2" },
    AlgCase { id: "oll-31", set: AlgSet::Oll, group: Some("p"), name: "OLL 31 P 거꾸로", alg: "R' U' F U R U' R' F' R" },
    AlgCase { id: "oll-32", set: AlgSet::Oll, group: Some("p"), name: "OLL 32 P", alg: "L U F' U' L' U L F L'" },
    AlgCase { id: "oll-33", set: AlgSet::Oll, group: Some("t"), name: "OLL 33 T 1", alg: "R U R' U' R' F R F'" },
    AlgCase { id: "oll-34", set: AlgSet::Oll, group: Some("c"), name: "OLL 34 C 1", alg: "R U R2 U' R' F R U R U' F'" },
    AlgCase { id: "oll-35", set: AlgSet::Oll, group: Some("fish"), name: "OLL 35 물고기 3", alg: "R U2 R2 F R F' R U2 R'" },
    AlgCase { id: "oll-36", set: AlgSet::Oll, group: Some("w"), name: "OLL 36 W 1", alg: "L' U' L U' L' U L U L F' L' F" },
    AlgCase { id: "oll-37", set: AlgSet::Oll, group: Some("fish"), name: "OLL 37 물고기 4", alg: "F R' F' R U R U' R'" },
    AlgCase { id: "oll-38", set: AlgSet::Oll, group: Some("w"), name: "OLL 38 W 2", alg: "R U R' U R U' R' U' R' F R F'" },
    AlgCase { id: "oll-39", set: AlgSet::Oll, group: Some("big-lightning"), name: "OLL 39 큰 번개 1", alg: "L F' L' U' L U F U' L'" },
    AlgCase { id: "oll-40", set: AlgSet::Oll, group: Some("big-lightning"), name: "OLL 40 큰 번개 2", alg: "R' F R U R' U' F' U R" },
    AlgCase { id: "oll-41", set: AlgSet::Oll, group: Some("awkward"), name: "OLL 41 어색한 3", alg: "R U R' U R U2 R' F R U R' U' F'" },
    AlgCase { id: "oll-42", set: AlgSet::Oll, group: Some("awkward"), name: "OLL 42 어색한 4", alg: "R' U' R U' R' U2 R F R U R' U' F'" },
    AlgCase { id: "oll-43", set: AlgSet::Oll, group: Some("p"), name: "OLL 43 P 2", alg: "F' U' L' U L F" },
    AlgCase { id: "oll-44", set: AlgSet::Oll, group: Some("p"), name: "OLL 44 P 3", alg: "F U R U' R' F'" },
    AlgCase { id: "oll-45", set: AlgSet::Oll, group: Some("t"), name: "OLL 45 T 2", alg: "F R U R' U' F'" },
    AlgCase { id: "oll-46", set: AlgSet::Oll, group: Some("c"), name: "OLL 46 C 2", alg: "R' U' R' F R F' U R" },
    AlgCase { id: "oll-47", set: AlgSet::Oll, group: Some("small-l"), name: "OLL 47 작은 L 1", alg: "R' U' R' F R F' R' F R F' U R" },
    AlgCase { id: "oll-48", set: AlgSet::Oll, group: Some("small-l"), name: "OLL 48 작은 L 2", alg: "F R U R' U' R U R' U' F'" },
    AlgCase { id: "oll-49", set: AlgSet::Oll, group: Some("small-l"), name: "OLL 49 작은 L 3", alg: "r U' r2 U r2 U r2 U' r" },
    AlgCase { id: "oll-50", set: AlgSet::Oll, group: Some("small-l"), name: "OLL 50 작은 L 4", alg: "r' U r2 U' r2 U' r2 U r'" },
    AlgCase { id: "oll-51", set: AlgSet::Oll, group: Some("i"), name: "OLL 51 가로줄 1", alg: "F U R U' R' U R U' R' F'" },
    AlgCase { id: "oll-52", set: AlgSet::Oll, group: Some("i"), name: "OLL 52 가로줄 2", alg: "R U R' U R U' B U' B' R'" },
    AlgCase { id: "oll-53", set: AlgSet::Oll, group: Some("small-l"), name: "OLL 53 작은 L 5", alg: "l' U2 L U L' U' L U L' U l" },
    AlgCase { id: "oll-54", set: AlgSet::Oll, group: Some("small-l"), name: "OLL 54 작은 L 6", alg: "r U2 R' U' R U R' U' R U' r'" },
    AlgCase { id: "oll-55", set: AlgSet::Oll, group: Some("i"), name: "OLL 55 가로줄 3", alg: "R' F R U R U' R2 F' R2 U' R' U R U R'" },
    AlgCase { id: "oll-56", set: AlgSet::Oll, group: Some("i"), name: "OLL 56 가로줄 4", alg: "r' U' r U' R' U R U' R' U R r' U r" },
    AlgCase { id: "oll-57", set: AlgSet::Oll, group: Some("edges-only"), name: "OLL 57 H(엣지 둘 뒤집힘)", alg: "R U R' U' M' U R U' r'" },
];

/// PLL 21
pub const PLL_CASES: &[AlgCase] = &[
    AlgCase { id: "pll-ua", set: AlgSet::Pll, group: Some("edges"), name: "Ua 퍼뮤(엣지 셋 돌리기, 시계 반대)", alg: "M2 U M U2 M' U M2" },
    AlgCase { id: "pll-ub", set: AlgSet::Pll, group: Some("edges"), name: "Ub 퍼뮤(엣지 셋 돌리기, 시계)", alg: "M2 U' M U2 M' U' M2" },
    AlgCase { id: "pll-h", set: AlgSet::Pll, group: Some("edges"), name: "H 퍼뮤(맞은편 엣지끼리 바꾸기)", alg: "M2 U M2 U2 M2 U M2" },
    AlgCase { id: "pll-z", set: AlgSet::Pll, group: Some("edges"), name: "Z 퍼뮤(이웃 엣지 두 쌍 바꾸기)", alg: "M' U M2 U M2 U M' U2 M2" },
    AlgCase { id: "pll-aa", set: AlgSet::Pll, group: Some("corners"), name: "Aa 퍼뮤(코너 셋 돌리기)", alg: "x R' U R' D2 R U' R' D2 R2 x'" },
    AlgCase { id: "pll-ab", set: AlgSet::Pll, group: Some("corners"), name: "Ab 퍼뮤(코너 셋 반대로 돌리기)", alg: "x R2 D2 R U R' D2 R U' R x'" },
    AlgCase { id: "pll-e", set: AlgSet::Pll, group: Some("corners"), name: "E 퍼뮤(코너 두 쌍 바꾸기)", alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x" },
    AlgCase { id: "pll-t", set: AlgSet::Pll, group: Some("adjacent"), name: "T 퍼뮤", alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
    AlgCase { id: "pll-f", set: AlgSet::Pll, group: Some("adjacent"), name: "F 퍼뮤", alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R" },
    AlgCase { id: "pll-ja", set: AlgSet::Pll, group: Some("adjacent"), name: "Ja 퍼뮤", alg: "x R2 F R F' R U2 r' U r U2 x'" },
    AlgCase { id: "pll-jb", set: AlgSet::Pll, group: Some("adjacent"), name: "Jb 퍼뮤", alg: "R U R' F' R U R' U' R' F R2 U' R'" },
    AlgCase { id: "pll-ra", set: AlgSet::Pll, group: Some("adjacent"), name: "Ra 퍼뮤", alg: "R U' R' U' R U R D R' U' R D' R' U2 R'" },
    AlgCase { id: "pll-rb", set: AlgSet::Pll, group: Some("adjacent"), name: "Rb 퍼뮤", alg: "R2 F R U R U' R' F' R U2 R' U2 R" },
    AlgCase { id: "pll-v", set: AlgSet::Pll, group: Some("diagonal"), name: "V 퍼뮤", alg: "R' U R' U' y R' F' R2 U' R' U R' F R F" },
    AlgCase { id: "pll-y", set: AlgSet::Pll, group: Some("diagonal"), name: "Y 퍼뮤", alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
    AlgCase { id: "pll-na", set: AlgSet::Pll, group: Some("diagonal"), name: "Na 퍼뮤", alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'" },
    AlgCase { id: "pll-nb", set: AlgSet::Pll, group: Some("diagonal"), name: "Nb 퍼뮤", alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R" },
    AlgCase { id: "pll-ga", set: AlgSet::Pll, group: Some("g"), name: "Ga 퍼뮤", alg: "R2 U R' U R' U' R U' R2 U' D R' U R D'" },
    AlgCase { id: "pll-gb", set: AlgSet::Pll, group: Some("g"), name: "Gb 퍼뮤", alg: "R' U' R U D' R2 U R' U R U' R U' R2 D" },
    AlgCase { id: "pll-gc", set: AlgSet::Pll, group: Some("g"), name: "Gc 퍼뮤", alg: "R2 U' R U' R U R' U R2 U D' R U' R' D" },
    AlgCase { id: "pll-gd", set: AlgSet::Pll, group: Some("g"), name: "Gd 퍼뮤", alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
];

/// 2단계 OLL·PLL(Cubie 공식 보기가 보는 차례)
pub const TWO_LOOK_CASES: &[AlgCase] = &[
    AlgCase { id: "2look-oll-line", set: AlgSet::TwoLookOll, group: Some("edges"), name: "엣지: 가로줄", alg: "F R U R' U' F'" },
    AlgCase { id: "2look-oll-l", set: AlgSet::TwoLookOll, group: Some("edges"), name: "엣지: ㄱ자(작은 L)", alg: "F U R U' R' F'" },
    AlgCase { id: "2look-oll-dot", set: AlgSet::TwoLookOll, group: Some("edges"), name: "엣지: 점", alg: "F R U R' U' F' f R U R' U' f'" },
    AlgCase { id: "2look-oll-21", set: AlgSet::TwoLookOll, group: Some("corners"), name: "코너: H 모양", alg: "R U2 R' U' R U R' U' R U' R'" },
    AlgCase { id: "2look-oll-22", set: AlgSet::TwoLookOll, group: Some("corners"), name: "코너: 파이 모양", alg: "R U2 R2 U' R2 U' R2 U2 R" },
    AlgCase { id: "2look-oll-23", set: AlgSet::TwoLookOll, group: Some("corners"), name: "코너: U 모양", alg: "R2 D' R U2 R' D R U2 R" },
    AlgCase { id: "2look-oll-24", set: AlgSet::TwoLookOll, group: Some("corners"), name: "코너: T 모양", alg: "r U R' U' r' F R F'" },
    AlgCase { id: "2look-oll-25", set: AlgSet::TwoLookOll, group: Some("corners"), name: "코너: 나비넥타이 모양", alg: "F' r U R' U' r' F R" },
    AlgCase { id: "2look-oll-26", set: AlgSet::TwoLookOll, group: Some("corners"), name: "코너: 안티수네 모양", alg: "R U2 R' U' R U' R'" },
    AlgCase { id: "2look-oll-27", set: AlgSet::TwoLookOll, group: Some("corners"), name: "코너: 수네 모양", alg: "R U R' U R U2 R'" },
    AlgCase { id: "2look-pll-headlights", set: AlgSet::TwoLookPll, group: Some("corners"), name: "코너: 헤드라이트 하나(이웃 바꾸기, T퍼뮤)", alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
    AlgCase { id: "2look-pll-diagonal", set: AlgSet::TwoLookPll, group: Some("corners"), name: "코너: 헤드라이트 없음(대각 바꾸기, Y퍼뮤)", alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
    AlgCase { id: "2look-pll-ua", set: AlgSet::TwoLookPll, group: Some("edges"), name: "엣지: Ua퍼뮤(셋 돌리기)", alg: "M2 U M U2 M' U M2" },
    AlgCase { id: "2look-pll-ub", set: AlgSet::TwoLookPll, group: Some("edges"), name: "엣지: Ub퍼뮤(셋 반대로 돌리기)", alg: "M2 U' M U2 M' U' M2" },
    AlgCase { id: "2look-pll-h", set: AlgSet::TwoLookPll, group: Some("edges"), name: "엣지: H퍼뮤(맞은편끼리)", alg: "M2 U M2 U2 M2 U M2" },
    AlgCase { id: "2look-pll-z", set: AlgSet::TwoLookPll, group: Some("edges"), name: "엣지: Z퍼뮤(이웃끼리 두 쌍)", alg: "M' U M2 U M2 U M' U2 M2" },
];

/// 크기 → 티어 열 개(아이언부터)의 구간 상한(초, 이하). 구간이 있으면 IV·III·II·I 넷
pub const TIER_TABLE: &[(usize, &[&[f64]])] = &[
    (2, &[&[f64::INFINITY, 300.0, 210.0, 145.0], &[100.0, 80.0, 65.0, 50.0], &[40.0, 34.0, 28.0, 24.0], &[20.0, 18.0, 15.0, 14.0], &[12.0, 11.0, 9.5, 8.4], &[7.5, 6.8, 6.2, 5.7], &[5.2, 4.7, 4.3, 3.9], &[3.6, 3.1, 2.7, 2.3], &[2.0], &[1.5]]),
    (3, &[&[f64::INFINITY, 900.0, 630.0, 435.0], &[300.0, 240.0, 190.0, 150.0], &[120.0, 100.0, 85.0, 70.0], &[60.0, 52.0, 46.0, 40.0], &[35.0, 31.0, 28.0, 25.0], &[22.0, 20.0, 18.0, 16.0], &[14.0, 13.0, 12.0, 11.0], &[10.0, 9.3, 8.7, 8.1], &[7.5], &[6.5]]),
    (4, &[&[f64::INFINITY, 4200.0, 2820.0, 1950.0], &[1350.0, 1080.0, 840.0, 690.0], &[540.0, 455.0, 380.0, 320.0], &[270.0, 235.0, 210.0, 180.0], &[160.0, 140.0, 125.0, 110.0], &[100.0, 90.0, 80.0, 70.0], &[65.0, 58.0, 53.0, 49.0], &[45.0, 41.0, 37.0, 34.0], &[31.0], &[27.0]]),
    (5, &[&[f64::INFINITY, 7800.0, 5400.0, 3600.0], &[2550.0, 2040.0, 1620.0, 1290.0], &[1020.0, 870.0, 720.0, 600.0], &[510.0, 445.0, 390.0, 345.0], &[300.0, 270.0, 240.0, 215.0], &[190.0, 170.0, 150.0, 135.0], &[120.0, 110.0, 100.0, 95.0], &[85.0, 75.0, 70.0, 65.0], &[58.0], &[51.0]]),
    (6, &[&[f64::INFINITY], &[4800.0, 3900.0, 3030.0, 2400.0], &[1920.0, 1620.0, 1350.0, 1140.0], &[960.0, 840.0, 720.0, 630.0], &[560.0, 500.0, 445.0, 395.0], &[350.0, 315.0, 280.0, 250.0], &[225.0, 205.0, 190.0, 175.0], &[160.0, 145.0, 135.0, 125.0], &[113.0], &[96.0]]),
    (7, &[&[f64::INFINITY], &[7200.0, 5700.0, 4500.0, 3600.0], &[2880.0, 2430.0, 2040.0, 1710.0], &[1440.0, 1260.0, 1110.0, 960.0], &[840.0, 750.0, 660.0, 595.0], &[530.0, 475.0, 425.0, 380.0], &[340.0, 310.0, 285.0, 260.0], &[240.0, 220.0, 205.0, 190.0], &[176.0], &[146.0]]),
];

/// 크기 → (그 크기 평균 기록이 있는 WCA 경기자 수, 티어 열 개의 (진입 시간 이하 경기자 수, 상위 %)). 대회 밖 티어는 None
pub const TIER_WCA: &[(usize, u32, &[Option<(u32, f64)>])] = &[
    (2, 185000, &[None, None, Some((182580, 98.7)), Some((165170, 89.3)), Some((132579, 71.7)), Some((81050, 43.8)), Some((35337, 19.1)), Some((9753, 5.3)), Some((1040, 0.56)), Some((275, 0.15))]),
    (3, 284562, &[None, None, Some((280971, 98.7)), Some((246256, 86.5)), Some((175391, 61.6)), Some((101129, 35.5)), Some((36339, 12.8)), Some((8802, 3.1)), Some((1209, 0.42)), Some((295, 0.1))]),
    (4, 55653, &[None, None, None, Some((55554, 99.8)), Some((54294, 97.6)), Some((46993, 84.4)), Some((26319, 47.3)), Some((9473, 17.0)), Some((1025, 1.84)), Some((276, 0.5))]),
    (5, 27178, &[None, None, None, Some((27167, 100.0)), Some((26880, 98.9)), Some((25319, 93.2)), Some((17007, 62.6)), Some((6883, 25.3)), Some((964, 3.55)), Some((312, 1.15))]),
    (6, 13100, &[None, None, None, None, Some((13073, 99.8)), Some((12465, 95.2)), Some((9409, 71.8)), Some((4521, 34.5)), Some((1005, 7.67)), Some((309, 2.36))]),
    (7, 10156, &[None, None, None, None, Some((10148, 99.9)), Some((9942, 97.9)), Some((7699, 75.8)), Some((3731, 36.7)), Some((1002, 9.87)), Some((300, 2.95))]),
];

/// 티어 기준 자료 날짜
pub const TIER_DATA_DATE: &str = "2026-11-09";

/// WCA 결과 내보내기가 다시 펴낼 때 붙이라는 문구(그대로)와 그 주소
pub const WCA_CREDIT: &str = "This information is based on competition results owned and maintained by the World Cube Assocation, published at https://worldcubeassociation.org/results as of November 9, 2026.";
pub const WCA_RESULTS_URL: &str = "https://worldcubeassociation.org/results";
