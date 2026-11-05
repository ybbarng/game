import { invertMoves, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import {
  addChallenge,
  bestScore,
  CHALLENGE_KEY,
  type ChallengeEntry,
  challengeScore,
  limitFor,
  loadChallenges,
  loadPick,
  MoveCounter,
  type SessionLimit,
  savePick,
  stageCount,
} from "./challenge";
import { RECORDS_KEY, type SolveRecord } from "./records";
import { type SessionCue, SolveSession } from "./solve-session";

const SCRAMBLE = "R U F' D2";
const TIME: SessionLimit = { kind: "time", startMs: 60_000, refillMs: 10_000 };

function setup(limit: SessionLimit, scramble = SCRAMBLE) {
  const clock = new ManualClock();
  const cues: SessionCue[] = [];
  const records: SolveRecord[] = [];
  const s = new SolveSession({
    n: 3,
    mode: "solo",
    inspection: true,
    clock,
    onCue: (c) => cues.push(c),
    onRecord: (r) => records.push(r),
  });
  s.start(scramble, 7, limit);
  const type = (text: string) => {
    for (const m of parseMoves(3, text)) s.input(m, text);
  };
  const solveMoves = invertMoves(parseMoves(3, scramble));
  return { clock, cues, records, s, type, solveMoves };
}

/** 지금까지 채운 시간(칩 하나에 한 번, 다 맞춘 순간은 빼고) */
function refilled(s: SolveSession): number {
  return s.refills * (TIME.kind === "time" ? TIME.refillMs : 0);
}

describe("제한 도전: 시간 체력", () => {
  it("살펴보기·큐브 돌리기 동안은 줄지 않고, 첫 면 돌리기부터 줄어든다", () => {
    const { clock, s, type } = setup(TIME);
    expect(s.phase).toBe("inspect");
    expect(s.hpLeft()).toBe(60_000);
    clock.advance(5_000);
    type("y");
    expect(s.hpLeft()).toBe(60_000);
    type("L");
    expect(s.phase).toBe("solving");
    clock.advance(3_000);
    expect(s.hpLeft()).toBe(60_000 - 3_000 + refilled(s));
  });

  it("0이 되면 끝: 「시간이 다함」 DNF, 남은 체력 0, 기록이 하나 생긴다", () => {
    const { clock, cues, records, s, type } = setup(TIME);
    type("L");
    const left = s.hpLeft() ?? 0;
    clock.advance(left - 1);
    expect(s.phase).toBe("solving");
    clock.advance(1);
    expect(s.phase).toBe("done");
    expect(s.result).toMatchObject({ ms: null, dnfReason: "time" });
    expect(s.hpLeft()).toBe(0);
    expect(s.playedMs).toBe(left);
    expect(cues).toContain("dnf");
    expect(records).toHaveLength(1);
    // 끝난 뒤 수를 두어도 체력·결과는 그대로
    type("R");
    expect(s.result?.dnfReason).toBe("time");
  });

  it("이정표 칩마다 채운다(같은 순간 여러 이정표는 한 번), 다 맞춘 수는 채우지 않는다", () => {
    const { clock, s, solveMoves } = setup(TIME);
    let expected = 60_000;
    let chips = 0;
    for (const [i, m] of solveMoves.entries()) {
      clock.advance(1_000);
      if (i > 0) expected -= 1_000;
      s.input(m, "");
      const nowChips = stageCount(s.splits);
      if (s.phase !== "done" && nowChips > chips) expected += 10_000;
      chips = nowChips;
    }
    expect(s.phase).toBe("done");
    expect(s.result?.ms).toBe(3_000);
    // 다 맞추기 전에 지난 칩이 있어 채움이 실제로 일어났다
    expect(s.refills).toBeGreaterThan(0);
    expect(s.refills).toBe(Math.max(0, chips - 1));
    expect(s.hpLeft()).toBe(expected);
    // 끝난 뒤 시간이 흘러도 남은 체력은 그대로
    clock.advance(30_000);
    expect(s.hpLeft()).toBe(expected);
  });

  it("살펴보기 15초를 넘겨 시작하면(+2) 체력에서 2초를 뺀다", () => {
    const { clock, s, type } = setup(TIME);
    clock.advance(15_500);
    type("L");
    expect(s.result).toBeNull();
    expect(s.hpLeft()).toBe(58_000 + refilled(s));
  });

  it("살펴보기 17초를 넘기면 체력과 상관없이 DNF(살펴보기)", () => {
    const { clock, s } = setup(TIME);
    clock.advance(17_000);
    expect(s.result?.dnfReason).toBe("inspection");
    expect(s.hpLeft()).toBe(0);
  });

  it("20% 아래로 내려가면 경고를 한 번 낸다", () => {
    const { clock, cues, s, type } = setup(TIME);
    type("L");
    const left = s.hpLeft() ?? 0;
    clock.advance(left - 12_001);
    expect(cues).not.toContain("low");
    clock.advance(1);
    expect(cues.filter((c) => c === "low")).toHaveLength(1);
    clock.advance(5_000);
    expect(cues.filter((c) => c === "low")).toHaveLength(1);
  });
});

describe("제한 도전: 수 체력", () => {
  it("세는 법은 십자 훈련과 같다: 이어 돌리면 한 수, 지우면 돌려받고, 큐브 돌리기 0, 가운데 층 2", () => {
    const c = new MoveCounter();
    const push = (t: string) => {
      for (const m of parseMoves(3, t)) c.push(m, /^[xyz]/.test(t), 3);
    };
    push("R");
    push("R");
    expect(c.count).toBe(1);
    push("R'");
    push("R'");
    expect(c.count).toBe(0);
    push("y");
    expect(c.count).toBe(0);
    push("M");
    expect(c.count).toBe(2);
    push("U");
    expect(c.count).toBe(3);
  });

  it("체력을 넘는 수를 두면 끝, 딱 맞게 쓰는 것은 괜찮다. 되돌리기는 돌려받는다", () => {
    const { cues, records, s, type } = setup({ kind: "moves", budget: 3 });
    expect(s.hpLeft()).toBe(3);
    type("L");
    type("B");
    expect(s.hpLeft()).toBe(1);
    expect(cues).not.toContain("low");
    s.undo();
    expect(s.hpLeft()).toBe(2);
    type("B");
    type("L");
    expect(s.hpLeft()).toBe(0);
    expect(cues).toContain("low");
    expect(s.phase).toBe("solving");
    type("L"); // 같은 층을 이어 돌리면 합쳐져 체력이 그대로
    expect(s.phase).toBe("solving");
    type("U");
    expect(s.phase).toBe("done");
    expect(s.result).toMatchObject({ ms: null, dnfReason: "moves" });
    expect(records).toHaveLength(1);
  });

  it("마지막 남은 수로 맞추면 성공(남은 0)", () => {
    const { s, solveMoves } = setup({ kind: "moves", budget: 4 });
    for (const m of solveMoves) s.input(m, "");
    expect(s.phase).toBe("done");
    expect(s.result?.ms).not.toBeNull();
    expect(s.hpLeft()).toBe(0);
    expect(s.limitMoves).toBe(4);
  });

  it("짧은 풀이 + 여유. 짧은 풀이를 못 구하면 신의 수 근처 값", () => {
    expect(limitFor(3, "moves", "normal", 19)).toEqual({
      kind: "moves",
      budget: 99,
    });
    expect(limitFor(3, "moves", "hard", null)).toEqual({
      kind: "moves",
      budget: 70,
    });
    expect(limitFor(2, "moves", "easy", 8)).toEqual({
      kind: "moves",
      budget: 68,
    });
    expect(limitFor(3, "time", "normal", null)).toEqual({
      kind: "time",
      startMs: 60_000,
      refillMs: 10_000,
    });
  });

  it("체력 없는 보통 판은 그대로(체력 값 없음, 넘어도 끝나지 않음)", () => {
    const clock = new ManualClock();
    const s = new SolveSession({
      n: 3,
      mode: "solo",
      inspection: false,
      clock,
    });
    s.start(SCRAMBLE);
    for (const t of ["L", "B", "L", "B", "L"])
      for (const m of parseMoves(3, t)) s.input(m, t);
    clock.advance(600_000);
    expect(s.hpLeft()).toBeNull();
    expect(s.phase).toBe("solving");
  });
});

describe("제한 도전: 점수", () => {
  it("단계 × 100 + 남은 체력(시간 0.1초에 1점, 수 한 수에 10점)", () => {
    expect(challengeScore("time", 7, 23_456)).toBe(934);
    expect(challengeScore("moves", 8, 12)).toBe(920);
    expect(challengeScore("time", 3, 0)).toBe(300);
  });

  it("같은 순간에 켜진 이정표는 한 단계", () => {
    expect(
      stageCount([
        { id: "cross", ms: 1_000 },
        { id: "f2l1", ms: 2_000 },
        { id: "layer1", ms: 5_000 },
        { id: "f2l2", ms: 5_000 },
      ]),
    ).toBe(3);
  });
});

function memory(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    map,
  };
}

const entry = (over: Partial<ChallengeEntry> = {}): ChallengeEntry => ({
  at: 1,
  n: 3,
  kind: "time",
  level: "normal",
  ok: true,
  score: 900,
  stages: 7,
  left: 20_000,
  ms: 50_000,
  moves: 60,
  budget: 60_000,
  scramble: SCRAMBLE,
  ...over,
});

describe("제한 도전: 저장(cube.challenge.v1)", () => {
  it("새것이 앞, 같은 크기·체력·어려움끼리 최고 점수", () => {
    const st = memory();
    addChallenge(entry({ at: 1, score: 900 }), st);
    addChallenge(entry({ at: 2, score: 700, level: "hard" }), st);
    const list = addChallenge(entry({ at: 3, score: 800 }), st);
    expect(list.map((e) => e.at)).toEqual([3, 2, 1]);
    expect(loadChallenges(st).map((e) => e.at)).toEqual([3, 2, 1]);
    expect(bestScore(list, { n: 3, kind: "time", level: "normal" })).toBe(900);
    expect(bestScore(list, { n: 3, kind: "time", level: "hard" })).toBe(700);
    expect(bestScore(list, { n: 2, kind: "time", level: "normal" })).toBeNull();
  });

  it("깨진 저장·모르는 칸·옛 꼴과 섞여도 읽히고, 혼자 맞추기 기록은 건드리지 않는다", () => {
    const solo = JSON.stringify({
      "solo-3": [{ at: 1, n: 3, ms: 1, moves: 1 }],
    });
    const st = memory({
      [RECORDS_KEY]: solo,
      [CHALLENGE_KEY]: JSON.stringify({
        version: 1,
        future: "keep",
        entries: [
          entry({ at: 5 }),
          { at: "x" },
          null,
          { ...entry({ at: 4 }), extra: 1 },
        ],
        pick: { n: 9, kind: "time", level: "normal" },
      }),
    });
    expect(loadChallenges(st).map((e) => e.at)).toEqual([5, 4]);
    // 고를 수 없는 크기는 기본으로
    expect(loadPick(st)).toEqual({ n: 3, kind: "time", level: "normal" });
    savePick({ n: 2, kind: "moves", level: "hard" }, st);
    expect(loadPick(st)).toEqual({ n: 2, kind: "moves", level: "hard" });
    addChallenge(entry({ at: 6 }), st);
    const saved = JSON.parse(st.map.get(CHALLENGE_KEY) ?? "{}");
    expect(saved.future).toBe("keep");
    expect(saved.entries[2].extra).toBe(1);
    expect(st.map.get(RECORDS_KEY)).toBe(solo);
    expect(loadChallenges(memory({ [CHALLENGE_KEY]: "{" }))).toEqual([]);
  });
});
