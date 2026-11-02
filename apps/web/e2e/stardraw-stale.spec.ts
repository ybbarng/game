import { expect, type Page, test } from "./test";

/** 창에 표시를 심어 두면, 페이지를 새로 불러온 뒤에는 사라진다(같은 문서 안 이동이면 남는다) */
async function mark(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __mark?: number }).__mark = 1;
  });
}
const marked = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mark?: number }).__mark === 1);

test("조용히 새 화면으로: 배포된 판이 바뀌면 다음 화면 이동 때 그 주소를 새로 불러온다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱 한 크기로");
  // 배포된 판 번호를 다른 값으로(새 배포가 나온 것처럼)
  let asked = 0;
  await page.route("**/version.json", (route) => {
    asked += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ commit: "0".repeat(40) }),
    });
  });
  await page.goto("/stardraw");
  await expect.poll(() => asked).toBeGreaterThan(0);
  await mark(page);
  await page.locator("nav [data-tab='rounds']").click();
  await expect(page).toHaveURL(/\/stardraw\/rounds$/);
  await expect(page.getByRole("region", { name: "지난 회차" })).toBeVisible();
  // 새로 불러왔다(표시가 사라졌다)
  expect(await marked(page)).toBe(false);
});

test("조용히 새 화면으로: 판이 같으면 화면 이동은 그대로 문서 안에서", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱 한 크기로");
  let asked = 0;
  await page.route("**/version.json", async (route) => {
    asked += 1;
    await route.continue();
  });
  await page.goto("/stardraw");
  await expect.poll(() => asked).toBeGreaterThan(0);
  await mark(page);
  await page.locator("nav [data-tab='rounds']").click();
  await expect(page.getByRole("region", { name: "지난 회차" })).toBeVisible();
  expect(await marked(page)).toBe(true);
});
