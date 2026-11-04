import { no3d } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 십자 훈련(/cube/train/cross, docs/47 8절). 「표기」 배치로 최적 해를 쳐서 성공이 뜨는지,
 * 「계획 후 가리고」에서 치기 시작하면 큐브가 가려지는지 본다.
 * 시계는 Playwright 가짜 시계로 멈춰 두어 살펴보기 시간이 기기 속도와 상관없다.
 * 섞기는 워커가 처음에 3×3 해법기 표를 만들어 몇 초 걸리므로 시험 하나에서 이어서 본다(표를 한 번만 만든다).
 */

const ROUND_TIMEOUT = 60_000;

async function useNotationKeys(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "cube.keymap.v1",
      JSON.stringify({
        version: 1,
        preset: "notation",
        bindings: [],
        mouseRotate: false,
      }),
    );
  });
}

/** 수 글 → 「표기」 배치 키(R = R, Shift+R = R', 두 번 = R2) */
function keysFor(moves: string): string[] {
  const keys: string[] = [];
  for (const token of moves.trim().split(/\s+/)) {
    const code = `Key${token[0]}`;
    if (token.endsWith("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(`Shift+${code}`);
    else keys.push(code);
  }
  return keys;
}

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-cross-${name}-${project}.png`,
    fullPage: true,
  });
}

// 3D 그림은 보지 않으므로 끈다(e2e/cube.ts `no3d`)
test.beforeEach(({ page }) => no3d(page));

test("십자 훈련: 최적 해로 성공, 계획 후 가리고는 큐브를 가린다", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.clock.install();
  await page.goto("/cube/train/cross");
  const main = page.locator("main[data-cross-phase]");
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: ROUND_TIMEOUT },
  );
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 5_000);

  await page.locator('[data-cross-option="수 제한:opt"]').click();
  await page.locator('[data-cross-option="어려움:5"]').click();
  await shot(page, "conditions", info.project.name);

  await page.locator("[data-cross-start]").click();
  await expect(main).toHaveAttribute("data-cross-phase", "inspect", {
    timeout: ROUND_TIMEOUT,
  });
  await expect(main).toHaveAttribute("data-cross-optimal", "5");
  await page.clock.fastForward(4_000);
  await shot(page, "inspect", info.project.name);

  const result = page.locator("[data-cross-result]");
  if (info.project.name !== "desktop") {
    // 휴대폰: 포기하면 결과(최적 해)가 뜬다
    await page.getByRole("button", { name: "포기" }).click();
    await expect(result).toHaveAttribute("data-cross-result", "fail");
    await shot(page, "result", info.project.name);
    return;
  }

  const solution = (await main.getAttribute("data-cross-solution")) ?? "";
  expect(solution.split(" ")).toHaveLength(5);
  // 살펴보기 중 큐브 돌리기는 시작이 아니다
  await page.keyboard.press("KeyY");
  await page.keyboard.press("Shift+KeyY");
  await expect(main).toHaveAttribute("data-cross-phase", "inspect");
  for (const k of keysFor(solution)) await page.keyboard.press(k);
  await expect(result).toHaveAttribute("data-cross-result", "ok");
  await expect(page.locator("[data-cross-moves]")).toHaveText("5");
  await expect(page.locator("[data-cross-records] li")).toHaveCount(1);
  await shot(page, "result", info.project.name);

  // 계획 후 가리고: 첫 면 돌리기에서 가리고, 십자 없이 「끝」이면 실패
  await page.locator('[data-cross-option="방식:blind"]').click();
  await page.locator("[data-cross-start]").click();
  await expect(main).toHaveAttribute("data-cross-phase", "inspect", {
    timeout: ROUND_TIMEOUT,
  });
  await expect(main).not.toHaveAttribute("data-cross-hidden", "");
  const first = (await main.getAttribute("data-cross-solution")) ?? "";
  // 해의 첫 수와 다른 축의 수를 쳐서 우연히 십자가 되지 않게 한다
  const wrong = /^[RL]/.test(first) ? "KeyU" : "KeyR";
  await page.keyboard.press(wrong);
  await expect(main).toHaveAttribute("data-cross-phase", "solving");
  await expect(main).toHaveAttribute("data-cross-hidden", "");
  await shot(page, "hidden", info.project.name);
  await page.keyboard.press("Space");
  await expect(result).toHaveAttribute("data-cross-result", "fail");
});
