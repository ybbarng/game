/**
 * Rust 코어 공통 시험 자료 가운데 Cubie 네이티브 4단계(docs/52)의 것: 한 판 세션(기록 칸), 사람 해법과 공식 보기,
 * 공식 연습 진행기. 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다. 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import {
  CPLL,
  EO_2LOOK,
  EPLL,
  OCLL,
  OCLL_2X2,
  OLL,
  PLL,
  solveAdvanced2,
  solveCfop,
} from "@game/cube-ai";
import {
  applyMoves,
  formatMove,
  invertMove,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { type ScrambleEvent, scramble } from "@game/cube-scramble";
import { ManualClock } from "@game/fair-play";
import { createRng, nextInt, type RngState } from "@game/mighty-engine";

import { pickHint } from "../mini/hint-pick";
import { formatSplits } from "../records";
import { type SessionCue, SolveSession } from "../solve-session";
import { fixtureJson } from "./core-fixtures";

// ── 한 판 세션(Cubie 미니의 기록 칸) ─────────────────────

type SessionOp =
  | { op: "start"; scramble: string; seed: number }
  | { op: "move"; notation: string; t: number }
  | { op: "undo"; t: number }
  | { op: "reset" };

/** 수 사이 간격: 대개 이어 침(콤보), 가끔 멈춤 */
function gap(rng: RngState): number {
  const r = nextInt(rng, 100);
  if (r < 8) return 1100 + nextInt(rng, 1500);
  return 90 + nextInt(rng, 600) + nextInt(rng, 10) / 4;
}

const FACES = ["U", "R", "F", "D", "L", "B"];

/** 풀이 수 목록을 시각과 함께 차례로(가끔 잘못 돌리고 되돌림, 큐브 돌리기 섞음) */
function playOps(
  rng: RngState,
  solution: string[],
  startAt: number,
): SessionOp[] {
  const ops: SessionOp[] = [];
  let t = startAt;
  const later = (dt: number) => {
    t += dt;
    return t;
  };
  // 첫 면 돌리기 전 큐브 돌리기(시작 전이라 음수 시각으로 남는다)
  ops.push({ op: "move", notation: "y", t: later(300) });
  ops.push({ op: "move", notation: "y'", t: later(250) });
  for (const m of solution) {
    if (nextInt(rng, 100) < 7) {
      const f = FACES[nextInt(rng, 6)] as string;
      ops.push({ op: "move", notation: f, t: later(gap(rng)) });
      ops.push({ op: "undo", t: later(gap(rng)) });
    }
    if (nextInt(rng, 100) < 4) {
      ops.push({ op: "move", notation: "x", t: later(gap(rng)) });
      ops.push({ op: "move", notation: "x'", t: later(gap(rng)) });
    }
    ops.push({ op: "move", notation: m, t: later(gap(rng)) });
  }
  return ops;
}

function invertText(n: number, text: string): string[] {
  return parseMoves(n, text)
    .toReversed()
    .map((m) => formatMove(n, invertMove(m)));
}

function sessionScenarios(): { n: number; ops: SessionOp[] }[] {
  const rng = createRng(20261112);
  const out: { n: number; ops: SessionOp[] }[] = [];
  const begin = (sc: string, seed: number): SessionOp => ({
    op: "start",
    scramble: sc,
    seed,
  });
  // 3×3: 컴퓨터 고수 해법(십자 → F2L → 2단계)으로 맞춤. 이정표가 차례로 켜진다
  for (const seed of [1, 2, 3, 4]) {
    const sc = scramble("333", seed).text;
    const state = applyMoves(3, solvedCube(3), parseMoves(3, sc));
    out.push({
      n: 3,
      ops: [begin(sc, seed), ...playOps(rng, solveCfop(state).moves, 0)],
    });
  }
  // 3×3: 섞기를 거꾸로(가장 짧은 해처럼)
  {
    const sc = scramble("333", 9).text;
    out.push({
      n: 3,
      ops: [begin(sc, 9), ...playOps(rng, invertText(3, sc), 1000)],
    });
  }
  // 2×2: 고수 해법
  for (const seed of [5, 6, 7]) {
    const sc = scramble("222", seed).text;
    const state = applyMoves(2, solvedCube(2), parseMoves(2, sc));
    out.push({
      n: 2,
      ops: [begin(sc, seed), ...playOps(rng, solveAdvanced2(state).moves, 0)],
    });
  }
  // 큰 큐브: 짧은 섞기를 거꾸로(센터·엣지 짝 이정표)
  for (const [n, sc] of [
    [4, "Rw U 2R F' Uw2 L 3Fw D"],
    [5, "2R 3Uw F M' Rw2 B"],
    [6, "3Rw U2 2F 4L' D"],
    [7, "3Uw R 4Fw' M 2L2"],
  ] as const) {
    out.push({
      n,
      ops: [begin(sc, 0), ...playOps(rng, invertText(n, sc), 0)],
    });
  }
  // 섞기 전에 돌림, 판 버리기(reset) 뒤 다시, 다 맞춘 뒤에 돌림
  {
    const sc = "R U R' U'";
    out.push({
      n: 3,
      ops: [
        { op: "move", notation: "R", t: 10 },
        { op: "undo", t: 20 },
        begin(sc, 77),
        { op: "move", notation: "U", t: 100 },
        { op: "reset" },
        begin(sc, 78),
        { op: "move", notation: "z", t: 500 },
        ...["U", "R", "U'", "R'"].map(
          (notation, i): SessionOp => ({
            op: "move",
            notation,
            t: 900 + i * 200,
          }),
        ),
        { op: "move", notation: "F", t: 2000 },
        { op: "undo", t: 2100 },
        { op: "undo", t: 2200 },
      ],
    });
  }
  return out;
}

function sessionCase({ n, ops }: { n: number; ops: SessionOp[] }) {
  const clock = new ManualClock();
  let cues: SessionCue[] = [];
  let record: unknown = null;
  const s = new SolveSession({
    n,
    mode: "solo",
    inspection: false,
    clock,
    onCue: (c) => cues.push(c),
    onRecord: (r) => {
      record = {
        ms: r.ms,
        penalty: r.penalty,
        moves: r.moves,
        replay: r.replay,
        splits: r.splits ?? null,
        combo: r.combo ?? null,
      };
    },
  });
  const out = ops.map((op) => {
    cues = [];
    record = null;
    if ("t" in op) clock.advance(op.t - clock.now());
    if (op.op === "start") s.start(op.scramble, op.seed);
    else if (op.op === "reset") s.reset();
    else if (op.op === "undo") s.undo();
    else {
      const [m] = parseMoves(n, op.notation);
      if (m) s.input(m, op.notation);
    }
    return {
      cues,
      phase: s.phase,
      moves: s.moveCount,
      elapsed: s.elapsed(),
      progress: s.progress.value,
      flow: s.flowScore,
      longest: s.longestCombo,
      splits: formatSplits(s.splits),
      record,
    };
  });
  return { n, ops, out };
}

export function buildSession(): string {
  return fixtureJson(
    {
      what: "Cubie 미니 한 판(SolveSession, solo·살펴보기 없음, ManualClock): 차례(start·move·undo·reset, t = 시계 ms) → 수마다 알림·단계·수·시간·진행·콤보·구간, 끝나면 기록 칸",
    },
    sessionScenarios().map(sessionCase),
  );
}

// ── 사람 해법과 공식 보기 ─────────────────────────────────

const ROTS = ["", "y", "x2", "z'", "x y2", "y'"];

interface HintCase {
  n: number;
  alg: string;
  /** 사이트 해법 전체도 견줄지(섞기 상태만) */
  full: boolean;
}

function hintCases(): HintCase[] {
  const rng = createRng(1113);
  const out: HintCase[] = [];
  const add = (n: number, alg: string, full = false) =>
    out.push({ n, alg: alg.replace(/\s+/g, " ").trim(), full });
  const sets: {
    n: number;
    event: ScrambleEvent;
    seeds: number[];
    solve: typeof solveCfop;
  }[] = [
    { n: 3, event: "333", seeds: [11, 12, 13, 14], solve: solveCfop },
    {
      n: 2,
      event: "222",
      seeds: [21, 22, 23, 24, 25, 26],
      solve: solveAdvanced2,
    },
  ];
  for (const { n, event, seeds, solve } of sets) {
    for (const seed of seeds) {
      const sc = scramble(event, seed).text;
      add(n, sc, true);
      const s = solve(applyMoves(n, solvedCube(n), parseMoves(n, sc)));
      // 단계 경계마다(쥔 방향을 바꿔), 단계 중간 하나씩
      for (const stage of s.stages) {
        const rot = ROTS[nextInt(rng, ROTS.length)] as string;
        add(n, `${sc} ${s.moves.slice(0, stage.end).join(" ")} ${rot}`);
        if (stage.end - stage.start > 1) {
          const k = stage.start + 1 + nextInt(rng, stage.end - stage.start - 1);
          add(n, `${sc} ${s.moves.slice(0, k).join(" ")}`);
        }
      }
      // 윗면 돌리기만 남음
      add(n, `${sc} ${s.moves.join(" ")} U'`);
    }
  }
  // 섞기 상태(쥔 방향 바꿈, 해법 전체도 견줌)
  for (const seed of [31, 32, 33])
    add(3, `${scramble("333", seed).text} x`, true);
  for (const seed of [41, 42])
    add(2, `${scramble("222", seed).text} z y`, true);
  // 이미 맞음, 크기에 판정이 없음, 손으로 고른 상태(십자만 깨짐, F2L 짝 하나만 빠짐)
  add(3, "");
  add(2, "y");
  add(4, "R U");
  add(5, "");
  add(3, "F2");
  add(3, "R U R' U'");
  add(3, "z2 R U R' U'");
  add(3, "z2 F R U R' U' F' R U R'");
  return out;
}

export function buildHint(): string {
  return fixtureJson(
    {
      what: "상태(맞춘 큐브에 alg) → Cubie 공식 보기(pickHint)와 사람 해법(3×3 solveCfop·2×2 solveAdvanced2) 수·단계",
    },
    hintCases().map(({ n, alg, full }) => {
      const st = applyMoves(n, solvedCube(n), parseMoves(n, alg));
      const h = pickHint(n, st);
      const solve = full
        ? n === 3
          ? solveCfop(st)
          : solveAdvanced2(st)
        : null;
      return {
        n,
        alg,
        hint:
          h.kind === "hint"
            ? {
                stage: h.hint.stage,
                name: h.hint.name ?? null,
                before: h.hint.before,
                alg: h.hint.alg,
                lesson: h.hint.lesson ?? null,
              }
            : { kind: h.kind },
        solve: solve && {
          moves: solve.moves.join(" "),
          stages: solve.stages.map((s) => [s.name, s.start, s.end]),
          looks: solve.looks,
        },
      };
    }),
  );
}

/** Rust 코어가 쓰는 사람 해법 공식 표(사이트 `packages/cube-ai/src/algs.ts`) */
export function buildRustHumanData(): string {
  const list = (name: string, doc: string, algs: readonly string[]) =>
    [
      `/// ${doc}`,
      `pub const ${name}: &[&str] = &[`,
      ...algs.map((a) => `    ${JSON.stringify(a)},`),
      "];",
      "",
    ].join("\n");
  return [
    "// 사이트 자료에서 만든 파일이다. 손으로 고치지 않는다.",
    "// 다시 만들기: CUBE_CORE_FIXTURES=write pnpm vitest run apps/web/src/cube/native/",
    "// 원본: packages/cube-ai/src/algs.ts",
    "",
    list("EO_2LOOK", "2단계 OLL 첫째: 노란 십자", EO_2LOOK),
    list("OCLL", "2단계 OLL 둘째: 꼭짓점 방향 7", OCLL),
    list("OCLL_2X2", "2×2 윗면 7", OCLL_2X2),
    list("CPLL", "2단계 PLL 첫째·2×2 윗층: 꼭짓점 자리", CPLL),
    list("EPLL", "2단계 PLL 둘째: 모서리 자리", EPLL),
    list("OLL", "OLL 57(번호 차례)", OLL),
    "/// PLL 21(이름, 공식)",
    "pub const PLL: &[(&str, &str)] = &[",
    ...PLL.map(
      ([name, alg]) => `    (${JSON.stringify(name)}, ${JSON.stringify(alg)}),`,
    ),
    "];",
    "",
  ].join("\n");
}
