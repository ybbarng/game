import { expect, test } from "./test";

/**
 * 큐브 해법 지도 시안(/cube/learn-map, 2026-11-25). 네 안(A 지도·B 갈림길·C 노선도·D 막대), 여러 해법 고르기,
 * 「나」 표시와 견본 기록. 시안을 고르면 이 시험도 고른 안에 맞춰 줄인다.
 */

test("해법 지도: 기록이 없으면 「나」는 준비 칸, 초보자 길의 꼬리표는 그 단원으로 간다", async ({
  page,
}) => {
  await page.goto("/cube/learn-map");
  await expect(page.locator('[data-solve-map="a"]')).toBeVisible();
  await expect(page.locator("[data-map-prep] [data-me]")).toBeVisible();
  await expect(page.locator("[data-node] [data-me]")).toHaveCount(0);
  await expect(page.locator('[data-edge="first-corners"]')).toHaveAttribute(
    "href",
    "/cube/learn?lesson=333-first-corners-up",
  );
  // 단원이 없는 걸음(코너 방향 먼저)은 누를 수 없다
  await expect(page.locator('[data-edge="twist-first"]')).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("해법 지도: 해법을 여럿 고르면 주소에 담기고 고른 해법의 길만 선이 그려진다", async ({
  page,
}) => {
  await page.goto("/cube/learn-map?v=a&m=beginner");
  await expect(page.locator('[data-solve-map="a"]')).toBeVisible();
  await page.locator('[data-method="cfop"]').click();
  await expect(page).toHaveURL(/m=beginner%2Ccfop/);
  await expect(page.locator('[data-edge-line="f2l-pair-1"]')).toHaveCount(1);
  await expect(page.locator('[data-edge-line="roux-fb"]')).toHaveCount(0);
  // 두 해법이 함께 지나는 십자 길은 선 둘
  await expect(page.locator('[data-edge-line="cross"]')).toHaveCount(2);
});

test("해법 지도 D: 막대 길이는 잰 수에 맞고(CFOP가 초보자보다 짧다) 끝에 총 공식 수·평균 수", async ({
  page,
}) => {
  await page.goto("/cube/learn-map?v=d&m=beginner,cfop");
  const bar = (id: string) =>
    page.locator(`[data-bar="${id}"] [data-bar-measured]`);
  await expect(bar("cfop")).toBeVisible();
  const w = async (id: string) => (await bar(id).boundingBox())?.width ?? 0;
  expect(await w("cfop")).toBeLessThan(await w("beginner"));
  await expect(
    page.locator('[data-bar="beginner"] [data-bar-total]'),
  ).toHaveText("공식 6 · 127수");
  await expect(page.locator('[data-bar="cfop"] [data-bar-total]')).toHaveText(
    "공식 119 · 55수",
  );
});

test("해법 지도 B: 갈림길 구간을 누르면 그 구간의 걸음이 펼쳐진다", async ({
  page,
}) => {
  await page.goto("/cube/learn-map?v=b&m=beginner");
  const seg = page.locator('[data-hub="cross"] [data-segment]').first();
  await seg.locator("button").click();
  await expect(seg.locator("[data-segment-steps] [data-edge]")).toHaveCount(2);
});

test("해법 지도 견본 기록: 지나온 길에 「나」, 약한 걸음·익숙한 상황 수가 보인다", async ({
  page,
}) => {
  await page.goto("/cube/learn-map?v=a&m=beginner&demo=1");
  await expect(page.locator('[data-node="f2l"] [data-me]')).toBeVisible();
  const second = page.locator('[data-edge="second-layer"]');
  await expect(second.locator("[data-edge-solo]")).toHaveAttribute(
    "data-edge-solo",
    "weak",
  );
  await expect(second.locator("[data-edge-train]")).toContainText("익숙 2/3");
});
