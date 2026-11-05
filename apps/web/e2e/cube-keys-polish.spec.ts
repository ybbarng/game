import { inputReady, no3d, shot } from "./cube";
import { expect, test } from "./test";

/**
 * 키 다듬기(2026-11-04, #101 남은 일): 핑거 트릭의 「두 손」 키캡, 키 그림의 짝 잇기·손가락 자리, 키 익히기의
 * 배치 규칙 맞히기, 큰 큐브의 층 수(손 표시), 설정 사용자 키의 겹침 묻기. 3D 그림은 보지 않으므로 끈다.
 * 판정은 순수 함수 시험(keys/*.test.ts, keymap-conflict.test.ts)이 맡고, 여기서는 화면에 이어졌는지만 본다.
 */

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "키보드 기기만");
  await no3d(page);
});

test("핑거 트릭: 수마다 「두 손」 키캡", async ({ page }, info) => {
  await page.goto("/cube/fingers");
  await expect(page.locator('[data-fingers-key="R"]').first()).toContainText(
    "I",
  );
  await expect(page.locator('[data-fingers-key="R\'"]').first()).toContainText(
    "K",
  );
  await shot(page, "fingers-keys", info.project.name);
});

test("키 익히기: 배치 규칙은 키 글을 가리고 손가락으로 맞힌다", async ({
  page,
}) => {
  await page.goto("/cube/keys/learn");
  await expect(page.locator("[data-keys-ready]")).toBeAttached();
  await page.locator('[data-learn-tab="rule"]').click();
  const main = page.locator("main[data-learn-step]");
  await expect(main).toHaveAttribute("data-learn-step", "rule");
  await expect(main).toContainText("핑거 트릭");
  // 키 그림에 손가락 자리. 같은 면 두 키를 잇던 선은 뺐다(2026-11-05, 두 키가 같은 면 색 아래선)
  await expect(page.locator("[data-key-pair]")).toHaveCount(0);
  await expect(
    page.locator('[data-keyboard-map] [data-key-finger="left-검지"]'),
  ).toBeAttached();
  await page.keyboard.press("KeyI");
  // L'은 맞히기: 글을 가리고(키 칸에 동작 글이 없다) 실마리만
  await expect(page.locator("[data-learn-ask]")).toHaveAttribute(
    "data-learn-ask",
    "L'",
  );
  await expect(
    page.locator('[data-keyboard-map] [data-key="KeyE"] [data-layer-line]'),
  ).toHaveCount(0);
  await page.keyboard.press("KeyE");
  await expect(
    page.locator('[data-learn-targets] li[data-target-state="done"]'),
  ).toHaveCount(2);
});

test("5×5 「두 손」: 7로 오른손 층 수를 올리면 큐브와 키 그림에 보이고, 키캡이 따라간다", async ({
  page,
}) => {
  await page.goto("/cube/solo");
  await inputReady(page);
  await page.locator("[data-cube-size]").selectOption("5");
  await inputReady(page);
  await expect(page.locator("[data-cube-keys]")).toBeVisible();
  await expect(page.locator("[data-key-layers]")).toHaveAttribute(
    "data-key-layers",
    "1-1",
  );
  await page.keyboard.press("Digit7");
  await expect(page.locator("[data-cube-layers]")).toHaveAttribute(
    "data-cube-layers",
    "1-2",
  );
  await expect(page.locator("[data-key-layers]")).toHaveAttribute(
    "data-key-layers",
    "1-2",
  );
  // 층 수 2에서 R 키(I)는 바깥 두 층(Rw)
  await page.keyboard.press("KeyI");
  await expect(page.locator("[data-cube-moves]")).toHaveText("1");
});

test("설정 사용자 키: 쓰던 키를 지정하면 먼저 묻고, 키가 없어진 동작을 표시한다", async ({
  page,
}) => {
  await page.goto("/cube/settings");
  await page
    .locator("[data-settings-keymap]")
    .getByRole("button", { name: "사용자", exact: true })
    .click();
  await page.locator('[data-assign="R"]').click();
  await page.keyboard.press("KeyJ");
  const ask = page.locator("[data-keymap-conflict]");
  await expect(ask).toContainText(
    "J 키는 지금 「U」 동작이에요. 「R」 동작으로 바꿀까요?",
  );
  // 그만두면 그대로
  await page.locator("[data-conflict-no]").click();
  await expect(ask).toHaveCount(0);
  await expect(page.locator("[data-no-key]")).toHaveCount(0);
  // 바꾸면 알리고, U에 키가 없다고 표시
  await page.locator('[data-assign="R"]').click();
  await page.keyboard.press("KeyJ");
  await page.locator("[data-conflict-yes]").click();
  await expect(page.locator("[data-keymap-message]")).toContainText(
    "「U」 동작에는 이제 키가 없어요",
  );
  await expect(page.locator("[data-keymap-keyless]")).toContainText("U");
});
