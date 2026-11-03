import { expect, fastForwardUntil, type Page, test } from "./test";

/*
 * 원카드 배우기 화면 시험(docs/42 15절). 단원 열기 → 첫 단원 미션(카드 내기)으로 단원 끝 →
 * 외치기 단원의 잡기 미션(컴퓨터가 한 장이 되고 본인 시간이 지난 뒤 더미 치기)과 외치기 미션(치고 내기).
 * 미션 판정은 단위 시험(onecard/tutorial)이 본다. 여기서는 화면으로 끝까지 갈 수 있는지를 본다.
 * 컴퓨터 대기·본인 시간 1초는 `page.clock`으로 감고(실제 시간으로 기다리지 않는다), 더미를 누르고 있는 시간도
 * 시계로 만든다
 */

const hand = (page: Page) => page.getByRole("region", { name: "내 손패" });
const pile = (page: Page) => page.locator("[data-pile]");

async function next(page: Page, times = 1) {
  for (let i = 0; i < times; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

/** 가운데 더미를 150ms 넘게 누르고 있다 떼기(원카드!) */
async function slap(page: Page) {
  await pile(page).dispatchEvent("pointerdown", {
    pointerId: 1,
    button: 0,
    isPrimary: true,
  });
  await page.clock.fastForward(200);
  await pile(page).dispatchEvent("pointerup", { pointerId: 1, button: 0 });
}

/** 손패 카드 하나를 낸다. 휴대폰은 한 번 겨누고 다시 눌러 낸다 */
async function playCard(page: Page, card: string, touch: boolean) {
  const button = hand(page).locator(`[data-card="${card}"]`);
  await expect(button).toHaveAttribute("data-playable", /.*/);
  if (touch) {
    await button.tap();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await button.tap();
  } else await button.click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
  });
});

test("원카드 배우기: 첫 단원을 끝내고, 깜빡한 컴퓨터를 잡고, 외치고 낸다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/onecard");
  await page.getByRole("button", { name: /원카드 배우기/ }).click();
  await expect(page.getByText("0/5")).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-learn-home.png") });

  // 1단원: 설명 셋(둘째 쪽에 판 그림), 퀴즈 둘, 미션
  await page.getByRole("button", { name: /원카드는 어떤 게임/ }).click();
  await next(page);
  await expect(page.locator("[data-scene]")).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-learn-scene.png") });
  await next(page, 2);
  await page.getByRole("button", { name: "♠5" }).click();
  await next(page);
  await page.getByRole("button", { name: "한 장 먹고 차례를 넘긴다" }).click();
  await next(page);
  await page.getByRole("button", { name: "미션 시작" }).click();
  await expect(hand(page).locator('[data-card="S5"]')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-learn-mission.png") });
  await playCard(page, "S5", touch);
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible();
  await next(page);
  await expect(page.getByText("단원 완료!")).toBeVisible();
  await page.getByRole("button", { name: "단원 목록으로" }).click();
  await expect(page.getByText("1/5")).toBeVisible();

  // 앞 단원을 마친 것으로 두고 외치기 단원으로 간다.
  await page.evaluate(() =>
    localStorage.setItem(
      "onecard-tutorial",
      JSON.stringify({
        state: { completed: ["basic", "special", "attack"] },
        version: 0,
      }),
    ),
  );
  // 새로고침하면 화면 기록이 단원 목록을 되살린다. 첫 화면부터 다시 연다
  await page.goto("/onecard");
  await page.getByRole("button", { name: /원카드 배우기/ }).click();
  await expect(page.getByText("3/5")).toBeVisible();
  await page.getByRole("button", { name: /외치기와 잡기/ }).click();
  await next(page, 4);
  await page.getByRole("button", { name: "내가 한 장 먹는다" }).click();
  await next(page);
  await page
    .getByRole("button", { name: "1초가 지나는 순간 그 사람이 잡힌다" })
    .click();
  await next(page);

  // 잡기: 컴퓨터가 ◆4를 내고 한 장이 됐는데 외치지 않는다. 본인 시간(1초)이 지난 뒤 더미를 친다.
  await page.getByRole("button", { name: "미션 시작" }).click();
  // 컴퓨터가 낼 때까지 시계를 감는다. 한 장이 된 순간부터 본인 시간이 흐른다.
  await fastForwardUntil(
    page,
    async () => (await page.locator('[data-count="1"]').count()) > 0,
    { step: 50 },
  );
  await expect(page.locator('[data-count="1"]')).toHaveText("1장");
  await page.clock.fastForward(1_100);
  await slap(page);
  await expect(page.locator('[data-bubble="caught"]')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-learn-catch.png") });
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible();
  await next(page);

  // 외치기: 두 장일 때 먼저 더미를 치고 한 장을 낸다.
  await page.getByRole("button", { name: "미션 시작" }).click();
  await expect(hand(page).getByRole("button")).toHaveCount(2);
  await slap(page);
  await expect(hand(page).locator('[data-bubble="shout"]')).toBeVisible();
  await playCard(page, "H5", touch);
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-learn-shout.png") });
  await next(page);
  await expect(page.getByText("단원 완료!")).toBeVisible();
  expect(errors).toEqual([]);
});
