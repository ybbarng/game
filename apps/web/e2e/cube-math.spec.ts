import { no3d } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브의 수학(`/cube/math`): 첫 화면 배우기 묶음에서 들어가 카드를 넘기고, 경우의 수 묻고 맞히기와
 * 「뽑아서 다시 끼우기」 판정을 해 본다. 숫자·판정 자체는 `cube/math/*.test.ts`가 본다.
 */

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-math-${name}-${project}.png`,
    fullPage: true,
  });
}

// 3D 그림은 보지 않으므로 끈다(e2e/cube.ts `no3d`)
test.beforeEach(({ page }) => no3d(page));

test(
  "큐브의 수학 카드를 넘기며 직접 해 본다",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    // 배치가 세로 휴대폰과 같다
    await page.goto("/cube");
    const link = page.locator(
      "[data-cube-group='더 보기'] a[href='/cube/math']",
    );
    await expect(link).toBeVisible();
    if (SAVE_SCREENSHOTS)
      await page.screenshot({
        path: `test-results/screens/cube-math-home-${info.project.name}.png`,
        fullPage: true,
      });
    await link.click();
    await expect(page.locator("[data-cube-math='count']")).toBeVisible();

    // 경우의 수: 3×3 첫 질문(코너 자리)을 맞히면 8! 이 쌓인다
    await page
      .locator("[data-math-quiz='count-corner-places'] [data-choice='1']")
      .click();
    await expect(page.locator("[data-count-value]")).toHaveText("40,320");
    await page.locator("[data-count-skip]").click();
    await expect(page.locator("[data-count-done]")).toContainText(
      "43,252,003,274,489,856,000",
    );
    await shot(page, "count", info.project.name);

    // 다음 카드: 뽑아서 다시 끼우기
    await page.locator("[data-math-next]").click();
    await expect(page.locator("[data-cube-math='reassemble']")).toBeVisible();
    await expect(page.locator("[data-reassemble-ratio]")).toContainText("12");
    await page.locator("[data-op-preset='flip']").click();
    await page.locator("[data-guess='no']").click();
    await expect(page.locator("[data-verdict]")).toHaveAttribute(
      "data-verdict",
      "impossible",
    );
    await expect(page.locator("[data-factor-broken]")).toHaveCount(1);
    // 한 번 더 뒤집으면(같은 엣지) 다시 풀린다
    await page.locator("[data-op-preset='flip']").click();
    await page.locator("[data-guess='yes']").click();
    await expect(page.locator("[data-verdict]")).toHaveAttribute(
      "data-verdict",
      "solvable",
    );
    await page.locator("[data-op-preset='flip']").click();
    await page.locator("[data-guess='no']").click();
    await shot(page, "reassemble", info.project.name);

    // 셋째 카드: 방향과 홀짝 계기(센터 180° 공식을 넣어도 규칙은 지켜진다)
    await page.locator("[data-math-next]").click();
    await expect(page.locator("[data-cube-math='orient']")).toBeVisible();
    await page.locator("[data-orient-center-alg]").click();
    await expect(page.locator("[data-meter='center']")).toContainText("2");
    await expect(page.locator("[data-orient-meters] [data-ok]")).toHaveCount(5);
    await shot(page, "orient", info.project.name);

    // 넷째 카드: 크기를 바꾸면 표의 줄이 바뀐다
    await page.locator("[data-math-next]").click();
    await page.locator("[data-sizes-tab='5']").click();
    await expect(page.locator("[data-sizes]")).toHaveAttribute(
      "data-sizes",
      "5",
    );
    await page.locator("[data-math-quiz='sizes-5'] [data-choice='1']").click();
    await expect(page.locator("[data-math-quiz='sizes-5']")).toHaveAttribute(
      "data-solved",
      "",
    );
    await shot(page, "sizes", info.project.name);

    // 되풀이 카드: R U는 105번
    await page.locator("nav[aria-label='카드 차례'] button").nth(5).click();
    await page.locator("[data-order-preset='R U']").click();
    await expect(page.locator("[data-order-value]")).toHaveText("105");
    await shot(page, "order", info.project.name);

    // 신의 수·교환자 카드는 글만 본다(스크린샷용)
    if (SAVE_SCREENSHOTS) {
      await page.locator("nav[aria-label='카드 차례'] button").nth(4).click();
      await expect(page.locator("[data-cube-math='god']")).toBeVisible();
      await shot(page, "god", info.project.name);
      await page.locator("nav[aria-label='카드 차례'] button").nth(6).click();
      await expect(page.locator("[data-cube-math='commutator']")).toBeVisible();
      await shot(page, "commutator", info.project.name);
    }

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  },
);
