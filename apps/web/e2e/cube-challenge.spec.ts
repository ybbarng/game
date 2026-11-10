import { installClock, no3d, pauseClock, shot, useNotationKeys } from "./cube";
import { expect, type Page, test } from "./test";

/**
 * 제한 도전(/cube/challenge, docs/51 2-3). 첫 화면에서 들어가 시간 체력으로 한 번 맞추고(성공), 한 번은 시간을 다 써서
 * 끝나고, 수 체력으로 바꿔 수를 다 써서 끝난다. 결과 상자·점수·기록 칸과 저장을 본다. 시계는 가짜 시계라 체력은
 * `fastForward`로만 준다. 3D 그림은 보지 않으므로 끈다(3D를 못 그리는 기기와 같은 큐브 그림(SVG), 움직임 줄이기).
 * 섞기 씨앗을 고정해 수 체력 판이 어느 기기에서나 같다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.beforeEach(async ({ page }) => {
  await no3d(page);
  await useNotationKeys(page);
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    let next = 20261105;
    crypto.getRandomValues = (<T extends ArrayBufferView | null>(a: T): T => {
      if (a instanceof Uint32Array && a.length === 1) {
        a[0] = next++;
        return a;
      }
      return original(a as never) as T;
    }) as typeof crypto.getRandomValues;
  });
});

function inverseKeys(scramble: string): string[] {
  const keys: string[] = [];
  for (const token of scramble.trim().split(/\s+/).reverse()) {
    const code = `Key${token[0] as string}`;
    if (token.endsWith("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(code);
    else keys.push(`Shift+${code}`);
  }
  return keys;
}

const phase = (page: Page) => page.locator("main[data-cube-phase]");

async function receive(page: Page): Promise<string> {
  await page.locator("[data-cube-scramble-button]").click();
  await expect(phase(page)).toHaveAttribute("data-cube-phase", "inspect", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  return (
    (await page
      .locator("[data-cube-scramble]")
      .getAttribute("data-cube-scramble")) ?? ""
  );
}

const hpLeft = async (page: Page) =>
  Number(
    await page.locator("[data-cube-hp]").getAttribute("data-cube-hp-left"),
  );

async function expectStageOnScreen(page: Page) {
  const height = page.viewportSize()?.height ?? 0;
  await expect
    .poll(async () => {
      const box = await page.locator("[data-cube-stage]").boundingBox();
      return box ? box.y + box.height : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(height);
}

test("제한 도전: 시간 체력으로 성공 한 번·시간 다함 한 번, 수 체력으로 수 다함", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "휴대폰 세로와 데스크톱으로 본다",
  );
  const desktop = info.project.name === "desktop";
  await installClock(page);
  // 혼자 맞추기의 갈래에서 들어간다(docs/47 16-2)
  await page.goto("/cube/solo");
  await expect(page.locator("[data-cube-challenge-link]")).toHaveAttribute(
    "href",
    "/cube/challenge",
  );
  await page.locator("[data-cube-challenge-link]").click();
  await expect(page).toHaveURL(/\/cube\/challenge$/);
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await pauseClock(page);
  await expect(page.getByRole("heading", { name: "제한 도전" })).toBeVisible();
  await expect(page.locator("[data-cube-rule]")).toHaveText(
    "처음 60초 · 단계마다 +10초",
  );
  await expect(page.locator("[data-cube-best-score]")).toHaveText("-");

  // ── 1. 시간 체력 성공 ──
  const text = await receive(page);
  await expect(page.locator("[data-cube-hp='time']")).toHaveAttribute(
    "data-cube-hp-left",
    "60000",
  );
  await expect(page.locator("[data-cube-challenge-kind]")).toBeDisabled();
  await expect(page.locator("[data-cube-challenge-level]")).toBeDisabled();
  await expect(page.locator("[data-cube-size]")).toBeDisabled();
  // 살펴보기 동안은 줄지 않는다
  await page.clock.fastForward(3_000);
  await expect(page.locator("[data-cube-hp]")).toHaveAttribute(
    "data-cube-hp-left",
    "60000",
  );
  const keys = inverseKeys(text);
  for (const [i, k] of keys.entries()) {
    if (i > 0) await page.clock.fastForward(400);
    await page.keyboard.press(k);
    if (i === Math.floor(keys.length / 2)) {
      // 맞추는 중: 수를 두지 않아도 체력이 시간대로 준다(그리기는 47ms마다). 1280×720에서 큐브가 잘리지 않는다
      const before = await hpLeft(page);
      await page.clock.fastForward(400);
      await expect.poll(() => hpLeft(page)).toBeLessThanOrEqual(before - 300);
      expect(await hpLeft(page)).toBeGreaterThanOrEqual(before - 400);
      if (desktop) await expectStageOnScreen(page);
      await shot(page, "challenge-solving", info.project.name);
    }
  }
  await expect(phase(page)).toHaveAttribute("data-cube-phase", "done");
  const result = page.locator("[data-cube-challenge-result]");
  await expect(result).toHaveAttribute("data-cube-challenge-result", "ok");
  await expect(result).toContainText("성공");
  const stages = Number(
    await page.locator("[data-cube-stages]").getAttribute("data-cube-stages"),
  );
  const score = Number(
    await page.locator("[data-cube-score]").getAttribute("data-cube-score"),
  );
  expect(stages).toBeGreaterThan(0);
  // 점수 = 단계 × 100 + 남은 시간(0.1초에 1점)
  const left = await hpLeft(page);
  expect(score).toBe(stages * 100 + Math.floor(left / 100));
  await expect(page.locator("[data-cube-challenge-best]")).toBeVisible();
  await expect(page.locator("[data-cube-best-score]")).toHaveText(
    String(score),
  );
  await expect(page.locator("[data-cube-challenge-entry]")).toHaveCount(1);
  await expect(page.locator("[data-cube-challenge-kind]")).toBeEnabled();
  if (desktop) await expectStageOnScreen(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await shot(page, "challenge-ok", info.project.name);

  // ── 2. 시간 체력: 첫 면 돌리기 뒤 시간이 다한다 ──
  await receive(page);
  await page.keyboard.press("KeyR");
  await expect(phase(page)).toHaveAttribute("data-cube-phase", "solving");
  const start = await hpLeft(page);
  await page.clock.fastForward(start - 1_000);
  await expect(phase(page)).toHaveAttribute("data-cube-phase", "solving");
  // 20% 아래라 붉게
  await expect(page.locator("[data-cube-hp]")).toHaveAttribute(
    "data-cube-hp-low",
    "",
  );
  await page.clock.fastForward(1_100);
  await expect(phase(page)).toHaveAttribute("data-cube-phase", "done");
  await expect(result).toHaveAttribute("data-cube-challenge-result", "time");
  await expect(result).toContainText("시간이 다했어요");
  await expect(page.locator("[data-cube-hp]")).toHaveAttribute(
    "data-cube-hp-left",
    "0",
  );
  await expect(page.locator("[data-cube-challenge-best]")).toHaveCount(0);
  await expect(page.locator("[data-cube-challenge-entry]")).toHaveCount(2);
  await expect(page.locator("[data-cube-best-score]")).toHaveText(
    String(score),
  );
  if (desktop) await expectStageOnScreen(page);
  await shot(page, "challenge-time-out", info.project.name);

  // ── 3. 수 체력(2×2 어려움): 같은 층을 이어 돌리면 한 수, 수를 넘으면 끝 ──
  await page.locator("[data-cube-challenge-kind]").selectOption("moves");
  await page.locator("[data-cube-challenge-level]").selectOption("hard");
  await page.locator("[data-cube-size]").selectOption("2");
  await expect(page.locator("[data-cube-rule]")).toHaveText("짧은 풀이 + 25수");
  await expect(page.locator("[data-cube-challenge-entry]")).toHaveCount(0);
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await receive(page);
  const budget = await hpLeft(page);
  expect(budget).toBeGreaterThan(25);
  expect(budget).toBeLessThanOrEqual(25 + 11);
  await page.keyboard.press("KeyR");
  await expect(page.locator("[data-cube-hp='moves']")).toHaveAttribute(
    "data-cube-hp-left",
    String(budget - 1),
  );
  await page.keyboard.press("KeyR"); // R R = R2 한 수
  await expect(page.locator("[data-cube-hp]")).toHaveAttribute(
    "data-cube-hp-left",
    String(budget - 1),
  );
  for (let i = 0; i < budget; i++) {
    if ((await phase(page).getAttribute("data-cube-phase")) === "done") break;
    await page.keyboard.press(i % 2 === 0 ? "KeyU" : "KeyF");
  }
  await expect(phase(page)).toHaveAttribute("data-cube-phase", "done");
  await expect(result).toHaveAttribute("data-cube-challenge-result", "moves");
  await expect(result).toContainText("수가 다했어요");
  await expect(page.locator("[data-cube-challenge-entry]")).toHaveCount(1);
  if (desktop) await expectStageOnScreen(page);
  await shot(page, "challenge-moves-out", info.project.name);

  // 저장: 도전 셋은 제한 도전 기록에만, 혼자 맞추기 기록은 그대로 비어 있다. 고른 것은 다시 열어도 남는다
  const stored = await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("cube.challenge.v1") ?? "{}");
    const r = JSON.parse(localStorage.getItem("cube.records.v1") ?? "{}");
    return {
      kinds: (c.entries ?? []).map(
        (e: { kind: string; ok: boolean; reason?: string }) =>
          `${e.kind}:${e.ok ? "ok" : e.reason}`,
      ),
      pick: c.pick,
      solo: Object.values(r).flat().length,
    };
  });
  expect(stored).toEqual({
    kinds: ["moves:moves", "time:time", "time:ok"],
    pick: { n: 2, kind: "moves", level: "hard" },
    solo: 0,
  });
  await page.reload();
  await expect(page.locator("[data-cube-challenge-kind]")).toHaveValue("moves");
  await expect(page.locator("[data-cube-size]")).toHaveValue("2");
});
