import { goToStep, installClock, pauseClock, shot } from "./cube";
import { expect, type Locator, type Page, test } from "./test";

/**
 * 끌어 돌린 보기 각도가 손을 떼도 남는다(2026-11-10 사용자 「마우스로 돌리면 큐브가 돌다가 다시 원래대로 돌아가.
 * 그거 고쳐 달라고 한 세 번은 말했을 듯?」). 예전에는 손을 떼면 0.7초 동안 처음 각으로 돌아갔다. 지금은 모든
 * 큐브 3D 화면(`CubeView`의 `keepView` 기본)에서 그 각에 멈추고, 벗어나 있을 때만 「처음 각도로」 단추가 뜬다.
 * 단추나 ↑ 키로 처음 각으로 돌아온다.
 *
 * 보는 각은 캔버스의 `data-cube-view-turn`(처음 각에서 벗어난 「옆,위아래」 도)으로 본다. 장면은 그리는 장마다
 * 그 값을 적으니, 가짜 시계를 멈춰 두고 `fastForward`로 장을 넘긴다(실제 시간으로 기다리지 않는다).
 */

/** GPU 없는 CI는 첫 장면에 5초 넘게 걸린다(멈춘 시험을 잡는 상한) */
const SCENE = { timeout: 30_000 };
const HOME = "0,0";

const turnOf = (canvas: Locator) => canvas.getAttribute("data-cube-view-turn");

/** 조건이 맞을 때까지 장면 시계를 조금씩 넘긴다(장이 그려져야 값이 바뀐다) */
async function frameUntil(page: Page, ok: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await ok()) return;
    await page.clock.fastForward(50);
  }
  throw new Error("장면 시계를 넘기며 기다렸지만 조건이 맞지 않았다");
}

/** 마우스로 캔버스 가운데에서 (dx, dy)만큼 끈다 */
async function mouseDrag(page: Page, canvas: Locator, dx: number, dy: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("캔버스 없음");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

/** 손가락으로 캔버스 가운데에서 (dx, dy)만큼 끈다(CDP 터치, pointerType touch) */
async function touchDrag(page: Page, canvas: Locator, dx: number, dy: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("캔버스 없음");
  const x = box.x + box.width / 2 - dx / 2;
  const y = box.y + box.height / 2 - dy / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

/**
 * 끈 뒤: 각이 처음 각에서 벗어나고, 시간이 한참(4초, 예전 되돌아오기의 다섯 배 넘게) 지나도 그대로이며, 단추가 보인다.
 * 남은 각을 돌려준다
 */
async function expectKept(page: Page, canvas: Locator, home: Locator) {
  await frameUntil(page, async () => (await turnOf(canvas)) !== HOME);
  const kept = await turnOf(canvas);
  for (let i = 0; i < 8; i++) await page.clock.fastForward(500);
  expect(await turnOf(canvas), "손을 떼고 4초 뒤에도 그 각").toBe(kept);
  await expect(home).toBeVisible();
  return kept;
}

/** 처음 각으로 돌아와 단추가 사라진다 */
async function expectHome(page: Page, canvas: Locator, home: Locator) {
  await frameUntil(page, async () => (await turnOf(canvas)) === HOME);
  await expect(home).toBeHidden();
}

test("혼자 맞추기: 마우스로 끌어 돌린 각이 남고, x를 쳐도 그대로, 단추와 ↑ 키로 처음 각도로", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "마우스는 데스크톱 하나로");
  await page.addInitScript(() =>
    sessionStorage.setItem("mighty-splash-seen", "1"),
  );
  await installClock(page);
  await page.goto("/cube/solo");
  const stage = page.locator("[data-cube-stage]");
  const canvas = stage.locator("[data-cube-canvas][data-cube-ready]");
  await expect(canvas).toBeVisible(SCENE);
  await pauseClock(page);
  const home = stage.locator("[data-cube-view-home]");
  await frameUntil(page, async () => (await turnOf(canvas)) === HOME);
  await expect(home).toBeHidden();

  await mouseDrag(page, canvas, 140, 60);
  const kept = await expectKept(page, canvas, home);
  await shot(page, "keep-view-solo-dragged", info.project.name);

  // 큐브 돌리기(x, 「두 손」의 T)는 큐브가 돌고 보는 각은 그대로다
  await page.keyboard.press("KeyT");
  for (let i = 0; i < 6; i++) await page.clock.fastForward(200);
  expect(await turnOf(canvas), "x를 쳐도 보는 각은 그대로").toBe(kept);

  await home.click();
  await expectHome(page, canvas, home);

  // ↑ 키로도 돌아온다
  await mouseDrag(page, canvas, -120, -40);
  await expectKept(page, canvas, home);
  await page.keyboard.press("ArrowUp");
  await expectHome(page, canvas, home);
});

test("배우기: 끌어 돌린 각이 남고 「처음 각도로」로 돌아온다(마우스·휴대폰 손가락)", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "데스크톱과 휴대폰 세로");
  const touch = info.project.name === "phone-portrait";
  await page.addInitScript(() =>
    sessionStorage.setItem("mighty-splash-seen", "1"),
  );
  await installClock(page);
  await page.goto("/cube/learn?lesson=333-start");
  await goToStep(page, "quiz");
  const still = page.locator("[data-cube-still]").first();
  const canvas = still.locator("[data-cube-canvas][data-cube-ready]");
  await expect(canvas).toBeVisible(SCENE);
  await canvas.scrollIntoViewIfNeeded();
  await pauseClock(page);
  const home = still.locator("[data-cube-view-home]");
  await frameUntil(page, async () => (await turnOf(canvas)) === HOME);

  if (touch) await touchDrag(page, canvas, 160, -80);
  else await mouseDrag(page, canvas, 160, -80);
  await expectKept(page, canvas, home);
  await shot(page, "keep-view-learn-dragged", info.project.name);

  // 거의 움직이지 않고 누르면(누르기) 보는 각을 바꾸지 않는다
  const before = await turnOf(canvas);
  if (touch) await touchDrag(page, canvas, 4, 0);
  else await mouseDrag(page, canvas, 4, 0);
  for (let i = 0; i < 4; i++) await page.clock.fastForward(200);
  expect(await turnOf(canvas), "누르기는 각을 바꾸지 않는다").toBe(before);

  if (touch) await home.tap();
  else await home.click();
  await expectHome(page, canvas, home);
});
