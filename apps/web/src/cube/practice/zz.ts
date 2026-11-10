// 공식 연습(docs/47 16-9)의 ZZ 묶음: 블록 짝 넣기 열두 경우(docs/47 16-16·16-17).
// 원본은 ZZ 블록 단원 규칙의 오른쪽 앞 칸 표(learn/zz-path.ts ZZ_PAIR_CASES)이고, 상황은 흰 면 아래(z2)로 쥔 맞춘
// 큐브에서 공식의 거꾸로를 친 것이다. 코너 블럭은 칸 바로 위(위-앞-오른쪽)에 있고, 공식은 R·U만 쓴다(엣지 방향을 지킨다).
import { type PairEdge, type PairWhite, ZZ_PAIR_CASES } from "../learn/zz-path";
import type { DrillCase } from "./types";

const WHITE_NAME: Record<PairWhite, string> = {
  up: "흰색 위",
  fb: "흰색 앞",
  side: "흰색 오른쪽",
};
const EDGE_NAME: Record<PairEdge, string> = {
  near: "엣지 블럭 위-앞",
  side: "엣지 블럭 위-오른쪽",
  far: "엣지 블럭 위-뒤",
  across: "엣지 블럭 위-왼쪽",
};
const ORDER: PairWhite[] = ["fb", "side", "up"];
const EDGE_ORDER: PairEdge[] = ["side", "far", "across", "near"];

/** ZZ 블록 짝 넣기(오른쪽 앞 칸): 코너 블럭 흰색 셋 × 엣지 블럭 자리 넷 */
export const ZZ_PAIRS: DrillCase[] = ORDER.flatMap((white) =>
  EDGE_ORDER.map((edge) => {
    const c = ZZ_PAIR_CASES.find((x) => x.white === white && x.edge === edge);
    if (!c) throw new Error(`ZZ 짝 경우 없음 ${white} ${edge}`);
    return {
      id: `zz-pair-${white}-${edge}`,
      name: `${WHITE_NAME[white]} · ${EDGE_NAME[edge]}`,
      group: WHITE_NAME[white],
      algs: [c.alg],
    };
  }),
);
