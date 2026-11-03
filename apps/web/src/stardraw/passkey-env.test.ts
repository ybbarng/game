// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  autoOpenTarget,
  browserName,
  DEMO_CANCEL,
  inAppBrowser,
  inAppFailed,
  inAppText,
  judgeReach,
  openOutside,
  passkeyBlocked,
  passkeyFailText,
  passkeyProblem,
  unlockWith,
  webviewKind,
  webviewName,
} from "./passkey-env";

/**
 * 실제 사용자 에이전트 예시(판 번호는 바뀌어도 모양은 같다). 출처:
 * - 안드로이드 웹뷰 기본값: Android Developers Blog 2024-12 「User-Agent reduction on Android WebView」
 *   (`Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36`).
 *   카카오톡·라인·인스타그램·페이스북·네이버 안드로이드는 이 기본값 뒤에 앱 꼬리표를 붙인다(카카오 데브톡 「user-agent」 답변:
 *   「UserAgent 내 KAKAOTALK 포함 여부로 식별」)
 * - iOS 카카오톡: 카카오 데브톡에 올라온 값의 모양(`… Mobile/15E148 KAKAOTALK 10.x`)
 * - iOS 라인: Classmethod 2025-08 「LIFFブラウザとLINE InAppBrowserにおけるUser-Agentの違い」(`… Mobile/15E148 Safari Line/15.12.1`)
 * - iOS 인스타그램·페이스북·네이버: WKWebView 기본값(`… Mobile/15E148`) 뒤에 앱 꼬리표(`Instagram …`, `[FBAN/FBIOS;…]`,
 *   `NAVER(inapp; …)`)
 * - Safari·SFSafariViewController(슬랙·텔레그램 iOS가 링크를 여는 창)·iOS Chrome(CriOS)·삼성 인터넷·안드로이드 Chrome:
 *   각 브라우저의 공개 사용자 에이전트(MDN 「User-Agent」, Chrome 「User-Agent reduction」, 삼성 인터넷 개발자 문서)
 * - 슬랙·텔레그램 안드로이드는 Chrome 맞춤 탭으로 열어 Chrome 그대로다. 알 수 없는 웹뷰(당근 등)는 앱 꼬리표 없이 둔다
 */
const WV = (tail = "") =>
  `Mozilla/5.0 (Linux; Android 15; SM-S928N Build/AP3A.240905.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36${tail}`;
const WK = (tail = "") =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148${tail}`;
const UA = {
  iphoneKakao: WK(" KAKAOTALK 10.8.5"),
  androidKakao: WV(";KAKAOTALK 2510030"),
  iphoneLine: WK(" Safari Line/15.12.1"),
  androidLine: WV(" Line/15.12.1"),
  iphoneInstagram: WK(
    " Instagram 360.0.0.30.109 (iPhone16,1; iOS 18_5; ko_KR; ko; scale=3.00; 1179x2556; 668293470)",
  ),
  androidInstagram: WV(" Instagram 360.0.0.52.192 Android (35/15; 480dpi)"),
  iphoneFacebook: WK(
    " [FBAN/FBIOS;FBAV/500.0.0.40.100;FBBV/1;FBDV/iPhone16,1]",
  ),
  iphoneNaver: WK(" NAVER(inapp; search; 2000; 12.10.3; 15PRO)"),
  androidNaver: WV(" NAVER(inapp; search; 2000; 12.10.3)"),
  iphoneUnknown: WK(),
  androidUnknown: WV(),
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 15; SAMSUNG SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
};

const IPHONE_KAKAO = UA.iphoneKakao;
const ANDROID_CHROME = UA.androidChrome;
const MAC_SAFARI = UA.macSafari;
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

describe("웹뷰 알아보기", () => {
  it.each([
    ["카카오톡 아이폰", UA.iphoneKakao, "ios", "카카오톡"],
    ["카카오톡 안드로이드", UA.androidKakao, "android", "카카오톡"],
    ["라인 아이폰(빗금 없는 Safari)", UA.iphoneLine, "ios", "라인"],
    ["라인 안드로이드", UA.androidLine, "android", "라인"],
    ["인스타그램 아이폰", UA.iphoneInstagram, "ios", "인스타그램"],
    ["인스타그램 안드로이드", UA.androidInstagram, "android", "인스타그램"],
    ["페이스북 아이폰", UA.iphoneFacebook, "ios", "페이스북"],
    ["네이버 아이폰", UA.iphoneNaver, "ios", "네이버 앱"],
    ["네이버 안드로이드", UA.androidNaver, "android", "네이버 앱"],
    ["알 수 없는 iOS WKWebView(당근 등)", UA.iphoneUnknown, "ios", "이 앱"],
    [
      "알 수 없는 안드로이드 웹뷰(당근 등)",
      UA.androidUnknown,
      "android",
      "이 앱",
    ],
    [
      "옛 안드로이드 웹뷰(wv 없이 Version/4.0 Chrome)",
      "Mozilla/5.0 (Linux; Android 4.4.2; SM-G900 Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36",
      "android",
      "이 앱",
    ],
    [
      "Safari·슬랙과 텔레그램 iOS(SFSafariViewController)",
      UA.iphoneSafari,
      null,
      null,
    ],
    ["iOS Chrome", UA.iphoneChrome, null, null],
    ["iOS Firefox", UA.iphoneFirefox, null, null],
    [
      "안드로이드 Chrome·슬랙과 텔레그램 안드로이드(맞춤 탭)",
      UA.androidChrome,
      null,
      null,
    ],
    ["삼성 인터넷", UA.samsung, null, null],
    ["맥 Safari", UA.macSafari, null, null],
    ["윈도 Edge", WINDOWS_EDGE, null, null],
  ])("%s", (_, ua, kind, name) => {
    expect(webviewKind(ua)).toBe(kind);
    expect(webviewName(ua)).toBe(name);
  });
});

describe("패스키가 될지 미리 알아보기", () => {
  it("웹뷰가 아니면 API만 본다(이 기기 잠금이 없어도 휴대폰 QR·보안 키로 된다)", () => {
    expect(judgeReach(UA.iphoneSafari, true, false).ok).toBe(true);
    expect(judgeReach(UA.androidChrome, false, false)).toEqual({
      webview: null,
      api: false,
      ok: false,
    });
  });

  it("웹뷰는 이 기기 잠금으로 된다고 할 때만 된다고 본다", () => {
    expect(judgeReach(UA.iphoneKakao, true, false)).toEqual({
      webview: "ios",
      api: true,
      ok: false,
    });
    expect(judgeReach(UA.androidUnknown, true, true).ok).toBe(true);
    expect(judgeReach(UA.androidUnknown, false, true).ok).toBe(false);
  });

  it("getClientCapabilities가 있으면 그 값을 앞세운다", () => {
    expect(
      judgeReach(UA.iphoneKakao, true, true, {
        userVerifyingPlatformAuthenticator: false,
      }).ok,
    ).toBe(false);
    expect(
      judgeReach(UA.iphoneKakao, true, false, {
        userVerifyingPlatformAuthenticator: true,
      }).ok,
    ).toBe(true);
    // 그 항목이 없으면 isUVPAA로
    expect(
      judgeReach(UA.iphoneKakao, true, false, { hybridTransport: true }).ok,
    ).toBe(false);
  });
});

describe("바깥 브라우저로 여는 길", () => {
  const href = "https://game.byb.kr/stardraw/now?x=1#top";

  it("카카오톡은 카카오톡 스킴으로, 처음 열 때 자동으로", () => {
    const kakao = openOutside(UA.iphoneKakao, href);
    expect(kakao?.url).toBe(
      `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`,
    );
    expect(kakao?.label).toBe("Safari로 열기");
    expect(kakao?.auto).toBe(true);
    expect(kakao?.steps).toContain("공유 단추");
    const android = openOutside(UA.androidKakao, href);
    expect(android?.label).toBe("다른 브라우저로 열기");
    expect(android?.steps).toContain("다른 브라우저로 열기");
  });

  it("라인은 꼬리표를 붙인 같은 주소로, 자동으로", () => {
    expect(openOutside(UA.androidLine, href)).toMatchObject({
      url: "https://game.byb.kr/stardraw/now?x=1&openExternalBrowser=1#top",
      auto: true,
    });
    expect(openOutside(UA.iphoneLine, href)?.label).toBe("Safari로 열기");
  });

  it("그 밖의 안드로이드 웹뷰는 intent 주소, 단추로만", () => {
    const o = openOutside(UA.androidInstagram, href);
    expect(o?.url).toBe(
      `intent://game.byb.kr/stardraw/now?x=1#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(href)};end`,
    );
    expect(o?.auto).toBe(false);
    expect(o?.label).toBe("다른 브라우저로 열기");
    expect(openOutside(UA.androidUnknown, href)?.url).toMatch(/^intent:\/\//);
  });

  it("그 밖의 iOS 웹뷰는 x-safari-https, 단추로만", () => {
    const o = openOutside(UA.iphoneUnknown, href);
    expect(o?.url).toBe("x-safari-https://game.byb.kr/stardraw/now?x=1#top");
    expect(o?.auto).toBe(false);
    expect(o?.label).toBe("Safari로 열기");
    expect(o?.steps).toContain("Safari");
  });

  it("웹뷰가 아니면 길이 없다", () => {
    expect(openOutside(UA.iphoneSafari, href)).toBeNull();
    expect(openOutside(UA.androidChrome, href)).toBeNull();
  });

  it("자동 넘김은 웹뷰이고 안 될 것 같고 자동 길이 있을 때만", () => {
    const no = (ua: string) => judgeReach(ua, true, false);
    expect(autoOpenTarget(UA.iphoneKakao, no(UA.iphoneKakao), href)).toMatch(
      /^kakaotalk:/,
    );
    expect(autoOpenTarget(UA.androidLine, no(UA.androidLine), href)).toContain(
      "openExternalBrowser=1",
    );
    expect(
      autoOpenTarget(UA.androidUnknown, no(UA.androidUnknown), href),
    ).toBeNull();
    expect(
      autoOpenTarget(UA.iphoneUnknown, no(UA.iphoneUnknown), href),
    ).toBeNull();
    // 된다고 하면 넘기지 않는다
    expect(
      autoOpenTarget(
        UA.iphoneKakao,
        judgeReach(UA.iphoneKakao, true, true),
        href,
      ),
    ).toBeNull();
  });
});

describe("패스키 환경", () => {
  it("앱 안 브라우저 이름을 알아본다", () => {
    expect(inAppBrowser(IPHONE_KAKAO)).toBe("카카오톡");
    expect(inAppBrowser(UA.androidNaver)).toBe("네이버 앱");
    expect(inAppBrowser(ANDROID_CHROME)).toBeNull();
    expect(inAppBrowser(MAC_SAFARI)).toBeNull();
    expect(browserName(IPHONE_KAKAO)).toBe("Safari로");
    expect(browserName(ANDROID_CHROME)).toBe("Chrome 같은 브라우저로");
    expect(browserName(WINDOWS_EDGE)).toBe("Safari나 Chrome으로");
  });

  it("WebAuthn이 없으면 까닭과 할 일 한 문장, 있으면 앱 안 브라우저라도 null(먼저 시도한다)", () => {
    expect(passkeyBlocked(IPHONE_KAKAO, false)).toBe(
      "카카오톡 안에서는 패스키를 쓸 수 없습니다. Safari로 옮겨 오시면 이어서 접수하겠습니다.",
    );
    expect(passkeyBlocked(UA.androidUnknown, false)).toBe(
      "이 앱 안에서는 패스키를 쓸 수 없습니다. Chrome 같은 브라우저로 옮겨 오시면 이어서 접수하겠습니다.",
    );
    expect(passkeyBlocked(ANDROID_CHROME, false)).toBe(
      "이 브라우저는 패스키를 지원하지 않습니다. 최신 Safari·Chrome으로 열어 주세요.",
    );
    expect(passkeyBlocked(IPHONE_KAKAO, true)).toBeNull();
    expect(passkeyBlocked(ANDROID_CHROME, true)).toBeNull();
  });

  it("웹뷰에서 브라우저가 낸 패스키 실패만 앱 이름으로 알린다", () => {
    for (const name of [
      "NotAllowedError",
      "NotSupportedError",
      "SecurityError",
      "UnknownError",
      "AbortError",
    ])
      expect(inAppFailed(new DOMException("x", name), IPHONE_KAKAO)).toBe(
        "카카오톡",
      );
    expect(
      inAppFailed(new DOMException("x", "NotAllowedError"), UA.iphoneUnknown),
    ).toBe("이 앱");
    // 웹뷰 밖, 서버·연결 오류, 흉내 창 취소, 서버 응답 시간 초과는 세지 않는다
    expect(
      inAppFailed(new DOMException("x", "NotAllowedError"), MAC_SAFARI),
    ).toBeNull();
    expect(
      inAppFailed(new DOMException("x", "NotAllowedError"), UA.iphoneSafari),
    ).toBeNull();
    expect(inAppFailed(new TypeError("Failed to fetch"), IPHONE_KAKAO)).toBe(
      null,
    );
    expect(
      inAppFailed(
        new DOMException(DEMO_CANCEL, "NotAllowedError"),
        IPHONE_KAKAO,
      ),
    ).toBeNull();
    expect(
      inAppFailed(new DOMException("x", "TimeoutError"), IPHONE_KAKAO),
    ).toBeNull();
    expect(inAppText("카카오톡", IPHONE_KAKAO)).toBe(
      "카카오톡 안에서는 패스키 확인을 마치지 못했습니다. Safari로 옮겨 오시면 이어서 접수하겠습니다.",
    );
  });

  it("기기에 맞는 잠금 이름을 붙이고, 이 기기 잠금을 못 쓰면 패스키로 한다", () => {
    expect(unlockWith(IPHONE_KAKAO, true)).toBe("Face ID로");
    expect(unlockWith(MAC_SAFARI, true)).toBe("Touch ID로");
    expect(unlockWith(ANDROID_CHROME, true)).toBe("지문·화면 잠금으로");
    expect(unlockWith(WINDOWS_EDGE, true)).toBe("Windows Hello로");
    expect(unlockWith(WINDOWS_EDGE, false)).toBe("패스키로");
  });

  it("실패를 취소·만들 수 없음·그 밖으로 나눈다", () => {
    expect(passkeyProblem(new DOMException("x", "NotAllowedError"))).toBe(
      "cancelled",
    );
    expect(passkeyProblem(new DOMException("x", "NotSupportedError"))).toBe(
      "unsupported",
    );
    expect(passkeyProblem(new Error("x"))).toBe("other");
  });

  it("취소와 맞는 패스키 없음은 브라우저가 가르지 않아 함께 말하고, 시간 초과·흉내 창 취소는 따로", () => {
    const what = "접수되지 않았어요";
    expect(
      passkeyFailText(new DOMException("x", "NotAllowedError"), what),
    ).toBe(
      "접수되지 않았어요. 확인을 취소했거나, 이 기기에서 등록증의 패스키를 찾지 못했어요.",
    );
    expect(passkeyFailText(new DOMException("x", "AbortError"), what)).toBe(
      "접수되지 않았어요. 확인 시간이 지났어요.",
    );
    expect(
      passkeyFailText(new DOMException(DEMO_CANCEL, "NotAllowedError"), what),
    ).toBe("접수되지 않았어요. 확인을 취소했어요.");
  });
});
