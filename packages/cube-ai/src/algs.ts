/**
 * 공식 표. 모두 "흰 십자를 아래(D), 노란 면을 위(U)"에 두고 쓰는 공식이다.
 * 맞는지는 시험(`algs.test.ts`)이 확인한다: 첫 두 층을 깨지 않는지, 상황마다 하나씩 빠짐없이 덮는지.
 */

/** 초보자 공식(층별 맞추기, 사람이 처음 배우는 그대로) */
export const BEGINNER = {
  /** 첫 층 꼭짓점: 앞 오른쪽 위에 둔 꼭짓점을 맞을 때까지 되풀이 */
  cornerTrigger: "R U R' U'",
  /** 둘째 층: 앞 위 모서리를 오른쪽 자리로 */
  edgeRight: "U R U' R' U' F' U F",
  /** 둘째 층: 앞 위 모서리를 왼쪽 자리로 */
  edgeLeft: "U' L' U L U F U' F'",
  /** 노란 십자: 가로줄일 때 */
  crossLine: "F R U R' U' F'",
  /** 노란 십자: 뒤·왼쪽 ㄱ자일 때 */
  crossL: "F U R U' R' F'",
  /** 노란 면(수네) */
  sune: "R U R' U R U2 R'",
  /** 위 꼭짓점 자리: 같은 색 두 개(전조등)를 뒤에 두고 */
  cornerSwap: "R' F R' B2 R F' R' B2 R2",
  /** 위 모서리 자리: 다 맞은 면을 뒤에 두고 */
  edgeCycle: "R U' R U R U R U' R' U' R2",
} as const;

/** 2단계 OLL 첫째: 노란 십자(가로줄, ㄱ자, 점) */
export const EO_2LOOK: readonly string[] = [
  "F R U R' U' F'",
  "f R U R' U' f'",
  "F R U R' U' F' f R U R' U' f'",
];

/** 2단계 OLL 둘째: 꼭짓점 방향 7가지(모서리 방향을 지킨다) */
export const OCLL: readonly string[] = [
  "R U R' U R U2 R'", // 수네
  "R U2 R' U' R U' R'", // 안티수네
  "R U R' U R U' R' U R U2 R'", // H
  "R U2 R2 U' R2 U' R2 U2 R", // 파이
  "R2 D R' U2 R D' R' U2 R'", // 전조등
  "r U R' U' r' F R F'", // T
  "F' r U R' U' r' F R", // 나비넥타이
];

/**
 * 2×2 윗면 7가지. 2×2에서 r는 큐브 전체 돌리기가 되어 버리므로 바깥 면 수만 쓴다
 * (모서리가 없어 모서리 방향을 바꾸는 공식도 된다).
 */
export const OCLL_2X2: readonly string[] = [
  "R U R' U R U2 R'", // 수네
  "R U2 R' U' R U' R'", // 안티수네
  "R2 U2 R U2 R2", // H
  "R U2 R2 U' R2 U' R2 U2 R", // 파이
  "R2 D R' U2 R D' R' U2 R'", // 전조등
  "R U R' U' R' F R F'", // T
  "F R' F' R U R U' R'", // 나비넥타이
];

/** 2단계 PLL 첫째·2×2 윗층: 꼭짓점 자리(이웃 바꾸기, 대각 바꾸기) */
export const CPLL: readonly string[] = [
  "R' F R' B2 R F' R' B2 R2", // A
  "F R U' R' U' R U R' F' R U R' U' R' F R F'", // Y
];

/** 2단계 PLL 둘째: 모서리 자리 */
export const EPLL: readonly string[] = [
  "R U' R U R U R U' R' U' R2", // Ua
  "R2 U R U R' U' R' U' R' U R'", // Ub
  "M2 U M2 U2 M2 U M2", // H
  "M' U M2 U M2 U M' U2 M2", // Z
];

/**
 * OLL 57가지(번호 차례). 번호와 공식은 널리 쓰는 표준 표(SpeedSolving 위키 「OLL」 쪽의
 * 1~57번 대표 공식)를 따른다. 맞는지는 시험이 확인한다.
 */
export const OLL: readonly string[] = [
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

/**
 * PLL 21가지(이름, 공식). 이름과 공식은 널리 쓰는 표준 표(SpeedSolving 위키 「PLL」 쪽의
 * 대표 공식)를 따른다. 맞는지는 시험이 확인한다.
 */
export const PLL: readonly (readonly [string, string])[] = [
  ["Aa", "R' F R' B2 R F' R' B2 R2"],
  ["Ab", "R2 B2 R F R' B2 R F' R"],
  ["E", "x' R U' R' D R U R' D' R U R' D R U' R' D' x"],
  ["F", "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"],
  ["Ga", "R2 U R' U R' U' R U' R2 U' D R' U R D'"],
  ["Gb", "R' U' R U D' R2 U R' U R U' R U' R2 D"],
  ["Gc", "R2 U' R U' R U R' U R2 U D' R U' R' D"],
  ["Gd", "R U R' U' D R2 U' R U' R' U R' U R2 D'"],
  ["H", "M2 U M2 U2 M2 U M2"],
  ["Ja", "L' U' L F L' U' L U L F' L2 U L"],
  ["Jb", "R U R' F' R U R' U' R' F R2 U' R'"],
  ["Na", "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"],
  ["Nb", "R' U R U' R' F' U' F R U R' F R' F' R U' R"],
  ["Ra", "R U' R' U' R U R D R' U' R D' R' U2 R'"],
  ["Rb", "R2 F R U R U' R' F' R U2 R' U2 R"],
  ["T", "R U R' U' R' F R2 U' R' U' R U R' F'"],
  ["Ua", "R U' R U R U R U' R' U' R2"],
  ["Ub", "R2 U R U R' U' R' U' R' U R'"],
  ["V", "R' U R' U' y R' F' R2 U' R' U R' F R F"],
  ["Y", "F R U' R' U' R U R' F' R U R' U' R' F R F'"],
  ["Z", "M' U M2 U M2 U M' U2 M2"],
];
