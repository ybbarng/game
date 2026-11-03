import { isKnownAction } from "./actions";
import {
  type KeyBinding,
  type Keymap,
  type KeymapPreset,
  presetKeymap,
} from "./keymaps";

/**
 * 키 배치 저장(기기 localStorage)·내보내기·가져오기(JSON). 저장소는 막혀 있을 수 있어(사생활 창 등) 모두 try/catch.
 */

const STORAGE_KEY = "cube.keymap.v1";
const MAX_BINDINGS = 500;
const PRESETS: KeymapPreset[] = ["twoHand", "notation", "custom"];

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** 저장된 배치. 없거나 읽을 수 없으면 「두 손」 */
export function loadKeymap(
  storage: StorageLike | null = defaultStorage(),
): Keymap {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (text) {
      const r = importKeymap(text);
      if (r.ok) return r.keymap;
    }
  } catch {
    // 저장소를 못 읽으면 기본 배치
  }
  return presetKeymap("twoHand");
}

/** 저장한다. 못 하면 false */
export function saveKeymap(
  keymap: Keymap,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  try {
    if (!storage) return false;
    // 기본 묶음은 이름만 남겨, 나중에 묶음이 고쳐지면 그것을 따른다
    const value: Keymap =
      keymap.preset === "custom"
        ? keymap
        : { ...keymap, bindings: [] satisfies KeyBinding[] };
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function exportKeymap(keymap: Keymap): string {
  return JSON.stringify(keymap, null, 2);
}

export type ImportResult =
  | { ok: true; keymap: Keymap }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const optBool = (v: unknown) => v === undefined || typeof v === "boolean";

/** 가져오기. 모양이 맞지 않으면 까닭을 돌려준다 */
export function importKeymap(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 글이 아닙니다" };
  }
  if (!isObj(data)) return { ok: false, error: "배치 모양이 아닙니다" };
  if (data.version !== 1)
    return { ok: false, error: "지원하지 않는 배치 판입니다" };
  const preset = data.preset;
  if (typeof preset !== "string" || !PRESETS.includes(preset as KeymapPreset))
    return { ok: false, error: "배치 묶음 이름이 맞지 않습니다" };
  if (!optBool(data.mouseRotate))
    return { ok: false, error: "mouseRotate는 참·거짓이어야 합니다" };
  const mouseRotate = data.mouseRotate === true;
  if (preset !== "custom")
    return {
      ok: true,
      keymap: {
        ...presetKeymap(preset as "twoHand" | "notation"),
        mouseRotate,
      },
    };
  const raw = data.bindings;
  if (!Array.isArray(raw)) return { ok: false, error: "키 목록이 없습니다" };
  if (raw.length > MAX_BINDINGS)
    return { ok: false, error: "키가 너무 많습니다" };
  const bindings: KeyBinding[] = [];
  for (const [i, b] of raw.entries()) {
    if (
      !isObj(b) ||
      typeof b.code !== "string" ||
      !/^[A-Za-z0-9]{1,32}$/.test(b.code) ||
      !optBool(b.shift) ||
      !optBool(b.alt) ||
      !optBool(b.ctrl)
    )
      return { ok: false, error: `${i + 1}번째 키 모양이 맞지 않습니다` };
    if (typeof b.action !== "string" || !isKnownAction(b.action))
      return {
        ok: false,
        error: `${i + 1}번째 키의 동작(${String(b.action)})을 모릅니다`,
      };
    bindings.push({
      code: b.code,
      ...(b.shift ? { shift: true } : {}),
      ...(b.alt ? { alt: true } : {}),
      ...(b.ctrl ? { ctrl: true } : {}),
      action: b.action,
    });
  }
  return {
    ok: true,
    keymap: { version: 1, preset: "custom", bindings, mouseRotate },
  };
}
