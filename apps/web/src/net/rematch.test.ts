// @vitest-environment node
import { ManualClock } from "@game/fair-play";
import { omokBotFor } from "@game/omok-ai";
import { STANDARD_RULES } from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { omokKit } from "@/omok/kit";
import type { ArchiveSource } from "@/review/recorder";

import { closeWhenDone } from "./close-when-done";
import { type AuditResult, GuestRoom } from "./guest-room";
import { HostRoom } from "./host-room";
import { type Commitment, isHostMessage } from "./protocol";
import { roomRandom } from "./room-random-fixture";
import { MemoryNetwork } from "./transport";

/** 방장·손님 비밀 값(게임마다)을 정해 한 판 더까지 실행마다 같다 */
const random = roomRandom("rematch");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 조건이 맞을 때까지 기다린다. 상한은 멈춘 시험을 잡는 안전장치일 뿐이다 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 30_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

/** 오목 방(방장 + 참가자 하나). 참가자가 받은 시작 약속·판 끝 검증·복기 기록을 모은다 */
async function setup() {
  const net = new MemoryNetwork();
  const clock = new ManualClock();
  const host = new HostRoom({
    kit: omokKit,
    transport: net.join("host"),
    clock,
    hostName: "방장",
    rules: STANDARD_RULES,
    revealTimeoutMs: 500,
    testRandom: random.host,
  });
  const guest = new GuestRoom({
    kit: omokKit,
    transport: net.join("g"),
    clock,
    name: "손님",
    token: null,
    testRandom: random.guest(0),
  });
  closeWhenDone(host, [guest]);
  await until(() => guest.seat !== null);
  const audits: AuditResult[] = [];
  guest.on("audit", (r) => audits.push(r));
  const archives: ArchiveSource[] = [];
  guest.on("archive", (s) => archives.push(JSON.parse(JSON.stringify(s))));
  const started: Commitment[][] = [];
  guest.transport.onMessage((m) => {
    if (isHostMessage(m) && m.t === "started") started.push(m.commitments);
  });
  return { host, guest, audits, archives, started };
}

type OmokHost = Awaited<ReturnType<typeof setup>>["host"];
type OmokGuest = Awaited<ReturnType<typeof setup>>["guest"];

/** 두 사람이 중수처럼 `moves`수를 둔 뒤 둘 차례인 사람이 기권한다(참가자도 한 수 이상 둔다) */
async function playThenResign(
  host: OmokHost,
  guest: OmokGuest,
  moves: number,
): Promise<void> {
  const bot = omokBotFor(1);
  for (let played = 0; played < moves; ) {
    const match = host.match;
    if (!match) throw new Error("대국이 없다");
    const mine = match.current();
    const theirs = guest.match?.current();
    if (mine.decision) {
      match.submit(bot.decide(mine, { seed: played }));
      played++;
    } else if (theirs?.decision && !guest.match?.awaiting()) {
      guest.match?.submit(bot.decide(theirs, { seed: played }));
      played++;
    }
    await until(() => (host.match?.actionLog().length ?? 0) >= played);
    await until(
      () =>
        JSON.stringify(guest.match?.current()) ===
        JSON.stringify(
          omokKit.viewOf(host.match?.rawState() as never, guest.seat ?? 1),
        ),
    );
  }
  const match = host.match;
  if (!match) throw new Error("대국이 없다");
  if (match.current().decision) match.submit({ type: "resign" });
  else guest.match?.submit({ type: "resign" });
  await until(() => host.isOver());
}

describe("한 판 더(같은 방 새 게임)", () => {
  it("끝난 게임만 한 판 더를 시작한다", async () => {
    const { host, guest } = await setup();
    await host.start();
    await until(() => guest.match !== null);
    expect(await host.rematch()).toBeNull();
    expect(host.gameNo).toBe(1);
  });

  it("오목: 새 게임은 새 비밀 값·새 약속·새 시드로 시작하고, 두 게임 모두 판 끝 검증을 통과한다", async () => {
    const { host, guest, audits, archives, started } = await setup();
    await host.start();
    await until(() => guest.match !== null);
    await playThenResign(host, guest, 3);
    await until(() => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
    const first = host.archiveSource();
    const firstSecret = guest.secret;
    const firstMatch = guest.match;

    const second = await host.rematch();
    expect(second).not.toBeNull();
    await until(() => guest.match !== null && guest.match !== firstMatch);
    expect([host.gameNo, guest.gameNo]).toEqual([2, 2]);
    // 앞 게임의 비밀 값·약속을 다시 쓰지 않는다(방장 것도 참가자 것도).
    expect(guest.secret).not.toBe(firstSecret);
    expect(started).toHaveLength(2);
    for (const seat of [0, 1])
      expect(started[1]?.find((c) => c.seat === seat)?.hash).not.toBe(
        started[0]?.find((c) => c.seat === seat)?.hash,
      );
    // 새 대국은 처음부터(앞 게임 기록이 섞이지 않는다)
    expect(host.match?.actionLog()).toEqual([]);
    expect(host.archiveSource()?.seed).not.toBe(first?.seed);

    await playThenResign(host, guest, 2);
    await until(() => audits.length === 2);
    expect(audits[1]).toEqual({ ok: true });
    // 복기 기록: 앞 게임은 앞 게임 그대로, 새 게임은 따로
    expect(archives).toHaveLength(2);
    expect(archives[0]?.seed).toBe(first?.seed);
    expect(archives[0]?.log).toEqual(first?.log);
    expect(archives[1]?.seed).toBe(host.archiveSource()?.seed);
    expect(archives[1]?.log).toEqual(host.archiveSource()?.log);
  });

  it("방장이 판 끝 기록을 공개하지 않고 새 게임을 알리면 참가자 검증이 실패한다", async () => {
    const { host, guest, audits } = await setup();
    await host.start();
    await until(() => guest.match !== null);
    // 고친 방장 프로그램: 게임 중에 기록 공개 없이 한 판 더 알림만 보낸다.
    host.transport.send({ t: "rematch", gameNo: 2 });
    await until(() => audits.length === 1);
    expect(audits).toEqual([
      {
        ok: false,
        reason: "방장이 판 끝 기록을 공개하지 않고 새 게임을 시작했어요.",
      },
    ]);
  });
});
