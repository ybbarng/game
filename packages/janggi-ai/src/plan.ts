import { CELLS, type JanggiView, sideOfSeat, WIDTH } from "@game/janggi-engine";

import { A, C, E, K, N, P, R, sideIndex, toFast } from "./fast-board";

/*
 * 초고수의 계획(docs/22 3절). 수마다 지금 판을 보고 할 일을 하나 정한다.
 * 계획은 탐색의 형세 판단에 가산점으로 들어간다(deep.ts). 같은 판이면 늘 같은 계획이다.
 *
 * - 전개(초반): 차 길을 열고 마·상을 끌어내며 궁은 궁성 가운데에 둔다
 * - 궁성 공격(중반): 상대 궁성의 약한 쪽(사가 비었거나 내 기물이 많이 겨누는 쪽)에 차·포·마·졸을 모은다
 * - 단순하게(중반, 기물이 앞섬): 맞바꿀수록 값이 오르게 해 이득을 굳힌다
 * - 외통 몰기(종반, 앞섬): 상대 궁이 갈 칸을 줄이고 공격 기물을 궁 가까이 붙인다
 * - 버티기(뒤짐): 사·상을 궁 곁에 두고 궁성 둘레를 지킨다. 같은 판 되풀이를 반긴다
 */

export type MasterPlanId =
  | "develop"
  | "attack-left"
  | "attack-center"
  | "attack-right"
  | "simplify"
  | "mate"
  | "defend";

export interface MasterPlan {
  id: MasterPlanId;
  /** 쉬운 한국어 이름(화면의 「초고수의 노림」) */
  label: string;
}

export const MASTER_PLAN_LABELS: Record<MasterPlanId, string> = {
  develop: "차 길 열기·기물 전개",
  "attack-left": "왼쪽 궁성 공격",
  "attack-center": "가운데 궁성 공격",
  "attack-right": "오른쪽 궁성 공격",
  simplify: "바꿔서 단순하게",
  mate: "외통 몰기",
  defend: "궁성 지키며 버티기",
};

/** 탐색이 쓰는 계획: 종류와 공격할 세로줄(판 기준 x 3·4·5) */
export interface PlanWeights {
  id: MasterPlanId;
  /** 계획을 세운 편(0 초, 1 한) */
  side: number;
  /** 공격 계획이면 노리는 세로줄 */
  wingX: number;
  /** 기물 점수(한의 덤 포함, ×100)로 앞선 정도. 계획을 세운 편에서 본다 */
  lead: number;
}

const VALUE = [0, 0, 300, 1300, 700, 500, 300, 200];
/** 종반으로 보는 남은 기물 수(궁 빼고, 두 편 합) */
const ENDGAME_PIECES = 14;
/** 크게 앞섬·뒤짐으로 보는 기물 점수 차(×100) */
const CLEAR_LEAD = 400;
const SMALL_LEAD = 200;

/** 빠른 판에서 계획을 정한다. `played`는 이번 판에 둔 수(쉬기 포함) */
export function planFor(
  b: Int8Array,
  side: number,
  played: number,
): PlanWeights {
  const enemy = 1 - side;
  let lead = side === 0 ? -150 : 150;
  let pieces = 0;
  let undeveloped = 0;
  const backRow = side === 0 ? 9 : 0;
  for (let at = 0; at < CELLS; at++) {
    const code = b[at] as number;
    if (code === 0) continue;
    const kind = code & 7;
    const own = code >> 3 === side;
    if (kind !== K) pieces++;
    lead += own ? (VALUE[kind] as number) : -(VALUE[kind] as number);
    if (
      own &&
      Math.floor(at / WIDTH) === backRow &&
      (kind === R || kind === N || kind === E)
    )
      undeveloped++;
  }
  const make = (id: MasterPlanId, wingX = 4): PlanWeights => ({
    id,
    side,
    wingX,
    lead,
  });
  if (played < 24 && undeveloped >= 3) return make("develop");
  if (pieces <= ENDGAME_PIECES) {
    if (lead >= SMALL_LEAD) return make("mate");
    if (lead <= -SMALL_LEAD) return make("defend");
  } else {
    if (lead >= CLEAR_LEAD) return make("simplify");
    if (lead <= -CLEAR_LEAD) return make("defend");
  }
  // 궁성 공격: 상대 궁성의 왼·가운데·오른 세로줄 가운데 가장 약한 곳
  const enemyTop = enemy === 1 ? 0 : 7;
  let bestX = 4;
  let bestScore = -1;
  for (const x of [4, 3, 5]) {
    let weak = 0;
    let guarded = false;
    for (let y = enemyTop; y < enemyTop + 3; y++) {
      const code = b[y * WIDTH + x] as number;
      if (code !== 0 && code >> 3 === enemy && (code & 7) === A) guarded = true;
    }
    if (!guarded && x !== 4) weak += 2;
    for (let at = 0; at < CELLS; at++) {
      const code = b[at] as number;
      if (code === 0 || code >> 3 !== side) continue;
      const kind = code & 7;
      const ax = at % WIDTH;
      const ay = Math.floor(at / WIDTH);
      if ((kind === R || kind === C) && ax === x) weak++;
      if (
        (kind === N || kind === P) &&
        Math.abs(ax - x) + Math.abs(ay - (enemyTop + 1)) <= 3
      )
        weak++;
    }
    if (weak > bestScore) {
      bestScore = weak;
      bestX = x;
    }
  }
  // 판 기준 x를 그 편에서 본 왼·오른으로 바꾼다(한은 판 위에서 아래를 본다).
  const leftX = side === 0 ? 3 : 5;
  const id: MasterPlanId =
    bestX === 4
      ? "attack-center"
      : bestX === leftX
        ? "attack-left"
        : "attack-right";
  return make(id, bestX);
}

/** 초고수가 이 화면에서 세울 계획. 둘 차례가 아니면 null */
export function masterPlanOf(view: JanggiView): MasterPlan | null {
  if (view.decision?.kind !== "move") return null;
  const side = sideIndex(sideOfSeat(view, view.mySeat));
  const plan = planFor(toFast(view.board), side, view.played.length);
  return { id: plan.id, label: MASTER_PLAN_LABELS[plan.id] };
}
