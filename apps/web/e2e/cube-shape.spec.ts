import { inputReady, keysFor, no3d, shot, useNotationKeys } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 모양 만들기(docs/47 9-10). 목표 고르기·판정·컴퓨터 계획은 단위 시험(`shape-race.test.ts`, `shape-plan.test.ts`,
 * cube-engine `shape.test.ts`)이 보고, 여기서는 2×2 쉬운 모양 한 판씩만 실제로 그려 본다:
 * 컴퓨터와 대결(씨앗 고정)에서 목표 그림이 보이고 공식을 치면 내가 먼저 끝나며, 혼자 하기에서 기록이 남는다.
 * 「공식 보기」를 열면 목표 공식과 내 키(데스크톱, 휴대폰은 표기만)가 보이고, 혼자 하기는 본 판을 따로 센다.
 * 스크린샷을 찍을 때는 3D를 켜 실제 장면을 본다.
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

/** 큐브가 그려진 뒤의 스크린샷(3D 장면이 뜰 때까지 기다린다, 3D를 못 그리면 큐브 그림) */
async function stageShot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await expect(
    page.locator(
      "[data-cube-stage] [data-cube-posters], [data-cube-stage] [data-cube-canvas][data-cube-ready]",
    ),
  ).toBeVisible();
  await shot(page, name, project);
}

/** 「공식 보기」를 열어 공식과 키를 확인한다 */
async function openFormula(page: Page, alg: string, project: string) {
  await page.locator("[data-cube-shape-formula-toggle]").click();
  const shown = page.locator("[data-cube-shape-alg]");
  await expect(shown).toHaveAttribute("data-cube-shape-alg", alg);
  // 지금 배치(표기 그대로)의 키. 키보드가 없을 휴대폰은 표기만
  const keys = shown.locator("[data-move-keys]");
  if (project === "desktop")
    await expect(keys.first()).toHaveAttribute(
      "data-move-keys",
      // 「표기」 배치: R2 → R R
      keysFor(alg.split(" ")[0] as string)
        .map((k) => k.replace("Shift+", "⇧").replace("Key", ""))
        .join(" "),
    );
  else await expect(keys).toHaveCount(0);
}

test.describe("화면 시험(스크린샷을 찍지 않으면 3D 없음)", () => {
  test.beforeEach(async ({ page }) => {
    if (!SAVE_SCREENSHOTS) await no3d(page);
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
    // 「공식 보기」는 기본 허용
    await expect(
      page.locator('[data-cube-shape-formula-rule="on"]'),
    ).toHaveAttribute("aria-pressed", "true");
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
    await openFormula(page, EASY2[id] as string, info.project.name);
    await stageShot(page, "shape-vs-race", info.project.name);

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
    await stageShot(page, "shape-vs-result", info.project.name);
  });

  test("혼자 하기: 처음 안내 뒤 모양을 고르고 만들면 기록이 남는다", async ({
    page,
  }, info) => {
    // 옛 주소 /cube/shape는 패턴의 「만들기」 탭으로 넘어간다(docs/47 16-6)
    await page.goto("/cube/shape");
    await expect(page).toHaveURL(/\/cube\/patterns\?tab=make$/);
    await expect(page.locator('[data-patterns-tab="make"]')).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator("[data-cube-shape-intro]")).toBeVisible();
    await page.locator("[data-cube-shape-size='2']").click();
    await shot(page, "shape-solo-pick", info.project.name);
    await page.locator("[data-cube-shape-intro-ok]").click();
    await expect(page.locator("[data-cube-shape-intro]")).toHaveCount(0);
    await page.locator('[data-cube-shape-card="2-halves"]').click();
    await inputReady(page);
    await expect(page.locator("[data-cube-shape-target]")).toBeVisible();
    await typeAlg(page, "R U2");
    await stageShot(page, "shape-solo-play", info.project.name);
    await typeAlg(page, "R2");
    await expect(page.locator("[data-cube-shape-done]")).toHaveAttribute(
      "data-cube-shape-best",
      "",
    );
    await stageShot(page, "shape-solo-done", info.project.name);
    await page.locator("[data-cube-shape-back]").click();
    await expect(
      page.locator('[data-cube-shape-card="2-halves"]'),
    ).toContainText("최고");

    // 공식을 연 판은 따로 센다
    await page.locator('[data-cube-shape-card="2-halves"]').click();
    await inputReady(page);
    await openFormula(page, "R U2 R2", info.project.name);
    await expect(page.locator("[data-cube-shape-record]")).toHaveText(
      "만드는 법 보고 첫 기록",
    );
    await stageShot(page, "shape-solo-formula", info.project.name);
    await typeAlg(page, "R U2 R2");
    await expect(page.locator("[data-cube-shape-done]")).toHaveAttribute(
      "data-cube-shape-done-formula",
      "",
    );
    await page.locator("[data-cube-shape-back]").click();
    await expect(
      page.locator('[data-cube-shape-card="2-halves"]'),
    ).toContainText("만드는 법 보고");

    // 「기록」 탭: 모양마다 한 줄(만드는 법을 본 판은 따로)
    await page.locator('[data-patterns-tab="records"]').click();
    await expect(page).toHaveURL(/\?tab=records$/);
    await expect(page.locator("[data-pattern-records] tbody tr")).toHaveCount(
      2,
    );
    await shot(page, "pattern-records", info.project.name);
  });
});
