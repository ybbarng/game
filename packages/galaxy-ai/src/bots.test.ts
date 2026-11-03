import {
  bidCommitment,
  bidSalt,
  boardOfSky,
  createGalaxyScenario,
  createMatch,
  debtPlan,
  type GalaxyState,
  SHORT_RULES,
  STANDARD_RULES,
  step,
  stepWithDice,
  viewOf,
} from "@game/galaxy-engine";
import { createRng } from "@game/mighty-engine";
import { chainCommit, derivedSeed } from "@game/yut-engine";
import { describe, expect, it } from "vitest";

import {
  botKnowsChain,
  GALAXY_BOTS,
  galaxyBotFor,
  galaxyExpertBot,
  galaxyIntermediateBot,
} from "./bots";
import { playGalaxy } from "./simulate";

const board = boardOfSky("seasons");

function must(
  state: GalaxyState,
  seat: number,
  action: Parameters<typeof step>[2],
) {
  const result = step(state, seat, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** 0번 자리가 주사위 눈을 정해 굴린 판(사기·이용료 장면) */
function rolled(state: GalaxyState, dice: [number, number]): GalaxyState {
  const result = stepWithDice(state, state.turn.seat, dice);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("은하 한 바퀴 컴퓨터", () => {
  it("세 단계가 합법 행동만으로 사기·입찰·짓기까지 둔다(3인 짧은 판, 거래 켬)", () => {
    // 둘 수 없는 수를 내면 playGalaxy가 멈춘다. 입찰 약속과 공개가 맞지 않아도 멈춘다.
    // 판 끝까지 두지 않고, 확인할 사건(산 별·입찰 끝·정거장 짓기)이 모두 나오면 멈춘다
    const seen = new Set<string>();
    const watched = ["bought", "auctionEnded", "built"];
    const { state } = playGalaxy({
      bots: [0, 1, 2].map(galaxyBotFor),
      rules: { ...SHORT_RULES, players: 3, trade: true },
      seed: 11, // 8돌림에 사기·입찰·짓기가 모두 나온다(짧은 판은 14돌림)
      board,
      onStep: (_before, _seat, _action, _after, events) => {
        for (const e of events) seen.add(e.type);
      },
      until: (s) => s.phase === "gameOver" || watched.every((t) => seen.has(t)),
    });
    for (const t of watched) expect(seen.has(t), t).toBe(true);
    expect(state.round).toBeGreaterThan(0);
  });

  it("같은 화면이면 난수와 상관없이 같은 수를 둔다(중수·고수, 입찰은 세 단계 모두)", () => {
    const scene = rolled(
      createGalaxyScenario({ board, cash: [800, 800, 800, 800] }),
      [1, 2],
    );
    expect(scene.phase).toBe("buy");
    for (const bot of [galaxyIntermediateBot, galaxyExpertBot])
      expect(bot.decide(viewOf(scene, 0), createRng(1))).toEqual(
        bot.decide(viewOf(scene, 0), createRng(99)),
      );
    const auction = must(scene, 0, { type: "pass" });
    for (const bot of GALAXY_BOTS)
      for (const seat of [0, 1, 2, 3])
        expect(bot.decide(viewOf(auction, seat), createRng(1))).toEqual(
          bot.decide(viewOf(auction, seat), createRng(2)),
        );
  });

  it("살 돈이 없으면 사지 않고 넘긴다", () => {
    const scene = rolled(
      createGalaxyScenario({ board, cash: [50, 800, 800, 800] }),
      [1, 2],
    );
    const view = viewOf(scene, 0);
    expect(view.decision).toMatchObject({ kind: "buy", canAfford: false });
    for (const bot of GALAXY_BOTS)
      expect(bot.decide(view, createRng(3))).toEqual({ type: "pass" });
  });

  it("입찰 값은 10 단위이고 가진 별빛을 넘지 않는다", () => {
    const scene = rolled(
      createGalaxyScenario({ board, cash: [800, 35, 800, 1000] }),
      [1, 2],
    );
    let state = must(scene, 0, { type: "pass" });
    for (const seat of [0, 1, 2, 3])
      state = must(
        state,
        seat,
        GALAXY_BOTS[seat % 3]?.decide(
          viewOf(state, seat),
          createRng(seat),
        ) as never,
      );
    expect(state.phase).toBe("bidReveal");
    for (const seat of [0, 1, 2, 3]) {
      const action = GALAXY_BOTS[seat % 3]?.decide(
        viewOf(state, seat),
        createRng(seat),
      );
      expect(action?.type).toBe("bidReveal");
      if (action?.type !== "bidReveal") continue;
      expect(action.value % 10).toBe(0);
      expect(action.value).toBeLessThanOrEqual(state.cash[seat] ?? 0);
      state = must(state, seat, action);
    }
    expect(state.lastAuction?.bids.every((b) => b === null || b >= 0)).toBe(
      true,
    );
  });

  it("빚이 생기면 정리 제안대로 정리해 갚는다", () => {
    // 0번은 별빛 10, 사자자리 별 둘을 가졌다. 1번의 시리우스(큰정거장)에 멈추면 빚 정리
    const sirius = board.squares.findIndex((s) => s.star?.star.id === "Sirius");
    const leo = board.squares.flatMap((s) =>
      s.star && board.groups[s.star.group]?.id === "Leo" ? [s.index] : [],
    );
    const canis = board.squares.flatMap((s) =>
      s.star && board.groups[s.star.group]?.id === "CMa" ? [s.index] : [],
    );
    const start = sirius - 3;
    let state = createGalaxyScenario({
      board,
      positions: [start, 0, 0, 0],
      cash: [10, 800, 800, 800],
      stars: [
        ...leo.map((square) => ({ square, owner: 0 })),
        ...canis.map((square) => ({ square, owner: 1, level: 2 })),
      ],
    });
    state = rolled(state, [1, 2]);
    expect(state.phase).toBe("debt");
    const plan = debtPlan(state);
    expect(plan.length).toBeGreaterThan(0);
    for (const bot of GALAXY_BOTS) {
      let s = state;
      for (let guard = 0; guard < 10 && s.phase === "debt"; guard++) {
        const action = bot.decide(viewOf(s, 0), createRng(4));
        expect(["sell", "mortgage"]).toContain(action.type);
        s = must(s, 0, action);
      }
      expect(s.phase).not.toBe("debt");
      expect(s.out[0]).toBe(false);
    }
  });

  it("사람이 만든 사슬은 대신 공개하지 않는다", () => {
    let { state } = createMatch({ ...STANDARD_RULES, players: 2 }, 5, board);
    // 0번 자리는 사람이 자기 씨앗으로 약속했다. 1번은 컴퓨터 재료로 약속했다
    state = must(state, 0, {
      type: "commit",
      hash: chainCommit("ab".repeat(32)),
    });
    state = must(state, 1, {
      type: "commit",
      hash: chainCommit(derivedSeed(state.keys[1] as string, 0)),
    });
    state = must(state, state.turn.seat, { type: "roll" });
    expect(state.phase).toBe("reveal");
    expect(botKnowsChain(viewOf(state, 0))).toBe(false);
    expect(botKnowsChain(viewOf(state, 1))).toBe(true);
    expect(() =>
      galaxyExpertBot.decide(viewOf(state, 0), createRng(1)),
    ).toThrow();
    const reveal = galaxyExpertBot.decide(viewOf(state, 1), createRng(1));
    expect(step(state, 1, reveal).ok).toBe(true);
  });

  it("봉투는 자리 재료의 소금으로 낸 것만 대신 공개한다(사람이 자기 소금으로 낸 봉투는 기다린다)", () => {
    const rules = { ...STANDARD_RULES, players: 3 as const };
    // 0번 자리가 시리우스(14)에 멈춰 넘겼다 → 봉인 입찰
    let state: GalaxyState = {
      ...createGalaxyScenario({ board, rules, positions: [14, 0, 0] }),
      phase: "buy",
    };
    state = must(state, 0, { type: "pass" });
    expect(state.phase).toBe("bid");
    const index = state.auction?.index as number;
    // 0번: 사람이 자기 소금으로 150. 1번: 방장이 대신 낸 「내지 않음」(재료 소금). 2번: 컴퓨터
    state = must(state, 0, {
      type: "bid",
      hash: bidCommitment(index, 150, "cd".repeat(16)),
    });
    state = must(state, 1, {
      type: "bid",
      hash: bidCommitment(index, 0, bidSalt(state.keys[1] as string, index)),
    });
    state = must(
      state,
      2,
      galaxyIntermediateBot.decide(viewOf(state, 2), createRng(1)),
    );
    expect(state.phase).toBe("bidReveal");
    expect(botKnowsChain(viewOf(state, 0))).toBe(false);
    expect(() =>
      galaxyIntermediateBot.decide(viewOf(state, 0), createRng(1)),
    ).toThrow();
    for (const seat of [1, 2]) {
      expect(botKnowsChain(viewOf(state, seat))).toBe(true);
      const reveal = galaxyExpertBot.decide(viewOf(state, seat), createRng(1));
      if (seat === 1) expect(reveal).toMatchObject({ value: 0 });
      state = must(state, seat, reveal);
    }
    expect(state.phase).toBe("bidReveal");
  });

  it("단계 번호로 고른다", () => {
    expect(galaxyBotFor(0).name).toBe("입문");
    expect(galaxyBotFor(1).name).toBe("중수");
    expect(galaxyBotFor(2).name).toBe("고수");
    expect(galaxyBotFor(9).name).toBe("고수");
  });
});
