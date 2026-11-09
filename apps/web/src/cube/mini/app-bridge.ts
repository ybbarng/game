/**
 * 맥 앱 Cubie(`apps/cubie`)와 미니 모드 화면 사이의 작은 메시지 다리(docs/47 14절).
 *
 * - 앱 → 화면: 앱이 `evaluateJavaScript`로 `window.dispatchEvent(new CustomEvent("cubie", { detail }))`를 부른다.
 * - 화면 → 앱: `window.webkit.messageHandlers.cubie.postMessage(msg)`.
 *
 * 브라우저에서 열면(다리가 없으면) 창의 포커스·보임으로 같은 일을 하고, 화면 구석의 작은 메뉴로 고른다.
 * 앱 쪽 이름(`ToApp`·`FromApp`의 `type`)은 `apps/cubie/Sources/Cubie/Bridge.swift`와 같아야 한다.
 */

export const BRIDGE_EVENT = "cubie";

/** 앱이 화면에 보내는 것 */
export type FromApp =
  /** 큐브 창이 키 입력을 받는가(시간 재기·떠 있을 때 움직임) */
  | { type: "focus"; focused: boolean }
  /** 창이 화면에 보이는가(숨기면 떠 있을 때 움직임도 쉰다) */
  | { type: "visible"; visible: boolean }
  | { type: "scramble" }
  /** 거울 켜고 끄기. `on`이 없으면 뒤집는다 */
  | { type: "mirror"; on?: boolean }
  | { type: "size"; n: number }
  /** 기록 열고 닫기. `open`이 없으면 뒤집는다 */
  | { type: "records"; open?: boolean };

/** 화면이 앱에 보내는 것 */
export type ToApp =
  /** 화면이 떴다: 앱이 지금 포커스·보임을 다시 알려 준다 */
  | { type: "ready" }
  /** 메뉴 표시(체크 표시)를 맞출 값 */
  | { type: "state"; n: number; mirror: boolean; records: boolean };

interface WebkitWindow {
  webkit?: {
    messageHandlers?: Record<string, { postMessage(msg: unknown): void }>;
  };
}

/** 앱 안에서 열렸는가 */
export function hasApp(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as WebkitWindow).webkit?.messageHandlers?.cubie;
}

export function toApp(msg: ToApp): void {
  try {
    (window as WebkitWindow).webkit?.messageHandlers?.cubie?.postMessage(msg);
  } catch {
    // 앱이 없거나 닫히는 중이면 버린다
  }
}

/** 앱이 보낸 것을 받는다. 모르는 꼴은 버린다. 떼는 함수를 돌려준다 */
export function onAppMessage(fn: (msg: FromApp) => void): () => void {
  const listener = (e: Event) => {
    const msg = parseFromApp((e as CustomEvent).detail);
    if (msg) fn(msg);
  };
  window.addEventListener(BRIDGE_EVENT, listener);
  return () => window.removeEventListener(BRIDGE_EVENT, listener);
}

export function parseFromApp(d: unknown): FromApp | null {
  if (typeof d !== "object" || d === null) return null;
  const x = d as Record<string, unknown>;
  switch (x.type) {
    case "focus":
      return typeof x.focused === "boolean"
        ? { type: "focus", focused: x.focused }
        : null;
    case "visible":
      return typeof x.visible === "boolean"
        ? { type: "visible", visible: x.visible }
        : null;
    case "scramble":
      return { type: "scramble" };
    case "mirror":
      return typeof x.on === "boolean"
        ? { type: "mirror", on: x.on }
        : { type: "mirror" };
    case "size":
      return typeof x.n === "number" ? { type: "size", n: x.n } : null;
    case "records":
      return typeof x.open === "boolean"
        ? { type: "records", open: x.open }
        : { type: "records" };
    default:
      return null;
  }
}
