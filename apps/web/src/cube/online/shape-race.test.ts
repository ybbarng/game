import { levelText } from "@game/cube-ai";
import { type CubeMove, parseMoves, solvedCube } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import type { Transport } from "@/net/transport";
import { patternById } from "../patterns/data";
import {
  type ShapeRule,
  shapeFor,
  shapeGoal,
  shapePicks,
  shapeProgress,
  shapeRuleOk,
  shapesFor,
} from "../patterns/race";
import { checkBotRun } from "./bot-racer";
import { createCubeRaceGame, type Scrambler } from "./race-game";
import {
  CubeRoom,
  type RoomSettings,
  raceOptionsFor,
  shapeOfRound,
} from "./room";

/** 모양 만들기(docs/47 9-10): 목표 고르기·판정·지문·컴퓨터 계획 확인 */

const fake: Scrambler = (event, seed) => ({
  event,
  text: ["R U", "F R'", "U2 R F'"][seed % 3] as string,
  official: false,
});

const EASY2: ShapeRule = { start: "solved", pick: "easy", key: "k1" };

describe("목표 모양 고르기", () => {
  it("크기마다 고를 수 있는 어려움만, 모양이 있는 크기만", () => {
    expect(shapePicks(2)).toEqual(["easy", "hard", "mix"]);
    expect(shapePicks(3)).toEqual(["easy", "normal", "hard", "mix"]);
    expect(shapePicks(4)).toEqual(["easy", "hard", "mix"]);
    expect(shapePicks(5)).toEqual(["easy", "normal", "hard", "mix"]);
    expect(shapeRuleOk({ ...EASY2, pick: "normal" }, 2)).toBe(false);
    expect(shapeRuleOk({ ...EASY2, start: "half" }, 2)).toBe(false);
    expect(shapeRuleOk({ ...EASY2, key: "" }, 2)).toBe(false);
    expect(shapeRuleOk(EASY2, 2)).toBe(true);
  });

  it("같은 열쇠·판 번호면 같은 모양, 모양이 다 돌기 전에는 겹치지 않는다", () => {
    const rule: ShapeRule = { start: "solved", pick: "mix", key: "abc" };
    const all = shapesFor(3).length;
    const ids = Array.from(
      { length: all },
      (_, k) => shapeFor(rule, 3, k + 1).id,
    );
    expect(new Set(ids).size).toBe(all);
    expect(shapeFor(rule, 3, all + 1).id).toBe(ids[0]);
    expect(shapeFor({ ...rule }, 3, 2).id).toBe(ids[1]);
  });

  it("진행: 맞춘 큐브 0, 목표 1, 섞인 큐브에서 시작하면 앞 절반이 맞추기", () => {
    const goal = shapeGoal("3-checkerboard");
    const solved = solvedCube(3);
    expect(shapeProgress(goal, solved, "solved")).toBe(0);
    expect(shapeProgress(goal, solved, "scrambled")).toBe(0.5);
    expect(shapeProgress(goal, goal.target, "solved")).toBe(1);
  });
});

describe("판정 설정 지문", () => {
  const base: RoomSettings = {
    n: 2,
    format: "single",
    target: 3,
    inspection: false,
    timeLimitSec: 60,
  };
  it("모양 만들기가 아니면 예전 지문 그대로, 모양이면 목표·시작을 넣고 「수가 적음」을 보지 않는다", () => {
    expect(raceOptionsFor(base)).not.toHaveProperty("gameOptions");
    const shape = shapeOfRound({ ...base, shape: EASY2 }, 1);
    expect(shape).toBeDefined();
    const o = raceOptionsFor({ ...base, shape: EASY2 }, undefined, shape);
    expect(o.gameOptions).toEqual({
      shape: { id: shape?.id, start: "solved" },
    });
    const three = raceOptionsFor(
      { ...base, n: 3 },
      undefined,
      shapeOfRound({ ...base, n: 3, shape: { ...EASY2 } }, 1),
    );
    expect(three.suspicion?.minMoves).toBeUndefined();
    expect(raceOptionsFor({ ...base, n: 3 }).suspicion?.minMoves).toBe(30);
  });

  it("「공식 보기」는 끈 판만 지문에 들어간다(허용이 기본이라 옛 방과 같은 지문)", () => {
    expect(shapeRuleOk({ ...EASY2, formula: true }, 2)).toBe(true);
    expect(shapeRuleOk({ ...EASY2, formula: false }, 2)).toBe(true);
    expect(shapeRuleOk({ ...EASY2, formula: "off" }, 2)).toBe(false);
    const on = shapeOfRound({ ...base, shape: { ...EASY2, formula: true } }, 1);
    expect(on).toEqual(shapeOfRound({ ...base, shape: EASY2 }, 1));
    expect(on).not.toHaveProperty("formula");
    const offRule = { ...base, shape: { ...EASY2, formula: false } };
    const off = shapeOfRound(offRule, 1);
    expect(off).toEqual({ ...on, formula: false });
    expect(raceOptionsFor(offRule, undefined, off).gameOptions).toEqual({
      shape: { id: on?.id, start: "solved", formula: false },
    });
  });

  it("맞춘 큐브에서 시작하면 섞지 않고, 지문에 목표가 들어간다", () => {
    const a = createCubeRaceGame(2, fake, undefined, {}, false, {
      id: "2-halves",
      start: "solved",
    });
    const b = createCubeRaceGame(2, fake, undefined, {}, false, {
      id: "2-side-stripes",
      start: "solved",
    });
    expect(a.prepare?.("s", undefined)).toBeUndefined();
    expect(a.scrambleFor("s")).toBeUndefined();
    expect(a.startFingerprint?.("s", undefined)).not.toBe(
      b.startFingerprint?.("s", undefined),
    );
    // 목표와 같으면 끝(통째로 돌려도)
    const goal = shapeGoal("2-halves");
    expect(a.isSolved(goal.target)).toBe(true);
    expect(a.isSolved(a.startState("s", undefined))).toBe(false);
  });
});

// ---- 방(두 기기, 컴퓨터) ----

function tampered(base: Transport, patch: Partial<RoomSettings>): Transport {
  return {
    selfId: base.selfId,
    send: (m, to) => base.send(m, to),
    onMessage: (h) =>
      base.onMessage((m, from) => {
        const msg = m as { type?: string; state?: { settings: RoomSettings } };
        if (msg.type === "cube-room" && msg.state)
          h(
            {
              ...msg,
              state: {
                ...msg.state,
                settings: { ...msg.state.settings, ...patch },
              },
            },
            from,
          );
        else h(m, from);
      }),
    onPeerJoin: (h) => base.onPeerJoin(h),
    onPeerLeave: (h) => base.onPeerLeave(h),
    leave: () => base.leave(),
  };
}

/** EASY2와 첫 판 모양이 다른 열쇠 */
const OTHER_KEY = ["o1", "o2", "o3", "o4", "o5", "o6"].find(
  (key) => shapeFor({ ...EASY2, key }, 2, 1).id !== shapeFor(EASY2, 2, 1).id,
) as string;

function setup(guestPatch?: Partial<RoomSettings>) {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    isHost: true,
    name: "방장",
    scrambler: fake,
    settings: { n: 2, inspection: false, timeLimitSec: 60, shape: EASY2 },
  });
  const joined = net.join("g");
  const guest = new CubeRoom({
    transport: guestPatch ? tampered(joined, guestPatch) : joined,
    clock,
    isHost: false,
    hostId: "h",
    name: "손님",
    scrambler: fake,
  });
  clock.advance(100);
  return { clock, host, guest };
}

/** 풀린 뒤 `delay` ms에 목표 모양의 공식을 둔다 */
function makeShape(clock: ManualClock, room: CubeRoom, delay: number) {
  let done = "";
  room.onChange(() => {
    const s = room.session();
    const race = room.state?.race?.id ?? "";
    if (s?.snapshot().phase !== "race" || done === race) return;
    done = race;
    const id = room.game()?.shape?.id as string;
    const alg = patternById(id)?.alg as string;
    clock.after(delay, () => {
      for (const m of parseMoves(2, alg)) s.play(m as CubeMove);
    });
  });
}

describe("모양 만들기 판(두 기기)", () => {
  it("먼저 목표 모양을 만든 사람이 이기고, 두 기기가 같은 목표·같은 결과를 낸다", () => {
    const { clock, host, guest } = setup();
    expect(guest.state?.settings.shape).toEqual(EASY2);
    makeShape(clock, host, 3_000);
    makeShape(clock, guest, 1_000);
    host.startRound();
    runUntil(
      clock,
      () => host.rounds.length === 1 && guest.rounds.length === 1,
      60_000,
      50,
    );
    const h = host.rounds[0];
    expect(h?.shape).toEqual(shapeOfRound(host.state?.settings as never, 1));
    expect(guest.rounds[0]?.shape).toEqual(h?.shape);
    expect(guest.rounds[0]?.result).toEqual(h?.result);
    expect(h?.result.ranking).toEqual(["g", "h"]);
    expect(h?.result.players.g?.status).toBe("done");
  });

  it("방장이 한 손님에게만 다른 모양 열쇠를 알리면 판이 열리지 않는다", () => {
    const { clock, host, guest } = setup({
      shape: { ...EASY2, key: OTHER_KEY },
    });
    // 열쇠가 달라도 우연히 같은 모양이면 시험이 뜻이 없다
    expect(shapeOfRound(guest.state?.settings as RoomSettings, 1)?.id).not.toBe(
      shapeOfRound(host.state?.settings as RoomSettings, 1)?.id,
    );
    makeShape(clock, guest, 1_000);
    host.startRound();
    runUntil(
      clock,
      () => host.rounds.length === 1 && guest.rounds.length === 1,
      60_000,
      50,
    );
    const r = host.rounds[0]?.result;
    expect(r?.ranking.every((id) => r.players[id]?.status !== "done")).toBe(
      true,
    );
  });

  it("방장이 한 손님에게만 「공식 보기」를 다르게 알리면 판이 열리지 않는다, 같은 규칙이면 공식 보기를 꺼도 그대로 겨룬다", () => {
    const bad = setup({ shape: { ...EASY2, formula: false } });
    expect(bad.guest.state?.settings.shape?.formula).toBe(false);
    makeShape(bad.clock, bad.guest, 1_000);
    bad.host.startRound();
    runUntil(
      bad.clock,
      () => bad.host.rounds.length === 1 && bad.guest.rounds.length === 1,
      60_000,
      50,
    );
    const r = bad.host.rounds[0]?.result;
    expect(r?.ranking.every((id) => r.players[id]?.status !== "done")).toBe(
      true,
    );

    const { clock, host, guest } = setup();
    host.setShape({ ...EASY2, formula: false });
    clock.advance(100);
    expect(guest.state?.settings.shape?.formula).toBe(false);
    // 다시 허용하면 칸을 지운다(옛 방과 같은 방 상태)
    host.setShape({ ...EASY2, formula: true });
    expect(host.state?.settings.shape).not.toHaveProperty("formula");
    host.setShape({ ...EASY2, formula: false });
    clock.advance(100);
    makeShape(clock, host, 3_000);
    makeShape(clock, guest, 1_000);
    host.startRound();
    runUntil(
      clock,
      () => host.rounds.length === 1 && guest.rounds.length === 1,
      60_000,
      50,
    );
    expect(host.rounds[0]?.shape?.formula).toBe(false);
    expect(guest.rounds[0]?.result).toEqual(host.rounds[0]?.result);
    expect(host.rounds[0]?.result.ranking).toEqual(["g", "h"]);
  });

  it("모양 만들기를 켜면 파티 모드가 꺼지고, 파티 모드를 켜면 모양 만들기가 꺼진다", () => {
    const { host } = setup();
    host.setParty("hp");
    expect(host.state?.settings.shape).toBeUndefined();
    host.setShape({ start: "scrambled", pick: "hard" });
    expect(host.state?.settings.party).toBeUndefined();
    expect(host.state?.settings.shape).toMatchObject({
      start: "scrambled",
      pick: "hard",
    });
    // 크기를 바꿔 그 어려움이 없으면 고를 수 있는 첫 어려움으로
    host.setShape({ start: "solved", pick: "normal" }, true);
    expect(host.state?.settings.shape?.pick).toBe("hard");
    host.setSettings({ n: 3 });
    host.setShape({ start: "solved", pick: "normal" });
    host.setSettings({ n: 2 });
    expect(host.state?.settings.shape?.pick).toBe("easy");
  });
});

describe("모양 만들기 컴퓨터", () => {
  it.each(["solved", "scrambled"] as const)(
    "%s: 컴퓨터가 목표 모양을 만들고, 다른 기기가 계획을 다시 계산해 확인한다",
    async (start) => {
      const clock = new ManualClock();
      const room = new CubeRoom({
        clock,
        isHost: true,
        name: "나",
        scrambler: fake,
        settings: {
          n: 2,
          inspection: false,
          timeLimitSec: 30,
          shape: { start, pick: "easy", key: "bot" },
        },
      });
      room.addBot(levelText("pro"));
      room.startRound();
      runUntil(clock, () => room.rounds.length === 1, 60_000, 100);
      const r = room.rounds[0];
      expect(r?.result.players.bot1?.status).toBe("done");
      const shape = r?.shape?.id as string;
      const ok = await checkBotRun(
        levelText("pro"),
        2,
        r?.start as never,
        r?.seed as string,
        "bot1",
        r?.logs.bot1 ?? [],
        undefined,
        false,
        shape,
      );
      expect(ok).toBe(true);
      // 다른 목표로 다시 계산하면 계획과 다르다
      const other = shapesFor(2).find((p) => p.id !== shape)?.id;
      expect(
        await checkBotRun(
          levelText("pro"),
          2,
          r?.start as never,
          r?.seed as string,
          "bot1",
          r?.logs.bot1 ?? [],
          undefined,
          false,
          other,
        ),
      ).toBe(false);
    },
  );
});
