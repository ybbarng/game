/**
 * 하늘의 별 따기 사이트 통계 이벤트(docs/33 11절). 이름과 값의 정의는 `stats/track.ts`의 `TrackEvents` 한 곳이고,
 * 여기서는 언제 보내는지를 맡는다.
 *
 * - 실제 게임(서버 장부, `ns === GAME_NS && practice === null`)에서만 보낸다. 연습 장부·데모·시험 빌드는 `markReal`을
 *   부르지 않아 아무것도 보내지 않는다(`getServices`가 부른다).
 * - 예측서를 내는 순간에는 아무것도 보내지 않는다(장부의 접수 시각과 방문을 맞춰 보지 못하게). 접수에 성공한 뒤의
 *   접수증 화면 페이지 보기도 버린다(`skipNextPageview`). 실패 까닭(`sd-predict-fail`)만 보낸다: 실패한 예측서는
 *   장부에 없어 맞춰 볼 것이 없다.
 * - 보내지 않는 경로(소속·입상 확인·국장 화면·데모)는 보내기 직전 함수(`stats/analytics.ts`)가 막는다.
 */
import { UMAMI_WEBSITE_ID } from "@/stats/analytics";
import {
  type SdKeyFailKind,
  type SdKeyHow,
  type SdView,
  type SdWhere,
  type TrackEvents,
  track,
} from "@/stats/track";

import { errorKind } from "./errors";
import type { Ledger } from "./ledger";
import {
  autoOpenTarget,
  passkeyProblem,
  passkeyReach,
  webviewKind,
} from "./passkey-env";
import type { Wallet } from "./wallet";

/** 실제 게임으로 확인한 저장 이름공간 */
const real = new Set<string>();

/** 이 이름공간은 실제 게임이다(서버 장부). `getServices`가 서버 장부를 만들 때만 부른다 */
export function markReal(ns: string): void {
  real.add(ns);
}

export function isReal(ns: string): boolean {
  return real.has(ns);
}

/** 지금 별 따기 화면(sd-key의 where). StardrawApp이 화면을 바꿀 때 적는다 */
let where: SdWhere = "other";
export function setWhere(w: SdWhere): void {
  where = w;
}

const inApp = () =>
  typeof navigator !== "undefined" && webviewKind(navigator.userAgent) !== null;

interface Umami {
  track(name: string, data?: object): void;
}

/** 스크립트가 아직 실리지 않았을 때(afterInteractive) 잠깐 모아 두는 이벤트. 넘치면 버린다 */
const pending: (() => void)[] = [];
const PENDING_MAX = 10;
const RETRY_MS = 500;
const RETRY_TIMES = 20;
let retrying = false;

function umamiReady(): boolean {
  return typeof (globalThis as { umami?: Umami }).umami?.track === "function";
}

function flushSoon(tries = 0): void {
  if (umamiReady()) {
    retrying = false;
    for (const send of pending.splice(0)) send();
    return;
  }
  if (tries >= RETRY_TIMES) {
    // 광고 차단기 등으로 끝내 실리지 않았다. 버린다
    retrying = false;
    pending.length = 0;
    return;
  }
  setTimeout(() => flushSoon(tries + 1), RETRY_MS);
}

/** 실제 게임이면 보낸다. 스크립트가 아직 없으면 잠깐 기다렸다가(페이지를 열자마자 보내는 이벤트) */
export function sdTrack<K extends keyof TrackEvents>(
  ns: string,
  name: K,
  data: TrackEvents[K],
): void {
  if (!real.has(ns)) return;
  if (umamiReady()) {
    track(name, data);
    return;
  }
  // 스크립트가 없는 빌드(개발·시험)에서는 기다리지 않는다
  if (!UMAMI_WEBSITE_ID || pending.length >= PENDING_MAX) return;
  pending.push(() => track(name, data));
  if (!retrying) {
    retrying = true;
    flushSoon();
  }
}

/** 패스키 오류 → 막힌 까닭 */
export function keyFailKind(err: unknown): SdKeyFailKind {
  const p = passkeyProblem(err);
  return p === "cancelled" || p === "unsupported" ? p : "other";
}

/**
 * 지갑의 패스키 만들기·찾기와 장부의 예측서 내기에 통계를 단다(실제 게임만). 화면 부품을 고치지 않고 한 곳에서
 * 센다. 성공·실패는 원래 함수의 결과 그대로 돌려준다
 */
export function instrument(ns: string, wallet: Wallet, ledger: Ledger): void {
  const create = wallet.createPasskey.bind(wallet);
  wallet.createPasskey = async () => {
    try {
      const key = await create();
      sdTrack(ns, "sd-key", { how: "create", where, inApp: inApp() });
      return key;
    } catch (err) {
      keyFail(ns, "create", keyFailKind(err));
      throw err;
    }
  };
  const recover = wallet.recoverPasskey.bind(wallet);
  wallet.recoverPasskey = async (lookup) => {
    try {
      const key = await recover(lookup);
      if (key) sdTrack(ns, "sd-key", { how: "present", where, inApp: inApp() });
      else keyFail(ns, "present", "not-found");
      return key;
    } catch (err) {
      keyFail(ns, "present", keyFailKind(err));
      throw err;
    }
  };
  const submit = ledger.submit.bind(ledger);
  ledger.submit = async (...args) => {
    try {
      return await submit(...args);
    } catch (err) {
      sdTrack(ns, "sd-predict-fail", { why: errorKind(err) });
      throw err;
    }
  };
}

function keyFail(ns: string, step: SdKeyHow, kind: SdKeyFailKind): void {
  sdTrack(ns, "sd-key-fail", { step, kind, inApp: inApp() });
}

const ENV_SEEN = "stardraw-sd-env-seen";

/**
 * 들어온 브라우저가 패스키를 못 쓸 것 같으면 탭마다 한 번 보낸다(미리 알아보기 `passkeyReach`와 같은 판단, docs/36 11-54).
 * 웹뷰면 `wv-android`·`wv-ios`(처음 열 때 바깥으로 자동으로 넘겨 본 탭은 끝에 `-auto`), 웹뷰가 아닌데 WebAuthn이 없으면
 * `no-api`. 신청서를 띄우기 전에 막히는 사람(띠·입구 안내만 보고 떠나는 사람)을 세려고. 앱 이름·주소는 보내지 않는다
 */
export async function trackKeyEnv(ns: string): Promise<void> {
  if (!real.has(ns) || typeof navigator === "undefined") return;
  const reach = await passkeyReach();
  if (reach.ok) return;
  const kind: SdKeyFailKind = reach.webview
    ? autoOpenTarget(navigator.userAgent, reach, location.href)
      ? `wv-${reach.webview}-auto`
      : `wv-${reach.webview}`
    : "no-api";
  try {
    if (sessionStorage.getItem(ENV_SEEN)) return;
    sessionStorage.setItem(ENV_SEEN, "1");
  } catch {
    // 저장소를 못 쓰면 페이지마다 보낸다
  }
  sdTrack(ns, "sd-key-fail", {
    step: "env",
    kind,
    inApp: reach.webview !== null,
  });
}

/** 공지 링크 꼬리표(docs/33 11절): `/stardraw?from=notice` */
export const NOTICE_TAG = { key: "from", value: "notice" } as const;

/**
 * 공지 링크로 왔으면 한 번 보내고 주소에서 꼬리표를 지운다(새로 고침·공유에 남지 않게. 쿼리는 통계에 가지 않으므로
 * 주소 경로가 같아 페이지 보기가 한 번 더 세지지 않는다)
 */
export function trackArrival(ns: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get(NOTICE_TAG.key) !== NOTICE_TAG.value) return;
  url.searchParams.delete(NOTICE_TAG.key);
  window.history.replaceState(window.history.state, "", url.toString());
  sdTrack(ns, "sd-arrive", { from: "notice" });
}

/** 그 회차에 예측을 시작했다고 이미 보낸 회차(탭마다) */
const started = new Set<string>();

/**
 * 예측 시작: 그 회차에 처음 별을 바구니에 담았을 때 한 번(쓰다 만 별을 불러와도 같다). 예측서를 내는 순간과
 * 다르다. kind는 이 기기에 앞서 낸 예측서가 있는지(`${ns}-tickets`)
 */
export function trackPredictStart(
  ns: string,
  round: number,
  numbers: number,
): void {
  if (!real.has(ns) || numbers === 0) return;
  const k = `${ns}:${round}`;
  if (started.has(k)) return;
  started.add(k);
  let before = false;
  try {
    const saved = JSON.parse(localStorage.getItem(`${ns}-tickets`) ?? "[]");
    before = Array.isArray(saved) && saved.length > 0;
  } catch {
    before = false;
  }
  sdTrack(ns, "sd-predict", { kind: before ? "again" : "first" });
}

/** 주소가 바뀌지 않는 화면을 열었다 */
export function trackView(ns: string, view: SdView): void {
  sdTrack(ns, "sd-view", { view });
}

/** 시험용: 모은 상태를 비운다 */
export function resetSdTrack(): void {
  real.clear();
  started.clear();
  pending.length = 0;
  retrying = false;
  where = "other";
}
