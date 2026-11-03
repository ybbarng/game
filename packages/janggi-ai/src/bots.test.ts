import {
  applyMove,
  createJanggiScenario,
  createMatch,
  forcesMateAfter,
  type Piece,
  pendingSeats,
  pointAt,
  pointName,
  STANDARD_RULES,
  step,
  viewOf,
} from "@game/janggi-engine";
import { createRng } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import {
  createJanggiDeepBot,
  janggiBeginnerBot,
  janggiBotFor,
  janggiExpertBot,
  janggiIntermediateBot,
  janggiMasterBot,
  MASTER_BUDGET,
} from "./bots";
import { playGame } from "./simulate";

// 규칙·공짜 차 시험은 초고수와 같은 탐색을 작은 예산으로 돌린다(빠르게). 예산만 다르고 코드는 같다.
const lightMaster = createJanggiDeepBot(
  { nodes: 4000, softNodes: 1500 },
  "janggi-master-light",
);
const BOTS = [
  janggiBeginnerBot,
  janggiIntermediateBot,
  janggiExpertBot,
  lightMaster,
];

describe("장기 컴퓨터", () => {
  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 상차림부터 판 끝까지 규칙에 맞는 수만 둔다",
    (_name, bot) => {
      const end = playGame([bot, janggiBeginnerBot], STANDARD_RULES, 3);
      expect(end.phase).toBe("gameOver");
      expect(end.result).not.toBeNull();
    },
  );

  it("상차림 차례에는 상차림을 고른다", () => {
    const { state } = createMatch(STANDARD_RULES, 1);
    const han = 1 - state.choSeat;
    const action = janggiExpertBot.decide(viewOf(state, han), createRng(1));
    expect(action.type).toBe("setup");
    expect(step(state, han, action).ok).toBe(true);
  });

  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 공짜로 잡을 수 있는 차를 잡는다",
    (_name, bot) => {
      const pieces: Record<string, Piece> = {
        "95": "cK",
        "26": "hK",
        "71": "cR",
        "41": "hR",
      };
      const state = createJanggiScenario({ pieces });
      const action = bot.decide(viewOf(state, 0), createRng(5));
      expect(action).toEqual({
        type: "move",
        from: pointAt("71"),
        to: pointAt("41"),
      });
    },
  );

  it("중수·고수·초고수는 한 수 외통을 놓치지 않는다", () => {
    const pieces: Record<string, Piece> = {
      "04": "cK",
      "25": "hK",
      "69": "hR",
      "98": "hR",
    };
    for (const bot of [
      janggiIntermediateBot,
      janggiExpertBot,
      janggiMasterBot,
    ]) {
      const state = createJanggiScenario({ pieces, me: "h" });
      const action = bot.decide(viewOf(state, 0), createRng(9));
      const result = step(state, 0, action);
      expect(result.ok && result.state.result?.kind).toBe("checkmate");
    }
  });

  // 수 배우기의 두·세 수 외통 문제(apps/web/src/janggi/puzzles.ts)에서 몇 개.
  it.each([
    [2, { "16": "hK", "62": "cR", "68": "cR", "05": "cK" }],
    [2, { "19": "cR", "36": "hK", "55": "cC", "85": "cK" }],
    [3, { "19": "cR", "26": "hK", "56": "cP", "95": "cK" }],
    [3, { "25": "cP", "34": "hK", "73": "cR", "95": "cK" }],
    [3, { "23": "cN", "24": "hK", "42": "cR", "05": "cK" }],
  ] as const)("초고수는 %i수 외통을 찾는다", (mateIn, pieces) => {
    const state = createJanggiScenario({ pieces });
    const action = janggiMasterBot.decide(viewOf(state, 0), createRng(3));
    expect(action.type).toBe("move");
    if (action.type !== "move") return;
    const after = applyMove(state.board, action);
    expect(
      forcesMateAfter(after, "c", mateIn - 1),
      `${pointName(action.from)}-${pointName(action.to)}`,
    ).toBe(true);
  });

  it("초고수는 같은 화면·같은 난수면 늘 같은 수를 둔다(판 끝 검증이 다시 계산한다)", () => {
    // 입문끼리 20수 둔 가운데 판(빅장 금지: 입문끼리는 빅장으로 일찍 끝나기 쉽다)
    let { state } = createMatch({ ...STANDARD_RULES, bikjang: "forbidden" }, 4);
    const rng = createRng(4);
    while (
      state.phase === "setup" ||
      (state.phase === "play" && state.played.length < 20)
    ) {
      const seat = pendingSeats(state)[0] as number;
      const r = step(
        state,
        seat,
        janggiBeginnerBot.decide(viewOf(state, seat), rng),
      );
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(state.phase).toBe("play");
    const seat = pendingSeats(state)[0] as number;
    const view = viewOf(state, seat);
    const first = createRng(77);
    const a = janggiMasterBot.decide(view, first);
    // 사이에 다른 판을 읽어도 남는 상태가 없어야 한다.
    janggiMasterBot.decide(
      viewOf(
        createJanggiScenario({
          pieces: { "16": "hK", "62": "cR", "68": "cR", "05": "cK" },
        }),
        0,
      ),
      createRng(1),
    );
    const second = createRng(77);
    const b = janggiMasterBot.decide(viewOf(state, seat), second);
    expect(b).toEqual(a);
    expect(second).toEqual(first);
  });

  it("단계 번호로 컴퓨터를 고른다", () => {
    expect(janggiBotFor(0)).toBe(janggiBeginnerBot);
    expect(janggiBotFor(1)).toBe(janggiIntermediateBot);
    expect(janggiBotFor(2)).toBe(janggiExpertBot);
    expect(janggiBotFor(3)).toBe(janggiMasterBot);
  });
});

describe("초고수 노드 예산", () => {
  // 노드 예산이 바뀌면 같은 판에서 다른 수가 나와, 판 끝 다시 계산(같은 컴퓨터로 기록을 다시 두기)이 어긋난다.
  // 지금은 온라인이 초고수를 쓰지 않지만, 쓰게 되면 이 값을 바꿀 때 방 규칙 판 번호도 올려야 한다(docs/22 3절).
  it("값이 그대로다", () => {
    expect(MASTER_BUDGET).toEqual({ nodes: 50_000, softNodes: 16_000 });
  });
});
