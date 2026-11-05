import { installClock, no3d, pauseClock, shot, useNotationKeys } from "./cube";
import { expect, type Page, test } from "./test";

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

/**
 * 큐브 칸 아래 끝이 첫 화면 안에 있다(데스크톱 1280×720, 2026-11-05: 진행 막대·칩·띠가 큐브를 밀어 잘렸다).
 * 칸은 남은 화면 높이에 맞춰 줄어든다(`CubePlay`의 `fitViewport`)
 */
async function expectStageOnScreen(page: Page) {
  const height = page.viewportSize()?.height ?? 0;
  await expect
    .poll(async () => {
      const box = await page.locator("[data-cube-stage]").boundingBox();
      return box ? box.y + box.height : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(height);
}

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
  await installClock(page);
  await page.goto("/cube/solo");
  const main = page.locator("main[data-cube-phase]");
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await expect(main).toHaveAttribute("data-cube-phase", "free");
  // 시계를 멈춘다: 이제 시간은 fastForward로만 흘러, 부하로 늦어져도 살펴보기가 DNF로 흐르지 않는다
  await pauseClock(page);

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
  // 첫 면 돌리기로 시간이 시작되고 수가 는다. 수 흐름 띠에 그 수가 뜬다(docs/51 1-1)
  await page.keyboard.press(keys[0] as string);
  await expect(main).toHaveAttribute("data-cube-phase", "solving");
  await expect(moves).toHaveText("1");
  await expect(page.locator("[data-cube-flow-moves]")).not.toHaveAttribute(
    "data-cube-flow-moves",
    "",
  );
  for (const k of keys.slice(1, -1)) await page.keyboard.press(k);
  // 한 수 남은 큐브: 이정표 칩이 켜지고(면 하나만 어긋남 = 십자·두 층 등), 완성까지 1수, 막대는 거의 끝
  await expect(page.locator("[data-cube-milestones]")).toBeVisible();
  // 한꺼번에 켜진 것은 칩 하나에 「가장 나아간 단계 +n」으로 한 줄
  const chip = page.locator("[data-milestone]").first();
  await expect(chip).toHaveAttribute("data-milestone", /(^|\+)cross(\+|$)/);
  await expect(chip).toContainText(/\+\d+/);
  const chipBox = await chip.boundingBox();
  expect(chipBox?.height ?? 99).toBeLessThan(30);
  await expect(page.locator("[data-cube-near]")).toHaveAttribute(
    "data-cube-near",
    "1",
  );
  await expect(page.locator("[data-cube-progress]")).toHaveAttribute(
    "data-cube-progress",
    "19.5",
  );
  await expectStageOnScreen(page);
  await shot(page, "solo-near", info.project.name);
  await page.keyboard.press(keys.at(-1) as string);

  const result = page.locator("[data-cube-result]");
  await expect(result).toBeVisible();
  await expect(result).toContainText("(+2)");
  await expect(main).toHaveAttribute("data-cube-phase", "done");
  await expect(moves).toHaveText(String(keys.length));
  await expect(page.locator("[data-cube-records] li")).toHaveCount(1);
  // 결과 상자: 구간 기록(다 맞춘 순간 = 윗층)과 이 섞기의 짧은 풀이
  await expect(page.locator("[data-cube-splits]")).toHaveAttribute(
    "data-cube-splits",
    /(^| )ll$/,
  );
  await expect(page.locator("[data-cube-short]")).toBeVisible({
    timeout: SCRAMBLE_TIMEOUT,
  });
  await expect(page.locator("[data-cube-progress]")).toHaveAttribute(
    "data-cube-progress",
    "20",
  );
  await shot(page, "solo-done", info.project.name);
});

/**
 * 흐름 콤보·구간 골드·개인 최고(docs/51 2-1·2-2). 섞기 씨앗을 고정해(`crypto.getRandomValues`) 같은 섞기를 두 번 푼다:
 * 첫 판은 수마다 1.5초 쉬어(콤보 없음, 견줄 기록 없어 골드 없음), 둘째 판은 0.15초 간격으로 빨리(콤보, 모든 구간 골드,
 * 개인 최고). 같은 섞기를 같은 수로 푸니 두 판의 칩(구간)이 같다.
 */
test("흐름 콤보와 구간 골드: 같은 섞기를 더 빨리 풀면 칩이 금색, 개인 최고", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "휴대폰 세로와 데스크톱으로 본다",
  );
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = <T extends ArrayBufferView | null>(a: T): T => {
      if (a instanceof Uint32Array && a.length === 1) {
        a[0] = 20_261_105;
        return a;
      }
      return original(a as never) as T;
    };
  });
  await installClock(page);
  await page.goto("/cube/solo");
  const main = page.locator("main[data-cube-phase]");
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await pauseClock(page);

  const solve = async (gap: number) => {
    await page.locator("[data-cube-scramble-button]").click();
    await expect(main).toHaveAttribute("data-cube-phase", "inspect", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const text =
      (await page
        .locator("[data-cube-scramble]")
        .getAttribute("data-cube-scramble")) ?? "";
    const keys = inverseKeys(text);
    for (const [i, k] of keys.entries()) {
      if (i > 0) await page.clock.fastForward(gap);
      await page.keyboard.press(k);
      if (i === keys.length - 2) return { text, last: keys.at(-1) as string };
    }
    throw new Error("수가 너무 적다");
  };

  // 첫 판: 느리게. 콤보는 뜨지 않고, 견줄 옛 기록이 없어 골드·개인 최고도 없다
  const first = await solve(1_500);
  const combo = page.locator("[data-cube-combo]");
  await expect(combo).toHaveCount(0);
  await expect(page.locator("[data-milestone]").first()).toBeVisible();
  await expect(page.locator("[data-milestone][data-gold]")).toHaveCount(0);
  await page.clock.fastForward(1_500);
  await page.keyboard.press(first.last);
  await expect(main).toHaveAttribute("data-cube-phase", "done");
  await expect(page.locator("[data-cube-pb]")).toHaveCount(0);
  await expect(page.locator("[data-cube-splits]")).toHaveAttribute(
    "data-cube-gold-splits",
    "",
  );

  // 둘째 판: 같은 섞기를 빨리. 이어 친 수가 띠 끝에 「콤보 n」, 칩은 금색
  const second = await solve(150);
  expect(second.text).toBe(first.text);
  await expect(combo).toBeVisible();
  expect(Number(await combo.getAttribute("data-cube-combo"))).toBeGreaterThan(
    10,
  );
  await expect(page.locator("[data-cube-flow]")).toHaveAttribute(
    "data-combo-level",
    /[2-4]/,
  );
  await expect(
    page.locator("[data-milestone][data-gold]").first(),
  ).toBeVisible();
  // 콤보 숫자는 띠 안(화면 폭 안)에 있다
  const box = await combo.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    (page.viewportSize()?.width ?? 0) + 0.5,
  );
  await shot(page, "solo-combo-gold", info.project.name);
  await page.clock.fastForward(150);
  await page.keyboard.press(second.last);
  await expect(main).toHaveAttribute("data-cube-phase", "done");
  await expect(page.locator("[data-cube-pb]")).toBeVisible();
  await expect(page.locator("[data-cube-splits]")).not.toHaveAttribute(
    "data-cube-gold-splits",
    "",
  );
  await expect(page.locator("[data-cube-best-combo]")).toBeVisible();
  if (info.project.name === "desktop") await expectStageOnScreen(page);
  // 결과 상자(구간 기록·골드)가 화면 폭을 넘지 않는다
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await shot(page, "solo-gold-done", info.project.name);
  // 멈추면(1초 넘게) 콤보는 사라진다
  await page.clock.fastForward(1_100);
  await expect(combo).toHaveCount(0);
});

test("수 흐름 띠: 같은 면은 합치고, 되돌리면 지우고, 휴대폰은 큐브 위에 겹친다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "휴대폰 세로와 데스크톱으로 본다",
  );
  await page.goto("/cube/solo");
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: SCRAMBLE_TIMEOUT },
  );
  const buttons = page.locator("[data-cube-buttons]");
  const flow = page.locator("[data-cube-flow-moves]");
  await buttons.getByRole("button", { name: "R", exact: true }).click();
  await buttons.getByRole("button", { name: "R", exact: true }).click();
  await buttons.getByRole("button", { name: "U", exact: true }).click();
  await expect(flow).toHaveAttribute("data-cube-flow-moves", "R2 U");
  await buttons.getByRole("button", { name: "되돌리기" }).click();
  await expect(flow).toHaveAttribute("data-cube-flow-moves", "R2");
  // 띠는 화면 폭을 넘지 않는다. 휴대폰은 큐브 칸 위쪽 가장자리에 겹치고, 데스크톱은 큐브 위 한 줄
  const strip = await page.locator("[data-cube-flow]").boundingBox();
  const stage = await page.locator("[data-cube-stage]").boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(strip && stage).toBeTruthy();
  if (!strip || !stage) return;
  expect(strip.x).toBeGreaterThanOrEqual(0);
  expect(strip.x + strip.width).toBeLessThanOrEqual(width + 0.5);
  if (info.project.name === "phone-portrait") {
    expect(strip.y).toBeLessThanOrEqual(stage.y + 1);
    expect(strip.y + strip.height).toBeGreaterThan(stage.y);
  } else {
    expect(strip.y + strip.height).toBeLessThanOrEqual(stage.y + 1);
    await expectStageOnScreen(page);
  }
  await shot(page, "solo-flow", info.project.name);
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
