// @vitest-environment node

import {
  type FairGuestSeat,
  type FairHostTable,
  isToken,
} from "@game/fair-play";
import { presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";
import { hostBidsTop, playRounds, setup, until } from "./fair-room-fixture";
import type { AuditResult } from "./guest-room";

describe("멘탈 포커 온라인 대전", () => {
  // 판이 바뀌어도 이어 가는지(두 판)는 가장 가벼운 2마로 보고, 6마(죽이기·다시 나누기)는 한 판으로 본다.
  // 5마 끝까지 두기는 같은 확인(사고 없음·판마다 검증·게임 끝 검증)을 방장 새로고침 시험이 두 판으로 하고
  // (fair-room-host-reload.test.ts "5마(두 판)"), 참가자 새로고침·복기 시험도 5마 한 판을 끝까지 둔다(fair-room-reconnect.test.ts)
  it.each([
    { name: "2마", preset: "standard2", guestCount: 1, rounds: 2 },
    { name: "6마", preset: "standard6", guestCount: 3, rounds: 1 },
  ] as const)(
    "$name: 방장도 남의 패를 모른 채 끝까지 두고(판 수 $rounds), 판마다 모두가 진짜 카드로 다시 계산해 확인한다",
    async ({ preset, guestCount, rounds }) => {
      const rules = presetRules(preset);
      const { host, guests, incidents } = await setup(rules, guestCount);
      const verified: number[] = [];
      for (const g of guests) g.on("roundVerified", (d) => verified.push(d));
      const audits: AuditResult[] = [];
      for (const g of guests) g.on("audit", (r) => audits.push(r));
      const seen: string[] = [];
      guests[0]?.transport.onMessage((m) => seen.push(JSON.stringify(m)));

      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      // 방장 엔진 상태에는 참가자 카드가 자리 표로만 있다.
      const state = host.match?.rawState();
      for (const g of guests)
        expect(
          state?.round.hands[g.seat as number]?.every((c) => isToken(c)),
        ).toBe(true);

      const scored = await playRounds(
        host,
        guests,
        rounds,
        incidents,
        hostBidsTop,
      );
      expect(
        incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`),
      ).toEqual([]);
      await until(() =>
        guests.every(
          (g) =>
            g.match?.current().roundNumber ===
            host.match?.current().roundNumber,
        ),
      ).catch(() => {
        throw new Error(
          `판 번호: 방장 ${host.match?.current().roundNumber}, 참가자 ${guests.map((g) => `${g.match?.current().roundNumber}(${(g.fair as FairGuestSeat | null)?.coordinator.deal})`).join(",")} 방장 기기 ${(host.fair as FairHostTable | null)?.coordinator.deal}`,
        );
      });
      await until(() => verified.length >= scored * guestCount);
      host.finish();
      await until(() => audits.length === guestCount);
      expect(audits.filter((a) => !a.ok)).toEqual([]);
      // 끝까지 둔 판마다 각 참가자가 마지막 턴에 판 전체를 진짜 카드로 다시 계산했다.
      expect(verified.length).toBeGreaterThanOrEqual(scored * guestCount);
      expect(seen.some((m) => m.includes('"hands"'))).toBe(false);
    },
  );

  it("마지막 판 카드가 아직 다 열리지 않은 참가자에게 판 끝 기록이 먼저 와도, 다 열리길 기다려 검증을 통과한다", async () => {
    // 방장은 열쇠를 다 받자마자 판을 끝낸다. 참가자 기기는 다른 사람이 낸 마지막 열쇠를 그보다 늦게 받거나
    // 아직 처리하는 중일 수 있다. 그 순서를 시험이 만든다: 참가자는 판 끝 기록을 받을 때까지 판 카드를 다 열지 못한다.
    const { host, guests, incidents } = await setup(
      presetRules("standard2"),
      1,
    );
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
    await playRounds(host, guests, 1, incidents, hostBidsTop);
    host.finish();
    await until(() => auditArrived);
    // 판 끝 기록이 닿은 뒤에야 참가자가 맡아 둔 열쇠로 카드를 연다.
    for (const deal of [...held].sort((a, b) => a - b)) open(deal);
    await until(() => audits.length === guests.length);
    expect(audits.filter((a) => !a.ok)).toEqual([]);
    expect(incidents).toEqual([]);
  });
});
