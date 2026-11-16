import {
  type CompletedTrick,
  createMatch,
  type HeartsRules,
  type PlayerView,
  playableCards,
  pointsOf,
  step,
  trickWinner,
  viewOf,
  WINDOWS_RULES,
} from "@game/hearts-engine";
import { type Card, createRng } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import type { HeartsBot } from "./knowledge";
import type { HeartsPersona } from "./persona";
import { heartsNormalBot } from "./rule-bot";
import {
  createHeartsSearchBot,
  planHeartsPass,
  planHeartsPlay,
  type SearchBudget,
  type Standing,
  standingAwareBot,
  standingValue,
} from "./search-bot";

const rules: HeartsRules = WINDOWS_RULES;

/** 시험에서는 낮은 카드를 잊지 않고, 비슷한 수 가운데 아무거나 고르지 않는다 */
const EXACT: HeartsPersona = {
  name: "시험",
  memory: 1,
  closeMargin: 0.3,
  whim: 0,
};

/** 시계가 멈춰 있어 시간 상한에 걸리지 않는다 */
const frozen = (worlds: number): SearchBudget => ({
  worlds,
  minWorlds: worlds,
  timeLimitMs: 300,
  now: () => 0,
});

/** 부를 때마다 `step`ms씩 흐르는 시계 */
function ticking(step: number): () => number {
  let t = 0;
  return () => {
    const now = t;
    t += step;
    return now;
  };
}

/**
 * 지난 턴들을 손으로 적은 카드 내기 화면(0번 자리).
 * `tricks`는 턴마다 [선, 선부터 차례로 낸 카드]. 먹은 사람은 엔진 규칙으로 정한다.
 */
function playView(options: {
  hand: Card[];
  tricks: [number, Card[]][];
  trick: [number, Card[]];
  scores: number[];
  heartsBroken?: boolean;
}): PlayerView {
  const tricks: CompletedTrick[] = options.tricks.map(([leader, cards]) => {
    const trick = {
      leader,
      plays: cards.map((card, i) => ({ seat: (leader + i) % 4, card })),
    };
    return { ...trick, winner: trickWinner(trick) };
  });
  const [leader, cards] = options.trick;
  const plays = cards.map((card, i) => ({ seat: (leader + i) % 4, card }));
  const played = new Set(plays.map((p) => p.seat));
  const left = 13 - tricks.length;
  const handCounts = [0, 1, 2, 3].map((s) =>
    s === 0 ? options.hand.length : left - (played.has(s) ? 1 : 0),
  );
  const taken = [0, 1, 2, 3].map((s) =>
    tricks
      .filter((t) => t.winner === s)
      .flatMap((t) => t.plays.map((p) => p.card)),
  );
  return {
    seat: 0,
    rules,
    players: [0, 1, 2, 3],
    roundNumber: 5,
    phase: "play",
    direction: "none",
    hand: options.hand,
    handCounts,
    myPass: null,
    passReady: [true, true, true, true],
    received: [],
    trickIndex: tricks.length,
    trick: { leader, plays },
    tricks,
    takenPoints: taken.map((t) => pointsOf(t, rules)),
    heartsBroken: options.heartsBroken ?? true,
    turn: 0,
    scores: options.scores,
    history: [],
    roundPoints: null,
    moonShooter: null,
    decision: {
      kind: "play",
      cards: playableCards(
        rules,
        options.hand,
        { leader, plays },
        tricks.length,
        options.heartsBroken ?? true,
      ),
      leading: plays.length === 0,
    },
  };
}

/*
 * 끝에서 둘째 턴. 1번(99점)이 ♣6으로 이기고 있고 나는 ♣가 없어 ◆5나 ♥2를 낸다.
 * 지난 턴에 2번이 하트 4장(4점), 3번이 ♠Q와 하트 8장(21점)을 먹었다. 남은 ◆3·◆4·◆6은 세 사람이 한 장씩.
 * ♥2를 주면 1번이 100점이 되어 게임이 끝난다. 판 점수로는 ◆5든 ♥2든 나는 0점이다
 * (◆5를 내면 마지막 턴에 ♥2를 버려 ◆6을 가진 사람이 먹는다).
 */
const LATE_TRICKS: [number, Card[]][] = [
  [1, ["C2", "C7", "C8", "C9"]],
  [0, ["CA", "C10", "CJ", "CQ"]],
  [1, ["S2", "S3", "S4", "CK"]],
  [3, ["S5", "C5", "S6", "S7"]],
  [2, ["S8", "S9", "S10", "SJ"]],
  [1, ["SK", "SQ", "SA", "D7"]],
  [0, ["D2", "D8", "D9", "D10"]],
  [3, ["DJ", "DQ", "DK", "DA"]],
  [2, ["H4", "H9", "H5", "H3"]],
  [3, ["H6", "H7", "H8", "H10"]],
  [2, ["HJ", "HA", "HQ", "HK"]],
];

function lateView(scores: number[]): PlayerView {
  return playView({
    hand: ["D5", "H2"],
    tricks: LATE_TRICKS,
    trick: [1, ["C6", "C3", "C4"]],
    scores,
  });
}

describe("하트 고수: 점수 판", () => {
  it("게임이 끝나면 1등은 1, 꼴찌는 −0.5, 사이는 0", () => {
    expect(standingValue([40, 100, 60, 70], 0, 100)).toBe(1);
    expect(standingValue([40, 100, 60, 70], 1, 100)).toBe(-0.5);
    expect(standingValue([40, 100, 60, 70], 2, 100)).toBe(0);
  });

  it("게임이 이어지면 1등 몫은 점수가 낮을수록 크다", () => {
    const lead = standingValue([40, 90, 60, 70], 0, 100);
    const second = standingValue([40, 90, 60, 70], 2, 100);
    expect(lead).toBeGreaterThan(second);
    expect(lead).toBeLessThan(1);
  });

  it("내가 2등이면 1번(99점)에게 하트를 주어 게임을 끝내지 않는다", () => {
    // 나 44점, 2번 38+4=42점: 지금 끝나면 2번이 1등이다.
    const view = lateView([44, 99, 38, 50]);
    const card = (standing: boolean) => {
      const action = createHeartsSearchBot({
        worlds: 12,
        persona: EXACT,
        standing,
      }).decide(view, createRng(1));
      return action.type === "play" ? action.card : null;
    };
    expect(card(true)).toBe("D5");
    // 점수 판을 보지 않으면 판 점수가 같아 정석대로 하트를 버린다.
    expect(card(false)).toBe("H2");
  });

  it("내가 1등이면 1번에게 하트를 주어 게임을 끝낸다", () => {
    const action = createHeartsSearchBot({
      worlds: 12,
      persona: EXACT,
      standing: true,
    }).decide(lateView([20, 99, 38, 50]), createRng(1));
    expect(action).toMatchObject({ type: "play", card: "H2" });
  });

  it("아무도 끝 점수에 가깝지 않으면 순위를 보지 않는다", () => {
    const plan = planHeartsPlay(lateView([10, 30, 5, 20]), createRng(1), {
      budget: frozen(6),
      persona: EXACT,
      standing: true,
    });
    // ◆5든 ♥2든 남은 하트 한 장은 남이 먹으니 판 점수 값이 같다(남이 먹은 26점의 평균).
    const [d5, h2] = plan?.values.map((v) => v.mean) ?? [];
    expect(d5).toBeCloseTo(26 / 3);
    expect(h2).toBeCloseTo(26 / 3);
  });
});

describe("하트 고수: 시뮬레이션 안의 순위 보는 버리기", () => {
  /** 늘 정한 카드를 내는 바탕 봇 */
  const always = (card: Card): HeartsBot => ({
    name: "always",
    decide: () => ({ type: "play", card }),
  });
  const decide = (bot: HeartsBot, view: PlayerView) =>
    bot.decide(view, createRng(1));
  /** 이번 판 전 점수. 지금 판에서 2번이 4점, 3번이 21점을 먹었다 */
  const standingOf = (scores: number[]): Standing => ({
    scores,
    endScore: 100,
  });

  it("2등이면 99점인 1번이 이기는 턴에 하트를 버리지 않고 ◆5를 버린다", () => {
    // 1번이 ♥2를 먹으면 100점으로 게임이 끝나고 42점인 2번이 1등이다(나는 44점).
    const scores = [44, 99, 38, 50];
    const bot = standingAwareBot(heartsNormalBot, standingOf(scores));
    expect(decide(heartsNormalBot, lateView(scores))).toMatchObject({
      card: "H2",
    });
    expect(decide(bot, lateView(scores))).toMatchObject({ card: "D5" });
  });

  it("1등이면 1번에게 하트를 주어 게임을 끝낸다: 바탕 봇이 ◆5를 골라도 ♥2로 바꾼다", () => {
    const scores = [20, 99, 38, 50];
    const bot = standingAwareBot(always("D5"), standingOf(scores));
    expect(decide(bot, lateView(scores))).toMatchObject({ card: "H2" });
  });

  it("시뮬레이션 안의 내 수가 순위를 봐도 같은 씨앗이면 같은 카드를 고른다", () => {
    const view = lateView([44, 99, 38, 50]);
    const card = () =>
      createHeartsSearchBot({
        worlds: 8,
        persona: EXACT,
        standing: true,
        standingRollout: "self",
      }).decide(view, createRng(7));
    expect(card()).toEqual(card());
  });
});

describe("하트 고수: 문 슛", () => {
  // 첫 턴은 내가 ♣A로, 둘째 턴은 2번이 ♥3을 버려 내가 먹었다(나만 1점). 셋째 턴 ◆ 선.
  const strong = () =>
    playView({
      hand: ["HA", "HK", "HQ", "HJ", "H5", "H4", "SA", "S8", "S2", "DA", "D2"],
      tricks: [
        [1, ["C2", "C3", "C4", "CA"]],
        [0, ["CK", "C5", "H3", "C6"]],
      ],
      trick: [1, ["D5", "D6", "D7"]],
      scores: [0, 0, 0, 0],
    });

  it("패가 좋으면 문 슛 계획으로 둬 보고 ◆A로 턴을 먹으러 간다", () => {
    const view = strong();
    const plan = planHeartsPlay(view, createRng(2), {
      budget: frozen(12),
      persona: EXACT,
      moon: true,
    });
    const best = (xs: { mean: number }[]) => Math.max(...xs.map((x) => x.mean));
    expect(plan?.moon).not.toBeNull();
    expect(best(plan?.moon ?? [])).toBeGreaterThan(
      best(plan?.values ?? []) + 1,
    );
    const action = createHeartsSearchBot({
      worlds: 12,
      persona: EXACT,
    }).decide(view, createRng(2));
    expect(action).toMatchObject({ type: "play", card: "DA" });
    // 문 슛을 노리지 않으면 ◆2로 피한다.
    const plain = createHeartsSearchBot({
      worlds: 12,
      persona: EXACT,
      moon: false,
    }).decide(view, createRng(2));
    expect(plain).toMatchObject({ type: "play", card: "D2" });
  });

  it("남이 점수를 먹었으면 문 슛 계획은 보지 않는다", () => {
    const view = playView({
      hand: ["HA", "HK", "HQ", "HJ", "H10", "H9", "SA", "SK", "SQ", "DA", "D2"],
      tricks: [
        [1, ["C2", "C3", "C4", "CA"]],
        [1, ["CK", "H3", "C5", "C6"]],
      ],
      trick: [1, ["D5", "D6", "D7"]],
      scores: [0, 0, 0, 0],
    });
    const plan = planHeartsPlay(view, createRng(2), {
      budget: frozen(4),
      persona: EXACT,
      moon: true,
    });
    expect(plan?.moon).toBeNull();
  });

  /*
   * 끝에서 셋째 턴. 1번이 지금까지 ♠Q와 하트 8장을 혼자 먹었고 ♥9로 선을 잡았다.
   * 2·3번은 하트가 떨어졌으니 남은 ♥A·♥Q는 1번에게 있다. 내가 ♥2로 피하면 1번이 문 슛을 한다.
   */
  it("남이 문 슛을 노리면 하트를 먹어 막는다", () => {
    const view = playView({
      hand: ["HJ", "H2", "D2"],
      tricks: [
        [0, ["C2", "CA", "C3", "C4"]],
        [1, ["CK", "C5", "C6", "C7"]],
        [1, ["CQ", "C8", "C9", "C10"]],
        [1, ["SA", "S2", "S3", "S4"]],
        [1, ["SK", "S5", "S6", "SQ"]],
        [1, ["DA", "D3", "D4", "D5"]],
        [1, ["H10", "H3", "H4", "H5"]],
        [1, ["HK", "H6", "H7", "H8"]],
        [1, ["DK", "D6", "D7", "D8"]],
        [1, ["DQ", "D9", "D10", "DJ"]],
      ],
      trick: [1, ["H9", "CJ", "S7"]],
      scores: [0, 0, 0, 0],
    });
    const plan = planHeartsPlay(view, createRng(3), {
      budget: frozen(8),
      persona: EXACT,
      moon: true,
    });
    expect(plan?.threat).toBe(1);
    const action = createHeartsSearchBot({
      worlds: 8,
      persona: EXACT,
    }).decide(view, createRng(3));
    expect(action).toMatchObject({ type: "play", card: "HJ" });
  });
});

describe("하트 고수: 계산 시간 상한", () => {
  function firstPlayView(): PlayerView {
    let { state } = createMatch({ rules, seed: 9 });
    for (let s = 0; s < 4; s++) {
      const r = step(state, s, {
        type: "pass",
        cards: state.round.hands[s]?.slice(0, 3) ?? [],
      });
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    // ♣2를 가진 사람이 첫 카드를 낸 뒤 다음 자리
    const opener = state.round.hands.findIndex((h) => h.includes("C2"));
    const r = step(state, opener, { type: "play", card: "C2" });
    if (!r.ok) throw new Error(r.error);
    return viewOf(r.state, (opener + 1) % 4);
  }

  it("카드 내기: 부를 때마다 100ms씩 흐르면 300ms가 지난 4판째에서 멈춘다", () => {
    const plan = planHeartsPlay(firstPlayView(), createRng(1), {
      budget: { worlds: 30, minWorlds: 2, timeLimitMs: 300, now: ticking(100) },
      persona: EXACT,
    });
    expect(plan?.worlds).toBe(4);
  });

  it("카드 내기: 시간이 크게 넘어도 최소 판 수는 채운다", () => {
    const plan = planHeartsPlay(firstPlayView(), createRng(1), {
      budget: {
        worlds: 30,
        minWorlds: 5,
        timeLimitMs: 300,
        now: ticking(10_000),
      },
      persona: EXACT,
    });
    expect(plan?.worlds).toBe(5);
  });

  it("카드 넘기기: 시간 상한 안이면 정한 판 수를 모두 돌리고, 넘으면 멈춘다", () => {
    const { state } = createMatch({ rules, seed: 4 });
    const view = viewOf(state, 0);
    const full = planHeartsPass(view, createRng(1), { budget: frozen(10) });
    expect(full?.worlds).toBe(10);
    const cut = planHeartsPass(view, createRng(1), {
      budget: { worlds: 10, minWorlds: 2, timeLimitMs: 300, now: ticking(100) },
    });
    expect(cut?.worlds).toBe(4);
  });

  it("시계를 넣은 봇만 시간 상한을 쓴다: 시계가 크게 흐르면 최소 판 수에서 멈춘다", () => {
    const view = lateView([10, 30, 5, 20]);
    let calls = 0;
    const clock = {
      now: () => {
        calls++;
        return calls * 10_000;
      },
    };
    createHeartsSearchBot({ persona: EXACT, clock }).decide(view, createRng(1));
    // 시작할 때 한 번, 최소 4판을 채운 뒤 한 번 보고 멈춘다(30판을 다 돌면 28번 본다).
    expect(calls).toBe(2);
  });

  it("같은 씨앗이면 같은 카드를 넘긴다", () => {
    const { state } = createMatch({ rules, seed: 4 });
    const view = viewOf(state, 0);
    const bot = createHeartsSearchBot({ passWorlds: 8 });
    expect(bot.decide(view, createRng(7))).toEqual(
      bot.decide(view, createRng(7)),
    );
  });
});
