import {
  expect,
  type Locator,
  type Page,
  SAVE_SCREENSHOTS,
  test,
} from "./test";

/**
 * 3D 티어 엠블럼 시안(`/cube/tiers/emblems` 맨 위, docs/47 14-7). 헤드리스는 SDR이라 보석은 번짐(bloom) 길로 그린다.
 * 실제 HDR 밝기는 HDR 맥에서 사람이 본다. 시안 칸 크기가 화면 크기와 상관없어 데스크톱에서만 본다.
 */

async function draftShot(page: Page, name: string): Promise<void> {
  if (!SAVE_SCREENSHOTS) return;
  await page.locator("[data-emblem3d-draft]").screenshot({
    path: `test-results/screens/cube-emblem3d-${name}.png`,
  });
}

/** 다음 화면 그리기를 몇 번 기다린다(그 사이 엠블럼이 그리면 장 수가 는다) */
async function someFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++)
      await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

async function dragBy(page: Page, stage: Locator, dx: number, dy = 0) {
  const box = await stage.boundingBox();
  if (!box) throw new Error("시안 칸이 보이지 않는다");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

const yawOf = async (stage: Locator) =>
  Number(await stage.getAttribute("data-emblem3d-yaw"));

test("3D 엠블럼 시안: 끌면 좌우로 돌고 놓은 각에 남으며, 가만히 있으면 그리지 않고, 처음 각도로 돌아온다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 3D 장면 둘과 찍은 그림을 소프트웨어 GPU로 그려 보통 시험보다 오래 걸린다
  test.setTimeout(120_000);
  await page.goto("/cube/tiers/emblems");
  const dia = page.locator('[data-emblem3d="diamond"]');
  const gold = page.locator('[data-emblem3d="gold"]');
  await expect(dia).toHaveAttribute("data-emblem3d-path", /^(bloom|hdr)$/, {
    timeout: 60_000,
  });
  await expect(gold).toHaveAttribute("data-emblem3d-path", "plain", {
    timeout: 60_000,
  });
  const stages = [dia, gold].map((e) => e.locator("[data-emblem3d-stage]"));
  for (const s of stages) {
    await expect(s).toHaveAttribute("data-emblem3d-frames", /^[1-9]/);
    await expect(s).toHaveAttribute("data-emblem3d-yaw", "0.000");
  }
  // 찍은 그림: 티어마다 정면 한 장 + 각도 여섯 장
  for (const t of ["diamond", "gold"]) {
    await expect(page.locator(`[data-emblem3d-shots="${t}"]`)).toHaveAttribute(
      "data-emblem3d-shot-count",
      "7",
      { timeout: 60_000 },
    );
  }
  await draftShot(page, "front");

  // 가만히 있으면 그리지 않는다
  const framesOf = (s: Locator) =>
    s.getAttribute("data-emblem3d-frames").then(Number);
  const idle = await Promise.all(stages.map(framesOf));
  await someFrames(page);
  expect(await Promise.all(stages.map(framesOf))).toEqual(idle);
  await expect(dia.locator("[data-cube-view-home]")).toHaveCount(0);

  // 왼쪽으로 끌면 왼쪽으로 돈 채 남는다(동작 줄이기라 미끄러지지 않는다)
  for (const s of stages) {
    await dragBy(page, s, -50, 6);
    await expect(s).not.toHaveAttribute("data-emblem3d-moving");
    expect(await yawOf(s)).toBeLessThan(-0.4);
    expect(Number(await s.getAttribute("data-emblem3d-pitch"))).toBeGreaterThan(
      0,
    );
  }
  const left = await Promise.all(stages.map(yawOf));
  const afterDrag = await Promise.all(stages.map(framesOf));
  await someFrames(page);
  expect(await Promise.all(stages.map(yawOf))).toEqual(left);
  expect(await Promise.all(stages.map(framesOf))).toEqual(afterDrag);
  await expect(dia.locator("[data-cube-view-home]")).toBeVisible();
  await draftShot(page, "left");

  // 오른쪽으로 끌면 오른쪽으로
  for (const s of stages) {
    await dragBy(page, s, 100, -6);
    await expect(s).not.toHaveAttribute("data-emblem3d-moving");
    expect(await yawOf(s)).toBeGreaterThan(0.4);
  }
  await draftShot(page, "right");

  // 「처음 각도로」
  await dia.locator("[data-cube-view-home]").click();
  await expect(stages[0] as Locator).toHaveAttribute(
    "data-emblem3d-yaw",
    "0.000",
  );
  await expect(dia.locator("[data-cube-view-home]")).toHaveCount(0);
});

test("3D를 그릴 수 없으면 3D 시안 자리에 지금 SVG 엠블럼이 나온다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    // WebGL을 못 얻는 기기처럼
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === "webgl2" || type === "webgl") return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto("/cube/tiers/emblems");
  for (const t of ["diamond", "gold"]) {
    const e = page.locator(`[data-emblem3d="${t}"]`);
    await expect(e).toHaveAttribute("data-emblem3d-path", "svg");
    await expect(e.locator(`[data-cube-emblem="${t}"]`)).toBeVisible();
    await expect(e.locator("canvas")).toHaveCount(0);
  }
});
