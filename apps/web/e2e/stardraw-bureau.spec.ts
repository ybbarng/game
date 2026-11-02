import { expect, fixStardrawClock, type Page, test } from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

async function noSideScroll(page: Page) {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(wide).toBe(false);
}

/** footer의 기관 이름에서 우주국 소개 페이지로 들어간다 */
test("footer 「카노푸스 우주국」은 우주국 소개 페이지로", async ({
  page,
}, info) => {
  await page.goto("/stardraw/about");
  await page.locator("[data-agency-footer]").click();
  await expect(page).toHaveURL(/\/stardraw\/bureau$/);
  const bureau = page.locator("[data-bureau]");
  await expect(
    bureau.getByRole("heading", { name: "카노푸스 우주국", level: 1 }),
  ).toBeVisible();
  await expect(
    bureau.getByText("제1대 카노푸스 우주국장").first(),
  ).toBeVisible();
  // 우주국이 찾은 여섯 별 이야기(docs/36 11-34)
  await expect(
    bureau.getByRole("heading", { name: "여섯 별", exact: true }),
  ).toBeVisible();
  // 머리의 엠블럼은 우주국 로고(직인은 발급 문서에만, 2026-11-02 사용자)
  await expect(
    bureau.getByRole("img", { name: "카노푸스 우주국 로고" }).first(),
  ).toBeVisible();
  // 실제 성도·제주 바다·은하 도식·3D 배치(장부가 없는 빌드라 국장 열쇠 칸은 그리지 않는다)
  await expect(
    bureau.getByRole("img", { name: /카노푸스 둘레의 실제 성도/ }),
  ).toBeVisible();
  await expect(
    bureau.getByRole("img", { name: /마라도에서 남쪽을 바라본 하늘/ }),
  ).toBeVisible();
  await expect(
    bureau.getByRole("img", { name: /서울에서 남쪽을 바라본 하늘/ }),
  ).toBeVisible();
  await bureau.getByRole("button", { name: "12월 15일" }).click();
  await expect(
    bureau.getByText(
      /2026년 12월 1[56]일 .*마라도에서 남쪽 바다를 바라본 하늘/,
    ),
  ).toBeVisible();
  await expect(
    bureau.getByRole("img", { name: /우리 은하 도식/ }),
  ).toBeVisible();
  await expect(bureau.locator("[data-nearby-3d]")).toBeVisible();
  await expect(bureau.locator("[data-bureau-director]")).toHaveCount(0);
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("stardraw-bureau.png"),
    fullPage: true,
  });
});

/** 우주국 「하는 일」에서 설명 페이지의 한 회차의 흐름으로, 그 아래 장소와 낱말(2026-11-02 사용자) */
test("우주국 「하는 일」에서 한 회차의 흐름과 장소와 낱말로", async ({
  page,
}, info) => {
  await page.goto("/stardraw/bureau");
  await page
    .getByRole("link", { name: "한 회차의 흐름: 접수처에서 관측지까지" })
    .click();
  await expect(page).toHaveURL(/\/stardraw\/about#flow$/);
  const flow = page.locator("#flow");
  await expect(
    flow.getByRole("heading", { name: "한 회차의 흐름", level: 2 }),
  ).toBeVisible();
  await expect(flow.locator("[data-flow] > li")).toHaveCount(4);
  for (const place of ["접수처", "마감", "관측지", "결과"])
    await expect(
      flow.getByRole("heading", { name: new RegExp(`^${place}`), level: 3 }),
    ).toBeVisible();
  await expect(flow.getByText("1등", { exact: true })).toBeVisible();
  const words = page.locator("#words");
  await expect(words.locator("[data-words] dt")).toHaveCount(11);
  await expect(words.getByText("언덕 아래", { exact: true })).toBeVisible();
  await noSideScroll(page);
  // 사람이 보는 스크린샷이라 CI에서는 찍지 않는다(page.screenshot과 같은 조건, e2e/test.ts)
  if (process.env.CI && !process.env.E2E_SCREENSHOTS) return;
  await flow.screenshot({ path: info.outputPath("stardraw-flow.png") });
  await words.screenshot({ path: info.outputPath("stardraw-words.png") });
});
