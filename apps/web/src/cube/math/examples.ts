import type { PieceKind } from "@game/cube-engine";

/** 「큐브의 수학」에서 쓰는 공식과 예. 값은 모두 `pieces.test.ts`가 엔진으로 확인한다 */

/** 슈퍼플립: 모든 엣지를 제자리에서 뒤집는 20수(반 바퀴도 한 수) 공식 */
export const SUPERFLIP = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";

/** 윗면 센터만 180° 돌리는 공식(나머지는 그대로) */
export const CENTER_HALF_TURN = "U R L U2 R' L' U R L U2 R' L'";

export interface OrderPreset {
  alg: string;
  order: number;
  note?: string;
}

export const ORDER_PRESETS: OrderPreset[] = [
  { alg: "R", order: 4 },
  { alg: "R2 U2", order: 6 },
  { alg: "R U R' U'", order: 6, note: "공식에 자주 나오는 묶음" },
  { alg: "R U", order: 105 },
  { alg: "R U2 D' B D'", order: 1260, note: "3×3에서 가장 큰 차수" },
];

export interface CommutatorExample {
  a: string;
  b: string;
  /** 바뀐 조각 수(센터 빼고) */
  changed: Partial<Record<PieceKind, number>>;
  note?: string;
}

export const COMMUTATOR_EXAMPLES: CommutatorExample[] = [
  { a: "R", b: "L", changed: {}, note: "안 닿는 두 면: 아무것도 안 바뀐다" },
  {
    a: "R",
    b: "U",
    changed: { corner: 4, edge: 3 },
    note: "두 면이 함께 닿는 조각이 셋뿐이라 7조각만 바뀐다",
  },
  {
    a: "R U R'",
    b: "D",
    changed: { corner: 3 },
    note: "코너 셋만 돈다(3-고리)",
  },
  { a: "M'", b: "U2", changed: { edge: 3 }, note: "엣지 셋만 돈다" },
];
