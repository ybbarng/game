import { expect, fixStardrawClock, type Page, test } from "./test";

/**
 * 앱 안 브라우저(웹뷰) 미리 알아보기·위쪽 띠·처음 열 때 바깥으로 자동 넘기기(docs/36 11-54).
 * 사용자 에이전트와 패스키 가능 여부(isUserVerifyingPlatformAuthenticatorAvailable)를 흉내 낸다. 띠의 판단은 기기 크기와
 * 상관없어 휴대폰 세로로만 본다
 */
test.use({ timezoneId: "Asia/Seoul" });
test.beforeEach(({ page }, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로로");
  return fixStardrawClock(page);
});

const WK = (tail = "") =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148${tail}`;
const WV = (tail = "") =>
  `Mozilla/5.0 (Linux; Android 15; SM-S928N Build/AP3A.240905.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36${tail}`;
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

/** 이 기기 잠금으로 패스키를 쓸 수 있다고 할지(웹뷰가 도메인과 연결되지 않으면 false) */
async function platformSays(page: Page, ok: boolean) {
  await page.addInitScript((ok) => {
    const pkc = window.PublicKeyCredential as unknown as Record<
      string,
      unknown
    >;
    pkc.isUserVerifyingPlatformAuthenticatorAvailable = async () => ok;
    delete pkc.getClientCapabilities;
  }, ok);
}

const autoOpened = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem("stardraw-auto-open"));

const band = (page: Page) => page.locator("[data-webview-band]");

test.describe("카카오톡 아이폰", () => {
  test.use({ userAgent: WK(" KAKAOTALK 10.8.5") });

  test("패스키가 안 될 것 같으면 띠를 띄우고 처음 한 번 바깥으로 넘긴다", async ({
    page,
  }, info) => {
    await platformSays(page, false);
    await page.goto("/stardraw");
    await expect(band(page)).toContainText("카노푸스 우주국");
    await expect(band(page)).toContainText(
      "카카오톡 안에서는 우주인 등록과 예측서 접수가 어렵습니다.",
    );
    await expect(
      band(page).getByRole("link", { name: "Safari로 열기" }),
    ).toHaveAttribute("href", /^kakaotalk:\/\/web\/openExternal\?url=http/);
    // 처음 열 때 카카오톡 스킴으로 넘겼다(넘긴 주소를 탭에 남긴다). 이 화면은 그대로
    await expect.poll(() => autoOpened(page)).toMatch(/^kakaotalk:\/\//);
    await expect(page).toHaveURL(/\/stardraw$/);
    // 둘러보기는 그대로: 첫 화면 입구가 보인다
    await expect(
      page.getByRole("button", { name: "우주인 등록", exact: true }),
    ).toBeVisible();
    // 띠 글을 누르면 메뉴 자리와 주소 복사
    await band(page).getByRole("button", { expanded: false }).click();
    await expect(band(page)).toContainText("공유 단추");
    await expect(
      band(page).getByRole("button", { name: "주소 복사" }),
    ).toBeVisible();
    // 본문이 띠 아래에서 시작한다
    const bandBox = await band(page).boundingBox();
    const main = await page.locator("main[data-game='stardraw']").boundingBox();
    expect(main?.y ?? 0).toBeGreaterThanOrEqual(
      (bandBox?.y ?? 0) + (bandBox?.height ?? 0) - 1,
    );
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({ path: info.outputPath("webview-home.png") });

    // 다시 열어도 다시 넘기지 않는다(탭마다 한 번). 띠는 남는다
    await page.evaluate(() =>
      sessionStorage.setItem("stardraw-auto-open", "seen"),
    );
    await page.goto("/stardraw/rounds");
    await expect(band(page)).toBeVisible();
    expect(await autoOpened(page)).toBe("seen");
  });

  test("관측지에도 띠가 있고 방송·머리 줄과 겹치지 않는다", async ({
    page,
  }, info) => {
    await platformSays(page, false);
    await page.goto("/stardraw");
    await page.clock.setSystemTime(new Date("2026-11-02T04:00:20Z"));
    await expect(
      page
        .getByRole("region", { name: "관측 시간표" })
        .locator("[data-timetable-round='1']"),
    ).toHaveAttribute("data-state", "observing", { timeout: 30_000 });
    await page.reload();
    await expect(page).toHaveURL(/\/stardraw\/now$/, { timeout: 30_000 });
    await expect(band(page)).toBeVisible();
    const bandBox = await band(page).boundingBox();
    const bottom = (bandBox?.y ?? 0) + (bandBox?.height ?? 0);
    // 띠 아래로 밀린 본문 첫 줄
    const first = await page
      .locator("main[data-game='stardraw'] > div")
      .first()
      .boundingBox();
    expect(first?.y ?? 0).toBeGreaterThanOrEqual(bottom - 1);
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({ path: info.outputPath("webview-observe.png") });
  });

  test("웹뷰라도 패스키가 된다고 하면 띠도 넘기기도 없다", async ({ page }) => {
    await platformSays(page, true);
    await page.goto("/stardraw");
    await expect(
      page.getByRole("button", { name: "우주인 등록", exact: true }),
    ).toBeVisible();
    await expect(band(page)).toHaveCount(0);
    expect(await autoOpened(page)).toBeNull();
  });
});

test.describe("카카오톡 안드로이드", () => {
  test.use({ userAgent: WV(";KAKAOTALK 2510030") });

  test("다른 브라우저로 여는 띠와 자동 넘김", async ({ page }) => {
    await platformSays(page, false);
    await page.goto("/stardraw");
    await expect(
      band(page).getByRole("link", { name: "다른 브라우저로 열기" }),
    ).toHaveAttribute("href", /^kakaotalk:\/\/web\/openExternal/);
    await expect.poll(() => autoOpened(page)).toMatch(/^kakaotalk:\/\//);
  });
});

test.describe("라인 안드로이드", () => {
  test.use({ userAgent: WV(" Line/15.12.1") });

  test("꼬리표를 붙인 주소로 한 번 넘기고, 돌아오면 주소에서 꼬리표를 지운다", async ({
    page,
  }) => {
    await platformSays(page, false);
    await page.goto("/stardraw");
    await expect
      .poll(() => autoOpened(page))
      .toContain("openExternalBrowser=1");
    // 라인이 바깥으로 넘기지 않는 판이면 같은 페이지가 꼬리표를 달고 다시 열린다: 꼬리표를 지우고 다시 넘기지 않는다
    await expect(band(page)).toBeVisible();
    await expect(page).toHaveURL(/\/stardraw$/);
  });
});

test.describe("알 수 없는 안드로이드 웹뷰", () => {
  test.use({ userAgent: WV() });

  test("「이 앱」 띠와 intent 단추, 자동 넘김은 없다", async ({ page }) => {
    await platformSays(page, false);
    await page.goto("/stardraw");
    await expect(band(page)).toContainText(
      "이 앱 안에서는 우주인 등록과 예측서 접수가 어렵습니다.",
    );
    await expect(
      band(page).getByRole("link", { name: "다른 브라우저로 열기" }),
    ).toHaveAttribute(
      "href",
      /^intent:\/\/localhost:\d+\/stardraw#Intent;scheme=https;action=android\.intent\.action\.VIEW;/,
    );
    expect(await autoOpened(page)).toBeNull();
  });
});

test.describe("알 수 없는 iOS WKWebView", () => {
  test.use({ userAgent: WK() });

  test("「이 앱」 띠와 x-safari-https 단추, 자동 넘김은 없다", async ({
    page,
  }) => {
    await platformSays(page, false);
    await page.goto("/stardraw");
    await expect(
      band(page).getByRole("link", { name: "Safari로 열기" }),
    ).toHaveAttribute("href", /^x-safari-https:\/\/localhost:\d+\/stardraw$/);
    expect(await autoOpened(page)).toBeNull();
  });
});

test.describe("슬랙 아이폰(SFSafariViewController는 Safari와 같다)", () => {
  test.use({ userAgent: SAFARI });

  test("이 기기 잠금이 없다고 해도 웹뷰가 아니라 아무것도 하지 않는다", async ({
    page,
  }) => {
    await platformSays(page, false);
    await page.goto("/stardraw");
    await expect(
      page.getByRole("button", { name: "우주인 등록", exact: true }),
    ).toBeVisible();
    await expect(band(page)).toHaveCount(0);
    expect(await autoOpened(page)).toBeNull();
  });
});
