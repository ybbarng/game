import { expect, fixStardrawClock, test } from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

test(
  "관측 기록: 지난 회차에서 들어가 공개 장부로 계산한 통계를 보고 탭으로 돌아간다",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    // 데스크톱·휴대폰 세로로
    await page.goto("/stardraw");
    // 연습 장부를 두 회차 넘겨 추첨한 회차를 만든다
    const skip = page.getByRole("button", { name: /다음 관측까지 건너뛰기/ });
    await skip.click();
    await skip.click();
    await page.locator("[data-tab='rounds']").click();
    await page.getByRole("button", { name: "관측 기록" }).click();
    await expect(page).toHaveURL(/\/stardraw\/stats$/);

    const stats = page.getByRole("region", { name: "관측 기록" });
    await expect(stats).toBeVisible();
    await expect(stats.locator("dt:text-is('관측') + dd")).toHaveText("2회");
    await expect(stats.getByText(/아직 2회뿐이라/)).toBeVisible();
    // 두 회차 빛난 별(겹치면 12개보다 적다)만큼 관측 하늘에 빛이 있다
    const glows = page.locator("[data-observed-sky] circle[data-drawn]");
    expect(await glows.count()).toBeGreaterThan(5);
    await expect(page.locator("[data-fairness]")).toBeVisible();
    await expect(stats.getByText("가장 자주 빛난 별")).toBeVisible();
    await expect(stats.getByText("한 번도 빛나지 않은 별")).toBeVisible();
    // 이야기 쪽 화면이라 drand 회차는 두지 않는다(검증 페이지로 옮겼다, docs/36 11-47)
    await expect(stats.getByText(/drand/)).toHaveCount(0);
    await expect(stats.getByText(/카이제곱/)).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: info.outputPath("stardraw-stats.png"),
      fullPage: true,
    });

    // 새로고침해도 관측 기록. 지난 회차 탭 아래 화면이라 그 탭이 켜져 있고, 누르면 지난 회차 목록
    await page.reload();
    await expect(page.getByRole("region", { name: "관측 기록" })).toBeVisible();
    const roundsTab = page.locator("nav [data-tab='rounds']");
    await expect(roundsTab).toHaveAttribute("aria-current", "page");
    await roundsTab.click();
    await expect(page).toHaveURL(/\/stardraw\/rounds$/);
    await expect(page.getByRole("region", { name: "지난 회차" })).toBeVisible();

    // 마지막 drand 회차와 카이제곱 값은 검증 페이지의 장부 검사 요약에 있다
    await page.goto("/stardraw/verify");
    await page.getByRole("button", { name: "장부 전체 검사" }).click();
    await expect(page.locator("[data-latest-drand]")).toContainText(
      "마지막 drand 회차",
    );
    await expect(page.locator("[data-ledger-chi2]")).toContainText("카이제곱");
  },
);
