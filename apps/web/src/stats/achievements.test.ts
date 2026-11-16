import { describe, expect, it } from "vitest";

import { badukStats } from "@/baduk/kit";
import { baseballStats } from "@/baseball/kit";
import { chessStats } from "@/chess/kit";
import { galaxyStats } from "@/galaxy/kit";
import type { MightyRound } from "@/game/mighty-stats";
import { mightyStats } from "@/game/mighty-stats";
import { gostopStats } from "@/gostop/kit";
import { type HeartsGame, heartsStats } from "@/hearts/stats";
import { janggiStats } from "@/janggi/kit";
import { minhwatuStats } from "@/minhwatu/stats";
import { nyrongppongStats } from "@/nyrongppong/kit";
import { type OmokRound, omokStats } from "@/omok/kit";
import { onecardStats } from "@/onecard/kit";
import { yutStats } from "@/yut/kit";

import { achievementsOf } from "./achievements";
import { longestStreak, matchKey, resultsOf } from "./outcome";
import type { GameRecord, RoundRecord, StatsMode } from "./records";

const ALL = {
  mighty: mightyStats,
  hearts: heartsStats,
  omok: omokStats,
  janggi: janggiStats,
  chess: chessStats,
  baduk: badukStats,
  baseball: baseballStats,
  yut: yutStats,
  galaxy: galaxyStats,
  gostop: gostopStats,
  nyrongppong: nyrongppongStats,
  onecard: onecardStats,
  minhwatu: minhwatuStats,
};

const T0 = Date.UTC(2026, 10, 1);

/** 오목 판 기록(차례대로 1분 간격) */
function omok(
  outcomes: OmokRound["outcome"][],
  extra: Partial<OmokRound> = {},
  mode: StatsMode = "solo",
): RoundRecord[] {
  return outcomes.map((outcome, i) => ({
    id: `${mode}:7:${i + 1}`,
    game: "omok",
    at: T0 + i * 60_000,
    mode,
    data: {
      stone: "black",
      outcome,
      by: outcome === "draw" ? "draw" : "five",
      moves: 40,
      ...extra,
    } satisfies OmokRound,
  }));
}

function earned(
  spec: (typeof ALL)[keyof typeof ALL],
  rounds: RoundRecord[],
  games: GameRecord[] = [],
): string[] {
  return achievementsOf(spec, { rounds, games })
    .filter((a) => a.earned)
    .map((a) => a.id);
}

describe("승패 맞추기", () => {
  it("판 기록 id에서 대국 키를 떼어 낸다(방 코드에 쌍점이 있어도 마지막 판 번호만)", () => {
    expect(matchKey("online:ab12:3")).toBe("online:ab12");
    expect(matchKey("solo:31:12")).toBe("solo:31");
  });

  it("마이티에서 죽어 빠진 판은 승패에 넣지 않는다", () => {
    const base = { won: false, multipliers: [] } as unknown as MightyRound;
    const rounds: RoundRecord[] = [
      { ...rec("mighty", 1), data: { ...base, role: "out" } },
      { ...rec("mighty", 2), data: { ...base, role: "friend", won: true } },
    ];
    expect(
      resultsOf(mightyStats.result, { rounds, games: [] }).map(
        (r) => r.outcome,
      ),
    ).toEqual(["win"]);
  });

  it("하트는 게임으로 세고, 그만둔 게임은 넣지 않는다", () => {
    const game = (won: boolean, retired: boolean): GameRecord => ({
      id: `solo:${won}${retired}`,
      game: "hearts",
      at: T0,
      mode: "solo",
      data: { rounds: 5, score: 40, rank: 1, won, retired } as HeartsGame,
    });
    const results = resultsOf(heartsStats.result, {
      rounds: [],
      games: [game(true, false), game(false, true), game(false, false)],
    });
    expect(results.map((r) => r.outcome)).toEqual(["win", "loss"]);
  });

  it("가장 긴 연승은 비기거나 지면 끊긴다", () => {
    const results = resultsOf(omokStats.result, {
      rounds: omok(["win", "win", "draw", "win", "win", "win", "loss", "win"]),
      games: [],
    });
    expect(longestStreak(results)).toBe(3);
  });
});

describe("모든 게임에 같은 업적", () => {
  it("첫 승은 처음 이긴 판이 생기면 받는다", () => {
    expect(earned(omokStats, omok(["loss", "draw"]))).not.toContain(
      "first-win",
    );
    expect(earned(omokStats, omok(["loss", "win"]))).toContain("first-win");
  });

  it("5연승은 다섯 판을 내리 이겨야 받고, 중간에 비기면 처음부터 센다", () => {
    const broken = earned(
      omokStats,
      omok(["win", "win", "win", "draw", "win", "win"]),
    );
    expect(broken).toContain("streak-3");
    expect(broken).not.toContain("streak-5");
    expect(earned(omokStats, omok(Array(5).fill("win")))).toContain("streak-5");
  });

  it("10연승은 열 판, 열 판은 끝낸 판이 열이면 받는다", () => {
    const ten = earned(omokStats, omok(Array(10).fill("win")));
    expect(ten).toEqual(
      expect.arrayContaining(["streak-10", "played-10", "first-win"]),
    );
    const nine = earned(omokStats, omok(Array(9).fill("win")));
    expect(nine).not.toContain("streak-10");
    expect(nine).not.toContain("played-10");
  });

  it("친구와 첫 승은 친구와 하기에서 이긴 판만 센다", () => {
    expect(earned(omokStats, omok(["win"]))).not.toContain("online-win");
    expect(earned(omokStats, omok(["win"], {}, "online"))).toContain(
      "online-win",
    );
  });

  it("기록에서 다시 계산하므로 판 차례가 섞여 들어와도 시각 차례로 센다", () => {
    const rounds = omok(Array(3).fill("win")).reverse();
    expect(earned(omokStats, rounds)).toContain("streak-3");
  });
});

describe("게임만의 업적", () => {
  it("마이티 첫 런은 런으로 이긴 판이 있으면 받는다(진 판의 런은 세지 않는다)", () => {
    const round = (won: boolean): RoundRecord => ({
      ...rec("mighty", 1),
      data: {
        role: "declarer",
        won,
        multipliers: ["run"],
        friend: "card",
        goal: { kiruda: "spade", score: 14 },
      } as unknown as MightyRound,
    });
    expect(earned(mightyStats, [round(false)])).not.toContain("run");
    expect(earned(mightyStats, [round(true)])).toContain("run");
  });

  it("오목 번개 오목은 돌 스무 개 안에 다섯을 이어 이긴 판이다", () => {
    expect(earned(omokStats, omok(["win"], { moves: 19 }))).toContain(
      "fast-five",
    );
    expect(earned(omokStats, omok(["win"], { moves: 20 }))).not.toContain(
      "fast-five",
    );
    expect(
      earned(omokStats, omok(["win"], { moves: 9, by: "resign" })),
    ).not.toContain("fast-five");
  });

  it("하트 문 슛은 내가 문 슛을 한 판이 있으면 받는다", () => {
    const round = (moon: "me" | "other" | null): RoundRecord => ({
      ...rec("hearts", 1),
      data: { points: 0, moon, total: 0, tricks: 13, queen: true },
    });
    expect(earned(heartsStats, [round("other")])).not.toContain("moon");
    expect(earned(heartsStats, [round("me")])).toContain("moon");
  });
});

describe("업적 정의", () => {
  it.each(Object.entries(ALL))(
    "%s: 이름표가 겹치지 않고, 설명은 마침표로 끝나며, 게임만의 업적이 둘 이상이다",
    (_game, spec) => {
      const list = achievementsOf(spec, { rounds: [], games: [] });
      const ids = list.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const a of list) expect(a.text).toMatch(/\.$/);
      expect(spec.achievements.length).toBeGreaterThanOrEqual(2);
      // 기록이 없으면 아무것도 받지 않았다.
      expect(list.filter((a) => a.earned)).toEqual([]);
    },
  );
});

function rec(game: string, n: number): Omit<RoundRecord, "data"> {
  return { id: `solo:1:${n}`, game, at: T0 + n, mode: "solo" };
}
