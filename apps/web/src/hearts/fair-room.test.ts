// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AuditResult } from "@/net/guest-room";
import type { ArchiveSource } from "@/review/recorder";
import { replayArchive } from "@/review/replay";

import { playUntil, setup, until } from "./fair-room-fixture";
import { heartsKit } from "./kit";

/** 끝까지 두기와 복기(같은 게임으로 본다). 새로고침·끊김·부정은 fair-room-reload.test.ts가 본다 */
describe("하트 멘탈 포커 온라인 대전", () => {
  it("방장도 남의 패를 모른 채 카드를 넘기고 게임을 끝까지 두며(적어도 두 판), 판마다 모두가 다시 계산해 확인하고, 방장 기록을 다시 돌리면 실제 카드로 같은 판이 나온다", async () => {
    const { host, guests, incidents } = await setup(
      2,
      undefined,
      undefined,
      27,
    );
    const verified: number[] = [];
    for (const g of guests) g.on("roundVerified", (d) => verified.push(d));
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    const seen: string[] = [];
    guests[0]?.transport.onMessage((m) => seen.push(JSON.stringify(m)));

    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const match = host.match as unknown as {
      rawState(): { round: { hands: string[][] } };
      current(): { phase: string; roundNumber: number };
    };
    // 방장 엔진에는 참가자 카드가 자리 표로만 있다.
    for (const g of guests)
      expect(
        match
          .rawState()
          .round.hands[g.seat as number]?.every((c) => c.startsWith("?_")),
      ).toBe(true);

    await playUntil(
      host as never,
      guests as never,
      () => match.current().phase === "gameOver",
      incidents,
    );
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    const rounds = match.current().roundNumber;
    await until(() => audits.length === guests.length);
    expect(audits.filter((a) => !a.ok)).toEqual([]);
    // 판마다 검증은 판 끝 기록을 받은 뒤 비동기로 끝난다.
    await until(() => verified.length >= rounds * guests.length);
    // 참가자가 받은 메시지에 손패 전체가 없다. 넘긴 카드 열쇠는 받는 사람에게만 갔다.
    expect(seen.some((m) => m.includes('"hands"'))).toBe(false);
    expect(
      seen
        .filter((m) => m.includes('"handover"'))
        .every((m) => m.includes(`"to":${guests[0]?.seat}`)),
    ).toBe(true);
    // 복기: 방장이 남기는 기록(판별 실제 패 포함)을 다시 돌리면 실제 카드로 같은 판이 나온다.
    const source = (
      host as unknown as { archiveSource(): ArchiveSource }
    ).archiveSource();
    const replayed = replayArchive(heartsKit, {
      id: "online:test",
      game: "hearts",
      mode: "online",
      startedAt: 0,
      updatedAt: 0,
      ...source,
      seat: 0,
      seatNames: null,
      rounds,
      over: true,
    });
    expect(replayed.error).toBeNull();
    const scoredAt = replayed.events.findIndex((e) =>
      (e as { type: string }[]).some((x) => x.type === "roundScored"),
    );
    expect(scoredAt).toBeGreaterThan(0);
    const scoredState = replayed.states[scoredAt] as {
      round: { tricks: { plays: { card: string }[] }[] };
    };
    expect(
      scoredState.round.tricks
        .flatMap((tr) => tr.plays)
        .every((p) => !p.card.startsWith("?_")),
    ).toBe(true);
  });

  it("마지막 판 카드가 아직 다 열리지 않은 손님에게 판 끝 기록이 먼저 와도, 다 열리길 기다려 검증을 통과한다", async () => {
    // 방장은 모든 열쇠를 받자마자 판을 끝내고 판 끝 기록을 보낸다. 손님 기기는 다른 손님이 낸 마지막 열쇠를
    // 그보다 늦게 받거나(손님끼리 연결이 더 느림) 아직 처리하는 중일 수 있다. 그 순서를 시험이 만든다:
    // 0번 손님은 판 끝 기록을 받을 때까지 판 카드를 다 열지 못한다.
    const { host, guests, incidents } = await setup(2);
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    let auditArrived = false;
    guests[0]?.transport.onMessage((m) => {
      if ((m as { t?: string }).t === "audit") auditArrived = true;
    });
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const coordinator = (
      (guests[0] as { fair: unknown }).fair as {
        coordinator: { tryOpenAll(deal: number): void };
      }
    ).coordinator;
    const open = coordinator.tryOpenAll.bind(coordinator);
    const held = new Set<number>();
    coordinator.tryOpenAll = (deal) => {
      if (auditArrived) open(deal);
      else held.add(deal);
    };
    const match = host.match as unknown as { current(): { phase: string } };
    await playUntil(
      host as never,
      guests as never,
      () => match.current().phase === "gameOver",
      incidents,
    );
    await until(() => auditArrived);
    // 판 끝 기록이 닿은 뒤에야 0번 손님이 맡아 둔 열쇠로 카드를 연다.
    for (const deal of [...held].sort((a, b) => a - b)) open(deal);
    await until(() => audits.length === guests.length);
    expect(audits.filter((a) => !a.ok)).toEqual([]);
    expect(incidents).toEqual([]);
  });
});
