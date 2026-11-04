import { type ActionId, actionsFor } from "./input/actions";
import {
  bind,
  chordKey,
  type KeyChord,
  type Keymap,
  type KeymapPreset,
  presetKeymap,
  resolveAction,
} from "./input/keymaps";
import { routeFor } from "./keys/reach";

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

export interface AssignCheck {
  /** 이 키에 지금 놓인 다른 동작(없으면 null) */
  current: ActionId | null;
  /** 바꾸면 그 동작에 남는 키가 없다 */
  orphan: boolean;
}

/**
 * 키를 지정하기 전에 겹침을 본다(설계 4-1 「저장 전에 알린다」). 이미 다른 동작이 놓인 키면 화면이 먼저 묻는다
 */
export function checkAssign(
  keymap: Keymap,
  action: ActionId,
  chord: KeyChord,
): AssignCheck {
  const current = resolveAction(keymap, {
    code: chord.code,
    shiftKey: !!chord.shift,
    altKey: !!chord.alt,
    ctrlKey: !!chord.ctrl,
    metaKey: false,
    repeat: false,
  });
  if (current === null || current === action)
    return { current: null, orphan: false };
  const k = chordKey(chord);
  const left = keymap.bindings.filter(
    (b) => b.action === current && chordKey(b) !== k,
  );
  return { current, orphan: left.length === 0 };
}

/** 묻는 글: 「J 키는 지금 「U」 동작이에요. 「R」 동작으로 바꿀까요?」(글자 키 이름 뒤 조사가 어색하지 않게 「키는」) */
export function conflictQuestion(
  key: string,
  current: string,
  next: string,
): string {
  return `${key} 키는 지금 「${current}」 동작이에요. 「${next}」 동작으로 바꿀까요?`;
}

/**
 * 바꾼 뒤 알림. 옮겨 간 동작(새 동작)과 빠진 동작을 나눠 적어 둘 다에서 뺀 것처럼 읽히지 않게 한다.
 * 빠진 동작에 키가 하나도 남지 않으면 그렇다고 알린다. `rest`는 빠진 동작에 남은 키 이름들
 */
export function assignedText(
  key: string,
  next: string,
  replaced: string | null,
  rest: readonly string[] = [],
): string {
  const head = `${key} 키를 「${next}」 동작에 놓았어요.`;
  if (!replaced) return head;
  return rest.length === 0
    ? `${head} 「${replaced}」 동작에는 이제 키가 없어요. 다른 키를 지정해 주세요.`
    : `${head} 「${replaced}」 동작은 남은 키(${rest.join("·")})로 쳐요.`;
}

/**
 * 칠 길이 하나도 없는 기본 동작(면·넓게 두 층·가운데 층·큐브 돌리기·명령). 키를 옮기다 빠진 동작을 설정 화면이
 * 표시한다. 깊이·층 수·안쪽 층처럼 배치마다 일부러 비워 두는 동작은 넣지 않는다
 */
export function keylessActions(keymap: Keymap, n: number): ActionId[] {
  const core = new Set(["face", "wide", "slice", "rotate", "command"]);
  return actionsFor(n)
    .filter((a) => core.has(a.group) && !/^\d/.test(a.id))
    .filter((a) =>
      a.group === "command"
        ? keymap.bindings.every((b) => b.action !== a.id)
        : routeFor(keymap, n, a.id) === null,
    )
    .map((a) => a.id);
}
