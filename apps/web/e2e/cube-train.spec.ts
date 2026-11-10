import type { Page } from "@playwright/test";

import { inputReady, keysFor, no3d, shot, useNotationKeys } from "./cube";
import { expect, test } from "./test";

/**
 * 큐브 훈련(/cube/train)·핑거 트릭(/cube/fingers, docs/47 8절). 3D 그림은 보지 않으므로 끈다(`no3d`).
 */

test.beforeEach(({ page }) => no3d(page));

/** 지금 문제가 i번째(0부터)이고 키를 받는 상태가 될 때까지 */
async function atProblem(page: Page, i: number): Promise<string> {
  const main = page.locator("main[data-practice-stage]");
  await expect(main).toHaveAttribute("data-practice-index", String(i));
  await expect(main).toHaveAttribute("data-practice-phase", "play");
  return (await main.getAttribute("data-practice-answer")) as string;
}

test("공식 연습: 따라 치기 한 판(틀린 수 하나 포함)", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/train?set=beginner-second");
  const main = page.locator("main[data-practice-stage]");
  await expect(main).toHaveAttribute("data-practice-stage", "beginner-second");
  await expect(main).toHaveAttribute("data-practice-mode", "follow");
  await atProblem(page, 0);
  await inputReady(page);
  // 키는 숨긴다: 키 그림(배치 안내 줄 포함)은 접힌 채 시작하고, 수 단추에는 표기만
  const keysWrap = page.locator("[data-cube-keys-wrap]");
  await expect(keysWrap).toBeHidden();
  await expect(page.locator("[data-cube-buttons]")).toBeVisible();
  await shot(page, "practice-follow", info.project.name);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  // 펴 볼 수는 있지만 기억하지 않는다(다시 열면 접혀 있다)
  const toggle = page.locator("[data-cube-keys-toggle]");
  await expect(toggle).toHaveText("키 그림 보기");
  await toggle.click();
  await expect(keysWrap).toBeVisible();
  await page.reload();
  await atProblem(page, 0);
  await inputReady(page);
  await expect(keysWrap).toBeHidden();
  const first = await atProblem(page, 0);
  // 앞에서 넣기·오른쪽에서 넣기·뒤집힌 엣지 모두 첫 수가 U·U'라 B는 늘 틀린 수
  expect(first).toMatch(/^U/);
  await page.keyboard.press("KeyB");
  const wrong = page.locator('[data-token-state="wrong"]');
  await expect(wrong).toHaveCount(1);
  // 그 한 수(U 또는 U')의 키만 보인다
  await expect(page.locator("[data-practice-wrong-keys]")).toContainText("U");
  await expect(main).toHaveAttribute("data-practice-combo", "0");
  await shot(page, "practice-wrong", info.project.name);

  for (let i = 0; i < 10; i++) {
    const answer = await atProblem(page, i);
    for (const k of keysFor(answer)) await page.keyboard.press(k);
  }
  const summary = page.locator("[data-practice-summary]");
  await expect(summary).toBeVisible();
  await expect(main).toHaveAttribute("data-practice-phase", "over");
  // 틀린 수가 하나라 100%가 아니고, 그 뒤 아홉을 깨끗하게 이었다
  await expect(summary.locator('[data-stat="accuracy"] dd')).not.toHaveText(
    "100%",
  );
  await expect(summary.locator('[data-stat="combo"] dd')).toHaveText("9");
  await expect(summary.locator("[data-practice-slow] li")).not.toHaveCount(0);
  await shot(page, "practice-summary", info.project.name);
});

test("공식 연습: 보고 치기는 공식을 펼치면 콤보가 끊긴다", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/train?set=beginner-yellow-cross&mode=see");
  const main = page.locator("main[data-practice-stage]");
  await expect(main).toHaveAttribute("data-practice-mode", "see");
  await atProblem(page, 0);
  await inputReady(page);
  await expect(page.locator("[data-practice-tokens]")).toHaveCount(0);
  await page.locator("[data-practice-peek-button]").click();
  await expect(page.locator("[data-practice-peek]")).toBeVisible();
  await shot(page, "practice-see", info.project.name);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  for (const k of keysFor(await atProblem(page, 0)))
    await page.keyboard.press(k);
  const answer = await atProblem(page, 1);
  await expect(main).toHaveAttribute("data-practice-combo", "0");
  for (const k of keysFor(answer)) await page.keyboard.press(k);
  await atProblem(page, 2);
  await expect(main).toHaveAttribute("data-practice-combo", "1");
});

test("자유 훈련: PLL 하나를 모범 답으로 풀면 기록이 생긴다", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/train?mode=free");
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
