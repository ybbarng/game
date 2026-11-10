import { goToStep, shot } from "./cube";
import {
  expect,
  type Locator,
  type Page,
  SAVE_SCREENSHOTS,
  test,
} from "./test";

/**
 * 분해·조립을 휴대폰 3D 장면에서 손가락으로(2026-11-05 사용자 「폰으로 할 때 돌아가지 않고 돌아오니까 노란 조각을
 * 끼울 수가 없어」). 분해 장면에는 뒷면 거울 판이 없어 아래(노란색)·뒤(파란색)·왼쪽(주황색) 빈자리는 끌어 돌려야
 * 보인다. 예전에는 손을 떼면 보기가 처음 각으로 돌아가 그 자리를 누를 수 없었다. 지금은 끌어 돌린 각이 남는다
 * (`keepView`). 터치는 CDP 터치 이벤트로 흉내 낸다(pointerType touch). 3D 칸의 화면 자리는 장면에 묻는다
 * (cube-view `__cubeTestHooks`의 `pointClient`).
 */

/** GPU 없는 CI는 첫 장면에 5초 넘게 걸린다(멈춘 시험을 잡는 상한) */
const SCENE = { timeout: 30_000 };

type Vec = [number, number, number];
type Hooked = {
  __cubeView: {
    pointClient(p: Vec, n: Vec): { x: number; y: number } | null;
    viewMoving: boolean;
    viewTurned: boolean;
  };
};

/** 칸(조각 중심이 아니라 칸 가운데 점)과 그 칸이 보는 쪽 */
const CELL = {
  D: { at: [0, -1.5, 0], normal: [0, -1, 0] },
  R: { at: [1.5, 0, 0], normal: [1, 0, 0] },
  B: { at: [0, 0, -1.5], normal: [0, 0, -1] },
  L: { at: [-1.5, 0, 0], normal: [-1, 0, 0] },
  UF: { at: [0, 1.5, 1], normal: [0, 1, 0] },
  UR: { at: [1, 1.5, 0], normal: [0, 1, 0] },
  UFR: { at: [1, 1.5, 1], normal: [0, 1, 0] },
} satisfies Record<string, { at: Vec; normal: Vec }>;

/** 끌기·되돌리기가 멈출 때까지 기다린다 */
async function settled(canvas: Locator) {
  await expect
    .poll(() =>
      canvas.evaluate((el) => (el as unknown as Hooked).__cubeView.viewMoving),
    )
    .toBe(false);
}

/** 손가락으로 캔버스 가운데에서 (dx, dy)만큼 끈다 */
async function swipe(page: Page, canvas: Locator, dx: number, dy: number) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("캔버스 없음");
  const x = box.x + box.width / 2 - dx / 2;
  const y = box.y + box.height / 2 - dy / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  const steps = 12;
  for (let i = 1; i <= steps; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
  await settled(canvas);
}

/** 칸을 손가락으로 누른다(지금 보기에서 그 칸이 보여야 한다) */
async function tapCell(page: Page, canvas: Locator, cell: keyof typeof CELL) {
  const { at, normal } = CELL[cell];
  const p = await canvas.evaluate(
    (el, [a, n]) => (el as unknown as Hooked).__cubeView.pointClient(a, n),
    [at, normal] as [Vec, Vec],
  );
  expect(p, `${cell} 칸이 보인다`).not.toBeNull();
  await page.touchscreen.tap(p?.x ?? 0, p?.y ?? 0);
}

test("색 배치 문제: 3D에서도 위·앞 센터 블럭만 색이 보인다(스크린샷)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 하나로");
  // 사람이 3D 그림을 보는 용도라 스크린샷을 찍을 때만 돈다(판정은 큐브 그림 시험 cube-learn-acts가 한다)
  test.skip(!SAVE_SCREENSHOTS, "스크린샷을 찍을 때만");
  await page.addInitScript(() =>
    sessionStorage.setItem("mighty-splash-seen", "1"),
  );
  await page.goto("/cube/learn?lesson=333-start");
  await goToStep(page, "quiz");
  await expect(page.locator("[data-learn-quiz]")).toContainText(
    "오른쪽 센터는",
  );
  await expect(
    page.locator("[data-cube-still] [data-cube-ready]").first(),
  ).toBeAttached(SCENE);
  // 장면이 실제로 그려질 때까지(그리기 두 번) 기다린 뒤 찍는다
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  await shot(page, "color-scheme-quiz-3d", info.project.name);
});

test("분해·조립: 휴대폰에서 끌어 돌린 채로 아래·뒤·왼쪽 빈자리를 눌러 끝까지 끼운다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 하나로");
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    (window as { __cubeTestHooks?: boolean }).__cubeTestHooks = true;
  });
  await page.goto("/cube/learn?lesson=333-start");
  await goToStep(page, "build");
  const build = page.locator('[data-act="build"]');
  const canvas = build.locator("[data-cube-canvas][data-cube-ready]");
  await expect(canvas).toBeVisible(SCENE);
  await build.locator("[data-build-start]").click();
  await expect(build).toHaveAttribute("data-build-phase", "core");
  await build.locator("[data-build-next]").click();
  const built = build.locator("[data-build-count]");
  await expect(built).toHaveAttribute("data-build-count", "2/6");
  await canvas.scrollIntoViewIfNeeded();

  // 처음 각에서는 아래(노란색 자리)가 안 보인다
  const hidden = await canvas.evaluate(
    (el, [a, n]) => (el as unknown as Hooked).__cubeView.pointClient(a, n),
    [CELL.D.at, CELL.D.normal] as [Vec, Vec],
  );
  expect(hidden).toBeNull();

  // 위로 밀어 아래를 본다. 손을 떼도 그 각이 남아 노란색 자리를 누를 수 있다
  await swipe(page, canvas, 0, -260);
  await shot(page, "build-touch-bottom", info.project.name);
  await tapCell(page, canvas, "D");
  await expect(built).toHaveAttribute("data-build-count", "3/6");
  await expect(build.locator("[data-build-say]")).toHaveText("맞아요!");
  await shot(page, "build-touch-yellow", info.project.name);

  // 아래로 밀어 되돌리고 빨간색(오른쪽), 옆으로 밀어 파란색(뒤)·주황색(왼쪽)
  await swipe(page, canvas, 0, 235);
  await tapCell(page, canvas, "R");
  await expect(built).toHaveAttribute("data-build-count", "4/6");
  await swipe(page, canvas, -330, 0);
  await tapCell(page, canvas, "B");
  await expect(built).toHaveAttribute("data-build-count", "5/6");
  await swipe(page, canvas, -200, 0);
  await tapCell(page, canvas, "L");
  await expect(build).toHaveAttribute("data-build-phase", "edges");

  // 「처음 각도로」로 돌아와 위쪽 엣지 둘, 코너 하나
  await build.locator("[data-cube-view-home]").click();
  await settled(canvas);
  expect(
    await canvas.evaluate(
      (el) => (el as unknown as Hooked).__cubeView.viewTurned,
    ),
  ).toBe(false);
  await tapCell(page, canvas, "UF");
  await tapCell(page, canvas, "UR");
  await build.locator("[data-build-fill]").click();
  await expect(build).toHaveAttribute("data-build-phase", "corners");
  await tapCell(page, canvas, "UFR");
  await build.locator("[data-build-fill]").click();
  await expect(build).toHaveAttribute("data-act-passed", "");
});
