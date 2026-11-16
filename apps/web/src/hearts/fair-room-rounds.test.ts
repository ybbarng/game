// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AuditResult } from "@/net/guest-room";
import type { ArchiveSource } from "@/review/recorder";
import { replayArchive } from "@/review/replay";

import { playUntil, scoredRounds, setup, until } from "./fair-room-fixture";
import { heartsKit } from "./kit";

/**
 * 판이 바뀌어도 이어 가는지(두 판)와 복기. 판을 잇는 것은 방장 기기와 판 번호의 일이라 손님 하나로 본다(손님끼리
 * 넘긴 카드 열쇠는 fair-room.test.ts가 손님 둘로 본다). 끝 점수 27점이라 첫 판에는 게임이 끝나지 않고, 두 판을
 * 둔 뒤 방장이 끝낸다(게임 끝까지 두면 판 수가 섞기 운에 달린다)
 */
describe("하트 멘탈 포커 온라인 대전", () => {
  it("두 판을 이어 두며 판마다 모두가 다시 계산해 확인하고, 방장 기록을 다시 돌리면 실제 카드로 같은 판이 나온다", async () => {
    const { host, guests, incidents } = await setup(
      1,
      undefined,
      undefined,
      27,
    );
    const verified: number[] = [];
    for (const g of guests) g.on("roundVerified", (d) => verified.push(d));
    const audits: AuditResult[] = [];
    for (const g of guests) g.on("audit", (r) => audits.push(r));

    await host.start();
    await until(() => guests.every((g) => g.match !== null));
    const scored = scoredRounds(host);
    await playUntil(
      host as never,
      guests as never,
      () => scored() >= 2,
      incidents,
    );
    expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
      [],
    );
    const rounds = scored();
    expect(rounds).toBe(2);
    void host.finish();
    await until(() => audits.length === guests.length);
    expect(audits.filter((a) => !a.ok)).toEqual([]);
    // 판마다 검증은 판 끝 기록을 받은 뒤 비동기로 끝난다.
    await until(() => verified.length >= rounds * guests.length);
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
      // 두 판 뒤 방장이 끝냈다(점수로 끝난 게임이 아니다)
      over: false,
    });
    expect(replayed.error).toBeNull();
    // 두 판 모두 실제 카드로 다시 돈다.
    const scoredAt = replayed.events.flatMap((list, i) =>
      (list as { type: string }[]).some((x) => x.type === "roundScored")
        ? [i]
        : [],
    );
    expect(scoredAt.length).toBe(2);
    for (const at of scoredAt) {
      const scoredState = replayed.states[at] as {
        round: { tricks: { plays: { card: string }[] }[] };
      };
      expect(
        scoredState.round.tricks
          .flatMap((tr) => tr.plays)
          .every((p) => !p.card.startsWith("?_")),
      ).toBe(true);
    }
  });
});
