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
  {
    a: "R",
    b: "L",
    changed: {},
    note: "R과 L은 함께 움직이는 조각이 없어서 아무것도 안 바뀌어요.",
  },
  {
    a: "R",
    b: "U",
    changed: { corner: 4, edge: 3 },
    note: "R과 U가 함께 움직이는 조각은 3개뿐이라, 둘이 움직이는 조각 13개 가운데 7개만 바뀌어요.",
  },
  {
    a: "R U R'",
    b: "D",
    changed: { corner: 3 },
    note: "코너 블럭 셋만 한 칸씩 자리를 옮기며 한 바퀴 돌아요.",
  },
  {
    a: "M'",
    b: "U2",
    changed: { edge: 3 },
    note: "M'는 L과 R 사이 가운데 층을 돌리는 수예요. 엣지 블럭 셋만 한 칸씩 자리를 옮기며 한 바퀴 돌아요.",
  },
];
