/**
 * Rust 코어 공통 시험 자료: Cubie 공식 연습 진행기(docs/47 16-11, docs/52 4단계). 사이트 `practice/`의 단계·출제·
 * 공식 고르기·판정·콤보·한 판 끝을 사이트 코드로 돌린 결과다. 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다.
 * 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import { type CubeMove, faceColors } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { createRng, nextInt, type RngState } from "@game/mighty-engine";

import type { AlgBook } from "../algs/store";
import { notationToMove } from "../input/actions";
import { type Keymap, notationKeymap, twoHandKeymap } from "../input/keymaps";
import type { CaseStats, TrainBook } from "../learn/progress";
import { MENU_STAGES } from "../mini/practice";
import { drawRound } from "../practice/deck";
import { keyCost } from "../practice/key-cost";
import { choicesOf, pickAlg } from "../practice/pick-alg";
import { boardFor, caseStart, problemOf } from "../practice/problem";
import type { PracticeMode } from "../practice/round";
import { PracticeSession } from "../practice/session";
import { METHOD_TITLE, PRACTICE_STAGES } from "../practice/stages";
import type { DrillCase, PracticeStage } from "../practice/types";
import { fixtureJson } from "./core-fixtures";

type Preset = "twoHand" | "notation";
const KEYMAPS: Record<Preset, () => Keymap> = {
  twoHand: twoHandKeymap,
  notation: notationKeymap,
};

const colorsOf = (s: Parameters<typeof faceColors>[1]) =>
  Array.from(faceColors(3, s)).join("");

const stageOf = (id: string) =>
  PRACTICE_STAGES.find((s) => s.id === id) as PracticeStage;

// ── Rust 자료(단계·상황) ──────────────────────────────────

const lit = (s: string) => {
  const out = JSON.stringify(s);
  if (/\\u/.test(out)) throw new Error(`Rust 글로 옮기지 못하는 글자: ${s}`);
  return out;
};
const optLit = (s: string | undefined) => (s ? `Some(${lit(s)})` : "None");
const list = (xs: readonly string[]) => `&[${xs.map(lit).join(", ")}]`;

function rustCase(stage: PracticeStage, c: DrillCase): string {
  return [
    "        DrillCase {",
    `            id: ${lit(c.id)},`,
    `            name: ${lit(c.name)},`,
    `            group: ${optLit(c.group)},`,
    `            algs: ${list(c.algs)},`,
    `            setup: ${optLit(c.setup)},`,
    `            choices: ${list(choicesOf(c))},`,
    `            goal: ${lit(stage.goal(c))},`,
    `            source: ${optLit(c.source?.id)},`,
    "        },",
  ].join("\n");
}

export function buildRustPracticeData(): string {
  const stages = PRACTICE_STAGES.map((s) =>
    [
      "    PracticeStage {",
      `        id: ${lit(s.id)},`,
      `        title: ${lit(s.title)},`,
      `        method: ${lit(s.method)},`,
      `        method_title: ${lit(METHOD_TITLE[s.method])},`,
      `        hold: ${lit(s.hold)},`,
      `        mask: ${lit(s.mask)},`,
      `        auf: ${s.auf},`,
      "        cases: &[",
      ...s.cases.map((c) => rustCase(s, c)),
      "        ],",
      "    },",
    ].join("\n"),
  );
  return [
    "// 사이트 자료에서 만든 파일이다. 손으로 고치지 않는다.",
    "// 다시 만들기: CUBE_CORE_FIXTURES=write pnpm vitest run apps/web/src/cube/native/",
    "// 원본: apps/web/src/cube/practice/stages.ts(단계·상황), pick-alg.ts choicesOf(고를 공식: 자료 + 후보),",
    "// 단계의 goal(상황마다 통과 모양)",
    "",
    "use crate::practice::{DrillCase, PracticeStage};",
    "",
    "/// 공식 연습 단계(해법 차례, 사이트 `PRACTICE_STAGES`)",
    "pub const PRACTICE_STAGES: &[PracticeStage] = &[",
    ...stages,
    "];",
    "",
  ].join("\n");
}

// ── 공식 고르기·출제 ─────────────────────────────────────

/** 기록이 쌓인 기기처럼: 상황마다 맞춤·틀림·시간 */
function fakeBook(stage: PracticeStage, rng: RngState): TrainBook {
  const book: TrainBook = {};
  for (const c of stage.cases) {
    const r = nextInt(rng, 4);
    if (r === 0) continue;
    const solves = nextInt(rng, 9);
    const times = Array.from(
      { length: Math.min(solves, 12) },
      () => 800 + nextInt(rng, 6000),
    );
    const s: CaseStats = {
      solves,
      fails: nextInt(rng, 3),
      best: times.length ? Math.min(...times) : null,
      times,
      moves: times.map(() => 7 + nextInt(rng, 6)),
    };
    book[c.id] = s;
  }
  return book;
}

function picksAndDraws() {
  const rng = createRng(1611);
  return PRACTICE_STAGES.map((stage) => {
    const picks = Object.fromEntries(
      (Object.keys(KEYMAPS) as Preset[]).map((preset) => {
        const km = KEYMAPS[preset]();
        return [
          preset,
          stage.cases.map((c) => {
            const p = pickAlg(c, km);
            return [p.alg, keyCost(p.alg, km)];
          }),
        ];
      }),
    );
    const km = KEYMAPS.twoHand();
    const draws = [
      { seed: 1, book: {} as TrainBook, everyTurn: false },
      { seed: 4294967295, book: fakeBook(stage, rng), everyTurn: false },
      { seed: 77, book: {} as TrainBook, everyTurn: true },
    ].map(({ seed, book, everyTurn }) => ({
      seed,
      book,
      everyTurn,
      problems: drawRound(
        stage.cases.map((c) => c.id),
        { seed, book, auf: stage.auf, everyTurn },
      ).map((d) => {
        const c = stage.cases.find((x) => x.id === d.caseId) as DrillCase;
        const p = problemOf(stage, c, d.turn, pickAlg(c, km).alg);
        return {
          caseId: p.caseId,
          turn: p.turn,
          alg: p.alg,
          preAuf: p.preAuf,
          tokens: boardFor(stage, c, p).tokens,
          start: colorsOf(caseStart(stage, c, p.turn)),
        };
      }),
    }));
    return { stage: stage.id, picks, draws };
  });
}

// ── 진행기 ──────────────────────────────────────────────

type PracticeOp =
  | { op: "move"; notation: string; t: number }
  | { op: "wait"; t: number }
  | { op: "peek"; t: number }
  | { op: "undo"; t: number }
  | { op: "reset"; t: number }
  | { op: "newRound"; t: number; seed: number };

interface Scenario {
  stage: string;
  mode: PracticeMode;
  preset: Preset;
  seed: number;
  /** 내 공식을 고른 상황(고를 공식 가운데 마지막 것을 쓰는 공식으로) */
  mine?: string[];
}

const SCENARIOS: Scenario[] = [
  { stage: "beginner-cross", mode: "follow", preset: "twoHand", seed: 5 },
  { stage: "f2l", mode: "follow", preset: "notation", seed: 6 },
  { stage: "oll", mode: "see", preset: "twoHand", seed: 7 },
  {
    stage: "pll",
    mode: "follow",
    preset: "twoHand",
    seed: 8,
    mine: ["pll-t", "pll-ua", "pll-jb"],
  },
  { stage: "2look-pll", mode: "see", preset: "notation", seed: 9 },
  { stage: "zz-pair", mode: "follow", preset: "twoHand", seed: 10 },
  { stage: "beginner-twist", mode: "follow", preset: "twoHand", seed: 11 },
];

const FACES = ["U", "R", "F", "D", "L", "B"];

const memStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

function snapshot(s: PracticeSession) {
  const sum = s.summary;
  return {
    phase: s.phase,
    index: s.round.index,
    count: s.round.problems.length,
    caseId: s.round.current?.caseId ?? null,
    tokens: s.tokens.join(" "),
    at: s.at,
    wrong: s.wrong ? [s.wrong.index, s.wrong.token] : null,
    peeked: s.peeked,
    combo: [s.round.combo.current, s.round.combo.best],
    state: s.state ? colorsOf(s.state) : null,
    commonAlg: s.commonAlg,
    suggestSee: s.suggestSee,
    summary: sum && {
      accuracy: sum.accuracy,
      avgMs: sum.avgMs,
      perMinute: sum.perMinute,
      bestCombo: sum.bestCombo,
      slow: sum.slow.map((x) => [x.caseId, x.ms]),
    },
  };
}

/** 진행기가 받을 수 하나(표기 → 수) */
const moveOf = (t: string) => notationToMove(3, t) as CubeMove;

function runScenario(sc: Scenario) {
  const rng = createRng(sc.seed * 97);
  const clock = new ManualClock();
  const storage = memStorage();
  const book: AlgBook = {};
  const stage = stageOf(sc.stage);
  for (const id of sc.mine ?? []) {
    const c = stage.cases.find((x) => x.id === id) as DrillCase;
    book[id] = { mine: [], use: choicesOf(c).at(-1) as string };
  }
  const seeds = [sc.seed, sc.seed + 1000];
  let cues: string[] = [];
  const s = new PracticeSession({
    stage,
    mode: sc.mode,
    keymap: KEYMAPS[sc.preset](),
    algBook: book,
    clock,
    seed: () => seeds.shift() ?? 0,
    storage,
    onCue: (c) => cues.push(c),
  });
  const ops: PracticeOp[] = [];
  const out: unknown[] = [];
  let t = 0;
  const step = (op: PracticeOp, f: () => unknown) => {
    cues = [];
    clock.advance(op.t - clock.now());
    const r = f();
    ops.push(op);
    out.push({ result: r ?? null, cues, ...snapshot(s) });
  };
  const later = () => {
    t += 120 + nextInt(rng, 400);
    return t;
  };
  const play = (notation: string) =>
    step({ op: "move", notation, t: later() }, () => s.input(moveOf(notation)));
  const wait = (dt: number) => {
    t += dt;
    step({ op: "wait", t }, () => null);
  };
  const wrongFace = (avoid: string) => {
    const f = FACES.filter((x) => !avoid.startsWith(x));
    return f[nextInt(rng, f.length)] as string;
  };
  for (let guard = 0; s.phase !== "over" && guard < 400; guard++) {
    if (s.phase === "pause") {
      wait(nextInt(rng, 2) === 0 ? 700 : 900);
      continue;
    }
    const tok = s.tokens[s.mode === "follow" ? s.at : 0] ?? "U";
    const r = nextInt(rng, 100);
    if (s.mode === "follow") {
      if (r < 8) play(wrongFace(tok));
      else if (r < 10) wait(1600);
      else if (/2'?$/.test(tok) && r < 40) {
        const base = tok.replace(/2'?$/, "");
        const second = nextInt(rng, 2) === 0 ? base : `${base}'`;
        play(base);
        play(r < 34 ? base : second);
      } else play(tok);
      continue;
    }
    // 보고 치기: 공식 전체를 차례로(가끔 틀린 수를 두고 되돌리기, 처음으로, 펼쳐 보기)
    if (r < 6) step({ op: "peek", t: later() }, () => s.peek());
    else if (r < 12) {
      play(wrongFace(""));
      step({ op: "undo", t: later() }, () => {
        const m = s.undo();
        return m && [m.axis, m.from, m.to, m.turns];
      });
    } else if (r < 15) {
      play(wrongFace(""));
      step({ op: "reset", t: later() }, () => s.reset());
    }
    for (const token of s.tokens) {
      if (s.phase !== "play") break;
      play(token);
    }
  }
  // 한 판 더
  step({ op: "newRound", t: later(), seed: sc.seed + 1000 }, () =>
    s.newRound(),
  );
  play(s.tokens[0] ?? "U");
  const follow = JSON.parse(storage.getItem("cube.practice.v1") ?? "null");
  const train = JSON.parse(storage.getItem("cube.train.v1") ?? "null");
  return { ...sc, ops, out, record: follow, train };
}

export function buildPractice(): string {
  return fixtureJson(
    {
      what: "공식 연습(practice/): 메뉴 단계, 단계·키 배치마다 고른 공식과 키 비용, 씨앗·기록 → 출제와 시작 모양, 진행기 차례(ManualClock) → 화면 상태·소리·기록",
      menu: MENU_STAGES,
    },
    [
      ...picksAndDraws().map((x) => ({ kind: "stage", ...x })),
      ...SCENARIOS.map((sc) => ({ kind: "session", ...runScenario(sc) })),
    ],
  );
}
