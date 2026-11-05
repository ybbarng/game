import { inputReady, no3d, shot, useNotationKeys } from "./cube";
import { expect, type Page, test } from "./test";

/**
 * 대결 화면의 둘러앉은 자리(docs/47 9-9, 2026-11-05 사용자 제안). 몇 명일 때 어느 칸·꼴·폭인지는 순수 함수
 * (`race-seats.ts`, 단위 시험 2·3·4·5·8명 × 세 화면)가 정하고, 여기서는 가장 빽빽한 8명 한 판만 실제로 그려 본다:
 * 자리끼리·내 큐브 칸과 겹치지 않고, 화면 안에 들고, 상대가 돌리면 그 자리 그림이 바뀐다.
 * 체력바·아이템전 자리는 cube-party·cube-items가 한 줄씩 본다. 컴퓨터 수는 갈고리 `__cubeVsBots`로 늘린다.
 */

const SCRAMBLE_TIMEOUT = 60_000;
const BOTS = 7;

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) =>
  a.x + 1 < b.x + b.width &&
  b.x + 1 < a.x + a.width &&
  a.y + 1 < b.y + b.height &&
  b.y + 1 < a.y + a.height;

async function start(page: Page) {
  await page.addInitScript((k) => {
    const w = window as unknown as Record<string, unknown>;
    w.__cubeTestHooks = true;
    w.__cubeVsBots = k;
    w.__cubeVsSeed = "seats";
  }, BOTS);
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.locator("[data-cube-vs-size]").selectOption("2");
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await page.getByLabel("15초 살펴보기").uncheck();
  await page.locator("[data-cube-vs-start]").click();
  await expect(page.locator("[data-cube-race-phase]")).toHaveAttribute(
    "data-cube-race-phase",
    "race",
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await inputReady(page);
}

test.describe("화면 시험(3D 없음)", () => {
  test.beforeEach(async ({ page }) => {
    await no3d(page);
    await useNotationKeys(page);
  });

  test("8명: 자리끼리·큐브 칸과 겹치지 않고 화면 안에 들며, 상대가 돌리면 그림이 바뀐다", async ({
    page,
  }, info) => {
    await start(page);
    const seats = page.locator("[data-cube-peers] [data-cube-seat]");
    await expect(seats).toHaveCount(BOTS);
    await expect(
      page.locator("[data-cube-seat] [data-cube-posters]"),
    ).toHaveCount(BOTS);

    const stage = (await page
      .locator("[data-cube-stage]")
      .boundingBox()) as Box;
    const view = page.viewportSize() as { width: number; height: number };
    const boxes = (await seats.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y + window.scrollY,
          width: r.width,
          height: r.height,
        };
      }),
    )) as Box[];
    const stageDoc = await page.locator("[data-cube-stage]").evaluate((e) => {
      const r = e.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height,
      };
    });
    for (const [i, b] of boxes.entries()) {
      expect(overlap(b, stageDoc), `자리 ${i}와 큐브 칸`).toBe(false);
      for (const c of boxes.slice(i + 1))
        expect(overlap(b, c), `자리 ${i}와 다른 자리`).toBe(false);
      expect(b.x).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width).toBeLessThanOrEqual(view.width + 1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    if (info.project.name === "desktop")
      expect(stage.y + stage.height).toBeLessThanOrEqual(view.height + 1);

    // 컴퓨터 1의 계획이 오면 감는다. 그 자리 그림은 컴퓨터가 돌릴 때마다 바뀐다
    await expect(
      page.locator('[data-cube-peer="bot1"][data-cube-bot-planned]'),
    ).toBeAttached({ timeout: SCRAMBLE_TIMEOUT });
    const art = page.locator('[data-cube-peer="bot1"] [data-cube-posters]');
    const before = await art.innerHTML();
    const until = Date.now() + 30_000;
    while ((await art.innerHTML()) === before) {
      if (Date.now() > until) throw new Error("컴퓨터 자리 그림이 그대로다");
      await page.clock.fastForward(300);
    }
    await shot(page, "seats-8", info.project.name);
  });
});
