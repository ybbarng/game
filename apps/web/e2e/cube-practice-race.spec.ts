import { inputReady, keysFor, no3d, shot, useNotationKeys } from "./cube";
import { expect, fastForwardUntil, type Page, test } from "./test";

/**
 * 같이 하기의 공식 연습 대결(docs/47 16-14). 같은 문제·기록으로 다시 계산·위조 기록 무효·컴퓨터 계획은 단위 시험
 * (`practice/versus.test.ts`, `online/practice-race.test.ts`)이 보고, 여기서는 실제 화면 한 판씩만 본다:
 * 컴퓨터와 대결(입문 컴퓨터 하나, 2층)과 친구와 대결(`?net=local` 두 탭, `CUBE_MULTI=1`일 때만).
 */

test.beforeEach(async ({ page }) => {
  await no3d(page);
  await useNotationKeys(page);
});

const view = (page: Page) => page.locator("[data-cube-practice-race]");

/** 지금 문제가 i번째(0부터)일 때까지 기다려 공식을 돌려준다 */
async function atProblem(page: Page, i: number): Promise<string> {
  await expect(view(page)).toHaveAttribute("data-practice-index", String(i));
  return (await view(page).getAttribute("data-practice-answer")) as string;
}

/** 10문제를 친다. `missAt`번째 문제에서는 먼저 틀린 수(B) 하나 */
async function typeRound(page: Page, missAt = -1) {
  for (let i = 0; i < 10; i++) {
    const answer = await atProblem(page, i);
    if (i === missAt) {
      // 2층 상황은 모두 첫 수가 U·U'라 B는 늘 틀린 수
      expect(answer).toMatch(/^U/);
      await page.keyboard.press("KeyB");
      await expect(page.locator('[data-token-state="wrong"]')).toHaveCount(1);
      // 그 한 수의 키만 보인다
      await expect(page.locator("[data-practice-wrong-keys]")).toContainText(
        "U",
      );
    }
    for (const k of keysFor(answer)) await page.keyboard.press(k);
  }
}

test("컴퓨터와 대결: 공식 연습 한 판(2층, 입문 컴퓨터)", async ({
  page,
}, info) => {
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.locator('[data-cube-vs-party="practice"]').click();
  await expect(
    page.locator('[data-cube-practice-stage="beginner-second"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('[data-cube-practice-mode="follow"]'),
  ).toHaveAttribute("aria-pressed", "true");
  // 크기·살펴보기는 공식 연습에 쓰지 않아 숨긴다
  await expect(page.locator("[data-cube-vs-size]")).toBeHidden();
  await page.getByRole("button", { name: "입문", exact: true }).click();
  await shot(page, "practice-vs-setup", info.project.name);
  await page.locator("[data-cube-vs-start]").click();

  // 준비 3초 뒤 친다
  await expect(view(page)).toHaveAttribute("data-cube-race-phase", "race", {
    timeout: 30_000,
  });
  await inputReady(page);
  await expect(page.locator("[data-practice-count]")).toHaveText("1 / 10");
  const peer = page.locator('[data-cube-peer="bot1"]');
  await expect(peer).toContainText("1 / 10");
  await expect(peer).toContainText("콤보");
  await shot(page, "practice-vs-race", info.project.name);

  if (info.project.name === "desktop") {
    await typeRound(page, 0);
    await expect(page.locator('section[data-cube-peer="me"]')).toHaveAttribute(
      "data-cube-peer-status",
      "done",
    );
  }
  // 컴퓨터가 끝내거나 제한 시간이 지날 때까지 감는다
  const result = page.locator('[data-cube-result="final"]');
  await fastForwardUntil(page, () => result.isVisible(), {
    step: 2_000,
    timeout: 60_000,
  });
  await expect(result.locator("thead")).toContainText("정확도");
  await expect(result.locator("thead")).toContainText("가장 긴 콤보");
  const bot = result.locator('[data-cube-rank="bot1"]');
  await expect(bot).toBeVisible();
  // 컴퓨터는 계획대로 쳤다(다시 계산해 맞춤)
  await expect(bot).not.toContainText("계획과 다름");
  if (info.project.name === "desktop") {
    await expect(result).toContainText("1위예요.");
    const mine = result.locator('[data-cube-rank="me"]');
    // 틀린 수가 하나라 100%가 아니고, 그 뒤 아홉을 깨끗하게 이었다
    await expect(mine).not.toHaveAttribute("data-practice-accuracy", "100");
    await expect(mine).toHaveAttribute("data-practice-best", "9");
  }
  await expect(page.locator("[data-cube-again]")).toBeVisible();
  await shot(page, "practice-vs-result", info.project.name);
});

/**
 * 친구와 대결 두 탭(같은 브라우저 탭끼리 `?net=local`). 여러 탭 시험이라 `CUBE_MULTI=1`일 때만 돈다(cube-online.spec.ts와 같다).
 * 방장이 공식 연습(노란 십자)을 고르고, 둘이 같은 문제를 받아 손님이 먼저 다 친다.
 */
test("친구와 대결: 두 탭 공식 연습 한 판", async ({ context }, info) => {
  test.skip(!process.env.CUBE_MULTI, "여러 탭 시험은 CUBE_MULTI=1일 때만");
  test.skip(info.project.name !== "desktop", "키보드 기기만 참가");
  await no3d(context);
  const host = await context.newPage();
  await useNotationKeys(host);
  await host.goto("/cube/online?net=local");
  await host.locator("[data-cube-enter]").click();
  const link = await host.locator("input[readonly]").inputValue();
  const guest = await context.newPage();
  await useNotationKeys(guest);
  await guest.goto(link);
  await guest.locator("[data-cube-enter]").click();
  await expect(host.locator("[data-cube-players] li")).toHaveCount(2);

  await host.locator("[data-cube-party]").selectOption("practice");
  await host
    .locator('[data-cube-practice-stage="beginner-yellow-cross"]')
    .click();
  // 손님 화면에도 방장이 고른 규칙이 보인다(고를 수는 없다)
  await expect(
    guest.locator('[data-cube-practice-stage="beginner-yellow-cross"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await shot(guest, "practice-online-lobby", info.project.name);
  await host.locator("[data-cube-start]").click();

  for (const p of [host, guest])
    await expect(view(p)).toHaveAttribute("data-cube-race-phase", "race", {
      timeout: 30_000,
    });
  await inputReady(guest);
  // 같은 문제
  expect(await atProblem(guest, 0)).toBe(await atProblem(host, 0));
  await typeRound(guest);
  // 방장 화면: 손님이 다 친 시간이 보인다
  await expect(host.locator("[data-cube-peer]:not(section)")).toHaveAttribute(
    "data-cube-peer-status",
    "done",
  );
  await shot(host, "practice-online-host", info.project.name);
  await inputReady(host);
  await typeRound(host);
  for (const p of [host, guest])
    await expect(p.locator('[data-cube-result="final"]')).toBeVisible();
  // 두 기기가 같은 순위(손님이 1위)
  await expect(guest.locator('[data-cube-result="final"] h2')).toHaveText(
    "1위예요.",
  );
  await expect(host.locator('[data-cube-result="final"] h2')).toHaveText(
    "2위예요.",
  );
  await shot(guest, "practice-online-result", info.project.name);
});
