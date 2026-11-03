import { expect, type Page, ready, test } from "./test";

/*
 * 원카드 친구와 하기(docs/42 16절): 탭 둘(방장 + 참가자)을 BroadcastChannel로 잇는다(?net=local).
 * 일반방은 기본으로 돌리고(대기실 → 시작 → 카드 내기 몇 번 → 참가자가 더미 치기 → 방장 화면에 말풍선),
 * 암호화방(멘탈 포커)은 섞기 계산이 무거워 FAIR_MULTI=1일 때만 시작과 카드 내기까지 본다.
 * 규칙·청구 판정·판 끝 검증은 단위·방 시험(onecard/room.test.ts, fair-room.test.ts)이 본다.
 */
test.use({ serviceWorkers: "block" });

const hand = (page: Page) => page.getByRole("region", { name: "내 손패" });
const pile = (page: Page) => page.locator("[data-pile]");

async function prepare(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.removeItem("onecard-save");
  });
}

/** 방장이 방을 만들고 참가자가 링크로 들어와 시작한다 */
async function openRoom(host: Page, guest: Page, fair: boolean, shots: string) {
  await host.goto("/onecard?net=local");
  await ready(host);
  await host.getByRole("button", { name: /친구와 하기/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("radio", { name: fair ? /암호화방/ : /일반방/ }).check();
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("room=");
  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await expect(guest.getByText("방장이 시작하기를 기다리는 중")).toBeVisible();
  // 대기실 띠: 암호화방인지 일반방인지(FairLine)
  await expect(
    host.getByText(fair ? /암호화방/ : /일반방/).first(),
  ).toBeVisible();
  await host.screenshot({ path: test.info().outputPath(`${shots}-lobby.png`) });
  await host.getByRole("button", { name: "시작하기" }).click();
  for (const p of [host, guest])
    await expect(hand(p).locator("[data-card]").first()).toBeVisible({
      timeout: 60_000,
    });
}

/** 내 차례면 낼 수 있는 첫 카드를 내거나(7이면 무늬도) 먹는다. 둔 게 있으면 true */
async function playIfMine(page: Page): Promise<boolean> {
  if ((await hand(page).getAttribute("data-turn")) === null) return false;
  const card = hand(page).locator("[data-playable]").first();
  if ((await card.count()) > 0) {
    await card.click();
    const suit = page.locator("[data-pick-suit]").first();
    if (await suit.isVisible().catch(() => false)) await suit.click();
  } else await page.getByRole("button", { name: /먹기$/ }).click();
  return true;
}

/** 가운데 더미를 150ms 넘게 누르고 있다 떼기(원카드!) */
async function slap(page: Page) {
  await pile(page).dispatchEvent("pointerdown", {
    pointerId: 1,
    button: 0,
    isPrimary: true,
  });
  await page.waitForTimeout(250);
  await pile(page).dispatchEvent("pointerup", { pointerId: 1, button: 0 });
}

test("원카드 일반방: 둘이 카드를 내고, 참가자가 더미를 치면 청구가 방장 화면에도 말풍선으로 보인다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) {
    p.on("pageerror", (e) => errors.push(e.message));
    await prepare(p);
  }
  await openRoom(host, guest, false, "onecard-online-normal");
  await expect(host.getByText("철수").first()).toBeVisible();
  await expect(guest.getByText("방장").first()).toBeVisible();

  // 몇 수 둔다(누구 차례든 낸다)
  let moves = 0;
  for (let i = 0; i < 200 && moves < 4; i++) {
    if ((await playIfMine(host)) || (await playIfMine(guest))) moves++;
    await host.waitForTimeout(100);
  }
  expect(moves).toBe(4);
  await guest.screenshot({
    path: test.info().outputPath("onecard-online-normal-guest.png"),
  });

  // 참가자가 더미를 친다: 청구가 모두에게 가고, 방장이 묶음으로 엔진에 넣어 말풍선이 뜬다(헛외침이든 외침이든)
  await slap(guest);
  await expect(host.locator("[data-bubble]").first()).toBeVisible({
    timeout: 10_000,
  });
  await host.screenshot({
    path: test.info().outputPath("onecard-online-normal-host.png"),
  });
  expect(errors).toEqual([]);
});

test("원카드 암호화방: 섞고 나눈 뒤 둘이 카드를 낸다", async ({
  context,
}, info) => {
  test.skip(!process.env.FAIR_MULTI, "FAIR_MULTI=1 일 때만 돌린다");
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  test.setTimeout(180_000);
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) {
    p.on("pageerror", (e) => errors.push(e.message));
    await prepare(p);
  }
  await openRoom(host, guest, true, "onecard-online-fair");
  let moves = 0;
  for (let i = 0; i < 600 && moves < 3; i++) {
    if ((await playIfMine(host)) || (await playIfMine(guest))) moves++;
    await host.waitForTimeout(100);
  }
  expect(moves).toBe(3);
  await guest.screenshot({
    path: test.info().outputPath("onecard-online-fair-guest.png"),
  });
  // 남의 손패는 뒷면뿐이다(참가자 화면에 자리 표가 보이지 않는다)
  expect(await guest.locator('[data-card^="?_"]').count()).toBe(0);
  expect(errors).toEqual([]);
});
