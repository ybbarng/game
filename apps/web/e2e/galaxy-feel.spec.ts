import { useTestSpeed } from "./fast";
import {
  expect,
  fastForwardUntil,
  type Page,
  ready,
  SAVE_SCREENSHOTS,
  test,
} from "./test";

/**
 * 은하 한 바퀴 칸 모습과 칸 카드(docs/48 15-9). 이용료 단계가 섞인 장면 하나로
 * 칸 모양(주인 띠·둘·완성 빛 테·정거장 점·큰 정거장 고리·맡김), 계절 표시, 칸 카드, 주사위 구르는 도중을 본다
 */

/** 사계절 하늘(g4 섞인 배치) 칸: 오리온 9·10·27, 큰개 14·15(시리우스)·29, 거문고 11·25·26, 페가수스 1·2·19, 독수리 13·30·31 */
const SCENARIO = {
  rules: {
    players: 2,
    length: "standard",
    takeover: true,
    seasonal: true,
    sky: "seasons",
  },
  level: 0,
  seed: 11,
  round: 9,
  cash: [950, 450],
  stars: [
    // 나: 오리온 완성(3단·3단·큰 정거장), 페가수스 하나, 독수리 하나는 맡김
    { square: 9, owner: 0, level: 3 },
    { square: 10, owner: 0, level: 3 },
    { square: 27, owner: 0, level: 4 },
    { square: 1, owner: 0 },
    { square: 2, owner: 0 },
    { square: 13, owner: 0, mortgaged: true },
    // 컴퓨터: 큰개 둘(선 하나), 거문고 완성(2단)
    { square: 14, owner: 1 },
    { square: 15, owner: 1 },
    { square: 11, owner: 1, level: 2 },
    { square: 25, owner: 1, level: 2 },
    { square: 26, owner: 1, level: 2 },
  ],
};

const board = (page: Page) => page.locator("[data-galaxy-board]");
const shot = async (page: Page, path: string) => {
  if (SAVE_SCREENSHOTS) await page.screenshot({ path });
};

test.describe("단계가 섞인 장면", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((scenario) => {
      sessionStorage.setItem("mighty-splash-seen", "1");
      localStorage.removeItem("galaxy-save");
      (window as { __galaxyScenario?: unknown }).__galaxyScenario = scenario;
    }, SCENARIO);
  });

  test("은하 한 바퀴 칸: 이용료 단계마다 모양이 다르고, 누르면 칸 카드가 판 가운데에 크게 뜬다", async ({
    page,
  }, info) => {
    await page.goto("/galaxy");
    await ready(page);
    await page.getByRole("button", { name: /나홀로 은하 한 바퀴/ }).click();
    await expect(page.locator("[data-roll]")).toBeVisible();

    // 단계별 모양: 완성 칸은 빛 테(오리온 셋·거문고 셋), 둘은 큰개 둘, 큰 정거장 고리 하나
    await expect(board(page).locator("[data-complete]")).toHaveCount(6);
    await expect(board(page).locator('[data-tier="pair"]')).toHaveCount(4);
    await expect(board(page).locator('[data-tier="owned"]')).toHaveCount(1);
    await expect(
      board(page).locator('[data-square="27"] [data-level="4"]'),
    ).toHaveCount(1);
    await expect(
      board(page).locator('[data-square="9"] [data-level="3"]'),
    ).toHaveCount(1);
    // 별 칸마다 계절 표시
    await expect(board(page).locator("[data-season-mark]")).toHaveCount(24);
    await shot(page, info.outputPath("galaxy-tiers.png"));

    // 남의 별(시리우스)을 누르면 칸 카드: 별자리·계절·주인·지금 이용료·이용료 표, 같은 별자리 칸이 함께 밝다
    await page.locator('[data-square="15"]').click();
    const card = page.locator("[data-square-card]");
    await expect(card).toBeVisible();
    await expect(card).toContainText("시리우스");
    await expect(card).toContainText("큰개자리");
    await expect(card.locator("[data-card-season]")).toContainText("겨울");
    await expect(card.locator("[data-card-tier]")).toContainText("1.5배");
    await expect(card.locator("[data-card-rent]")).toBeVisible();
    await expect(board(page).locator("[data-kin]")).toHaveCount(2);
    // 휴대폰 세로에서도 스크롤 없이 한 번에 보인다. 별 이야기는 두 줄까지, 「더 보기」로 편다
    if (info.project.name !== "phone-landscape")
      expect(
        await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
      ).toBe(true);
    await expect(card.locator('[data-star-story="short"]')).toBeVisible();
    await shot(page, info.outputPath("galaxy-card.png"));
    await card.locator("[data-star-more]").click();
    await expect(card.locator('[data-star-story="open"]')).toBeVisible();

    // 내 완성 별자리 칸 카드: 완성 · 이용료 2배 · 큰 정거장
    await page.locator('[data-square="27"]').click();
    await expect(card.locator("[data-card-tier]")).toContainText(
      "완성 · 이용료 2배",
    );
    await expect(card.locator("[data-card-tier]")).toContainText("큰 정거장");

    // 특수칸도 설명 카드
    await page.locator('[data-square="16"]').click();
    await expect(card).toContainText("관측 지원금");
    await shot(page, info.outputPath("galaxy-card-corner.png"));
    await page.locator("[data-card-close]").click();
    await expect(card).toHaveCount(0);

    // 정거장 관리 설명
    await page.getByText("정거장 관리").click();
    await expect(page.locator("[data-manage-help]")).toBeVisible();

    // 판 끝: 판 돌아보기(1등과 항목별 차이, 놓친 기회). 나는 기권해 꼴찌라 1등 컴퓨터와 견준다
    await page.getByRole("button", { name: "기권" }).click();
    await page.getByRole("button", { name: "기권하기" }).click();
    const recap = page.locator("[data-recap]");
    await expect(recap).toBeVisible();
    await expect(
      recap.locator('[data-recap-row="completeBonus"]'),
    ).toContainText("✦180"); // 완성 덤은 그 별자리 값(g5, 오리온 180)
    // 놓친 기회: 페가수스 2/3, 1등보다 많이 남긴 별빛
    const missed = recap.locator("[data-recap-missed]");
    await expect(missed).toContainText("2/3에서 멈춘 별자리 1개(페가수스자리)");
    await expect(missed).toContainText("쓰지 않은 별빛 ✦950");
  });

  test("은하 한 바퀴 주사위: 둘이 던져져 튕기며 구르다 결과 눈으로 멈춘다", async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.goto("/galaxy");
    await ready(page);
    await page.getByRole("button", { name: /나홀로 은하 한 바퀴/ }).click();
    await expect(page.locator("[data-roll]")).toBeVisible();
    await page.locator("[data-roll]").click();
    // 구르는 도중: 정육면체 둘이 떠 있다(눈 표시는 멈춘 뒤에만)
    await fastForwardUntil(
      page,
      async () => (await page.locator("[data-dice-rolling]").count()) > 0,
      { step: 50 },
    );
    await expect(page.locator("[data-die3d]")).toHaveCount(2);
    await expect(page.locator("[data-dice]")).toHaveCount(0);
    await page.clock.runFor(350);
    await shot(page, info.outputPath("galaxy-dice-rolling.png"));
    // 멈추면 결과 눈이 붙는다
    await fastForwardUntil(
      page,
      async () => (await page.locator("[data-dice]").count()) > 0,
      { step: 100 },
    );
    const [a, b] = (
      (await page.locator("[data-dice]").getAttribute("data-dice")) ?? ""
    )
      .split(",")
      .map(Number);
    await expect(page.locator("[data-die3d]").first()).toHaveAttribute(
      "data-die3d",
      String(a),
    );
    await expect(page.locator("[data-die3d]").nth(1)).toHaveAttribute(
      "data-die3d",
      String(b),
    );
  });
});

/**
 * 실제 판을 끝까지 둔 판 돌아보기(스크린샷용). 2명·짧은 판·입문, 씨앗 고정, 살 수 있으면 사고 입찰은 내지 않는다.
 * 판 하나를 끝까지 두어 길어서(약 1분) 스크린샷을 찍을 때만 돈다. 계산은 단위 시험(recap.test.ts)이 맡는다
 */
test("은하 한 바퀴 판 돌아보기: 끝까지 둔 판에서 1등과의 차이와 놓친 기회", async ({
  page,
  context,
}, info) => {
  test.skip(!SAVE_SCREENSHOTS, "스크린샷을 찍을 때만(판 하나를 끝까지 둔다)");
  test.setTimeout(240_000);
  await useTestSpeed(context);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.removeItem("galaxy-save");
    (window as { __galaxySeed?: number }).__galaxySeed = 20261105;
  });
  await page.goto("/galaxy");
  await ready(page);
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "2명", exact: true }).click();
  await page.getByRole("button", { name: "짧은 판", exact: true }).click();
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 은하 한 바퀴/ }).click();
  const over = page.getByRole("button", { name: "다시 하기" });
  const actions = [
    page.locator("[data-roll]"),
    page.locator("[data-buy]:enabled"),
    page.locator("[data-pass]"),
    page.locator("[data-bid-skip]"),
    page.locator("[data-end-turn]"),
    page.locator("[data-debt-plan]"),
    page.locator("[data-decline-takeover]"),
  ];
  const any = actions
    .reduce((a, b) => a.or(b))
    .or(over)
    .first();
  for (let i = 0; i < 600; i++) {
    await expect(any).toBeVisible({ timeout: 20_000 });
    if (await over.isVisible()) break;
    for (const a of actions)
      if (await a.isVisible()) {
        await a.click();
        break;
      }
  }
  await expect(over).toBeVisible();
  // 결과 띠가 사라진 뒤 결과 상자·돌아보기가 뜬다
  const recap = page.locator("[data-recap]");
  await expect(recap).toBeVisible();
  await expect(page.locator("[data-result-banner]")).toHaveCount(0);
  await recap.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("galaxy-recap.png") });
});

/** 넷이 탄 우주선(docs/48 7-1): 나와 컴퓨터 1이 6번 칸에 함께, 나는 1·2를 굴려 왼쪽 아래 모퉁이(8)를 돌아 9까지 */
const SHIPS_SCENARIO = {
  rules: { players: 4, length: "standard", takeover: true, sky: "seasons" },
  level: 0,
  seed: 3,
  positions: [6, 6, 12, 20],
  dice: [[1, 2]],
};

test.describe("우주선 말", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((scenario) => {
      sessionStorage.setItem("mighty-splash-seen", "1");
      localStorage.removeItem("galaxy-save");
      (window as { __galaxyScenario?: unknown }).__galaxyScenario = scenario;
    }, SHIPS_SCENARIO);
  });

  test("자리마다 모양이 다른 우주선, 한 칸에 둘이면 비켜 서고, 움직일 때 가는 쪽으로 기수를 돌리며 엔진 빛을 낸다", async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.goto("/galaxy");
    await ready(page);
    await page.getByRole("button", { name: /나홀로 은하 한 바퀴/ }).click();
    await expect(page.locator("[data-roll]")).toBeVisible();

    const ship = (seat: number) => board(page).locator(`[data-ship="${seat}"]`);
    // 넷 모두 모양이 다르다(색만으로 가르지 않는다)
    const shapes = await board(page)
      .locator("[data-ship] svg[data-ship-shape]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-ship-shape")));
    expect(new Set(shapes)).toEqual(
      new Set(["rocket", "saucer", "probe", "ring"]),
    );
    // 같은 칸의 둘은 겹치지 않는다
    const [a, b] = [await ship(0).boundingBox(), await ship(1).boundingBox()];
    expect(a && b && a.x + a.width <= b.x + 1).toBe(true);
    // 멈춰 있으면 떠 있고 엔진 빛이 없다. 아래 변이라 왼쪽을 본다
    await expect(ship(0)).toHaveAttribute("data-ship-heading", "270");
    await expect(ship(0).locator(".galaxy-ship-hover")).toHaveCount(1);
    await expect(ship(0).locator("[data-ship-flame]")).toHaveCount(0);
    await shot(page, info.outputPath("galaxy-ships-board.png"));
    if (SAVE_SCREENSHOTS) {
      // 우주선 넷을 크게 모아 본다(판 위 그림을 그대로 옮겨 키운다)
      await page.evaluate(() => {
        const wrap = document.createElement("div");
        wrap.setAttribute("data-ship-gallery", "");
        wrap.style.cssText =
          "position:fixed;inset:0;z-index:9999;display:flex;flex-wrap:wrap;align-content:center;justify-content:center;gap:24px;background:#0b1020";
        for (const svg of document.querySelectorAll(
          "[data-galaxy-board] [data-ship] svg[data-ship-shape]",
        )) {
          const big = svg.cloneNode(true) as SVGElement;
          big.removeAttribute("class");
          big.setAttribute("width", "140");
          big.setAttribute("height", "140");
          big.style.filter = "drop-shadow(0 6px 6px rgba(0,0,0,0.8))";
          wrap.append(big);
        }
        document.body.append(wrap);
      });
      await page.screenshot({
        path: info.outputPath("galaxy-ships-gallery.png"),
      });
      await page.evaluate(() =>
        document.querySelector("[data-ship-gallery]")?.remove(),
      );
    }

    // 굴리면 모퉁이(8)를 돌아 위를 보고 미끄러지는 도중에 꽁무니 빛이 난다.
    // 시계를 멈춰 두고 시험이 감을 때만 흐르게 한다(실제 시간으로 흘러 도중을 놓치지 않게)
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    await page.locator("[data-roll]").click();
    await fastForwardUntil(
      page,
      async () =>
        (await ship(0).getAttribute("data-ship-thrust")) !== null &&
        (await ship(0).getAttribute("data-ship-heading")) === "0",
      { step: 20 },
    );
    await expect(ship(0).locator("[data-ship-flame]")).toHaveCount(1);
    await expect(ship(0).locator(".galaxy-ship-hover")).toHaveCount(0);
    // 움직이는 동안 자리는 계산한 값 그대로(CSS가 뒤따라 미끄러지지 않는다)
    expect(
      await ship(0).evaluate(
        (el) =>
          Math.abs(
            Number.parseFloat(getComputedStyle(el).left) -
              (Number.parseFloat((el as HTMLElement).style.left) / 100) *
                (el.parentElement?.clientWidth ?? 0),
          ) < 1,
      ),
    ).toBe(true);
    if (SAVE_SCREENSHOTS) {
      // 칸 사이 가운데쯤(칸 하나 = 판의 1/9)까지 감고, 기수가 다 돈 뒤에 찍는다(도는 CSS 연출은 실제 시간으로 흐른다)
      const top = async () =>
        Number.parseFloat(
          await ship(0).evaluate((el) => (el as HTMLElement).style.top),
        );
      const from = await top();
      await fastForwardUntil(page, async () => (await top()) < from - 4, {
        step: 10,
      });
      await page.waitForFunction(() => {
        const svg = document.querySelector(
          '[data-galaxy-board] [data-ship="0"] svg[data-ship-shape]',
        );
        return (
          getComputedStyle(svg?.parentElement as Element).transform ===
          "matrix(1, 0, 0, 1, 0, 0)"
        );
      });
      await page.screenshot({
        path: info.outputPath("galaxy-ships-moving.png"),
      });
    }
    // 다 오면 9번 칸에서 위를 본 채 다시 떠 있다
    await fastForwardUntil(
      page,
      async () =>
        (await ship(0).getAttribute("data-ship-square")) === "9" &&
        (await ship(0).locator(".galaxy-ship-hover").count()) === 1,
      { step: 100 },
    );
    await expect(ship(0)).toHaveAttribute("data-ship-heading", "0");
    await expect(ship(0).locator("[data-ship-flame]")).toHaveCount(0);
  });

  test("움직임 줄이기면 떠 있거나 엔진 빛 없이 방향만 바뀐다", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/galaxy");
    await ready(page);
    await page.getByRole("button", { name: /나홀로 은하 한 바퀴/ }).click();
    await expect(page.locator("[data-roll]")).toBeVisible();
    const me = board(page).locator('[data-ship="0"]');
    await expect(me.locator(".galaxy-ship-hover")).toHaveCount(0);
    await page.locator("[data-roll]").click();
    await expect(me).toHaveAttribute("data-ship-square", "9");
    await expect(me).toHaveAttribute("data-ship-heading", "0");
    await expect(board(page).locator("[data-ship-flame]")).toHaveCount(0);
    await expect(board(page).locator("[data-ship-thrust]")).toHaveCount(0);
  });
});
