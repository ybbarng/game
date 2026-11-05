import { inputReady, keysFor, no3d, shot, useNotationKeys } from "./cube";
import { expect, fastForwardUntil, type Page, test } from "./test";

/**
 * 파티 모드 아이템전(docs/51 3-3, docs/47 9-7): 컴퓨터와 대결에서 「파티: 아이템전」으로 한 판 한다.
 * 뽑기는 화면 시험 갈고리(`__cubeItemDraw`)로 정해 둔다(컴퓨터와 대결 화면만 읽는다). 컴퓨터가 첫 층을 지나 받은 방해를
 * 나에게 쓰면 맞은 쪽 표시가 뜨고, 내가 이정표를 지나 받은 한 수 섞기를 컴퓨터에게 쓰면 컴퓨터가 넣고 되돌린다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.use({ video: process.env.E2E_VIDEO ? "on" : "off" });

function inverse(alg: string): string {
  return alg
    .trim()
    .split(/\s+/)
    .reverse()
    .map((t) =>
      t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : `${t}'`,
    )
    .join(" ");
}

/** 받는 사람·이정표 순번 → 아이템(컴퓨터 첫 이정표 = `bot`, 나머지 = `me`) */
async function fixDraw(page: Page, bot: string, me: string) {
  await page.addInitScript(
    ([b, m]) => {
      const w = window as unknown as Record<string, unknown>;
      w.__cubeTestHooks = true;
      w.__cubeItemDraw = (player: string, milestone: number) =>
        player === "bot1" ? (milestone === 1 ? b : "fog") : m;
    },
    [bot, me],
  );
}

async function startItems(page: Page) {
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.locator("[data-cube-vs-size]").selectOption("2");
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await page.locator('[data-cube-vs-party="items"]').click();
  await page.getByLabel("15초 살펴보기").uncheck();
  await page.locator("[data-cube-vs-start]").click();
  await expect(page.locator("[data-cube-race-phase]")).toHaveAttribute(
    "data-cube-race-phase",
    "race",
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await inputReady(page);
  await expect(page.locator("[data-cube-item-slot]")).toHaveAttribute(
    "data-cube-item-slot",
    "",
  );
  return (await page
    .locator("[data-cube-scramble]")
    .getAttribute("data-cube-scramble")) as string;
}

/**
 * 조건까지 시계를 감으며 기다린다. 판정은 모두의 수가 와야 확실해지므로(내가 멈추면 남의 이정표도 판정되지 않는다) 그동안
 * 큐브를 돌렸다 되돌린다(y y′)
 */
async function waitMoving(
  page: Page,
  ready: () => Promise<boolean>,
  timeout = 120_000,
) {
  const until = Date.now() + timeout;
  while (!(await ready())) {
    if (Date.now() > until) throw new Error("기다리다 시간이 지났다");
    await page.keyboard.press("KeyY");
    await page.keyboard.press("Shift+KeyY");
    await page.clock.fastForward(400);
  }
}

/** 큐브 칸이 화면 안에 다 들어온다(1280×720) */
async function stageFits(page: Page) {
  const stage = await page.locator("[data-cube-stage]").boundingBox();
  const view = page.viewportSize();
  expect(stage).toBeTruthy();
  if (stage && view) {
    expect(stage.y + stage.height).toBeLessThanOrEqual(view.height + 1);
    expect(stage.x + stage.width).toBeLessThanOrEqual(view.width + 1);
  }
}

test.describe("화면 시험(3D 없음)", () => {
  test.beforeEach(async ({ page }) => {
    await no3d(page);
    await useNotationKeys(page);
  });

  test("2×2 아이템전: 받기 → 쓰기 → 맞은 쪽 표시(흑백 화면과 색·무늬 표) → 결과 상자", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name === "phone-landscape",
      "데스크톱·휴대폰 세로로 본다",
    );
    test.setTimeout(180_000);
    await fixDraw(page, "gray", "mix");
    const scramble = await startItems(page);
    if (info.project.name === "desktop") await stageFits(page);

    // 먼저 내가 거꾸로 두다 이정표를 지나면 한 수 섞기를 받는다(컴퓨터 수가 와야 판정이 확실해진다). 마지막 한 수는 남겨 둔다
    const keys = keysFor(inverse(scramble));
    const slot = page.locator('[data-cube-item-slot="mix"]');
    let k = 0;
    for (; k < keys.length - 1 && (await slot.count()) === 0; k++) {
      await page.keyboard.press(keys[k] as string);
      await page.clock.fastForward(250);
    }
    for (; k < keys.length - 1; k++)
      await page.keyboard.press(keys[k] as string);
    await waitMoving(page, async () => (await slot.count()) > 0, 20_000);
    await shot(page, "items-got", info.project.name);
    // 맞추는 중인 컴퓨터에게 쓴다
    await slot.click();
    await expect(page.locator("[data-cube-item-slot]")).toHaveAttribute(
      "data-cube-item-slot",
      "",
      { timeout: 10_000 },
    );

    // 컴퓨터가 첫 층을 지나 흑백 화면을 받고 0.8초 뒤 나에게 쓴다
    const notice = page.locator('[data-cube-item-notice="gray"]');
    await waitMoving(page, async () => (await notice.count()) > 0);
    await expect(notice).toContainText("흑백 화면");
    const row = page.locator("[data-cube-item-row]");
    await expect(row).toHaveAttribute("data-cube-screen", /gray/);
    const legend = page.locator("[data-cube-gray-legend] li");
    await expect(legend).toHaveCount(6);
    // 짝 표는 큐브 칸 바로 위 아이템 줄 안, 칸 하나가 16px 이상(docs/47 9-9). 상대 자리 그림도 흑백
    const legendBox = await page
      .locator("[data-cube-gray-legend]")
      .boundingBox();
    const stageTop = (await page.locator("[data-cube-stage]").boundingBox())?.y;
    expect((legendBox?.y ?? 0) + (legendBox?.height ?? 0)).toBeLessThanOrEqual(
      (stageTop ?? 0) + 1,
    );
    expect(
      (await page.locator("[data-cube-gray-pattern]").first().boundingBox())
        ?.width ?? 0,
    ).toBeGreaterThanOrEqual(15.5);
    await expect(
      page
        .locator('[data-cube-seat][data-cube-peer="bot1"] [data-pattern]')
        .first(),
    ).toBeAttached();
    await expect(page.locator('[data-cube-gray-pattern="dots9"]')).toHaveCount(
      1,
    );
    // 큐브 그림(3D를 못 그릴 때)도 같은 무늬를 단다
    await expect(
      page
        .locator("[data-cube-stage] [data-cube-posters] [data-pattern]")
        .first(),
    ).toBeVisible();
    if (info.project.name === "desktop") await stageFits(page);
    await shot(page, "items-gray", info.project.name);
    // 4초 뒤 원래 색
    await page.clock.fastForward(4_200);
    await expect(row).not.toHaveAttribute("data-cube-screen", /gray/);
    await expect(page.locator("[data-cube-gray-legend]")).toHaveCount(0);

    // 마지막 수로 맞춘다
    await page.keyboard.press(keys[k] as string);
    const result = page.locator("[data-cube-result]");
    await fastForwardUntil(
      page,
      async () => (await result.getAttribute("data-cube-result")) === "final",
      { step: 1_000, timeout: 120_000 },
    );
    const mine = result.locator('[data-cube-rank="me"]');
    await expect(mine).toContainText("받음 한 수 섞기");
    await expect(mine).toContainText("씀 한 수 섞기");
    await expect(mine).toContainText("맞음 흑백 화면");
    const bot = result.locator('[data-cube-rank="bot1"]');
    await expect(bot).toContainText("받음 흑백 화면");
    await expect(bot).toContainText("맞음 한 수 섞기");
    // 컴퓨터는 맞은 섞기를 되돌리고 계획대로 끝까지 맞췄다
    await expect(bot).toContainText("컴퓨터 계획 확인 ✓");
    await shot(page, "items-result", info.project.name);
  });

  test("색 뒤집기: 맞은편 색끼리 바뀌었다 4초 뒤 돌아온다", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "데스크톱으로 본다");
    test.setTimeout(150_000);
    await fixDraw(page, "swap", "fog");
    await startItems(page);
    const cell = page
      .locator("[data-cube-stage] [data-cube-posters] [data-sticker]")
      .first();
    const before = await cell.getAttribute("fill");
    const notice = page.locator('[data-cube-item-notice="swap"]');
    await waitMoving(page, async () => (await notice.count()) > 0);
    await expect(notice).toContainText("색 뒤집기");
    expect(await cell.getAttribute("fill")).not.toBe(before);
    await shot(page, "items-swap", info.project.name);
    await page.clock.fastForward(4_200);
    await expect(cell).toHaveAttribute("fill", before as string);
  });
});

// 3D 스티커 무늬를 사람이 보려고 찍을 때만(E2E_ITEMS_3D=1, GPU를 켠 이 맥에서). CI는 3D를 그리지 않는다
test("3D: 흑백 화면의 스티커 무늬", async ({ page }, info) => {
  test.skip(!process.env.E2E_ITEMS_3D, "GPU로 찍을 때만");
  test.skip(info.project.name === "phone-landscape", "데스크톱·휴대폰 세로");
  test.setTimeout(180_000);
  await useNotationKeys(page);
  await fixDraw(page, "gray", "fog");
  await startItems(page);
  await expect(page.locator("[data-cube-canvas]")).toHaveAttribute(
    "data-cube-ready",
    "",
  );
  const notice = page.locator('[data-cube-item-notice="gray"]');
  await waitMoving(page, async () => (await notice.count()) > 0);
  // 장면이 한 번 그려지게 조금 감는다
  await page.clock.fastForward(100);
  await shot(page, "items-gray-3d", info.project.name);
});
