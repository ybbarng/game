// @vitest-environment node
// 하트 멘탈 포커 시험은 섞고 증명하느라 무거워, 시험마다 파일을 나눠 동시에 돈다
// (첫 판 도중 끝내기 투표는 fair-room-reload.test.ts)
import { describe, expect, it } from "vitest";

import { STANDING_MISMATCH } from "@/net/fair-verify";
import type { AuditResult } from "@/net/guest-room";
import { forgeHostViews, neverOpens } from "@/net/unopened-round-fixture";

import { playUntil, setup, until } from "./fair-room-fixture";

describe("하트 멘탈 포커 온라인 대전: 판 끝 직후 그만하기", () => {
  it("첫 판을 끝내고 둘째 판 도중에 그만두면 참가자 게임 끝 검증은 통과한다(끝 화면 점수 = 첫 판까지 점수)", async () => {
    const { host, guests, incidents } = await setup(
      1,
      undefined,
      undefined,
      100,
    );
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const round = () =>
      (host.match?.current() as { roundNumber?: number } | undefined)
        ?.roundNumber;
    const steps = () => host.match?.actionLog().length ?? 0;
    let secondFrom: number | null = null;
    await playUntil(
      host as never,
      guests as never,
      () => {
        if (round() !== 2) return false;
        secondFrom ??= steps();
        return steps() >= secondFrom + 3;
      },
      incidents,
    );
    host.abandon();
    await until(() => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
    expect(incidents).toEqual([]);
  });

  it("고친 방장 기기가 판 끝 화면을 보내지 않고 그만둔 끝 화면의 점수를 바꾸면, 참가자 게임 끝 검증이 짚는다", async () => {
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
    neverOpens(guests[0] as never, 1);
    // 판 끝 화면은 보내지 않고, 끝 화면에서 판 점수를 지우고(판 끝까지 안 간 것처럼) 방장 점수를 깎는다(낮을수록 좋다).
    forgeHostViews(host, (v) => {
      if (v.phase === "roundEnd") return null;
      if (v.phase !== "gameOver") return v;
      const scores = [...(v.scores as number[])];
      scores[0] = (scores[0] ?? 0) - 20;
      return { ...v, roundPoints: null, scores };
    });
    const phase = () =>
      (host.match?.current() as { phase?: string } | undefined)?.phase;
    await playUntil(
      host as never,
      guests as never,
      () => phase() === "roundEnd",
      incidents,
    );
    host.abandon();
    await until(() => {
      if (audits.length === 1) return true;
      clock.advance(1_000);
      return false;
    });
    expect(audits).toEqual([{ ok: false, reason: STANDING_MISMATCH }]);
  });

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
