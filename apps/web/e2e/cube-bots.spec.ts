import { installClock, no3d, pauseClock, shot, useNotationKeys } from "./cube";
import { expect, type Page, test } from "./test";

/**
 * 컴퓨터 단계(docs/47 10-1·10-2): 단계 고르기의 예상 시간, 컴퓨터 여럿, 오늘의 섞기·제한 도전의 「컴퓨터와 겨루기」.
 * 시계는 가짜 시계라 컴퓨터 계획 시각을 감아서 본다. 3D 그림은 보지 않으므로 끈다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.beforeEach(async ({ page }, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "휴대폰 세로와 데스크톱으로 본다",
  );
  await no3d(page);
  await useNotationKeys(page);
});

/** 섞기 글의 거꾸로를 「표기」 배치 키로 */
function inverseKeys(scramble: string): string[] {
  const keys: string[] = [];
  for (const token of scramble.trim().split(/\s+/).reverse()) {
    const code = `Key${token[0] as string}`;
    if (token.endsWith("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(code);
    else keys.push(`Shift+${code}`);
  }
  return keys;
}

const phase = (page: Page) => page.locator("main[data-cube-phase]");

/**
 * 혼자 맞추기·제한 도전의 섞기 씨앗(`SolveApp` randomSeed: crypto 32비트 하나)을 고정한다. 섞기와 컴퓨터 계획
 * (`rivalSeed(씨앗)`)이 함께 정해져 결과가 운에 따라 갈리지 않는다. 다른 크기의 난수는 그대로 둔다
 */
async function fixScrambleSeed(page: Page, seed: number) {
  await page.addInitScript((s) => {
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (<T extends ArrayBufferView | null>(a: T): T => {
      if (a instanceof Uint32Array && a.length === 1) {
        a[0] = s;
        return a;
      }
      return real(a as never) as T;
    }) as typeof crypto.getRandomValues;
  }, seed);
}

/** 섞기를 받아 살펴보기에 들어가고 컴퓨터 계획이 오기를 기다린다. 섞기 글을 돌려준다 */
async function receiveWithRival(page: Page): Promise<string> {
  await page.locator("[data-cube-scramble-button]").click();
  await expect(phase(page)).toHaveAttribute("data-cube-phase", "inspect", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await expect(page.locator("[data-cube-rival]")).toHaveAttribute(
    "data-cube-rival",
    "wait",
  );
  await expect(page.locator("[data-cube-rival-status]")).toContainText(
    "내가 시작하면 출발",
    { timeout: SCRAMBLE_TIMEOUT },
  );
  return (
    (await page
      .locator("[data-cube-scramble]")
      .getAttribute("data-cube-scramble")) ?? ""
  );
}

/** 키를 차례로 누른다. 수 사이에 가짜 시계를 `gap`만큼 흘린다. 다 누르면 맞춰져 있다 */
async function press(page: Page, keys: readonly string[], gap: number) {
  for (const [i, k] of keys.entries()) {
    if (i > 0) await page.clock.fastForward(gap);
    await page.keyboard.press(k);
  }
  await expect(phase(page)).toHaveAttribute("data-cube-phase", "done");
}

/** 컴퓨터가 끝날 때까지 시계를 감는다 */
async function untilRivalDone(page: Page) {
  const rival = page.locator("[data-cube-rival]");
  for (let k = 0; k < 400; k++) {
    if ((await rival.getAttribute("data-cube-rival")) === "done") return;
    await page.clock.fastForward(500);
  }
  await expect(rival).toHaveAttribute("data-cube-rival", "done");
}

test("컴퓨터와 대결: 단계마다 예상 시간이 보이고, 컴퓨터를 여럿 둘 수 있다", async ({
  page,
}, info) => {
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.locator("[data-cube-vs-size]").selectOption("3");
  // 기록이 없으니 「내 실력에 맞춤」은 초보 목표(약 1분)
  for (const [value, label, time] of [
    ["3:novice", "입문", "약 2분"],
    ["3:casual", "초보", "약 1분"],
    ["3:club", "중수", "약 35초"],
    ["3:fast", "고수", "약 18초"],
    ["3:pro", "초고수", "약 10초"],
    ["fit", "내 실력에 맞춤", "약 1분"],
  ] as const) {
    const b = page.locator(`[data-cube-bot-level="${value}"]`);
    await expect(b).toContainText(label);
    await expect(b).toContainText(time);
  }
  await page.locator("[data-cube-vs-size]").selectOption("2");
  await expect(page.locator('[data-cube-bot-level="3:pro"]')).toContainText(
    "약 3초",
  );
  await page.getByRole("button", { name: "초고수", exact: true }).click();
  await expect(page.locator('[data-cube-bot-level="3:pro"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("[data-cube-vs-bots]").selectOption("3");
  await shot(page, "bots-setup", info.project.name);
  await page.getByLabel("15초 살펴보기").uncheck();
  await page.locator("[data-cube-vs-start]").click();
  await expect(page.locator("[data-cube-race-phase]")).toHaveAttribute(
    "data-cube-race-phase",
    "race",
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await expect(page.locator("[data-cube-bot-planned]")).toHaveCount(3, {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await page.clock.fastForward(1_500);
  await shot(page, "bots-three", info.project.name);
});

test("오늘의 섞기: 컴퓨터와 겨루면 같은 섞기를 나란히 맞추고, 기록은 혼자 하기 그대로", async ({
  page,
}, info) => {
  await installClock(page);
  await page.goto("/cube/daily");
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await pauseClock(page);
  await page.locator("[data-cube-size]").selectOption("2");
  // 2×2 초고수(평균 약 3초): 수 사이 1초씩 느리게 맞추면 컴퓨터가 이긴다
  await page.locator("[data-cube-rival-pick]").selectOption("3:pro");
  const text = await receiveWithRival(page);
  await expect(page.locator("[data-cube-daily-attempt]")).toHaveAttribute(
    "data-cube-daily-attempt",
    "official",
  );
  // 기록 시도 중에는 컴퓨터를 바꿀 수 없다
  await expect(page.locator("[data-cube-rival-pick]")).toBeDisabled();
  const keys = inverseKeys(text);
  await page.keyboard.press(keys[0] as string);
  await expect(page.locator("[data-cube-rival]")).toHaveAttribute(
    "data-cube-rival",
    "racing",
  );
  await page.clock.fastForward(1_000);
  await shot(page, "bots-daily-racing", info.project.name);
  await press(page, keys.slice(1), 1_000);
  await untilRivalDone(page);
  await expect(page.locator("[data-cube-rival]")).toHaveAttribute(
    "data-cube-rival-verdict",
    "lose",
  );
  await expect(page.locator("[data-cube-rival-status]")).toContainText("맞춤");
  // 내 결과와 오늘 기록은 혼자 하기와 같다
  await expect(page.locator("[data-cube-result]")).toHaveAttribute(
    "data-cube-result",
    "solved",
  );
  await expect(page.locator("[data-cube-daily-done]").first()).toBeVisible();
  await shot(page, "bots-daily-done", info.project.name);
});

test("제한 도전: 컴퓨터도 같은 체력 규칙으로 겨루고, 점수로 견준다", async ({
  page,
}, info) => {
  // 점수는 지난 단계 × 100 + 남은 시간이라, 입문 컴퓨터도 빨리 맞추는 섞기가 나오면 점수가 앞섰다(무작위 씨앗 300개 중
  // 2개꼴로 졌다). 씨앗 29의 2×2 섞기는 시뮬레이션으로 입문 컴퓨터가 약 45초에 맞춰 349점, 이 시험 손(수 사이 0.2초)은 578점
  await fixScrambleSeed(page, 29);
  await installClock(page);
  await page.goto("/cube/challenge");
  await expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible(
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await pauseClock(page);
  await page.locator("[data-cube-size]").selectOption("2");
  // 2×2 입문(평균 약 45초): 빨리 맞추면 내가 이긴다
  await page.locator("[data-cube-rival-pick]").selectOption("3:novice");
  const text = await receiveWithRival(page);
  // 씨앗이 고정됐는지(안 되면 운에 맡긴 시험으로 돌아간다)
  expect(text).toBe("U R' U' F U' R2 F U F R U'");
  await expect(page.locator("[data-cube-rival-pick]")).toBeDisabled();
  await press(page, inverseKeys(text), 200);
  await expect(page.locator("[data-cube-challenge-result]")).toHaveAttribute(
    "data-cube-challenge-result",
    "ok",
  );
  await shot(page, "bots-challenge-mine", info.project.name);
  await untilRivalDone(page);
  await expect(page.locator("[data-cube-rival]")).toHaveAttribute(
    "data-cube-rival-verdict",
    "win",
  );
  await expect(page.locator("[data-cube-rival-status]")).toContainText("점수");
  // 도전 기록은 내 판 하나
  await expect(page.locator("[data-cube-challenge-entry]")).toHaveCount(1);
  await shot(page, "bots-challenge-done", info.project.name);
});
