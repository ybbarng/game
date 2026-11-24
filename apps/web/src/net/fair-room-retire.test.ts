// @vitest-environment node

import { heuristicBot } from "@game/mighty-ai";
import { type PlayerView, presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { hostBidsTop, setup, until } from "./fair-room-fixture";
import { STANDING_MISMATCH } from "./fair-verify";
import type { AuditResult, GuestRoom } from "./guest-room";
import type { HostRoom } from "./host-room";
import { forgeHostViews, neverOpens } from "./unopened-round-fixture";

/**
 * 사람 자리(방장·참가자)를 컴퓨터처럼 `done`까지 둔다. 판 끝의 「다음 판」(continue)은 누르지 않는다(판 끝에서
 * 멈춰 그만두는 시험). 방장은 공약을 가장 높게 걸어 모두 포기로 다시 섞는 판이 없게 한다
 */
async function playUntil(
  host: HostRoom,
  guests: GuestRoom[],
  done: () => boolean,
  /** 판 끝의 「다음 판」도 눌러 다음 판으로 간다 */
  continueRounds = false,
): Promise<void> {
  const match = host.match;
  for (let i = 0; i < 2_000 && !done(); i++) {
    const views: [string, PlayerView | undefined, (a: never) => void][] = [
      ["host", match?.current(), (a) => match?.submit(a)],
      ...guests.map(
        (g, k) =>
          [`g${k}`, g.match?.current(), (a: never) => g.match?.submit(a)] as [
            string,
            PlayerView | undefined,
            (a: never) => void,
          ],
      ),
    ];
    for (const [key, view, submit] of views) {
      if (!view?.decision) continue;
      if (view.decision.kind === "continue" && !continueRounds) continue;
      submit(
        (hostBidsTop(view, key) ??
          heuristicBot.decide(view, { seed: 3 })) as never,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** 멘탈 포커 온라인 방: 도중에 그만하기(fair-room.test에서 나눠 동시에 돈다) */
describe("멘탈 포커 온라인 대전: 도중에 그만하기", () => {
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
    await playUntil(
      host,
      guests,
      () => (host.match?.actionLog().length ?? 0) >= 8,
    );
    expect(host.match?.current().roundNumber).toBe(1);
    host.abandon();
    await until(() => audits.length === guests.length);
    expect(audits).toEqual([{ ok: true }, { ok: true }]);
    expect(incidents).toEqual([]);
  });

  it("첫 판을 끝내고 둘째 판 도중에 그만두면 참가자 게임 끝 검증은 통과한다(끝 화면 돈 = 첫 판까지 돈)", async () => {
    const { host, guests, incidents } = await setup(
      presetRules("standard5"),
      2,
    );
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const steps = () => host.match?.actionLog().length ?? 0;
    let secondFrom: number | null = null;
    await playUntil(
      host,
      guests,
      () => {
        if (host.match?.current().roundNumber !== 2) return false;
        secondFrom ??= steps();
        return steps() >= secondFrom + 3;
      },
      true,
    );
    host.abandon();
    await until(() => audits.length === guests.length);
    expect(audits).toEqual([{ ok: true }, { ok: true }]);
    expect(incidents).toEqual([]);
  });

  it("고친 방장 기기가 판 끝 화면을 보내지 않고 그만둔 끝 화면의 돈을 부풀리면, 참가자 게임 끝 검증이 짚는다", async () => {
    const { host, guests, clock } = await setup(presetRules("standard5"), 1);
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    neverOpens(guests[0] as GuestRoom, 1);
    // 판 끝 화면은 보내지 않고, 끝 화면에서 판 결과를 지우고(판 끝까지 안 간 것처럼) 방장 돈을 부풀린다.
    forgeHostViews(host, (v) => {
      if (v.phase === "roundEnd") return null;
      if (v.phase !== "gameOver") return v;
      const money = [...(v.money as number[])];
      money[0] = (money[0] ?? 0) + 100;
      return { ...v, result: null, money };
    });
    await playUntil(
      host,
      guests,
      () => host.match?.current().phase === "roundEnd",
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
    const { host, guests, clock } = await setup(presetRules("standard5"), 1);
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    // 방장이 판 끝 열쇠를 숨긴 것과 같다: 참가자 기기에서 첫 판 패가 끝내 열리지 않는다.
    neverOpens(guests[0] as GuestRoom, 1);
    await playUntil(
      host,
      guests,
      () => host.match?.current().phase === "roundEnd",
    );
    expect(host.match?.current().roundNumber).toBe(1);
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
