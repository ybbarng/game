import { no3d } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 내 공식(/cube/algs)의 추천 후보·버릇 들이기와 공식 훈련 「내 목록」(docs/47 8-1, 2026-11-04).
 * 기존 cube-algs.spec.ts와 따로 짧게 둔다(하나에 15초 안쪽). 큐브는 입력 준비(`data-input-ready`)를 조건으로 기다린다.
 */

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS || project === "phone-landscape") return;
  await page.screenshot({
    path: `test-results/screens/cube-my-algs-${name}-${project}.png`,
    fullPage: true,
  });
}

const UA_CANDIDATE = "F2 U' L R' F2 L' R U' F2";

// 3D 그림은 보지 않으므로 끈다(e2e/cube.ts `no3d`)
test.beforeEach(({ page }) => no3d(page));

test("후보를 쓰는 공식으로 고르고 버릇 들이기를 켜면 내 목록 훈련에 그 상황이 나온다", async ({
  page,
}, info) => {
  await page.goto("/cube/algs?case=pll-ua");
  const d = page.locator('[data-alg-case="pll-ua"]');
  await expect(d.locator("[data-alg-candidates]")).toBeVisible();

  // 후보 쓰기 → 쓰는 공식이 후보로, 배우기와 다름 표시
  const row = d.locator(`[data-alg-candidate="${UA_CANDIDATE}"]`);
  await row.locator("[data-candidate-use]").click();
  await expect(row).toHaveAttribute("data-alg-used", "");
  await expect(d.locator("[data-alg-used-chips]")).toContainText(
    "배우기와 다름",
  );

  // 버릇 들이기 → 카드와 걸러 보기에 나온다
  await d.locator('[data-habit-set="learning"]').click();
  await expect(d.locator("[data-alg-habit]")).toHaveAttribute(
    "data-alg-habit",
    "learning",
  );
  await shot(page, "candidates", info.project.name);
  await page.locator('[data-algs-filter="learning"]').click();
  await expect(page.locator("[data-case-open]")).toHaveCount(1);
  await expect(
    page.locator('[data-case-open="pll-ua"] [data-case-habit="learning"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-case-open="pll-ua"] [data-case-differs]'),
  ).toBeVisible();
  await page.locator('[data-algs-filter="all"]').click();
  await page.locator("[data-alg-case] button", { hasText: "닫기" }).click();
  await shot(page, "table", info.project.name);

  // 내 목록 훈련: 목록에 하나뿐이라 그 상황이 나오고, 모범 답이 고른 후보다
  await page.locator("[data-algs-train-mine]").click();
  const main = page.locator("[data-train-pick]");
  await expect(main).toHaveAttribute("data-train-pick", "mine");
  await expect(main).toHaveAttribute("data-train-case", "pll-ua");
  await expect(main).toHaveAttribute(
    "data-train-answer",
    new RegExp(`${UA_CANDIDATE}$`),
  );
  await expect(page.locator("[data-train-mine-list] li")).toHaveCount(1);
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toHaveCount(
    1,
  );
  await shot(page, "train-mine", info.project.name);
});
