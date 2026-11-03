import type { KeyResult } from "../input/interpreter";
import type { KeyInput } from "../input/keymaps";

/**
 * 키 익히기·조작 훈련 화면의 키 누름 → 해석기 입력(docs/47 4절). DOM을 모르는 순수 함수라 시험이 바로 부른다.
 * 본 게임(`input/keyboard.ts` → `resolveAction`)과 같은 규칙: ⌘ 조합은 ⌘Z(되돌리기)만 받고 나머지는 브라우저에 둔다.
 * 동작이 없는 키도 넘겨(result null) 「그 키에는 동작이 없습니다.」를 보일 수 있게 한다.
 */

export interface KeyEventLike {
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

/** 수정 키만 누른 것(Shift 등) */
export const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "CapsLock",
  "Tab",
]);

export interface PracticeKeyRead {
  input: KeyInput;
  result: KeyResult | null;
  /** 브라우저 기본 동작을 막을지 */
  prevent: boolean;
}

/** 넘기지 않을 누름(되풀이·수정 키만·동작 없는 ⌘ 조합)이면 null */
export function readPracticeKey(
  e: KeyEventLike,
  handle: (input: KeyInput) => KeyResult | null,
): PracticeKeyRead | null {
  if (e.repeat || MODIFIER_CODES.has(e.code)) return null;
  const input: KeyInput = {
    code: e.code,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    repeat: false,
  };
  const result = handle(input);
  // ⌘ 조합은 동작(⌘Z 되돌리기)이 될 때만 받는다. ⌘R·⌘L 같은 브라우저 단축키는 그대로 둔다
  if (e.metaKey && !result) return null;
  // 동작으로 바뀐 키와 Alt 조합(맥에서 특수 글자를 치지 않게)은 기본 동작을 막는다
  const prevent = !!result || e.altKey || e.code === "Space";
  return { input, result, prevent };
}
