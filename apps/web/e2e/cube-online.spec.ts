import {
  expect,
  fastForwardUntil,
  type Page,
  SAVE_SCREENSHOTS,
  speedUpAnimations,
  test,
} from "./test";

/**
 * 큐브 컴퓨터와 경주(/cube/vs)·온라인 경주(/cube/online, docs/47 9·10절).
 * 컴퓨터가 맞추는 시간을 실제로 기다리지 않는다: 시계를 감아(`fastForward`) 컴퓨터가 먼저 맞춰 결과 상자가 뜨는 것을 조건으로 본다.
 * 키 입력은 3D 그림과 따로 준비된다(`[data-cube-stage][data-input-ready]`). WebGL이 없는 환경에서도 입력 준비로 기다린다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

test("컴퓨터와 경주: 2×2 입문 컴퓨터가 먼저 맞추면 결과 상자가 뜬다", async ({
  page,
}, info) => {
  await page.clock.install();
  await page.goto("/cube/vs");
  await speedUpAnimations(page);
  await expect(page.locator("[data-cube-vs-size]")).toHaveValue("2");
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await shot(page, "vs-setup", info.project.name);
  await page.locator("[data-cube-vs-start]").click();

  const view = page.locator("[data-cube-race-phase]");
  // 섞기(워커)가 끝나 살펴보기가 열리고 키 입력이 준비된다
  await expect(view).toHaveAttribute("data-cube-race-phase", "inspect", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await expect(
    page.locator("[data-cube-stage][data-input-ready]"),
  ).toBeVisible();
  const scramble =
    (await page
      .locator("[data-cube-scramble]")
      .getAttribute("data-cube-scramble")) ?? "";
  expect(scramble.split(" ").length).toBeGreaterThan(3);
  await shot(page, "vs-inspect", info.project.name);
  // 계획(워커)이 온 뒤에 감는다. 먼저 감으면 계획이 늦게 온 만큼 컴퓨터가 늦게 시작한다
  await expect(
    page.locator('[data-cube-peer="bot1"][data-cube-bot-planned]'),
  ).toBeAttached({ timeout: SCRAMBLE_TIMEOUT });

  // 결과 상자는 누가 맞추거나 판이 끝나면 뜬다. 2×2 제한 시간 3분은 입문 컴퓨터 계획의 최대 길이(약 82초)보다
  // 넉넉해 씨앗과 상관없이 컴퓨터가 먼저 맞춘다(room.ts TIME_LIMIT_SEC)
  const result = page.locator("[data-cube-result]");
  await fastForwardUntil(page, () => result.isVisible(), {
    step: 1_000,
    timeout: 60_000,
  });
  await expect(result).toContainText("컴퓨터 1");
  await expect(page.locator('[data-cube-peer="bot1"]')).toHaveAttribute(
    "data-cube-peer-status",
    "done",
  );
  await shot(page, "vs-bot-done", info.project.name);

  // 제한 시간까지 감으면 판이 끝나 순위표가 나온다
  await fastForwardUntil(
    page,
    async () => (await result.getAttribute("data-cube-result")) === "final",
    { step: 5_000, timeout: 60_000 },
  );
  await expect(page.locator('[data-cube-rank="bot1"]')).toContainText(
    "컴퓨터 계획 확인",
  );
  await expect(page.locator("[data-cube-again]")).toBeVisible();
  await shot(page, "vs-final", info.project.name);

  if (SAVE_SCREENSHOTS && info.project.name === "desktop") {
    // 온라인 대기실(같은 탭 연결, 방장 혼자 + 컴퓨터)
    await page.goto("/cube/online?net=local");
    await page.locator("[data-cube-enter]").click();
    await expect(page.locator("[data-cube-players] li")).toHaveCount(1);
    await page.getByRole("button", { name: "컴퓨터 더하기" }).click();
    await expect(page.locator("[data-cube-players] li")).toHaveCount(2);
    await shot(page, "online-lobby", info.project.name);
  }
});

/**
 * 4×4 컴퓨터(축소법 + 3×3 사람 해법)도 같은 길로 돈다. 계획은 워커에서 만들고, 입문은 3~4분 걸려
 * 시계를 크게 감는다. 화면 크기와 상관없는 길이라 desktop 하나로 본다
 */
test("컴퓨터와 경주: 4×4 입문 컴퓨터가 맞추면 결과 상자가 뜬다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "크기만 다른 같은 길");
  test.setTimeout(150_000);
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.locator("[data-cube-vs-size]").selectOption("4");
  await expect(page.locator("[data-cube-vs-speed]")).toContainText("1.5수");
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await page.locator("[data-cube-vs-start]").click();

  const view = page.locator("[data-cube-race-phase]");
  await expect(view).toHaveAttribute("data-cube-race-phase", "inspect", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  // 계획(워커)이 온 뒤에 감는다. 먼저 감으면 계획이 늦게 온 만큼 컴퓨터가 늦게 시작한다
  await expect(
    page.locator('[data-cube-peer="bot1"][data-cube-bot-planned]'),
  ).toBeAttached({ timeout: SCRAMBLE_TIMEOUT });
  const result = page.locator("[data-cube-result]");
  await fastForwardUntil(page, () => result.isVisible(), {
    step: 2_000,
    timeout: 120_000,
  });
  await expect(result).toContainText("컴퓨터 1");
  await expect(page.locator('[data-cube-peer="bot1"]')).toHaveAttribute(
    "data-cube-peer-status",
    "done",
  );
  await shot(page, "vs-4x4-bot-done", info.project.name);
});

/**
 * 여러 탭 온라인 경주(같은 브라우저 탭끼리 `?net=local`). 이 맥에서는 돌리지 않는다: `CUBE_MULTI=1`일 때만.
 * 방장이 방을 만들고 손님이 초대 링크로 들어와, 컴퓨터 하나를 더해 판을 열면 세 참가자가 모두 보인다.
 */
test("온라인 경주: 방장과 손님 두 탭 + 컴퓨터", async ({ context }, info) => {
  test.skip(!process.env.CUBE_MULTI, "여러 탭 시험은 CUBE_MULTI=1일 때만");
  test.skip(info.project.name !== "desktop", "키보드 기기만 참가");
  const host = await context.newPage();
  await host.goto("/cube/online?net=local");
  await host.locator("[data-cube-enter]").click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("room=");

  const guest = await context.newPage();
  await guest.goto(link);
  await guest.locator("[data-cube-enter]").click();
  await expect(host.locator("[data-cube-players] li")).toHaveCount(2);
  await host.getByRole("button", { name: "컴퓨터 더하기" }).click();
  await expect(guest.locator("[data-cube-players] li")).toHaveCount(3);
  await host.locator("[data-cube-start]").click();
  for (const p of [host, guest])
    await expect(p.locator("[data-cube-race-phase]")).toHaveAttribute(
      "data-cube-race-phase",
      "inspect",
      { timeout: SCRAMBLE_TIMEOUT },
    );
  await expect(guest.locator("[data-cube-peer]")).toHaveCount(3);
});
