// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  browserName,
  DEMO_CANCEL,
  inAppBrowser,
  inAppFailed,
  inAppText,
  openOutside,
  passkeyBlocked,
  passkeyFailText,
  passkeyProblem,
  unlockWith,
} from "./passkey-env";

const IPHONE_KAKAO =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

describe("패스키 환경", () => {
  it("앱 안 브라우저를 알아본다", () => {
    expect(inAppBrowser(IPHONE_KAKAO)).toBe("카카오톡");
    expect(
      inAppBrowser(`${ANDROID_CHROME} NAVER(inapp; search; 2000; 12.10.3)`),
    ).toBe("네이버 앱");
    expect(inAppBrowser(`${ANDROID_CHROME} Instagram 360.0.0`)).toBe(
      "인스타그램",
    );
    expect(inAppBrowser(ANDROID_CHROME)).toBeNull();
    expect(inAppBrowser(MAC_SAFARI)).toBeNull();
  });

  it("카카오톡·라인은 기기의 브라우저로 여는 주소를, 그 밖의 앱은 null을 준다", () => {
    const href = "https://game.byb.kr/stardraw?x=1";
    const kakao = openOutside("카카오톡", IPHONE_KAKAO, href);
    expect(kakao?.url).toBe(
      `kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`,
    );
    expect(kakao?.label).toBe("Safari로 열기");
    expect(kakao?.steps).toContain("공유 단추");
    const android = openOutside(
      "카카오톡",
      `${ANDROID_CHROME} KAKAOTALK 10.8.5`,
      href,
    );
    expect(android?.label).toBe("다른 브라우저로 열기");
    expect(android?.steps).toContain("다른 브라우저로 열기");
    expect(openOutside("라인", ANDROID_CHROME, href)?.url).toBe(
      "https://game.byb.kr/stardraw?x=1&openExternalBrowser=1",
    );
    expect(openOutside("인스타그램", ANDROID_CHROME, href)).toBeNull();
    expect(browserName(IPHONE_KAKAO)).toBe("Safari로");
    expect(browserName(ANDROID_CHROME)).toBe("Chrome 같은 브라우저로");
    expect(browserName(WINDOWS_EDGE)).toBe("Safari나 Chrome으로");
  });

  it("WebAuthn이 없으면 까닭과 할 일 한 문장, 있으면 앱 안 브라우저라도 null(먼저 시도한다)", () => {
    expect(passkeyBlocked(IPHONE_KAKAO, false)).toBe(
      "카카오톡 안에서는 패스키를 쓸 수 없어요. Safari로 열어 주세요.",
    );
    expect(passkeyBlocked(ANDROID_CHROME, false)).toContain(
      "이 브라우저는 패스키를 지원하지 않아요",
    );
    expect(passkeyBlocked(IPHONE_KAKAO, true)).toBeNull();
    expect(passkeyBlocked(ANDROID_CHROME, true)).toBeNull();
  });

  it("앱 안 브라우저에서 브라우저가 낸 패스키 실패만 앱 이름으로 알린다", () => {
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
    // 앱 밖, 서버·연결 오류, 흉내 창 취소, 서버 응답 시간 초과는 세지 않는다
    expect(
      inAppFailed(new DOMException("x", "NotAllowedError"), MAC_SAFARI),
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
      "카카오톡 안에서는 패스키가 되지 않을 수 있어요. Safari로 열어 주세요.",
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
