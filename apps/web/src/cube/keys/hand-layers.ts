import { useSyncExternalStore } from "react";

import { chordsFor, type Keymap } from "../input/keymaps";
import { type HandLayers, HOME_LAYERS } from "./reach";

/**
 * 지금 손이 잡은 층 수(csTimer의 oSl·oSr, 2026-11-04). 2026-11-12부터 「두 손」에는 층 수 키가 없어(숫자 = 깊이)
 * 층 수 키 `layers:*`를 든 옛 「사용자」 배치에서만 1·1이 아니게 된다.
 * 큐브를 받는 조각(`CubePlay`)이 해석기의 층 수를 여기에 알리고, 배우기 키캡(`useMoveKeys`)이 읽어
 * 「3Rw = 7 → U」 뒤의 R을 「8 → I」로 보인다. 큐브 하나만 키를 받으므로 화면에 하나만 둔다.
 */

interface Held extends HandLayers {
  n: number;
}

let held: Held = { n: 3, ...HOME_LAYERS };
const listeners = new Set<() => void>();

export function setHandLayers(n: number, layers: HandLayers): void {
  if (held.n === n && held.left === layers.left && held.right === layers.right)
    return;
  held = { n, left: layers.left, right: layers.right };
  for (const l of listeners) l();
}

export function resetHandLayers(): void {
  setHandLayers(held.n, HOME_LAYERS);
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 크기 n 큐브의 지금 층 수(다른 크기를 잡고 있었으면 1·1) */
export function heldLayers(n: number): HandLayers {
  return held.n === n ? { left: held.left, right: held.right } : HOME_LAYERS;
}

const SERVER_HELD: Held = { n: 0, ...HOME_LAYERS };
const SERVER = (): Held => SERVER_HELD;

export function useHandLayers(n: number): HandLayers {
  const h = useSyncExternalStore(subscribe, () => held, SERVER);
  return h.n === n ? h : HOME_LAYERS;
}

/** 이 배치·크기에서 층 수 키를 쓰는가(손 표시·층 수 글을 보일지) */
export function usesHandLayers(keymap: Keymap, n: number): boolean {
  return (
    n >= 4 &&
    ["layers:L+", "layers:L-", "layers:R+", "layers:R-"].some(
      (a) => chordsFor(keymap, a).length > 0,
    )
  );
}

/** 「층 수 왼손 1 · 오른손 2」 */
export function handLayersText(layers: HandLayers): string {
  return `층 수 왼손 ${layers.left} · 오른손 ${layers.right}`;
}
