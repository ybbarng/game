import {
  animationsDone,
  expect,
  fastForwardUntil,
  fixStardrawClock,
  type Page,
  SAVE_SCREENSHOTS,
  STARDRAW_START,
  test,
} from "./test";

test.use({ stardrawIntro: true });
test.beforeEach(({ page }) => fixStardrawClock(page));

const GREETING = { name: "카노푸스 우주국 인사" } as const;

/** 패스키는 Chrome 가상 인증기로(누르면 곧바로 지문이 확인된 것처럼 서명한다) */
async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test("우주국 인사: 처음 들어오면 가운데 인사가 뜨고 물러난 뒤 홈이 펼쳐진다. 새로 고치면 다시 뜬다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "데스크톱·휴대폰 세로로");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/stardraw");
  const greeting = page.getByRole("dialog", GREETING);
  await expect(greeting).toBeVisible();
  await expect(greeting).toContainText(
    "카노푸스 우주국에 오신 것을 환영합니다.",
  );
  await page.screenshot({ path: info.outputPath("greeting-new.png") });
  // 1.3초 머문 뒤 물러난다. 실제 시간으로 기다리지 않고 시계를 감는다
  await fastForwardUntil(page, async () => (await greeting.count()) === 0);
  // 생애 첫 방문인 처음 온 사람: 편지가 위에서 내려오고, 누르면 꺼내 읽는다. 그동안 홈은 숨겨 둔다
  const envelope = page.locator("[data-letter-stage='arrive']");
  await expect(envelope).toBeVisible();
  await expect(page.locator("section[aria-label='정답 예시']")).toBeHidden();
  // 내려오기(1.1초)가 끝날 때까지 기다린다. 그 뒤의 둥실거림은 끝이 없어 animationsDone이 빼고 본다
  await animationsDone(envelope);
  await page.screenshot({ path: info.outputPath("letter-arrive.png") });
  // 봉투는 숨 쉬듯 둥실거려 멈추지 않는다(멈출 때까지 기다리지 않고 누른다)
  await envelope.click({ force: true });
  const letter = page.locator("[data-letter]");
  await expect(letter).toContainText(
    "가장 잘 예측하는 우주인을 찾고 있습니다.",
  );
  await expect(letter.locator("[data-seal]")).toBeVisible();
  if (SAVE_SCREENSHOTS) {
    await animationsDone(letter);
    await page.screenshot({
      path: info.outputPath("letter-read.png"),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "먼저 둘러볼게요" }).click();
  await expect(letter).toHaveCount(0);
  await expect(page.locator("section[aria-label='정답 예시']")).toBeVisible();
  // 홈 머리의 「~님, 안녕하세요」 줄은 없다(인사로 옮겼다)
  await expect(page.locator("[data-greeting]")).toHaveCount(0);
  // 같은 탭에서 새로 고쳐도 다시 뜬다(휴대폰 브라우저는 탭이 며칠씩 살아 있어 「탭에 한 번」이면 다시 볼 일이 없었다)
  await page.reload();
  await expect(greeting).toBeVisible();
});

test("우주국 인사: 등록한 사람에게는 이름으로, 누르면 바로 넘어간다", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 한 크기로");
  await virtualAuthenticator(page);
  await page.goto("/stardraw");
  await expect(page.getByRole("dialog", GREETING)).toHaveCount(0); // 움직임 줄이기(시험 기본)면 뜨지 않는다
  await page.getByRole("button", { name: "우주인 등록", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "별을 고르러 가 볼까요?" }),
  ).toBeVisible();

  // 새 탭(새 방문)으로 홈을 열면 이름으로 인사한다
  const tab = await context.newPage();
  await fixStardrawClock(tab);
  await tab.emulateMedia({ reducedMotion: "no-preference" });
  await tab.goto("/stardraw");
  const greeting = tab.getByRole("dialog", GREETING);
  await expect(greeting).toContainText(/에 거주하는 .+ 님, \S.+/);
  await tab.screenshot({ path: info.outputPath("greeting-named.png") });
  await greeting.click();
  await expect(greeting).toHaveCount(0, { timeout: 3_000 });
});

/**
 * 장부를 붙잡아 두는 탭(services.ts `ledgerHold`). 시계는 멈춰 두고 시험이 정확한 순간으로 감는다.
 * 돌려준 함수를 부르면 장부를 내준다
 */
async function holdLedger(page: Page): Promise<() => Promise<void>> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __stardrawLedgerHold?: Promise<void>;
      __stardrawLedgerRelease?: () => void;
    };
    w.__stardrawLedgerHold = new Promise<void>((resolve) => {
      w.__stardrawLedgerRelease = resolve;
    });
  });
  await page.clock.pauseAt(new Date(STARDRAW_START.getTime() + 1000));
  return () =>
    page.evaluate(() =>
      (
        window as unknown as { __stardrawLedgerRelease: () => void }
      ).__stardrawLedgerRelease(),
    );
}

const SLOW_LINE = "하늘을 펴고 있습니다";

test("장부가 늦을 때 인사: 로고는 인사 한 겹만, 1.8초 뒤 인사 아래에 한 줄", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 한 크기로");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const release = await holdLedger(page);
  await page.goto("/stardraw");
  const greeting = page.getByRole("dialog", GREETING);
  await expect(greeting).toContainText(
    "카노푸스 우주국에 오신 것을 환영합니다.",
  );
  // 기다리는 자리는 인사가 덮는 동안 그리지 않는다: 로고는 화면 전체에 인사 쪽 하나뿐
  await expect(page.locator("[data-sky-wait]")).toHaveCount(0);
  await expect(page.locator("[data-intro-shell]")).toHaveCount(1);
  await expect(greeting.locator("[data-bureau-logo]")).toHaveCount(1);
  await expect(page.getByText(SLOW_LINE)).toHaveCount(0);
  await page.clock.fastForward(1799);
  await expect(page.getByText(SLOW_LINE)).toHaveCount(0);
  await page.clock.fastForward(1);
  await expect(greeting.getByText(SLOW_LINE)).toBeVisible();
  await expect(page.getByText(SLOW_LINE)).toHaveCount(1);
  // 인사 문장이 다 떠오른 뒤 찍는다(sd-intro-rise)
  await expect(greeting.locator(".sd-intro-line")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: info.outputPath("intro-greeting-slow.png") });
  // 장부가 오면 인사가 물러나고 처음 온 사람의 편지가 내려온다
  await release();
  await fastForwardUntil(page, async () => (await greeting.count()) === 0);
  await fastForwardUntil(page, () =>
    page.locator("[data-letter-stage='arrive']").isVisible(),
  );
});

test("장부가 늦을 때 인사가 없으면: 빈 밤하늘 바탕, 1.8초 뒤 가운데 한 줄만", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 한 크기로");
  // 정적 HTML에서부터 기다리는 자리는 바탕만이다(로고·인사 묶음이 먼저 뜨지 않는다)
  const html = await (await page.request.get("/stardraw")).text();
  expect(html).toContain("data-sky-wait");
  expect(html).not.toContain("data-intro-shell");
  // 움직임 줄이기(시험 기본)라 인사가 뜨지 않는다
  const release = await holdLedger(page);
  await page.goto("/stardraw");
  const wait = page.locator("[data-sky-wait]");
  await expect(wait).toBeVisible();
  await expect(page.getByRole("dialog", GREETING)).toHaveCount(0);
  await expect(wait.locator("[data-bureau-logo]")).toHaveCount(0);
  await expect(wait).toHaveText("");
  await page.screenshot({ path: info.outputPath("intro-wait-blank.png") });
  await page.clock.fastForward(1799);
  await expect(wait).toHaveText("");
  await page.clock.fastForward(1);
  await expect(wait).toHaveText(SLOW_LINE);
  await page.screenshot({ path: info.outputPath("intro-wait-slow.png") });
  // 장부가 오면 기다리는 자리가 걷히고 홈이 보인다
  await release();
  await expect(wait).toHaveCount(0);
  await expect(page.locator("section[aria-label='정답 예시']")).toBeVisible();
});

test("홈이 아닌 화면으로 들어와도 인사: 지금 회차·내 예측, 인사가 걷히면 화면과 탭바가 그대로 보인다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 한 크기로");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const greeting = page.getByRole("dialog", GREETING);
  await page.goto("/stardraw/now");
  await expect(greeting).toContainText(
    "카노푸스 우주국에 오신 것을 환영합니다.",
  );
  await fastForwardUntil(page, async () => (await greeting.count()) === 0);
  await expect(page.locator("main footer")).toBeVisible();
  // 처음 온 사람이어도 홈이 아닌 화면에서는 편지를 기다리지 않는다(기다리면 탭바가 숨은 채 남았다)
  await page.goto("/stardraw/mine");
  await expect(greeting).toBeVisible();
  await fastForwardUntil(page, async () => (await greeting.count()) === 0);
  await fastForwardUntil(page, () =>
    page.getByRole("button", { name: "홈", exact: true }).isVisible(),
  );
  await expect(page.locator("[data-letter-stage]")).toHaveCount(0);
});

/**
 * 불러오는 동안 DOM이 바뀔 때마다(MutationObserver, 그려지는 틈과 상관없이 모든 상태를 본다) footer가 덮개
 * (기다리는 자리·인사) 없이 화면 위쪽에 있었는지 적는다. 본문이 빈 순간이 있으면 footer가 위로 올라온다
 */
async function watchBareFooter(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const bare: string[] = [];
    (window as unknown as { __bareFooter: string[] }).__bareFooter = bare;
    const check = () => {
      const footer = document.querySelector("main footer");
      if (!footer) return;
      if (document.querySelector("[data-sky-wait], [data-intro]")) return;
      const top = footer.getBoundingClientRect().top;
      if (top < 80) bare.push(`${location.pathname} footer top ${top}`);
    };
    new MutationObserver(check).observe(document, {
      childList: true,
      subtree: true,
    });
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __bareFooter: string[] }).__bareFooter,
    );
}

test("불러오는 동안 footer가 화면 위쪽에 먼저 보이지 않는다: 지금 회차·홈·내 예측", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 한 크기로");
  const bare = await watchBareFooter(page);
  for (const path of ["/stardraw/now", "/stardraw", "/stardraw/mine"]) {
    await page.goto(path);
    await expect(page.locator("main footer")).toBeVisible();
    expect(await bare()).toEqual([]);
  }
});
