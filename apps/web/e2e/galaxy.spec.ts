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
  // 정해진 장면: 나는 오리온 별 둘, 컴퓨터(중수)는 벨라트릭스. 9차례째라 이번 차례가 끝나면 겨울 하늘이 된다
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
        { square: 27, owner: 1 },
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
  await page.locator('[data-square="27"]').click();
  for (let i = 0; i < 4; i++)
    await page.locator("[data-cash-plus100]").first().click();
  if (SAVE_SCREENSHOTS)
    await page.screenshot({ path: info.outputPath("galaxy-trade.png") });
  await page.getByRole("button", { name: "제안 보내기" }).click();
  // 오리온의 실제 선 토막이 내 색으로 모두 이어지고 이름이 떠오를 때까지
  const segments = page.locator(
    '[data-sky-group="Ori"] line:not([data-complete-line]):not([data-pair-line])',
  );
  await fastForwardUntil(
    page,
    async () =>
      (await page.locator("[data-complete-line]").count()) ===
      (await segments.count()),
    { step: 100 },
  );
  expect(await segments.count()).toBeGreaterThan(2);
  // 다 이은 뒤 이름이 떠오른다
  await expect(page.locator("[data-complete-name]")).toBeVisible();
  await page.clock.fastForward(500);
  if (SAVE_SCREENSHOTS)
    await page.screenshot({ path: info.outputPath("galaxy-complete.png") });
  await fastForwardUntil(
    page,
    async () => (await page.locator("[data-moving]").count()) === 0,
  );
  await expect(page.locator("[data-my-group=Ori]")).toContainText("완성");

  // 모두 이번 차례를 마치면 겨울 하늘 공문이 위에서 내려온다(그 전에 공문 칸에 멈춰도 같은 종이)
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

test("은하 한 바퀴 연출: 유성우의 밤을 켠 판은 마지막 두 차례가 시작될 때 공문이 내려오고 판에 유성이 흐른다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "연출 순서는 화면 크기와 상관없다",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  // 2인 기본 판은 36차례: 34차례가 끝나면 유성우의 밤(35·36차례)
  await page.addInitScript(() => {
    (window as { __galaxyScenario?: unknown }).__galaxyScenario = {
      rules: {
        players: 2,
        length: "standard",
        trade: false,
        seasonal: true,
        meteor: true,
        sky: "seasons",
      },
      level: 1,
      seed: 5,
      round: 34,
      stars: [
        { square: 15, owner: 0 },
        { square: 14, owner: 0 },
        { square: 26, owner: 1 },
      ],
    };
  });
  await page.goto("/galaxy");
  await speedUpAnimations(page);
  await ready(page);
  await page.getByRole("button", { name: /컴퓨터와 시작/ }).click();
  await expect(rollButton(page)).toBeVisible();
  await expect(page.locator("[data-meteor-shower]")).toHaveCount(0);
  const paper = page.locator("[data-notice-paper]", {
    hasText: "유성우의 밤",
  });
  for (let i = 0; i < 60; i++) {
    if (await paper.isVisible()) break;
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
  await expect(paper).toBeVisible();
  await expect(page.locator("[data-meteor-shower]")).toHaveCount(1);
  if (SAVE_SCREENSHOTS)
    await page.screenshot({
      path: info.outputPath("galaxy-meteor-notice.png"),
    });
  await fastForwardUntil(
    page,
    async () => (await page.locator("[data-moving]").count()) === 0,
  );
  await expect(board(page)).toContainText("유성우의 밤");
  if (SAVE_SCREENSHOTS)
    await page.screenshot({ path: info.outputPath("galaxy-meteor.png") });
});

/** 온라인 시험에서 누르는 할 일 단추들 */
const stepButtons = (page: Page) => [
  rollButton(page),
  passButton(page),
  bidSkip(page),
  endTurn(page),
  debtPlan(page),
  page.getByRole("button", { name: "거절" }),
];

/**
 * 보이는 내 할 일 하나를 하고 그 단추가 사라질 때까지(방장이 받을 때까지) 기다린다. 했으면 true.
 * 앞 걸음 화면을 다 보이기 전에 누르면 저장소가 「잠깐만요」로 받지 않으므로, 단추가 남아 있으면 다시 누른다
 */
async function stepIfReady(page: Page): Promise<boolean> {
  for (const button of stepButtons(page))
    if (await button.isVisible()) {
      await expect(async () => {
        if (await button.isVisible()) await button.click({ timeout: 1_000 });
        await expect(button).toBeHidden({ timeout: 500 });
      }).toPass({ timeout: 20_000 });
      return true;
    }
  return false;
}

/** 이 탭에 할 일 단추가 보이나 */
async function hasStep(page: Page): Promise<boolean> {
  for (const button of stepButtons(page))
    if (await button.isVisible()) return true;
  return false;
}

test("은하 한 바퀴 온라인: 방장이 방을 만들고 친구가 링크로 들어와 두다가 기권으로 끝내고 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/galaxy?net=local");
  await ready(host);
  await host.getByRole("button", { name: "옵션" }).click();
  await host.getByRole("button", { name: "2명", exact: true }).click();
  await host.getByRole("button", { name: "짧은 판", exact: true }).click();
  await host.getByRole("button", { name: "처음으로" }).click();
  await host.getByRole("button", { name: /친구와 하기/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/galaxy");
  if (SAVE_SCREENSHOTS)
    await host.screenshot({ path: info.outputPath("galaxy-online-lobby.png") });

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(guest.getByText("방장이 시작하기를 기다리는 중")).toBeVisible();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(board(guest)).toBeVisible();
  await expect(guest.locator("[data-player]").first()).toContainText(/방장|나/);

  // 둘이 몇 번씩 굴리고 정한 뒤 방장이 기권한다. 판 끝 검증은 그때까지의 주사위·공문·입찰·별빛을
  // 모두 다시 계산한다. 끝까지 두는 진행은 엔진·방 단위 시험이 본다.
  let actions = 0;
  for (let i = 0; i < 40 && actions < 10; i++) {
    // 두 탭 가운데 한쪽에 할 일이 생기거나 판이 끝날 때까지 기다린다.
    await expect
      .poll(
        async () =>
          (await hasStep(host)) ||
          (await hasStep(guest)) ||
          (await over(host).isVisible()),
        { timeout: 20_000 },
      )
      .toBe(true);
    if (await over(host).isVisible()) break;
    for (const p of [host, guest]) if (await stepIfReady(p)) actions++;
  }
  expect(actions).toBeGreaterThanOrEqual(4);
  if (SAVE_SCREENSHOTS)
    await guest.screenshot({
      path: info.outputPath("galaxy-online-guest.png"),
    });
  if (!(await over(host).isVisible())) {
    const resign = host.getByRole("button", { name: "기권" });
    await expect(resign).toBeEnabled({ timeout: 20_000 });
    await resign.click();
    await host.getByRole("button", { name: "기권하기" }).click();
  }
  await expect(over(host)).toBeVisible({ timeout: 20_000 });
  await expect(over(guest)).toBeVisible({ timeout: 20_000 });

  // 방장이 나가면 기록이 공개되고, 참가자가 모든 걸음을 다시 계산해 확인한다.
  await host.getByRole("button", { name: "← 은하 한 바퀴" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 15_000,
  });
  if (SAVE_SCREENSHOTS)
    await guest.screenshot({
      path: info.outputPath("galaxy-online-guest-end.png"),
    });
  expect(errors).toEqual([]);
});

test("은하 한 바퀴 배우기: 단원을 끝내고, 미션은 틀리면 다시 한다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "배우기 진행은 크기와 상관없다(화면 배치는 아래 시험이 크기마다 본다)",
  );
  const next = () =>
    page.getByRole("button", { name: "다음", exact: true }).click();
  await page.goto("/galaxy");
  await ready(page);
  await page.getByRole("button", { name: /은하 한 바퀴 배우기/ }).click();
  await expect(page.getByText("0/9")).toBeVisible();

  // 1단원: 설명 둘 → 퀴즈 둘(틀리면 다시 풀기)
  await page.getByRole("button", { name: /어떤 게임/ }).click();
  await next();
  await next();
  await page.getByRole("button", { name: "다음 판으로 이어진다" }).click();
  await expect(page.getByText("아쉬워요")).toBeVisible();
  await page.getByRole("button", { name: "다시 풀기" }).click();
  await page.getByRole("button", { name: "판과 함께 사라진다" }).click();
  await expect(page.getByText("정답이에요!")).toBeVisible();
  await next();
  await page.getByRole("button", { name: /^자산/ }).click();
  await next();
  await expect(page.getByText("단원 완료!")).toBeVisible();
  await page.getByRole("button", { name: "단원 목록으로" }).click();
  await expect(page.getByText("1/9")).toBeVisible();

  // 2단원 미션: 정해 둔 눈(1·1 → 2·3)으로 굴려 우주국에 멈춘다
  await page.getByRole("button", { name: /주사위와 한 바퀴/ }).click();
  await next();
  await next();
  await page.getByRole("button", { name: "8칸 가고 한 번 더 굴린다" }).click();
  await next();
  await page.getByRole("button", { name: "미션 시작" }).click();
  for (let i = 0; i < 2; i++) await rollButton(page).click();
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await next();
  await page.getByRole("button", { name: "단원 목록으로" }).click();

  // 3단원 미션: 넘기면 실패 → 다시 하기 → 사면 성공
  await page.getByRole("button", { name: /별 사기와 이용료/ }).click();
  await next();
  await next();
  await page.getByRole("button", { name: "✦40" }).click();
  await next();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await rollButton(page).click();
  await passButton(page).click();
  await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다시 하기" }).click();
  await rollButton(page).click();
  await expect(buyButton(page)).toBeVisible();
  await page.screenshot({ path: info.outputPath("galaxy-mission.png") });
  await buyButton(page).click();
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await next();
  await expect(page.getByText("단원 완료!")).toBeVisible();

  // 미션 대국은 이어하기에 남지 않는다
  await page.goto("/galaxy");
  await ready(page);
  await expect(page.getByText("3/9 단원 마침")).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});

test("은하 한 바퀴 배우기 화면: 단원 목록, 별자리 그림 퀴즈, 공문 퀴즈, 별자리 퀴즈", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "galaxy-tutorial",
      JSON.stringify({
        state: {
          completed: ["goal", "dice", "buy", "link", "notice", "auction"],
        },
        version: 0,
      }),
    );
  });
  await page.goto("/galaxy");
  await ready(page);
  await page.getByRole("button", { name: /은하 한 바퀴 배우기/ }).click();
  await expect(page.getByText("6/9")).toBeVisible();
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({ path: info.outputPath("galaxy-learn-home.png") });

  // 7단원: 선 그림을 보고 별자리 이름 고르기
  await page.getByRole("button", { name: /별자리 익히기 ①/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator('[data-scene-sky="Ori"]')).toBeVisible();
  await page.getByRole("button", { name: "오리온자리" }).click();
  await expect(page.getByText("정답이에요!")).toBeVisible();
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({ path: info.outputPath("galaxy-learn-sky.png") });
  await page.getByRole("button", { name: "단원 나가기" }).click();

  // 5단원(끝낸 단원 다시 보기): 공문 퀴즈의 판 그림과 공문 종이
  await page.getByRole("button", { name: /우주국 공문과 소행성대/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator("[data-scene-card]")).toBeVisible();
  await expect(page.locator("[data-galaxy-board]")).toBeVisible();
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({ path: info.outputPath("galaxy-learn-card.png") });
  await page.getByRole("button", { name: "단원 나가기" }).click();

  // 별자리 퀴즈: 하나 풀면 이 기기 기록이 쌓인다
  await page.locator("[data-tutorial-extra]").click();
  await expect(page.locator("[data-star-quiz-score]")).toContainText("0/0");
  await page.locator("[data-star-option]").first().click();
  await expect(page.locator("[data-star-quiz-score]")).toContainText("/1");
  expect(await noOverflow(page)).toBe(false);
  await page.screenshot({ path: info.outputPath("galaxy-star-quiz.png") });
});
