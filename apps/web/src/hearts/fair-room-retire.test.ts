// @vitest-environment node
// 하트 멘탈 포커 시험은 섞고 증명하느라 무거워, 시험마다 파일을 나눠 동시에 돈다
// (첫 판 도중 끝내기 투표는 fair-room-reload.test.ts)
import { describe, expect, it } from "vitest";

import type { AuditResult } from "@/net/guest-room";
import { neverOpens } from "@/net/unopened-round-fixture";

import { playUntil, setup, until } from "./fair-room-fixture";

describe("하트 멘탈 포커 온라인 대전: 판 끝 직후 그만하기", () => {
  it("첫 판을 끝까지 쳐 정산한 직후 다음 판 전에 그만두면, 그 판 패가 열리지 않은 참가자는 게임 끝 검증에서 그 판을 짚는다", async () => {
    // 첫 판으로 게임이 끝나지 않게 끝 점수를 넉넉히(한 판에 나오는 점수는 26점까지).
    const { host, guests, incidents, clock } = await setup(
      1,
      undefined,
      undefined,
      100,
    );
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    // 방장이 판 끝 열쇠를 숨긴 것과 같다: 참가자 기기에서 첫 판 패가 끝내 열리지 않는다.
    neverOpens(guests[0] as never, 1);
    const view = () =>
      host.match?.current() as
        | { phase?: string; roundNumber?: number }
        | undefined;
    await playUntil(
      host as never,
      guests as never,
      () => view()?.phase === "roundEnd",
      incidents,
    );
    expect(view()?.roundNumber).toBe(1);
    host.abandon();
    // 참가자는 열쇠를 공개한 판이 열리길(상한 있음) 기다린 뒤 검증한다.
    await until(() => {
      if (audits.length === 1) return true;
      clock.advance(1_000);
      return false;
    });
    expect(audits).toEqual([
      {
        ok: false,
        reason: "1판은 끝났는데 카드가 다 열리지 않아 다시 계산하지 못했어요.",
      },
    ]);
  });
});
