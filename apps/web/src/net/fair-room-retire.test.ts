// @vitest-environment node

import { heuristicBot } from "@game/mighty-ai";
import { type PlayerView, presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { setup, until } from "./fair-room-fixture";
import type { AuditResult } from "./guest-room";

/** 멘탈 포커 온라인 방: 첫 판 도중에 그만하기(fair-room.test에서 나눠 동시에 돈다) */
describe("멘탈 포커 온라인 대전: 첫 판 도중에 그만하기", () => {
  it("첫 판 카드를 다 열기 전에 방장이 끝내도 참가자 게임 끝 검증은 통과한다(끝까지 치지 않은 판은 결과 없음)", async () => {
    const { host, guests, incidents } = await setup(
      presetRules("standard5"),
      2,
    );
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    // 공약·카드 몇 장까지 둔 뒤에 끝낸다(이미 둔 수가 있는 판).
    const match = host.match;
    for (let i = 0; i < 400 && (match?.actionLog().length ?? 0) < 8; i++) {
      const views: [PlayerView | undefined, (a: never) => void][] = [
        [match?.current(), (a) => match?.submit(a)],
        ...guests.map(
          (g) =>
            [g.match?.current(), (a: never) => g.match?.submit(a)] as [
              PlayerView | undefined,
              (a: never) => void,
            ],
        ),
      ];
      for (const [view, submit] of views)
        if (view?.decision)
          submit(heuristicBot.decide(view, { seed: 3 }) as never);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(match?.current().roundNumber).toBe(1);
    host.abandon();
    await until(() => audits.length === guests.length);
    expect(audits).toEqual([{ ok: true }, { ok: true }]);
    expect(incidents).toEqual([]);
  });
});
