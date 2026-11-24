import {
  ManualClock,
  prepareGroup,
  type SeededTestRandom,
} from "@game/fair-play";
import { seededTestRandom } from "@game/fair-play/test-random";
import { heartsIntermediateBot, heartsNormalBot } from "@game/hearts-ai";
import { WINDOWS_RULES } from "@game/hearts-engine";

import { closeWhenDone } from "@/net/close-when-done";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom, type IncidentNotice } from "@/net/host-room";
import type { HostStore } from "@/net/host-store";
import { MemoryNetwork } from "@/net/transport";

import { heartsRoomKit } from "./fair-table";

/**
 * 하트 멘탈 포커 방 시험의 공통 준비. 시험을 여러 파일(fair-room, fair-room-rounds, fair-room-late-open,
 * fair-room-reload)로 나눠 동시에 돌게 한다
 */

await prepareGroup("r255");

/**
 * 방장 대국에서 끝난 판 수를 센다. 게임 끝(끝 점수)까지 두면 판 수가 섞기 운에 달려(끝 점수는 10보다 작게 못
 * 둔다), 볼 판 수만큼 두고 방장이 `finish()`로 판 끝 기록을 보내게 할 때 쓴다(마이티 시험의 `playRounds`와 같다)
 */
export function scoredRounds(host: { match: unknown }): () => number {
  let scored = 0;
  const match = host.match as {
    subscribe(listener: (s: { events: { type: string }[] }) => void): void;
  };
  match.subscribe((s) => {
    if (s.events.some((e) => e.type === "roundScored")) scored++;
  });
  return () => scored;
}

export async function until(
  condition: () => boolean,
  ms = 50_000,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms)
      throw new Error("조건을 기다리다 시간이 지났다");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * 끝 점수 기본 10점(규칙 문자열이 받는 가장 작은 값): 한 판에 26점이 나뉘어 대개 한 판, 드물게 두 판에 끝난다
 * (새로고침·끊김·부정·복기는 한 판이면 된다). 판의 패는 시험 난수원 씨앗으로 정해져 몇 판에 끝나는지도 실행마다 같다. 판이 바뀌어도 이어 가는지는 fair-room-rounds 시험이 27점으로 두
 * 판을 둔 뒤 끝낸다(한 판에 나눠지는 점수가 26점이라 첫 판에는 게임이 끝나지 않는다)
 */
export function hostOptions(
  clock: ManualClock,
  store?: HostStore,
  endScore = 10,
  /** 시험 난수원(`setup`이 돌려준 `random`). 없으면 기본 씨앗 */
  random: SeededTestRandom = seededTestRandom(DEFAULT_FAIR_SEED),
) {
  return {
    kit: heartsRoomKit,
    hostName: "방장",
    rules: { ...WINDOWS_RULES, endScore },
    bot: heartsIntermediateBot,
    botLevel: 1,
    revealTimeoutMs: 500,
    fair: { group: "r255" as const },
    clock,
    testRandom: random.child("host"),
    ...(store ? { store } : {}),
  };
}

/**
 * 시험의 멘탈 포커 난수원 씨앗. 섞기·열쇠·비밀 값을 씨앗으로 정해 판의 패가 실행마다 같다(docs/13 8절 「시험」).
 * 방장은 `host`, 참가자는 `guest<i>` 아래 경로를 쓴다
 */
export const DEFAULT_FAIR_SEED = "hearts";

export async function setup(
  guestCount: number,
  store?: HostStore,
  voteDelayMs?: number,
  endScore?: number,
  /** 판을 정하는 씨앗(없으면 `DEFAULT_FAIR_SEED`) */
  seed = DEFAULT_FAIR_SEED,
) {
  const net = new MemoryNetwork();
  // 제한 시간(투표 열기 등)은 시험이 이 시계를 옮길 때만 지난다.
  const clock = new ManualClock();
  const random = seededTestRandom(seed);
  const host = new HostRoom({
    transport: net.join("host"),
    ...hostOptions(clock, store, endScore, random),
    ...(voteDelayMs !== undefined ? { voteDelayMs } : {}),
  });
  const guests: GuestRoom<
    typeof WINDOWS_RULES,
    never,
    never,
    never,
    never,
    never
  >[] = [];
  for (let i = 0; i < guestCount; i++) {
    const guest = new GuestRoom({
      kit: heartsRoomKit,
      transport: net.join(`g${i}`),
      name: `손님${i}`,
      token: null,
      clock,
      testRandom: random.child(`guest${i}`),
    });
    await until(() => guest.seat !== null);
    guests.push(guest as never);
  }
  await until(() => guests.every((g) => g.lobby?.seats.length === 4));
  const incidents: IncidentNotice[] = [];
  host.onIncident((n) => incidents.push(n));
  for (const g of guests) g.on("incident", (n) => incidents.push(n));
  closeWhenDone(host, guests);
  return { net, host, guests, incidents, clock, random };
}

/** 사람 자리도 중수 컴퓨터처럼 둔다. 같은 화면이면 다시 내지 않는다 */
export async function playUntil(
  host: HostRoom<never, never, never, never, never, never>,
  guests: GuestRoom<never, never, never, never, never, never>[],
  done: () => boolean,
  incidents: IncidentNotice[],
): Promise<void> {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  const stamps = new Map<string, string>();
  const offs = guests.map((g, i) =>
    g.on("rejected", () => stamps.delete(`g${i}`)),
  );
  const start = Date.now();
  while (!done() && incidents.length === 0) {
    if (Date.now() - start > 50_000) {
      const raw = (
        match as unknown as {
          rawState(): {
            round: {
              phase: string;
              turn: number | null;
              trickIndex: number;
              trick: unknown;
              passes: unknown;
              hands: string[][];
            };
            roundNumber: number;
          };
        }
      ).rawState();
      const hv = match.current() as unknown as {
        decision: unknown;
        hand: string[];
      };
      throw new Error(
        `끝나지 않는다: ${JSON.stringify({ round: raw.roundNumber, phase: raw.round.phase, turn: raw.round.turn, trick: raw.round.trick, passes: raw.round.passes, hands: raw.round.hands.map((h) => h.length), hostDecision: hv.decision, hostHand: hv.hand, guests: guests.map((g) => ({ seat: g.seat, waiting: (g.fair as unknown as { waiting: boolean })?.waiting, decision: (g.match?.current() as unknown as { decision: unknown })?.decision })) })}`,
      );
    }
    const act = (key: string, view: never, submit: (a: never) => void) => {
      const v = view as {
        decision: unknown;
        roundNumber: number;
        phase: string;
        trickIndex: number;
        handCounts: number[];
        trick: { plays: unknown[] } | null;
      };
      if (!v?.decision) return;
      const stamp = JSON.stringify([
        v.roundNumber,
        v.phase,
        v.trickIndex,
        v.trick?.plays.length,
        v.handCounts,
      ]);
      if (stamps.get(key) === stamp) return;
      stamps.set(key, stamp);
      submit(heartsNormalBot.decide(view, { seed: 9 }) as never);
    };
    act("host", match.current(), (a) => match.submit(a));
    for (const [i, g] of guests.entries())
      if (g.match) act(`g${i}`, g.match.current(), (a) => g.match?.submit(a));
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  for (const off of offs) off();
}
