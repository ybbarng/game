import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브 키 익히기(/cube/keys, /cube/keys/learn, /cube/keys/drill, docs/47 4절). 기본 배치 「두 손」으로 친다.
 * 키 입력은 3D 그림과 따로 준비되므로(`[data-keys-ready]`) 그림이 아니라 입력 준비를 기다린다(WebGL 없는 환경).
 */

/** 「두 손」 배치에서 면 수 → 키 */
const TWO_HAND: Record<string, string> = {
  R: "KeyI",
  "R'": "KeyK",
  L: "KeyD",
  "L'": "KeyE",
  U: "KeyJ",
  "U'": "KeyF",
  D: "KeyS",
  "D'": "KeyL",
  F: "KeyH",
  "F'": "KeyG",
  B: "KeyW",
  "B'": "KeyO",
};

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

const ready = (page: Page) =>
  expect(page.locator("main[data-keys-ready]")).toBeVisible();

test("단축키 표: 키 자리에 배치대로 동작이 적히고 찾을 수 있다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "세로·PC만");
  await page.goto("/cube/keys");
  await ready(page);
  const line = (code: string, layer: string) =>
    page.locator(`[data-key="${code}"] [data-layer-line="${layer}"]`);
  await expect(line("KeyE", "plain")).toHaveText("L'");
  await expect(line("KeyR", "plain")).toHaveText("Lw'");
  await expect(line("KeyI", "plain")).toHaveText("R");
  await expect(line("KeyI", "alt")).toHaveText("Rw");
  // 휴대폰에서도 가로로 넘치지 않는다
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, "keys-map", info.project.name);

  await page.locator("[data-keys-search]").fill("R'");
  await expect(page.locator("[data-keys-table] tbody tr")).toHaveCount(1);
  await expect(page.locator('tr[data-action="R\'"]')).toContainText("K");

  // 크기 4: 안쪽 층(Shift+I = 2R)이 흐리지 않다
  await page.locator('[data-size="4"]').click();
  await expect(line("KeyI", "shift")).toHaveText("2R");
  await expect(line("KeyI", "shift")).not.toHaveClass(/opacity-30/);
});

test("키 익히기: 안내된 키를 치면 다음 단계로 넘어간다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 기기만");
  await page.goto("/cube/keys/learn");
  await ready(page);
  const main = page.locator("main[data-learn-step]");
  await expect(main).toHaveAttribute("data-learn-step", "home");
  // 칠 키가 빛난다
  await expect(page.locator('[data-key="KeyF"]')).toHaveAttribute(
    "data-key-state",
    "lit",
  );
  // 틀린 키는 무엇이었는지 알린다
  await page.keyboard.press("KeyK");
  await expect(page.locator("[data-learn-feedback=miss]")).toContainText(
    "K 키는 「R'」",
  );
  await page.keyboard.press("KeyF");
  await page.keyboard.press("KeyJ");
  await expect(main).toHaveAttribute("data-learn-finished", "");
  await page.locator("[data-learn-next]").click();
  await expect(main).toHaveAttribute("data-learn-step", "right");
  await expect(page.locator('[data-key="KeyI"]')).toHaveAttribute(
    "data-key-state",
    "lit",
  );
  await page.keyboard.press("KeyI");
  await expect(
    page.locator('[data-learn-targets] li[data-target-state="done"]'),
  ).toHaveCount(1);
  await shot(page, "keys-learn", info.project.name);
});

test("조작 훈련: 문제를 맞히면 키별 기록이 남는다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "키보드 기기만");
  await page.goto("/cube/keys/drill");
  await ready(page);
  await page.getByRole("button", { name: "30수" }).click();
  await page.locator("[data-drill-start]").click();
  const prompt = page.locator("[data-drill-prompt]");
  const score = page.locator("[data-drill-score]");
  for (let i = 1; i <= 4; i++) {
    const t = (await prompt.getAttribute("data-drill-prompt")) as string;
    await page.keyboard.press(TWO_HAND[t] as string);
    await expect(score).toContainText(`맞힘 ${i} `);
  }
  await page.getByRole("button", { name: "그만" }).click();
  await expect(page.locator("[data-drill=see]")).toHaveAttribute(
    "data-drill-phase",
    "done",
  );
  await expect(page.locator("[data-drill-hits]")).toHaveText("4");
  await expect(page.locator("[data-drill-stats] [data-stat]")).not.toHaveCount(
    0,
  );
  await shot(page, "keys-drill", info.project.name);

  // 다시 열어도 기록이 남아 있다
  await page.reload();
  await ready(page);
  await expect(page.locator("[data-drill-stats] [data-stat]")).not.toHaveCount(
    0,
  );
});
