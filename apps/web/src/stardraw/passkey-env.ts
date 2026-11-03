/**
 * 패스키를 쓸 수 있는 환경인지와, 기기에 맞는 말(docs/36 11-2 "패스키로만 응모").
 * 브라우저 응모는 패스키로만 한다. 쓸 수 없는 환경이면 응모 대신 무엇을 하면 되는지 알려 준다.
 *
 * 앱 안 브라우저(웹뷰)는 앱 이름 목록이 아니라 사용자 에이전트의 모양으로 알아본다(docs/36 11-54, 2026-11-03 사용자:
 * 「카톡뿐 아니라 슬랙 등 다양한 앱의 웹뷰에서 쓸 수 있으니 범용적인 방법이면 좋겠다」). 이름 목록은 「카카오톡 안에서는」처럼
 * 이름을 말할 때와 그 앱만의 바깥 여는 길에만 쓴다
 */

/** 이름을 아는 앱 안 브라우저. 사용자 에이전트에 이 글자가 있으면 그 앱 이름 */
const IN_APP: [RegExp, string][] = [
  [/KAKAOTALK/i, "카카오톡"],
  [/NAVER\(inapp/i, "네이버 앱"],
  [/DaumApps/i, "다음 앱"],
  [/Instagram/i, "인스타그램"],
  [/FBAN|FBAV|FB_IAB/i, "페이스북"],
  [/\bLine\//i, "라인"],
  [/BAND\//i, "밴드"],
  [/everytimeApp/i, "에브리타임"],
];

export function inAppBrowser(ua: string): string | null {
  return IN_APP.find(([re]) => re.test(ua))?.[1] ?? null;
}

/** 이름을 모르는 웹뷰를 말할 때 */
export const SOME_APP = "이 앱";

const IOS = /iPhone|iPad|iPod/i;

/** 웹뷰가 도는 기기 종류 */
export type WebviewKind = "android" | "ios";

/**
 * 앱 안 브라우저(웹뷰)면 그 기기 종류, 아니면 null. 사용자 에이전트만 본다.
 * - 안드로이드 시스템 웹뷰: `; wv)` 표시(Android 5.0부터 웹뷰 기본 사용자 에이전트에 붙는다. 앱이 사용자 에이전트를
 *   통째로 바꾸지 않는 한 남는다: Android Developers Blog 2024-12 「User-Agent reduction on Android WebView」,
 *   기본값 `Mozilla/5.0 (Linux; Android 10; K; wv) … Version/4.0 Chrome/125… Mobile Safari/537.36`). 그 앞 판의 웹뷰는
 *   `Version/4.0 Chrome/…`처럼 Chrome 앞에 `Version/`이 붙는다(Chrome·삼성 인터넷에는 없다, ua-parser/uap-core #38).
 *   Chrome 맞춤 탭(슬랙·텔레그램 기본)은 Chrome 그대로라 웹뷰가 아니다
 * - 아이폰·아이패드 WKWebView: iOS인데 `Safari/` 토큰이 없다. Safari와 SFSafariViewController(슬랙·텔레그램 iOS가 링크를
 *   여는 창)는 `… Mobile/15E148 Safari/604.1`, iOS Chrome(CriOS)·Firefox(FxiOS)·Edge(EdgiOS)도 끝에 `Safari/…`가 있다.
 *   카카오톡(`… Mobile/15E148 KAKAOTALK 10.x`)·인스타그램·페이스북·네이버는 없고, 라인은 `Safari Line/15.x`로 빗금 없는
 *   `Safari`만 있다(Classmethod 2025-08 「LIFFブラウザとLINE InAppBrowserにおけるUser-Agentの違い」)
 * - 이름 목록에 있는 앱은 위 표시가 없어도 웹뷰로 본다(기기 종류는 안드로이드·iOS 표시로)
 * - 알아보지 못하는 것: 데스크톱 모드 아이패드의 WKWebView(`Macintosh`로 온다), 사용자 에이전트를 Safari처럼 꾸민 앱.
 *   이런 곳은 미리 알리지 못하고, 시도가 실패한 자리의 안내(`inAppFailed`)가 맡는다
 */
export function webviewKind(ua: string): WebviewKind | null {
  const android = /Android/i.test(ua);
  const ios = IOS.test(ua);
  if (android && (/;\s*wv\)/.test(ua) || /Version\/\d+\.\d+ Chrome\//.test(ua)))
    return "android";
  if (ios && !/Safari\//.test(ua)) return "ios";
  if (inAppBrowser(ua)) return android ? "android" : ios ? "ios" : null;
  return null;
}

/** 웹뷰면 안내에 쓸 이름(아는 앱 이름, 모르면 「이 앱」), 아니면 null */
export function webviewName(ua: string): string | null {
  if (!webviewKind(ua)) return null;
  return inAppBrowser(ua) ?? SOME_APP;
}

/** 바깥 브라우저로 여는 길 */
export interface Outside {
  url: string;
  label: string;
  /** 단추로 안 열릴 때 손으로 여는 자리 */
  steps?: string;
  /** 처음 열 때 사용자 몸짓 없이 자동으로 시도해도 되는 길인지 */
  auto: boolean;
}

/**
 * 웹뷰에서 이 주소를 기기의 브라우저로 여는 길(웹뷰가 아니면 null).
 * - 카카오톡: `kakaotalk://web/openExternal?url=`(공식 문서는 없지만 널리 쓰이는 길. 아이폰은 Safari, 안드로이드는 기본
 *   브라우저. 2026-11-03 사용자가 안드로이드에서 열리는 것을 확인). 카카오톡이 자기 스킴을 받으므로 자동으로 시도한다
 * - 라인: 주소에 `openExternalBrowser=1`을 붙이면 라인이 바깥 브라우저로 연다(LINE Developers 「Using LINE features with the LINE URL scheme」의 「Opening a URL in an
 *   external browser」). 안 되는 판이어도 같은 페이지를 다시 열 뿐이라 자동으로 시도한다
 * - 그 밖의 안드로이드 웹뷰: `intent://<host><path>#Intent;scheme=https;action=android.intent.action.VIEW;…;end`
 *   (Chrome 「Android Intents with Chrome」의 문법. 패키지를 적지 않아 기기의 기본 브라우저가 받는다).
 *   intent 주소를 받는 것은 앱이다. 받지 않는 웹뷰는 페이지 대신 「ERR_UNKNOWN_URL_SCHEME」 오류 화면을 띄우므로 자동으로
 *   시도하지 않고 단추로만 연다(오류 화면이 나와도 뒤로 가면 돌아온다)
 * - 그 밖의 iOS 웹뷰: `x-safari-https://<host><path>`(iOS 17부터 Safari가 받는 스킴. 애플 문서는 없고, iOS 16에서는
 *   안 되며 인스타그램처럼 막는 앱도 있다는 보고가 있다: Christian Tietze 2023-05 「Safari URL Scheme for macOS and iOS」,
 *   gist felquis/a08ee196747f71689dcb 댓글). 몸짓 없는 시도가 무해한지 확인할 수 없어 단추로만 연다
 * 단추로 안 열릴 때를 위해 `steps`(메뉴 자리)와 주소 복사를 함께 둔다
 */
export function openOutside(ua: string, href: string): Outside | null {
  const kind = webviewKind(ua);
  if (!kind) return null;
  const iphone = kind === "ios";
  const label = iphone ? "Safari로 열기" : "다른 브라우저로 열기";
  const app = inAppBrowser(ua);
  if (app === "카카오톡")
    return {
      url: `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`,
      label,
      auto: true,
      steps: iphone
        ? "열리지 않으면 오른쪽 아래 공유 단추를 눌러 Safari로 열어 주세요."
        : "열리지 않으면 오른쪽 아래 ⋮ 단추를 눌러 「다른 브라우저로 열기」를 골라 주세요.",
    };
  if (app === "라인") {
    const u = new URL(href);
    u.searchParams.set(LINE_OUTSIDE, "1");
    return { url: u.toString(), label, auto: true };
  }
  const u = new URL(href);
  const rest = `${u.host}${u.pathname}${u.search}${u.hash}`;
  if (iphone)
    return {
      url: `x-safari-https://${rest}`,
      label,
      auto: false,
      steps: "열리지 않으면 앱의 공유·⋯ 메뉴에서 Safari로 열어 주세요.",
    };
  return {
    url: `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(href)};end`,
    label,
    auto: false,
    steps: "열리지 않으면 앱의 ⋮ 메뉴에서 브라우저로 여는 항목을 골라 주세요.",
  };
}

/** 라인이 바깥 브라우저로 여는 주소 꼬리표(바깥으로 넘긴 뒤 주소에서 지운다) */
export const LINE_OUTSIDE = "openExternalBrowser";

/** 앱 안 브라우저 안내에서 열어 달라고 할 브라우저 이름(조사까지) */
export function browserName(ua: string): string {
  if (IOS.test(ua)) return "Safari로";
  if (/Android/i.test(ua)) return "Chrome 같은 브라우저로";
  return "Safari나 Chrome으로";
}

/** 이 브라우저에 WebAuthn이 있는지 */
export function passkeyApi(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function"
  );
}

/** 이 기기 안에서 얼굴·지문·화면 잠금으로 패스키를 쓸 수 있는지(없어도 휴대폰 QR·보안 키로는 된다) */
export async function platformUnlock(): Promise<boolean> {
  try {
    return (
      passkeyApi() &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

/** `PublicKeyCredential.getClientCapabilities()`가 준 값(WebAuthn 3판). 없거나 실패하면 null */
export type ClientCaps = Record<string, boolean> | null;

async function clientCaps(): Promise<ClientCaps> {
  try {
    const pkc = PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
    return typeof pkc.getClientCapabilities === "function"
      ? await pkc.getClientCapabilities()
      : null;
  } catch {
    return null;
  }
}

/** 이 탭에서 패스키가 될지 미리 알아본 결과 */
export interface PasskeyReach {
  /** 웹뷰 종류(웹뷰가 아니면 null) */
  webview: WebviewKind | null;
  /** WebAuthn이 있는지 */
  api: boolean;
  /** 여기서 시도해 볼 만한지. false면 위쪽 띠·자동 넘김(웹뷰), API가 없으면 시도도 막는다 */
  ok: boolean;
}

/**
 * 미리 알아보기(docs/36 11-54). 웹뷰가 아니면 API만 본다(이 기기 잠금이 없어도 휴대폰 QR·보안 키로 된다).
 * 웹뷰면 이 기기 잠금으로 패스키를 쓸 수 있다고 하는지까지 본다:
 * - iOS WKWebView는 그 앱이 이 도메인과 연결(associated domains)되어 있을 때만 패스키를 쓰고, 그때만
 *   `isUserVerifyingPlatformAuthenticatorAvailable()`이 true다(WebKit 버그 250912, 2023-01 고침. 그 전에는 모든 WKWebView가 true)
 * - 안드로이드 웹뷰는 앱이 WebAuthn을 켜야(androidx.webkit `setWebAuthenticationSupport`) 쓸 수 있고, 안 켜면 false
 * - `getClientCapabilities()`가 있으면 그 `userVerifyingPlatformAuthenticator`를 앞세운다(iOS 26.2 일부 WKWebView 기반
 *   브라우저에서 isUVPAA가 거꾸로 false를 낸다는 보고: Corbado 「isUserVerifyingPlatformAuthenticatorAvailable」)
 * 웹뷰인데 된다고 하면 막지도 띠도 띄우지 않고 평소처럼 시도한다
 */
export function judgeReach(
  ua: string,
  api: boolean,
  platform: boolean,
  caps: ClientCaps = null,
): PasskeyReach {
  const webview = webviewKind(ua);
  if (!api) return { webview, api, ok: false };
  if (!webview) return { webview, api, ok: true };
  const uvpa = caps?.userVerifyingPlatformAuthenticator;
  return { webview, api, ok: typeof uvpa === "boolean" ? uvpa : platform };
}

const REACH_KEY = "stardraw-passkey-reach";
let reachOnce: Promise<PasskeyReach> | null = null;

/** 이 탭에서 한 번만 알아보고 기억한다(sessionStorage, 저장소를 못 쓰면 페이지마다) */
export function passkeyReach(): Promise<PasskeyReach> {
  if (reachOnce) return reachOnce;
  reachOnce = (async () => {
    const ua = navigator.userAgent;
    try {
      const saved = sessionStorage.getItem(REACH_KEY);
      if (saved) {
        const r = JSON.parse(saved) as PasskeyReach;
        if (r.webview === webviewKind(ua)) return r;
      }
    } catch {
      // 저장소를 못 쓰면 새로 잰다
    }
    const api = passkeyApi();
    const r = judgeReach(
      ua,
      api,
      api && (await platformUnlock()),
      api ? await clientCaps() : null,
    );
    try {
      sessionStorage.setItem(REACH_KEY, JSON.stringify(r));
    } catch {
      // 기억하지 못해도 된다
    }
    return r;
  })();
  return reachOnce;
}

/** 시험: 기억한 결과를 지운다 */
export function forgetReach(): void {
  reachOnce = null;
}

const AUTO_KEY = "stardraw-auto-open";

/**
 * 처음 열 때 자동으로 바깥 브라우저로 넘길지: 웹뷰이고, 미리 알아보니 안 되고, 몸짓 없이 시도해도 되는 길(`auto`)이
 * 있을 때. 넘기는 것은 탭마다 한 번(`autoOpen`)
 */
export function autoOpenTarget(
  ua: string,
  reach: PasskeyReach,
  href: string,
): string | null {
  if (reach.ok || !reach.webview) return null;
  const o = openOutside(ua, href);
  return o?.auto ? o.url : null;
}

/**
 * 탭마다 한 번 바깥 브라우저로 넘긴다. 넘긴 주소를 sessionStorage에 남겨(되돌아와도 다시 넘기지 않고, 화면 시험이 넘긴
 * 주소를 확인한다) 넘겼으면 true. 저장소를 못 쓰면 넘기지 않는다(새로 고칠 때마다 넘기지 않게)
 */
export function autoOpen(url: string, go: (url: string) => void): boolean {
  try {
    if (sessionStorage.getItem(AUTO_KEY)) return false;
    sessionStorage.setItem(AUTO_KEY, url);
  } catch {
    return false;
  }
  go(url);
  return true;
}

/** 위쪽 띠 문구(`app`은 webviewName) */
export function bandText(app: string): string {
  return `${app} 안에서는 우주인 등록과 예측서 접수가 어렵습니다.`;
}

/**
 * 응모 단추에 넣을 잠금 이름(조사까지). 이 기기 잠금을 못 쓰면 "패스키로"(휴대폰 QR·보안 키 창이 뜬다)
 */
export function unlockWith(ua: string, platform: boolean): string {
  if (!platform) return "패스키로";
  if (/iPhone/i.test(ua)) return "Face ID로";
  if (/iPad/i.test(ua)) return "Face ID·Touch ID로";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Touch ID로";
  if (/Android/i.test(ua)) return "지문·화면 잠금으로";
  if (/Windows/i.test(ua)) return "Windows Hello로";
  return "패스키로";
}

export type PasskeyProblem =
  /** 사용자가 창을 닫았거나 시간이 지났다 */
  | "cancelled"
  /** 이 인증기가 ES256(P-256) 패스키를 만들지 못하거나(일부 오래된 Windows Hello) 본인 확인(UV)을 못 한다 */
  | "unsupported"
  /** 그 밖의 오류 */
  | "other";

export function passkeyProblem(err: unknown): PasskeyProblem {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "AbortError")
      return "cancelled";
    if (err.name === "NotSupportedError" || err.name === "ConstraintError")
      return "unsupported";
  }
  return "other";
}

/**
 * 패스키 확인이 끝나지 않았을 때 앞 문장(`what`, 예: "응모되지 않았어요") 뒤에 붙일 까닭.
 * 브라우저는 "창을 닫음"과 "이 기기에 맞는 패스키가 없음(지운 패스키, 다른 기기에만 있는 패스키)"을 일부러 같은
 * 오류(NotAllowedError)로 돌려준다(어떤 패스키가 있는지 사이트가 알아내지 못하게). 그래서 둘을 함께 말하고,
 * 가를 수 있는 시간 초과(AbortError)·우리가 만든 취소(흉내 창)는 따로 말한다
 */
export function passkeyFailText(err: unknown, what: string): string {
  if (err instanceof DOMException && err.name === "AbortError")
    return `${what}. 확인 시간이 지났어요.`;
  if (err instanceof DOMException && err.message === DEMO_CANCEL)
    return `${what}. 확인을 취소했어요.`;
  return `${what}. 확인을 취소했거나, 이 기기에서 등록증의 패스키를 찾지 못했어요.`;
}

/** 흉내 창(데모)을 닫았을 때의 오류 문구(passkeyFailText가 취소로 읽는다) */
export const DEMO_CANCEL = "확인을 취소했습니다";

/**
 * WebAuthn 자체가 없어 시도할 수 없으면 그 까닭과 할 일 한 문장, 시도할 수 있으면 null(입구 안내 KeySetup과 같은 말).
 * 편지·관측지의 「우주인 등록」「신분증 제시」가 신청서를 띄우기 전에 본다(2026-11-03 클로즈 베타 점검: 패스키를 못 쓰는데도
 * 신청서가 떠 막다른 길이었다). 앱 안 브라우저라도 API가 있으면 막지 않는다(2026-11-03 사용자: 「처음부터 막기보다는
 * 시도라도 할 수 있게」). 시도가 실패하면 그 자리에 바깥 브라우저 안내(`inAppFailed`).
 * 미리 알아보기(`judgeReach`)에서 API가 없을 때(`api: false`)와 같은 판단이다. 웹뷰인데 API는 있고 이 기기 잠금을 못 쓴다고
 * 하면 막지 않고 위쪽 띠로만 알린다
 */
export function passkeyBlocked(ua: string, api: boolean): string | null {
  if (api) return null;
  const app = webviewName(ua);
  if (app) return inAppText(app, ua, true);
  return NO_PASSKEY_TEXT;
}

/**
 * 웹뷰에서 패스키 시도가 실패했으면 그 앱 이름(모르면 「이 앱」), 아니면 null. 웹뷰는 패스키를 못 쓸 때도 취소와 같은
 * 오류(NotAllowedError)를 내는 일이 많아 취소·지원 안 함·보안 오류·알 수 없는 오류(브라우저가 낸 DOMException)를
 * 모두 센다. 서버·연결 오류와 흉내 창(데모) 취소는 세지 않는다
 */
export function inAppFailed(err: unknown, ua: string): string | null {
  if (!(err instanceof DOMException) || err.message === DEMO_CANCEL)
    return null;
  // 시간 초과(TimeoutError)는 서버 응답이 늦은 것이다
  if (err.name === "TimeoutError") return null;
  return webviewName(ua);
}

/**
 * 웹뷰에서 패스키가 안 된다는 우주국 안내(`sure`면 API가 없어 확실히 안 된다, 아니면 시도가 실패한 뒤).
 * 우주국이 내는 글이라 「~습니다」(2026-11-03 사용자: 「웹뷰 안내도 카노푸스 우주국에서 보내는 메시지 느낌으로」, docs/41 5절).
 * 「패스키」「Safari」는 기기에 보이는 이름이라 그대로 쓴다
 */
export function inAppText(app: string, ua: string, sure = false): string {
  const what = sure
    ? "패스키를 쓸 수 없습니다"
    : "패스키 확인을 마치지 못했습니다";
  return `${app} 안에서는 ${what}. ${browserName(ua)} 옮겨 오시면 이어서 접수하겠습니다.`;
}

/** 웹뷰가 아닌데 WebAuthn이 없는 브라우저의 우주국 안내 */
export const NO_PASSKEY_TEXT =
  "이 브라우저는 패스키를 지원하지 않습니다. 최신 Safari·Chrome으로 열어 주세요.";

/** 우주국 안내의 머리(방송 토스트와 같은 이름) */
export const BUREAU = "카노푸스 우주국";
