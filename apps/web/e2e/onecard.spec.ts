import {
  expect,
  fastForwardUntil,
  type Page,
  ready,
  speedUpAnimations,
  test,
} from "./test";

/*
 * 원카드 화면 시험(docs/42 14절). 혼자 하기는 `?seed=`로 패를 정한다(씨앗 10: 둘이서 5장, 첫 차례에 7을 낼 수 있다).
 * 컴퓨터 대기·외침 창·누르고 있는 시간은 모두 타이머라 `page.clock`으로 감는다(실제 시간으로 기다리지 않는다).
 * 규칙·외침 판정·컴퓨터는 단위 시험(onecard/match.test.ts, bots.test.ts)이 본다. 여기서는 화면으로만 보이는 것을
 * 확인할 지점까지만 본다: 시작 → 7 무늬 고르기 → 먹기 → 더미 치기(말풍선) → 그만두기로 판 끝 화면
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

/** 내 차례가 될 때까지 컴퓨터 대기 시계를 감는다 */
const waitTurn = (page: Page) => fastForwardUntil(page, () => myTurn(page));

/** 가운데 더미를 150ms 넘게 누르고 있다 떼기(원카드!). 누르는 시간은 시계를 옮겨 만든다 */
async function slap(page: Page) {
  // 지금 판을 그린 프레임이 적힌 뒤에 친다(앞 판 청구가 되지 않게)
  await fastForwardUntil(
    page,
    () =>
      pile(page).evaluate(
        (el) =>
          el.getAttribute("data-shown-turn") ===
          el.getAttribute("data-turn-no"),
      ),
    { step: 16 },
  );
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
  await speedUpAnimations(page);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.removeItem("onecard-save");
  });
});

test("원카드: 들어가 단계를 고르고 7·먹기·더미 치기를 한 뒤 그만두기로 판 끝 화면을 본다", async ({
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
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-home.png") });

  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "2명", exact: true }).click();
  await page.getByRole("button", { name: "5장", exact: true }).click();
  await page.getByRole("button", { name: "한 명이 다 내면 끝" }).click();
  for (const name of ["입문", "중수", "고수"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "중수", exact: true }).click();
  await expect(page.getByText(/받아치기용으로 아끼고/)).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-options.png") });
  await page.getByRole("button", { name: "처음으로" }).click();

  await page.goto("/onecard?seed=10");
  await expect(page.getByText(/컴퓨터 1명과 · 5장 · 중수/)).toBeVisible();
  await page.getByRole("button", { name: /혼자 하기/ }).click();
  await expect(hand(page)).toBeVisible();
  await expect(page.locator("[data-seat]")).toHaveCount(1);
  await expect(page.getByText("꾹 치면 원카드!")).toHaveCount(0);
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

  // 판 끝 화면은 그만두기로(docs/21 10절). 판을 끝까지 두지 않는다.
  await page.getByRole("button", { name: "그만두기" }).click();
  await page.getByRole("button", { name: "그만두기" }).click();
  await expect(page.locator("[data-outcome]")).toBeVisible();
  await expect(page.getByRole("table", { name: "순위표" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 하기" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("onecard-end.png") });
  expect(errors).toEqual([]);
});

const flights = async (page: Page) =>
  Number((await page.locator("[data-fx]").getAttribute("data-fx")) ?? 0);

/** 지금 판을 그린 프레임이 적힐 때까지(한 프레임씩) 감는다 */
const untilShown = (page: Page) =>
  fastForwardUntil(
    page,
    () =>
      pile(page).evaluate(
        (el) =>
          el.getAttribute("data-shown-turn") ===
          el.getAttribute("data-turn-no"),
      ),
    { step: 16 },
  );

test("원카드 연출: 섞고 나눠 준 뒤, 낸 카드는 더미로·먹은 카드는 손패로 날고 맨 위 카드는 판이 온 프레임에 그린다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 화면 시험은 기본으로 움직임 줄이기라 연출이 없다. 이 시험만 켠다
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/onecard");
  await ready(page);
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "2명", exact: true }).click();
  await page.getByRole("button", { name: "5장", exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.goto("/onecard?seed=10");
  await page.getByRole("button", { name: /혼자 하기/ }).click();

  // 섞고 나눠 주는 동안은 손패를 가리고 내 차례도 아니다
  await expect(page.locator("[data-dealing]")).toBeAttached();
  await expect(hand(page).locator("[data-card]")).toHaveCount(0);
  await page.clock.fastForward(2200);
  await page.screenshot({ path: info.outputPath("onecard-fx-deal.png") });
  // 다 나눠 주고 손패가 펼쳐질 때까지
  await fastForwardUntil(
    page,
    async () =>
      (await page.locator("[data-dealing], [data-spreading]").count()) === 0,
    { step: 100 },
  );
  await waitTurn(page);
  await expect(hand(page).locator("[data-card]")).toHaveCount(5);

  // 카드를 내면 맨 위 카드는 판이 온 프레임에 이미 그려져 있고(반응 시간의 기준),
  // 낸 카드의 겉그림은 그 뒤에도 손패 자리에서 더미로 날고 있다
  // 손패는 오른쪽 카드가 왼쪽 카드를 덮으므로 맨 오른쪽 낼 수 있는 카드를 낸다
  const card = (await hand(page)
    .locator("[data-playable]")
    .last()
    .getAttribute("data-card")) as string;
  expect(card).not.toBeNull();
  await speedUpAnimations(page, 0); // 스크린샷용으로 날기를 멈춰 둔다
  await playCard(page, card, touch);
  const suit = page.locator("[data-pick-suit]").first();
  if (await suit.isVisible()) await suit.click();
  await untilShown(page);
  await expect(
    pile(page).getByRole("img", { name: "맨 위 카드" }),
  ).toHaveAttribute("data-card", card);
  expect(await flights(page)).toBeGreaterThan(0);
  await page.clock.fastForward(50);
  await page.screenshot({ path: info.outputPath("onecard-fx-play.png") });
  await speedUpAnimations(page);
  await fastForwardUntil(page, async () => (await flights(page)) === 0, {
    step: 50,
  });

  // 먹은 카드는 덱에서 날아와 내려앉은 뒤에야 손패에 보인다
  await waitTurn(page);
  const before = await hand(page).locator("[data-card]").count();
  await speedUpAnimations(page, 0);
  await drawButton(page).click();
  await untilShown(page);
  await expect(hand(page).locator("[data-card]")).toHaveCount(before + 1);
  expect(await flights(page)).toBeGreaterThan(0);
  const hidden = () =>
    hand(page)
      .locator("[data-card]")
      .evaluateAll((els) => els.filter((e) => e.style.opacity === "0").length);
  expect(await hidden()).toBe(1);
  await page.clock.fastForward(50);
  await page.screenshot({ path: info.outputPath("onecard-fx-draw.png") });
  await speedUpAnimations(page);
  await fastForwardUntil(page, async () => (await flights(page)) === 0, {
    step: 50,
  });
  expect(await hidden()).toBe(0);
  expect(errors).toEqual([]);
});
