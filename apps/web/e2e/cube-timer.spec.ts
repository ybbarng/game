import { no3d } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브 타이머(/cube/timer, docs/47 6절). 아직 게임 목록에 없는 주소다.
 * 시계를 Playwright 가짜 시계로 바꿔, 살펴보기·준비 시간을 `fastForward`로 정확히 넘긴다.
 * 데스크톱은 스페이스바, 휴대폰은 화면 누르기로 한 번 재고 기록 한 줄이 생기는지 본다.
 */

async function phase(page: Page, value: string): Promise<void> {
  await expect(page.locator("[data-cube-timer]")).toHaveAttribute(
    "data-phase",
    value,
  );
}

// 3D 그림은 보지 않으므로 끈다(e2e/cube.ts `no3d`)
test.beforeEach(({ page }) => no3d(page));

test("한 번 재면 기록 한 줄이 생긴다", async ({ page }, info) => {
  test.skip(info.project.name === "phone-landscape", "세로·데스크톱만 본다");
  const phone = info.project.name === "phone-portrait";
  await page.clock.install();
  await page.goto("/cube/timer");
  await expect(page.locator("[data-cube-timer][data-loaded]")).toBeAttached();
  await expect(page.locator("[data-cube-net]")).toBeVisible();
  await expect(page.locator("[data-cube-solve]")).toHaveCount(0);
  // 시계를 멈춘다: 이제 시간은 fastForward로만 흘러, 부하로 늦어져도 잰 시간이 늘지 않는다
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 5_000);

  const face = page.locator("[data-cube-face]");
  const box = await face.boundingBox();
  if (!box) throw new Error("누름 자리가 보이지 않는다");
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const down = async () => {
    if (phone) {
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
    } else await page.keyboard.down("Space");
  };
  const up = async () => {
    if (phone) await page.mouse.up();
    else await page.keyboard.up("Space");
  };

  // 첫 누름: 15초 살펴보기
  await down();
  await up();
  await phase(page, "inspecting");
  await page.clock.fastForward(3000);
  // 누르고 있다가 준비(초록) → 떼면 시작
  await down();
  await phase(page, "holding");
  await page.clock.fastForward(400);
  await phase(page, "ready");
  await up();
  await phase(page, "running");
  await page.clock.fastForward(2500);
  if (SAVE_SCREENSHOTS)
    await page.screenshot({ path: info.outputPath("cube-timer-running.png") });
  // 멈춤: 데스크톱은 아무 키, 휴대폰은 화면 누르기
  if (phone) {
    await page.mouse.down();
    await page.mouse.up();
  } else await page.keyboard.press("a");
  await phase(page, "idle");

  const rows = page.locator("[data-cube-solve]");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("2.50");
  // 기록을 남기면 새 섞기가 나온다
  await expect(page.locator("[data-cube-net]")).toBeVisible();
  if (SAVE_SCREENSHOTS)
    await page.screenshot({
      path: info.outputPath("cube-timer.png"),
      fullPage: true,
    });

  // 새로고침해도 기록이 남는다
  await page.reload();
  await expect(page.locator("[data-cube-timer][data-loaded]")).toBeAttached();
  await expect(page.locator("[data-cube-solve]")).toHaveCount(1);
});
