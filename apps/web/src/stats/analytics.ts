/**
 * 사이트 통계(umami, docs/33). star.byb.kr과 같은 stats.byb.kr에 붙인다.
 * 쿠키를 쓰지 않고 페이지 주소와 정해 둔 게임 이벤트(`track.ts`)만 센다.
 *
 * 비밀이 새지 않게 네 겹으로 막는다(docs/33 3절):
 * ① 스크립트가 주소의 쿼리·`#`을 지운다(`data-exclude-search`·`data-exclude-hash`)
 * ② 보내기 직전 이 파일의 `beforeSend`가 다시 본다: 쿼리·`#`·`room=`이 남았으면 보내지 않는다
 * ③ 이벤트 값은 `track.ts`의 타입으로 정해 둔 것만
 * ④ 시험(`analytics.test.ts`)
 */

/** 빌드 때 넣는 사이트 ID. 개발·시험 빌드에는 없어 스크립트를 싣지 않는다 */
export const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? "";

/** 통계를 끈 기기. 설정 저장소는 첫 그리기 뒤에 읽어서, 첫 페이지 보기 전에 읽을 수 있게 따로 둔다 */
export const ANALYTICS_OFF_KEY = "game-analytics-off";

export function analyticsOff(): boolean {
  try {
    return localStorage.getItem(ANALYTICS_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsOff(off: boolean): void {
  try {
    if (off) localStorage.setItem(ANALYTICS_OFF_KEY, "1");
    else localStorage.removeItem(ANALYTICS_OFF_KEY);
  } catch {
    // 저장이 안 되는 창(사생활 보호 등)에서는 이번 방문 동안만 화면 값이 바뀐다
  }
}

/** 주소에 비밀이 남을 수 있는 흔적: 쿼리(`?room=`·`?seed=`), `#`, 방 코드 이름 */
function leaks(text: string | undefined): boolean {
  if (!text) return false;
  return text.includes("?") || text.includes("#") || text.includes("room=");
}

/**
 * 하늘의 별 따기에서 통계를 보내도 되는 경로(docs/33 11절). 여기 없는 /stardraw 아래 경로는 페이지 보기도
 * 이벤트도 보내지 않는다: 소속 받기(/qualify), 입상 확인(/check), 국장 화면(/admin), 데모(/demo), 그리고 앞으로
 * 새로 생길 경로(검토 전에는 빠진다)
 */
export const STARDRAW_COUNTED = new Set([
  "/stardraw",
  "/stardraw/enter",
  "/stardraw/now",
  "/stardraw/mine",
  "/stardraw/rounds",
  "/stardraw/stats",
  "/stardraw/timetable",
  "/stardraw/id",
  "/stardraw/ticket",
  "/stardraw/about",
  "/stardraw/bureau",
  "/stardraw/stars",
  "/stardraw/learn",
  "/stardraw/verify",
  "/stardraw/privacy",
]);

/** 주소(전체 주소나 경로)의 경로. 끝의 /는 뗀다. 읽지 못하면 null */
function pathOf(text: string): string | null {
  try {
    const p = new URL(text, "https://game.byb.kr").pathname;
    return p.length > 1 ? p.replace(/\/+$/, "") : p;
  } catch {
    return null;
  }
}

/** 별 따기 아래인데 허용 목록에 없는 경로(이 사이트의 경로만 본다) */
function stardrawHidden(
  text: string | undefined,
  sameSiteOnly = false,
): boolean {
  if (!text) return false;
  if (sameSiteOnly && /^[a-z][a-z0-9+.-]*:/i.test(text)) {
    try {
      if (new URL(text).hostname !== "game.byb.kr") return false;
    } catch {
      return false;
    }
  }
  const p = pathOf(text);
  if (p === null) return true;
  if (p !== "/stardraw" && !p.startsWith("/stardraw/")) return false;
  return !STARDRAW_COUNTED.has(p);
}

export interface SendContext {
  /** 이 기기에서 통계를 껐다 */
  off: boolean;
  /** 브라우저의 "추적하지 말라"(GPC) */
  gpc: boolean;
  /** 지금 주소의 쿼리(같은 탭 시험 `?net=local`은 보내지 않는다) */
  search: string;
}

type Payload = { url?: string; referrer?: string; name?: string };

/** 이 요청을 보내도 되나. 순수 함수라 시험한다 */
export function shouldSend(
  payload: Payload | null | undefined,
  context: SendContext,
): boolean {
  if (context.off || context.gpc) return false;
  if (context.search.includes("net=local")) return false;
  if (!payload) return false;
  if (stardrawHidden(payload.url)) return false;
  return !leaks(payload.url) && !leaks(payload.referrer);
}

/**
 * 보낼 값을 고친다: 참조 주소가 보내지 않는 별 따기 경로(입상 확인 등)면 지운다. 그곳에 있었다는 것도 남기지 않게
 * (그 경로에서 앱 안 이동으로 다른 화면으로 오면 umami가 참조로 그 경로를 붙인다)
 */
export function scrubPayload<P extends Payload>(payload: P): P {
  return stardrawHidden(payload.referrer, true)
    ? { ...payload, referrer: "" }
    : payload;
}

/**
 * 다음 페이지 보기 한 번을 보내지 않는다(docs/33 11절). 예측서를 낸 직후 접수증 화면으로 주소가 바뀌는데, 그
 * 페이지 보기가 장부의 접수 시각과 몇 초 차이로 남으면 방문(브라우저·지역)과 예측서를 맞춰 볼 수 있다. 정해 둔
 * 시간(`SKIP_PAGEVIEW_MS`) 안에 오는 페이지 보기 하나만 버린다(스크립트가 없어도 오래 남아 다른 보기를 버리지 않게)
 */
export const SKIP_PAGEVIEW_MS = 5000;
let skipPageviewUntil = 0;

export function skipNextPageview(now: number = Date.now()): void {
  skipPageviewUntil = now + SKIP_PAGEVIEW_MS;
}

/** 이 페이지 보기를 건너뛸지(건너뛰면 표시를 지운다). 이벤트(name 있음)는 상관없다 */
export function takeSkip(payload: Payload, now: number = Date.now()): boolean {
  if (payload.name !== undefined || now >= skipPageviewUntil) return false;
  skipPageviewUntil = 0;
  return true;
}

/** umami 스크립트가 보내기 직전 부른다(`data-before-send`). 거짓을 돌려주면 보내지 않는다 */
export function beforeSend<P extends Payload>(
  _type: string,
  payload: P,
): P | false {
  const nav = globalThis.navigator as
    | (Navigator & { globalPrivacyControl?: boolean })
    | undefined;
  if (
    !shouldSend(payload, {
      off: analyticsOff(),
      gpc: nav?.globalPrivacyControl === true,
      search: globalThis.location?.search ?? "",
    })
  )
    return false;
  if (takeSkip(payload)) return false;
  return scrubPayload(payload);
}

/** 스크립트가 이름으로 찾는다. 이 파일을 불러올 때(첫 그리기 전) 걸어 둔다 */
export const BEFORE_SEND_NAME = "umamiBeforeSend";
if (typeof window !== "undefined")
  (window as unknown as Record<string, unknown>)[BEFORE_SEND_NAME] = beforeSend;
