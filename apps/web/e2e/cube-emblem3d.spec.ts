import {
  expect,
  type Locator,
  type Page,
  SAVE_SCREENSHOTS,
  test,
} from "./test";

/**
 * 3D 티어 엠블럼 시안(`/cube/tiers/emblems` 맨 위, docs/47 14-7). 열 티어 격자(찍은 그림)에서 고른 하나만 큰 칸에 살아 있는 3D. 헤드리스는 SDR이라 보석은 번짐(bloom) 길로 그린다.
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
  // 3D 장면과 찍은 그림(열 티어 격자)을 소프트웨어 GPU로 그려 보통 시험보다 오래 걸린다
  test.setTimeout(120_000);
  await page.goto("/cube/tiers/emblems");
  // 기본 선택은 다이아몬드(보석): 큰 칸 하나만 살아 있는 3D
  const dia = page.locator('[data-emblem3d="diamond"]');
  await expect(dia).toHaveAttribute("data-emblem3d-path", /^(bloom|hdr)$/, {
    timeout: 60_000,
  });
  await expect(page.locator("[data-emblem3d]")).toHaveCount(1);
  const stages = [dia.locator("[data-emblem3d-stage]")];
  for (const s of stages) {
    await expect(s).toHaveAttribute("data-emblem3d-frames", /^[1-9]/);
    await expect(s).toHaveAttribute("data-emblem3d-yaw", "0.000");
  }
  // 찍은 그림: 고른 티어의 정면 한 장 + 각도 여섯 장, 열 티어 격자
  await expect(page.locator('[data-emblem3d-shots="diamond"]')).toHaveAttribute(
    "data-emblem3d-shot-count",
    "7",
    { timeout: 60_000 },
  );
  const grid = page.locator("[data-emblem3d-grid]");
  await expect(grid).toHaveAttribute("data-emblem3d-grid-ready", "", {
    timeout: 60_000,
  });
  await expect(grid.locator("[data-emblem3d-pick] img")).toHaveCount(10);
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
    // 기본 다이아몬드는 기본 시안으로 큰 칸(440px)이라 칸 너비 대비 같은 비율만큼 끈다
    await dragBy(page, s, -75, 6);
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
    await dragBy(page, s, 150, -6);
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

  // 격자에서 골드를 누르면 큰 칸이 골드(금속, 번짐 없음)로 바뀌고 처음 각도에서 시작한다
  await grid.locator('[data-emblem3d-pick="gold"]').click();
  const gold = page.locator('[data-emblem3d="gold"]');
  await expect(gold).toHaveAttribute("data-emblem3d-path", "plain", {
    timeout: 60_000,
  });
  await expect(page.locator("[data-emblem3d]")).toHaveCount(1);
  const goldStage = gold.locator("[data-emblem3d-stage]");
  await expect(goldStage).toHaveAttribute("data-emblem3d-frames", /^[1-9]/);
  await expect(goldStage).toHaveAttribute("data-emblem3d-yaw", "0.000");
  await expect(page.locator('[data-emblem3d-shots="gold"]')).toHaveAttribute(
    "data-emblem3d-shot-count",
    "7",
    { timeout: 60_000 },
  );
  await draftShot(page, "gold");
});

/** 두 PNG(같은 크기)의 화소 차 RMSE(0~1, RGB) */
async function pngRmse(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([pa, pb]) => {
      const load = async (b64: string) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(
          new Blob([bin], { type: "image/png" }),
        );
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      };
      const [x, y] = await Promise.all([load(pa), load(pb)]);
      let s = 0;
      let n = 0;
      for (let k = 0; k < Math.min(x.length, y.length); k += 4)
        for (let ch = 0; ch < 3; ch++) {
          const d = ((x[k + ch] ?? 0) - (y[k + ch] ?? 0)) / 255;
          s += d * d;
          n++;
        }
      return Math.sqrt(s / n);
    },
    [a.toString("base64"), b.toString("base64")] as const,
  );
}

test("대기 그림과 3D는 같은 자리·같은 크기·같은 생김새: 3D 첫 장이 뜨기 전에는 미리 찍은 그림이 덮고, 바뀔 때 1px도 움직이지 않는다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  test.setTimeout(120_000);
  // 3D를 붙잡아 두었다가 대기 그림을 잰 뒤 놓는다
  await page.addInitScript(() => {
    const w = window as unknown as {
      __emblem3dHold: Promise<void>;
      __emblem3dRelease: () => void;
    };
    w.__emblem3dHold = new Promise<void>((r) => {
      w.__emblem3dRelease = r;
    });
  });
  // 기본 선택 다이아몬드는 기본 시안(얕은 계단)으로 크게 연다(화려함 사다리)
  for (const [url, tier, size] of [
    ["/cube/tiers/emblems", "diamond", 440],
    ["/cube/tiers/emblems?gem=b&emblemBg=light", "emerald", 440],
    ["/cube/tiers/emblems?tier=challenger", "challenger", 440],
  ] as const) {
    await page.goto(url);
    const box = page.locator(`[data-emblem3d="${tier}"]`);
    const poster = box.locator("[data-emblem3d-poster]");
    await expect(poster).toBeVisible();
    await expect(box).toHaveAttribute("data-emblem3d-path", "loading");
    // 다른 모양 그림(SVG 엠블럼)은 보이지 않는다
    await expect(box.locator("[data-cube-emblem]")).toHaveCount(0);
    // 찍은 그림은 칸과 같은 크기를 두 배 화소로 찍었다
    await expect
      .poll(() =>
        poster.evaluate((img: HTMLImageElement) =>
          img.complete ? img.naturalWidth : 0,
        ),
      )
      .toBe(size * 2);
    // 찍기(screenshot)가 칸을 화면 안으로 스크롤하므로 자리는 찍은 뒤에 잰다
    const posterPng = await box.screenshot();
    const before = await poster.boundingBox();
    await page.evaluate(() =>
      (
        window as unknown as { __emblem3dRelease: () => void }
      ).__emblem3dRelease(),
    );
    await expect(box).toHaveAttribute("data-emblem3d-shown", "", {
      timeout: 60_000,
    });
    await expect(poster).toHaveCount(0);
    const after = await box
      .locator("[data-emblem3d-stage] canvas")
      .boundingBox();
    expect(before).not.toBeNull();
    expect(after).toEqual(before);
    expect(before?.width).toBe(size);
    // 대기 그림과 3D 첫 장의 같은 자리 화소 차(RMSE). 이 맥(GPU)에서 약 0.012~0.014(WebP 압축 몫). GPU 없는 CI
    // (소프트웨어 그리기)는 번짐·정밀도가 조금 달라 넉넉히 둔다. 생김새가 바뀌었는데 대기 그림을 다시 찍지 않으면 넘는다
    const diff = await pngRmse(page, posterPng, await box.screenshot());
    expect(diff, `${tier} 대기 그림과 3D 첫 장의 화소 차`).toBeLessThan(0.07);
    await draftShot(page, `poster-${tier}`);
  }
});

/**
 * 큐브 안쪽 영역 경계의 세기(0~1): 캔버스 화소를 조각 하나 크기로 흐린 뒤, 등각 큐브 윗면 안쪽의 밝기 표준편차.
 * h의 「안쪽 큐브」 경계는 윗면 안을 가로질러 남고, 조각마다 되풀이되는 틈 선·깎은 면 무늬는 흐려져 고르게 된다
 */
async function innerSpread(page: Page, box: Locator): Promise<number> {
  const png = await box.locator("[data-emblem3d-stage] canvas").screenshot();
  return page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin], { type: "image/png" }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
    const W = bmp.width;
    // 조각 하나 크기로 흐린다(가는 틈 선·조각 안 무늬·깎은 면은 지우고 큰 영역 차이만 남긴다)
    ctx.filter = `blur(${(W * 18) / 880}px)`;
    ctx.drawImage(bmp, 0, 0);
    // 등각 큐브의 윗면 안쪽(한 면 안이라 면끼리의 입체 음영은 섞이지 않는다)
    const img = ctx.getImageData(
      Math.round(W * 0.42),
      Math.round(W * 0.392),
      Math.round(W * 0.159),
      Math.round(W * 0.0795),
    );
    const d = img.data;
    const vals: number[] = [];
    for (let k = 0; k < d.length; k += 4)
      vals.push(
        (0.2126 * (d[k] ?? 0) +
          0.7152 * (d[k + 1] ?? 0) +
          0.0722 * (d[k + 2] ?? 0)) /
          255,
      );
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    return Math.sqrt(
      vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length,
    );
  }, png.toString("base64"));
}

test("에메랄드 시안 l: 큐브 안쪽에 영역 경계가 없다(흐린 윗면 밝기가 h보다 훨씬 고르다), m·m2는 값을 기록", {
  tag: "@only-desktop",
}, async ({ page }) => {
  test.setTimeout(150_000);
  const spread: Record<string, number> = {};
  for (const s of ["h", "l", "m", "m2"]) {
    await page.goto(`/cube/tiers/emblems?gem=${s}&emblemBg=light`);
    const box = page.locator('[data-emblem3d="emerald"]');
    await expect(box).toHaveAttribute("data-emblem3d-shown", "", {
      timeout: 60_000,
    });
    spread[s] = await innerSpread(page, box);
    await draftShot(page, `glass-${s}`);
  }
  // 2026-11-12 이 맥(Chromium): h 0.023, l 약 0.002. 진한 색 m·m2는 조각마다의 음영·틈선이 흐린 뒤에도 남아 이 잣대로는
  // h와 잘 갈리지 않아(m 약 0.015) 값만 기록하고, 큐브 전체 경계 없음은 단위 시험 cubeTrace.test.ts가 조각 평균으로 본다
  expect(spread.l as number).toBeLessThan((spread.h as number) * 0.5);
  test.info().annotations.push({
    type: "emblem-inner-spread",
    description: JSON.stringify(spread),
  });
});

test("3D를 그릴 수 없으면 3D 시안 자리에 미리 찍은 그림이 그대로 남는다", {
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
    if (t !== "diamond")
      await page.locator(`[data-emblem3d-pick="${t}"]`).click();
    const e = page.locator(`[data-emblem3d="${t}"]`);
    await expect(e).toHaveAttribute("data-emblem3d-path", "svg");
    await expect(e.locator("[data-emblem3d-poster]")).toBeVisible();
    await expect(e.locator(`[data-cube-emblem="${t}"]`)).toHaveCount(0);
    await expect(e.locator("canvas")).toHaveCount(0);
  }
});
