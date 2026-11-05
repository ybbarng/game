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
 * 면 색 표시의 모양(2026-11-05). 칸마다 하나다.
 * - `solid`: 면 돌리기·넓게·안쪽 층. 칸 바탕 전체를 옅게 칠하고 선은 두지 않는다
 * - `dotted`: 큐브 전체 돌리기(x·y·z). 칸 아래 점선(칸 너비의 56%)
 * - `short`: 가운데 층(M·E·S). 칸 아래 가운데에만 짧은 선(칸 너비의 20%)
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
 * 차분한 키 그림(2026-11-05, docs/47 4-5). 칸 테두리는 무채색 하나, 면 색은 칸마다 한 가지로만 쓴다.
 * - 면 돌리기(R·L·U·D·F·B, 넓게·안쪽 층 포함): 칸 바탕에 그 면 색을 옅게(`tint`). 선은 없다
 * - x·y·z: 바탕은 무채색, 축 면 색의 점선 / M·E·S: 바탕은 무채색, 따라 도는 면 색의 가운데 짧은 선
 * 사용자 「정식 색상은 배경색, 응용(xyz, mes)은 선색」. 선 색은 원색 그대로가 아니라 같은 면 색을 칸 바탕(무채색)과
 * 섞은 색이라(`line`), 옅은 바탕과 한 식구로 보이면서 바탕(16%)보다 진해 선으로는 또렷하다.
 * 반대 방향(')은 색을 바꾸지 않고 ′ 표시와 밝기(바탕을 더 옅게, 글자·선을 흐리게)로만 구별한다.
 */
export const KEY_CALM = {
  /** 면 돌리기 칸 바탕에 섞는 면 색 비율 */
  tint: 0.16,
  primeTint: 0.08,
  /** x·y·z·M·E·S 선 색에 섞는 면 색 비율(나머지는 칸 바탕) */
  line: 0.7,
  /** 반대 방향 선의 불투명도 */
  primeMark: 0.6,
  /** 무늬 칸(`KEY_STRIPE`)의 사선 색에 섞는 면 색 비율. 바탕보다 조금만 진해 옅게 보인다 */
  stripe: 0.34,
  primeStripe: 0.2,
} as const;

/** 면 돌리기 칸의 바탕 */
export function calmTint(rgb: number, prime: boolean): number {
  return mixRgb(rgb, prime ? KEY_CALM.primeTint : KEY_CALM.tint);
}

/** x·y·z·M·E·S 선의 색: 같은 면 색을 칸 바탕과 섞어 옅은 바탕과 같은 톤으로(반대 방향은 불투명도로 흐리게) */
export function calmLine(rgb: number): number {
  return mixRgb(rgb, KEY_CALM.line);
}

/**
 * 무늬를 넣는 면 색(2026-11-05, 사용자 「색약 친화에서는 진하기 연하기 대신에 사선 패턴 같은 걸로 하면 되지 않을까」).
 * 옅은 바탕은 채도가 빠져 따뜻한 세 면(R·L·D)이 모두 갈색에 가까워진다. 16% 바탕의 색조가 색약 친화는
 * R 26°·L 42°·D 56°, 높은 대비는 R 0°·L 32°·D 56°로 두 배색 모두 L(주황)이 R·D 사이 한가운데에 있어, L 한 면에만
 * 사선을 넣으면 R·L과 L·D 두 쌍이 함께 갈린다(R·D는 30° 넘게 떨어져 색으로 갈린다). 여섯 면 모두 다른 무늬를 두면
 * 어지러워서 한 면만 둔다. 표준 배색(R 350°·L 20°·D 50°)과 직접 고른 색은 무늬가 없다.
 * 값은 면 자리가 아니라 색 번호라 큐브를 돌려 주황이 다른 키로 가도 무늬가 따라간다.
 */
export const KEY_STRIPE: Partial<Record<string, number>> = {
  colorblind: 4,
  highContrast: 4,
};

/** 그 배색에서 이 색(면 번호)의 칸에 사선 무늬를 넣는지 */
export function stripedColor(scheme: string, color: number): boolean {
  return KEY_STRIPE[scheme] === color;
}

/** 사선 무늬(칸 바탕 위, CSS `background-image`). 2px 선·5px 틈의 옅은 사선 */
export function stripeImage(rgb: number, prime: boolean): string {
  const c = mixRgb(rgb, prime ? KEY_CALM.primeStripe : KEY_CALM.stripe);
  const hex = `#${c.toString(16).padStart(6, "0")}`;
  return `repeating-linear-gradient(135deg, ${hex} 0 2px, transparent 2px 7px)`;
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
