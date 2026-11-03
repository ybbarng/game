import { expect, type Page, ready, speedUpAnimations, test } from "./test";

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
  await speedUpAnimations(page);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.removeItem("onecard-save");
    // 방장 기기의 컴퓨터가 바로 둔다(탭 여럿이라 page.clock으로 감을 수 없다)
    (window as { __onecardPace?: number }).__onecardPace = 0;
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

const myTurn = async (page: Page) =>
  (await hand(page).getAttribute("data-turn")) !== null;

/** 내 손패와 차례 표시(바뀌었으면 내 수가 들어갔다) */
const handState = async (page: Page) =>
  `${await myTurn(page)}:${(
    await hand(page)
      .locator("[data-card]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-card")))
  ).join(",")}`;

/**
 * `n`수 둔다: 누구든 차례가 올 때까지 기다렸다가(조건), 낼 수 있는 첫 카드를 내거나(7이면 무늬도) 먹고,
 * 그 수가 들어가 내 손패·차례가 바뀔 때까지 기다린다
 */
async function playMoves(pages: Page[], n: number) {
  for (let k = 0; k < n; k++) {
    let page: Page | undefined;
    await expect
      .poll(
        async () => {
          for (const p of pages)
            if (await myTurn(p)) {
              page = p;
              return true;
            }
          return false;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    const p = page as Page;
    const before = await handState(p);
    const card = hand(p).locator("[data-playable]").first();
    if ((await card.count()) > 0) {
      await card.click();
      const suit = p.locator("[data-pick-suit]").first();
      if (await suit.isVisible()) await suit.click();
    } else await p.getByRole("button", { name: /먹기$/ }).click();
    await expect.poll(() => handState(p), { timeout: 30_000 }).not.toBe(before);
  }
}

/** 가운데 더미 치기(원카드!). PC 스페이스는 누르고 있기 없이 바로 확정한다 */
async function slap(page: Page) {
  await pile(page).focus();
  await page.keyboard.press("Space");
}

test("원카드 일반방: 둘이 카드를 내고, 참가자가 더미를 치면 청구가 방장 화면에도 외침 사건으로 들어간다", async ({
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

  // 몇 수 둔다(누구 차례든 낸다, 컴퓨터 자리는 방장 기기가 둔다)
  await playMoves([host, guest], 4);
  await guest.screenshot({
    path: test.info().outputPath("onecard-online-normal-guest.png"),
  });

  // 참가자가 더미를 친다: 청구가 모두에게 가고, 방장이 묶음으로 엔진에 넣는다(헛외침이든 외침이든).
  // 말풍선은 1.5초만 떠서 부하 아래 놓칠 수 있으므로, 남는 상태(화면이 받은 자리별 외침 사건 수 `data-shouts-by`)로
  // 참가자 자리의 외침·잡기·헛외침이 방장·참가자 두 화면에서 늘었는지 기다린다(빈 자리 컴퓨터의 외침은 세지 않는다)
  const root = (p: Page) => p.locator('[data-game="onecard"]');
  const guestSeat = Number(await root(guest).getAttribute("data-my-seat"));
  expect(guestSeat).toBeGreaterThan(0);
  const shoutsOfGuest = async (p: Page) => {
    const by = (await root(p).getAttribute("data-shouts-by")) ?? "";
    return Number(by.split(",")[guestSeat] || 0);
  };
  const before = [await shoutsOfGuest(host), await shoutsOfGuest(guest)];
  await slap(guest);
  for (const [i, p] of [host, guest].entries())
    await expect
      .poll(() => shoutsOfGuest(p), { timeout: 30_000 })
      .toBeGreaterThan(before[i] as number);
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
  await playMoves([host, guest], 3);
  await guest.screenshot({
    path: test.info().outputPath("onecard-online-fair-guest.png"),
  });
  // 남의 손패는 뒷면뿐이다(참가자 화면에 자리 표가 보이지 않는다)
  expect(await guest.locator('[data-card^="?_"]').count()).toBe(0);
  expect(errors).toEqual([]);
});
