import { test as base, type Locator, type Page } from "@playwright/test";

export type { BrowserContext, Locator, Page } from "@playwright/test";
export { expect } from "@playwright/test";

/**
 * 화면 시험의 `test`. 탭이 페이지를 열거나 새로고침하면, 화면이 단추에 동작을 붙이고 저장값을 읽은 뒤
 * (`<html data-hydrated>`, StoreHydration) 넘어간다. 그 전에 누르면 누름이 사라지거나 늦게 읽힌 저장값이
 * 고른 옵션을 덮어써, 바쁜 기계에서 가끔 실패하던 시험이 된다.
 */
export const test = base.extend<{
  /**
   * 별 따기 페이지를 불러올 때의 우주국 인사(IntroGate)를 띄울지. 인사는 불러올 때마다 2초쯤 화면을 덮어 누르기를
   * 가로채므로 시험은 끄고 시작한다(`window.__stardrawNoIntro`). 인사를 보는 시험만 `test.use({ stardrawIntro: true })`
   */
  stardrawIntro: boolean;
}>({
  stardrawIntro: [false, { option: true }],
  page: async ({ page }, use) => {
    if (CPU_SLOW > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOW });
    }
    await use(page);
  },
  context: async ({ context, stardrawIntro }, use) => {
    if (!stardrawIntro)
      await context.addInitScript(() => {
        (window as { __stardrawNoIntro?: boolean }).__stardrawNoIntro = true;
      });
    for (const page of context.pages()) prepare(page);
    context.on("page", prepare);
    await use(context);
  },
});

/**
 * `E2E_CPU_SLOW=4`처럼 주면 기본 탭의 CPU를 그 배수만큼 느리게 한다(CDP, Chromium만). GPU 없는 느린 CI에서만
 * 드러나는 문제를 이 맥에서 재현할 때 쓴다(2026-11-04 #90). 웹 워커는 느려지지 않는다
 */
const CPU_SLOW = Number(process.env.E2E_CPU_SLOW ?? 0);

function prepare(page: Page): void {
  waitForReady(page);
  if (SKIP_SCREENSHOTS) skipSavedScreenshots(page);
}

/**
 * CI에서는 파일로 남기기만 하는 스크린샷(`path`를 준 것)을 찍지 않는다. 사람이 직접 보는 용도라 CI에서는 아무도
 * 보지 않고(실패하면 trace가 남는다), 전체 페이지 스크린샷이 화면 시험 시간의 큰 몫을 썼다(2026-11-01).
 * 판정에 쓰는 스크린샷(결과 값을 쓰는 것)은 그대로 찍는다. `E2E_SCREENSHOTS=1`이면 CI에서도 찍는다
 */
const SKIP_SCREENSHOTS = !!process.env.CI && !process.env.E2E_SCREENSHOTS;

/** 파일로 남기는 스크린샷을 실제로 찍는지. 스크린샷만을 위한 기다림(연출이 끝나기 등)은 이것이 참일 때만 한다 */
export const SAVE_SCREENSHOTS = !SKIP_SCREENSHOTS;

/**
 * 요소와 그 안의 끝이 있는 연출(CSS animation·transition, Web Animations)이 모두 끝날 때까지 기다린다.
 * 숨 쉬듯 되풀이하는 연출(iterations Infinity)은 끝나지 않으므로 뺀다. "n ms 기다리면 끝나 있겠지" 대신 쓴다
 */
export async function animationsDone(locator: Locator): Promise<void> {
  await locator.evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

function skipSavedScreenshots(page: Page): void {
  const shot = page.screenshot.bind(page);
  page.screenshot = async (options?: Parameters<Page["screenshot"]>[0]) =>
    options?.path ? Buffer.alloc(0) : shot(options);
}

const READY = "html[data-hydrated]";

/**
 * 화면이 준비될 때까지 기다린다. goto·reload는 저절로 기다리지만, 링크를 눌러 새 문서로 넘어간 뒤
 * 바로 단추를 누를 때는 이것을 먼저 부른다(같은 문서 안에서 넘어갔으면 이미 준비돼 있어 바로 지나간다)
 */
export async function ready(page: Page): Promise<void> {
  await page.locator(READY).waitFor({ state: "attached" });
}

function waitForReady(page: Page): void {
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = async (...args: Parameters<Page["goto"]>) => {
    const response = await goto(...args);
    await page.locator(READY).waitFor({ state: "attached" });
    return response;
  };
  page.reload = async (...args: Parameters<Page["reload"]>) => {
    const response = await reload(...args);
    await page.locator(READY).waitFor({ state: "attached" });
    return response;
  };
}

/**
 * 하늘의 별 따기 화면 시험의 시작 시각(2026-11-02 12:05 한국 시각). 연습 장부는 매시 :55에 마감하고 정각에 추첨해,
 * 실제 시각이 :55~정각에 걸리면 "앞 회차 추첨이 끝나면 응모할 수 있습니다"로 바뀌어 같은 시험이 가끔 실패했다
 * (2026-10-31 CI). 마감에서 50분 떨어진 이 시각에서 시작하게 고정하고, 그 뒤로는 시계가 저절로 흐른다
 * (연출을 앞당기는 시험은 이 위에서 `page.clock.runFor`를 부른다). 실제 시각에 따라 결과가 달라지지 않는다
 */
export const STARDRAW_START = new Date("2026-11-02T03:05:00Z");

/** 별 따기 시험마다 시작 전에 부른다: `test.beforeEach(({ page }) => fixStardrawClock(page))` */
export async function fixStardrawClock(page: Page): Promise<void> {
  await page.clock.install({ time: STARDRAW_START });
}

/**
 * 연출을 켠 시험에서 CSS·Web Animations 연출을 `rate`배로 돌린다(CDP Animation.setPlaybackRate, Chromium만).
 * 타이머(setTimeout)는 page.clock이 맡으니 `fastForwardUntil`과 함께 쓴다
 */
export async function speedUpAnimations(page: Page, rate = 20): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: rate });
}

/**
 * 조건이 맞을 때까지 연출 타이머를 조금씩(`step` ms) 앞당긴다. 연출 길이를 실제 시간으로 기다리지 않는다.
 * `runFor`가 아니라 `fastForward`로 건너뛴다(runFor는 사이의 rAF 프레임을 모두 돌려 하늘 그리기로 오히려 느렸다).
 * 한 걸음을 작게 두어 타이머가 (speedUpAnimations로 빨라진) CSS 연출을 크게 앞지르지 않게 한다.
 * 연출이 끝난 뒤의 자리를 보는 시험은 그 연출이 끝났는지를 조건으로 따로 기다린다. 상한은 멈춘 시험을 잡는 안전장치
 */
export async function fastForwardUntil(
  page: Page,
  ready: () => Promise<boolean>,
  { step = 300, timeout = 30_000 }: { step?: number; timeout?: number } = {},
): Promise<void> {
  const until = Date.now() + timeout;
  while (!(await ready())) {
    if (Date.now() > until)
      throw new Error("연출을 빨리 감으며 조건을 기다리다 시간이 지났다");
    await page.clock.fastForward(step);
  }
}
