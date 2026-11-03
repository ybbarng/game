import type { ActionId } from "./actions";

/**
 * 키 배치(docs/47 4-1, 4-2): "어느 키가 어느 동작인가". 키는 `event.code`(자판 위치)로 적어 한글 입력 상태나
 * 다른 자판 배열에서도 같은 자리로 동작한다.
 */

export interface KeyChord {
  /** KeyboardEvent.code(예: "KeyR", "Semicolon", "Digit3") */
  code: string;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
}

export interface KeyBinding extends KeyChord {
  action: ActionId;
}

export type KeymapPreset = "twoHand" | "notation" | "custom";

export interface Keymap {
  version: 1;
  preset: KeymapPreset;
  bindings: KeyBinding[];
  /** 마우스로 끌어 큐브 돌리기(x·y·z, 수로 센다). 「사용자」에서만 켤 수 있고 기본은 끔(지금은 자리만) */
  mouseRotate: boolean;
}

export const PRESET_LABEL: Record<KeymapPreset, string> = {
  twoHand: "두 손",
  notation: "표기",
  custom: "사용자",
};

/** 키 누름 하나(DOM KeyboardEvent에서 쓰는 값만) */
export interface KeyInput {
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** 키를 누르고 있어 저절로 되풀이된 누름 */
  repeat: boolean;
}

/** 조합 키를 한 줄로(겹침 찾기·표시용). 차례는 Ctrl+Alt+Shift+코드 */
export function chordKey(c: KeyChord): string {
  return `${c.ctrl ? "Ctrl+" : ""}${c.alt ? "Alt+" : ""}${c.shift ? "Shift+" : ""}${c.code}`;
}

/** 키 코드를 사람이 읽는 글자로(키 그림·설정 화면) */
export function codeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const named: Record<string, string> = {
    Semicolon: ";",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    Backslash: "\\",
    Space: "Space",
    Backspace: "⌫",
    Escape: "Esc",
    Enter: "Enter",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
  };
  return named[code] ?? code;
}

export function chordLabel(c: KeyChord): string {
  return `${c.ctrl ? "Ctrl+" : ""}${c.alt ? "Alt+" : ""}${c.shift ? "Shift+" : ""}${codeLabel(c.code)}`;
}

/**
 * 키 누름 → 동작. 저절로 되풀이된 누름(autorepeat)과 ⌘(Meta) 조합은 무시한다(브라우저 단축키를 막지 않는다).
 * 조합 키는 정확히 같아야 한다(Shift+I는 I와 다른 동작).
 */
export function resolveAction(
  keymap: Keymap,
  input: KeyInput,
): ActionId | null {
  if (input.repeat || input.metaKey) return null;
  for (const b of keymap.bindings)
    if (
      b.code === input.code &&
      !!b.shift === input.shiftKey &&
      !!b.alt === input.altKey &&
      !!b.ctrl === input.ctrlKey
    )
      return b.action;
  return null;
}

export interface Conflict {
  chord: string;
  actions: ActionId[];
}

/** 한 키(조합 포함)에 서로 다른 동작이 둘 이상 놓인 곳. 저장 전에 알린다 */
export function findConflicts(keymap: Keymap): Conflict[] {
  const byChord = new Map<string, ActionId[]>();
  for (const b of keymap.bindings) {
    const k = chordKey(b);
    const list = byChord.get(k) ?? [];
    if (!list.includes(b.action)) list.push(b.action);
    byChord.set(k, list);
  }
  return [...byChord]
    .filter(([, a]) => a.length > 1)
    .map(([chord, actions]) => ({ chord, actions }));
}

/** 동작에 놓인 키들 */
export function chordsFor(keymap: Keymap, action: ActionId): KeyChord[] {
  return keymap.bindings.filter((b) => b.action === action);
}

/**
 * 키 하나에 동작을 놓는다(그 키에 있던 동작은 빼고). 새 배치를 돌려준다. 「사용자」 배치가 된다
 */
export function bind(
  keymap: Keymap,
  chord: KeyChord,
  action: ActionId,
): Keymap {
  const k = chordKey(chord);
  return {
    ...keymap,
    preset: "custom",
    bindings: [
      ...keymap.bindings.filter((b) => chordKey(b) !== k),
      { ...normalizeChord(chord), action },
    ],
  };
}

/** 키 하나를 비운다 */
export function unbind(keymap: Keymap, chord: KeyChord): Keymap {
  const k = chordKey(chord);
  return {
    ...keymap,
    preset: "custom",
    bindings: keymap.bindings.filter((b) => chordKey(b) !== k),
  };
}

function normalizeChord(c: KeyChord): KeyChord {
  return {
    code: c.code,
    ...(c.shift ? { shift: true } : {}),
    ...(c.alt ? { alt: true } : {}),
    ...(c.ctrl ? { ctrl: true } : {}),
  };
}

// ---------------------------------------------------------------- 배치 묶음

const key = (
  code: string,
  action: ActionId,
  mods: Omit<KeyChord, "code"> = {},
): KeyBinding => ({ ...normalizeChord({ code, ...mods }), action });

const COMMON_COMMANDS: KeyBinding[] = [
  key("Backspace", "undo"),
  key("KeyZ", "undo", { ctrl: true }),
  key("Escape", "reset"),
  key("Enter", "scramble"),
  key("Space", "inspectionSkip"),
  key("ArrowLeft", "peekBack"),
  key("ArrowRight", "peekBack"),
  key("ArrowDown", "peekDown"),
];

/**
 * 「두 손」(기본, 빠르기). 실물에서 그 면을 돌리는 손으로 치고, 같은 면의 시계·반시계는 양손 대칭 자리.
 * 널리 쓰이는 웹 큐브 프로그램(qqTimer·csTimer 가상 큐브)의 자리를 기억으로 옮겼다.
 *
 *   오른손                      왼손
 *   I  R    K  R'               D  L    E  L'
 *   J  U    L  D'               F  U'   S  D
 *   H  F    O  B'               G  F'   W  B
 *   U  Rw   M  Rw'              V  Lw   R  Lw'
 *   ,  Uw   /  Dw'              C  Uw'  Z  Dw
 *   ;  y    P  z                A  y'   Q  z'
 *   Y  x    N  x'               T  x    B  x'
 *   6  M    .  M'               5  M    X  M'
 *
 * 큰 큐브: Shift+면 키 = 안쪽 둘째 층(2R …), Alt+면 키 = 넓게(Rw …), 숫자 2·3·4 = 다음 수 깊이.
 */
const TWO_HAND_FACE: [code: string, action: string][] = [
  ["KeyI", "R"],
  ["KeyK", "R'"],
  ["KeyD", "L"],
  ["KeyE", "L'"],
  ["KeyJ", "U"],
  ["KeyF", "U'"],
  ["KeyS", "D"],
  ["KeyL", "D'"],
  ["KeyH", "F"],
  ["KeyG", "F'"],
  ["KeyW", "B"],
  ["KeyO", "B'"],
];

export function twoHandKeymap(): Keymap {
  const bindings: KeyBinding[] = [];
  for (const [code, action] of TWO_HAND_FACE) {
    bindings.push(key(code, action));
    bindings.push(key(code, `2${action}`, { shift: true }));
    bindings.push(key(code, action.replace(/^(\w)/, "$1w"), { alt: true }));
  }
  bindings.push(
    key("KeyU", "Rw"),
    key("KeyM", "Rw'"),
    key("KeyV", "Lw"),
    key("KeyR", "Lw'"),
    key("Comma", "Uw"),
    key("KeyC", "Uw'"),
    key("KeyZ", "Dw"),
    key("Slash", "Dw'"),
    key("KeyT", "x"),
    key("KeyY", "x"),
    key("KeyB", "x'"),
    key("KeyN", "x'"),
    key("Semicolon", "y"),
    key("KeyA", "y'"),
    key("KeyP", "z"),
    key("KeyQ", "z'"),
    key("Digit5", "M"),
    key("Digit6", "M"),
    key("KeyX", "M'"),
    key("Period", "M'"),
    key("Digit2", "depth:2"),
    key("Digit3", "depth:3"),
    key("Digit4", "depth:4"),
    ...COMMON_COMMANDS,
  );
  return { version: 1, preset: "twoHand", bindings, mouseRotate: false };
}

/**
 * 「표기」(처음, 직관). R L U D F B 키 = 그 면 시계, Shift = 반대, Alt = 넓게(w), M E S = 가운데 층,
 * X Y Z = 큐브 돌리기, 숫자 2~7 = 다음 수 깊이. 공식을 글자 그대로 친다(R2는 R 두 번).
 */
export function notationKeymap(): Keymap {
  const bindings: KeyBinding[] = [];
  for (const f of ["R", "L", "U", "D", "F", "B"]) {
    const code = `Key${f}`;
    bindings.push(
      key(code, f),
      key(code, `${f}'`, { shift: true }),
      key(code, `${f}w`, { alt: true }),
      key(code, `${f}w'`, { alt: true, shift: true }),
    );
  }
  for (const s of ["M", "E", "S"])
    bindings.push(key(`Key${s}`, s), key(`Key${s}`, `${s}'`, { shift: true }));
  for (const r of ["x", "y", "z"]) {
    const code = `Key${r.toUpperCase()}`;
    bindings.push(key(code, r), key(code, `${r}'`, { shift: true }));
  }
  for (let d = 2; d <= 7; d++) bindings.push(key(`Digit${d}`, `depth:${d}`));
  bindings.push(...COMMON_COMMANDS);
  return { version: 1, preset: "notation", bindings, mouseRotate: false };
}

export function presetKeymap(preset: Exclude<KeymapPreset, "custom">): Keymap {
  return preset === "twoHand" ? twoHandKeymap() : notationKeymap();
}
