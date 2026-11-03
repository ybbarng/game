import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브 배우기·훈련·핑거 트릭(/cube/learn, /cube/train, /cube/fingers, docs/47 8절).
 * 「표기」 배치로 친다(R = R, Shift+R = R', 두 번 = R2). 움직임 줄이기라 장면 회전은 바로 끝난다.
 * 키 입력은 3D 그림과 따로 준비되므로(`[data-cube-stage][data-input-ready]`) 그림이 아니라 입력 준비를 기다린다.
 */

async function useNotationKeys(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "cube.keymap.v1",
      JSON.stringify({
        version: 1,
        preset: "notation",
        bindings: [],
        mouseRotate: false,
      }),
    );
  });
}

/** 공식 글 → 「표기」 배치 키 */
function keysFor(alg: string): string[] {
  const keys: string[] = [];
  for (const token of alg.trim().split(/\s+/)) {
    const code = `Key${(token[0] as string).toUpperCase()}`;
    if (token.includes("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(`Shift+${code}`);
    else keys.push(code);
  }
  return keys;
}

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

const inputReady = (page: Page) =>
  expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible();

test("배우기: 첫 해보기 단원에서 힌트를 따라 치면 통과한다", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/learn");
  await expect(page.locator("[data-course]").first()).toBeVisible();
  await shot(page, "learn-list", info.project.name);

  await page.locator('[data-lesson="333-notation"]').click();
  await expect(page.locator("main")).toHaveAttribute(
    "data-cube-learn",
    "333-notation",
  );
  const section = page.locator("[data-step-kind]");
  // 시연 단계 하나 보기
  while ((await section.getAttribute("data-step-kind")) !== "demo")
    await page.locator("[data-step-next]").click();
  await expect(page.locator("[data-cube-demo]")).toBeVisible();
  await shot(page, "learn-demo", info.project.name);
  while ((await section.getAttribute("data-step-kind")) !== "try")
    await page.locator("[data-step-next]").click();
  await inputReady(page);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.locator("[data-cube-hint-button]").click();
  const hint = (await page
    .locator("[data-cube-hint]")
    .getAttribute("data-cube-hint")) as string;
  for (const k of keysFor(hint)) await page.keyboard.press(k);
  await expect(page.locator("[data-cube-pass]")).toBeVisible();
  await expect(page.locator("[data-cube-try]")).toHaveAttribute(
    "data-cube-passed",
    "",
  );
  await shot(page, "learn-try-passed", info.project.name);

  // 진도가 이 기기에 남는다
  await page.goto("/cube/learn");
  await expect(page.locator('[data-lesson="333-notation"]')).toContainText(
    "해보기 1/",
  );
});

test("훈련: PLL 하나를 모범 답으로 풀면 기록이 생긴다", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/train");
  const main = page.locator("main[data-train-set]");
  await expect(main).toHaveAttribute("data-train-set", "pll");
  await page.locator('[data-toggle="상황:picked"]').click();
  await page.locator('[data-case-pick="pll-t"]').check();
  await page.locator("[data-train-next]").click();
  await expect(main).toHaveAttribute("data-train-case", "pll-t");
  await inputReady(page);
  await shot(page, "train", info.project.name);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  const answer = (await main.getAttribute("data-train-answer")) as string;
  for (const k of keysFor(answer)) await page.keyboard.press(k);
  await expect(page.locator("[data-train-result]")).toBeVisible();
  await expect(main).toHaveAttribute("data-train-phase", "done");
  await expect(page.locator('[data-case="pll-t"]')).toHaveAttribute(
    "data-solves",
    "1",
  );
  await page.getByRole("button", { name: "공식 보기" }).click();
  await shot(page, "train-done", info.project.name);
});

test("핑거 트릭: 반복을 표시하면 시간 목록이 생긴다", async ({
  page,
}, info) => {
  await page.goto("/cube/fingers");
  const main = page.locator("main[data-fingers]");
  await expect(main).toHaveAttribute("data-fingers-phase", "idle");
  const mark = page.locator("[data-fingers-mark]");
  await mark.click();
  await expect(main).toHaveAttribute("data-fingers-phase", "running");
  await mark.click();
  await mark.click();
  await expect(page.locator("[data-fingers-laps] li")).toHaveCount(2);
  await shot(page, "fingers", info.project.name);
});
