import {
  expect,
  type Locator,
  type Page,
  SAVE_SCREENSHOTS,
  test,
} from "./test";

/**
 * 3D 티어 엠블럼(티어 화면 `/cube/tiers`의 진열, docs/47 14-7). 내 티어 칸은 살아 있는 3D로 천천히 흔들리고, 사다리 칸은
 * 미리 찍은 그림을 넘기다가 누르면 그 칸이 3D가 된다(한 번에 3D는 많아야 둘). 헤드리스는 SDR이라 보석은 번짐(bloom)
 * 길로 그린다. 실제 HDR 밝기와 120Hz 끊김은 사람이 본다. 화면 배치(휴대폰·PC, 잠김 표시, 다음 티어)는 3D를 끄고
 * `cube-tiers.spec.ts`가 본다.
 */

/** 3×3 혼자 맞추기 기록 5판을 넣는다(Ao5 = 가운데 셋 평균). 기본 13.40초 = 다이아몬드 IV */
async function seed(page: Page, ms = [13_000, 13_400, 13_800, 12_000, 20_000]) {
  await page.addInitScript((times) => {
    localStorage.setItem(
      "cube.records.v1",
      JSON.stringify({
        "solo-3": times.map((t, i) => ({
          at: 1_700_000_000_000 - i * 60_000,
          no: 5 - i,
          n: 3,
          mode: "solo",
          ms: t,
          penalty: 0,
          moves: 55,
          scramble: "R U R' U'",
          inputs: ["keyboard"],
          inspection: true,
        })),
      }),
    );
  }, ms);
}
/** 다섯 판이 모두 `ms`인 기록(Ao5 = ms) */
const flat = (ms: number) => [ms, ms, ms, ms, ms];

async function shot(page: Page, name: string): Promise<void> {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-emblem3d-${name}.png`,
    fullPage: true,
  });
}

/** 다음 화면 그리기를 몇 번 기다린다(그 사이 엠블럼이 그리면 장 수가 는다) */
async function someFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++)
      await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

const framesOf = (s: Locator) =>
  s.getAttribute("data-emblem3d-frames").then(Number);
const yawOf = (s: Locator) => s.getAttribute("data-emblem3d-yaw").then(Number);

/** 내 티어 3D 칸 */
const hero = (page: Page) =>
  page.locator("[data-cube-tier-hero] [data-emblem3d]");

test("진열: 내 티어 3D는 천천히 흔들리고, 끌면 따라 돌다가 놓으면 잠시 뒤 다시 흔들며, 화면 밖이면 그리지 않는다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await seed(page);
  await page.goto("/cube/tiers");
  const box = hero(page);
  await expect(box).toHaveAttribute("data-emblem3d", "diamond");
  await expect(box).toHaveAttribute("data-emblem3d-path", "bloom", {
    timeout: 60_000,
  });
  const stage = box.locator("[data-emblem3d-stage]");
  await expect(stage).toHaveAttribute("data-emblem3d-sway", "", {
    timeout: 10_000,
  });
  // 흔드는 동안은 장 수와 각이 바뀐다
  const f0 = await framesOf(stage);
  await expect.poll(() => framesOf(stage)).toBeGreaterThan(f0 + 5);
  await expect.poll(() => yawOf(stage).then(Math.abs)).toBeGreaterThan(0.01);
  // 흔드는 동안 「처음 각도로」 단추는 없다
  await expect(box.locator("[data-cube-view-home]")).toHaveCount(0);
  await shot(page, "showcase-desktop");

  // 끌면 흔들기를 멈추고 손을 따라 돈다
  const b = await stage.boundingBox();
  if (!b) throw new Error("3D 칸이 보이지 않는다");
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(stage).not.toHaveAttribute("data-emblem3d-sway");
  await page.mouse.move(x - 120, y, { steps: 8 });
  // 멈췄다가 놓아 미끄러지지 않게 한다
  await expect.poll(() => yawOf(stage)).toBeLessThan(-0.6);
  await page.mouse.up();
  // 놓은 뒤 잠시 그 각에 있다가 다시 흔든다
  await expect(stage).toHaveAttribute("data-emblem3d-sway", "", {
    timeout: 10_000,
  });

  // 화면 밖으로 굴리면 그리지 않는다(장 수가 늘지 않는다)
  await page.locator("footer").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await someFrames(page);
  const away = await framesOf(stage);
  await someFrames(page);
  await someFrames(page);
  expect(await framesOf(stage)).toBe(away);
  // 다시 보이면 이어서 흔든다
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => framesOf(stage)).toBeGreaterThan(away);
});

test("동작 줄이기 설정이면 내 티어 3D와 사다리 칸 모두 멈춰 있고, 끌어 돌린 각에 남으며 처음 각도로 단추가 뜬다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  test.setTimeout(120_000);
  // 화면 시험의 기본은 동작 줄이기(playwright.config)
  await seed(page);
  await page.goto("/cube/tiers");
  const box = hero(page);
  await expect(box).toHaveAttribute("data-emblem3d-shown", "", {
    timeout: 60_000,
  });
  const stage = box.locator("[data-emblem3d-stage]");
  await expect(stage).not.toHaveAttribute("data-emblem3d-sway");
  const idle = await framesOf(stage);
  await someFrames(page);
  expect(await framesOf(stage)).toBe(idle);
  // 사다리 칸 그림은 넘기지 않는다
  expect(
    await page
      .locator("[data-cube-ladder-sprite]")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  // 끌면 돌고 놓은 각에 남는다
  const b = await stage.boundingBox();
  if (!b) throw new Error("3D 칸이 보이지 않는다");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 80, b.y + b.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(stage).not.toHaveAttribute("data-emblem3d-moving");
  expect(await yawOf(stage)).toBeLessThan(-0.3);
  await expect(box.locator("[data-cube-view-home]")).toBeVisible();
});

test("사다리: 칸을 누르면 그 칸이 3D가 되고, 3D는 한 번에 많아야 둘(내 티어 칸 + 고른 칸)", {
  tag: "@only-desktop",
}, async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto("/cube/tiers");
  await expect(hero(page)).toHaveAttribute("data-emblem3d-shown", "", {
    timeout: 60_000,
  });
  const ladder = page.locator("[data-cube-ladder-list]");
  // 처음은 사다리에 3D가 없다(미리 찍은 그림)
  await expect(ladder.locator("[data-emblem3d]")).toHaveCount(0);
  for (const t of ["challenger", "gold", "master"]) {
    await ladder.locator(`[data-cube-ladder="${t}"]`).click();
    const cell = ladder.locator(`[data-cube-ladder="${t}"] [data-emblem3d]`);
    await expect(cell).toHaveAttribute("data-emblem3d-shown", "", {
      timeout: 60_000,
    });
    await expect(page.locator("[data-emblem3d]")).toHaveCount(2);
    await expect(page.locator("[data-emblem3d-stage] canvas")).toHaveCount(2);
  }
  await shot(page, "ladder-open");
  // 같은 칸을 다시 누르면 닫는다(3D는 내 티어 칸 하나)
  await ladder.locator('[data-cube-ladder="master"]').click();
  await expect(page.locator("[data-emblem3d]")).toHaveCount(1);
});

test("휴대폰: 내 티어 3D와 사다리 칸 3D도 둘을 넘지 않는다", {
  tag: "@only-phone-portrait",
}, async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto("/cube/tiers");
  await expect(hero(page)).toHaveAttribute("data-emblem3d-shown", "", {
    timeout: 60_000,
  });
  const ladder = page.locator("[data-cube-ladder-list]");
  await ladder.locator('[data-cube-ladder="grandmaster"]').tap();
  await expect(
    ladder.locator('[data-cube-ladder="grandmaster"] [data-emblem3d]'),
  ).toHaveAttribute("data-emblem3d-shown", "", { timeout: 60_000 });
  await ladder.locator('[data-cube-ladder="emerald"]').tap();
  await expect(
    ladder.locator('[data-cube-ladder="emerald"] [data-emblem3d]'),
  ).toHaveAttribute("data-emblem3d-shown", "", { timeout: 60_000 });
  await expect(page.locator("[data-emblem3d]")).toHaveCount(2);
  await shot(page, "showcase-phone");
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

/** 3D를 붙잡아 둔다(화면 시험의 고리, 제품에서는 없다). 놓을 때는 `release3d` */
async function hold3d(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __emblem3dHold: Promise<void>;
      __emblem3dRelease: () => void;
    };
    w.__emblem3dHold = new Promise<void>((r) => {
      w.__emblem3dRelease = r;
    });
  });
}
async function release3d(page: Page): Promise<void> {
  await page.evaluate(() =>
    (
      window as unknown as { __emblem3dRelease: () => void }
    ).__emblem3dRelease(),
  );
}

test("대기 그림과 3D는 같은 자리·같은 크기·같은 생김새: 3D 첫 장이 뜨기 전에는 미리 찍은 그림이 덮고, 바뀔 때 1px도 움직이지 않는다", {
  tag: "@only-desktop",
}, async ({ browser }) => {
  test.setTimeout(150_000);
  // 금속(기록 없음 = 아이언, 잠김), 보석 셋(에메랄드·그랜드마스터·챌린저)
  for (const [tier, ms] of [
    ["iron", null],
    ["emerald", 20_000],
    ["grandmaster", 7_000],
    ["challenger", 6_000],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await hold3d(page);
    if (ms) await seed(page, flat(ms));
    await page.goto("/cube/tiers");
    const box = hero(page);
    await expect(box).toHaveAttribute("data-emblem3d", tier);
    const poster = box.locator("[data-emblem3d-poster] img");
    await expect(poster).toBeVisible();
    await expect(box).toHaveAttribute("data-emblem3d-path", "loading");
    // 다른 모양 그림(평면·정지 그림)은 보이지 않는다
    await expect(box.locator("[data-cube-emblem]")).toHaveCount(0);
    // 찍은 그림은 칸과 같은 크기(280px)를 두 배 화소로 찍었다
    await expect
      .poll(() =>
        poster.evaluate((img: HTMLImageElement) =>
          img.complete ? img.naturalWidth : 0,
        ),
      )
      .toBe(560);
    const posterPng = await box.screenshot();
    const before = await poster.boundingBox();
    await release3d(page);
    await expect(box).toHaveAttribute("data-emblem3d-shown", "", {
      timeout: 60_000,
    });
    await expect(box.locator("[data-emblem3d-poster]")).toHaveCount(0);
    const after = await box
      .locator("[data-emblem3d-stage] canvas")
      .boundingBox();
    expect(before).not.toBeNull();
    expect(after).toEqual(before);
    expect(before?.width).toBe(280);
    // 대기 그림과 3D 첫 장의 같은 자리 화소 차(RMSE). 대기 그림은 두 배 화소라 이 시험(배율 1)에서는 줄여 보인다.
    // GPU 없는 CI(소프트웨어 그리기)는 번짐·정밀도가 조금 달라 넉넉히 둔다. 생김새가 바뀌었는데 다시 찍지 않으면 넘는다
    const diff = await pngRmse(page, posterPng, await box.screenshot());
    expect(diff, `${tier} 대기 그림과 3D 첫 장의 화소 차`).toBeLessThan(0.07);
    await context.close();
  }
});

/** WebGL을 못 얻는 기기처럼 */
async function noWebgl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === "webgl2" || type === "webgl") return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
}

/** 칸 안에 평면 SVG 엠블럼이 없다 */
async function noFlat(box: Locator): Promise<void> {
  await expect(box.locator(".cube-emblem svg")).toHaveCount(0);
}

test("로딩 중에는 평면 엠블럼을 보이지 않는다: 대기 그림을 못 받으면 빈 칸에 작은 로딩 표시만, 3D가 뜨면 사라진다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  test.setTimeout(120_000);
  await hold3d(page);
  await seed(page, flat(8_000));
  // 대기 그림(큰 칸 그림)만 막는다. 정지 그림(still/)·진열 칸 그림(sprite/)은 그대로
  await page.route(/\/cube\/tiers\/emblem3d\/[a-z]+-dark\.webp$/, (r) =>
    r.abort(),
  );
  await page.goto("/cube/tiers");
  const box = hero(page);
  await expect(box).toHaveAttribute("data-emblem3d", "master");
  await expect(box).toHaveAttribute("data-emblem3d-path", "loading");
  await expect(box.locator("[data-emblem3d-loading]")).toBeVisible();
  await expect(box.locator("[data-cube-emblem]")).toHaveCount(0);
  await release3d(page);
  await expect(box).toHaveAttribute("data-emblem3d-shown", "", {
    timeout: 60_000,
  });
  await expect(box.locator("[data-emblem3d-loading]")).toHaveCount(0);
  await noFlat(box);
});

test("3D를 그릴 수 없으면 내 티어 칸에 정지 그림이 뜨고 평면은 보이지 않으며, 사다리는 미리 찍은 그림 그대로다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await noWebgl(page);
  await seed(page);
  await page.goto("/cube/tiers");
  const e = hero(page);
  await expect(e).toHaveAttribute("data-emblem3d-path", "svg");
  const still = e.locator("[data-emblem3d-fallback] [data-cube-emblem-still]");
  await expect(still).toBeVisible();
  await expect
    .poll(() =>
      still
        .locator("img")
        .evaluate((img: HTMLImageElement) =>
          img.complete ? img.naturalWidth : 0,
        ),
    )
    .toBeGreaterThan(0);
  await noFlat(e);
  await expect(e.locator("canvas")).toHaveCount(0);
  // 사다리 칸을 눌러도 3D를 띄우지 않는다
  await page.locator('[data-cube-ladder="master"]').click();
  await expect(
    page.locator("[data-cube-ladder-list] [data-emblem3d]"),
  ).toHaveCount(0);
  await expect(page.locator("[data-cube-ladder-sprite]")).toHaveCount(10);
});

test("3D도 정지 그림도 없을 때만 평면 엠블럼", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await noWebgl(page);
  await seed(page, flat(8_000));
  await page.route(/\/cube\/tiers\/emblem3d\/still\//, (r) => r.abort());
  await page.goto("/cube/tiers");
  await expect(
    hero(page).locator("[data-emblem3d-fallback] .cube-emblem svg"),
  ).toBeVisible();
});

test("3D 문맥을 잃으면 빈 캔버스 대신 정지 그림", {
  tag: "@only-desktop",
}, async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, flat(50_000));
  await page.goto("/cube/tiers");
  const box = hero(page);
  await expect(box).toHaveAttribute("data-emblem3d", "gold");
  await expect(box).toHaveAttribute("data-emblem3d-shown", "", {
    timeout: 60_000,
  });
  await box.locator("[data-emblem3d-stage] canvas").evaluate((c) => {
    const gl = (c as HTMLCanvasElement).getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(box).toHaveAttribute("data-emblem3d-path", "svg");
  await expect(
    box.locator("[data-emblem3d-fallback] [data-cube-emblem-still]"),
  ).toBeVisible();
  await noFlat(box);
});
