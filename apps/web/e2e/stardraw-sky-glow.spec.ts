import {
  expect,
  fastForwardUntil,
  fixStardrawClock,
  type Page,
  SAVE_SCREENSHOTS,
  speedUpAnimations,
  test,
} from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

/** 하늘 판(관측 하늘) */
const skyOf = (page: Page) =>
  page.locator("[data-tour-screen] canvas[data-sky]");

/** 지금 하늘에서 다시 빛나는 별과 아래에서 빛나는 공(없으면 null) */
async function glowing(page: Page) {
  return page.evaluate(() => {
    const sky = document.querySelector<HTMLElement>(
      "[data-tour-screen] canvas[data-sky]",
    );
    const ball = document.querySelector<HTMLElement>(
      "[data-tour-screen] .sd-ball-shine",
    );
    return {
      sky: sky?.dataset.skyGlow ?? null,
      ball: ball?.dataset.ball ?? null,
    };
  });
}

/**
 * 관측 마무리(docs/36 11-59·11-72): 별이 다 뜬 뒤 공 줄을 작은 순으로 다시 놓고 하나씩 다시 빛낼 때, 공이 빛나는
 * 그 순간 하늘의 같은 별에 표지(data-sky-glow)가 붙는다. 차례는 작은 순 여섯 공, 마지막이 보너스.
 * 시계를 멈춰 두고 조건까지 조금씩 감는다(실제 시간으로 기다리지 않는다)
 */
test(
  "관측 마무리: 공이 빛나는 그 순간 하늘의 같은 별도 빛난다",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    // 휴대폰 세로와 PC에서
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/stardraw/demo#tour-draw");
    await expect(skyOf(page)).toBeVisible({ timeout: 30_000 });
    await page.clock.pauseAt(
      new Date((await page.evaluate(() => Date.now())) + 1000),
    );
    await speedUpAnimations(page);

    // 관측이 끝나고 정렬하기 전에는 하늘에 다시 빛나는 별이 없다
    const row = page.locator("[data-tour-screen] [data-roulette-stop='7']");
    await fastForwardUntil(page, () => row.isVisible());
    expect((await glowing(page)).sky).toBeNull();

    // 작은 순으로 다시 놓인 뒤의 차례: 여섯 공(작은 순) + 보너스
    await fastForwardUntil(
      page,
      async () => (await glowing(page)).sky !== null,
      {
        step: 100,
      },
    );
    const balls = await row
      .locator("[data-ball]")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.ball));
    const main = balls.slice(0, 6).map(Number);
    expect(main).toEqual([...main].sort((a, b) => a - b));
    expect(balls).toHaveLength(7);

    const seen: string[] = [];
    const SHOT_AT = 2; // 스크린샷은 세 번째 공이 빛나는 순간
    for (let i = 0; i < balls.length; i++) {
      const want = balls[i] as string;
      // 빛나는 동안은 늘 공과 하늘 별이 같다
      await fastForwardUntil(
        page,
        async () => {
          const g = await glowing(page);
          if (g.sky !== null) expect(g.sky).toBe(g.ball);
          return g.sky === want;
        },
        { step: i === SHOT_AT ? 20 : 100 },
      );
      seen.push(want);
      if (i === SHOT_AT && SAVE_SCREENSHOTS) {
        // 공은 가장 밝은 때(0.6초 연출의 40%)에 멈추고, 하늘 별도 가장 밝은 때(FX.sortShinePeak)쯤으로 감는다
        await page.evaluate(() => {
          for (const a of document.getAnimations()) {
            if ((a as CSSAnimation).animationName !== "sd-ball-shine") continue;
            a.pause();
            a.currentTime = 240;
          }
        });
        await page.clock.fastForward(220);
        expect((await glowing(page)).sky).toBe(want);
        // PC는 하늘이 커서 공 줄이 첫 화면 아래에 있다(그래도 하늘을 옮기지 않는다, docs/36 11-72)
        await page.screenshot({
          path: info.outputPath(`stardraw-sky-glow-${info.project.name}.png`),
          fullPage: true,
        });
      }
    }
    expect(seen).toEqual(balls);

    // 다 빛낸 뒤에는 표지가 걷힌다
    await fastForwardUntil(
      page,
      async () => (await glowing(page)).sky === null,
      {
        step: 100,
      },
    );
    expect((await glowing(page)).ball).toBeNull();
  },
);

test("관측 마무리: 움직임 줄이기면 하늘 별을 다시 빛내지 않는다", {
  tag: "@only-phone-portrait",
}, async ({ page }) => {
  // 휴대폰 세로 한 크기로
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/stardraw/demo#tour-draw");
  await expect(
    page.locator("[data-tour-screen] [data-roulette-stop='7']"),
  ).toBeVisible({ timeout: 30_000 });
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 1000),
  );
  for (let i = 0; i < 20; i++) {
    expect(await glowing(page)).toEqual({ sky: null, ball: null });
    await page.clock.fastForward(300);
  }
});
