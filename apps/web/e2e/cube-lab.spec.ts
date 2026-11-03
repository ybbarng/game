import { expect, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브 그리기 시험 화면(/cube/lab, docs/47). 3D 캔버스가 뜨고, 키를 치면 장면이 회전을 끝낸 수가 늘어난다.
 * 움직임 줄이기(기본)라 회전 시간이 0이어서 키마다 바로 끝난다. 키보드 조작이라 데스크톱만 본다.
 */
test("키를 치면 큐브가 돈다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.goto("/cube/lab");
  const canvas = page.locator("[data-cube-canvas][data-cube-ready]");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-cube-moves", "0");

  // 「두 손」 배치: I = R, J = U, ; = y, ⌫ = 되돌리기
  await page.keyboard.press("KeyI");
  await expect(canvas).toHaveAttribute("data-cube-moves", "1");
  await page.keyboard.press("KeyJ");
  await page.keyboard.press("Semicolon");
  await expect(canvas).toHaveAttribute("data-cube-moves", "3");
  await page.keyboard.press("Backspace");
  await expect(canvas).toHaveAttribute("data-cube-moves", "4");
  // 되풀이 누름(키를 누르고 있기)은 세지 않는다
  await page.keyboard.down("KeyH");
  await page.keyboard.down("KeyH");
  await page.keyboard.up("KeyH");
  await expect(canvas).toHaveAttribute("data-cube-moves", "5");
  if (SAVE_SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screens/cube-lab-3-${info.project.name}.png`,
      fullPage: true,
    });

  // 큰 큐브: 크기를 바꾸면 새 장면, Shift+I = 2R
  await page.locator("[data-cube-size]").selectOption("5");
  const big = page.locator("[data-cube-canvas][data-cube-ready]");
  await expect(big).toHaveAttribute("data-cube-moves", "0");
  await page.keyboard.press("Shift+KeyI");
  await page.keyboard.press("KeyJ");
  await page.keyboard.press("KeyH");
  await expect(big).toHaveAttribute("data-cube-moves", "3");
  if (SAVE_SCREENSHOTS) {
    await page.screenshot({
      path: `test-results/screens/cube-lab-5-${info.project.name}.png`,
      fullPage: true,
    });
    await page.getByLabel("스티커 없는 모양").check();
    await page.screenshot({
      path: `test-results/screens/cube-lab-5-stickerless-${info.project.name}.png`,
      fullPage: true,
    });
  }
});
