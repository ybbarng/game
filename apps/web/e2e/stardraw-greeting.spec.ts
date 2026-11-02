import { expect, fixStardrawClock, type Page, test } from "./test";

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

test("우주국 인사: 처음 들어오면 가운데 인사가 뜨고 물러난 뒤 홈이 펼쳐진다. 같은 방문에서는 다시 뜨지 않는다", async ({
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
  // 1.3초 머문 뒤 물러난다(시계는 실제로 흐른다)
  await expect(greeting).toHaveCount(0, { timeout: 10_000 });
  // 생애 첫 방문인 처음 온 사람: 편지가 위에서 내려오고, 누르면 꺼내 읽는다. 그동안 홈은 숨겨 둔다
  const envelope = page.locator("[data-letter-stage='arrive']");
  await expect(envelope).toBeVisible();
  await expect(page.locator("section[aria-label='정답 예시']")).toBeHidden();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath("letter-arrive.png") });
  // 봉투는 숨 쉬듯 둥실거려 멈추지 않는다(멈출 때까지 기다리지 않고 누른다)
  await envelope.click({ force: true });
  const letter = page.locator("[data-letter]");
  await expect(letter).toContainText(
    "가장 잘 예측하는 우주인을 찾고 있습니다.",
  );
  await expect(letter.locator("[data-seal]")).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({
    path: info.outputPath("letter-read.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "먼저 둘러볼게요" }).click();
  await expect(letter).toHaveCount(0);
  await expect(page.locator("section[aria-label='정답 예시']")).toBeVisible();
  // 홈 머리의 「~님, 안녕하세요」 줄은 없다(인사로 옮겼다)
  await expect(page.locator("[data-greeting]")).toHaveCount(0);
  // 같은 탭에서 새로 고쳐도 다시 뜨지 않는다(한 방문에 한 번)
  await page.reload();
  await expect(page.locator("section[aria-label='정답 예시']")).toBeVisible();
  await expect(greeting).toHaveCount(0);
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
  await expect(greeting).toContainText(/에 거주하는 .+ 님, 반갑습니다\./);
  await tab.screenshot({ path: info.outputPath("greeting-named.png") });
  await greeting.click();
  await expect(greeting).toHaveCount(0, { timeout: 3_000 });
});
