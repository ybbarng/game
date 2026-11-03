import { createRng } from "@game/mighty-engine";
import {
  createMatch,
  createOmokScenario,
  forbiddenReason,
  indexOf,
  type OmokRules,
  type OmokState,
  pointAt,
  pointName,
  type Variant,
  viewOf,
  winsByFours,
} from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import {
  type OmokBot,
  omokBeginnerBot,
  omokExpertBot,
  omokIntermediateBot,
  omokMasterBot,
} from "./bots";
import { playGame } from "./simulate";

const BOTS: readonly OmokBot[] = [
  omokBeginnerBot,
  omokIntermediateBot,
  omokExpertBot,
  omokMasterBot,
];
const STANDARD: OmokRules = { variant: "standard", winsToFinish: 1 };

/** 흑 자리(시드 1의 흑)가 `blacks`, 백이 `whites`를 둔 판. 다음은 흑 차례(수가 같을 때) */
function position(blacks: number[], whites: number[]): OmokState {
  const { state } = createMatch(STANDARD, 1);
  const board = [...state.board];
  for (const at of blacks) board[at] = 1;
  for (const at of whites) board[at] = 2;
  const moves = blacks.flatMap((b, i) =>
    whites[i] === undefined ? [b] : [b, whites[i] as number],
  );
  return { ...state, board, moves };
}

describe("오목 컴퓨터: 꼭 둘 자리", () => {
  // 흑 H8~K8 넷(G8은 비어 있다), 백은 아래에 셋.
  const row = (xs: number[], y: number) => xs.map((x) => indexOf(x, y));

  it.each(BOTS)("$name: 이기는 수가 있으면 둔다", (bot) => {
    const s = position(row([7, 8, 9, 10], 7), row([7, 8, 9], 9));
    const action = bot.decide(viewOf(s, s.blackSeat), createRng(1));
    expect([indexOf(6, 7), indexOf(11, 7)]).toContainEqual(
      action.type === "place" ? action.at : -1,
    );
  });

  it.each(BOTS)("$name: 상대가 다음에 다섯을 만들 자리를 막는다", (bot) => {
    // 백이 막힌 사(O에 막힘)를 만들었다. 흑은 남은 한쪽을 막아야 한다.
    const s = position(
      [indexOf(3, 9), indexOf(0, 0), indexOf(0, 14), indexOf(14, 0)],
      row([4, 5, 6, 7], 9),
    );
    const action = bot.decide(viewOf(s, s.blackSeat), createRng(1));
    expect(action).toEqual({ type: "place", at: indexOf(8, 9) });
  });

  it.each(BOTS)("$name: 판이 끝나면 다음 판을 누른다", (bot) => {
    const { state } = createMatch({ variant: "standard", winsToFinish: 2 }, 1);
    const s: OmokState = { ...state, phase: "roundEnd" };
    expect(bot.decide(viewOf(s, 0), createRng(1))).toEqual({
      type: "continue",
    });
  });
});

describe("오목 컴퓨터: 끝까지 두기", () => {
  it.each(["standard", "renju", "free"] as const)(
    "%s 규칙에서 금지 수 없이 끝까지 둔다",
    (variant) => {
      for (const seed of [1, 2]) {
        const end = playGame(
          [omokIntermediateBot, omokBeginnerBot],
          { variant, winsToFinish: 1 },
          seed,
        );
        expect(end.phase).toBe("gameOver");
      }
    },
  );

  // 이기는지(세기)는 bots.strength(pnpm bench)의 "단계가 높을수록 이긴다"가 잰다
  it("고수도 금지 수 없이 끝까지 둔다", () => {
    const end = playGame([omokExpertBot, omokBeginnerBot], STANDARD, 1);
    expect(end.phase).toBe("gameOver");
  });
});

describe("초고수", () => {
  /** 0번 자리(흑과 백 수가 같으면 흑)가 둘 차례인 장면에서 초고수가 고르는 자리 */
  const pick = (
    black: string[],
    white: string[],
    variant: Variant = "standard",
    seed = 1,
  ) => {
    const s = createOmokScenario({
      rules: { variant, winsToFinish: 1 },
      black,
      white,
    });
    const action = omokMasterBot.decide(viewOf(s, 0), createRng(seed));
    if (action.type !== "place") throw new Error("둘 차례인데 두지 않았다");
    return { at: action.at, board: s.board };
  };
  // 수를 맞추려고 멀리 둔 돌
  const far = ["A1", "C1", "A15", "O1", "O15"];

  it("사로 몰아 이기는 길(사삼)을 찾는다", () => {
    // 가로 H8·I8·J8(G8 막힘)과 세로 K9·K10. K8은 가로 사 + 세로 삼
    const { at } = pick(
      ["H8", "I8", "J8", "K9", "K10"],
      ["G8", ...far.slice(0, 4)],
    );
    expect(pointName(at)).toBe("K8");
  });

  it("자유 규칙에서는 열린 삼 둘(3·3)로 몰아 이기는 길을 찾는다", () => {
    const { at } = pick(["F8", "G8", "H9", "H10"], far.slice(0, 4), "free");
    expect(pointName(at)).toBe("H8");
  });

  it("일반 규칙에서는 같은 자리가 3·3 금지라 두지 않는다", () => {
    const { at, board } = pick(["F8", "G8", "H9", "H10"], far.slice(0, 4));
    expect(at).not.toBe(pointAt("H8"));
    expect(forbiddenReason(board, at, 1, "standard")).toBeNull();
  });

  it("상대가 사로 몰아 이기는 길을 끊는다", () => {
    // 백이 위 사삼 모양을 갖췄다. 흑 차례
    const { at, board } = pick(
      ["G8", ...far.slice(0, 4)],
      ["H8", "I8", "J8", "K9", "K10"],
    );
    const after = [...board];
    after[at] = 1;
    expect(winsByFours(after, 2, "standard", 6)).toBe(false);
  });

  it("같은 판·같은 시드면 같은 수를 둔다", () => {
    const black = ["H8", "I9", "G7", "J8"];
    const white = ["H9", "I8", "G9", "J10"];
    expect(pick(black, white, "renju", 3).at).toBe(
      pick(black, white, "renju", 3).at,
    );
  });
});
