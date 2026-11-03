import type { BotPlan } from "@game/cube-ai";
import {
  type CubeMove,
  invertMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { ScrambleEvent } from "@game/cube-scramble";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import { RaceSession } from "@/net/race/race-session";
import type { RaceResult } from "@/net/race/types";
import { planInWorker } from "../worker";
import {
  attachBot,
  BOT_NO_PLAN,
  botSeed,
  checkBotRun,
  planHere,
} from "./bot-racer";
import { RaceHub } from "./hub";
import {
  createCubeRaceGame,
  type Scrambler,
  scrambleSeed,
  stateHash,
  turnCount,
} from "./race-game";

/**
 * 큐브 어댑터로 여러 기기 경주(ManualClock·DelayNet, 결정적). 섞기는 표를 만드는 해법기 대신 짧은 가짜 섞기를 넣는다.
 */

const SHORT = ["R U", "F R'", "U2 R F'"];
const fake: Scrambler = (event: ScrambleEvent, seed: number) => ({
  event,
  text: SHORT[seed % SHORT.length] as string,
  official: false,
});
/** 같은 씨앗에서 다른 섞기를 내는 기기(해법기 판이 다름) */
const skewed: Scrambler = (event, seed) => ({
  event,
  text: `${SHORT[seed % SHORT.length]} D`,
  official: false,
});

type Session = RaceSession<CubeMove, PuzzleState>;

interface Rig {
  clock: ManualClock;
  sessions: Map<string, Session>;
}

const OPTIONS = { inspectionMs: 1_000, timeLimitMs: 120_000, capMs: 200 };

/**
 * 기기마다 RaceHub 하나. `devices`: 기기 아이디 → 그 기기가 맡은 참가자(맨 앞이 그 기기 사람).
 * 모든 참가자가 같은 판(r1)에 든다
 */
function rig(
  n: number,
  devices: Record<string, string[]>,
  scramblerFor: (device: string) => Scrambler = () => fake,
  options: typeof OPTIONS = OPTIONS,
): Rig {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const owner = (p: string) =>
    Object.keys(devices).find((d) => devices[d]?.includes(p));
  const everyone = Object.values(devices).flat();
  const sessions = new Map<string, Session>();
  for (const [device, people] of Object.entries(devices)) {
    const hub = new RaceHub({
      transport: net.join(device),
      clock,
      owner,
      participantsOf: (d) => devices[d] ?? [],
    });
    const game = createCubeRaceGame(n, scramblerFor(device));
    for (const id of people) {
      let k = 0;
      sessions.set(
        id,
        new RaceSession({
          game,
          transport: hub.local(id),
          clock,
          race: "r1",
          players: everyone,
          options,
          random: () => `${id}-${k++}`,
        }),
      );
    }
  }
  for (const s of sessions.values()) s.start();
  clock.advance(0);
  return { clock, sessions };
}

/** 풀린 뒤 `startMs`에 첫 수, `everyMs`마다 섞기의 거꾸로를 둔다 */
function solveByInverse(
  clock: ManualClock,
  n: number,
  session: Session,
  event: ScrambleEvent,
  startMs: number,
  everyMs: number,
): void {
  let started = -1;
  session.onChange((snap) => {
    if (snap.phase !== "race" || snap.attempt === started) return;
    started = snap.attempt;
    const { text } = fake(event, scrambleSeed(snap.seed as string)) as {
      text: string;
    };
    const moves = invertMoves(parseMoves(n, text));
    const step = (j: number) => {
      const r = session.play(moves[j] as CubeMove);
      if (!r.ok) throw new Error(`수가 거절됨: ${r.reason}`);
      if (j + 1 < moves.length) clock.after(everyMs, () => step(j + 1));
    };
    clock.after(startMs, () => step(0));
  });
}

const allDone = (sessions: Session[]) => () =>
  sessions.every((s) => s.snapshot().result !== undefined);

describe("큐브 경주(어댑터)", () => {
  it("2명: 같은 섞기를 받고 거꾸로 두어 맞추면 모든 기기가 같은 순위", () => {
    const { clock, sessions } = rig(3, { a: ["a"], b: ["b"] });
    const a = sessions.get("a") as Session;
    const b = sessions.get("b") as Session;
    runUntil(clock, () => a.snapshot().phase === "inspect");
    expect(a.startState()).toEqual(b.startState());
    expect(isSolved(3, a.startState() as PuzzleState)).toBe(false);
    solveByInverse(clock, 3, a, "333", 400, 200);
    solveByInverse(clock, 3, b, "333", 300, 300);
    runUntil(clock, allDone([a, b]));
    const r = a.snapshot().result as RaceResult;
    expect(b.snapshot().result).toEqual(r);
    expect(r.players.a?.status).toBe("done");
    expect(r.players.b?.status).toBe("done");
    expect(r.ranking).toHaveLength(2);
    // 수 기록은 표기 글로 남고, 큐브 돌리기를 뺀 수를 셀 수 있다
    expect(turnCount(3, a.moveLog("b"))).toBe(r.players.b?.moves);
  });

  it("3명(2×2): 모두 끝까지 맞추고 빠른 순으로 순위", () => {
    const { clock, sessions } = rig(2, { a: ["a"], b: ["b"], c: ["c"] });
    const [a, b, c] = ["a", "b", "c"].map((id) => sessions.get(id) as Session);
    solveByInverse(clock, 2, a as Session, "222", 900, 100);
    solveByInverse(clock, 2, b as Session, "222", 300, 100);
    solveByInverse(clock, 2, c as Session, "222", 600, 100);
    const all = [a, b, c] as Session[];
    runUntil(clock, allDone(all));
    const r = (a as Session).snapshot().result as RaceResult;
    for (const s of all) expect(s.snapshot().result).toEqual(r);
    expect(r.ranking).toEqual(["b", "c", "a"]);
  });

  it("시작 상태 지문은 섞기 글과 시작 상태 해시를 함께 싣는다(같은 글에서 다른 상태가 나오면 다르다)", () => {
    const game = createCubeRaceGame(3, fake);
    void game.prepare?.("s1", undefined);
    const fp = game.startFingerprint?.("s1", undefined) as string;
    const start = game.startState("s1", undefined) as PuzzleState;
    expect(fp).toBe(`333|${game.scrambleFor("s1")?.text}|${stateHash(start)}`);
    expect(stateHash(solvedCube(3))).not.toBe(stateHash(start));
  });

  it("한 기기만 섞기를 다르게 만들면 섞기 어긋남으로 판이 열리지 않는다", () => {
    const { clock, sessions } = rig(3, { a: ["a"], b: ["b"] }, (d) =>
      d === "b" ? skewed : fake,
    );
    const all = [...sessions.values()];
    runUntil(clock, allDone(all));
    const r = sessions.get("a")?.snapshot().result as RaceResult;
    expect(r.cancelled).toBeDefined();
    expect(r.players.b).toMatchObject({
      status: "forfeit",
      reason: "섞기 어긋남",
    });
  });

  it("방장 기기의 컴퓨터는 한 참가자처럼 끝까지 맞추고 순위에 든다. 다른 기기가 계획을 다시 계산해 확인한다", async () => {
    const { clock, sessions } = rig(2, { h: ["h", "bot1"], g: ["g"] });
    const bot = sessions.get("bot1") as Session;
    const h = sessions.get("h") as Session;
    const g = sessions.get("g") as Session;
    attachBot({ session: bot, id: "bot1", level: "beginner", n: 2, clock });
    // 사람 둘은 아무것도 하지 않는다: 시간 안에 못 맞춘다
    runUntil(
      clock,
      () =>
        bot
          .snapshot()
          .peers.every((p) => p.id !== "bot1" || p.status === "done"),
      600_000,
      50,
    );
    runUntil(clock, allDone([h, g, bot]), 600_000, 100);
    const r = g.snapshot().result as RaceResult;
    expect(h.snapshot().result).toEqual(r);
    expect(r.ranking[0]).toBe("bot1");
    expect(r.players.bot1?.status).toBe("done");
    expect(r.players.h?.status).toBe("dnf");
    const seed = g.snapshot().seed as string;
    await expect(
      checkBotRun(
        "beginner",
        2,
        g.startState() as PuzzleState,
        seed,
        "bot1",
        g.moveLog("bot1"),
      ),
    ).resolves.toBe(true);
    // 워커 모듈(node에서는 같은 스레드로 대신)로 만든 계획도 같다
    await expect(
      checkBotRun(
        "beginner",
        2,
        g.startState() as PuzzleState,
        seed,
        "bot1",
        g.moveLog("bot1"),
        planInWorker,
      ),
    ).resolves.toBe(true);
    // 시각도 본다: 모든 수를 같은 만큼 늦게 적은 것(계획이 늦게 옴)은 맞고,
    // 계획보다 빨리 둔 것처럼 시각을 줄이거나 계획보다 이르게 적으면 다르다
    const check = (log: readonly { m: string; t: number }[]) =>
      checkBotRun(
        "beginner",
        2,
        g.startState() as PuzzleState,
        seed,
        "bot1",
        log,
      );
    const real = g.moveLog("bot1");
    await expect(
      check(real.map((x) => ({ ...x, t: x.t + 1234.5 }))),
    ).resolves.toBe(true);
    await expect(check(real.map((x) => ({ ...x, t: x.t / 2 })))).resolves.toBe(
      false,
    );
    await expect(
      check(real.map((x) => ({ ...x, t: x.t - 300 }))),
    ).resolves.toBe(false);
    await expect(
      check(
        real.map((x, i) => (i === real.length - 1 ? { ...x, t: x.t - 50 } : x)),
      ),
    ).resolves.toBe(false);
    // 다른 단계로 다시 계산하면 맞지 않는다
    await expect(
      checkBotRun(
        "expert",
        2,
        g.startState() as PuzzleState,
        seed,
        "bot1",
        g.moveLog("bot1"),
      ),
    ).resolves.toBe(false);
  });

  it("계획이 풀린 뒤에 늦게 오면 늦은 만큼 미뤄 두고(몰아 두지 않음) 끝까지 맞춘다", async () => {
    const { clock, sessions } = rig(2, { h: ["h", "bot1"], g: ["g"] });
    const bot = sessions.get("bot1") as Session;
    const g = sessions.get("g") as Session;
    let release: (() => void) | undefined;
    attachBot({
      session: bot,
      id: "bot1",
      level: "beginner",
      n: 2,
      clock,
      plan: (level, n, start, seed) =>
        new Promise((resolve) => {
          release = () => resolve(planHere(level, n, start, seed));
        }),
    });
    runUntil(clock, () => bot.snapshot().phase === "race");
    clock.advance(3_000);
    expect(bot.snapshot().peers.find((p) => p.id === "bot1")?.moves).toBe(0);
    const late = bot.snapshot().elapsed as number;
    release?.();
    await Promise.resolve();
    await Promise.resolve();
    runUntil(clock, () => g.snapshot().result !== undefined, 600_000, 100);
    const log = g.moveLog("bot1");
    const plan = planHere(
      "beginner",
      2,
      g.startState() as PuzzleState,
      botSeed(g.snapshot().seed as string, "bot1"),
    ) as BotPlan;
    expect(log).toHaveLength(plan.moves.length);
    // 첫 수는 계획 시각 + 늦은 만큼
    expect(log[0]?.t).toBe((plan.moves[0]?.at as number) + late);
    expect(g.snapshot().result?.players.bot1?.status).toBe("done");
    // 모든 수를 같은 만큼 미뤘으므로 다른 기기의 계획 확인(시각 포함)을 통과한다
    await expect(
      checkBotRun(
        "beginner",
        2,
        g.startState() as PuzzleState,
        g.snapshot().seed as string,
        "bot1",
        log,
      ),
    ).resolves.toBe(true);
  });

  it("계획을 끝내 못 만든 컴퓨터는 그 판에서만 빠지고(DNF) 까닭이 결과에 남는다. 살펴보던 섞기는 그대로다", async () => {
    const { clock, sessions } = rig(2, { h: ["h", "bot1"], g: ["g"] });
    const bot = sessions.get("bot1") as Session;
    const h = sessions.get("h") as Session;
    const g = sessions.get("g") as Session;
    let asked = 0;
    attachBot({
      session: bot,
      id: "bot1",
      level: "beginner",
      n: 2,
      clock,
      plan: () => {
        asked++;
        return Promise.reject(new Error("축소법이 막혔다"));
      },
    });
    runUntil(clock, () => g.snapshot().seed !== undefined);
    const seed = g.snapshot().seed;
    await Promise.resolve();
    await Promise.resolve();
    // 살펴보기 중에 빠졌다: 다른 기기도 살펴보기 안에 알고, 새 섞기를 받지 않는다
    runUntil(
      clock,
      () => g.snapshot().peers.find((p) => p.id === "bot1")?.status === "dnf",
    );
    expect(g.snapshot().phase).toBe("inspect");
    runUntil(clock, allDone([h, g, bot]), 600_000, 100);
    const r = g.snapshot().result as RaceResult;
    expect(h.snapshot().result).toEqual(r);
    expect(bot.snapshot().result).toEqual(r);
    expect(r.players.bot1).toMatchObject({
      status: "dnf",
      reason: BOT_NO_PLAN,
    });
    expect(r.players.h?.status).toBe("dnf");
    expect(g.snapshot().attempt).toBe(0);
    expect(g.snapshot().seed).toBe(seed);
    expect(asked).toBe(1);
  });

  it("살펴보기를 끈 방에서 계획이 경주 중에 늦게 와 실패해도 판은 계속되고 사람 결과는 그대로다", async () => {
    const { clock, sessions } = rig(
      2,
      { h: ["h", "bot1"], g: ["g"] },
      undefined,
      {
        ...OPTIONS,
        inspectionMs: 0,
      },
    );
    const bot = sessions.get("bot1") as Session;
    const h = sessions.get("h") as Session;
    const g = sessions.get("g") as Session;
    let reject: (() => void) | undefined;
    attachBot({
      session: bot,
      id: "bot1",
      level: "beginner",
      n: 2,
      clock,
      plan: () =>
        new Promise((_, no) => {
          reject = () => no(new Error("축소법이 막혔다"));
        }),
    });
    // 사람 둘은 풀린 뒤 400ms에 시작해 200ms마다 둔다
    solveByInverse(clock, 2, h, "222", 400, 200);
    solveByInverse(clock, 2, g, "222", 400, 200);
    runUntil(clock, () => g.snapshot().phase === "race");
    const seed = g.snapshot().seed;
    // 사람이 돌리는 도중에 계획이 실패한다
    runUntil(clock, () => (g.snapshot().elapsed ?? 0) >= 500);
    expect(g.snapshot().peers.find((p) => p.id === "g")?.moves).toBe(1);
    reject?.();
    await Promise.resolve();
    await Promise.resolve();
    runUntil(clock, allDone([h, g, bot]), 600_000, 10);
    const r = g.snapshot().result as RaceResult;
    expect(h.snapshot().result).toEqual(r);
    expect(bot.snapshot().result).toEqual(r);
    expect(r.players.bot1).toMatchObject({
      status: "dnf",
      reason: BOT_NO_PLAN,
    });
    // 같은 섞기를 끝까지 맞췄다(다시 섞지 않음)
    expect(g.snapshot().attempt).toBe(0);
    expect(g.snapshot().seed).toBe(seed);
    const { text } = fake("222", scrambleSeed(seed as string)) as {
      text: string;
    };
    const moves = parseMoves(2, text).length;
    for (const id of ["h", "g"]) {
      expect(r.players[id]?.status).toBe("done");
      expect(r.players[id]?.moves).toBe(moves);
      expect(r.players[id]?.reported).toBe(400 + 200 * (moves - 1));
    }
  });

  it("남이 컴퓨터 이름으로 보낸 수는 받지 않는다", () => {
    const { clock, sessions } = rig(2, { h: ["h", "bot1"], g: ["g"] });
    const g = sessions.get("g") as Session;
    runUntil(clock, () => g.snapshot().phase === "race", 10_000);
    // g 기기 안에서 bot1을 사칭할 창구는 없다: 허브는 봉투의 보낸 이가 그 기기가 맡은 참가자일 때만 받는다
    const peer = g.snapshot().peers.find((p) => p.id === "bot1");
    expect(peer?.moves).toBe(0);
  });
});
