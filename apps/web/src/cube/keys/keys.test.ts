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
  handOf,
  KEYBOARD_ROWS,
  keyboardCells,
  keyLayers,
  kindOf,
  searchRows,
} from "./layout";
import { readPracticeKey } from "./practice-input";
import {
  describeInput,
  keyTextFor,
  MoveMatcher,
  pressesFor,
  pressLabel,
} from "./reach";
import { emptyRecord, loadDrill, loadLearn, saveDrill } from "./storage";
import {
  faceHandLine,
  faceHands,
  migrateLearnDone,
  ORIENT_GOALS,
  orientGoalText,
  StepRun,
  TUTORIAL_IDS,
  targetLabel,
  tutorialSteps,
} from "./tutorial";

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
    // 「두 손」의 안쪽 한 층은 csTimer처럼 가운데 줄 키(4×4의 . = 2R)
    expect(keyTextFor(twoHandKeymap(), 4, "2R")).toBe(".");
    expect(keyTextFor(twoHandKeymap(), 3, "M")).toBe("5 / 6");
    expect(keyTextFor(twoHandKeymap(), 4, "Rw")).toBe("U / Shift+I");
    expect(keyTextFor(notationKeymap(), 5, "3Rw")).toBe("3 → Alt+R");
    expect(keyTextFor(twoHandKeymap(), 3, "undo")).toBe("⌫ / Ctrl+Z");
    // csTimer 숫자 키: E = 2, S' = 1
    expect(keyTextFor(twoHandKeymap(), 3, "E")).toBe("2");
    expect(keyTextFor(twoHandKeymap(), 3, "S'")).toBe("1");
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
      "K 키는 「R'」 동작이에요.",
    );
    expect(describeInput(km, 3, press({ code: "Quote" })).text).toBe(
      "' 키에는 동작이 없어요.",
    );
    expect(describeInput(km, 3, press({ code: "Digit4" })).text).toMatch(
      /이 크기에서는 쓰지 않아요\.$/,
    );
    // 친 수가 키의 동작과 같으면 덧붙이지 않고, 다르면 문장으로 잇는다(마침표가 겹치지 않게)
    expect(describeInput(km, 3, press({ code: "KeyK" }), "R'").text).toBe(
      "K 키는 「R'」 동작이에요.",
    );
    expect(describeInput(km, 4, press({ code: "KeyI" }), "2R").text).toBe(
      "I 키는 「R」 동작이에요. 실제로 돈 수는 「2R」 수예요.",
    );
  });
});

describe("익히기·훈련 화면의 키 누름", () => {
  const ev = (code: string, o: Partial<KeyInput> = {}) => ({
    code,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    ...o,
  });
  const read = (e: ReturnType<typeof ev>) => {
    const it = new KeyInterpreter(3, twoHandKeymap());
    return readPracticeKey(e, (i) => it.handle(i));
  };

  it("본 게임처럼 ⌘Z는 되돌리기, 다른 ⌘ 조합은 브라우저에 둔다", () => {
    const z = read(ev("KeyZ", { metaKey: true }));
    expect(z?.result).toMatchObject({ kind: "command", command: "undo" });
    expect(z?.prevent).toBe(true);
    expect(read(ev("KeyR", { metaKey: true }))).toBeNull();
    expect(read(ev("KeyZ", { metaKey: true, shiftKey: true }))).toBeNull();
  });

  it("동작 없는 키는 넘기고, 되풀이·수정 키만은 넘기지 않는다", () => {
    const q = read(ev("Quote"));
    expect(q?.result).toBeNull();
    expect(q?.prevent).toBe(false);
    expect(read(ev("KeyI"))?.result?.kind).toBe("move");
    expect(read(ev("KeyI", { repeat: true }))).toBeNull();
    expect(read(ev("ShiftLeft", { shiftKey: true }))).toBeNull();
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
    expect(i?.layers.shift).toMatchObject({ label: "Rw", usable: true });
    expect(i?.layers.alt).toBeUndefined();
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
    expect(searchRows(rows, "shift+i")[0]?.action).toBe("Rw");
    expect(
      searchRows(actionRows(twoHandKeymap(), 4), "shift+i")[0]?.action,
    ).toBe("Rw");
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
    expect(two.map((s) => s.id)).toEqual([...TUTORIAL_IDS]);
    expect(nota.map((s) => s.id)).toEqual([...TUTORIAL_IDS]);
    const rTwo = two.find((s) => s.id === "face-R");
    const rNota = nota.find((s) => s.id === "face-R");
    expect(rTwo?.lines[0]).toContain("I 키(R), 반대로는 K 키(R')");
    expect(rNota?.lines[0]).toContain("Shift+R 키(R')");
    expect(two[0]?.lines[2]).toContain("「U'」");
    expect(two[0]?.lines[2]).toContain(
      "이 배치에서 F 키는 「U'」, J 키는 「U」 수예요.",
    );
    expect(nota[0]?.lines[2]).toContain(
      "이 배치에서 F 키는 「F」 수예요. J 키에는 동작이 없어요.",
    );
    for (const s of [...two, ...nota]) {
      expect(s.missing).toEqual([]);
      // 설명 줄은 모두 완결된 문장
      for (const l of s.lines) expect(l, l).toMatch(/\.$/);
    }
  });

  it("「두 손」 설명은 실제 키와 손에 맞는다", () => {
    const km = twoHandKeymap();
    const hands = faceHands(km);
    expect(hands.map((f) => f.face)).toEqual(["R", "L", "U", "D", "F", "B"]);
    for (const f of hands) {
      // 그 키를 치면 정말 그 면의 시계·반시계가 된다
      expect(describeInput(km, 3, press({ code: f.cw })).action).toBe(f.face);
      expect(describeInput(km, 3, press({ code: f.ccw })).action).toBe(
        `${f.face}'`,
      );
      const a = handOf(f.cw);
      expect(f.hand).toBe(a === handOf(f.ccw) ? a : null);
    }
    expect(hands.find((f) => f.face === "R")?.hand).toBe("right");
    expect(hands.find((f) => f.face === "L")?.hand).toBe("left");
    for (const f of ["U", "D", "F", "B"])
      expect(hands.find((h) => h.face === f)?.hand).toBeNull();

    const line = tutorialSteps(km)[0]?.lines[1] ?? "";
    expect(line).toContain(
      "R·R'은 오른손 I·K, L·L'은 왼손 D·E로 한 손에서 쳐요.",
    );
    expect(line).toContain(
      "U·U'은 J·F, D·D'은 S·L, F·F'은 H·G, B·B'은 W·O로 두 손이 나눠 쳐요.",
    );
    expect(faceHandLine(km)).not.toContain("같은 자리");
  });

  it("배치에 없는 수는 빼고 알린다", () => {
    const km = unbind(twoHandKeymap(), { code: "KeyK" });
    const right = tutorialSteps(km).find((s) => s.id === "face-R");
    expect(right?.missing).toEqual(["R'"]);
    expect(right?.targets).toHaveLength(2);
    expect(right?.hand).toBeUndefined();
  });

  it("한 면 단계: 어느 손인지 보이고, 돌린 뒤 되돌려 맞춘다", () => {
    const two = tutorialSteps(twoHandKeymap());
    const hand = (f: string) => two.find((s) => s.id === `face-${f}`)?.hand;
    expect(hand("R")).toEqual({ label: "오른손", moves: ["R", "R'"] });
    expect(hand("L")?.label).toBe("왼손");
    expect(hand("U")?.label).toBe("두 손");
    // 「표기」 배치의 R·Shift+R은 왼손
    const nota = tutorialSteps(notationKeymap());
    expect(nota.find((s) => s.id === "face-R")?.hand?.label).toBe("왼손");

    const step = two.find((s) => s.id === "face-F");
    expect(step?.targets.map(targetLabel)).toEqual(["F", "F'", "F'", "F"]);
    const run = new StepRun(3, step as never);
    expect(run.feed({ kind: "move", move: mv(3, "F") })).toBe("hit");
    expect(run.facing).toEqual({ up: 0, front: 2 });
    expect(run.feed({ kind: "move", move: mv(3, "F'") })).toBe("hit");
    expect(run.feed({ kind: "move", move: mv(3, "F'") })).toBe("hit");
    expect(run.feed({ kind: "move", move: mv(3, "F") })).toBe("done");
  });

  it("큐브 둘러보기: x·y·z 뒤 말한 색 면이 오게 돌린다. 목표는 이미 이뤄져 있지 않다", () => {
    const step = tutorialSteps(twoHandKeymap()).find((s) => s.id === "rotate");
    if (!step) throw new Error("rotate");
    expect(step.targets.slice(3)).toEqual(ORIENT_GOALS);
    const run = new StepRun(3, step);
    for (const t of ["x", "y", "z"])
      expect(run.feed({ kind: "move", move: mv(3, t) })).toBe("hit");
    // 면을 돌리면 보는 쪽이 바뀌지 않으니 틀림
    expect(run.feed({ kind: "move", move: mv(3, "R") })).toBe("miss");
    expect(run.feed({ kind: "move", move: mv(3, "R'") })).toBe("miss");
    const ROT = ["x", "x'", "y", "y'", "z", "z'"];
    for (const goal of ORIENT_GOALS) {
      if (goal.kind !== "orient") throw new Error("orient");
      expect(run.current).toEqual(goal);
      const f = run.facing;
      if (!f) throw new Error("facing");
      // 목표가 열릴 때 이미 그 모양이면 치지 않아도 넘어가 버린다
      expect(
        (goal.up === undefined || goal.up === f.up) &&
          (goal.front === undefined || goal.front === f.front),
      ).toBe(false);
      // 닿는 가장 짧은 길(세 번 안쪽)을 찾아 친다
      const reaches = (seq: string[]) => {
        // 대상 없이 모양만 따라가는 판에 지금까지의 수와 seq를 넣는다
        const probe = new StepRun(3, { ...step, targets: [] });
        for (const m of [...run.played, ...seq.map((s) => mv(3, s))])
          probe.feed({ kind: "move", move: m });
        const g = probe.facing;
        return (
          !!g &&
          (goal.up === undefined || goal.up === g.up) &&
          (goal.front === undefined || goal.front === g.front)
        );
      };
      let frontier: string[][] = [[]];
      let path: string[] | undefined;
      for (let depth = 0; depth < 3 && !path; depth++) {
        frontier = frontier.flatMap((p) => ROT.map((r) => [...p, r]));
        path = frontier.find(reaches);
      }
      if (!path) throw new Error("닿지 못함");
      const out = path.map((s) => run.feed({ kind: "move", move: mv(3, s) }));
      expect(out.slice(0, -1).every((o) => o === "partial")).toBe(true);
      expect(["hit", "done"]).toContain(out.at(-1));
    }
    expect(run.done).toBe(true);
    expect(run.facing).toEqual({ up: 0, front: 2 });
    expect(orientGoalText({ up: 2 })).toBe("초록 면을 위로 오게 돌려요.");
    expect(targetLabel({ kind: "orient", up: 0, front: 2 })).toBe(
      "흰 위·초록 앞",
    );
  });

  it("섞고 풀기: 나중 것부터 거꾸로 쳐야 풀린다. 맞춘 상태로는 풀기로 치지 않는다", () => {
    const step = tutorialSteps(twoHandKeymap()).find((s) => s.id === "unwind");
    if (!step) throw new Error("unwind");
    const run = new StepRun(3, step);
    for (const t of ["R", "U", "U'", "R'", "F", "R"])
      expect(run.feed({ kind: "move", move: mv(3, t) })).toBe("hit");
    expect(targetLabel(run.current as never)).toBe("혼자 풀기");
    expect(run.feed({ kind: "command", command: "reset" })).toBe("ignore");
    expect(run.current?.kind).toBe("solve");
    // 맞춘 상태로 뒤에 다시 F R로 섞고, 먼저 친 것부터 풀면 안 풀린다
    run.feed({ kind: "move", move: mv(3, "F") });
    run.feed({ kind: "move", move: mv(3, "R") });
    expect(run.feed({ kind: "move", move: mv(3, "F'") })).toBe("partial");
    expect(run.feed({ kind: "command", command: "undo" })).toBe("partial");
    expect(run.feed({ kind: "move", move: mv(3, "R'") })).toBe("partial");
    expect(run.feed({ kind: "move", move: mv(3, "F'") })).toBe("done");
  });

  it("옛 진도를 새 단계로 옮긴다", () => {
    // 옛 단계를 모두 마쳤으면 모두 마친 것으로
    expect(
      migrateLearnDone([
        "home",
        "right",
        "left",
        "fdb",
        "rotate",
        "layer",
        "commands",
        "formula",
      ]),
    ).toEqual([...TUTORIAL_IDS]);
    expect(migrateLearnDone(["home", "right"])).toEqual(["home", "face-R"]);
    expect(migrateLearnDone(["left", "right", "zzz"])).toEqual([
      "face-R",
      "face-L",
      "face-U",
    ]);
    expect(migrateLearnDone(["fdb", "rotate"])).toEqual([
      "rotate",
      "face-F",
      "face-D",
      "face-B",
    ]);
    // 새 id는 그대로, 모르는 id는 버린다
    expect(migrateLearnDone(["unwind", "x", "home"])).toEqual([
      "home",
      "unwind",
    ]);
    expect(migrateLearnDone([])).toEqual([]);
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
    expect(
      tutorialSteps(km).find((s) => s.id === "face-R")?.lines[0],
    ).toContain("I / Q 키(R)");
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
