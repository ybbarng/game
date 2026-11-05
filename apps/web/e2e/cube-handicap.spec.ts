import { inputReady, keysFor, no3d, shot, useNotationKeys } from "./cube";
import { expect, fastForwardUntil, type Page, test } from "./test";

/**
 * 큐브 대결 핸디캡(docs/51 4절, docs/47 9-5): 컴퓨터와 대결에서 내 핸디캡을 고르고 한 판 한다.
 * 섞기 글을 읽어 거꾸로 쳐서 맞춘다(「표기」 키). 시계는 흐르게 두고, 기다릴 곳만 `fastForward`로 감는다.
 * 컴퓨터는 초고수: `fastForward` 한 번에 컴퓨터 수가 하나씩만 나가서, 수가 많은 입문은 감는 동안 제한 시간을 넘긴다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.beforeEach(async ({ page }) => {
  await no3d(page);
  await useNotationKeys(page);
});

function inverse(alg: string): string {
  return alg
    .trim()
    .split(/\s+/)
    .reverse()
    .map((t) =>
      t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : `${t}'`,
    )
    .join(" ");
}

async function race(page: Page) {
  await expect(page.locator("[data-cube-race-phase]")).toHaveAttribute(
    "data-cube-race-phase",
    "race",
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await inputReady(page);
  return (await page
    .locator("[data-cube-scramble]")
    .getAttribute("data-cube-scramble")) as string;
}

async function solve(page: Page, scramble: string) {
  for (const key of keysFor(inverse(scramble))) await page.keyboard.press(key);
  await expect(page.locator('[data-cube-peer="me"]')).toHaveAttribute(
    "data-cube-peer-status",
    "done",
  );
}

async function finalResult(page: Page) {
  const result = page.locator("[data-cube-result]");
  await fastForwardUntil(
    page,
    async () => (await result.getAttribute("data-cube-result")) === "final",
    { step: 5_000, timeout: 90_000 },
  );
  return result;
}

async function stageFits(page: Page, project: string) {
  if (project !== "desktop") return;
  const stage = await page.locator("[data-cube-stage]").boundingBox();
  expect(stage).toBeTruthy();
  if (stage) expect(stage.y + stage.height).toBeLessThanOrEqual(720);
}

test("컴퓨터와 대결: 출발 늦추기·목표를 고르면 k초 전 수가 막히고 목표에서 끝나며, 결과 상자에 핸디캡이 적힌다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "데스크톱·휴대폰 세로로 본다",
  );
  test.setTimeout(150_000);
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.getByRole("button", { name: "초고수", exact: true }).click();
  await page.locator("[data-cube-vs-delay]").selectOption("8");
  await page.locator("[data-cube-vs-goal]").selectOption("layer1");
  await page.getByLabel("15초 살펴보기").uncheck();
  await shot(page, "handicap-setup", info.project.name);
  await page.locator("[data-cube-vs-start]").click();

  const scramble = await race(page);
  const mine = page.locator("[data-cube-my-handicap]");
  await expect(mine).toContainText("출발까지");
  await expect(mine).toContainText("목표: 첫 층");
  await stageFits(page, info.project.name);
  // 출발 전 수는 막힌다(살펴보기처럼 알림만)
  await page.keyboard.press("KeyR");
  await expect(page.locator("[data-cube-notice]")).toContainText(
    "늦게 출발하는 판",
  );
  await expect(page.locator("[data-cube-moves]")).toHaveText("0");
  await shot(page, "handicap-wait", info.project.name);
  await fastForwardUntil(
    page,
    async () => (await mine.getAttribute("data-cube-start-wait")) === "0",
    { step: 500 },
  );

  await solve(page, scramble);
  // 첫 층에 닿은 수에서 끝난다(섞기를 거꾸로 두면 마지막 수에서 닿을 수도 있다)
  await expect(
    page.locator('[data-cube-peer="me"] [data-cube-peer-stages]'),
  ).toHaveAttribute("data-cube-peer-stages", /layer1/);
  const result = await finalResult(page);
  const row = result.locator('[data-cube-rank="me"]');
  await expect(row).toContainText("+8초 늦게 출발");
  await expect(row).toContainText("목표: 첫 층");
  await shot(page, "handicap-result", info.project.name);
});

test("컴퓨터와 대결: 내 평균 대비로 순위를 매기고 결과 상자·점수판에 함께 적는다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "데스크톱·휴대폰 세로로 본다",
  );
  test.setTimeout(150_000);
  // 이 기기 2×2 혼자 맞추기 기록: 평균 60초
  await page.addInitScript(() => {
    const rec = (i: number) => ({
      at: 1_700_000_000_000 + i,
      n: 2,
      mode: "solo",
      ms: 60_000,
      penalty: 0,
      moves: 30,
      scramble: "",
    });
    localStorage.setItem(
      "cube.records.v1",
      JSON.stringify({ "solo-2": [rec(3), rec(2), rec(1)] }),
    );
  });
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.getByRole("button", { name: "초고수", exact: true }).click();
  await page.locator('[data-cube-vs-rounds="3"]').click();
  await page.locator("[data-cube-vs-score]").selectOption("avg");
  await expect(page.locator("[data-cube-vs-average]")).toContainText("1:00.00");
  await expect(page.locator("[data-cube-vs-goal]")).toHaveCount(0);
  await page.getByLabel("15초 살펴보기").uncheck();
  await page.locator("[data-cube-vs-start]").click();

  const scramble = await race(page);
  await stageFits(page, info.project.name);
  await solve(page, scramble);
  const result = await finalResult(page);
  // 평균 60초보다 훨씬 빠르니 −로, 평균이 없는 컴퓨터는 첫 판이 기준이라 0%
  await expect(result.locator('[data-cube-ratio="me"]')).toHaveText(/^−\d+%$/);
  await expect(result.locator('[data-cube-ratio="bot1"]')).toHaveText("0%");
  await expect(result.locator('[data-cube-rank="bot1"]')).toContainText(
    "기준: 첫 판",
  );
  await expect(result).toContainText("1위예요");
  const board = result.locator("[data-cube-match-board]");
  await expect(board).toContainText("내 평균 대비");
  await expect(board.locator('[data-cube-match-row="me"]')).toHaveAttribute(
    "data-cube-match-points",
    "1",
  );
  await shot(page, "handicap-average", info.project.name);
});

test("온라인 대기실: 방장이 사람마다 출발 늦추기·목표를 고르고, 평균 대비면 목표 칸이 빠진다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "온라인 대결은 키보드 기기만");
  await page.goto("/cube/online?net=local");
  await page.locator("[data-cube-enter]").click();
  const panel = page.locator("[data-cube-handicap]");
  await expect(panel).toContainText("친구끼리 믿는 모드");
  const me = (await panel
    .locator("[data-cube-handicap-row]")
    .first()
    .getAttribute("data-cube-handicap-row")) as string;
  await panel.locator(`[data-cube-handicap-delay="${me}"]`).selectOption("5");
  await panel
    .locator(`[data-cube-handicap-goal="${me}"]`)
    .selectOption("layer2");
  await expect(panel.locator(`[data-cube-handicap-goal="${me}"]`)).toHaveValue(
    "layer2",
  );
  await shot(page, "handicap-lobby", info.project.name);
  await panel.locator("[data-cube-handicap-score]").selectOption("avg");
  await expect(panel.locator("[data-cube-handicap-goal]")).toHaveCount(0);
  await expect(panel.locator(`[data-cube-handicap-delay="${me}"]`)).toHaveValue(
    "5",
  );
});
