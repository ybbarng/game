import {
  applyMoves,
  isSolved,
  parseMoves,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { solveHuman } from "./methods";
import { botPlan, botSpeed, levelScale } from "./plan";
import { BOT_LEVELS, type BotSkill, levelText } from "./skill";

/** 속도 흉내: 같은 씨앗이면 같은 계획, 시각은 늘어나기만, 단계별 빠르기 차례, 헛수, 옛 값 */

const level = (l: (typeof BOT_LEVELS)[number]): BotSkill => ({
  kind: "level",
  level: l,
});

/** 계획의 수를 엔진에 두면 마지막 수에서 처음 맞춰진다 */
function solvesAtEnd(
  n: number,
  start: ReturnType<typeof randomCubeState>,
  moves: readonly { move: string }[],
) {
  let state = start;
  moves.forEach((m, i) => {
    state = applyMoves(n, state, parseMoves(n, m.move));
    expect(isSolved(n, state)).toBe(i === moves.length - 1);
  });
}

describe("botPlan", () => {
  const start3 = randomCubeState(3, 11);

  it("같은 씨앗이면 수와 시각까지 같고, 글로 받아도 같다", () => {
    const a = botPlan(level("fast"), 3, start3, 1);
    expect(botPlan(level("fast"), 3, start3, 1)).toEqual(a);
    expect(botPlan(levelText("fast"), 3, start3, 1)).toEqual(a);
    const b = botPlan(level("fast"), 3, start3, 2);
    expect(b.moves.map((m) => m.at)).not.toEqual(a.moves.map((m) => m.at));
  });

  it("시각은 살펴보기 뒤부터 늘어나기만 하고, 끝 시각은 마지막 수", () => {
    const p = botPlan(level("novice"), 3, start3, 3, { inspectionMs: 15_000 });
    let prev = 15_000;
    for (const m of p.moves) {
      expect(m.at).toBeGreaterThan(prev);
      prev = m.at;
    }
    expect(p.finishAt).toBe(prev);
  });

  it("단계가 높을수록 평균이 빠르다(섞기 셋, 크기마다)", () => {
    for (const n of [2, 3]) {
      const starts = [1, 2, 3].map((s) => randomCubeState(n, s));
      const means = BOT_LEVELS.map(
        (l) =>
          starts.reduce(
            (sum, s, i) => sum + botPlan(level(l), n, s, 5 + i).finishAt,
            0,
          ) / starts.length,
      );
      for (let i = 1; i < means.length; i++)
        expect(means[i]).toBeLessThan(means[i - 1] as number);
    }
  });

  it("3×3 단계 평균이 목표 근처다(섞기 넷, 넉넉히 ±35%)", () => {
    const targets = { novice: 120, casual: 60, club: 35, fast: 18, pro: 10 };
    const starts = [21, 22, 23, 24].map((s) => randomCubeState(3, s));
    for (const l of BOT_LEVELS) {
      const mean =
        starts.reduce(
          (sum, s, i) => sum + botPlan(level(l), 3, s, i).finishAt,
          0,
        ) /
        starts.length /
        1000;
      expect(mean).toBeGreaterThan(targets[l] * 0.65);
      expect(mean).toBeLessThan(targets[l] * 1.35);
    }
  });

  it("공식 단계는 찾는 단계보다 빠르다", () => {
    for (const l of BOT_LEVELS) {
      const s = botSpeed(l, 3);
      expect(s.tps).toBeGreaterThan(s.searchTps);
    }
    // 시간 배율을 곱한다: 배율이 크면 초당 수가 그만큼 낮다
    const k = levelScale("novice", 2);
    expect(botSpeed("novice", 2).tps).toBeCloseTo(2 / k);
  });

  it("초고수도 사람 해법(CFOP)이라 수가 50수를 넘는다", () => {
    const p = botPlan(level("pro"), 3, start3, 1);
    expect(p.stages.map((s) => s.name)).toEqual([
      "cross",
      "f2l-1",
      "f2l-2",
      "f2l-3",
      "f2l-4",
      "oll",
      "pll",
    ]);
    expect(p.moves.length).toBeGreaterThan(50);
  });

  it("입문은 한 단계 안에서도 공식 묶음 사이에 살피며 멈춘다", () => {
    const solve = solveHuman("beginner", 3, start3);
    expect(solve.looks.length).toBeGreaterThan(0);
    const p = botPlan(level("novice"), 3, start3, 9);
    // 헛수가 끼면 차례가 밀리므로 해법의 수만 골라 본다
    const own = p.moves.filter((m) => !m.slip);
    const { lookMs, jitter, form } = botSpeed("novice", 3);
    const minLook = lookMs * (1 - form) * (1 - jitter);
    for (const i of solve.looks) {
      const gap = (own[i]?.at as number) - (own[i - 1]?.at as number);
      expect(gap).toBeGreaterThan(minLook);
    }
  });

  it("입문은 가끔 헛수를 두었다 되돌리고, 그래도 마지막 수에서 맞춰진다. 초고수는 헛수가 없다", () => {
    let slips = 0;
    for (const seed of [1, 2, 3]) {
      const p = botPlan(level("novice"), 3, start3, seed);
      const marked = p.moves.filter((m) => m.slip);
      slips += marked.length;
      expect(marked.length % 2).toBe(0);
      solvesAtEnd(3, start3, p.moves);
      // 헛수를 빼면 해법 그대로
      expect(p.moves.filter((m) => !m.slip).map((m) => m.move)).toEqual(
        solveHuman("beginner", 3, start3).moves,
      );
      // 단계는 헛수까지 넣은 차례로 빈틈없이 이어진다
      let at = 0;
      for (const st of p.stages) {
        expect(st.start).toBe(at);
        at = st.end;
      }
      expect(at).toBe(p.moves.length);
    }
    expect(slips).toBeGreaterThan(0);
    expect(botPlan(level("pro"), 3, start3, 1).moves.some((m) => m.slip)).toBe(
      false,
    );
  });

  it("해법이 다 두기 전에 맞춰지면 계획은 처음 맞춰지는 수에서 끝난다(대결이 거기서 수를 끝낸다)", () => {
    // 2026-11-04 #90 CI의 섞기: 입문 해법은 52수인데 끝이 `… U' U`라 50수째에 맞춰진다
    const start = applyMoves(
      2,
      solvedCube(2),
      parseMoves(2, "R' F' U R F' U2 R2 U' F R U'"),
    );
    const solve = solveHuman("beginner", 2, start);
    expect(solve.moves).toHaveLength(52);
    for (const skill of [
      level("novice"),
      { kind: "legacy", level: "beginner" } as const,
    ]) {
      const p = botPlan(skill, 2, start, 1);
      const own = p.moves.filter((m) => !m.slip);
      expect(own).toHaveLength(50);
      solvesAtEnd(2, start, p.moves);
      expect(p.stages.at(-1)?.end).toBe(p.moves.length);
      expect(p.finishAt).toBe(p.moves.at(-1)?.at);
    }
  });
});

describe("내 실력에 맞춤", () => {
  const starts = [31, 32, 33, 34].map((s) => randomCubeState(3, s));

  it("목표가 단계 목표와 같으면 그 단계 계획과 같다", () => {
    const s = starts[0] as (typeof starts)[number];
    expect(botPlan({ kind: "fit", targetMs: 35_000 }, 3, s, 4)).toEqual(
      botPlan(level("club"), 3, s, 4),
    );
  });

  it("평균이 목표 시간을 따른다(섞기 넷, ±30%)", () => {
    for (const target of [45_000, 25_000, 90_000]) {
      const mean =
        starts.reduce(
          (sum, s, i) =>
            sum + botPlan({ kind: "fit", targetMs: target }, 3, s, i).finishAt,
          0,
        ) / starts.length;
      expect(mean).toBeGreaterThan(target * 0.7);
      expect(mean).toBeLessThan(target * 1.3);
    }
  });
});

describe("옛 단계 값(버전 없는 글)", () => {
  it("옛 표 그대로 계획한다(2026-11-05 전 화면이 낸 값)", () => {
    // 옛 화면(커밋 8691936b)의 botPlan("advanced", 3, randomCubeState(3, 11), 1)
    const p = botPlan("advanced", 3, randomCubeState(3, 11), 1);
    expect(p.moves.slice(0, 3).map((m) => [m.move, m.at])).toEqual(
      LEGACY_FIRST3,
    );
    expect(p.finishAt).toBe(LEGACY_FINISH);
    expect(p.moves.some((m) => m.slip)).toBe(false);
  });

  it("모르는 글은 던진다", () => {
    expect(() => botPlan("9:pro", 3, randomCubeState(3, 1), 1)).toThrow(
      RangeError,
    );
  });
});

// 옛 코드로 낸 값(바꾸지 않는다)
const LEGACY_FIRST3: [string, number][] = [
  ["z2", 491],
  ["U2", 618],
  ["B'", 773],
];
const LEGACY_FINISH = 9663;
