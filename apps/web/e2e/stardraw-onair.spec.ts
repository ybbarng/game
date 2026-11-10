import { expect, fixStardrawClock, test } from "./test";

// 화면은 기기 시간대로 시각을 보인다. 시각 글자를 확인하므로 한국 시간으로 고정한다(CI는 UTC)
test.use({ timezoneId: "Asia/Seoul" });
test.beforeEach(({ page }) => fixStardrawClock(page));

test(
  "관측 방송: 관측 1분 중에 홈으로 들어오면 관측지, 이미 홈에 있던 사람은 그대로. 처음 온 사람에게 안내와 우주인 등록",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    // 데스크톱·휴대폰 세로로
    await page.goto("/stardraw");
    // 홈 아래 짧은 시간표: 세 줄, 「전체 시간표」로 페이지
    const strip = page.getByRole("region", { name: "관측 시간표" });
    await expect(strip.locator("[data-timetable-round]")).toHaveCount(3);
    await expect(
      strip.locator("[data-timetable-round]").first(),
    ).toHaveAttribute("data-state", "open");
    await page.screenshot({
      path: info.outputPath("stardraw-home-timetable.png"),
      fullPage: true,
    });

    // 1회 관측(13:00) 20초 뒤: 이미 홈에 있던 사람은 끌고 가지 않는다(하던 일을 끊지 않게)
    await page.clock.setSystemTime(new Date("2026-11-02T04:00:20Z"));
    await expect(strip.locator("[data-timetable-round='1']")).toHaveAttribute(
      "data-state",
      "observing",
      { timeout: 30_000 },
    );
    await expect(page).toHaveURL(/\/stardraw$/);
    // 관측 1분 중에 홈으로 새로 들어오면 관측지로(주소는 바꿔치기)
    await page.reload();
    await expect(page).toHaveURL(/\/stardraw\/now$/, { timeout: 30_000 });
    const guide = page.getByRole("complementary", { name: "관측 안내" });
    await expect(guide).toContainText("1회의 여섯 별을 관측하고 있습니다.");
    // 다음 회차 줄은 「다음 회차」로 시작한다(지금 관측하는 회차의 시각으로 읽히지 않게)
    await expect(guide.locator("[data-on-air-next='2']")).toContainText(
      "다음 회차",
    );
    await expect(guide.locator("[data-on-air-next='2']")).toContainText(
      "예측 접수 13:01",
    );
    await page.screenshot({
      path: info.outputPath("stardraw-onair.png"),
      fullPage: true,
    });

    // 우주인 등록은 같은 주소의 접수처(우주국 인사와 등록)
    await guide.getByRole("button", { name: "우주인 등록" }).click();
    await expect(page.getByRole("region", { name: "예측" })).toBeVisible();
    await expect(page).toHaveURL(/\/stardraw\/now$/);
  },
);

test("관측 방송: 관측 1분이 지나면 홈은 다시 홈이고, 시간표에서 전체 시간표로 간다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 데스크톱 한 크기로
  await page.clock.setSystemTime(new Date("2026-11-02T04:01:05Z"));
  await page.goto("/stardraw");
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(
    page.getByRole("complementary", { name: "관측 안내" }),
  ).toHaveCount(0);
  await page.locator("[data-timetable-more]").click();
  await expect(page).toHaveURL(/\/stardraw\/timetable$/);
  // 연습 장부는 처음 연 때를 1회차로 잡는다: 회차 번호 대신 맨 위 줄이 지금 접수 중인지 본다
  await expect(page.locator("[data-timetable-round]").first()).toHaveAttribute(
    "data-state",
    "open",
  );
});

test.describe("카카오톡 안 브라우저", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5",
  });

  test(
    "관측 안내의 「우주인 등록」은 막지 않고 시도하고, 실패하면 Safari로 여는 안내",
    { tag: "@only-phone-portrait" },
    async ({ page }, info) => {
      // 휴대폰 세로로
      // 웹뷰는 패스키를 못 쓸 때도 취소와 같은 오류를 낸다: 지문 확인이 안 되는 가상 인증기로 그 실패를 낸다
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("WebAuthn.enable");
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: false,
          automaticPresenceSimulation: true,
        },
      });
      // 연습 장부는 처음 연 때를 1회로 잡는다: 먼저 홈을 열고, 1회 관측 20초 뒤에 다시 들어오면 관측지
      await page.goto("/stardraw");
      await page.clock.setSystemTime(new Date("2026-11-02T04:00:20Z"));
      // 연습 장부가 1회 기록을 낼 때까지(시간표 줄이 관측 중으로)
      await expect(
        page
          .getByRole("region", { name: "관측 시간표" })
          .locator("[data-timetable-round='1']"),
      ).toHaveAttribute("data-state", "observing", { timeout: 30_000 });
      await page.reload();
      await expect(page).toHaveURL(/\/stardraw\/now$/, { timeout: 30_000 });
      await page
        .getByRole("complementary", { name: "관측 안내" })
        .getByRole("button", { name: "우주인 등록" })
        .click();
      // 접수처 입구가 뜬다: 등록 단추를 그대로 두고, 눌러서 실패하면 그 칸에 안내
      await page
        .locator("[data-key-setup]")
        .getByRole("button", { name: "우주인 등록", exact: true })
        .click();
      const note = page.locator(
        "[data-key-setup] [data-in-app-notice='tried']",
      );
      await expect(note).toContainText(
        "카카오톡 안에서는 패스키 확인을 마치지 못했습니다. Safari로 옮겨 오시면 이어서 접수하겠습니다.",
      );
      await expect(
        note.getByRole("link", { name: "Safari로 열기" }),
      ).toBeVisible();
      await expect(
        note.getByRole("button", { name: "주소 복사" }),
      ).toBeVisible();
      await expect(page.locator("[data-register-form]")).toHaveCount(0);
      await note.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath("stardraw-onair-kakao.png"),
      });
    },
  );
});
