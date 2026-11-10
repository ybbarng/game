import { levelText } from "@game/cube-ai";
import { type CubeMove, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { DelayNet, runUntil } from "@/net/race/race-fixture";
import type { Transport } from "@/net/transport";
import { PRACTICE_N } from "../practice/problem";
import {
  trackOf,
  type VersusRule,
  versusBoard,
  versusOver,
  versusSummary,
} from "../practice/versus";
import { practiceBotRunOk } from "./practice-bot";
import { createPracticeRaceGame, practiceSeed } from "./practice-race";
import type { Scrambler } from "./race-game";
import {
  CubeRoom,
  PRACTICE_READY_MS,
  type RoomSettings,
  raceOptionsFor,
} from "./room";

/** 공식 연습 대결(docs/47 16-12): 같은 문제·기록으로 다시 계산·위조 기록 무효·컴퓨터 */

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

function setup(guestPatch?: Partial<RoomSettings>) {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  const host = new CubeRoom({
    transport: net.join("h"),
    clock,
    isHost: true,
    name: "방장",
    scrambler: fake,
    settings: { n: 3, timeLimitSec: 120, practice: SECOND },
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
) {
  let started = "";
  room.onChange(() => {
    const s = room.session();
    const race = room.state?.race?.id ?? "";
    if (s?.snapshot().phase !== "race" || started === race) return;
    started = race;
    const missed = new Set<number>();
    const tick = () => {
      const state = s.stateOf(room.me) as PuzzleState | undefined;
      if (!state) return;
      const t = trackOf(state);
      if (versusOver(t)) return;
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
    expect(host.state?.settings).toMatchObject({
      n: 3,
      practice: { stage: "pll", mode: "see" },
    });
    expect(host.state?.settings.party).toBeUndefined();
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
