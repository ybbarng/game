import { no3d } from "./cube";
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
  expect(page.locator("[data-keys-ready]")).toBeVisible();

// 3D 그림은 보지 않으므로 끈다(e2e/cube.ts `no3d`)
test.beforeEach(({ page }) => no3d(page));

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
  // 키 그림 면 색: R(I)은 빨강(면 1), R'(K)은 같은 색을 흐리게, x(T)는 큐브 돌리기(R 색 점선)
  await expect(page.locator('[data-key="KeyI"]')).toHaveAttribute(
    "data-key-paint",
    "1",
  );
  await expect(page.locator('[data-key="KeyK"]')).toHaveAttribute(
    "data-key-paint",
    "1'",
  );
  await expect(page.locator('[data-key="KeyT"]')).toHaveAttribute(
    "data-key-paint",
    "sweep",
  );
  // 「두 손」 Shift = 넓게(2026-11-04), Alt는 쓰지 않는다
  await expect(line("KeyI", "shift")).toHaveText("Rw");
  await expect(line("KeyI", "alt")).toHaveCount(0);
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

  // 크기 4: csTimer와 같은 층 수 키(7 = 오른손 층 수 +1)와 csTimer 안내
  await page.locator('[data-size="4"]').click();
  await page.locator("[data-keys-search]").fill("오른손 층 수");
  await expect(page.locator('tr[data-action="layers:R+"]')).toContainText("7");
  await expect(page.locator("[data-keys-cstimer]")).toContainText("Space");
});

test("키 익히기: 안내된 키를 치면 다음 단계로 넘어간다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 기기만");
  // 옛 주소는 사이트 쓰는 법의 「키」 부분으로 넘어간다(docs/47 16-6)
  await page.goto("/cube/keys/learn");
  await expect(page).toHaveURL(/\/cube\/intro\?part=keys$/);
  await ready(page);
  const main = page.locator("[data-learn-step]");
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
  // 둘째 단계는 큐브 둘러보기(x·y·z)
  await expect(main).toHaveAttribute("data-learn-step", "rotate");
  await expect(page.locator('[data-key="KeyT"]')).toHaveAttribute(
    "data-key-state",
    "lit",
  );
  await page.keyboard.press("KeyT");
  await expect(
    page.locator('[data-learn-targets] li[data-target-state="done"]'),
  ).toHaveCount(1);
  await shot(page, "keys-learn", info.project.name);
});

test("키 익히기: 둘러보기는 말한 색 면을 오게 돌리고, 한 면 단계는 돌린 뒤 되돌린다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 기기만");
  // 손 자리는 마친 사람(옛 단계 id 「right」도 함께: 새 단계 「오른쪽 면」으로 옮겨진다)
  await page.addInitScript(() =>
    localStorage.setItem(
      "cube.keylearn.v1",
      JSON.stringify({ done: ["home", "right"] }),
    ),
  );
  await page.goto("/cube/intro?part=keys");
  await ready(page);
  const main = page.locator("[data-learn-step]");
  await expect(main).toHaveAttribute("data-learn-step", "rotate");
  await expect(page.locator('[data-learn-tab="face-R"]')).toContainText("✓");
  const done = page.locator(
    '[data-learn-targets] li[data-target-state="done"]',
  );
  // x·y·z를 한 번씩(두 손: T ; P)
  for (const [i, code] of ["KeyT", "Semicolon", "KeyP"].entries()) {
    await page.keyboard.press(code);
    await expect(done).toHaveCount(i + 1);
  }
  // 첫 목표: 초록 위. 면을 돌리면 보는 쪽이 그대로라고 알린다
  await expect(page.locator("[data-learn-goal]")).toContainText(
    "초록 면을 위로",
  );
  await page.keyboard.press("KeyI");
  await expect(page.locator("[data-learn-feedback=miss]")).toContainText(
    "큐브 전체를 돌려요",
  );
  await page.keyboard.press("KeyK");
  await expect(main).toHaveAttribute("data-learn-facing", "3-1");
  // z'(Q)로 초록이 위로
  await page.keyboard.press("KeyQ");
  await expect(done).toHaveCount(4);
  await shot(page, "keys-learn-rotate", info.project.name);

  // 한 면 단계: 오른손 I·K, 돌리고 되돌려 맞춘다
  await page.locator('[data-learn-tab="face-L"]').click();
  await expect(main).toHaveAttribute("data-learn-step", "face-L");
  // 단계를 열면 큐브는 맞춘 상태(흰 위·초록 앞)
  await expect(main).toHaveAttribute("data-learn-facing", "0-2");
  const hand = page.locator("[data-learn-hand]");
  await expect(hand).toHaveAttribute("data-learn-hand", "왼손");
  await expect(hand.locator('[data-move-chip="L"]')).toContainText("D");
  await expect(hand.locator('[data-move-chip="L\'"]')).toContainText("E");
  for (const [i, code] of ["KeyD", "KeyE", "KeyE"].entries()) {
    await page.keyboard.press(code);
    await expect(done).toHaveCount(i + 1);
  }
  await shot(page, "keys-learn-face", info.project.name);
  await page.keyboard.press("KeyD");
  await expect(main).toHaveAttribute("data-learn-finished", "");
});

test("조작 훈련: 문제를 맞히면 키별 기록이 남는다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "키보드 기기만");
  // 옛 주소는 「연습」 부분으로, 쿼리도 함께 넘어간다(docs/47 16-6)
  await page.goto("/cube/keys/drill?mode=see");
  await expect(page).toHaveURL(/\/cube\/intro\?mode=see&part=practice$/);
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

test("조작 훈련: 판 도중에 떠나도 맞힌 문제의 기록이 남는다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 기기만");
  await page.goto("/cube/intro?part=practice");
  await ready(page);
  await page.getByRole("button", { name: "30수" }).click();
  await page.locator("[data-drill-start]").click();
  const t = (await page
    .locator("[data-drill-prompt]")
    .getAttribute("data-drill-prompt")) as string;
  await page.keyboard.press(TWO_HAND[t] as string);
  await expect(page.locator("[data-drill-score]")).toContainText("맞힘 1 ");
  // 그만을 누르지 않고 다시 연다
  await page.reload();
  await ready(page);
  await expect(
    page.locator(`[data-drill-stats] [data-stat="${t}"]`),
  ).toHaveCount(1);
});
