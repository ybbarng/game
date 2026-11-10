import {
  type ActionId,
  actionLabel,
  actionsFor,
  canonicalNotation,
  isAvailable,
  parseAction,
} from "../input/actions";
import {
  chordsFor,
  type KeyChord,
  type Keymap,
  resolveAction,
} from "../input/keymaps";
import { keyTextFor } from "./reach";

/**
 * 키보드 그림(단축키 표·키 익히기·큐브 아래 작은 키 그림이 함께 쓴다, docs/47 4절). 실제 키보드처럼 숫자 줄·
 * QWERTY 세 줄·스페이스 줄을 키 너비 비례로 둔다(한 줄 15칸). 칸마다 지금 배치의 동작을 층별로 읽는다.
 */

export interface KeySlot {
  code: string;
  /** 너비(보통 키 = 1) */
  width: number;
}

const letters = (s: string): KeySlot[] =>
  [...s].map((c) => ({ code: `Key${c}`, width: 1 }));
const slot = (code: string, width = 1): KeySlot => ({ code, width });

/** 화살표 묶음(위 하나, 아래 셋)을 한 칸으로 그린다 */
export const ARROWS = "Arrows";

export const KEYBOARD_ROWS: KeySlot[][] = [
  [slot("Escape")],
  [
    slot("Backquote"),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => slot(`Digit${d}`)),
    slot("Minus"),
    slot("Equal"),
    slot("Backspace", 2),
  ],
  [
    slot("Tab", 1.5),
    ...letters("QWERTYUIOP"),
    slot("BracketLeft"),
    slot("BracketRight"),
    slot("Backslash", 1.5),
  ],
  [
    slot("CapsLock", 1.75),
    ...letters("ASDFGHJKL"),
    slot("Semicolon"),
    slot("Quote"),
    slot("Enter", 2.25),
  ],
  [
    slot("ShiftLeft", 2.25),
    ...letters("ZXCVBNM"),
    slot("Comma"),
    slot("Period"),
    slot("Slash"),
    slot("ShiftRight", 2.75),
  ],
  [
    slot("ControlLeft", 1.25),
    slot("MetaLeft", 1.25),
    slot("AltLeft", 1.25),
    slot("Space", 6.25),
    slot("AltRight", 1.25),
    slot("Gap", 0.75),
    slot(ARROWS, 3),
  ],
];

/** 동작을 일으키지 않는 키(누르는 키와 함께 쓰는 키). 그림에는 이름만 */
export const MODIFIER_LABEL: Record<string, string> = {
  Tab: "Tab",
  CapsLock: "Caps",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Ctrl",
  MetaLeft: "⌘",
  AltLeft: "Alt",
  AltRight: "Alt",
};

const LEFT_CODES = new Set([
  "Escape",
  "Backquote",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Tab",
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyT",
  "CapsLock",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyG",
  "ShiftLeft",
  "KeyZ",
  "KeyX",
  "KeyC",
  "KeyV",
  "KeyB",
  "ControlLeft",
  "MetaLeft",
  "AltLeft",
]);

/** 이 키를 치는 손(타자 자리 기준). 스페이스는 어느 손이든 */
export function handOf(code: string): "left" | "right" | null {
  if (code === "Space" || code === "Gap") return null;
  return LEFT_CODES.has(code) ? "left" : "right";
}

export type ActionKind = "face" | "layer" | "rotate" | "command";
export type FaceLetter = "R" | "L" | "U" | "D" | "F" | "B";

/** 색 묶음: 면 돌리기(면마다 색)·넓게·안쪽·가운데 층·큐브 돌리기·명령 */
export function kindOf(id: ActionId): { kind: ActionKind; face?: FaceLetter } {
  const p = parseAction(id);
  if (!p || p.kind === "command") return { kind: "command" };
  if (p.kind === "depth" || p.kind === "layers") return { kind: "layer" };
  const t = p.notation;
  if (/^[RLUDFB]['2]?$/.test(t))
    return { kind: "face", face: t[0] as FaceLetter };
  if (/^[xyz]/.test(t)) return { kind: "rotate" };
  return { kind: "layer" };
}

export type Layer = "plain" | "shift" | "alt" | "altShift";
export const LAYERS: Layer[] = ["plain", "shift", "alt", "altShift"];
export const LAYER_LABEL: Record<Layer, string> = {
  plain: "그냥",
  shift: "Shift",
  alt: "Alt",
  altShift: "Alt+Shift",
};

export interface KeyAction {
  action: ActionId;
  label: string;
  kind: ActionKind;
  face?: FaceLetter;
  /** 이 크기에서 쓸 수 있는지(없으면 흐리게) */
  usable: boolean;
}

const input = (code: string, layer: Layer) => ({
  code,
  shiftKey: layer === "shift" || layer === "altShift",
  altKey: layer === "alt" || layer === "altShift",
  ctrlKey: false,
  metaKey: false,
  repeat: false,
});

/** 키 하나의 층별 동작 */
export function keyLayers(
  keymap: Keymap,
  n: number,
  code: string,
): Partial<Record<Layer, KeyAction>> {
  const out: Partial<Record<Layer, KeyAction>> = {};
  for (const layer of LAYERS) {
    const action = resolveAction(keymap, input(code, layer));
    if (action === null) continue;
    out[layer] = {
      action,
      // 3×3의 둘째 층(2U)은 가운데 층 이름(E')으로 적는다
      label:
        parseAction(action)?.kind === "move"
          ? canonicalNotation(n, action)
          : shortLabel(action),
      ...kindOf(action),
      usable: isAvailable(n, action),
    };
  }
  return out;
}

/** 키 칸에 들어갈 짧은 이름(명령은 낱말 하나) */
const SHORT_COMMAND: Record<string, string> = {
  undo: "되돌리기",
  reset: "처음으로",
  scramble: "섞기",
  inspectionSkip: "살펴보기",
  peekBack: "뒤 보기",
  peekDown: "아래 보기",
  viewHome: "처음 각도",
};

export function shortLabel(action: ActionId): string {
  const p = parseAction(action);
  // 층 수 키는 칸이 좁아 「오른손 층 +」로
  if (p?.kind === "layers")
    return `${p.side === "L" ? "왼손" : "오른손"} 층 ${p.delta > 0 ? "+" : "−"}`;
  return SHORT_COMMAND[action] ?? actionLabel(action);
}

export interface KeyCell extends KeySlot {
  /** 키에 적힌 글자 */
  cap: string;
  hand: "left" | "right" | null;
  modifier: boolean;
  layers: Partial<Record<Layer, KeyAction>>;
}

export function keyboardCells(keymap: Keymap, n: number): KeyCell[][] {
  return KEYBOARD_ROWS.map((row) =>
    row.map((s) => ({
      ...s,
      cap: capOf(s.code),
      hand: handOf(s.code),
      modifier: s.code in MODIFIER_LABEL,
      layers:
        s.code in MODIFIER_LABEL || s.code === ARROWS || s.code === "Gap"
          ? {}
          : keyLayers(keymap, n, s.code),
    })),
  );
}

const CAPS: Record<string, string> = {
  Escape: "Esc",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Backspace: "⌫",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Enter: "Enter",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Gap: "",
  [ARROWS]: "",
};

export function capOf(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return MODIFIER_LABEL[code] ?? CAPS[code] ?? code;
}

// ---------------------------------------------------------------- 동작 → 키 목록

export interface ActionRow {
  action: ActionId;
  label: string;
  kind: ActionKind;
  face?: FaceLetter;
  /** 치는 키(없으면 null) */
  keys: string | null;
  /** 바로 놓인 키 */
  chords: KeyChord[];
}

/** 크기 n에서 쓸 수 있는 동작마다 치는 키(단축키 표 아래 목록) */
export function actionRows(keymap: Keymap, n: number): ActionRow[] {
  return actionsFor(n).map((a) => ({
    action: a.id,
    label: a.label,
    ...kindOf(a.id),
    keys: keyTextFor(keymap, n, a.id),
    chords: chordsFor(keymap, a.id),
  }));
}

/**
 * 목록 찾기. 표기는 대소문자를 가린다(r과 R은 다르다)·「'」 대신 「’」나 「i」(R i = R')도 받는다. 키 이름(Shift+I)이나
 * 명령 이름(되돌리기)으로도 찾는다.
 */
export function searchRows(rows: ActionRow[], query: string): ActionRow[] {
  const q = query.trim().replace(/[’`]/g, "'");
  if (!q) return rows;
  const prime = q.replace(/^([RLUDFBMESxyz]w?)\s*i$/, "$1'");
  const exact = rows.filter((r) => r.label === prime || r.action === prime);
  if (exact.length > 0) return exact;
  const lower = q.toLowerCase();
  return rows.filter(
    (r) =>
      r.label.includes(q) ||
      r.action.startsWith(q) ||
      (r.keys ?? "").toLowerCase().includes(lower),
  );
}
