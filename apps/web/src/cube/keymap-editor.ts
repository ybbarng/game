import type { ActionId } from "./input/actions";
import {
  bind,
  chordKey,
  type KeyChord,
  type Keymap,
  type KeymapPreset,
  presetKeymap,
  resolveAction,
} from "./input/keymaps";

/**
 * 「사용자」 키 배치 편집(설정 화면). 화면 없이 시험할 수 있게 계산만 둔다.
 * 키를 지정하면 그 키에 있던 다른 동작은 빠진다(겹치지 않게). 빠진 동작을 알려 주어 화면이 경고한다.
 */

/** 조합 키만 눌렀을 때(아직 키를 고르는 중)는 키로 치지 않는다 */
const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "CapsLock",
  "Fn",
]);

/** 키 누름 → 지정할 키. 조합 키만 눌렀거나 ⌘ 조합이면 null */
export function chordFromEvent(e: {
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): KeyChord | null {
  if (!e.code || MODIFIER_CODES.has(e.code) || e.metaKey) return null;
  return {
    code: e.code,
    ...(e.shiftKey ? { shift: true } : {}),
    ...(e.altKey ? { alt: true } : {}),
    ...(e.ctrlKey ? { ctrl: true } : {}),
  };
}

export interface AssignResult {
  keymap: Keymap;
  /** 이 키에 있다가 빠진 동작(없으면 null) */
  replaced: ActionId | null;
}

/**
 * 동작에 키 하나를 지정한다. `only`면 그 동작의 다른 키는 지운다(기본은 더한다: 한 동작에 키 여럿 가능).
 */
export function assignKey(
  keymap: Keymap,
  action: ActionId,
  chord: KeyChord,
  only = false,
): AssignResult {
  const before = resolveAction(keymap, {
    code: chord.code,
    shiftKey: !!chord.shift,
    altKey: !!chord.alt,
    ctrlKey: !!chord.ctrl,
    metaKey: false,
    repeat: false,
  });
  const base = only ? clearAction(keymap, action) : keymap;
  return {
    keymap: bind(base, chord, action),
    replaced: before !== null && before !== action ? before : null,
  };
}

/** 동작에 놓인 키를 모두 지운다 */
export function clearAction(keymap: Keymap, action: ActionId): Keymap {
  return {
    ...keymap,
    preset: "custom",
    bindings: keymap.bindings.filter((b) => b.action !== action),
  };
}

/** 「사용자」 배치를 기본 묶음에서 새로 시작한다 */
export function customFrom(preset: Exclude<KeymapPreset, "custom">): Keymap {
  return { ...presetKeymap(preset), preset: "custom" };
}

/** 지금 배치를 「사용자」로 옮긴다(이미 사용자면 그대로) */
export function toCustom(keymap: Keymap): Keymap {
  return keymap.preset === "custom" ? keymap : { ...keymap, preset: "custom" };
}

/** 동작에 놓인 키 목록(보기 좋은 차례) */
export function keysOf(keymap: Keymap, action: ActionId): KeyChord[] {
  return keymap.bindings
    .filter((b) => b.action === action)
    .sort((a, b) => chordKey(a).localeCompare(chordKey(b)));
}
