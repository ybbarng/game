import { formatMove, isRotation, parseMoves } from "@game/cube-engine";
import { FACES } from "@game/cube-solver";
import type { PuzzleState } from "@game/puzzle-core";
import { cornerFacelets, EDGE_FACELETS } from "./cubie";
import { toFacelets } from "./facelets";
import { whiteDown } from "./methods";
import { Solve, uTurn, yTurn } from "./solve";
import {
  type CrossCase,
  cornersTaught,
  crossTaught,
  edgeSidesMatched,
  llCornerPlaceTaught,
  llCornerTwistTaught,
  llEdgesTaught,
  middleTaught,
  nextCrossEdge,
  placedTop,
  TAUGHT_CORNER_CYCLE,
  TAUGHT_CORNER_TRIGGER,
  TAUGHT_EDGE_SWAP,
  TAUGHT_MIDDLE_FROM_FRONT,
  TAUGHT_MIDDLE_FROM_RIGHT,
  whiteUp,
  yellowCrossTaught,
} from "./taught";

/**
 * 배우기 해 보기의 힌트(docs/47 8-1): 3×3 초보자 과정 한 단계를 지금 상태에서 배우는 방식 그대로 끝내는 수와,
 * 그 수를 「경우」마다 나눈 토막. 토막마다 그 경우가 무엇인지 자료로 붙인다(화면이 「흰-빨강 모서리: 가운데 줄」처럼
 * 이름을 짓는다). 수는 해법 함수(`taught.ts`, 둘째 층은 `methods.ts`의 입문)가 둔 그대로이고 합치지 않는다
 * (토막 경계가 그대로 남게). 흰 십자·첫 층 꼭짓점은 흰 면 위, 둘째 층부터는 흰 면 아래에서 한다.
 * 쥐는 방향이 다르면 첫 토막이 큐브 돌리기(`hold`)다. 끝낼 수 없는 상태(앞 단계가 흐트러짐 등)면 던진다.
 */

export type TaughtStage =
  | "cross"
  | "corners"
  | "middle"
  | "eo"
  | "ll-edges"
  | "ll-corner-place"
  | "ll-corner-twist";

export const TAUGHT_STAGES: readonly TaughtStage[] = [
  "cross",
  "corners",
  "middle",
  "eo",
  "ll-edges",
  "ll-corner-place",
  "ll-corner-twist",
];

/** 실제 색 글자(맞춘 상태에서 그 면에 있던 색: U 흰, R 빨강, F 초록, D 노랑, L 주황, B 파랑) */
export type ColorLetter = "U" | "R" | "F" | "D" | "L" | "B";

/** 한 토막이 다루는 경우 */
export type TaughtCase =
  /** 큐브 쥐기: 흰 면을 위로(흰 십자·첫 층) 또는 아래로(둘째 층부터) */
  | { kind: "hold"; white: "up" | "down" }
  /** 흰 십자 모서리 하나와 그 경우(레슨의 다섯 경우) */
  | { kind: "cross"; colors: ColorLetter[]; case: CrossCase }
  /**
   * 첫 층 꼭짓점 하나. bottom: 아래층에서 칸 밑으로 데려와 넣기, slot: 제 칸에서 돌아감, stuck: 엉뚱한 칸에 박혀 한 번 빼기.
   * white: 공식 직전 흰 스티커가 보는 쪽. shortcut: 지름길(`TAUGHT_CORNER_SHORTCUT`·`TAUGHT_CORNER_SLOT`)로 넣음,
   * 아니면 reps: `R' D' R D` 횟수(지름길이면 0)
   */
  | {
      kind: "corner";
      colors: ColorLetter[];
      from: "bottom" | "slot" | "stuck";
      white: "right" | "down" | "front";
      reps: number;
      shortcut: boolean;
    }
  /**
   * 둘째 층 엣지 하나. 늘 앞-오른쪽 칸에 넣는다. front: 앞 위에서, right: 오른쪽 위에서 들어옴,
   * stuck: 칸에 잘못 든 것을 앞 공식으로 빼냄
   */
  | { kind: "middle"; colors: ColorLetter[]; side: "front" | "right" | "stuck" }
  /** 노란 십자: 지금 모양 */
  | { kind: "eo"; shape: "dot" | "ell" | "line" }
  /** 옆면 맞추기: 맞은 두 모서리가 이웃(ㄱ자)인지 마주 보는지(일자) */
  | { kind: "ll-edges"; pattern: "adjacent" | "opposite" }
  /** 꼭짓점 자리: 제자리 꼭짓점 수 */
  | { kind: "corner-place"; placed: 0 | 1 }
  /** 꼭짓점 방향: 앞-오른쪽 위 꼭짓점의 노랑이 보는 쪽과 횟수 */
  | { kind: "twist"; yellow: "right" | "front"; reps: number }
  /** 윗면만 돌려 옆색 맞추기 */
  | { kind: "auf" };

export interface TaughtSegment {
  /** 이 토막 첫 수 번호(`moves` 안) */
  start: number;
  /** 마지막 수 다음 번호 */
  end: number;
  info: TaughtCase;
}

export interface TaughtPlan {
  stage: TaughtStage;
  /** WCA 표기 한 수씩(큐브 돌리기 x·y·z 포함) */
  moves: string[];
  segments: TaughtSegment[];
}

export interface TaughtPlanOptions {
  /** 첫 층 코너를 지름길 대신 `R' D' R D` 되풀이로(배우기에서 지름길을 배우기 전) */
  cornerRepeat?: boolean;
}

const RUNS: Record<TaughtStage, (s: Solve, o: TaughtPlanOptions) => void> = {
  cross: (s) => {
    whiteUp(s);
    crossTaught(s);
  },
  corners: (s, o) => {
    whiteUp(s);
    cornersTaught(s, { repeat: o.cornerRepeat === true });
  },
  middle: (s) => {
    whiteDown(s);
    middleTaught(s);
  },
  eo: (s) => {
    whiteDown(s);
    yellowCrossTaught(s);
  },
  "ll-edges": (s) => {
    whiteDown(s);
    llEdgesTaught(s);
  },
  "ll-corner-place": (s) => {
    whiteDown(s);
    // 옆면 맞추기의 끝 윗면 돌리기를 안 했으면 먼저(그 목표는 윗면 돌리기 하나를 봐준다)
    const a = [0, 1, 2, 3].find((a) =>
      edgeSidesMatched(s.clone().apply(uTurn(a)).rel()).every(Boolean),
    );
    if (a === undefined) throw new Error("위 모서리 옆색이 맞지 않는다");
    s.apply(uTurn(a));
    llCornerPlaceTaught(s);
  },
  "ll-corner-twist": (s) => {
    whiteDown(s);
    llCornerTwistTaught(s);
  },
};

const tokens = (alg: string) => alg.split(" ");
const TRIGGER = tokens(TAUGHT_CORNER_TRIGGER);
const EDGE_SWAP = tokens(TAUGHT_EDGE_SWAP);
const CYCLE = tokens(TAUGHT_CORNER_CYCLE);
const FROM_FRONT = tokens(TAUGHT_MIDDLE_FROM_FRONT);
const FROM_RIGHT = tokens(TAUGHT_MIDDLE_FROM_RIGHT);

/** `list`의 `at`부터 `part`가 그대로 있는가 */
const startsAt = (list: readonly string[], at: number, part: string[]) =>
  part.every((t, i) => list[at + i] === t);

/** `part`가 처음 나오는 자리(없으면 -1) */
function indexOf(list: readonly string[], part: string[], from = 0): number {
  for (let i = from; i + part.length <= list.length; i++)
    if (startsAt(list, i, part)) return i;
  return -1;
}

/** `at`부터 `part`가 몇 번 이어지는가 */
function repeats(list: readonly string[], at: number, part: string[]): number {
  let k = 0;
  while (startsAt(list, at + k * part.length, part)) k++;
  return k;
}

/** `part`가 마지막으로 끝나는 자리 다음(없으면 -1) */
function lastEnd(list: readonly string[], part: string[]): number {
  for (let i = list.length - part.length; i >= 0; i--)
    if (startsAt(list, i, part)) return i + part.length;
  return -1;
}

type Face = (typeof FACES)[number];
const faceAt = (i: number) => FACES[Math.floor(i / 9)] as Face;

/** 기준 방향 글자(지금 쥔 면 이름) → 그 면 가운데의 실제 색 */
const colorOfFace = (s: Solve, face: Face) =>
  s.f[FACES.indexOf(face) * 9 + 4] as ColorLetter;

/** 이름 차례: 흰·노랑 → 초록·파랑 → 빨강·주황(「흰-초록-빨강」) */
const RANK: Record<ColorLetter, number> = {
  U: 0,
  D: 0,
  F: 1,
  B: 1,
  R: 2,
  L: 2,
};
const named = (colors: ColorLetter[]) =>
  [...colors].sort((a, b) => RANK[a] - RANK[b]);

/** 꼭짓점 자리 `slot`(cubie 번호)의 제자리 조각 색 */
function cornerHomeColors(s: Solve, slot: number): ColorLetter[] {
  const facelets = cornerFacelets(3)[slot] as number[];
  return named(facelets.map((i) => colorOfFace(s, faceAt(i))));
}

function classify(
  stage: TaughtStage,
  t: Solve,
  seg: readonly string[],
  opts: TaughtPlanOptions,
): TaughtCase {
  if (seg.every((m) => parseMoves(3, m).every((x) => isRotation(3, x))))
    return {
      kind: "hold",
      white: stage === "cross" || stage === "corners" ? "up" : "down",
    };
  switch (stage) {
    case "cross": {
      const next = nextCrossEdge(t);
      if (!next) throw new Error("십자가 이미 다 됐다");
      return {
        kind: "cross",
        colors: ["U", colorOfFace(t, next.color)],
        case: next.kind,
      };
    }
    case "corners": {
      // 공식은 처음 옆면(R·F) 수부터. 그 앞은 쥐기(y)와 칸 밑으로(D)
      const i = seg.findIndex((m) => m[0] === "R" || m[0] === "F");
      if (i < 0) throw new Error("첫 층 토막에 공식이 없다");
      const t2 = t.clone().apply(seg.slice(0, i).join(" "));
      const c = t2.cubie();
      const rel = t2.rel();
      const shortcut = opts.cornerRepeat !== true;
      const reps = shortcut ? 0 : repeats(seg, i, TRIGGER);
      if (c.cp[4] === 0) {
        // 칸 밑(앞-오른쪽 아래)의 흰 스티커: 아래 29, 앞 26, 오른쪽 15
        const white =
          rel[29] === "U" ? "down" : rel[26] === "U" ? "front" : "right";
        return {
          kind: "corner",
          colors: cornerHomeColors(t2, 0),
          from: "bottom",
          white,
          reps,
          shortcut,
        };
      }
      if (c.cp[0] === 0)
        return {
          kind: "corner",
          colors: cornerHomeColors(t2, 0),
          from: "slot",
          white: rel[9] === "U" ? "right" : "front",
          reps,
          shortcut,
        };
      const piece = c.cp[0] as number;
      return {
        kind: "corner",
        colors: cornerHomeColors(t2, piece),
        from: "stuck",
        white: rel[9] === "U" ? "right" : rel[20] === "U" ? "front" : "down",
        reps,
        shortcut,
      };
    }
    case "middle": {
      const tail = seg.slice(-8);
      const front = startsAt(tail, 0, FROM_FRONT);
      if (!front && !startsAt(tail, 0, FROM_RIGHT))
        throw new Error("둘째 층 토막에 공식이 없다");
      const t2 = t.clone().apply(seg.slice(0, -8).join(" "));
      const topHasEdge = [0, 1, 2, 3].some(
        (j) => (t.cubie().ep[j] as number) >= 8,
      );
      if (!topHasEdge) {
        const [a, b] = EDGE_FACELETS[8] as readonly [number, number];
        return {
          kind: "middle",
          colors: named([t2.f[a], t2.f[b]] as ColorLetter[]),
          side: "stuck",
        };
      }
      return {
        kind: "middle",
        colors: named(
          (front ? [t2.f[19], t2.f[7]] : [t2.f[10], t2.f[5]]) as ColorLetter[],
        ),
        side: front ? "front" : "right",
      };
    }
    case "eo": {
      const r = t.rel();
      const up = [1, 3, 5, 7].map((i) => r[i] === "U");
      const count = up.filter(Boolean).length;
      if (count === 0) return { kind: "eo", shape: "dot" };
      // 마주 봄: 위(1)·아래(7) 또는 왼쪽(3)·오른쪽(5)
      const line = (up[0] && up[3]) || (up[1] && up[2]);
      return { kind: "eo", shape: line ? "line" : "ell" };
    }
    case "ll-edges": {
      if (indexOf(seg, EDGE_SWAP) < 0) return { kind: "auf" };
      let adjacent = false;
      for (let a = 0; a < 4 && !adjacent; a++)
        for (let k = 0; k < 4 && !adjacent; k++) {
          const m = edgeSidesMatched(
            t.clone().apply(uTurn(a)).apply(yTurn(k)).rel(),
          );
          if (m[0] && m[3]) adjacent = true;
        }
      return {
        kind: "ll-edges",
        pattern: adjacent ? "adjacent" : "opposite",
      };
    }
    case "ll-corner-place":
      if (indexOf(seg, CYCLE) < 0) return { kind: "auf" };
      return {
        kind: "corner-place",
        placed: placedTop(t).length === 1 ? 1 : 0,
      };
    case "ll-corner-twist": {
      const i = indexOf(seg, TRIGGER);
      if (i < 0) return { kind: "auf" };
      const t2 = t.clone().apply(seg.slice(0, i).join(" "));
      return {
        kind: "twist",
        yellow: t2.rel()[9] === "U" ? "right" : "front",
        reps: repeats(seg, i, TRIGGER),
      };
    }
  }
}

/** 지금 상태에서 그 단계를 배우는 방식대로 끝내는 수와 경우별 토막. 첫 층 코너는 기본이 지름길 */
export function taughtStagePlan(
  stage: TaughtStage,
  state: PuzzleState,
  opts: TaughtPlanOptions = {},
): TaughtPlan {
  const start = new Solve(3, toFacelets(3, state));
  const s = start.clone();
  RUNS[stage](s, opts);
  const moves = s.moves.map((m) => formatMove(3, m));
  const cuts = new Set<number>([0, ...s.lookList]);
  // 끝의 윗면 돌리기(옆색 맞추기)는 따로 한 토막
  const formula =
    stage === "ll-edges"
      ? EDGE_SWAP
      : stage === "ll-corner-twist"
        ? TRIGGER
        : null;
  if (formula) {
    const end = lastEnd(moves, formula);
    if (end > 0) cuts.add(end);
  }
  const bounds = [...cuts]
    .filter((i) => i < moves.length)
    .sort((a, b) => a - b);
  const segments: TaughtSegment[] = bounds.map((b, i) => {
    const end = bounds[i + 1] ?? moves.length;
    const seg = moves.slice(b, end);
    const t = start.clone().apply(moves.slice(0, b).join(" "));
    return { start: b, end, info: classify(stage, t, seg, opts) };
  });
  return { stage, moves, segments };
}
