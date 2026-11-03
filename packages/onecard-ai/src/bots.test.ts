import { createRng } from "@game/mighty-engine";
import {
  type Action,
  createMatch,
  createOnecardScenario,
  type OnecardCard,
  type OnecardScenarioOptions,
  type OnecardState,
  STANDARD_ONECARD_RULES,
  shuffledOnecardDeck,
  step,
  viewOf,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import { chooseAction, onecardBotFor } from "./choose";
import {
  determinize,
  EXPERT_OPTIONS,
  type ExpertOptions,
  expertMove,
} from "./expert";
import { ONECARD_LEVELS, type OnecardLevel } from "./levels";
import { createMemory, observe } from "./memory";

const LEVELS: OnecardLevel[] = [0, 1, 2];
/** 속성 시험용 가벼운 고수(같은 셈, 짐작 판·길이만 줄임). 상황 표는 실제 고수(기본값)로 본다 */
const LIGHT: ExpertOptions = {
  ...EXPERT_OPTIONS,
  samples: 6,
  plies: 8,
};

function decide(
  state: OnecardState,
  level: OnecardLevel,
  seed = 1,
  options: ExpertOptions = EXPERT_OPTIONS,
): Action {
  const view = viewOf(state, state.turn);
  return level === 2
    ? expertMove(view, createRng(seed), undefined, options)
    : chooseAction(view, level, createRng(seed));
}

function scene(options: OnecardScenarioOptions): OnecardState {
  return createOnecardScenario(options);
}

/** 씨앗 판을 중수로 몇 수 진행한 여러 장면(속성 시험 재료) */
function positions(count: number): OnecardState[] {
  const out: OnecardState[] = [];
  for (let seed = 1; out.length < count; seed++) {
    const players = 2 + (seed % 4);
    let { state } = createMatch(
      { ...STANDARD_ONECARD_RULES, players },
      { deck: shuffledOnecardDeck(seed) },
    );
    for (let k = 0; k < (seed * 7) % 23 && state.phase === "play"; k++) {
      const r = step(state, state.turn, decide(state, 1));
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    if (state.phase === "play") out.push(state);
  }
  return out;
}

describe("단계 목록", () => {
  it("입문·중수·고수 셋, 외침 값은 단계가 높을수록 크고 빠르다", () => {
    expect(ONECARD_LEVELS.map((l) => l.name)).toEqual(["입문", "중수", "고수"]);
    const [a, b, c] = ONECARD_LEVELS.map((l) => l.shout);
    expect(a?.shout).toBeLessThan(b?.shout as number);
    expect(b?.catch).toBeLessThan(c?.catch as number);
    expect(c?.catchMs[1]).toBeLessThanOrEqual(a?.catchMs[0] as number);
    expect(onecardBotFor(0).name).toBe("onecard-beginner");
    expect(onecardBotFor(2).name).toBe("onecard-expert");
  });
});

describe("모든 단계: 규칙에 맞는 행동만", () => {
  const states = positions(30);
  it.each(LEVELS)(
    "단계 %i: 화면의 moves 안에서 고르고 엔진이 받는다",
    (level) => {
      states.forEach((state, i) => {
        const action = decide(state, level, i, LIGHT);
        expect(viewOf(state, state.turn).moves).toContainEqual(action);
        expect(step(state, state.turn, action).ok).toBe(true);
      });
    },
  );

  it.each(LEVELS)("단계 %i: 같은 화면·씨앗이면 같은 행동", (level) => {
    for (const state of states.slice(0, 8))
      expect(decide(state, level, 7, LIGHT)).toEqual(
        decide(state, level, 7, LIGHT),
      );
  });

  it.each(LEVELS)("단계 %i: 낼 수 있는 마지막 카드는 낸다", (level) => {
    const s = scene({ hands: [["H9"], ["D3", "D4"]], pile: ["H5"] });
    expect(decide(s, level)).toEqual({ type: "play", card: "H9" });
  });

  it("남의 패가 달라도 내 화면이 같으면 같은 행동(남의 패를 보지 않는다)", () => {
    // 남의 패·더미만 다르고 장 수는 같은 두 판
    const mine: OnecardCard[] = ["H9", "HJ", "H2", "D3"];
    const a = scene({
      hands: [mine, ["S3", "S4", "C9"], ["D9", "C3"]],
      pile: ["H5"],
    });
    const b = scene({
      hands: [mine, ["D9", "C3", "S8"], ["S3", "HA"]],
      pile: ["H5"],
    });
    const va = viewOf(a, 0);
    const vb = viewOf(b, 0);
    expect(vb).toEqual(va);
    expect(b.hands).not.toEqual(a.hands);
    for (const level of LEVELS) {
      const x =
        level === 2
          ? expertMove(va, createRng(3), undefined, LIGHT)
          : chooseAction(va, level, createRng(3));
      const y =
        level === 2
          ? expertMove(vb, createRng(3), undefined, LIGHT)
          : chooseAction(vb, level, createRng(3));
      expect(y).toEqual(x);
    }
  });

  it("컴퓨터는 상태가 아니라 화면만 받는다(타입)", () => {
    const s = scene({ hands: [["H9", "D3"], ["D4"]], pile: ["H5"] });
    // @ts-expect-error 엔진 상태(모든 패)를 넘길 수 없다
    expect(() => chooseAction(s, 1, createRng(1))).toThrow();
  });
});

describe("상황 표", () => {
  it.each([1, 2] as const)("단계 %i: 공격을 받으면 받아친다", (level) => {
    const s = scene({
      hands: [
        ["S2", "H5", "D9", "C4"],
        ["D3", "D4", "D5"],
      ],
      pile: ["C2"],
      attack: 2,
    });
    expect(decide(s, level)).toEqual({ type: "play", card: "S2" });
  });

  it.each([1, 2] as const)(
    "단계 %i: 다음 사람이 한 장이면 공격 카드로 막는다",
    (level) => {
      const s = scene({
        hands: [
          ["H2", "H9", "D3", "C4"],
          ["S3"],
          ["S4", "S5", "S6", "S8", "S9"],
        ],
        pile: ["H5"],
      });
      expect(decide(s, level)).toEqual({ type: "play", card: "H2" });
    },
  );

  it.each([1, 2] as const)(
    "단계 %i: 다음 사람이 한 장이면 J로 건너뛴다",
    (level) => {
      const s = scene({
        hands: [
          ["HJ", "H9", "D3", "C4"],
          ["S3"],
          ["S4", "S5", "S6", "S8", "S9"],
        ],
        pile: ["H5"],
      });
      expect(decide(s, level)).toEqual({ type: "play", card: "HJ" });
    },
  );

  it("중수: 다음 사람이 넉넉하면 공격 카드를 아낀다", () => {
    const s = scene({
      hands: [
        ["H2", "H9", "D3", "C4"],
        ["S3", "S4", "S5", "S6", "S8"],
      ],
      pile: ["H5"],
    });
    expect(decide(s, 1)).toEqual({ type: "play", card: "H9" });
  });

  it.each([1, 2] as const)(
    "단계 %i: 끝낼 수 없는 카드(공격)만 남기지 않는다",
    (level) => {
      const s = scene({
        hands: [
          ["H2", "H9"],
          ["S3", "S4", "S5", "S6", "S8"],
        ],
        pile: ["H5"],
      });
      expect(decide(s, level)).toEqual({ type: "play", card: "H2" });
    },
  );

  it.each(LEVELS)("단계 %i: 7을 내면 손에 있는 무늬로 바꾼다", (level) => {
    const s = scene({
      hands: [
        ["S7", "D3", "D4", "D8", "H5"],
        ["C3", "C4", "C5", "C6", "C8"],
      ],
      pile: ["S9"],
    });
    const action = decide(s, level);
    // 입문·중수는 가장 많은 무늬, 고수는 굴려 본 결과에 따라 손에 있는 다른 무늬도 고른다
    if (level < 2)
      expect(action).toEqual({ type: "play", card: "S7", suit: "D" });
    else
      expect(action).toMatchObject({
        type: "play",
        card: "S7",
        suit: expect.stringMatching(/^[DH]$/),
      });
  });

  it("입문: 낼 수 있으면 먹지 않고, 공격 카드도 아끼지 않는다", () => {
    const s = scene({
      hands: [
        ["H2", "HK", "D3", "C4"],
        ["S3", "S4", "S5", "S6", "S8"],
      ],
      pile: ["H5"],
    });
    const cards = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const a = decide(s, 0, seed);
      expect(a.type).toBe("play");
      if (a.type === "play") cards.add(a.card);
    }
    expect(cards).toEqual(new Set(["H2", "HK"]));
  });
});

describe("고수의 짐작", () => {
  it("짐작 판은 내 손패·버린 더미를 그대로 두고 남의 장 수를 맞춘다", () => {
    const s = scene({
      hands: [["H9", "D3"], ["S3", "S4", "S5"], ["C9"]],
      pile: ["D5", "H5"],
    });
    const view = viewOf(s, 0);
    const world = determinize(view, createRng(5));
    expect(world.hands[0]).toEqual(view.hand);
    expect(world.hands.map((h) => h.length)).toEqual([2, 3, 1]);
    expect(world.pile).toEqual(view.pile);
    expect(
      world.hands.flat().length + world.deck.length + world.pile.length,
    ).toBe(54);
  });

  it("없다고 짐작한 무늬는 그 자리에 주지 않는다", () => {
    let s = scene({
      hands: [
        ["H9", "D3", "C3"],
        ["S3", "S4", "D9", "C8"],
        ["C9", "D8", "SK"],
      ],
      pile: ["H5"],
      turn: 1,
      deck: ["SA", "S9"],
    });
    const memory = createMemory(viewOf(s, 0));
    // 1번은 ♥이 없어 먹는다
    const r = step(s, 1, { type: "draw" });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    observe(memory, r.events, viewOf(s, 0));
    expect(memory.voids[1]).toEqual(["H"]);
    expect(memory.fresh[1]).toBe(1);
    const view = viewOf(s, 0);
    for (let seed = 1; seed <= 20; seed++) {
      const world = determinize(view, createRng(seed), memory);
      const hearts = (world.hands[1] as OnecardCard[]).filter(
        (c) => c[0] === "H",
      );
      expect(hearts.length).toBeLessThanOrEqual(1);
    }
  });
});
