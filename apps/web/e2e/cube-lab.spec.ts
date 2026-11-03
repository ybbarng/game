import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브 그리기 시험 화면(/cube/lab, docs/47). 키를 치면 돌린 수가 늘고, 3D를 그릴 수 있으면 장면도 따라 돈다.
 * 움직임 줄이기(기본)라 회전 시간이 0이어서 키마다 바로 끝난다. 키보드 조작이라 데스크톱만 본다.
 *
 * 키 입력은 3D 그림과 따로 준비된다(`[data-cube-stage][data-input-ready]`). CI의 헤드리스 크롬은 GPU 없이
 * 소프트웨어로 그려 첫 그림이 몇 초 걸리므로(2026-11-04 CI: 약 5초), 키 시험은 그림을 기다리지 않는다.
 * 그림은 따로, 3D가 되는 환경에서만 확인한다.
 */

/** 3D 첫 그림(셰이더 만들기 등)은 느린 기기에서 오래 걸릴 수 있다. 멈춘 시험을 잡는 상한일 뿐이다 */
const FIRST_DRAW_LIMIT = 30_000;

const stageOf = (page: Page) =>
  page.locator("[data-cube-stage][data-input-ready]");

test("키를 치면 수가 세지고, 3D가 되면 장면도 따라 돈다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.goto("/cube/lab");
  const stage = stageOf(page);
  await expect(stage).toHaveAttribute("data-cube-moves", "0");

  // 「두 손」 배치: I = R, J = U, ; = y, ⌫ = 되돌리기
  await page.keyboard.press("KeyI");
  await expect(stage).toHaveAttribute("data-cube-moves", "1");
  await page.keyboard.press("KeyJ");
  await page.keyboard.press("Semicolon");
  await expect(stage).toHaveAttribute("data-cube-moves", "3");
  await page.keyboard.press("Backspace");
  await expect(stage).toHaveAttribute("data-cube-moves", "4");
  // 되풀이 누름(키를 누르고 있기)은 세지 않는다
  await page.keyboard.down("KeyH");
  await page.keyboard.down("KeyH");
  await page.keyboard.up("KeyH");
  await expect(stage).toHaveAttribute("data-cube-moves", "5");

  // 그림: 3D가 뜨거나, 못 그린다는 안내가 뜨거나
  const canvas = page.locator("[data-cube-canvas][data-cube-ready]");
  const noGl = page.locator("[data-cube-no3d]");
  await expect(canvas.or(noGl)).toBeVisible({ timeout: FIRST_DRAW_LIMIT });
  const has3d = await canvas.isVisible();
  if (has3d) {
    // 그림이 뜨기 전에 친 수까지 따라잡았다
    await expect(canvas).toHaveAttribute("data-cube-drawn", "5");
    await page.keyboard.press("KeyI");
    await expect(stage).toHaveAttribute("data-cube-moves", "6");
    await expect(canvas).toHaveAttribute("data-cube-drawn", "6");
  } else {
    info.annotations.push({ type: "3D", description: "이 환경은 3D 없음" });
  }
  if (SAVE_SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screens/cube-lab-3-${info.project.name}.png`,
      fullPage: true,
    });

  // 큰 큐브: 크기를 바꾸면 새 장면, Shift+I = 2R
  await page.locator("[data-cube-size]").selectOption("5");
  await expect(stage).toHaveAttribute("data-cube-moves", "0");
  await page.keyboard.press("Shift+KeyI");
  await page.keyboard.press("KeyJ");
  await page.keyboard.press("KeyH");
  await expect(stage).toHaveAttribute("data-cube-moves", "3");
  if (!has3d) return;

  await expect(canvas).toBeVisible({ timeout: FIRST_DRAW_LIMIT });
  await expect(canvas).toHaveAttribute("data-cube-drawn", "3");
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

  // 그리던 중 WebGL 문맥을 잃으면 안내로 바뀌고, 키는 그대로 센다
  await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("[data-cube-canvas]");
    const gl = c?.getContext("webgl2") ?? c?.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(noGl).toBeVisible();
  await expect(canvas).toHaveCount(0);
  await page.keyboard.press("KeyI");
  await expect(stage).toHaveAttribute("data-cube-moves", "4");
});

test("3D를 못 그리는 기기는 안내를 보이고 키는 그대로 센다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  // WebGL 문맥 만들기가 실패하는 기기처럼
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return (original as (...a: unknown[]) => unknown).call(
        this,
        type,
        ...rest,
      );
    } as typeof original;
  });
  await page.goto("/cube/lab");
  const stage = stageOf(page);
  await expect(page.locator("[data-cube-no3d]")).toBeVisible();
  await expect(page.locator("[data-cube-canvas]")).toBeHidden();
  await page.keyboard.press("KeyI");
  await page.keyboard.press("KeyJ");
  await page.keyboard.press("Backspace");
  await expect(stage).toHaveAttribute("data-cube-moves", "3");
  if (SAVE_SCREENSHOTS)
    await page.screenshot({
      path: `test-results/screens/cube-lab-no3d-${info.project.name}.png`,
      fullPage: true,
    });
});
