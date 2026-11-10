import { no3d } from "./cube";
import {
  expect,
  fastForwardUntil,
  type Page,
  SAVE_SCREENSHOTS,
  test,
} from "./test";

/**
 * 큐브 점수제 여러 판(docs/51 3-1, docs/47 9-3): 컴퓨터와 대결에서 3판(이긴 판)을 고르고, 판 사이 점수판과
 * 마지막 판 뒤 최종 순위를 본다. 나는 두지 않으니 컴퓨터가 판마다 이겨 두 판 만에 끝난다(2 > 0 + 남은 1판).
 * 시계를 감아(`fastForward`) 제한 시간(2×2 3분)까지 보낸다. `E2E_VIDEO=1`이면 녹화를 남긴다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.use({ video: process.env.E2E_VIDEO ? "on" : "off" });
test.beforeEach(({ page }) => no3d(page));

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

/** 판이 열려 컴퓨터 계획이 오면 제한 시간까지 감아 판 결과(순위표)를 기다린다 */
async function playRound(page: Page, project: string) {
  await expect(page.locator("[data-cube-race-phase]")).toHaveAttribute(
    "data-cube-race-phase",
    "inspect",
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await expect(
    page.locator('[data-cube-peer="bot1"][data-cube-bot-planned]'),
  ).toBeAttached({ timeout: SCRAMBLE_TIMEOUT });
  // 앞 판 결과 상자는 새 판에서 닫히고, 1280×720에서 큐브가 잘리지 않는다
  await expect(page.locator("[data-cube-result]")).toHaveCount(0);
  if (project === "desktop") {
    const stage = await page.locator("[data-cube-stage]").boundingBox();
    expect(stage).toBeTruthy();
    if (stage) expect(stage.y + stage.height).toBeLessThanOrEqual(720);
  }
  const result = page.locator("[data-cube-result]");
  await fastForwardUntil(
    page,
    async () =>
      (await result.isVisible()) &&
      (await result.getAttribute("data-cube-result")) === "final",
    { step: 5_000, timeout: 60_000 },
  );
}

test(
  "컴퓨터와 대결: 점수제 3판은 판 사이 점수판을 보이고, 끝나면 최종 순위",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    // 데스크톱·휴대폰 세로로 본다
    test.setTimeout(150_000);
    await page.clock.install();
    await page.goto("/cube/vs");
    await page.getByRole("button", { name: "초고수", exact: true }).click();
    await page.locator('[data-cube-vs-rounds="3"]').click();
    await expect(page.locator("[data-cube-vs-scoring]")).toHaveValue("wins");
    await shot(page, "match-setup", info.project.name);
    await page.locator("[data-cube-vs-start]").click();

    // 1판: 컴퓨터가 이기면 점수판 「점수 · 1/3판」, 다음 판 단추
    await playRound(page, info.project.name);
    const board = page.locator("[data-cube-match-board]");
    await expect(board).toHaveAttribute("data-cube-match-board", "between");
    await expect(board).toContainText("점수 · 1/3판");
    await expect(board.locator('[data-cube-match-row="bot1"]')).toHaveAttribute(
      "data-cube-match-points",
      "1",
    );
    await expect(board.locator('[data-cube-match-row="me"]')).toHaveAttribute(
      "data-cube-match-points",
      "0",
    );
    // 구간 표와 함께 결과 상자 안에 있다
    await expect(
      page.locator("[data-cube-result] [data-cube-race-splits]"),
    ).toBeVisible();
    await shot(page, "match-between", info.project.name);

    // 2판: 컴퓨터 2승이면 남은 1판으로 따라잡을 수 없어 끝난다
    await page.locator("[data-cube-next]").click();
    await playRound(page, info.project.name);
    await expect(board).toHaveAttribute("data-cube-match-board", "over");
    await expect(board).toContainText("최종 순위");
    await expect(board.locator('[data-cube-match-row="bot1"]')).toHaveAttribute(
      "data-cube-match-place",
      "1",
    );
    await expect(board.locator('[data-cube-match-row="bot1"]')).toHaveAttribute(
      "data-cube-match-points",
      "2",
    );
    await expect(page.locator("[data-cube-next]")).toHaveCount(0);
    await expect(page.locator("[data-cube-again]")).toHaveText("새 경기");
    await shot(page, "match-final", info.project.name);
  },
);
