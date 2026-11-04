// 키 그림의 면 색(2026-11-04 사용자 요청): 키를 보면서 손에 익히게, 면 돌리기 키를 그 면의 색으로 칠한다.
// 색의 기준은 「들고 있는 방향」: 처음 방향(흰 위·초록 앞)에서 큐브 전체 돌리기를 따라간 방향이다. 홀수 큐브는 가운데 칸이
// 곧 그 방향이고, 짝수 큐브는 받은 수를 따라간다(절반 넘는 층을 함께 돌리는 넓게도 큐브 전체 돌리기로 친다).
// 모두 순수 함수이고 `key-colors.test.ts`가 엔진으로 확인한다.
import {
  applyMoves,
  type CubeMove,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { canonicalNotation, notationToMove } from "../input/actions";

/** 들고 있는 방향: orient[f] = 지금 면 f(U R F D L B 자리)에 오는 색(면 번호) */
export type Orient = readonly number[];
export const HOME_ORIENT: Orient = [0, 1, 2, 3, 4, 5];

const FACE_OF: Record<string, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

/** 3×3에서 한 수 뒤 가운데 색: 면 f에 오는 원래 면 */
function centersAfter(notation: string): number[] {
  const s = applyMoves(3, solvedCube(3), parseMoves(3, notation));
  const c = faceColors(3, s);
  return [0, 1, 2, 3, 4, 5].map((f) => c[f * 9 + 4] as number);
}

/** 홀수 큐브: 가운데 칸으로 읽는다. 짝수는 null */
export function orientFromCenters(
  n: number,
  state: PuzzleState,
): Orient | null {
  if (n % 2 === 0) return null;
  const c = faceColors(n, state);
  const nn = n * n;
  const mid = (nn - 1) / 2;
  return [0, 1, 2, 3, 4, 5].map((f) => c[f * nn + mid] as number);
}

/**
 * 수 하나 뒤 들고 있는 방향. 큐브 전체 돌리기, 그리고 절반 넘는 층을 함께 돌리는 수(3×3의 Rw·M, 4×4의 3Rw)는
 * 그 축의 큐브 전체 돌리기로 친다. 나머지 수는 방향을 바꾸지 않는다
 */
export function orientAfter(n: number, orient: Orient, move: CubeMove): Orient {
  const layers = move.to - move.from + 1;
  if (layers * 2 <= n) return orient;
  // 엔진의 수는 어느 쪽 층이든 + 끝에서 본 방향이라, 큐브 전체 돌리기도 같은 방향이다(Lw = R x')
  const turns = move.turns;
  const name = { x: "x", y: "y", z: "z" }[move.axis];
  const sfx = turns === 2 ? "2" : turns === 3 ? "'" : "";
  const moved = centersAfter(`${name}${sfx}`);
  return moved.map((from) => orient[from] as number);
}

/** 키 칠하기 한 칸 */
export type KeyPaint =
  | {
      kind: "face";
      /** 그 면의 지금 색(면 번호) */
      color: number;
      /** 반대 방향(') */
      prime: boolean;
      /** 넓게(두 층 이상) */
      wide: boolean;
    }
  | {
      kind: "sweep";
      /** 큐브 전체 돌리기·가운데 층: 앞(또는 위) 줄을 어디로 보내나. [보내는 면 색, 받는 면 색] */
      from: number;
      to: number;
      prime: boolean;
    };

/** x·y·M·E는 앞 줄, z·S는 위 줄이 어디로 가는지 */
const SWEEP_SOURCE: Record<string, number> = {
  x: 2,
  y: 2,
  M: 2,
  E: 2,
  z: 0,
  S: 0,
};

/** 3×3에서 그 수를 하면 면 `source`의 색이 가는 면 */
function sweepTarget(letter: string, source: number): number {
  const after = centersAfter(letter);
  return after.indexOf(source);
}

/** 동작 하나(표기)의 칠하기. 면 돌리기·넓게·안쪽 층은 그 면 색, x·y·z·M·E·S는 두 색 화살. 그 밖은 null */
export function keyPaint(
  n: number,
  orient: Orient,
  action: string,
): KeyPaint | null {
  if (!notationToMove(n, action)) return null;
  const name = canonicalNotation(n, action);
  const prime = name.endsWith("'");
  const m = /^(\d*)([RLUDFB])(w?)|^([rludfb])|^([xyzMES])/.exec(name);
  if (!m) return null;
  const letter = m[2] ?? m[4]?.toUpperCase();
  if (letter) {
    return {
      kind: "face",
      color: orient[FACE_OF[letter] as number] as number,
      prime,
      wide: m[3] === "w" || m[4] !== undefined,
    };
  }
  const sweep = m[5] as string;
  const source = SWEEP_SOURCE[sweep] as number;
  const target = sweepTarget(sweep, source);
  const from = orient[source] as number;
  const to = orient[target] as number;
  return prime
    ? { kind: "sweep", from: to, to: from, prime }
    : { kind: "sweep", from, to, prime };
}

/**
 * 키 칸 색의 토큰(2026-11-05 사용자 「키보드 색이 너무 또렷해서 눈이 아파」). 칸을 면 색으로 꽉 채우지 않고 어두운
 * 바탕에 옅게 섞고, 면 색 그대로는 칸 아래 띠에만 쓴다. 반대 방향(')은 더 옅게 + 띠를 끊어(무늬라 색약이어도 구별).
 * 글자는 어느 칸이든 밝은 글자라 흰·노랑 칸에서도 눈부시지 않다.
 */
export const KEY_TONE = {
  /** 페이지 바탕(neutral-900) */
  page: 0x171717,
  /** 칸 바탕에 섞는 면 색 비율 */
  fill: 0.2,
  primeFill: 0.1,
  /** 테두리에 섞는 면 색 비율 */
  border: 0.6,
  primeBorder: 0.35,
} as const;

/** 두 색 섞기: rgb를 alpha만큼, 나머지는 base */
export function mixRgb(
  rgb: number,
  alpha: number,
  base: number = KEY_TONE.page,
): number {
  const ch = (shift: number) =>
    Math.round(
      ((rgb >> shift) & 255) * alpha + ((base >> shift) & 255) * (1 - alpha),
    );
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 면 돌리기 키 칸의 바탕·테두리 색 */
export function keyTone(
  rgb: number,
  prime: boolean,
): { fill: number; border: number } {
  return {
    fill: mixRgb(rgb, prime ? KEY_TONE.primeFill : KEY_TONE.fill),
    border: mixRgb(rgb, prime ? KEY_TONE.primeBorder : KEY_TONE.border),
  };
}

/** 밝기(0~255) */
export function lumaOf(rgb: number): number {
  return (
    0.299 * ((rgb >> 16) & 255) +
    0.587 * ((rgb >> 8) & 255) +
    0.114 * (rgb & 255)
  );
}
