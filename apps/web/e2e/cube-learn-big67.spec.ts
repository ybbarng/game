import { goStep, goToStep, no3d, PAGES, shot } from "./cube";
import { expect, type Page, test } from "./test";

/**
 * 6×6·7×7로 넓히기(docs/47 16-29): 해법 배우기 6×6·7×7 탭 둘에 같은 과정이 보이고, 5×5 축소법 끝 「다음에 할 것」이
 * 이 과정을 권하며, 단원은 그 크기 큐브로 열린다. 공식과 해 보기 상황은 단위 시험 big67-path.test.ts가 본다.
 */

/** 사이트 지금 크기(docs/47 16-28)를 미리 둔다 */
async function currentSize(page: Page, n: number) {
  await page.addInitScript((size) => {
    localStorage.setItem("cube.size.v1", JSON.stringify({ v: 1, n: size }));
  }, n);
}

test("6×6·7×7로 넓히기: 지금 크기 7이면 7×7 탭에 과정이 보이고, 6×6 탭에도 같은 과정이 있다", async ({
  page,
}, info) => {
  await no3d(page);
  await currentSize(page, 7);
  await page.goto("/cube/methods");
  await expect(page.locator("[data-course-sizes]")).toHaveAttribute(
    "data-value",
    "7",
  );
  await expect(
    page.locator('[data-course-size="7"] [data-course="big-666-777"]'),
  ).toBeVisible();
  await shot(page, "big67-methods-7", info.project.name);
  await page.locator('[data-size-tab="6"]').click();
  await expect(
    page.locator('[data-course-size="6"] [data-course="big-666-777"]'),
  ).toBeVisible();
  // 탭을 누르면 지금 크기도 바뀐다(하는 화면 규칙)
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("cube.size.v1") ?? ""))
    .toContain('"n":6');
});

test("6×6·7×7로 넓히기: 5×5 축소법 끝 「다음에 할 것」이 권하고, 단원은 7×7·6×6 큐브로 열린다", async ({
  page,
}) => {
  await no3d(page);
  await page.goto("/cube/learn?lesson=555-last-two-edges");
  await goStep(page, (await page.locator(`${PAGES} li`).count()) - 1);
  const next = page.locator(
    '[data-course-next="555-reduction"] [data-next-course="big-666-777"]',
  );
  await expect(next).toHaveAttribute("data-next-recommended", "");
  await next.click();
  await expect(page.locator("main")).toHaveAttribute(
    "data-cube-learn",
    "big67-centers",
  );
  await goToStep(page, "try");
  await expect(page.locator('[data-cube-poster="7"]').first()).toBeVisible();

  await page.goto("/cube/learn?lesson=big67-parity-666");
  await goToStep(page, "try");
  await expect(page.locator('[data-cube-poster="6"]').first()).toBeVisible();
});

test(
  "6×6·7×7로 넓히기: 3D로 7×7 막대 넣기 시연과 6×6 해 보기가 그려진다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    await page.goto("/cube/learn?lesson=big67-centers");
    await goToStep(page, "demo");
    await expect(
      page.locator("[data-cube-demo] [data-cube-canvas][data-cube-ready]"),
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, "big67-centers-demo", info.project.name);
    await page.goto("/cube/learn?lesson=big67-edges");
    await goToStep(page, "try");
    await expect(
      page.locator("[data-cube-canvas][data-cube-ready]").first(),
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, "big67-edges-try", info.project.name);
    await page.goto("/cube/learn?lesson=big67-parity-666");
    await goToStep(page, "try");
    await expect(
      page.locator("[data-cube-canvas][data-cube-ready]").first(),
    ).toBeVisible({ timeout: 30_000 });
    await shot(page, "big67-parity-try", info.project.name);
    // 안쪽 두 층(2-3Rw) 토끼이빨: 글 속 2-3Rw2가 한 수 칩으로 보인다
    await goStep(page, 3);
    await expect(
      page.locator('[data-move-chip="2-3Rw2"]').first(),
    ).toBeVisible();
    await shot(page, "big67-parity-both", info.project.name);
  },
);
