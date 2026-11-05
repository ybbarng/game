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
      /** 표시에 빌려 쓰는 면 색(`SWEEP_FACE`): x = R, y = U, z = F, M = L, E = D, S = F 면의 지금 색 */
      color: number;
      /** 큐브 전체 돌리기(x·y·z)면 true, 가운데 층(M·E·S)이면 false */
      whole: boolean;
    };

/**
 * 큐브 돌리기·가운데 층 키의 표시 색(2026-11-05, 사용자 「x, y, z는 표시할 방법이 마땅치 않았나?」). 한 면의 색은
 * 아니지만 그 수와 같은 쪽으로 도는 면의 색을 빌린다. x·y·z는 같은 축·같은 방향의 R·U·F, M·E·S는 표기 정의에서
 * 따라 도는 L·D·F다.
 */
const SWEEP_FACE: Record<string, number> = {
  x: 1,
  y: 0,
  z: 2,
  M: 4,
  E: 3,
  S: 2,
};

/**
 * 칸 아래 면 색 선의 모양(2026-11-05). 굵기는 모두 같고 칸마다 하나다.
 * - `solid`: 면 돌리기·넓게·안쪽 층. 칸 아래 실선
 * - `dotted`: 큐브 전체 돌리기(x·y·z). 같은 자리에 점선
 * - `short`: 가운데 층(M·E·S). 가운데에만 짧은 선(실선의 1/3쯤)
 * 반대 방향(')은 모양을 바꾸지 않고 밝기와 ′ 표시로 구별한다.
 */
export type KeyMarkShape = "solid" | "dotted" | "short";

export function keyMarkShape(paint: KeyPaint): KeyMarkShape {
  if (paint.kind === "face") return "solid";
  return paint.whole ? "dotted" : "short";
}

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

/** 동작 하나(표기)의 칠하기. 면 돌리기·넓게·안쪽 층은 그 면 색, x·y·z·M·E·S는 빌린 면 색(`SWEEP_FACE`). 그 밖은 null */
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
  const color = orient[SWEEP_FACE[sweep] as number] as number;
  const whole = /[xyz]/.test(sweep);
  return prime
    ? { kind: "sweep", from: to, to: from, prime, color, whole }
    : { kind: "sweep", from, to, prime, color, whole };
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

/**
 * 차분한 키 그림(2026-11-05 다시, 사용자 「키보드 아직 너무 어지러움」, docs/47 4-5). 칸 바탕·테두리는 무채색으로 두고
 * 면 색은 작은 표시 하나에만 쓴다. 안 셋을 견주었고 `KEY_LOOK_DEFAULT`가 권하는 안이다. 다른 안은 이 기기
 * localStorage `cube.keyLook`에 이름을 넣어 볼 수 있다(견주기용, 설정 화면에는 없다).
 * - `line`: 칸 아래에 얇은 면 색 선
 * - `dot`: 칸 오른쪽 위에 면 색 점
 * - `tint`: 칸 바탕에 면 색을 아주 옅게(선·점 없음)
 * 반대 방향(')은 색을 바꾸지 않고 ′ 표시와 밝기(글자·표시를 흐리게)로만 구별한다.
 */
export type KeyLookStyle = "line" | "dot" | "tint";
export const KEY_LOOK_STYLES: readonly KeyLookStyle[] = ["line", "dot", "tint"];
export const KEY_LOOK_DEFAULT: KeyLookStyle = "line";
export const KEY_LOOK_STORAGE = "cube.keyLook";
export const KEY_LOOK_LABEL: Record<KeyLookStyle, string> = {
  line: "아래선",
  dot: "점",
  tint: "옅은 바탕",
};

export function parseKeyLook(v: unknown): KeyLookStyle {
  return KEY_LOOK_STYLES.includes(v as KeyLookStyle)
    ? (v as KeyLookStyle)
    : KEY_LOOK_DEFAULT;
}

/** 차분한 키 그림의 비율 */
export const KEY_CALM = {
  /** `tint` 안: 칸 바탕에 섞는 면 색 비율 */
  tint: 0.16,
  primeTint: 0.08,
  /** 반대 방향 표시(선·점)의 불투명도 */
  primeMark: 0.6,
} as const;

/** `tint` 안의 칸 바탕 */
export function calmTint(rgb: number, prime: boolean): number {
  return mixRgb(rgb, prime ? KEY_CALM.primeTint : KEY_CALM.tint);
}

/**
 * 칸에 키 글자를 따로 적을지. 동작 이름이 키 글자와 같은 글자면(「표기」 배치의 R 키 = R, X 키 = x) 한 번만 적는다.
 * 「두 손」의 L 키 = D'처럼 다르면 키 글자를 작게 따로 적는다
 */
export function capRepeats(cap: string, label: string | undefined): boolean {
  if (!label) return false;
  const core = label.replace(/['′2w]/g, "");
  return core.length === 1 && core.toUpperCase() === cap.toUpperCase();
}

/** 밝기(0~255) */
export function lumaOf(rgb: number): number {
  return (
    0.299 * ((rgb >> 16) & 255) +
    0.587 * ((rgb >> 8) & 255) +
    0.114 * (rgb & 255)
  );
}
