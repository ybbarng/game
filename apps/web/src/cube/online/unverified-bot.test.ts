import { type BotPlan, levelText } from "@game/cube-ai";
import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import type { CheckpointLog, RaceResult } from "@/net/race/types";
import { botVerifiable, type PlanFn, planHere } from "./bot-racer";
import type { drawItem, ItemKind } from "./items";
import { judgeParty, type PartyInput } from "./party";
import { type Scrambler, scrambleSeed } from "./race-game";
import {
  CubeRoom,
  excludeUnverified,
  type RoomSettings,
  type RoomState,
} from "./room";
import { pointsMatch, rankPoints, standings } from "./standings";

/**
 * 계획을 맞춰 보지 못하는 컴퓨터는 순위에서 뺀다(docs/47 10-2, PR #163 검토).
 * 고친 방장이 모르는 계획 표 버전(「9:pro」)을 붙이면 다른 기기가 계획을 다시 계산하지 않으므로, 그 컴퓨터가 아무 시각에나
 * 끝냈다고 해도 가려낼 수 없다. 그래서 각 기기가 자기가 본 것으로 그 컴퓨터를 승자·순위·점수·파티 판정에서 뺀다.
 */

const PRO = levelText("pro");

const SHORT = ["R U", "F R'", "U2 R F'"];
const fake: Scrambler = (event, seed) => ({
  event,
  text: SHORT[seed % SHORT.length] as string,
  official: false,
});

/** 고친 방장의 컴퓨터: 단계 글과 상관없이 맞추는 수를 10ms부터 5ms 간격으로 몰아 둔다 */
const cheat: PlanFn = (_level, n, start, seed) => {
  const p = planHere(PRO, n, start, seed) as BotPlan;
  const moves = p.moves.map((m, i) => ({ ...m, at: 10 + i * 5 }));
  return { ...p, moves, finishAt: moves.at(-1)?.at ?? 0 };
};

/** 내 대결이 풀리면 `delay` 뒤 섞기의 거꾸로를 한 번에 둔다 */
function solveWhenReleased(clock: ManualClock, room: CubeRoom, delay: number) {
  let done = "";
  room.onChange(() => {
    const s = room.session();
    const snap = s?.snapshot();
    if (!s || snap?.phase !== "race" || done === `${room.state?.race?.id}`)
      return;
    done = `${room.state?.race?.id}`;
    const { text } = fake("222", scrambleSeed(snap.seed as string)) as {
      text: string;
    };
    const moves = invertMoves(parseMoves(2, text));
    clock.after(delay, () => {
      for (const m of moves) s.play(m as CubeMove);
    });
  });
}

/** 방장 h(고친 클라이언트) + 손님 g + 컴퓨터 bot1(단계 글 `bot`). 한 판을 끝낸 손님의 판 기록 */
function playRound(bot: string, settings: Partial<RoomSettings> = {}) {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    isHost: true,
    name: "방장",
    scrambler: fake,
    botPlan: cheat,
    settings: { n: 2, inspection: false, timeLimitSec: 60, ...settings },
  });
  const guest = new CubeRoom({
    transport: net.join("g"),
    clock,
    isHost: false,
    name: "손님",
    scrambler: fake,
  });
  clock.advance(100);
  host.addBot(PRO);
  // 고친 방장: 단계 글을 바꿔 적어 보낸다(정직한 `addBot`은 모르는 버전을 받지 않는다)
  const p = (host.state as RoomState).players.find((x) => x.bot);
  if (p) p.bot = bot;
  solveWhenReleased(clock, host, 500);
  solveWhenReleased(clock, guest, 300);
  expect(host.startRound()).toBe(true);
  runUntil(clock, () => guest.rounds.length === 1, 120_000, 50);
  const round = guest.rounds[0];
  if (!round) throw new Error("판이 끝나지 않음");
  expect(guest.state?.players.find((x) => x.id === "bot1")?.bot).toBe(bot);
  return { guest, round };
}

describe("계획을 맞춰 보지 못하는 컴퓨터", () => {
  it("모르는 버전·모양 판의 옛 글은 맞춰 보지 못하고, 지금 버전·옛 글(맞추기)은 맞춰 본다", () => {
    expect(botVerifiable("9:pro", false)).toBe(false);
    expect(botVerifiable("9:fit:45000", false)).toBe(false);
    expect(botVerifiable("아무 글", false)).toBe(false);
    expect(botVerifiable(PRO, false)).toBe(true);
    expect(botVerifiable(PRO, true)).toBe(true);
    expect(botVerifiable("beginner", false)).toBe(true);
    // 옛 글은 모양 만들기 계획이 없다: 고친 방장이 모양 판에 옛 글을 붙여 확인을 피하지 못하게 뺀다
    expect(botVerifiable("beginner", true)).toBe(false);
  });

  it("「9:pro」 컴퓨터가 가장 빨리 끝내도 승자가 아니고, 순위 없음으로 뒤에 선다", () => {
    const { guest, round } = playRound("9:pro");
    const bot = round.result.players.bot1;
    expect(bot?.status).toBe("done");
    expect(bot?.reported).toBeLessThan(300);
    expect(bot?.unranked).toBe(true);
    expect(bot?.accepted).toBeUndefined();
    expect(round.unverified).toEqual(["bot1"]);
    expect(guest.unverifiedBots()).toEqual(["bot1"]);
    expect(round.result.ranking).toEqual(["g", "h", "bot1"]);
    const players = ["h", "g", "bot1"];
    const table = standings({ format: "single", target: 3 }, players, [round]);
    expect(table[0]?.id).toBe("g");
    expect(table.find((r) => r.id === "bot1")?.value).toBeNull();
    const firstTo = standings({ format: "firstTo", target: 3 }, players, [
      round,
    ]);
    expect(firstTo.find((r) => r.id === "g")?.wins).toBe(1);
    expect(firstTo.find((r) => r.id === "bot1")?.wins).toBe(0);
  });

  it("같은 버전 컴퓨터는 그대로 순위에 든다(계획과 다른지는 결과 상자가 따로 알린다)", () => {
    const { guest, round } = playRound(PRO);
    expect(round.unverified).toBeUndefined();
    expect(guest.unverifiedBots()).toEqual([]);
    expect(round.result.ranking).toEqual(["bot1", "g", "h"]);
    expect(round.result.players.bot1?.accepted).toBeDefined();
  });

  it("점수제: 모르는 버전 컴퓨터는 순위 점수·이긴 판 점수를 얻지 못한다", () => {
    const points = { format: "points", rounds: 3, scoring: "rank" } as const;
    const { round } = playRound("9:pro", points);
    // 판에 든 사람 셋: 손님 1등 3점, 방장 2등 2점, 컴퓨터 0점
    expect(rankPoints(round.result)).toEqual({ g: 3, h: 2 });
    const rank = pointsMatch({ ...points, target: 3 }, [round]);
    expect(rank.scores.get("bot1")).toBe(0);
    const wins = pointsMatch({ ...points, scoring: "wins", target: 3 }, [
      round,
    ]);
    expect(wins.scores.get("g")).toBe(1);
    expect(wins.scores.get("bot1")).toBe(0);

    const same = playRound(PRO, points).round;
    expect(rankPoints(same.result)).toEqual({ bot1: 3, g: 2, h: 1 });
  });
});

describe("순위에서 빼기(순수 함수)", () => {
  const done = (id: string, t: number, o = {}) => ({
    id,
    status: "done" as const,
    moves: 1,
    reported: t,
    accepted: t,
    ...o,
  });

  it("2명 판의 판정 없음이 뺀 컴퓨터의 다툼 때문이면 남은 사람끼리 판정한다", () => {
    const result: RaceResult = {
      ranking: ["g", "bot1"],
      players: {
        g: done("g", 900),
        bot1: {
          id: "bot1",
          status: "done",
          moves: 1,
          reported: 100,
          disputed: true,
          unranked: true,
        },
      },
      noDecision: true,
    };
    const out = excludeUnverified(result, ["bot1"]);
    expect(out.noDecision).toBeUndefined();
    expect(out.ranking).toEqual(["g", "bot1"]);
    // 사람끼리의 다툼이면 그대로 판정 없음
    const human = excludeUnverified(
      {
        ...result,
        players: {
          ...result.players,
          g: done("g", 900, { disputed: true, unranked: true }),
        },
      },
      ["bot1"],
    );
    expect(human.noDecision).toBe(true);
  });

  it("못 맞춘 사람·기권 앞, 맞춘 사람 뒤에 둔다", () => {
    const result: RaceResult = {
      ranking: ["bot1", "a", "b", "c"],
      players: {
        bot1: done("bot1", 10),
        a: done("a", 500),
        b: { id: "b", status: "dnf", moves: 0 },
        c: { id: "c", status: "forfeit", moves: 0 },
      },
    };
    expect(excludeUnverified(result, ["bot1"]).ranking).toEqual([
      "a",
      "bot1",
      "b",
      "c",
    ]);
    // 체력바(차례는 판정이 이미 정했다): 차례는 그대로, 표시만
    const hp = excludeUnverified(result, ["bot1"], false);
    expect(hp.ranking).toEqual(result.ranking);
    expect(hp.players.bot1?.unranked).toBe(true);
  });
});

// ---- 파티 판정에서 빼기 ----

type MarkSpec = [t: number, ids: string[]];

function log(marks: MarkSpec[], o: Partial<CheckpointLog> = {}): CheckpointLog {
  return {
    status: "playing",
    horizon: Number.POSITIVE_INFINITY,
    last: marks.at(-1)?.[0] ?? 0,
    marks: marks.map(([t, ids], i) => ({
      at: i + 1,
      t,
      ids,
      bounds: {},
      settled: true,
    })),
    ...o,
  };
}

const solved = (t: number) => ({
  status: "done" as const,
  done: { t, bounds: {}, settled: true },
});

const LADDER3 = ["cross", "f2l1", "f2l2", "f2l3", "layer1", "layer2", "oll"];

describe("파티 판정에서 빼기", () => {
  /** 컴퓨터 x가 모든 이정표를 먼저 지나고 맞춘다. a·b는 느리다 */
  const logs = (): PartyInput["logs"] => ({
    a: log([[5_000, ["cross"]]], solved(20_000)),
    b: log([[6_000, ["cross"]]]),
    x: log(
      LADDER3.map((id, i) => [100 * (i + 1), [id]] as MarkSpec),
      solved(900),
    ),
  });

  it("체력바: 뺀 컴퓨터는 남을 깎지 않고 판을 정하지 않으며, 등수·승자에 들지 않는다", () => {
    const base = { n: 3, players: ["a", "b", "x"], disputeMs: 1_000 };
    const trusted = judgeParty({ ...base, logs: logs(), final: true });
    expect(trusted.decided?.winner).toBe("x");

    const r = judgeParty({
      ...base,
      logs: logs(),
      final: true,
      exclude: ["x"],
    });
    expect(r.decided?.winner).toBe("a");
    expect(r.hits.every((h) => h.by !== "x")).toBe(true);
    expect(r.hp.x).toBeUndefined();
    expect(r.places.x).toBeUndefined();
    expect(r.unranked).toEqual(["x"]);
    expect(r.ranking).toEqual(["a", "b", "x"]);
    expect(Object.keys(r.places).sort()).toEqual(["a", "b"]);
  });

  it("아이템전: 1등 견제 대상이 되지 않고, 뺀 컴퓨터가 쓴 방해는 아무도 맞지 않는다", () => {
    const table: Record<string, ItemKind[]> = {
      a: ["fog"],
      x: ["fog"],
    };
    const itemLogs = (): PartyInput["logs"] => ({
      a: log([
        [1_000, ["layer1"]],
        [2_000, ["!u1:fog"]],
        [5_000, []],
      ]),
      b: log([
        [1_500, ["layer1"]],
        [5_000, []],
      ]),
      x: log([
        [100, ["layer1"]],
        [200, ["oll"]],
        [300, ["!u1:fog"]],
        [5_000, []],
      ]),
    });
    const input = {
      n: 2,
      players: ["a", "b", "x"],
      disputeMs: 1_000,
      final: false,
      hp: false,
      items: {
        seed: "s",
        draw: ((_s, p, m) =>
          table[p]?.[m - 1] ?? "shield") satisfies typeof drawItem,
      },
    };
    const trusted = judgeParty({ ...input, logs: itemLogs() });
    expect(trusted.items?.uses.map((u) => [u.p, u.to])).toEqual([
      ["x", "a"],
      ["a", "x"],
    ]);

    const r = judgeParty({ ...input, logs: itemLogs(), exclude: ["x"] });
    // a의 안개는 x가 아니라 그다음 앞선 b에게, x의 안개는 판정에 없다
    expect(r.items?.uses.map((u) => [u.p, u.to])).toEqual([["a", "b"]]);
    expect(r.items?.slot.x).toBeUndefined();
  });
});
