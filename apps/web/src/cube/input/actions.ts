import type { Axis, CubeMove } from "../view/types";

/**
 * 동작(docs/47 4-1): "무엇을 하는가". 키 배치는 키 → 동작 이름만 들고, 동작이 수(CubeMove)로 바뀌는 것은 여기서 한다.
 *
 * 동작 이름(문자열, 배치 JSON에 그대로 저장):
 * - 수: WCA 표기 한 수. `R` `R'` `R2` `Rw` `3Rw'` `2R` `r` `M` `E'` `S2` `x` `y'` `z2`
 * - 다음 수 깊이: `depth:2` … `depth:7`(다음 면 수 앞에 숫자를 붙인다. `R` → `3R`, `Rw` → `3Rw`)
 * - 명령: `undo`(되돌리기) `reset`(맞춘 상태로) `scramble`(다시 섞기) `inspectionSkip`(살펴보기 접기·블라인드 시작/끝)
 *   `peekBack`·`peekDown`(누르는 동안 뒤·아래 살짝 보기)
 */

export type ActionId = string;

export const COMMANDS = [
  "undo",
  "reset",
  "scramble",
  "inspectionSkip",
  "peekBack",
  "peekDown",
] as const;
export type Command = (typeof COMMANDS)[number];

export const COMMAND_LABEL: Record<Command, string> = {
  undo: "되돌리기",
  reset: "맞춘 상태로",
  scramble: "다시 섞기",
  inspectionSkip: "살펴보기 접기·블라인드 시작/끝",
  peekBack: "뒤 살짝 보기(누르는 동안)",
  peekDown: "아래 살짝 보기(누르는 동안)",
};

export type ParsedAction =
  | { kind: "move"; notation: string }
  | { kind: "depth"; depth: number }
  | { kind: "command"; command: Command };

/** 이 프로그램이 다루는 가장 큰 큐브 */
export const MAX_N = 7;
export const MIN_N = 2;

type FaceLetter = "R" | "L" | "U" | "D" | "F" | "B";

/** 면 글자 → 축과 끝(+ 끝 면인지) */
const FACE: Record<FaceLetter, { axis: Axis; plus: boolean }> = {
  R: { axis: "x", plus: true },
  L: { axis: "x", plus: false },
  U: { axis: "y", plus: true },
  D: { axis: "y", plus: false },
  F: { axis: "z", plus: true },
  B: { axis: "z", plus: false },
};

/** 가운데 층이 따라 도는 면(M은 L, E는 D, S는 F) */
const SLICE: Record<"M" | "E" | "S", FaceLetter> = { M: "L", E: "D", S: "F" };
/** 큐브 돌리기가 따라 도는 면 */
const ROTATION: Record<"x" | "y" | "z", FaceLetter> = {
  x: "R",
  y: "U",
  z: "F",
};

const MOVE_RE = /^(?:(\d+)?([RLUDFB])(w)?|([rludfb])|([MES])|([xyz]))(2|')?$/;

function turnsOf(suffix: string | undefined): 1 | 2 | 3 {
  return suffix === "2" ? 2 : suffix === "'" ? 3 : 1;
}

/**
 * 면 기준 층 범위 [a, b](그 면에서부터 1..)를 계약의 수로. 그 면이 - 끝이면 층 번호를 뒤집고 방향도 뒤집는다
 * (- 끝에서 시계 = + 끝에서 반시계).
 */
function faceMove(
  n: number,
  face: FaceLetter,
  a: number,
  b: number,
  turns: 1 | 2 | 3,
): CubeMove {
  const f = FACE[face];
  if (f.plus) return { axis: f.axis, from: a, to: b, turns };
  return {
    axis: f.axis,
    from: n + 1 - b,
    to: n + 1 - a,
    turns: (4 - turns) as 1 | 2 | 3,
  };
}

/** 표기 한 수 → 계약의 수. 그 크기에서 뜻이 없으면 null(짝수 크기의 M, 크기보다 깊은 층 등) */
export function notationToMove(n: number, text: string): CubeMove | null {
  const m = MOVE_RE.exec(text);
  if (!m) return null;
  const [, prefix, face, wide, lower, slice, rot, suffix] = m;
  const turns = turnsOf(suffix);
  if (face) {
    const k = prefix === undefined ? (wide ? 2 : 1) : Number(prefix);
    if (!Number.isInteger(k) || k < 1 || k > n) return null;
    // 숫자만 붙은 `1R`은 쓰지 않는다(그냥 R)
    if (prefix !== undefined && !wide && k === 1) return null;
    return wide
      ? faceMove(n, face as FaceLetter, 1, k, turns)
      : faceMove(n, face as FaceLetter, k, k, turns);
  }
  if (lower) {
    if (n < 2) return null;
    return faceMove(n, lower.toUpperCase() as FaceLetter, 1, 2, turns);
  }
  if (slice) {
    if (n < 3 || n % 2 === 0) return null;
    const mid = (n + 1) / 2;
    return faceMove(n, SLICE[slice as "M" | "E" | "S"], mid, mid, turns);
  }
  if (rot) return faceMove(n, ROTATION[rot as "x" | "y" | "z"], 1, n, turns);
  return null;
}

export function parseAction(id: ActionId): ParsedAction | null {
  if ((COMMANDS as readonly string[]).includes(id))
    return { kind: "command", command: id as Command };
  const d = /^depth:(\d+)$/.exec(id);
  if (d) {
    const depth = Number(d[1]);
    return depth >= 2 && depth <= MAX_N ? { kind: "depth", depth } : null;
  }
  return MOVE_RE.test(id) ? { kind: "move", notation: id } : null;
}

/** 어느 크기에서든 뜻이 있는 동작 이름인지(배치 가져오기 검증용) */
export function isKnownAction(id: string): boolean {
  const p = parseAction(id);
  if (!p) return false;
  if (p.kind !== "move") return true;
  for (let n = MIN_N; n <= MAX_N; n++)
    if (notationToMove(n, p.notation)) return true;
  return false;
}

/**
 * 다음 수 깊이를 붙인다. 면 수(`R` `R'` `Rw` `r`)에만 붙고, 이미 숫자가 있거나 가운데 층·큐브 돌리기면 그대로.
 */
export function withDepth(notation: string, depth: number): string {
  const m = /^([RLUDFB])(w)?(2|')?$/.exec(notation);
  if (m) return `${depth}${m[1]}${m[2] ?? ""}${m[3] ?? ""}`;
  const l = /^([rludfb])(2|')?$/.exec(notation);
  if (l) return `${depth}${(l[1] ?? "").toUpperCase()}w${l[2] ?? ""}`;
  return notation;
}

export type ActionGroup =
  | "face"
  | "wide"
  | "inner"
  | "slice"
  | "rotate"
  | "depth"
  | "command";

export interface ActionInfo {
  id: ActionId;
  group: ActionGroup;
  label: string;
}

const FACES: FaceLetter[] = ["R", "L", "U", "D", "F", "B"];
const SUFFIXES = ["", "'", "2"] as const;

/**
 * 크기 n에서 쓸 수 있는 동작 목록(설정 화면·키 그림이 쓴다).
 * - 면 R L U D F B: 모든 크기
 * - 넓게 Rw …: 3×3 이상
 * - 안쪽 한 층 2R …(가운데까지), 넓게 3Rw …(가운데까지): 4×4 이상
 * - 가운데 층 M E S: 홀수 크기(3×3 이상)
 * - 큐브 돌리기 x y z: 모든 크기
 * - 다음 수 깊이 2..n-1: 4×4 이상
 */
export function actionsFor(n: number): ActionInfo[] {
  const out: ActionInfo[] = [];
  const moves = (group: ActionGroup, base: string) => {
    for (const s of SUFFIXES)
      out.push({ id: `${base}${s}`, group, label: `${base}${s}` });
  };
  for (const f of FACES) moves("face", f);
  if (n >= 3) for (const f of FACES) moves("wide", `${f}w`);
  if (n >= 4) {
    const half = Math.ceil(n / 2);
    for (let k = 2; k <= half; k++)
      for (const f of FACES) moves("inner", `${k}${f}`);
    for (let k = 3; k <= half; k++)
      for (const f of FACES) moves("wide", `${k}${f}w`);
  }
  if (n >= 3 && n % 2 === 1) for (const s of ["M", "E", "S"]) moves("slice", s);
  for (const r of ["x", "y", "z"]) moves("rotate", r);
  if (n >= 4)
    for (let d = 2; d <= n - 1; d++)
      out.push({
        id: `depth:${d}`,
        group: "depth",
        label: `다음 수 깊이 ${d}`,
      });
  for (const c of COMMANDS)
    out.push({ id: c, group: "command", label: COMMAND_LABEL[c] });
  return out;
}

/** 크기 n에서 이 동작을 쓸 수 있는지 */
export function isAvailable(n: number, id: ActionId): boolean {
  const p = parseAction(id);
  if (!p) return false;
  if (p.kind === "command") return true;
  if (p.kind === "depth") return n >= 4 && p.depth <= n - 1;
  // 안쪽 한 층(2R 등)과 깊이 붙은 넓게(3Rw)는 4×4부터, 넓게는 3×3부터
  if (/^\d/.test(p.notation) && n < 4) return false;
  if (/^[RLUDFB]w|^[rludfb]/.test(p.notation) && n < 3) return false;
  return notationToMove(n, p.notation) !== null;
}

export function actionLabel(id: ActionId): string {
  const p = parseAction(id);
  if (!p) return id;
  if (p.kind === "command") return COMMAND_LABEL[p.command];
  if (p.kind === "depth") return `깊이 ${p.depth}`;
  return p.notation;
}
