// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AuditResult } from "@/net/guest-room";

import { playUntil, scoredRounds, setup, until } from "./fair-room-fixture";

/**
 * 손님 둘이 남의 패를 모른 채 카드를 넘기는 한 판. 판이 바뀌어도 이어 가는지와 복기는 fair-room-rounds.test.ts,
 * 마지막 판 카드가 늦게 열리는 순서는 fair-room-late-open.test.ts, 새로고침·끊김·부정은 fair-room-reload.test.ts가 본다
 * (오래 걸려 파일을 나눠 동시에 돈다).
 * 예전에는 이 시험 하나가 손님 둘로 게임 끝(27점)까지 두어 판 수가 섞기 운에 달렸다(두 판 이상). 손님끼리 넘긴
 * 카드 열쇠를 보는 데는 넘기기가 있는 첫 판 하나면 되고, 판을 이어 두는 것은 손님 하나로 본다
 */
describe("하트 멘탈 포커 온라인 대전", () => {
  it("방장도 남의 패를 모른 채 손님 둘이 카드를 넘기고 판을 끝까지 두며, 넘긴 카드 열쇠는 받는 사람에게만 가고, 판 끝에 모두가 다시 계산해 확인한다", async () => {
    const { host, guests, incidents } = await setup(2);
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
    };
    // 방장 엔진에는 참가자 카드가 자리 표로만 있다.
    for (const g of guests)
      expect(
        match
          .rawState()
          .round.hands[g.seat as number]?.every((c) => c.startsWith("?_")),
      ).toBe(true);

    const scored = scoredRounds(host);
    await playUntil(
      host as never,
      guests as never,
      () => scored() >= 1,
      incidents,
    );
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    void host.finish();
    await until(() => audits.length === guests.length);
    expect(audits.filter((a) => !a.ok)).toEqual([]);
    // 판 검증은 판 끝 기록을 받은 뒤 비동기로 끝난다.
    await until(() => verified.length >= guests.length);
    // 참가자가 받은 메시지에 손패 전체가 없다. 넘긴 카드 열쇠는 받는 사람에게만 갔다.
    expect(seen.some((m) => m.includes('"hands"'))).toBe(false);
    const handovers = seen.filter((m) => m.includes('"handover"'));
    expect(handovers.length).toBeGreaterThan(0);
    expect(handovers.every((m) => m.includes(`"to":${guests[0]?.seat}`))).toBe(
      true,
    );
  });
});
