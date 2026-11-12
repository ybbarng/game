// 사이트 자료에서 만든 파일이다. 손으로 고치지 않는다.
// 다시 만들기: CUBE_CORE_FIXTURES=write pnpm vitest run apps/web/src/cube/native/
// 원본: packages/cube-ai/src/algs.ts

/// 2단계 OLL 첫째: 노란 십자
pub const EO_2LOOK: &[&str] = &[
    "F R U R' U' F'",
    "f R U R' U' f'",
    "F R U R' U' F' f R U R' U' f'",
];

/// 2단계 OLL 둘째: 꼭짓점 방향 7
pub const OCLL: &[&str] = &[
    "R U R' U R U2 R'",
    "R U2 R' U' R U' R'",
    "R U R' U R U' R' U R U2 R'",
    "R U2 R2 U' R2 U' R2 U2 R",
    "R2 D R' U2 R D' R' U2 R'",
    "r U R' U' r' F R F'",
    "F' r U R' U' r' F R",
];

/// 2×2 윗면 7
pub const OCLL_2X2: &[&str] = &[
    "R U R' U R U2 R'",
    "R U2 R' U' R U' R'",
    "R2 U2 R U2 R2",
    "R U2 R2 U' R2 U' R2 U2 R",
    "R2 D R' U2 R D' R' U2 R'",
    "R U R' U' R' F R F'",
    "F R' F' R U R U' R'",
];

/// 2단계 PLL 첫째·2×2 윗층: 꼭짓점 자리
pub const CPLL: &[&str] = &[
    "R' F R' B2 R F' R' B2 R2",
    "F R U' R' U' R U R' F' R U R' U' R' F R F'",
];

/// 2단계 PLL 둘째: 모서리 자리
pub const EPLL: &[&str] = &[
    "R U' R U R U R U' R' U' R2",
    "R2 U R U R' U' R' U' R' U R'",
    "M2 U M2 U2 M2 U M2",
    "M' U M2 U M2 U M' U2 M2",
];

/// OLL 57(번호 차례)
pub const OLL: &[&str] = &[
    "R U2 R2 F R F' U2 R' F R F'",
    "F R U R' U' F' f R U R' U' f'",
    "f R U R' U' f' U' F R U R' U' F'",
    "f R U R' U' f' U F R U R' U' F'",
    "r' U2 R U R' U r",
    "r U2 R' U' R U' r'",
    "r U R' U R U2 r'",
    "l' U' L U' L' U2 l",
    "R U R' U' R' F R2 U R' U' F'",
    "R U R' U R' F R F' R U2 R'",
    "r U R' U R' F R F' R U2 r'",
    "M' R' U' R U' R' U2 R U' M",
    "F U R U' R2 F' R U R U' R'",
    "R' F R U R' F' R F U' F'",
    "r' U' r R' U' R U r' U r",
    "r U r' R U R' U' r U' r'",
    "R U R' U R' F R F' U2 R' F R F'",
    "r U R' U R U2 r2 U' R U' R' U2 r",
    "r' R U R U R' U' M' R' F R F'",
    "r U R' U' M2 U R U' R' U' M'",
    "R U2 R' U' R U R' U' R U' R'",
    "R U2 R2 U' R2 U' R2 U2 R",
    "R2 D' R U2 R' D R U2 R",
    "r U R' U' r' F R F'",
    "F' r U R' U' r' F R",
    "R U2 R' U' R U' R'",
    "R U R' U R U2 R'",
    "r U R' U' M U R U' R'",
    "R U R' U' R U' R' F' U' F R U R'",
    "F R' F R2 U' R' U' R U R' F2",
    "R' U' F U R U' R' F' R",
    "L U F' U' L' U L F L'",
    "R U R' U' R' F R F'",
    "R U R2 U' R' F R U R U' F'",
    "R U2 R2 F R F' R U2 R'",
    "L' U' L U' L' U L U L F' L' F",
    "F R' F' R U R U' R'",
    "R U R' U R U' R' U' R' F R F'",
    "L F' L' U' L U F U' L'",
    "R' F R U R' U' F' U R",
    "R U R' U R U2 R' F R U R' U' F'",
    "R' U' R U' R' U2 R F R U R' U' F'",
    "F' U' L' U L F",
    "F U R U' R' F'",
    "F R U R' U' F'",
    "R' U' R' F R F' U R",
    "R' U' R' F R F' R' F R F' U R",
    "F R U R' U' R U R' U' F'",
    "r U' r2 U r2 U r2 U' r",
    "r' U r2 U' r2 U' r2 U r'",
    "F U R U' R' U R U' R' F'",
    "R U R' U R U' B U' B' R'",
    "l' U2 L U L' U' L U L' U l",
    "r U2 R' U' R U R' U' R U' r'",
    "R' F R U R U' R2 F' R2 U' R' U R U R'",
    "r' U' r U' R' U R U' R' U R r' U r",
    "R U R' U' M' U R U' r'",
];

/// PLL 21(이름, 공식)
pub const PLL: &[(&str, &str)] = &[
    ("Aa", "R' F R' B2 R F' R' B2 R2"),
    ("Ab", "R2 B2 R F R' B2 R F' R"),
    ("E", "x' R U' R' D R U R' D' R U R' D R U' R' D' x"),
    ("F", "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"),
    ("Ga", "R2 U R' U R' U' R U' R2 U' D R' U R D'"),
    ("Gb", "R' U' R U D' R2 U R' U R U' R U' R2 D"),
    ("Gc", "R2 U' R U' R U R' U R2 U D' R U' R' D"),
    ("Gd", "R U R' U' D R2 U' R U' R' U R' U R2 D'"),
    ("H", "M2 U M2 U2 M2 U M2"),
    ("Ja", "L' U' L F L' U' L U L F' L2 U L"),
    ("Jb", "R U R' F' R U R' U' R' F R2 U' R'"),
    ("Na", "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"),
    ("Nb", "R' U R U' R' F' U' F R U R' F R' F' R U' R"),
    ("Ra", "R U' R' U' R U R D R' U' R D' R' U2 R'"),
    ("Rb", "R2 F R U R U' R' F' R U2 R' U2 R"),
    ("T", "R U R' U' R' F R2 U' R' U' R U R' F'"),
    ("Ua", "R U' R U R U R U' R' U' R2"),
    ("Ub", "R2 U R U R' U' R' U' R' U R'"),
    ("V", "R' U R' U' y R' F' R2 U' R' U R' F R F"),
    ("Y", "F R U' R' U' R U R' F' R U R' U' R' F R F'"),
    ("Z", "M' U M2 U M2 U M' U2 M2"),
];
