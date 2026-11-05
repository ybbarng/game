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
    await page.getByRole("button", { name: /컴퓨터와 시작/ }).click();
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
    await page.getByRole("button", { name: /컴퓨터와 시작/ }).click();
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
  await page.getByRole("button", { name: /컴퓨터와 시작/ }).click();
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
