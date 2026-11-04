import { no3d } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브 패턴 만들기(/cube/patterns). 카드 모음 → 카드를 열면 시연과 「직접 만들어 보기」.
 * 「표기」 배치로 친다(R = R, Shift+R = R', 두 번 = R2, Y = 큐브 돌리기 y).
 */

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

/** 공식 글 → 「표기」 배치 키 */
function keysFor(alg: string): string[] {
  const keys: string[] = [];
  for (const token of alg.trim().split(/\s+/)) {
    const code = `Key${(token[0] as string).toUpperCase()}`;
    if (token.includes("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(`Shift+${code}`);
    else keys.push(code);
  }
  return keys;
}

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

// 3D 그림은 보지 않으므로 끈다(e2e/cube.ts `no3d`)
test.beforeEach(({ page }) => no3d(page));

test("패턴: 크기별 카드를 보고, 카드를 열면 시연이 나온다", async ({
  page,
}, info) => {
  await page.goto("/cube/patterns");
  for (const n of [3, 2, 4, 5])
    await expect(
      page.locator(`[data-pattern-size="${n}"] [data-pattern-card]`).first(),
    ).toBeVisible();
  await expect(page.locator('[data-pattern-card="3-superflip"]')).toContainText(
    "슈퍼플립",
  );
  await shot(page, "patterns-list", info.project.name);

  await page.locator('[data-pattern-card="3-cube-in-cube"]').click();
  await expect(page.locator("main")).toHaveAttribute(
    "data-cube-patterns",
    "3-cube-in-cube",
  );
  await expect(page.locator("[data-cube-demo]")).toBeVisible();
  await expect(page.locator("[data-pattern-try]")).toBeVisible();
  await shot(page, "patterns-open", info.project.name);

  // 뒤로 가면 모음
  await page.goBack();
  await expect(page.locator("main")).toHaveAttribute(
    "data-cube-patterns",
    "list",
  );
});

test("패턴: 내 패턴을 넣으면 모양을 미리 보고 저장한다", async ({ page }) => {
  await page.goto("/cube/patterns");
  const mine = page.locator("[data-pattern-mine]");
  await mine.locator("[data-mine-alg]").fill("R2 Q");
  await expect(mine.getByRole("alert")).toContainText("Q");
  await expect(mine.locator("[data-mine-save]")).toBeDisabled();
  await mine.locator("[data-mine-alg]").fill("M2 E2 S2");
  await mine.locator("[data-mine-name]").fill("센터 체커");
  await expect(mine.locator("[data-cube-net]")).toBeVisible();
  await mine.locator("[data-mine-save]").click();
  const card = mine.locator("[data-pattern-card]");
  await expect(card).toContainText("센터 체커");

  // 다시 열어도 남아 있다
  await page.reload();
  await expect(mine.locator("[data-pattern-card]")).toContainText("센터 체커");
});

test("패턴: 직접 만들어 보기 — 공식을 치면 통과하고, 되돌리면 맞춘 큐브로", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await useNotationKeys(page);
  await page.goto("/cube/patterns?p=3-checkerboard");
  const tryPanel = page.locator("[data-pattern-try]");
  await expect(
    page.locator("[data-cube-stage][data-input-ready]"),
  ).toBeVisible();
  const alg = (await tryPanel
    .locator("[data-pattern-alg]")
    .getAttribute("data-pattern-alg")) as string;

  // 큐브를 통째로 한 번 돌려 두고 쳐도 같은 모양이면 통과
  await page.keyboard.press("KeyY");
  const keys = keysFor(alg);
  for (const k of keys.slice(0, -1)) await page.keyboard.press(k);
  await expect(page.locator("[data-pattern-pass]")).toHaveCount(0);
  await page.keyboard.press(keys.at(-1) as string);
  await expect(page.locator("[data-pattern-pass]")).toBeVisible();
  await expect(tryPanel).toHaveAttribute("data-pattern-passed", "");
  await shot(page, "patterns-passed", info.project.name);

  await tryPanel.locator("[data-pattern-reset]").click();
  await expect(tryPanel).not.toHaveAttribute("data-pattern-passed", "");
  await expect(page.locator("[data-pattern-pass]")).toHaveCount(0);
});
