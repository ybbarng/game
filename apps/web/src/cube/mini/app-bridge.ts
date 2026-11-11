/**
 * 맥 앱 Cubie(`apps/cubie`)와 미니 모드 화면 사이의 작은 메시지 다리(docs/47 15절).
 *
 * - 앱 → 화면: 앱이 `evaluateJavaScript`로 `window.dispatchEvent(new CustomEvent("cubie", { detail }))`를 부른다.
 * - 화면 → 앱: `window.webkit.messageHandlers.cubie.postMessage(msg)`.
 *
 * 브라우저에서 열면(다리가 없으면) 창의 포커스·보임으로 같은 일을 하고, 화면 구석의 작은 메뉴로 고른다.
 * 앱 쪽 이름(`ToApp`·`FromApp`의 `type`)은 `apps/cubie/Sources/Cubie/Bridge.swift`와 같아야 한다.
 */

import type { KeyChord } from "../input";

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
  | { type: "records"; open?: boolean }
  /**
   * 바로 다음에 화면에 닿을 키 하나의 출처. 앱이 키를 웹 화면에 넘기기 직전에 보낸다(같은 연결이라 차례가 지켜진다)
   */
  | { type: "key"; source: "keyboard" | "synthetic" }
  /** 「공식 보기」(앱 메뉴. 0.1.3~0.1.8 앱은 F1을 가로채 보낸다, 0.1.9부터 F1은 단축키 보기) */
  | { type: "hint" }
  /** 앱이 할 수 있는 것(0.1.3부터, 화면이 떴을 때). `hintBubble`: 창 옆 말풍선을 그린다 */
  | { type: "caps"; hintBubble: boolean }
  /**
   * 공식 연습(docs/47 16-11, 앱 메뉴 「공식 연습 ▸」). `stage`: 시작할 단계 id, null이면 연습 끝내기(앱이 연습 중 Esc를
   * 가로채 보낸다). 지금 하는 단계를 다시 고르면 새 판. `mode`: 따라 치기·보고 치기(없으면 지금 방식). 0.1.6 이하 앱은 보내지 않는다
   */
  | { type: "practice"; stage: string | null; mode?: "follow" | "see" }
  /**
   * 큐브 옆 단축키 표가 떠 있는가(0.1.9부터, F1·메뉴 「단축키 보기」). 떠 있는 동안 화면은 누른 키를 `pressed`로 알린다
   */
  | { type: "keysPanel"; open: boolean }
  /** 방금 누른 키(`KeyboardEvent.code`). 앱이 단축키 표 화면(`?view=keys&panel=1`)에 보내 그 칸을 잠깐 빛낸다 */
  | { type: "pressed"; code: string };

/**
 * 말풍선 한 줄. 앱이 줄마다 글꼴을 고른다(`HintBubble.swift`). `spans`가 있으면 그 줄을 낱말마다 다른 색으로 그린다
 * (공식 연습의 친 것·지금 칠 것·틀린 것, 0.1.7부터). 모르는 앱은 `text`만 그린다
 */
export interface BubbleLine {
  text: string;
  style: "title" | "note" | "alg" | "keys" | "plain" | "ok";
  spans?: BubbleSpan[];
}

export interface BubbleSpan {
  text: string;
  style: "done" | "now" | "next" | "wrong";
}

/** 화면이 앱에 보내는 것 */
export type ToApp =
  /** 화면이 떴다: 앱이 지금 포커스·보임을 다시 알려 준다 */
  | { type: "ready" }
  /**
   * 메뉴 표시(체크 표시)를 맞출 값. `scrambleKeys`: 지금 키 배치의 섞기 키(0.1.3부터 앱이 메뉴 「섞기」 옆에 보인다)
   */
  | {
      type: "state";
      n: number;
      mirror: boolean;
      records: boolean;
      scrambleKeys: KeyChord[];
      /**
       * 공식 연습(0.1.7부터 앱이 메뉴 「공식 연습 ▸」를 만든다). `practice`: 지금 하는 단계 id(안 하면 null),
       * `practiceMode`: 따라 치기·보고 치기, `practiceStages`: 메뉴에 보일 단계(묶음 이름 차례대로)
       */
      practice: string | null;
      practiceMode: "follow" | "see";
      practiceStages: { id: string; title: string; group: string }[];
    }
  /**
   * 큐브·거울 판이 차지하는 사각형들([x, y, 너비, 높이], 화면 왼쪽 위 기준 CSS px). 앱의 투명 창은 이 밖의
   * 누르기를 아래 앱으로 넘긴다
   */
  | { type: "hit"; rects: number[][] }
  /** 단축키 표가 떠 있는 동안 큐브 창에서 누른 키(`KeyboardEvent.code`). 앱이 단축키 표에 넘긴다(0.1.9부터) */
  | { type: "pressed"; code: string }
  /** 떠 있을 때 움직임이 시작·끝남(확인용 기록) */
  | { type: "idle"; showing: "replay" | "hero" | "jiggle" | null }
  /** 「공식 보기」 말풍선을 큐브 창 옆에 띄운다(`lines`) / 숨긴다(null). 0.1.2 이하 앱은 모르는 꼴이라 버린다 */
  | { type: "hint"; lines: BubbleLine[] | null }
  /**
   * 메뉴 맨 위 프로필 칸(docs/47 15-20, 자료 꼴은 `profile.ts`). `tierText`: 「3×3 골드 II」·「3×3 5판 뒤에」,
   * `emblem`: 지금 크기 티어 엠블럼 PNG data URL(티어가 없거나 그리지 못하면 null). 0.1.5 이하 앱은 모르는 꼴이라 버린다
   */
  | {
      type: "profile";
      name: string;
      photo: string | null;
      signedIn: boolean;
      n: number;
      tier: string | null;
      tierText: string;
      emblem: string | null;
    };

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
    case "key":
      return x.source === "keyboard" || x.source === "synthetic"
        ? { type: "key", source: x.source }
        : null;
    case "hint":
      return { type: "hint" };
    case "caps":
      return { type: "caps", hintBubble: x.hintBubble === true };
    case "practice": {
      if (x.stage !== null && typeof x.stage !== "string") return null;
      const stage = x.stage;
      return x.mode === "follow" || x.mode === "see"
        ? { type: "practice", stage, mode: x.mode }
        : { type: "practice", stage };
    }
    case "keysPanel":
      return typeof x.open === "boolean"
        ? { type: "keysPanel", open: x.open }
        : null;
    case "pressed":
      return typeof x.code === "string" && x.code !== ""
        ? { type: "pressed", code: x.code }
        : null;
    default:
      return null;
  }
}
