import { levelText } from "@game/cube-ai";
import { type CubeMove, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import type { Transport } from "@/net/transport";
import { type Keymap, notationKeymap, twoHandKeymap } from "../input/keymaps";
import { pickAlg } from "../practice/pick-alg";
import { PRACTICE_N } from "../practice/problem";
import type { DrillCase } from "../practice/types";
import {
  trackOf,
  type VersusRule,
  versusBoard,
  versusCase,
  versusOver,
  versusSummary,
} from "../practice/versus";
import { practiceBotRunOk } from "./practice-bot";
import { createPracticeRaceGame, practiceSeed } from "./practice-race";
import type { Scrambler } from "./race-game";
import {
  CubeRoom,
  PRACTICE_READY_MS,
  PRACTICE_TIME_LIMIT_SEC,
  type RoomSettings,
  raceOptionsFor,
  TIME_LIMIT_SEC,
} from "./room";

/** 공식 연습 대결(docs/47 16-14): 같은 문제·기록으로 다시 계산·위조 기록 무효·컴퓨터 */

const fake: Scrambler = (event, seed) => ({
  event,
  text: ["R U", "F R'"][seed % 2] as string,
  official: false,
});

const SECOND: VersusRule = { stage: "beginner-second" };
const mv = (t: string): CubeMove => parseMoves(PRACTICE_N, t)[0] as CubeMove;

describe("대결 게임(어댑터)", () => {
  it("같은 씨앗이면 기기마다 같은 문제·같은 시작, 지문도 같다", () => {
    const a = createPracticeRaceGame(SECOND);
    const b = createPracticeRaceGame(SECOND);
    const sa = a.startState("seed-1", undefined);
    const sb = b.startState("seed-1", undefined);
    expect(trackOf(sb).problems).toEqual(trackOf(sa).problems);
    expect(a.startFingerprint?.("seed-1", undefined)).toBe(
      b.startFingerprint?.("seed-1", undefined),
    );
    expect(a.startFingerprint?.("seed-2", undefined)).not.toBe(
      a.startFingerprint?.("seed-1", undefined),
    );
    // 단계가 다르면 지문이 다르다
    expect(
      createPracticeRaceGame({ stage: "beginner-cross" }).startFingerprint?.(
        "seed-1",
        undefined,
      ),
    ).not.toBe(a.startFingerprint?.("seed-1", undefined));
    expect(practiceSeed("seed-1")).toBe(practiceSeed("seed-1"));
  });

  it("공식 보기는 보고 치기만 받는다", () => {
    const follow = createPracticeRaceGame(SECOND);
    expect(() => follow.decodeMove("?peek")).toThrow();
    const see = createPracticeRaceGame({ ...SECOND, mode: "see" });
    const s = see.apply(
      see.startState("x", undefined),
      see.decodeMove("?peek"),
    );
    expect(trackOf(s).peeked).toBe(true);
    expect(see.isTurn?.("?peek")).toBe(false);
  });

  it("공식 알리기는 따라 치기만 받고 수로 세지 않는다. 지문은 상황·윗면 돌리기·시작 모양뿐이다", () => {
    const follow = createPracticeRaceGame({ stage: "pll" });
    const act = follow.decodeMove("?alg R U R'");
    expect(act).toEqual({ alg: "R U R'" });
    expect(follow.encodeMove(act)).toBe("?alg R U R'");
    expect(follow.isTurn?.("?alg R U R'")).toBe(false);
    expect(() => follow.decodeMove(`?alg ${"R ".repeat(150)}`)).toThrow();
    const see = createPracticeRaceGame({ stage: "pll", mode: "see" });
    expect(() => see.decodeMove("?alg R U R'")).toThrow();
    const fp = follow.startFingerprint?.("seed-1", undefined) ?? "";
    const t = trackOf(follow.startState("seed-1", undefined));
    expect(fp).toContain(`${t.problems[0]?.caseId}@${t.problems[0]?.turn}`);
    expect(fp).not.toMatch(/[RUFLDB]'? [RUFLDB]/);
  });

  it("판정 설정 지문: 공식 연습이면 단계를 넣고 준비 3초, 아니면 예전 그대로", () => {
    const base: RoomSettings = {
      n: 3,
      format: "single",
      target: 3,
      inspection: true,
      timeLimitSec: 300,
    };
    expect(raceOptionsFor(base)).not.toHaveProperty("gameOptions");
    const o = raceOptionsFor({ ...base, practice: SECOND });
    expect(o.gameOptions).toEqual({ practice: { stage: "beginner-second" } });
    expect(o.inspectionMs).toBe(PRACTICE_READY_MS);
    expect(o.suspicion?.minMoves).toBeUndefined();
    expect(
      raceOptionsFor({ ...base, practice: { ...SECOND, mode: "see" } })
        .gameOptions,
    ).toEqual({ practice: { stage: "beginner-second", mode: "see" } });
  });
});

// ---- 방(두 기기) ----

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

function setup(guestPatch?: Partial<RoomSettings>, rule: VersusRule = SECOND) {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    isHost: true,
    name: "방장",
    scrambler: fake,
    settings: { n: 3, timeLimitSec: 120, practice: rule },
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
  return { clock, net, host, guest };
}

/**
 * 풀린 뒤 문제마다 `gap` ms 간격으로 공식을 친다. `misses`번째 문제(0부터)에서는 먼저 틀린 수 하나를 친다.
 * 공식은 이 기기 상태에서 읽는다(남이 알린 것이 아니다)
 */
function typer(
  clock: ManualClock,
  room: CubeRoom,
  gap: number,
  misses: readonly number[] = [],
  /** 있으면 화면처럼 문제마다 첫 수 앞에 이 키 배치의 공식을 알리고 그 공식을 친다 */
  keymap?: Keymap,
) {
  let started = "";
  room.onChange(() => {
    const s = room.session();
    const race = room.state?.race?.id ?? "";
    if (s?.snapshot().phase !== "race" || started === race) return;
    started = race;
    const missed = new Set<number>();
    const tick = () => {
      let state = s.stateOf(room.me) as PuzzleState | undefined;
      if (!state) return;
      let t = trackOf(state);
      if (versusOver(t)) return;
      if (keymap && t.alg === null && t.fed.length === 0) {
        const c = versusCase(t) as DrillCase;
        expect(s.play({ alg: pickAlg(c, keymap).alg }).ok).toBe(true);
        state = s.stateOf(room.me) as PuzzleState;
        t = trackOf(state);
      }
      const board = versusBoard(t);
      if (!board) return;
      if (misses.includes(t.index) && !missed.has(t.index)) {
        missed.add(t.index);
        const first = board.tokens[0] as string;
        s.play(mv(first.startsWith("B") ? "D" : "B"));
      } else {
        const at = t.fed.length - t.problemMisses;
        s.play(mv(board.tokens[at] as string));
      }
      clock.after(gap, tick);
    };
    clock.after(gap, tick);
  });
}

describe("공식 연습 대결(두 기기)", () => {
  it("모두 같은 문제를 받고, 먼저 다 친 사람이 이기며, 두 기기가 기록으로 같은 진행·결과를 낸다", () => {
    const { clock, host, guest } = setup();
    expect(guest.state?.settings.practice).toEqual(SECOND);
    typer(clock, host, 300, [2]);
    typer(clock, guest, 200, [0, 5]);
    host.startRound();
    runUntil(
      clock,
      () => host.rounds.length === 1 && guest.rounds.length === 1,
      200_000,
      50,
    );
    const h = host.rounds[0];
    const g = guest.rounds[0];
    expect(h?.practice).toEqual(SECOND);
    expect(g?.result).toEqual(h?.result);
    expect(h?.result.ranking).toEqual(["g", "h"]);
    expect(h?.result.players.g?.status).toBe("done");
    // 같은 문제
    const hs = host.anySession()?.startState() as PuzzleState;
    const gs = guest.anySession()?.startState() as PuzzleState;
    expect(trackOf(gs).problems).toEqual(trackOf(hs).problems);
    // 진행·정확도·콤보는 각 기기가 받은 수 기록으로 계산한다: 두 기기가 같은 값
    for (const id of ["h", "g"]) {
      const a = trackOf(host.anySession()?.stateOf(id) as PuzzleState);
      const b = trackOf(guest.anySession()?.stateOf(id) as PuzzleState);
      expect(versusSummary(b)).toEqual(versusSummary(a));
    }
    const gt = trackOf(host.anySession()?.stateOf("g") as PuzzleState);
    expect(gt.misses).toBe(2);
    expect(gt.best).toBe(4);
  });

  it("다 쳤다고 알렸지만 보낸 수 기록으로 다시 계산하면 다 치지 않았으면 그 사람 결과는 무효(DNF)", () => {
    const { clock, net, host, guest } = setup();
    // 고친 손님: 실제로는 공식과 다른 수를 보내고 다 쳤다고 알린다(수 수는 맞춘다)
    // 대결 메시지는 `cube-race` 봉투(`hub.ts`)에 싸여 간다
    net.filter = (m, from) => {
      const env = m as {
        type?: string;
        m?: { type?: string; moves?: { i: number; m: string; t: number }[] };
      };
      const inner = env.m;
      if (
        from === "g" &&
        env.type === "cube-race" &&
        inner?.type === "race-moves" &&
        inner.moves
      )
        return {
          ...env,
          m: { ...inner, moves: inner.moves.map((x) => ({ ...x, m: "D" })) },
        };
      return m;
    };
    typer(clock, host, 400);
    typer(clock, guest, 100);
    host.startRound();
    runUntil(
      clock,
      () => host.rounds.length === 1 && guest.rounds.length === 1,
      200_000,
      50,
    );
    const r = host.rounds[0]?.result;
    expect(r?.players.g?.status).toBe("dnf");
    expect(r?.players.g?.reason).toBe("맞추지 못함");
    expect(r?.ranking[0]).toBe("h");
    // 방장 기기가 다시 계산한 손님 진행: 한 문제도 못 맞추고 모두 틀린 수
    const gt = trackOf(host.anySession()?.stateOf("g") as PuzzleState);
    expect(gt.index).toBe(0);
    expect(gt.hits).toBe(0);
  });

  it("키 배치가 달라 공식이 달라도 시작 모양은 같고, 각자 알린 공식으로 두 기기가 같은 진행·결과를 낸다", () => {
    const PLL: VersusRule = { stage: "pll" };
    const { clock, host, guest } = setup(undefined, PLL);
    typer(clock, host, 300, [1], twoHandKeymap());
    typer(clock, guest, 200, [], notationKeymap());
    host.startRound();
    runUntil(
      clock,
      () => host.rounds.length === 1 && guest.rounds.length === 1,
      400_000,
      50,
    );
    const h = host.rounds[0];
    expect(guest.rounds[0]?.result).toEqual(h?.result);
    expect(h?.result.players.h?.status).toBe("done");
    expect(h?.result.players.g?.status).toBe("done");
    expect(h?.result.ranking).toEqual(["g", "h"]);
    // 시작 모양·문제 목록은 같고, 수 기록에 실린 공식은 사람마다 다르다
    const hs = host.anySession()?.startState() as PuzzleState;
    const gs = guest.anySession()?.startState() as PuzzleState;
    expect([...gs.perm]).toEqual([...hs.perm]);
    const algsOf = (id: string) =>
      (h?.logs[id] ?? [])
        .filter((x) => x.m.startsWith("?alg "))
        .map((x) => x.m);
    expect(algsOf("h")).toHaveLength(10);
    expect(algsOf("g")).not.toEqual(algsOf("h"));
    for (const id of ["h", "g"]) {
      const a = trackOf(host.anySession()?.stateOf(id) as PuzzleState);
      const b = trackOf(guest.anySession()?.stateOf(id) as PuzzleState);
      expect(b).toEqual(a);
    }
    expect(trackOf(host.anySession()?.stateOf("h") as PuzzleState).misses).toBe(
      1,
    );
  });

  it("그 모양을 풀지 못하는 공식을 알린 기록은 다시 계산에서 걸려 무효(DNF)", () => {
    const PLL: VersusRule = { stage: "pll" };
    const { clock, net, host, guest } = setup(undefined, PLL);
    net.filter = (m, from) => {
      const env = m as {
        type?: string;
        m?: { type?: string; moves?: { i: number; m: string; t: number }[] };
      };
      const inner = env.m;
      if (
        from === "g" &&
        env.type === "cube-race" &&
        inner?.type === "race-moves" &&
        inner.moves
      )
        return {
          ...env,
          m: {
            ...inner,
            moves: inner.moves.map((x) =>
              x.m.startsWith("?alg ") ? { ...x, m: "?alg R U R' U'" } : x,
            ),
          },
        };
      return m;
    };
    typer(clock, host, 400, [], twoHandKeymap());
    typer(clock, guest, 100, [], notationKeymap());
    host.startRound();
    runUntil(
      clock,
      () => host.rounds.length === 1 && guest.rounds.length === 1,
      400_000,
      50,
    );
    const r = host.rounds[0]?.result;
    expect(r?.players.g?.status).toBe("dnf");
    expect(r?.ranking[0]).toBe("h");
  });

  it("방장이 한 손님에게만 다른 단계를 알리면 판이 열리지 않는다", () => {
    const { clock, host, guest } = setup({
      practice: { stage: "beginner-yellow-cross" },
    });
    typer(clock, guest, 100);
    host.startRound();
    runUntil(
      clock,
      () => host.rounds.length === 1 && guest.rounds.length === 1,
      200_000,
      50,
    );
    const r = host.rounds[0]?.result;
    expect(r?.ranking.every((id) => r.players[id]?.status !== "done")).toBe(
      true,
    );
  });

  it("공식 연습을 켜면 3×3이 되고 파티·모양 만들기·핸디캡 목표가 꺼진다. 크기를 바꾸면 공식 연습이 꺼진다", () => {
    const { host } = setup();
    host.setPractice(null);
    host.setSettings({ n: 2 });
    host.setParty("hp");
    host.setPractice({ stage: "pll", mode: "see" });
    // 가장 긴 단계도 입문 컴퓨터가 끝내게 제한 시간은 10분, 끄면 그 크기의 기본으로
    expect(host.state?.settings).toMatchObject({
      n: 3,
      practice: { stage: "pll", mode: "see" },
      timeLimitSec: PRACTICE_TIME_LIMIT_SEC,
    });
    expect(host.state?.settings.party).toBeUndefined();
    host.setPractice(null);
    expect(host.state?.settings.timeLimitSec).toBe(TIME_LIMIT_SEC[3]);
    host.setPractice({ stage: "pll" });
    host.setShape({ start: "solved", pick: "easy" });
    expect(host.state?.settings.practice).toBeUndefined();
    host.setPractice(SECOND);
    host.setSettings({ n: 4 });
    expect(host.state?.settings.practice).toBeUndefined();
    // 모르는 단계는 받지 않는다
    host.setPractice({ stage: "nope" });
    expect(host.state?.settings.practice).toBeUndefined();
  });
});

describe("공식 연습 컴퓨터", () => {
  it("컴퓨터가 계획대로 10문제를 치고, 다른 기기가 계획을 다시 계산해 확인한다", () => {
    const clock = new ManualClock();
    const room = new CubeRoom({
      clock,
      isHost: true,
      name: "나",
      scrambler: fake,
      settings: { n: 3, timeLimitSec: 300, practice: SECOND },
    });
    room.addBot(levelText("pro"));
    room.addBot(levelText("novice"));
    room.startRound();
    runUntil(clock, () => room.rounds.length === 1, 400_000, 100);
    const r = room.rounds[0];
    expect(r?.result.players.bot1?.status).toBe("done");
    expect(r?.result.players.bot2).toMatchObject({ status: "done" });
    // 초고수가 입문보다 빠르다
    expect(r?.result.ranking.indexOf("bot1")).toBeLessThan(
      r?.result.ranking.indexOf("bot2") as number,
    );
    for (const [id, lv] of [
      ["bot1", "pro"],
      ["bot2", "novice"],
    ] as const) {
      expect(
        practiceBotRunOk(
          levelText(lv),
          r?.start as PuzzleState,
          r?.seed as string,
          id,
          r?.logs[id] ?? [],
          true,
        ),
      ).toBe(true);
    }
    // 다른 단계로 다시 계산하면 계획과 다르다
    expect(
      practiceBotRunOk(
        levelText("novice"),
        r?.start as PuzzleState,
        r?.seed as string,
        "bot1",
        r?.logs.bot1 ?? [],
        true,
      ),
    ).toBe(false);
  });
});
