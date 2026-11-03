import { expect, type Page, ready, test } from "./test";

/*
 * 원카드 화면 시험(docs/42 14절). 혼자 하기는 `?seed=`로 패를 정한다(씨앗 10: 둘이서 5장, 첫 차례에 7을 낼 수 있다).
 * 컴퓨터 대기는 `window.__onecardPace`로 줄이고, 더미를 누르고 있는 시간은 `page.clock`으로 옮긴다.
 * 규칙·외침 판정은 단위 시험(onecard/match.test.ts)이 본다. 여기서는 화면으로만 보이는 것을 본다
 */

const hand = (page: Page) => page.getByRole("region", { name: "내 손패" });
const pile = (page: Page) => page.locator("[data-pile]");
const drawButton = (page: Page) => page.getByRole("button", { name: /먹기$/ });

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

const myTurn = async (page: Page) =>
  (await hand(page).getAttribute("data-turn")) !== null;
const over = async (page: Page) =>
  (await page.locator("[data-outcome]").count()) > 0;

/** 내 차례나 판 끝이 될 때까지 */
async function waitTurn(page: Page) {
  await expect
    .poll(async () => (await myTurn(page)) || (await over(page)), {
      timeout: 30_000,
      intervals: [50],
    })
    .toBe(true);
}

/** 가운데 더미를 150ms 넘게 누르고 있다 떼기(원카드!). 누르는 시간은 시계를 옮겨 만든다 */
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
    localStorage.removeItem("onecard-save");
    (window as { __onecardPace?: number }).__onecardPace = 60;
  });
});

test("원카드: 목록에서 들어가 7·먹기·더미 치기를 하고 판 끝 화면까지 간다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page
    .getByRole("link", { name: /원카드/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/onecard$/);
  await ready(page);
  await expect(page.getByRole("heading", { name: "원카드" })).toBeVisible();
  await expect(page.getByText("가운데 더미를 탁 치면 원카드!")).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-home.png") });

  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "2명", exact: true }).click();
  await page.getByRole("button", { name: "5장", exact: true }).click();
  await page.getByRole("button", { name: "한 명이 다 내면 끝" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();

  await page.goto("/onecard?seed=10");
  await page.getByRole("button", { name: /혼자 하기/ }).click();
  await expect(hand(page)).toBeVisible();
  await expect(page.locator("[data-seat]")).toHaveCount(1);
  await waitTurn(page);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-table.png") });

  // 7을 내고 무늬를 고른다.
  const seven = await hand(page)
    .locator('[data-playable][data-card$="7"]')
    .first()
    .getAttribute("data-card");
  expect(seven).not.toBeNull();
  await playCard(page, seven as string, touch);
  await page.getByRole("button", { name: "하트", exact: true }).click();
  await expect(hand(page).locator(`[data-card="${seven}"]`)).toHaveCount(0);

  // 다음 차례에는 먹는다(낼 카드가 있어도 먹을 수 있다).
  await waitTurn(page);
  const before = await hand(page).getByRole("button").count();
  await drawButton(page).click();
  await expect
    .poll(() => hand(page).getByRole("button").count(), { intervals: [50] })
    .toBeGreaterThan(before);

  // 아무도 한 장이 아닐 때 더미를 치면 헛외침: 말풍선이 잠깐 뜨고 한 장 먹는다.
  const count = await hand(page).getByRole("button").count();
  await slap(page);
  await expect(hand(page).locator('[data-bubble="false"]')).toBeVisible();
  await expect(hand(page).getByRole("button")).toHaveCount(count + 1);
  await page.screenshot({ path: info.outputPath("onecard-bubble.png") });

  // 판 끝 화면까지 가장 짧은 길(docs/21 10절): 휴대폰은 그만두기. 데스크톱 하나만 끝까지 둔다:
  // 낼 수 있는 첫 카드를 내고, 없으면 먹는다. 내 차례에 두 장이면 먼저 더미를 친다(미리 외침).
  if (touch) {
    await page.getByRole("button", { name: "그만두기" }).click();
    await page.getByRole("button", { name: "그만두기" }).click();
  }
  for (let i = 0; i < 300 && !touch; i++) {
    await waitTurn(page);
    if (await over(page)) break;
    const cards = hand(page).getByRole("button");
    if ((await cards.count()) === 2) await slap(page);
    const playable = hand(page).locator("[data-playable]").first();
    if ((await playable.count()) > 0) {
      const card = (await playable.getAttribute("data-card")) as string;
      await playCard(page, card, touch);
      const heart = page.getByRole("button", { name: "하트", exact: true });
      if (card.endsWith("7")) await heart.click();
      await expect(hand(page).locator(`[data-card="${card}"]`)).toHaveCount(0);
    } else {
      const n = await cards.count();
      await drawButton(page).click();
      await expect
        .poll(
          async () =>
            (await over(page)) ||
            (await hand(page).getByRole("button").count()) !== n,
          { intervals: [50] },
        )
        .toBe(true);
    }
  }
  await expect(page.locator("[data-outcome]")).toBeVisible();
  await expect(page.getByRole("table", { name: "순위표" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 하기" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-end.png") });
  expect(errors).toEqual([]);
});
