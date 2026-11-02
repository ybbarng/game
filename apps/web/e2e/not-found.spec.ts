import { expect, test } from "./test";

test("없는 주소: 한국어 404 화면에서 게임 목록과 별 따기 홈으로 간다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "데스크톱·휴대폰 세로로");
  const res = await page.goto("/stardraw/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "찾을 수 없는 페이지입니다." }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/찾을 수 없는 페이지/);
  const toStardraw = page.locator("[data-not-found-stardraw]");
  await expect(toStardraw).toBeVisible();
  await expect(page.locator("[data-not-found-home]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("not-found-stardraw.png") });
  await toStardraw.click();
  await expect(page).toHaveURL(/\/stardraw$/);

  // 별 따기 밖의 없는 주소는 게임 목록만
  await page.goto("/no-such-game");
  await expect(page.locator("[data-not-found-home]")).toBeVisible();
  await expect(page.locator("[data-not-found-stardraw]")).toHaveCount(0);
  await page.locator("[data-not-found-home]").click();
  await expect(page).toHaveURL(/\/$/);
});
