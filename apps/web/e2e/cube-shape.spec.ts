import { inputReady, keysFor, no3d, shot, useNotationKeys } from "./cube";
import { expect, type Page, test } from "./test";

/**
 * 모양 만들기(docs/47 9-10). 목표 고르기·판정·컴퓨터 계획은 단위 시험(`shape-race.test.ts`, `shape-plan.test.ts`,
 * cube-engine `shape.test.ts`)이 보고, 여기서는 2×2 쉬운 모양 한 판씩만 실제로 그려 본다:
 * 컴퓨터와 대결(씨앗 고정)에서 목표 그림이 보이고 공식을 치면 내가 먼저 끝나며, 혼자 하기에서 기록이 남는다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

/** 2×2 쉬운 모양의 공식(`patterns/data.ts`) */
const EASY2: Record<string, string> = {
  "2-side-stripes": "R2 F2 R2",
  "2-halves": "R U2 R2",
  "2-top-checker": "R2 U2 F2",
};

async function typeAlg(page: Page, alg: string) {
  for (const key of keysFor(alg)) await page.keyboard.press(key);
}

test.describe("화면 시험(3D 없음)", () => {
  test.beforeEach(async ({ page }) => {
    await no3d(page);
    await useNotationKeys(page);
  });

  test("컴퓨터와 대결: 목표 그림이 보이고, 그 모양을 만들면 끝난다", async ({
    page,
  }, info) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__cubeTestHooks = true;
      w.__cubeVsSeed = "shape";
    });
    await page.clock.install();
    await page.goto("/cube/vs");
    await page.locator("[data-cube-vs-size]").selectOption("2");
    await page.getByRole("button", { name: "입문", exact: true }).click();
    await page.locator('[data-cube-vs-party="shape"]').click();
    await expect(page.locator('[data-cube-shape-pick="easy"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByLabel("15초 살펴보기").uncheck();
    await shot(page, "shape-vs-setup", info.project.name);
    await page.locator("[data-cube-vs-start]").click();
    await expect(page.locator("[data-cube-race-phase]")).toHaveAttribute(
      "data-cube-race-phase",
      "race",
      { timeout: SCRAMBLE_TIMEOUT },
    );
    await inputReady(page);
    const target = page.locator("[data-cube-shape-target]");
    await expect(target.locator("[data-cube-posters]")).toBeVisible();
    const id = (await target.getAttribute("data-cube-shape-target")) as string;
    expect(Object.keys(EASY2)).toContain(id);
    // 맞춘 큐브에서 시작한다(섞기 글 없음), 진행은 0%
    await expect(page.locator("[data-cube-shape-progress]")).toHaveAttribute(
      "data-cube-shape-progress",
      "0",
    );
    // 상대 자리는 단계 칩 대신 목표까지의 진행
    await expect(page.locator('[data-cube-peer="bot1"]')).toContainText("목표");
    await shot(page, "shape-vs-race", info.project.name);

    await typeAlg(page, EASY2[id] as string);
    await expect(page.locator('[data-cube-peer="me"]')).toHaveAttribute(
      "data-cube-peer-status",
      "done",
    );
    // 컴퓨터가 끝낼 때까지 감는다(입문, 몇 초)
    const result = page.locator('[data-cube-result="final"]');
    const until = Date.now() + 30_000;
    while (!(await result.isVisible())) {
      if (Date.now() > until) throw new Error("판이 끝나지 않는다");
      await page.clock.fastForward(1_000);
    }
    await expect(result).toContainText("1위예요");
    await shot(page, "shape-vs-result", info.project.name);
  });

  test("혼자 하기: 처음 안내 뒤 모양을 고르고 만들면 기록이 남는다", async ({
    page,
  }, info) => {
    await page.goto("/cube/shape");
    await expect(page.locator("[data-cube-shape-intro]")).toBeVisible();
    await page.locator("[data-cube-shape-size='2']").click();
    await shot(page, "shape-solo-pick", info.project.name);
    await page.locator("[data-cube-shape-intro-ok]").click();
    await expect(page.locator("[data-cube-shape-intro]")).toHaveCount(0);
    await page.locator('[data-cube-shape-card="2-halves"]').click();
    await inputReady(page);
    await expect(page.locator("[data-cube-shape-target]")).toBeVisible();
    await typeAlg(page, "R U2");
    await shot(page, "shape-solo-play", info.project.name);
    await typeAlg(page, "R2");
    await expect(page.locator("[data-cube-shape-done]")).toHaveAttribute(
      "data-cube-shape-best",
      "",
    );
    await shot(page, "shape-solo-done", info.project.name);
    await page.locator("[data-cube-shape-back]").click();
    await expect(
      page.locator('[data-cube-shape-card="2-halves"]'),
    ).toContainText("최고");
  });
});
