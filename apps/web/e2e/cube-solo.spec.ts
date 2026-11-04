import { no3d, shot, useNotationKeys } from "./cube";
import { expect, test } from "./test";

/**
 * 큐브 혼자 맞추기(/cube/solo)·블라인드(/cube/blind, docs/47). 섞고, 키로 섞기의 거꾸로를 쳐서 맞추면 결과 상자가 뜬다.
 * 「표기」 배치로 친다(R = R, Shift+R = R', 두 번 = R2). 움직임 줄이기라 장면 회전은 바로 끝난다.
 * 3×3 섞기는 워커가 처음에 표를 만들어 몇 초 걸린다(기다림 상한은 멈춘 시험을 잡는 안전장치). 페이지를 새로 열면
 * 워커도 새로 떠 표를 다시 만들므로, 섞기를 두 번 보는 혼자 맞추기와 블라인드는 시험을 나눴다(2026-11-04 #1).
 * 3D 그림은 보지 않으므로 끈다(`no3d`). 키·섞기·결과는 펼친 그림과 상태 표시로 본다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.beforeEach(async ({ page }) => {
  await no3d(page);
  await useNotationKeys(page);
});

/** 섞기 글의 거꾸로를 「표기」 배치 키로 */
function inverseKeys(scramble: string): string[] {
  const keys: string[] = [];
  for (const token of scramble.trim().split(/\s+/).reverse()) {
    const face = token[0] as string;
    const code = `Key${face}`;
    if (token.endsWith("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(code);
    else keys.push(`Shift+${code}`);
  }
  return keys;
}

/**
 * 시계는 Playwright 가짜 시계로 멈춰 두고 `fastForward`로만 흘린다: 살펴보기 15·17초가 기기 속도와 상관없이 정확하다.
 */
test("섞고 키로 맞추면 결과가 뜬다", async ({ page }, info) => {
  await page.clock.install();
  await page.goto("/cube/solo");
  const main = page.locator("main[data-cube-phase]");
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await expect(main).toHaveAttribute("data-cube-phase", "free");
  // 시계를 멈춘다: 이제 시간은 fastForward로만 흘러, 부하로 늦어져도 살펴보기가 DNF로 흐르지 않는다
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 5_000);

  await page.locator("[data-cube-scramble-button]").click();
  const scramble = page.locator("[data-cube-scramble]");
  await expect(main).toHaveAttribute("data-cube-phase", "inspect", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  const text = (await scramble.getAttribute("data-cube-scramble")) ?? "";
  expect(text.split(" ").length).toBeGreaterThan(10);
  await shot(page, "solo-inspect", info.project.name);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");

  // 살펴보기 중 큐브 돌리기는 시간을 열지 않고 수로 세지 않는다
  const moves = page.locator("[data-cube-moves]");
  await page.keyboard.press("KeyY");
  await page.keyboard.press("Shift+KeyY");
  await expect(main).toHaveAttribute("data-cube-phase", "inspect");
  await expect(moves).toHaveText("0");

  // 15초를 넘겨 시작하면 +2(17초 전까지는 살펴보기가 이어진다)
  await page.clock.fastForward(16_000);
  await expect(main).toHaveAttribute("data-cube-phase", "inspect");

  const keys = inverseKeys(text);
  // 첫 면 돌리기로 시간이 시작되고 수가 는다
  await page.keyboard.press(keys[0] as string);
  await expect(main).toHaveAttribute("data-cube-phase", "solving");
  await expect(moves).toHaveText("1");
  for (const k of keys.slice(1)) await page.keyboard.press(k);

  const result = page.locator("[data-cube-result]");
  await expect(result).toBeVisible();
  await expect(result).toContainText("(+2)");
  await expect(main).toHaveAttribute("data-cube-phase", "done");
  await expect(moves).toHaveText(String(keys.length));
  await expect(page.locator("[data-cube-records] li")).toHaveCount(1);
  await shot(page, "solo-done", info.project.name);
});

test("블라인드: 외운 뒤 시작하면 모두 가려지고, 맞추지 않고 끝내면 DNF", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.goto("/cube/blind");
  const main = page.locator("main[data-cube-phase]");
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await page.locator("[data-cube-scramble-button]").click();
  await expect(main).toHaveAttribute("data-cube-phase", "memo", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await shot(page, "blind-memo", info.project.name);
  await page.keyboard.press("Space");
  await expect(main).toHaveAttribute("data-cube-phase", "blindSolve");
  await shot(page, "blind-hidden", info.project.name);
  await page.keyboard.press("Space");
  await expect(main).toHaveAttribute("data-cube-phase", "done");
  await expect(page.locator("[data-cube-result]")).toContainText("DNF");
  await expect(page.locator("[data-cube-records] li")).toHaveCount(1);
});

test("설정: 키 배치 「사용자」를 고르면 키 편집기가 열린다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.goto("/cube/settings");
  await page.getByRole("button", { name: "사용자", exact: true }).click();
  await expect(page.locator("[data-keymap-editor]")).toBeVisible();
  await shot(page, "settings", info.project.name);
});
