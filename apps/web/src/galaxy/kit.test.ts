import { galaxyBotFor, playGalaxy } from "@game/galaxy-ai";
import {
  boardOfSky,
  GALAXY_EDITION,
  type GameEvent,
  SHORT_RULES,
  STANDARD_RULES,
  step,
  viewOf,
} from "@game/galaxy-engine";
import { describe, expect, it } from "vitest";

import { SKY_STARS } from "@/stardraw/sky";
import type { RoundRecord } from "@/stats/records";

import { eventLine } from "./events";
import { buildTimeline, shipPositions, shownCash } from "./fx";
import {
  describeGalaxy,
  explainGalaxy,
  type GalaxyRound,
  galaxyKit,
  galaxyStats,
  isCurrentEdition,
  metSquares,
  outcomeOf,
  summarizeGalaxy,
} from "./kit";
import { lengthDetail, rulesFromSettings, soloMinutes } from "./settings";
import { STAR_FACTS } from "./star-facts";

const rules = { ...SHORT_RULES, players: 2 as const };

/** 입문 둘이 짧은 판 하나를 끝까지 두고 사건을 모은다(결정적) */
/** 컴퓨터 둘이 몇 돌림 두다가 1번 자리가 기권해 끝낸 판(판 끝까지 두지 않는다) */
function playedGame() {
  const events: GameEvent[] = [];
  const log: { seat: number; action: unknown }[] = [];
  const bot = galaxyBotFor(0);
  const { state: played } = playGalaxy({
    bots: [bot, bot],
    rules,
    seed: 7,
    until: (s) => s.round >= 5 && s.phase === "turn",
    onStep: (_before, seat, action, _after, evs) => {
      events.push(...evs);
      log.push({ seat, action });
    },
  });
  const resigned = step(played, 1, { type: "resign" });
  if (!resigned.ok) throw new Error(resigned.error);
  events.push(...resigned.events);
  log.push({ seat: 1, action: { type: "resign" } });
  return { state: resigned.state, events, log };
}

describe("은하 한 바퀴 kit", () => {
  it("규칙 문자열을 주고받는다", () => {
    const code = galaxyKit.encodeRules(rules);
    expect(code).toMatch(/^g5-2s[tn]w[a-z]*-seasons$/);
    expect(galaxyKit.decodeRules(code)).toEqual({ ok: true, rules });
    expect(galaxyKit.decodeRules(code.replace("seasons", "zodiac")).ok).toBe(
      false,
    );
  });

  it("기록대로 다시 두면 같은 판이 된다", () => {
    const { state, log } = playedGame();
    const again = galaxyKit.replay(rules, 7, log as never);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.state.cash).toEqual(state.cash);
  });

  it("판 기록: 순위·자산·이용료·만난 별을 남긴다", () => {
    const { state, events } = playedGame();
    const end = viewOf(state, 0);
    const round = galaxyStats.round(null, end, events) as GalaxyRound;
    const mine = state.result?.standings.find((s) => s.seat === 0);
    expect(round.rank).toBe(mine?.rank);
    expect(round.assets).toBe(mine?.assets);
    expect(round.players).toBe(2);
    const paid = events
      .filter((e) => e.type === "pay" && e.reason === "rent" && e.from === 0)
      .reduce((n, e) => n + (e.type === "pay" ? e.amount : 0), 0);
    expect(round.rentPaid).toBe(paid);
    // 짧은 판은 시작 별 둘을 받으므로 만난 별이 적어도 둘이다
    expect(round.met.length).toBeGreaterThanOrEqual(2);
    const ids = new Set(
      boardOfSky("seasons").squares.flatMap((s) =>
        s.star ? [s.star.star.id] : [],
      ),
    );
    for (const id of round.met) expect(ids.has(id)).toBe(true);
    expect(galaxyStats.game(end, events)).toEqual({
      won: mine?.rank === 1,
      retired: false,
    });
    expect(outcomeOf(state.result, 0)).toBe(mine?.rank === 1 ? "win" : "loss");

    const records = [round, { ...round, rank: 1, assets: 2000 }].map(
      (data, i) =>
        ({ game: "galaxy", data, id: `${i}`, at: i }) as unknown as RoundRecord,
    );
    const summary = summarizeGalaxy(records);
    expect(round.edition).toBe(GALAXY_EDITION);
    expect(summary.rounds).toBe(2);
    expect(summary.oldRounds).toBe(0);
    expect(summary.bestAssets).toBe(Math.max(2000, round.assets));
    expect(summary.met.length).toBe(new Set(round.met).size);
  });

  it("내 기록: 옛 규칙 판(판 번호가 다르거나 없음)은 숫자에 섞지 않고 판 수만 센다", () => {
    const base: GalaxyRound = {
      edition: GALAXY_EDITION,
      players: 4,
      length: "standard",
      sky: "seasons",
      rank: 2,
      assets: 1500,
      cash: 800,
      by: "turns",
      bought: [],
      completed: ["orion"],
      rentPaid: 100,
      rentReceived: 200,
      met: ["rigel"],
    };
    const { edition: _, ...noEdition } = base;
    const rounds = [
      base,
      {
        ...base,
        edition: GALAXY_EDITION - 1,
        rank: 1,
        assets: 9000,
        met: ["vega"],
      },
      { ...noEdition, rank: 1, assets: 8000, completed: ["lyra"] },
    ].map(
      (data, i) =>
        ({ game: "galaxy", data, id: `${i}`, at: i }) as unknown as RoundRecord,
    );
    const s = summarizeGalaxy(rounds);
    expect(s.rounds).toBe(1);
    expect(s.oldRounds).toBe(2);
    expect(s.firsts).toBe(0);
    expect(s.averageRank).toBe(2);
    expect(s.bestAssets).toBe(1500);
    expect(s.completedBy).toEqual({ orion: 1 });
    expect(s.rentReceived).toBe(200);
    expect(s.recent).toEqual([{ rank: 2, players: 4 }]);
    // 만난 별은 규칙과 상관없어 옛 판도 함께 센다
    expect(s.met.sort()).toEqual(["rigel", "vega"]);
  });

  it("다시 보기: 행동 한 줄과 이 걸음의 별빛 흐름", () => {
    expect(describeGalaxy({ type: "roll" })).toBe("주사위 굴리기");
    expect(describeGalaxy({ type: "build", square: 15 })).toBe(
      "시리우스 정거장 올리기",
    );
    const { log } = playedGame();
    // 사기가 들어간 걸음 하나를 찾아 해설에 사기 줄이 있는지 본다
    const at = log.findIndex(
      (l) => (l.action as { type: string }).type === "buy",
    );
    expect(at).toBeGreaterThan(0);
    const before = galaxyKit.replay(rules, 7, log.slice(0, at) as never);
    if (!before.ok) throw new Error(before.error);
    const c = explainGalaxy(
      before.state,
      log[at] as { seat: number; action: unknown },
      null,
      7,
      (s) => (s === 0 ? "나" : "컴퓨터"),
    );
    expect(c.verdict).toBeNull();
    expect(c.reasons.some((r) => r.includes("샀어요"))).toBe(true);
  });
});

describe("설정", () => {
  it("판 길이에 차례 수와 어림 시간을 보인다", () => {
    const r = rulesFromSettings({
      players: 4,
      length: "standard",
      trade: true,
      seasonal: true,
    });
    expect(soloMinutes(r)).toBeGreaterThan(5);
    expect(lengthDetail(r)).toMatch(/20차례 · 약 \d+분/);
    expect(lengthDetail({ ...r, length: "long" })).toMatch(/한 사람만/);
  });
});

describe("별 이야기", () => {
  it("사계절 하늘 24별을 모두 덮고, 별 따기에 있는 별은 같은 문장이다", () => {
    const board = boardOfSky("seasons");
    const stars = board.squares.flatMap((s) => (s.star ? [s.star.star] : []));
    expect(stars).toHaveLength(24);
    for (const star of stars) {
      expect(STAR_FACTS[star.id], star.id).toBeTruthy();
      const same = SKY_STARS.find((s) => s.name === star.id);
      if (same) expect(STAR_FACTS[star.id]).toBe(same.fact);
    }
  });
});

describe("연출 목록", () => {
  const board = boardOfSky("seasons");
  const events: GameEvent[] = [
    {
      type: "dice",
      seat: 1,
      index: 0,
      dice: [2, 3],
      doubles: false,
      purpose: "roll",
    },
    {
      type: "moved",
      seat: 1,
      from: 0,
      to: 5,
      path: [1, 2, 3, 4, 5],
      forward: true,
      via: "dice",
    },
    { type: "landed", seat: 1, square: 5 },
    { type: "pay", from: 1, to: 0, amount: 30, reason: "rent", square: 5 },
  ];

  it("주사위 → 이동 → 이용료 차례로 하나씩, 움직임 줄이기면 없다", () => {
    const t = buildTimeline(events, board, 0, { reduced: false });
    expect(t.steps.map((s) => s.kind)).toEqual(["dice", "move", "pay"]);
    for (let i = 1; i < t.steps.length; i++) {
      const prev = t.steps[i - 1] as (typeof t.steps)[number];
      expect(
        (t.steps[i] as (typeof t.steps)[number]).at,
      ).toBeGreaterThanOrEqual(prev.at + prev.dur);
    }
    // 컴퓨터 이동이라도 움직임은 0.6초 이상
    expect(t.steps[1]?.dur).toBeGreaterThanOrEqual(600);
    expect(buildTimeline(events, board, 0, { reduced: true }).total).toBe(0);
  });

  it("움직이는 동안 우주선은 지나는 칸에, 별빛은 흐름이 끝난 뒤 바뀐다", () => {
    const t = buildTimeline(events, board, 0, { reduced: false });
    const move = t.steps[1] as (typeof t.steps)[number];
    const mid = shipPositions(t, [0, 5], move.at + move.dur / 2);
    expect(mid[1]?.moving).toBe(true);
    expect(mid[1]?.square).toBeGreaterThan(0);
    expect(mid[1]?.square).toBeLessThan(5);
    expect(shipPositions(t, [0, 5], 0)[1]?.square).toBe(0);
    expect(shipPositions(t, [0, 5], t.total)[1]?.square).toBe(5);
    expect(shownCash(t, events, [1030, 970], 0)).toEqual([1000, 1000]);
    expect(shownCash(t, events, [1030, 970], t.total)).toEqual([1030, 970]);
  });
});

describe("만난 별과 사건 줄", () => {
  const board = boardOfSky("seasons");
  const view = { board, owners: board.squares.map(() => -1), mySeat: 0 };

  it("처음 받은 별, 거래로 오간 별도 만난 별에 든다", () => {
    const events: GameEvent[] = [
      {
        type: "dealt",
        stars: [
          [1, 2],
          [5, 6],
        ],
      },
      {
        type: "tradeAccepted",
        offer: {
          from: 1,
          to: 0,
          give: { stars: [9], cash: 0 },
          get: { stars: [2], cash: 100 },
        },
      },
    ];
    expect(metSquares(view, events)).toEqual([1, 2, 9]);
  });

  it("해당 별이 없어 0인 공문, 1위라 0인 관측 지원금도 줄을 남긴다", () => {
    const name = (s: number) => (s === 0 ? "나" : `컴퓨터 ${s}`);
    const card = (id: number, squares: number[]) =>
      eventLine({ type: "card", seat: 0, card: id, squares }, board, name);
    expect(card(4, [])).toBe("나 · 공문 「먼 별 탐사 지원」 · 해당 별 없음");
    expect(card(16, [])).toContain("해당 별자리 없음");
    expect(card(4, [9])).not.toContain("없음");
    expect(card(1, [])).not.toContain("없음");
    expect(
      eventLine({ type: "observed", seat: 1, amount: 0 }, board, name),
    ).toContain("관측 지원금 없음");
    expect(
      eventLine({ type: "observed", seat: 1, amount: 50 }, board, name),
    ).toBeNull();
    expect(eventLine({ type: "meteorShower" }, board, name)).toContain(
      "유성우의 밤",
    );
  });
});

describe("옛 규칙 판", () => {
  it("판 번호가 다른 기록은 지금 판으로 보지 않는다(다시 보기에서 다시 두지 않음)", () => {
    expect(isCurrentEdition(STANDARD_RULES)).toBe(true);
    const { edition: _, ...old } = STANDARD_RULES;
    expect(isCurrentEdition(old)).toBe(false);
    expect(isCurrentEdition({ ...STANDARD_RULES, edition: 1 })).toBe(false);
    expect(isCurrentEdition(null)).toBe(false);
  });

  it("긴 판은 유성우를 싣지 않아 같은 판이 문자열 하나다", () => {
    const rules = rulesFromSettings({
      players: 4,
      length: "long",
      trade: true,
      seasonal: true,
      meteor: true,
    });
    expect(rules.meteor).toBe(false);
  });
});
