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
    trade: true,
    seasonal: true,
    sky: "seasons",
  },
  level: 0,
  seed: 11,
  round: 9,
  stars: [
    // 나: 오리온 완성(3단·3단·큰 정거장), 페가수스 하나, 독수리 하나는 맡김
    { square: 9, owner: 0, level: 3 },
    { square: 10, owner: 0, level: 3 },
    { square: 27, owner: 0, level: 4 },
    { square: 1, owner: 0 },
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
  await expect(board(page).locator('[data-tier="pair"]')).toHaveCount(2);
  await expect(board(page).locator('[data-tier="owned"]')).toHaveCount(2);
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
  await shot(page, info.outputPath("galaxy-card.png"));

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
