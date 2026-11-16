/**
 * 끝까지 두기 시험 본문(2마·6마). 둘 다 오래 걸려 파일을 나눠 동시에 돈다
 * (fair-room.test.ts, fair-room-six.test.ts)
 */
import {
  type FairGuestSeat,
  type FairHostTable,
  isToken,
} from "@game/fair-play";
import { presetRules } from "@game/mighty-engine";
import { expect } from "vitest";
import { hostBidsTop, playRounds, setup, until } from "./fair-room-fixture";
import type { AuditResult } from "./guest-room";

export const wholeTitle = (name: string, rounds: number) =>
  `${name}: 방장도 남의 패를 모른 채 끝까지 두고(판 수 ${rounds}), 판마다 모두가 진짜 카드로 다시 계산해 확인한다`;

export async function wholeRoundsCase(
  preset: "standard2" | "standard6",
  guestCount: number,
  rounds: number,
): Promise<void> {
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
    expect(state?.round.hands[g.seat as number]?.every((c) => isToken(c))).toBe(
      true,
    );

  const scored = await playRounds(host, guests, rounds, incidents, hostBidsTop);
  expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
    [],
  );
  await until(() =>
    guests.every(
      (g) =>
        g.match?.current().roundNumber === host.match?.current().roundNumber,
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
}
