import { useTestSpeed } from "./fast";
import {
  expect,
  fastForwardUntil,
  type Page,
  ready,
  SAVE_SCREENSHOTS,
  speedUpAnimations,
  test,
} from "./test";

const status = (page: Page) => page.getByRole("status").first();
const over = (page: Page) => page.getByRole("button", { name: "다시 하기" });
const board = (page: Page) => page.locator("[data-galaxy-board]");
const rollButton = (page: Page) => page.locator("[data-roll]");
const buyButton = (page: Page) => page.locator("[data-buy]:enabled");
const passButton = (page: Page) => page.locator("[data-pass]");
const bidSkip = (page: Page) => page.locator("[data-bid-skip]");
const endTurn = (page: Page) => page.locator("[data-end-turn]");
const debtPlan = (page: Page) => page.locator("[data-debt-plan]");
/** 내가 할 일 아무것이나(또는 판 끝) */
const anyAction = (page: Page) =>
  rollButton(page)
    .or(passButton(page))
    .or(bidSkip(page))
    .or(endTurn(page))
    .or(debtPlan(page))
    .or(page.getByRole("button", { name: "거절" }))
    .or(over(page))
    .first();

/** 내 할 일 하나를 한다(굴리기·사기·입찰 안 내기·차례 마치기). 판이 끝났으면 false */
async function playStep(page: Page): Promise<boolean> {
  await expect(anyAction(page)).toBeVisible({ timeout: 20_000 });
  if (await over(page).isVisible()) return false;
  if (await rollButton(page).isVisible()) await rollButton(page).click();
  else if (await buyButton(page).isVisible()) await buyButton(page).click();
  else if (await passButton(page).isVisible()) await passButton(page).click();
  else if (await bidSkip(page).isVisible()) await bidSkip(page).click();
  else if (await endTurn(page).isVisible()) await endTurn(page).click();
  else if (await debtPlan(page).isVisible()) await debtPlan(page).click();
  else await page.getByRole("button", { name: "거절" }).click();
  return true;
}

/** 내 굴리기 차례가 올 때까지 다른 결정을 마저 한다(그때는 컴퓨터 수가 모두 보인 뒤라 판이 멈춰 있다) */
async function untilMyRoll(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await expect(anyAction(page)).toBeVisible({ timeout: 20_000 });
    if (await rollButton(page).isVisible()) return;
    if (await over(page).isVisible()) throw new Error("게임이 먼저 끝났다");
    await playStep(page);
  }
  throw new Error("굴리기 차례가 오지 않는다");
}

async function resign(page: Page): Promise<void> {
  await page.getByRole("button", { name: "기권" }).click();
  await page.getByRole("button", { name: "기권하기" }).click();
}

/** 옵션에서 2명·짧은 판·입문을 고르고 → 컴퓨터와 시작 */
async function startSolo(page: Page) {
  await ready(page);
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "2명", exact: true }).click();
  await page.getByRole("button", { name: "짧은 판", exact: true }).click();
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /컴퓨터와 시작/ }).click();
  await expect(board(page)).toBeVisible();
}

/** IndexedDB 복기 기록에 남은 끝난 은하 한 바퀴 게임 수 */
async function finishedGalaxyGames(): Promise<number> {
  const names = await indexedDB.databases();
  if (!names.some((d) => d.name === "mighty-review")) return 0;
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("mighty-review", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("games")) {
        db.close();
        resolve(0);
        return;
      }
      const all = db.transaction("games").objectStore("games").getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => {
        const games = all.result as { game: string; over: boolean }[];
        db.close();
        resolve(games.filter((g) => g.game === "galaxy" && g.over).length);
      };
    };
  });
}

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.beforeEach(async ({ page, context }) => {
  // 움직임 줄이기는 화면 시험 설정이 기본으로 켠다(주사위·이동 연출을 기다리지 않는다)
  await useTestSpeed(context);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    (window as { __galaxySeed?: number }).__galaxySeed = 20261104;
    if (!sessionStorage.getItem("keep")) localStorage.removeItem("galaxy-save");
  });
});

test("은하 한 바퀴: 게임 목록에서 들어가 굴리고 사다가 기권해 판 끝 화면까지 간다", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: /은하 한 바퀴/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/galaxy$/);
  await expect(
    page.getByRole("heading", { name: "은하 한 바퀴" }),
  ).toBeVisible();
  await expect(page.getByText("실제 돈과 바꿀 수 없어요")).toBeVisible();
  await page.screenshot({ path: info.outputPath("galaxy-home.png") });
  await startSolo(page);
  expect(await page.locator("[data-square]").count()).toBe(32);

  // 몇 걸음 두며 살 수 있으면 산다(결정 창 스크린샷은 처음 사기 창에서)
  let shotBuy = false;
  for (let i = 0; i < 14; i++) {
    await expect(anyAction(page)).toBeVisible({ timeout: 20_000 });
    if (!shotBuy && (await buyButton(page).isVisible())) {
      await expect(page.locator("[data-star-line]")).toBeVisible();
      await page.screenshot({ path: info.outputPath("galaxy-buy.png") });
      shotBuy = true;
    }
    if (!(await playStep(page))) break;
  }
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({ path: info.outputPath("galaxy-play.png") });

  // 내 굴리기 차례에 기권해 판 끝 화면(가운데 띠·결과·순위 표)을 본다
  if (!(await over(page).isVisible())) {
    await untilMyRoll(page);
    await resign(page);
  }
  await expect(over(page)).toBeVisible();
  await expect(status(page)).toHaveText(/기권|등/);
  await expect(page.locator("[data-result-banner]")).toBeVisible();
  await expect(page.locator("[data-standings]")).toBeVisible();
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({ path: info.outputPath("galaxy-end.png") });

  // 다 끝난 게임은 이어하기에 남지 않는다
  await over(page).click();
  await expect(
    page.getByRole("button", { name: /컴퓨터와 시작/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});

test("은하 한 바퀴: 하던 게임은 새로고침해도 이어 한다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "저장은 화면 크기와 상관없다");
  await page.goto("/galaxy");
  await startSolo(page);
  for (let i = 0; i < 4; i++) await playStep(page);
  await untilMyRoll(page);
  const owned = await page.locator("[data-owner]").count();
  const cash = await page.locator('[data-cash="0"]').first().textContent();
  await page.evaluate(() => sessionStorage.setItem("keep", "1"));
  await page.reload();
  await page.getByRole("button", { name: /이어하기/ }).click();
  await expect(board(page)).toBeVisible();
  await expect(rollButton(page)).toBeVisible();
  await expect(page.locator("[data-owner]")).toHaveCount(owned);
  await expect(page.locator('[data-cash="0"]').first()).toHaveText(cash ?? "");
  // 이어서 굴리기가 된다(내 사슬 공개도 자동)
  await playStep(page);
  await playStep(page);
});

test("은하 한 바퀴: 끝낸 판은 내 기록에 쌓이고 복기에서 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/galaxy");
  await startSolo(page);
  for (let i = 0; i < 3; i++) await playStep(page);
  await untilMyRoll(page);
  await resign(page);
  await expect(status(page)).toHaveText("기권했어요");
  await expect
    .poll(() => page.evaluate(finishedGalaxyGames), { intervals: [50] })
    .toBe(1);

  await page.goto("/profile?game=galaxy");
  await expect(
    page.getByRole("tab", { name: "✶ 은하 한 바퀴" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("1판 중 0번 1등")).toBeVisible();
  await expect(page.getByText(/\d+\/24/)).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /✶ 은하 한 바퀴 · 혼자/ }).click();
  await expect(board(page)).toBeVisible();
  await page.getByRole("button", { name: "처음" }).click();
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(page.getByRole("status").first()).toHaveText(/1\/\d+/);
  await page.screenshot({ path: info.outputPath("galaxy-review.png") });
});

test("은하 한 바퀴 연출: 거래로 별자리를 완성하면 선이 이어지고, 계절이 바뀌면 공문이 내려온다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "연출 순서는 화면 크기와 상관없다",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  // 정해진 장면: 나는 오리온 별 둘, 컴퓨터(중수)는 벨라트릭스. 9돌림이라 이번 돌림이 끝나면 겨울 하늘이 된다
  await page.addInitScript(() => {
    (window as { __galaxyScenario?: unknown }).__galaxyScenario = {
      rules: {
        players: 2,
        length: "standard",
        trade: true,
        seasonal: true,
        sky: "seasons",
      },
      level: 1,
      seed: 5,
      round: 9,
      stars: [
        { square: 9, owner: 0 },
        { square: 10, owner: 0 },
        { square: 11, owner: 1 },
      ],
    };
  });
  await page.goto("/galaxy");
  await speedUpAnimations(page);
  await ready(page);
  await page.getByRole("button", { name: /컴퓨터와 시작/ }).click();
  await expect(rollButton(page)).toBeVisible();
  await expect(page.locator("[data-pair-line]")).toHaveCount(1);

  // 거래: 컴퓨터에게 벨라트릭스를 ✦400에 청한다(중수는 외톨이 별을 두 배 넘게 받으면 판다)
  await page.locator("[data-trade]").click();
  await page
    .locator('[data-decision="trade-partner"] button', { hasText: "컴퓨터" })
    .click();
  await page.locator('[data-square="11"]').click();
  for (let i = 0; i < 4; i++)
    await page.locator("[data-cash-plus100]").first().click();
  if (SAVE_SCREENSHOTS)
    await page.screenshot({ path: info.outputPath("galaxy-trade.png") });
  await page.getByRole("button", { name: "제안 보내기" }).click();
  await fastForwardUntil(page, async () =>
    page.locator("[data-complete-name]").isVisible(),
  );
  expect(await page.locator("[data-complete-line]").count()).toBeGreaterThan(2);
  if (SAVE_SCREENSHOTS)
    await page.screenshot({ path: info.outputPath("galaxy-complete.png") });
  await fastForwardUntil(
    page,
    async () => (await page.locator("[data-moving]").count()) === 0,
  );
  await expect(page.locator("[data-my-group=Ori]")).toContainText("완성");

  // 이번 돌림을 마치면 겨울 하늘 공문이 위에서 내려온다(그 전에 공문 칸에 멈춰도 같은 종이)
  for (let i = 0; i < 40; i++) {
    if (await page.locator("[data-notice-paper]").isVisible()) break;
    for (const button of [
      rollButton(page),
      buyButton(page),
      passButton(page),
      bidSkip(page),
      endTurn(page),
      debtPlan(page),
    ])
      if (await button.isVisible()) {
        await button.click();
        break;
      }
    await page.clock.fastForward(300);
  }
  await expect(page.locator("[data-notice-paper]")).toBeVisible();
  if (SAVE_SCREENSHOTS)
    await page.screenshot({ path: info.outputPath("galaxy-notice.png") });
});
