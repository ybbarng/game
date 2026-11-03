/**
 * 패스키 호출 지켜보기(docs/36 11-55, 2026-11-03 사용자: 「브라우저가 이상해서 패스키 호출은 되는데 동작하지 않는 경우를
 * 대비해서, 취소 이벤트 없이 패스키를 호출하고 적당한 시간 동안 아무 응답이 없으면 메시지를 표시하자」).
 *
 * - 호출을 끊지 않는다(AbortController 없음). 사람이 Face ID를 천천히 하거나 패스키를 고르는 중일 수 있다. 늦게라도
 *   답이 오면 안내를 걷고 평소대로 이어 간다
 * - 패스키 창이 뜨면 페이지가 초점을 잃는(window blur, 문서 숨김) 신호가 오는 기기가 있다. 그런 기기에서 짧은 시간 안에
 *   신호가 없으면 「창이 안 뜬 것」으로 보고 일찍 알리고, 신호가 왔으면 사람이 쓰는 중이니 넉넉히 기다린다
 * - 신호를 믿는 기기: 안드로이드(패스키 창이 Credential Manager·Google Play 서비스의 별도 화면으로 뜬다)와 Windows(Windows
 *   Hello가 별도 창). 공개 자료로 확인한 것은 아니라 실기기 확인이 남았다. 그 밖(아이폰·맥 Safari의 시트, Chrome 데스크톱의
 *   브라우저 안 창, 휴대폰 QR)은 창이 떠도 신호가 없을 수 있어 넉넉한 시간 하나로 본다. iOS·iPadOS에서 get()이 끝나지 않는
 *   보고가 있다(WebKit 버그 273712)
 */
import { type Clock, realClock } from "@game/fair-play";

/** 지켜보는 시간(ms) */
export const WATCH_MS = {
  /** 신호를 믿는 기기: 이만큼 지나도 초점을 잃지 않았으면 창이 안 뜬 것으로 본다(지문·얼굴 확인은 대개 2~3초) */
  quiet: 8_000,
  /** 초점을 잃은 뒤(창이 떠 사람이 쓰는 중): 고르기·QR까지 넉넉히 */
  afterSignal: 60_000,
  /** 신호가 불확실한 기기: 휴대폰 QR로 다른 기기를 쓰는 시간까지 넉넉히 하나로 */
  unsure: 30_000,
} as const;

/** 이 기기에서 초점 신호를 믿는지 */
export type SignalTrust = "signal" | "unsure";

export function signalTrust(ua: string): SignalTrust {
  return /Android|Windows NT/i.test(ua) ? "signal" : "unsure";
}

/** 무엇을 하다 멈췄나(통계 step과 같은 이름) */
export type PasskeyStep = "create" | "present" | "sign";

/** 안내를 띄운 까닭: 창이 안 뜬 듯(quiet), 창은 떴는데 끝나지 않음(slow) */
export type StallWhy = "quiet" | "slow";

export interface WatchOptions {
  clock: Clock;
  trust: SignalTrust;
  /** 초점 신호를 들을 때 부른다. 듣기를 끄는 함수를 돌려준다 */
  listen: (onSignal: () => void) => () => void;
  /** 답이 없어 안내를 띄울 때 */
  onStall: (why: StallWhy) => void;
  /** 안내를 띄운 뒤 답(성공·실패)이 왔을 때 */
  onSettle: () => void;
}

/**
 * `call`을 부르고 그 결과를 그대로 돌려준다. 답이 없으면 `onStall`, 그 뒤 답이 오면 `onSettle`. 호출은 끊지 않는다
 */
export function watchCall<T>(
  call: () => Promise<T>,
  o: WatchOptions,
): Promise<T> {
  let stalled = false;
  let signaled = false;
  let cancel: (() => void) | null = null;
  const fire = (why: StallWhy) => () => {
    cancel = null;
    stalled = true;
    o.onStall(why);
  };
  // 부르기 전에 듣는다(창이 바로 떠 신호가 먼저 올 수 있다)
  const unlisten = o.listen(() => {
    if (signaled || stalled) return;
    signaled = true;
    cancel?.();
    cancel = o.clock.after(WATCH_MS.afterSignal, fire("slow"));
  });
  cancel =
    o.trust === "signal"
      ? o.clock.after(WATCH_MS.quiet, fire("quiet"))
      : o.clock.after(WATCH_MS.unsure, fire("quiet"));
  const done = () => {
    cancel?.();
    cancel = null;
    unlisten();
    if (stalled) o.onSettle();
  };
  let p: Promise<T>;
  try {
    p = call();
  } catch (err) {
    done();
    return Promise.reject(err);
  }
  return p.then(
    (v) => {
      done();
      return v;
    },
    (err) => {
      done();
      throw err;
    },
  );
}

/** 화면이 보는 지금 상태(안내를 띄울지) */
export interface Stall {
  step: PasskeyStep;
  why: StallWhy;
  /** 부를 때 누른 자리(안내를 그 아래에) */
  anchor: Element | null;
}

let current: Stall | null = null;
const listeners = new Set<() => void>();
let stallHook: ((step: PasskeyStep) => void) | null = null;

function set(s: Stall | null): void {
  current = s;
  for (const l of listeners) l();
}

export function passkeyStall(): Stall | null {
  return current;
}

export function subscribeStall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 안내를 닫는다(다시 시도 등) */
export function dismissStall(): void {
  set(null);
}

/** 안내를 띄울 때 한 번 부를 함수(통계, sd-track이 단다) */
export function onPasskeyStall(fn: ((step: PasskeyStep) => void) | null): void {
  stallHook = fn;
}

/** 마지막으로 누른 자리(포인터·키보드). 패스키 호출은 누름 안에서 시작한다 */
let pressed: Element | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (e) => {
      pressed = e.target instanceof Element ? e.target : null;
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "keydown",
    () => {
      pressed = document.activeElement;
    },
    { capture: true, passive: true },
  );
}

/** 브라우저의 초점 신호: 창 blur, 문서 숨김 */
function listenFocus(onSignal: () => void): () => void {
  const vis = () => {
    if (document.visibilityState === "hidden") onSignal();
  };
  window.addEventListener("blur", onSignal);
  document.addEventListener("visibilitychange", vis);
  return () => {
    window.removeEventListener("blur", onSignal);
    document.removeEventListener("visibilitychange", vis);
  };
}

/** 시험이 시계를 바꾼다 */
let clock: Clock = realClock;
export function setWatchClock(c: Clock): void {
  clock = c;
}

/**
 * 지갑이 패스키를 부를 때 감싼다. 브라우저 밖(서버 그리기·node 시험)에서는 그대로 부른다
 */
export function watchPasskey<T>(
  step: PasskeyStep,
  call: () => Promise<T>,
): Promise<T> {
  if (typeof window === "undefined" || typeof document === "undefined")
    return call();
  const anchor = pressed?.closest("button, a, [role='button']") ?? pressed;
  return watchCall(call, {
    clock,
    trust: signalTrust(navigator.userAgent),
    listen: listenFocus,
    onStall: (why) => {
      set({ step, why, anchor });
      stallHook?.(step);
    },
    onSettle: () => set(null),
  });
}
