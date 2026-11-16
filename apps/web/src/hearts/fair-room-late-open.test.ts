// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AuditResult } from "@/net/guest-room";

import { playUntil, scoredRounds, setup, until } from "./fair-room-fixture";

// 오래 걸려 다른 하트 방 시험(fair-room.test.ts 등)과 파일을 나눠 동시에 돈다
describe("하트 멘탈 포커 온라인 대전", () => {
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
    // 판 하나가 끝나면 방장이 게임을 끝내 판 끝 기록을 보낸다(마이티 같은 시험과 같다). 예전에는 게임이 끝날 때까지
    // 두어 판 수가 섞기 운에 달렸다(끝 점수는 10보다 작게 못 둔다). 보는 것은 마지막 판 하나다
    const scored = scoredRounds(host);
    await playUntil(
      host as never,
      guests as never,
      () => scored() >= 1,
      incidents,
    );
    void host.finish();
    await until(() => auditArrived);
    // 판 끝 기록이 닿은 뒤에야 0번 손님이 맡아 둔 열쇠로 카드를 연다.
    for (const deal of [...held].sort((a, b) => a - b)) open(deal);
    await until(() => audits.length === guests.length);
    expect(audits.filter((a) => !a.ok)).toEqual([]);
    expect(incidents).toEqual([]);
  });
});
