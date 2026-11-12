/**
 * Rust 코어 공통 시험 자료 가운데 Cubie 네이티브 4단계(docs/52)의 것: 한 판 세션(기록 칸), 사람 해법과 공식 보기,
 * 공식 연습 진행기. 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다. 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import { solveAdvanced2, solveCfop } from "@game/cube-ai";
import {
  applyMoves,
  formatMove,
  invertMove,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import { ManualClock } from "@game/fair-play";
import { createRng, nextInt, type RngState } from "@game/mighty-engine";

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
