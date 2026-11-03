import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { notationToMove } from "../input/actions";
import { KeyInterpreter } from "../input/interpreter";
import {
  bind,
  type KeyChord,
  type KeyInput,
  notationKeymap,
  twoHandKeymap,
  unbind,
} from "../input/keymaps";
import {
  DrillRound,
  drillPool,
  levelNotations,
  makeQuiz,
  pickWeighted,
  recordAnswer,
  seededRand,
  summarize,
  weakKeys,
  weightOf,
} from "./drill";
import { countMoves, FormulaRun } from "./formula";
import {
  actionRows,
  KEYBOARD_ROWS,
  keyboardCells,
  keyLayers,
  kindOf,
  searchRows,
} from "./layout";
import {
  describeInput,
  keyTextFor,
  MoveMatcher,
  pressesFor,
  pressLabel,
} from "./reach";
import { emptyRecord, loadDrill, loadLearn, saveDrill } from "./storage";
import { StepRun, tutorialSteps } from "./tutorial";

const mv = (n: number, t: string) => {
  const m = notationToMove(n, t);
  if (!m) throw new Error(t);
  return m;
};

const press = (c: KeyChord): KeyInput => ({
  code: c.code,
  shiftKey: !!c.shift,
  altKey: !!c.alt,
  ctrlKey: !!c.ctrl,
  metaKey: false,
  repeat: false,
});

/** 배치에서 그 수를 치는 키 차례를 해석기에 넣어 나온 수들 */
function typed(keymap = twoHandKeymap(), n: number, t: string) {
  const it = new KeyInterpreter(n, keymap);
  const out = [];
  for (const c of pressesFor(keymap, n, t)[0] ?? []) {
    const r = it.handle(press(c));
    if (r?.kind === "move") out.push(r.move);
  }
  return out;
}

describe("키 차례", () => {
  it("배치마다 읽는다", () => {
    expect(keyTextFor(twoHandKeymap(), 3, "R")).toBe("I");
    expect(keyTextFor(twoHandKeymap(), 3, "R'")).toBe("K");
    expect(keyTextFor(notationKeymap(), 3, "R'")).toBe("Shift+R");
    expect(keyTextFor(twoHandKeymap(), 3, "R2")).toBe("I 두 번");
    expect(keyTextFor(notationKeymap(), 4, "2R")).toBe("2 → R");
    expect(keyTextFor(twoHandKeymap(), 4, "2R")).toBe("Shift+I");
    expect(keyTextFor(twoHandKeymap(), 5, "3Rw")).toBe("3 → U");
    expect(keyTextFor(twoHandKeymap(), 3, "undo")).toBe("⌫ / Ctrl+Z");
    expect(keyTextFor(twoHandKeymap(), 3, "2R")).toBeNull();
    expect(pressLabel([{ code: "KeyI" }, { code: "KeyJ" }])).toBe("I → J");
  });

  it("키 차례를 치면 그 수가 된다(모든 단계의 문제)", () => {
    for (const km of [twoHandKeymap(), notationKeymap()])
      for (const [level, n] of [
        ["layers", 3],
        ["inner", 5],
      ] as const)
        for (const t of drillPool(km, level, n)) {
          const m = new MoveMatcher(n, t);
          const results = typed(km, n, t).map((x) => m.feed(x));
          expect(results.at(-1), `${km.preset} ${t}`).toBe("hit");
        }
  });

  it("반 바퀴는 어느 쪽으로든 두 번", () => {
    const m = new MoveMatcher(3, "U2");
    expect(m.feed(mv(3, "U'"))).toBe("partial");
    expect(m.feed(mv(3, "U'"))).toBe("hit");
    expect(m.feed(mv(3, "U"))).toBe("partial");
    expect(m.feed(mv(3, "U'"))).toBe("miss");
    expect(m.feed(mv(3, "U2"))).toBe("hit");
    expect(new MoveMatcher(3, "R").feed(mv(3, "L'"))).toBe("miss");
  });

  it("친 키를 알려 준다", () => {
    const km = twoHandKeymap();
    expect(describeInput(km, 3, press({ code: "KeyK" })).text).toBe(
      "K 키는 「R'」",
    );
    expect(describeInput(km, 3, press({ code: "Quote" })).text).toBe(
      "' 키에는 동작이 없습니다",
    );
    expect(describeInput(km, 3, press({ code: "Digit2" })).text).toContain(
      "쓰지 않음",
    );
  });
});

describe("키보드 그림", () => {
  it("줄마다 너비가 15칸이다(맨 위 Esc 줄 빼고)", () => {
    for (const row of KEYBOARD_ROWS.slice(1))
      expect(row.reduce((a, s) => a + s.width, 0)).toBe(15);
  });

  it("칸에 배치대로 층별 동작이 들어간다", () => {
    const cells = keyboardCells(twoHandKeymap(), 3).flat();
    const r = cells.find((c) => c.code === "KeyR");
    expect(r?.layers.plain?.label).toBe("Lw'");
    expect(r?.hand).toBe("left");
    const i = cells.find((c) => c.code === "KeyI");
    expect(i?.layers.plain).toMatchObject({ label: "R", kind: "face" });
    expect(i?.layers.shift).toMatchObject({ label: "2R", usable: false });
    expect(i?.layers.alt).toMatchObject({ label: "Rw", usable: true });
    expect(i?.hand).toBe("right");
    const n = keyLayers(notationKeymap(), 4, "KeyR");
    expect(n.plain?.label).toBe("R");
    expect(n.shift?.label).toBe("R'");
    expect(n.altShift?.label).toBe("Rw'");
    expect(keyLayers(notationKeymap(), 3, "KeyM").plain?.usable).toBe(true);
    expect(keyLayers(notationKeymap(), 4, "KeyM").plain?.usable).toBe(false);
    expect(cells.find((c) => c.code === "ShiftLeft")?.modifier).toBe(true);
  });

  it("색 묶음", () => {
    expect(kindOf("R'")).toEqual({ kind: "face", face: "R" });
    expect(kindOf("Rw")).toEqual({ kind: "layer" });
    expect(kindOf("M")).toEqual({ kind: "layer" });
    expect(kindOf("depth:3")).toEqual({ kind: "layer" });
    expect(kindOf("y'")).toEqual({ kind: "rotate" });
    expect(kindOf("undo")).toEqual({ kind: "command" });
  });

  it("동작 → 키 목록과 찾기", () => {
    const rows = actionRows(twoHandKeymap(), 3);
    expect(searchRows(rows, "R'").map((r) => r.keys)).toEqual(["K"]);
    expect(searchRows(rows, "R’")[0]?.action).toBe("R'");
    expect(searchRows(rows, "Ri")[0]?.action).toBe("R'");
    expect(searchRows(rows, "되돌리기")[0]?.action).toBe("undo");
    expect(searchRows(rows, "shift+i").length).toBe(0); // 3×3에는 2R이 없다
    expect(
      searchRows(actionRows(twoHandKeymap(), 4), "shift+i")[0]?.action,
    ).toBe("2R");
    expect(searchRows(rows, "").length).toBe(rows.length);
  });
});

describe("조작 훈련", () => {
  it("단계 묶음은 앞 단계를 품고, 배치에 없는 수는 뺀다", () => {
    expect(levelNotations("faces", 3)).toEqual(["R", "L", "U", "D", "F", "B"]);
    expect(levelNotations("layers", 3)).toContain("M'");
    expect(levelNotations("layers", 4)).not.toContain("M");
    expect(levelNotations("inner", 4)).toContain("2R'");
    expect(levelNotations("inner", 5)).toContain("3Rw");
    const km = unbind(twoHandKeymap(), { code: "KeyI" });
    expect(drillPool(km, "faces", 3)).not.toContain("R");
  });

  it("약한 키일수록 무겁고 더 자주 나온다", () => {
    let s = {};
    for (let i = 0; i < 4; i++) s = recordAnswer(s, "R", true, 500);
    for (let i = 0; i < 4; i++) s = recordAnswer(s, "L", i === 0, 2500);
    const stats = s as Record<string, never>;
    expect(weightOf(stats.R)).toBe(1);
    expect(weightOf(undefined)).toBe(1.5);
    expect(weightOf(stats.L)).toBe(1 + 4 * 0.75 + 1);
    const rand = seededRand(7);
    const count = { R: 0, L: 0 };
    for (let i = 0; i < 400; i++)
      count[pickWeighted(["R", "L"], stats, rand) as "R" | "L"]++;
    expect(count.L).toBeGreaterThan(count.R * 3);
    expect(pickWeighted(["R", "L"], stats, () => 0, "R")).toBe("L");
    expect(weakKeys(stats).map((w) => w.action)).toEqual(["L"]);
  });

  it("30수 판: 맞히면 다음, 틀리면 한 번에 못 맞힘으로 남는다", () => {
    const clock = new ManualClock();
    const round = new DrillRound({
      n: 3,
      pool: ["R", "U"],
      stats: {},
      limit: { kind: "count", moves: 3 },
      clock,
      rand: () => 0,
    });
    expect(round.snapshot.phase).toBe("ready");
    expect(round.feed(mv(3, "R"))).toBeNull();
    round.start();
    const first = round.snapshot.prompt;
    clock.advance(800);
    expect(round.feed(mv(3, first === "R" ? "U" : "R"))).toBe("miss");
    expect(round.feed(mv(3, first))).toBe("hit");
    expect(round.snapshot.prompt).not.toBe(first);
    clock.advance(400);
    round.feed(mv(3, round.snapshot.prompt));
    round.feed(mv(3, round.snapshot.prompt));
    const s = round.snapshot;
    expect(s.phase).toBe("done");
    expect(s.answers.map((a) => [a.ok, a.ms])).toEqual([
      [false, 800],
      [true, 400],
      [true, 0],
    ]);
    expect(summarize(s)).toEqual({
      hits: 3,
      misses: 1,
      firstTry: 2 / 3,
      avgMs: 400,
    });
    expect(round.statsNow[first]?.tries).toBe(round.statsNow[first]?.tries);
  });

  it("30초 판은 시계로 끝난다", () => {
    const clock = new ManualClock();
    const round = new DrillRound({
      n: 3,
      pool: ["R", "U"],
      stats: {},
      limit: { kind: "time", ms: 30_000 },
      clock,
      rand: () => 0.5,
    });
    let changes = 0;
    round.subscribe(() => changes++);
    round.start();
    clock.advance(10_000);
    expect(round.remainingMs()).toBe(20_000);
    clock.advance(20_000);
    expect(round.snapshot.phase).toBe("done");
    expect(round.remainingMs()).toBe(0);
    expect(changes).toBe(2);
    expect(round.feed(mv(3, "R"))).toBeNull();
  });

  it("키 보고 맞히기: 보기 넷에 정답 하나, 키는 정답 동작의 키", () => {
    const km = twoHandKeymap();
    const pool = drillPool(km, "primes", 3);
    const rand = seededRand(3);
    for (let i = 0; i < 20; i++) {
      const q = makeQuiz(km, pool, {}, rand);
      expect(q).not.toBeNull();
      if (!q) continue;
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
      expect(q.choices).toContain(q.answer);
      expect(describeInput(km, 3, press(q.chord)).action).toBe(q.answer);
    }
    expect(makeQuiz(km, ["R", "U"], {}, rand)).toBeNull();
  });
});

describe("공식 따라 치기", () => {
  it("틀리면 그 수에 머물고 끝까지 치면 done", () => {
    const run = new FormulaRun(3, ["R", "U2", "R'"]);
    expect(run.feed(mv(3, "R"))).toBe("hit");
    expect(run.feed(mv(3, "R"))).toBe("miss");
    expect(run.feed(mv(3, "U"))).toBe("partial");
    expect(run.feed(mv(3, "U"))).toBe("hit");
    expect(run.feed(mv(3, "R'"))).toBe("done");
    expect(run.done).toBe(true);
    expect(run.mistakes).toBe(1);
    run.restart();
    expect(run.index).toBe(0);
    expect(countMoves(["x", "R", "U2"])).toBe(2);
  });
});

describe("키 익히기", () => {
  it("배치에서 키를 읽어 문구를 만든다", () => {
    const two = tutorialSteps(twoHandKeymap());
    const nota = tutorialSteps(notationKeymap());
    expect(two.map((s) => s.id)).toEqual(nota.map((s) => s.id));
    expect(two[1]?.lines[0]).toContain("I");
    expect(nota[1]?.lines[0]).toContain("Shift+R");
    expect(two[0]?.lines[2]).toContain("「U'」");
    expect(nota[0]?.lines[2]).toContain("J는 아무 동작도 없음");
    for (const s of [...two, ...nota]) expect(s.missing).toEqual([]);
  });

  it("배치에 없는 수는 빼고 알린다", () => {
    const km = unbind(twoHandKeymap(), { code: "KeyK" });
    const right = tutorialSteps(km).find((s) => s.id === "right");
    expect(right?.missing).toEqual(["R'"]);
    expect(right?.targets).toHaveLength(2);
  });

  it("단계 진행: 키 자리 → 수 → 명령", () => {
    const steps = tutorialSteps(twoHandKeymap());
    const home = new StepRun(3, steps[0] as never);
    expect(home.feed({ kind: "code", code: "KeyJ" })).toBe("miss");
    expect(home.feed({ kind: "move", move: mv(3, "U") })).toBe("ignore");
    expect(home.feed({ kind: "code", code: "KeyF" })).toBe("hit");
    expect(home.feed({ kind: "code", code: "KeyJ" })).toBe("done");

    const cmd = new StepRun(3, steps.find((s) => s.id === "commands") as never);
    expect(cmd.feed({ kind: "command", command: "undo" })).toBe("miss");
    expect(cmd.feed({ kind: "move", move: mv(3, "R") })).toBe("hit");
    expect(cmd.feed({ kind: "command", command: "undo" })).toBe("hit");
    expect(cmd.feed({ kind: "command", command: "scramble" })).toBe("hit");
    expect(cmd.feed({ kind: "command", command: "reset" })).toBe("done");
  });

  it("사용자 배치로 바꾼 키가 문구에 나온다", () => {
    const km = bind(twoHandKeymap(), { code: "KeyQ" }, "R");
    expect(tutorialSteps(km)[1]?.lines[0]).toContain(
      "R(오른쪽 면을 시계 방향)은 I / Q",
    );
  });
});

describe("저장", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it("훈련 기록을 저장하고 읽는다. 깨진 값은 버린다", () => {
    const s = mem();
    const r = emptyRecord();
    r.see = recordAnswer({}, "R", true, 300);
    r.formulas.sexy = 3.5;
    expect(saveDrill(r, s)).toBe(true);
    expect(loadDrill(s)).toEqual(r);
    s.setItem("cube.keydrill.v1", '{"see":{"R":{"tries":"x"}},"formulas":[]}');
    expect(loadDrill(s)).toEqual(emptyRecord());
    s.setItem("cube.keydrill.v1", "{");
    expect(loadDrill(s)).toEqual(emptyRecord());
    expect(loadDrill(null)).toEqual(emptyRecord());
    expect(loadLearn(null)).toEqual({ done: [] });
  });
});
