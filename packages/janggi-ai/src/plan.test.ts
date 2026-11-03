import {
  applyMove,
  createJanggiScenario,
  createMatch,
  type JanggiView,
  type Piece,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@game/janggi-engine";
import { createRng } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { deepSearch } from "./deep";
import { masterPlanOf } from "./plan";

/** 가운데 판: 두 편 모두 기물을 다 끌어냈고 기물 점수는 비슷하다. 한은 오른쪽 사(판 기준 x=5)만 있다 */
const MIDDLE: Record<string, Piece> = {
  "95": "cK",
  "04": "cA",
  "06": "cA",
  "61": "cR",
  "69": "cR",
  "82": "cC",
  "88": "cC",
  "73": "cN",
  "77": "cN",
  "63": "cE",
  "71": "cP",
  "75": "cP",
  "79": "cP",
  "25": "hK",
  "16": "hA",
  "11": "hR",
  "19": "hR",
  "32": "hC",
  "38": "hC",
  "12": "hN",
  "18": "hN",
  "13": "hE",
  "17": "hE",
  "41": "hP",
  "45": "hP",
  "49": "hP",
};

const planOf = (pieces: Record<string, Piece>, me: "c" | "h" = "c") =>
  masterPlanOf(viewOf(createJanggiScenario({ pieces, me }), 0))?.id;

describe("초고수의 계획", () => {
  it("첫 판은 기물 전개", () => {
    let { state } = createMatch(STANDARD_RULES, 1);
    while (state.phase === "setup") {
      const seat = pendingSeats(state)[0] as number;
      const r = step(state, seat, { type: "setup", setup: "NENE" });
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    const plan = masterPlanOf(viewOf(state, state.choSeat));
    expect(plan).toEqual({ id: "develop", label: "차 길 열기·기물 전개" });
  });

  it("가운데 판: 사가 빈 쪽 궁성을 공격한다(그 편에서 본 왼·오른)", () => {
    // 초가 보면 판 기준 x=3이 왼쪽이다.
    expect(planOf(MIDDLE)).toBe("attack-left");
    // 사가 둘 다 있으면 가운데(기물 점수가 비슷하게 한의 졸 하나를 뺀다).
    const guarded: Record<string, Piece> = { ...MIDDLE, "14": "hA" };
    delete guarded["41"];
    expect(planOf(guarded)).toBe("attack-center");
    // 한은 판 위에서 아래를 보므로 판 기준 x=5가 한의 왼쪽이다.
    const forHan: Record<string, Piece> = { ...MIDDLE };
    delete forHan["06"];
    delete forHan["16"];
    // 한의 차·마를 첫 줄에서 끌어낸다(아니면 아직 전개 계획이다).
    for (const at of ["11", "19", "12", "18"]) delete forHan[at];
    Object.assign(forHan, { "31": "hR", "39": "hR", "23": "hN", "27": "hN" });
    expect(planOf(forHan, "h")).toBe("attack-left");
  });

  it("가운데 판에서 기물이 크게 앞서면 바꿔서 단순하게", () => {
    const pieces = { ...MIDDLE };
    delete pieces["11"];
    expect(planOf(pieces)).toBe("simplify");
  });

  it("앞선 종반은 외통 몰기, 뒤진 종반은 버티기", () => {
    const ending: Record<string, Piece> = {
      "95": "cK",
      "51": "cR",
      "59": "cR",
      "25": "hK",
      "14": "hA",
      "16": "hA",
    };
    expect(planOf(ending)).toBe("mate");
    expect(planOf(ending, "h")).toBe("defend");
  });

  it("둘 차례가 아니면 계획이 없다", () => {
    const state = createJanggiScenario({ pieces: MIDDLE });
    expect(masterPlanOf(viewOf(state, 1))).toBeNull();
  });
});

/** 이 수를 둔 뒤의 판 모양(엔진 positionKey와 같은 형식)을 지난 판 기록에 더한 화면 */
function withSeen(view: JanggiView, move: { from: number; to: number }) {
  const after = applyMove(view.board, move);
  return { ...view, positions: [...view.positions, `${after.join(",")}|h`] };
}

describe("같은 판 되풀이", () => {
  const options = { nodes: 1_000_000, softNodes: 1_000_000, maxDepth: 3 };

  it("앞섰으면 지난 판과 같아지는 수에 감점한다", () => {
    const pieces = { ...MIDDLE };
    delete pieces["11"];
    const view = viewOf(createJanggiScenario({ pieces }), 0);
    const first = deepSearch(view, createRng(1), options);
    if (!first.move) throw new Error("수가 없다");
    const again = deepSearch(withSeen(view, first.move), createRng(1), options);
    expect(again.move).not.toEqual(first.move);
    expect(again.score).toBeLessThan(first.score);
  });

  it("뒤졌으면 지난 판과 같아지는 수를 반긴다", () => {
    const pieces = { ...MIDDLE };
    delete pieces["61"];
    const view = viewOf(createJanggiScenario({ pieces }), 0);
    const first = deepSearch(view, createRng(1), options);
    if (!first.move) throw new Error("수가 없다");
    const again = deepSearch(withSeen(view, first.move), createRng(1), options);
    expect(again.move).toEqual(first.move);
    expect(again.score).toBe(first.score + 80);
  });
});
