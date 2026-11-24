import { useTestSpeed } from "./fast";
import {
  expect,
  fastForwardUntil,
  leaveOnline,
  type Page,
  ready,
  speedUpAnimations,
  test,
} from "./test";

/*
 * 고스톱 화면 시험. 혼자 하기는 `?seed=`로 패를 정해 늘 같은 판이 나온다.
 * 기다림은 모두 화면 조건으로 한다(정해진 시간을 기다리지 않는다).
 */

/**
 * 화면 조건을 다시 볼 간격. expect.poll 기본(100·250·500·1000ms로 늘어남)은 컴퓨터 차례를 기다릴 때마다
 * 최대 1초씩 늦게 알아챈다. 같은 간격으로 자주 본다
 */
const POLL = [50];

/** 지금 이 화면에서 할 일: 판 끝, 고·스톱, 고르기, 흔들기, 내기, 뒤집기만. 없으면 null */
function actionable(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // 판 끝: 결과 띠가 먼저 뜨고, 띠가 사라진 뒤 결과 상자(data-outcome)가 뜬다
    if (
      document.querySelector("[data-outcome]") ||
      document.querySelector("[data-result-banner]")
    )
      return "done";
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].map((d) =>
      d.getAttribute("aria-label"),
    );
    if (dialogs.includes("미션 성공") || dialogs.includes("미션 실패"))
      return "mission";
    if (dialogs.includes("고 또는 스톱")) return "goStop";
    if (dialogs.includes("먹을 카드 고르기")) return "choose";
    if (dialogs.includes("흔들기·폭탄")) return "shake";
    const status = document.querySelector('[role="status"]')?.textContent ?? "";
    if (status.includes("내 차례")) return "play";
    if (status.includes("뒤집기만")) return "flip";
    return null;
  });
}

/** 손패 카드(내 차례면 단추, 아니면 그림) */
const hand = (page: Page) =>
  page.locator('section[aria-label="손패"] [data-card]');

/** 손패 한 장을 골랐다가 다시 눌러 낸다(처음 누르면 짝 맞는 바닥이 빛난다) */
async function playCard(page: Page, id?: string) {
  const card = id
    ? page.locator(`section[aria-label="손패"] [data-card="${id}"]`)
    : page.locator('section[aria-label="손패"] button').first();
  const chosen = (await card.getAttribute("data-card")) as string;
  const target = page.locator(
    `section[aria-label="손패"] [data-card="${chosen}"]`,
  );
  await target.click();
  await expect(page.getByRole("status")).toHaveText(/^내 차례 · /);
  await expect(page.getByRole("button", { name: "내기" })).toBeVisible();
  await target.click();
  // 낸 카드가 손에서 빠지거나, 흔들기·폭탄을 묻는다.
  await expect
    .poll(
      async () => {
        if ((await target.count()) === 0) return true;
        return (await actionable(page)) === "shake";
      },
      { intervals: POLL },
    )
    .toBe(true);
  return chosen;
}

/** 할 일 하나를 한다. 판이 끝났으면 false */
async function actOnce(page: Page, goStop: "고" | "스톱" = "스톱") {
  let what: string | null = null;
  await expect
    .poll(
      async () => {
        what = await actionable(page);
        return what;
      },
      { timeout: 30_000, intervals: POLL },
    )
    .not.toBeNull();
  switch (what as string | null) {
    case "done":
    case "mission":
      return false;
    case "goStop":
      await page.getByRole("button", { name: goStop, exact: true }).click();
      break;
    case "choose":
      await page
        .getByRole("dialog", { name: "먹을 카드 고르기" })
        .getByRole("button")
        .first()
        .click();
      break;
    case "shake":
      await page.getByRole("button", { name: "한 장만 내기" }).click();
      break;
    case "flip":
      await page.getByRole("button", { name: "뒤집기만" }).click();
      break;
    default:
      await playCard(page);
  }
  return true;
}

/** 판이 끝날 때까지 친다 */
async function playRound(page: Page) {
  for (let i = 0; i < 80; i++) if (!(await actOnce(page))) return;
  throw new Error("판이 끝나지 않는다");
}

/** 옵션에서 맞고·한 판·컴퓨터를 고르고 처음 화면으로 */
async function setOptions(page: Page, level = "입문") {
  await ready(page);
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "맞고(2명)" }).click();
  await page.getByRole("button", { name: "1판", exact: true }).click();
  await page.getByRole("button", { name: level, exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test.beforeEach(async ({ page, context }) => {
  await useTestSpeed(context);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
  });
});

test("고스톱: 게임 목록에서 들어가 입문 컴퓨터와 맞고 한 판을 끝까지 친다", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    console.log("PAGEERROR", e.message);
    errors.push(e.message);
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: /고스톱/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/gostop$/);
  await expect(page.getByRole("heading", { name: "고스톱" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("gostop-home.png") });
  await setOptions(page);
  // 시드를 붙여 늘 같은 패로 친다.
  await page.goto("/gostop?seed=7");
  await page.getByRole("button", { name: /나홀로 고스톱/ }).click();
  await expect(hand(page).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "바닥" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("gostop-start.png") });

  // 카드 한 장을 고르면 짝 맞는 바닥 카드가 빛나고, 한 번 더 누르면 낸다.
  await actOnce(page);
  await actOnce(page);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("gostop-play.png") });

  await playRound(page);
  // 결과 띠가 먼저 뜨고, 띠가 사라진 뒤에야 정산 상자가 뜬다(한꺼번에 뜨지 않는다)
  await expect(page.locator("[data-result-banner]")).toBeVisible();
  await expect(page.getByRole("region", { name: "판 정산" })).toHaveCount(0);
  await expect(page.locator("[data-result-banner]")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "판 정산" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("gostop-end.png") });

  // 「다시 하기」는 첫 화면으로 가지 않고 같은 규칙(맞고 2명, 손패 10장)으로 새 판을 바로 시작한다.
  // 씨앗을 새로 뽑으므로 판이 어떻게 흐를지(총통으로 바로 끝나기도 한다)는 보지 않고, 새로 나눈 손패와 규칙 줄만 본다.
  // 끝난 판은 손패를 여러 장 냈으니 10장이면 새로 나눈 것이다.
  await expect(hand(page)).not.toHaveCount(10);
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(page).toHaveURL(/\/gostop\?seed=7$/);
  await expect(hand(page)).toHaveCount(10);
  await expect(
    page.getByText("맞고 · 1/1판 · 7점부터 고 · 입문"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /나홀로 고스톱/ })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});

test("고스톱: 새로고침해도 하던 판을 이어서 친다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 저장은 화면 크기와 상관없다
  await page.goto("/gostop");
  await setOptions(page);
  await page.goto("/gostop?seed=11");
  await page.getByRole("button", { name: /나홀로 고스톱/ }).click();
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  const before = await hand(page).count();
  const played = await playCard(page);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await page.reload();
  await page.getByRole("button", { name: /하던 게임 이어하기/ }).click();
  await expect(hand(page)).toHaveCount(before - 1);
  await expect(
    page.locator(`section[aria-label="손패"] [data-card="${played}"]`),
  ).toHaveCount(0);
});

test(
  "고스톱 배우기: 첫 단원 미션을 틀렸다가 다시 해서 짝을 맞춘다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 배우기 진행은 크기와 상관없다(공통 배우기 화면의 배치는 tutorial.spec이 세 크기로 본다)
    await page.goto("/gostop");
    await page.getByRole("button", { name: /고스톱 배우기/ }).click();
    await expect(page.getByText("0/6")).toBeVisible();
    await page.getByRole("button", { name: /고스톱은 어떤 게임/ }).click();
    for (let i = 0; i < 2; i++)
      await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "바닥에 놓인다" }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "미션 시작" }).click();

    // 짝이 없는 7월 피를 내면 실패
    await playCard(page, "07p");
    await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "다시 하기" }).click();

    // 3월 광을 고르면 바닥 3월 피가 빛난다
    const gwang = page.locator('section[aria-label="손패"] [data-card="03g"]');
    await gwang.click();
    await expect(
      page.locator('section[aria-label="바닥"] [data-card="03p"]'),
    ).toHaveClass(/ring-sky-300/);
    await noOverflow(page);
    await page.screenshot({ path: info.outputPath("gostop-mission.png") });
    await gwang.click();
    await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByText("단원 완료!")).toBeVisible();
  },
);

test(
  "고스톱: 방장이 방을 만들고 친구가 링크로 들어와 맞고 한 판을 치고, 같은 방에서 한 판 더 친다(두 게임 모두 판 끝 검증)",
  { tag: "@only-desktop" },
  async ({ context }, info) => {
    // 데스크톱에서만 돌린다
    const host = await context.newPage();
    const guest = await context.newPage();
    const errors: string[] = [];
    for (const p of [host, guest])
      p.on("pageerror", (e) => errors.push(e.message));

    await host.goto("/gostop?net=local");
    await setOptions(host);
    await host.getByRole("button", { name: /다함께 고스톱/ }).click();
    await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
    await host.getByRole("button", { name: "방 만들기", exact: true }).click();
    const link = await host.locator("input[readonly]").inputValue();
    expect(link).toContain("/gostop");

    await guest.goto(link);
    await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
    await guest.getByRole("button", { name: "들어가기" }).click();
    await expect(host.getByText("철수")).toBeVisible();
    await host.getByRole("button", { name: "시작하기" }).click();
    await expect(hand(guest).first()).toBeVisible();

    // 참가자 화면에는 상대 손패가 뒷면으로만 보인다.
    await expect(guest.getByRole("img", { name: /뒷면 10장/ })).toBeVisible();

    /** 차례인 쪽이 친다. 두 화면 모두 판 끝이 될 때까지 */
    const playToEnd = async () => {
      for (let i = 0; i < 200; i++) {
        let who: Page | null = null;
        await expect
          .poll(
            async () => {
              for (const p of [host, guest]) {
                const what = await actionable(p);
                if (what && what !== "done") {
                  who = p;
                  return true;
                }
              }
              return (
                (await actionable(host)) === "done" &&
                (await actionable(guest)) === "done"
              );
            },
            { timeout: 30_000, intervals: POLL },
          )
          .toBe(true);
        if (!who) break;
        await actOnce(who);
      }
      await expect(guest.locator("[data-outcome]")).toBeVisible();
    };
    const verified = guest.getByText(/\[검증\] 나 — 문제없음/);
    await playToEnd();
    await guest.screenshot({ path: info.outputPath("gostop-online.png") });

    // 게임이 끝나면 기록이 공개되고, 참가자가 처음부터 다시 돌려 확인한다.
    await expect(verified).toHaveCount(1, { timeout: 10_000 });
    // 한 판 더: 방장만 고르고, 참가자는 기다린다. 누르면 두 기기 모두 새 게임(새로 섞어 나눈 패)으로 넘어간다.
    await expect(guest.locator("[data-rematch-wait]")).toHaveText(
      "방장이 고르는 중",
    );
    await expect(guest.getByRole("button", { name: "한 판 더" })).toHaveCount(
      0,
    );
    await host.getByRole("button", { name: "한 판 더" }).click();
    // 새 비밀 값을 모으고 다시 함께 섞는 동안 기다린다. 씨앗을 함께 새로 뽑으므로 새 게임이 총통(첫 손패에 같은 달
    // 넉 장)으로 바로 끝나기도 한다. 한 판짜리라 그러면 결과 상자가 사라지지 않고 곧바로 새 결과로 바뀐다. 그래서
    // 참가자 화면에서 결과 상자가 사라지거나 새 게임 검증 줄이 생기면 새 게임이 시작된 것으로 본다.
    await expect
      .poll(
        async () =>
          (await guest.locator("[data-outcome]").count()) === 0 ||
          (await verified.count()) >= 2,
        { timeout: 20_000, intervals: POLL },
      )
      .toBe(true);
    // 새로 나눈 손패(아직 아무도 내지 않았다). 총통으로 끝난 판도 손패는 그대로 보인다.
    for (const p of [host, guest]) await expect(hand(p)).toHaveCount(10);
    await expect(guest.getByRole("img", { name: /뒷면 10장/ })).toBeVisible();
    await playToEnd();
    // 새 게임도 처음부터 따로 검증한다.
    await expect(verified).toHaveCount(2, { timeout: 10_000 });
    await guest.screenshot({ path: info.outputPath("gostop-rematch.png") });

    // 방장이 나가면 참가자는 더 기다리지 않는다.
    await leaveOnline(host, "← 고스톱");
    await expect(guest.locator("[data-rematch-wait]")).toHaveCount(0);
    expect(errors).toEqual([]);
  },
);

test(
  "고스톱: 끝낸 판은 내 기록에 쌓이고 복기에서 한 걸음씩 다시 본다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 기록은 화면 크기와 상관없다
    await page.goto("/gostop");
    await setOptions(page);
    await page.goto("/gostop?seed=7");
    await page.getByRole("button", { name: /나홀로 고스톱/ }).click();
    await playRound(page);
    // 복기 기록이 실제로 쓰인 뒤에 떠난다.
    await page.waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          const open = indexedDB.open("mighty-review", 1);
          open.onerror = () => resolve(false);
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains("games")) {
              db.close();
              resolve(false);
              return;
            }
            const all = db.transaction("games").objectStore("games").getAll();
            all.onsuccess = () => {
              db.close();
              resolve(
                (all.result as { game: string; over: boolean }[]).some(
                  (g) => g.game === "gostop" && g.over,
                ),
              );
            };
          };
        }),
    );

    await page.goto("/profile?game=gostop");
    await expect(page.getByRole("tab", { name: "🎴 고스톱" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("판 승률")).toBeVisible();

    await page.goto("/review");
    await page.getByRole("button", { name: /고스톱 · 혼자/ }).click();
    await page.getByRole("button", { name: "처음" }).click();
    await expect(page.getByRole("status")).toContainText("1판 · 0/");
    await page.getByRole("button", { name: "한 걸음 앞으로" }).click();
    await expect(page.getByText(/다음 수: /)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: info.outputPath("gostop-review.png") });
  },
);

test(
  "고스톱 연출: 섞고 나눠 준 뒤, 낸 카드의 겉그림이 손패에서 바닥으로 날아가 내려앉는다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 데스크톱에서만 돌린다
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // 다른 시험은 움직임 줄이기로 연출을 건너뛴다. 이 시험만 켠다
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await speedUpAnimations(page);
    await page.goto("/gostop?seed=7");
    await page.getByRole("button", { name: /나홀로 고스톱/ }).click();

    // 화투 뒷면으로 섞고 나눠 주는 연출이 돌고, 끝나면 사라진다
    await expect(page.locator("[data-dealing]")).toHaveCount(1);
    await fastForwardUntil(
      page,
      async () => (await page.locator("[data-dealing]").count()) === 0,
      { step: 100 },
    );
    const flights = async () =>
      Number((await page.locator("[data-fx]").getAttribute("data-fx")) ?? 0);
    // 내 차례이고, 앞 장면(컴퓨터가 낸 카드)의 연출도 다 끝났을 때
    await fastForwardUntil(
      page,
      async () =>
        (await actionable(page)) === "play" && (await flights()) === 0,
      { step: 100 },
    );

    // 날기를 멈춰 두고 내면 겉그림이 날고, 도착한 카드는 내려앉을 때까지 가려 둔다
    const card = page.locator('section[aria-label="손패"] button').first();
    const id = (await card.getAttribute("data-card")) as string;
    await card.click();
    await speedUpAnimations(page, 0);
    await card.click();
    if (await page.getByRole("dialog", { name: "흔들기·폭탄" }).isVisible())
      await page.getByRole("button", { name: "한 장만 내기" }).click();
    await expect.poll(flights).toBeGreaterThan(0);
    const landed = page.locator(
      `[data-card="${id}"]:not(section[aria-label="손패"] *)`,
    );
    await expect(landed).toHaveCSS("visibility", "hidden");
    await page.screenshot({ path: info.outputPath("gostop-fx-play.png") });

    // 다시 돌리면 다 날고, 낸 카드가 바닥이나 먹은 패에 보인다
    await speedUpAnimations(page);
    await fastForwardUntil(page, async () => (await flights()) === 0, {
      step: 50,
    });
    await expect(landed).toHaveCSS("visibility", "visible");
    expect(errors).toEqual([]);
  },
);
