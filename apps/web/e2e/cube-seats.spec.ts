import { inputReady, keysFor, no3d, shot, useNotationKeys } from "./cube";
import { expect, type Page, test } from "./test";

/**
 * 대결 화면의 둘러앉은 자리(docs/47 9-9, 2026-11-05 사용자 제안). 내 큐브는 가운데, 상대는 테두리 자리마다 작은 큐브
 * 그림·이름·단계(체력)와 함께. 컴퓨터와 대결에서 컴퓨터 수를 갈고리(`__cubeVsBots`)로 늘려 2·4·8명을 본다.
 * 데스크톱은 위·양옆, 휴대폰 가로는 양옆, 휴대폰 세로는 위 한두 줄.
 */

const SCRAMBLE_TIMEOUT = 60_000;

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

/** 컴퓨터 수와(아이템전이면) 뽑기를 정해 둔다. 컴퓨터는 첫 이정표에 `bot`, 그다음 `bot2`, 나는 `me` */
async function hooks(
  page: Page,
  bots: number,
  draw?: { bot: string; bot2: string; me: string },
) {
  await page.addInitScript(
    ([k, d]) => {
      const w = window as unknown as Record<string, unknown>;
      w.__cubeTestHooks = true;
      w.__cubeVsBots = k;
      w.__cubeVsSeed = "seats";
      if (d)
        w.__cubeItemDraw = (player: string, milestone: number) =>
          player === "me" ? d.me : milestone === 1 ? d.bot : d.bot2;
    },
    [bots, draw ?? null] as const,
  );
}

async function start(page: Page, bots: number, party?: "hp" | "items") {
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.locator("[data-cube-vs-size]").selectOption("2");
  await page.getByRole("button", { name: "입문", exact: true }).click();
  if (party) await page.locator(`[data-cube-vs-party="${party}"]`).click();
  await page.getByLabel("15초 살펴보기").uncheck();
  await page.locator("[data-cube-vs-start]").click();
  await expect(page.locator("[data-cube-race-phase]")).toHaveAttribute(
    "data-cube-race-phase",
    "race",
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await inputReady(page);
  // 계획(워커)이 모두 온 뒤에 감는다
  await expect(page.locator("[data-cube-bot-planned]")).toHaveCount(bots, {
    timeout: SCRAMBLE_TIMEOUT,
  });
  return (await page
    .locator("[data-cube-scramble]")
    .getAttribute("data-cube-scramble")) as string;
}

/** 조건까지 시계를 감는다. 판정은 모두의 수가 와야 확실해지므로 그동안 큐브를 돌렸다 되돌린다(y y′) */
async function waitMoving(
  page: Page,
  ready: () => Promise<boolean>,
  timeout = 90_000,
) {
  const until = Date.now() + timeout;
  while (!(await ready())) {
    if (Date.now() > until) throw new Error("기다리다 시간이 지났다");
    await page.keyboard.press("KeyY");
    await page.keyboard.press("Shift+KeyY");
    await page.clock.fastForward(400);
  }
}

/**
 * 자리 배치 확인: 상대마다 자리 하나(작은 큐브 그림·이름), 자리는 내 큐브 칸과 겹치지 않고 화면 폭 안에 든다.
 * 데스크톱은 큐브 칸이 첫 화면 안에 다 들어온다
 */
async function seatsFit(page: Page, bots: number, project: string) {
  const seats = page.locator("[data-cube-peers] [data-cube-seat]");
  await expect(seats).toHaveCount(bots);
  await expect(
    page.locator("[data-cube-seat] [data-cube-posters]"),
  ).toHaveCount(bots);
  const stage = await page.locator("[data-cube-stage]").boundingBox();
  const view = page.viewportSize();
  expect(stage && view).toBeTruthy();
  if (!stage || !view) return;
  for (let i = 0; i < bots; i++) {
    const b = await seats.nth(i).boundingBox();
    expect(b).toBeTruthy();
    if (!b) continue;
    expect(b.x).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.width).toBeLessThanOrEqual(view.width + 1);
    const above = b.y + b.height <= stage.y + 1;
    const beside =
      b.x + b.width <= stage.x + 1 || b.x >= stage.x + stage.width - 1;
    expect(above || beside).toBe(true);
    if (project === "phone-portrait") expect(above).toBe(true);
    if (project === "phone-landscape") expect(beside).toBe(true);
  }
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(wide).toBe(true);
  if (project === "desktop")
    expect(stage.y + stage.height).toBeLessThanOrEqual(view.height + 1);
}

test.describe("화면 시험(3D 없음)", () => {
  test.beforeEach(async ({ page }) => {
    await no3d(page);
    await useNotationKeys(page);
  });

  for (const people of [2, 4, 8]) {
    test(`${people}명: 상대는 테두리 자리마다 작은 큐브와 단계, 상대가 돌리면 그림이 바뀐다`, async ({
      page,
    }, info) => {
      test.setTimeout(150_000);
      const bots = people - 1;
      await hooks(page, bots);
      await start(page, bots);
      await seatsFit(page, bots, info.project.name);
      const art = page.locator('[data-cube-peer="bot1"] [data-cube-posters]');
      const before = await art.innerHTML();
      // 컴퓨터가 돌리면 그 자리 그림이 바뀌고, 이정표를 지나면 단계 칩이 뜬다
      await waitMoving(page, async () => (await art.innerHTML()) !== before);
      const stages = page.locator(
        '[data-cube-seat][data-cube-peer="bot1"] [data-cube-peer-stages]',
      );
      await waitMoving(
        page,
        async () =>
          ((await stages.getAttribute("data-cube-peer-stages")) ?? "") !== "",
      );
      await seatsFit(page, bots, info.project.name);
      await shot(page, `seats-${people}`, info.project.name);
    });
  }

  test("파티 체력바 4명: 자리마다 체력", async ({ page }, info) => {
    test.setTimeout(150_000);
    await hooks(page, 3);
    await start(page, 3, "hp");
    await expect(page.locator("[data-cube-seat] [data-cube-hp]")).toHaveCount(
      3,
    );
    await expect(
      page.locator('[data-cube-peer="me"] [data-cube-hp="me"]'),
    ).toBeVisible();
    // 누가 먼저 이정표를 지나 누군가 깎인다
    await waitMoving(page, async () => {
      const values = await page
        .locator("[data-cube-hp-value]")
        .evaluateAll((els) =>
          els.map((e) => Number(e.getAttribute("data-cube-hp-value"))),
        );
      return values.some((v) => v < 100);
    });
    await seatsFit(page, 3, info.project.name);
    await shot(page, "seats-party-4", info.project.name);
  });

  test("아이템전 2명: 흑백 화면에 맞은 순간 짝 표와 맞은 표시가 큐브 바로 위에", async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await hooks(page, 1, { bot: "gray", bot2: "fog", me: "mix" });
    const scramble = await start(page, 1, "items");
    // 내가 먼저 이정표를 지나 앞서면 컴퓨터의 흑백 화면이 나에게 온다(마지막 한 수는 남긴다)
    const keys = keysFor(inverse(scramble));
    for (const k of keys.slice(0, -1)) await page.keyboard.press(k);
    const legend = page.locator("[data-cube-gray-legend]");
    await waitMoving(page, async () => (await legend.count()) > 0);
    await expect(legend.locator("li")).toHaveCount(6);
    // 짝 표는 아이템 줄 안, 큐브 칸 바로 위
    const row = await page.locator("[data-cube-item-row]").boundingBox();
    const stage = await page.locator("[data-cube-stage]").boundingBox();
    const box = await legend.boundingBox();
    expect(row && stage && box).toBeTruthy();
    if (row && stage && box) {
      expect(box.y).toBeGreaterThanOrEqual(row.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(stage.y + 1);
      // 한눈에 읽히게: 칸 하나가 16px 이상
      const cell = await legend
        .locator("[data-cube-gray-pattern]")
        .first()
        .boundingBox();
      expect(cell?.width ?? 0).toBeGreaterThanOrEqual(15.5);
    }
    // 상대 자리 그림도 내 화면 방해대로(흑백) 그린다
    await shot(page, "seats-items-gray-2", info.project.name);
  });

  test("아이템전 4명: 상대가 맞은 방해가 그 자리에 붙는다", async ({
    page,
  }, info) => {
    test.setTimeout(150_000);
    await hooks(page, 3, { bot: "swap", bot2: "gray", me: "shield" });
    await start(page, 3, "items");
    // 컴퓨터끼리 이정표를 지나 받은 방해를 앞선 사람에게 쓴다. 나는 돌리기만 해 꼴찌로 남는다
    const hit = page.locator("[data-cube-seat] [data-cube-seat-hit]");
    await waitMoving(page, async () => (await hit.count()) > 0);
    await seatsFit(page, 3, info.project.name);
    await shot(page, "seats-items-4", info.project.name);
  });
});
