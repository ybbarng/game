import { type CubeMove, parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { PRACTICE_N, type Problem } from "./problem";
import { ROUND_SIZE } from "./round";
import { stageById } from "./stages";
import type { PracticeStage } from "./types";
import {
  applyVersus,
  peekVersus,
  ruleOk,
  trackOf,
  type VersusState,
  versusAt,
  versusBoard,
  versusOver,
  versusProblems,
  versusProgress,
  versusStart,
  versusSummary,
} from "./versus";
import {
  checkVersusBotRun,
  VERSUS_BOT_SPEED,
  versusBotLevel,
  versusBotPlan,
} from "./versus-bot";

const mv = (t: string): CubeMove => parseMoves(PRACTICE_N, t)[0] as CubeMove;
const stage = (id: string) => stageById(id) as PracticeStage;

/** 지금 문제의 공식을 끝까지 친다 */
function typeProblem(state: VersusState): VersusState {
  const board = versusBoard(trackOf(state));
  let s = state;
  for (const t of board?.tokens ?? []) s = applyVersus(s, mv(t));
  return s;
}

describe("같은 문제", () => {
  it("같은 씨앗이면 누구나 같은 10문제를 같은 차례로 받는다", () => {
    for (const id of ["beginner-second", "beginner-cross", "oll"]) {
      const a = versusProblems(stage(id), 12345);
      const b = versusProblems(stage(id), 12345);
      expect(a).toHaveLength(ROUND_SIZE);
      expect(b).toEqual(a);
      // 시작 모양도 같다
      const sa = versusStart(stage(id), "follow", a);
      const sb = versusStart(stage(id), "follow", b);
      expect([...sb.perm]).toEqual([...sa.perm]);
    }
  });

  it("공식은 모두에게 자료의 첫 공식이고 윗면 돌리기를 붙이지 않는다", () => {
    const s = stage("oll");
    for (const p of versusProblems(s, 7)) {
      const c = s.cases.find((x) => x.id === p.caseId);
      expect(p.preAuf).toBe("");
      expect(p.alg).toBe(c?.algs[0]);
    }
  });

  it("씨앗이 다르면 다른 차례", () => {
    const a = versusProblems(stage("oll"), 1).map((p) => p.caseId);
    const b = versusProblems(stage("oll"), 2).map((p) => p.caseId);
    expect(b).not.toEqual(a);
  });

  it("방 규칙 확인: 아는 단계, 보고 치기만 mode", () => {
    expect(ruleOk({ stage: "beginner-second" })).toBe(true);
    expect(ruleOk({ stage: "pll", mode: "see" })).toBe(true);
    expect(ruleOk({ stage: "nope" })).toBe(false);
    expect(ruleOk({ stage: "pll", mode: "follow" })).toBe(false);
    expect(ruleOk(null)).toBe(false);
  });
});

describe("따라 치기 진행", () => {
  const problems = versusProblems(stage("beginner-second"), 99);

  it("10문제를 모두 치면 끝, 정확도 100%·콤보 10", () => {
    let s = versusStart(stage("beginner-second"), "follow", problems);
    for (let k = 0; k < ROUND_SIZE; k++) {
      expect(trackOf(s).index).toBe(k);
      s = typeProblem(s);
    }
    const t = trackOf(s);
    expect(versusOver(t)).toBe(true);
    expect(versusProgress(t)).toBe(1);
    expect(versusSummary(t)).toEqual({
      accuracy: 1,
      bestCombo: 10,
      solved: 10,
    });
    expect(() => applyVersus(s, mv("U"))).toThrow();
  });

  it("틀린 수는 큐브에 들지 않고, 틀림·콤보 끊김으로 센다", () => {
    let s = versusStart(stage("beginner-second"), "follow", problems);
    s = typeProblem(s);
    expect(trackOf(s).combo).toBe(1);
    const before = [...s.perm];
    const first = versusBoard(trackOf(s))?.tokens[0] as string;
    const wrong = first.startsWith("B") ? "D" : "B";
    s = applyVersus(s, mv(wrong));
    const t = trackOf(s);
    expect([...s.perm]).toEqual(before);
    expect(t.misses).toBe(1);
    expect(t.combo).toBe(0);
    expect(t.wrong).toBe(0);
    expect(versusAt(t)).toBe(0);
    // 그 자리에서 다시 치면 이어 간다. 틀린 문제는 콤보를 잇지 않는다
    s = typeProblem(s);
    expect(trackOf(s).index).toBe(2);
    expect(trackOf(s).combo).toBe(0);
    expect(trackOf(s).best).toBe(1);
    // 정확도 = 맞은 수 / 친 수(틀린 수 포함)
    const hits = trackOf(s).hits;
    expect(hits).toBe(
      [0, 1].reduce(
        (n, k) => n + (versusBoard(trackOf(s), k)?.tokens.length ?? 0),
        0,
      ),
    );
    expect(versusSummary(trackOf(s)).accuracy).toBeCloseTo(hits / (hits + 1));
  });

  it("반 바퀴를 나눠 치다 틀리면 먼저 넣은 반쪽도 되돌린다", () => {
    const edges = stage("beginner-edges");
    const c = edges.cases[0];
    const p: Problem = {
      caseId: c?.id as string,
      alg: c?.algs[0] as string,
      preAuf: "",
    };
    let s = versusStart(edges, "follow", [p]);
    const tokens = versusBoard(trackOf(s))?.tokens ?? [];
    const half = tokens.indexOf("U2");
    expect(half).toBeGreaterThan(0);
    for (const t of tokens.slice(0, half)) s = applyVersus(s, mv(t));
    const before = [...s.perm];
    s = applyVersus(s, mv("U"));
    expect([...s.perm]).not.toEqual(before);
    const jumps = trackOf(s).jumps;
    s = applyVersus(s, mv("R"));
    expect([...s.perm]).toEqual(before);
    expect(trackOf(s).jumps).toBe(jumps + 1);
    // 나눠 쳐도 맞다
    s = applyVersus(s, mv("U"));
    s = applyVersus(s, mv("U"));
    for (const t of tokens.slice(half + 1)) s = applyVersus(s, mv(t));
    expect(versusOver(trackOf(s))).toBe(true);
  });
});

describe("보고 치기 진행", () => {
  const problems = versusProblems(stage("beginner-yellow-cross"), 5);

  it("목표 모양이 되면 다음 문제, 펼친 문제는 콤보에서 빠진다", () => {
    let s = versusStart(stage("beginner-yellow-cross"), "see", problems);
    s = typeProblem(s);
    expect(trackOf(s).index).toBe(1);
    expect(trackOf(s).combo).toBe(1);
    s = peekVersus(s);
    expect(() => peekVersus(s)).toThrow();
    s = typeProblem(s);
    const t = trackOf(s);
    expect(t.index).toBe(2);
    expect(t.combo).toBe(0);
    expect(t.peeks).toBe(1);
    expect(versusSummary(t).accuracy).toBe(0.5);
  });

  it("따라 치기에서는 펼칠 수 없다", () => {
    const s = versusStart(stage("beginner-yellow-cross"), "follow", problems);
    expect(() => peekVersus(s)).toThrow();
  });
});

describe("컴퓨터", () => {
  const second = stage("beginner-second");
  const start = versusStart(second, "follow", versusProblems(second, 3));

  it("단계 이름은 기존 컴퓨터 대결의 단계 글을 따른다", () => {
    expect(versusBotLevel("3:novice")).toBe("novice");
    expect(versusBotLevel("3:pro")).toBe("pro");
    expect(versusBotLevel("3:fit:60000")).toBe("casual");
    expect(versusBotLevel("9:pro")).toBeNull();
  });

  it("계획은 씨앗이 같으면 같고, 끝까지 치면 10문제를 다 친다", () => {
    const a = versusBotPlan(start, VERSUS_BOT_SPEED.casual, 42);
    expect(versusBotPlan(start, VERSUS_BOT_SPEED.casual, 42)).toEqual(a);
    let s = start;
    for (const m of a) s = applyVersus(s, mv(m.move));
    expect(versusOver(trackOf(s))).toBe(true);
    // 시각은 거꾸로 가지 않는다
    for (let k = 1; k < a.length; k++)
      expect(a[k]?.at).toBeGreaterThanOrEqual(a[k - 1]?.at as number);
  });

  it("단계가 높을수록 빨리 끝내고 덜 틀린다", () => {
    const end = (lv: keyof typeof VERSUS_BOT_SPEED) => {
      const plan = versusBotPlan(start, VERSUS_BOT_SPEED[lv], 8);
      let s = start;
      for (const m of plan) s = applyVersus(s, mv(m.move));
      return { at: plan.at(-1)?.at as number, misses: trackOf(s).misses };
    };
    const levels = ["novice", "casual", "club", "fast", "pro"] as const;
    const ends = levels.map(end);
    for (let k = 1; k < ends.length; k++)
      expect(ends[k]?.at).toBeLessThan(ends[k - 1]?.at as number);
    expect(ends[4]?.misses).toBeLessThan(ends[0]?.misses as number);
  });

  it("보고 치기 계획도 끝까지 간다(틀린 수는 거꾸로 되돌린다)", () => {
    const y = stage("beginner-yellow-cross");
    const s0 = versusStart(y, "see", versusProblems(y, 4));
    const plan = versusBotPlan(s0, VERSUS_BOT_SPEED.novice, 11);
    let s = s0;
    for (const m of plan) s = applyVersus(s, mv(m.move));
    expect(versusOver(trackOf(s))).toBe(true);
  });

  it("계획 맞춰 보기: 늦게 시작한 만큼 미룬 것은 받고, 계획보다 빠르거나 다른 수는 걸린다", () => {
    const plan = versusBotPlan(start, VERSUS_BOT_SPEED.club, 1);
    const log = plan.map((p) => ({ m: p.move, t: p.at + 250 }));
    expect(checkVersusBotRun(plan, log, true)).toBe(true);
    expect(checkVersusBotRun(plan, log.slice(0, 5), false)).toBe(true);
    expect(checkVersusBotRun(plan, log.slice(0, 5), true)).toBe(false);
    const faster = log.map((x, k) => (k > 10 ? { ...x, t: x.t - 100 } : x));
    expect(checkVersusBotRun(plan, faster, true)).toBe(false);
    const other = log.map((x, k) => (k === 3 ? { ...x, m: "B2" } : x));
    expect(checkVersusBotRun(plan, other, true)).toBe(false);
  });
});
