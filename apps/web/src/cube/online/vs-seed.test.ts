import type { BotLevel } from "@game/cube-ai";
import { applyMove, parseMoves } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { runUntil } from "@/net/race/race-fixture";
import { botSeed, planHere } from "./bot-racer";
import { partyCheckpoints } from "./party";
import { CubeRoom, TIME_LIMIT_SEC } from "./room";
import { seededRace } from "./vs-seed";

/**
 * 화면 시험이 정해 두는 섞기 씨앗(`window.__cubeVsSeed`, cube-party.spec.ts). 컴퓨터와 대결 화면과 같은 방(공개값만 정함)으로
 * 섞기와 컴퓨터 계획을 다시 만들어, 화면 시험이 기대는 성질(컴퓨터가 깎는 이정표를 언제 지나는가)이 그대로인지 본다.
 * 해법이나 섞기가 바뀌어 성질이 깨지면 여기서 먼저 드러난다(그때는 씨앗을 다시 고른다)
 */

/** 그 씨앗의 판에서 컴퓨터가 깎는 이정표를 처음 지나는 수(차례·계획 시각, 같은 수에 여럿이면 함께) */
function botLadderPasses(
  seed: string,
  n: number,
  level: BotLevel = "beginner",
): { at: number; ids: string[]; next: number }[] {
  const clock = new ManualClock();
  const room = new CubeRoom({
    clock,
    isHost: true,
    name: "나",
    scrambler: (event, s) => scramble(event, s),
    botPlan: planHere,
    ...seededRace(seed),
    settings: {
      n,
      format: "single",
      inspection: false,
      timeLimitSec: TIME_LIMIT_SEC[n] ?? 300,
      party: "hp",
    },
  });
  room.addBot(level);
  room.startRound();
  runUntil(clock, () => !!room.session()?.snapshot().seed, 10_000, 10);
  const session = room.session();
  const raceSeed = session?.snapshot().seed as string;
  let state = session?.startState() as PuzzleState;
  room.dispose();
  const plan = planHere(level, n, state, botSeed(raceSeed, "bot1")) as Awaited<
    ReturnType<typeof planHere>
  >;
  const seen = new Set<string>();
  const out: { at: number; ids: string[]; next: number }[] = [];
  plan.moves.forEach((m, i) => {
    state = applyMove(n, state, parseMoves(n, m.move)[0] as never);
    const ids = partyCheckpoints(n, state).filter((x) => !seen.has(x));
    for (const x of ids) seen.add(x);
    const next = plan.moves[i + 1]?.at ?? Number.POSITIVE_INFINITY;
    if (ids.length > 0) out.push({ at: m.at, ids, next });
  });
  return out;
}

/** cube-party.spec.ts가 쓰는 씨앗(바꾸면 함께 바꾼다) */
const VS_SEEDS = {
  /** 2×2 입문: 첫 층과 윗면을 따로(11초쯤 떨어져) 지난다 */
  apart2: "hp-2",
  /** 2×2 입문: 윗면을 건너뛰어 한 수에 첫 층·윗면을 함께 지난다 */
  skip2: "hp-13",
  /** 3×3 입문: 일곱 이정표를 모두 따로(2초 넘게 떨어져) 지난다 */
  apart3: "hp-1",
} as const;

describe("화면 시험의 섞기 씨앗", () => {
  it("2×2 따로 지나는 씨앗: 첫 층과 윗면을 다른 수에서, 2초 넘게 떨어져 지난다", () => {
    const passes = botLadderPasses(VS_SEEDS.apart2, 2);
    expect(passes.map((p) => p.ids)).toEqual([["layer1"], ["oll"]]);
    expect(
      (passes[1]?.at as number) - (passes[0]?.at as number),
    ).toBeGreaterThan(2_000);
  });

  it("2×2 건너뛰는 씨앗: 한 수에 첫 층·윗면을 함께 지나고, 0.6초 안에 다음 수를 둔다", () => {
    const passes = botLadderPasses(VS_SEEDS.skip2, 2);
    expect(passes.map((p) => p.ids)).toEqual([["layer1", "oll"]]);
    // 화면은 컴퓨터의 다음 수가 와야 그 시각의 판정이 확실해진다: 1초 안에 와야 「50」이 먼저 보인다
    expect(
      (passes[0]?.next as number) - (passes[0]?.at as number),
    ).toBeLessThan(600);
  });

  it("3×3 씨앗: 일곱 이정표를 모두 다른 수에서, 2초 넘게 떨어져 지난다", () => {
    const passes = botLadderPasses(VS_SEEDS.apart3, 3);
    expect(passes).toHaveLength(7);
    for (let k = 1; k < passes.length; k++)
      expect(
        (passes[k]?.at as number) - (passes[k - 1]?.at as number),
      ).toBeGreaterThan(2_000);
  });

  it("같은 씨앗이면 공개값이 늘 같다", () => {
    const a = seededRace("x").random;
    const b = seededRace("x").random;
    expect([a(), a()]).toEqual([b(), b()]);
    expect(seededRace("y").raceTag()).not.toBe(seededRace("x").raceTag());
  });
});
