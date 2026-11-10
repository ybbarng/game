import {
  expect,
  fastForwardUntil,
  fixStardrawClock,
  type Locator,
  type Page,
  speedUpAnimations,
  test,
} from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

/**
 * 소속(docs/36 11-13, 화면에서는 "상품 자격" 대신 "소속"). 실제 구글 로그인은 화면 시험에서 부르지 않는다(서버의 토큰 확인은 서버 시험이 본다).
 * 데모는 데모 기관 계정으로 같은 흐름을 돈다: 데모 소속 차리기 → 받기(가린 도장) → 복구 코드 → 다음 회차 응모에 증서
 */

async function demoUnlock(page: Page, purpose: "create" | "sign") {
  const sheet = page.locator(`[data-demo-unlock='${purpose}']`);
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole("button", { name: "확인" }).click();
  await expect(sheet).toHaveCount(0);
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test(
  "데모 소속: 데모 기관 계정으로 받아 복구 코드를 보고, 다음 회차 응모권에 소속이 표시된다",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    // 데스크톱과 휴대폰 세로로 본다
    await page.goto("/stardraw/demo#qualify");
    const panel = page.locator("[data-qualify]");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await panel.getByRole("button", { name: "데모 소속 차리기" }).click();
    const period = panel.locator("[data-qual-period]");
    await expect(period).toContainText("벌집 성단", {
      timeout: 60_000,
    });
    await period
      .getByRole("button", { name: "데모 기관 계정으로 받기" })
      .click();
    await expect(panel.locator("[data-qual-holding]")).toContainText(
      /소속 번호 Q-[0-9A-Z]{4}-[0-9A-Z]{4}/,
    );
    await expect(panel.locator("[data-qual-code]")).toHaveText(
      /^SDQ1-[0-9A-Z]+$/,
    );
    await panel.getByRole("button", { name: "QR 보기" }).click();
    await expect(
      panel.getByRole("img", { name: "복구 코드 QR" }),
    ).toBeVisible();
    // 복구 코드는 받은 직후에만 보이고, 다시 열면 등록증 확인을 거쳐야 보인다(2026-10-31 보안 검토 B5)
    await page.reload();
    await expect(panel.locator("[data-qual-holding]")).toBeVisible({
      timeout: 30_000,
    });
    await expect(panel.locator("[data-qual-code]")).toHaveCount(0);
    await expect(panel.locator("[data-qual-reveal]")).toBeVisible();
    await noSideScroll(page);
    await page.screenshot({
      path: info.outputPath("demo-qualify.png"),
      fullPage: true,
    });

    // 우주인 등록(흉내 시트) 뒤, 받은 회차에는 증서를 붙이지 않는다
    const setup = page.locator("[data-key-setup]");
    await setup
      .getByRole("button", { name: "우주인 등록", exact: true })
      .click();
    await demoUnlock(page, "create");
    await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
    await expect(page.locator("[data-qual-toggle]")).toHaveCount(0);

    // 다음 회차: 「벌집 성단 소속으로 응모」가 켜진 채로 응모하면 영수증에 소속
    await page.getByRole("button", { name: "지금 관측" }).click();
    await expect(page.locator("[data-qual-toggle='on']")).toContainText(
      "벌집 성단 소속으로 예측",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "자동", exact: true }).click();
    await page
      .getByRole("button", { name: "예측서 내기", exact: true })
      .click();
    await demoUnlock(page, "sign");
    await expect(page.locator("[data-receipt-qual]")).toContainText(/^Q-/, {
      timeout: 30_000,
    });
    await page.screenshot({
      path: info.outputPath("demo-qual-receipt.png"),
      fullPage: true,
    });
  },
);

/**
 * 소속으로 낸 응모가 마감 뒤에 도착해 반송되면, 옮겨 쓰기로 다음 회차에 다시 낼 때도 소속이 붙는다
 * (소속 서명은 회차에 묶여 새 회차로 새로 한다)
 */
test("소속 응모가 반송되면 옮겨 쓴 다음 회차 응모권에도 소속이 붙는다", {
  tag: "@only-phone-portrait",
}, async ({ page }) => {
  // 휴대폰 세로 한 크기로
  await page.goto("/stardraw/demo#qualify");
  // CSS 연출은 처음부터 20배로(빠른 기기처럼). 타이머는 마감을 넘긴 뒤부터 빨리 감는다(아래)
  await speedUpAnimations(page);
  /** 보일 때까지 연출 타이머를 빨리 감는다 */
  const shown = (target: Locator) =>
    fastForwardUntil(page, () => target.isVisible());
  const panel = page.locator("[data-qualify]");
  await panel
    .getByRole("button", { name: "데모 소속 차리기" })
    .click({ timeout: 30_000 });
  await panel
    .locator("[data-qual-period]")
    .getByRole("button", { name: "데모 기관 계정으로 받기" })
    .click({ timeout: 60_000 });
  await expect(panel.locator("[data-qual-holding]")).toBeVisible();
  await page
    .locator("[data-key-setup]")
    .getByRole("button", { name: "우주인 등록", exact: true })
    .click();
  await demoUnlock(page, "create");
  await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  await page.getByRole("button", { name: "지금 관측" }).click();
  await expect(page.locator("[data-qual-toggle='on']")).toBeVisible({
    timeout: 60_000,
  });

  // 화면 마감 45초 전으로 옮겨 응모를 시작하고, 내밀기를 미뤄 마감을 넘긴다.
  // 예측서·신분증이 나오기까지는 빨리 감는다(실제 시간으로 기다리지 않는다). 부하 아래 CSS 연출이 늦게 따라와
  // 빨리 감은 시계가 몇 초 더 흘러도 마감 전에 내밀 수 있게 여유를 둔다(마감 1분 전 안내는 그대로 보인다)
  const line = await page
    .getByText(/예측 받는 중 · 마감까지 [0-9:]+/)
    .textContent();
  const [m, s] = (line?.match(/마감까지 (\d+):(\d+)/) ?? []).slice(1, 3);
  const left = Number(m) * 60 + Number(s);
  const now = await page.evaluate(() => Date.now());
  const deadline = now + left * 1000;
  await page.clock.setSystemTime(deadline - 45_000);
  await expect(page.locator("[data-hurry]")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "예측서 내기", exact: true }).click();
  const paper = page.locator(
    "[aria-label='예측서 제출'][aria-disabled='false']",
  );
  await shown(paper);
  await paper.press("Enter");
  const card = page.locator(
    "[aria-label='신분증 제출'][aria-disabled='false']",
  );
  await shown(card);
  // 마감 전에 신분증까지 왔는지 보고, 마감 10초 뒤까지 들고 있다가 낸다
  const held = await page.evaluate(() => Date.now());
  expect(held).toBeLessThan(deadline);
  await page.clock.runFor(deadline + 10_000 - held);
  await card.press("Enter");
  // 마감을 넘겼으니 여기부터는 연출 타이머를 빨리 감는다
  const unlock = page.locator("[data-demo-unlock='sign']");
  await shown(unlock);
  await demoUnlock(page, "sign");
  const bounce = page.locator("[data-bounce]", { hasText: "접수 반송" });
  await shown(bounce);

  // 보관했다가 다음 회차가 열리면(앞 회차 추첨, 마감 5분 뒤) 보관한 답안지로 새 용지에 옮겨 다시 서명해 낸다
  await page.getByRole("button", { name: "이 예측서 보관하기" }).click();
  await page.getByRole("button", { name: "첫 화면으로" }).click();
  const after = await page.evaluate(() => Date.now());
  await page.clock.setSystemTime(after + 6 * 60_000);
  const reuse = page
    .getByRole("region", { name: "보관한 예측서" })
    .getByRole("button", { name: "이 예측서로 내기" });
  await shown(reuse);
  await reuse.click();
  await shown(paper);
  await paper.press("Enter");
  await shown(card);
  await card.press("Enter");
  await shown(unlock);
  await demoUnlock(page, "sign");
  const qual = page.locator("[data-receipt-qual]", { hasText: /^Q-/ });
  await shown(qual);
});

test("소속 페이지와 개인정보처리방침: 열린 기간이 없으면 그렇게 알리고, 가로로 넘치지 않는다", async ({
  page,
}, info) => {
  await page.goto("/stardraw/qualify");
  await expect(
    page.getByRole("heading", { name: "소속", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("지금 받을 수 있는 소속이 없습니다."),
  ).toBeVisible({ timeout: 30_000 });
  await noSideScroll(page);
  await page.getByRole("link", { name: "개인정보처리방침" }).click();
  await expect(
    page.getByRole("heading", { name: "개인정보처리방침" }),
  ).toBeVisible();
  await expect(
    page.getByText(/이름·사진·연락처는 받지 않습니다/),
  ).toBeVisible();
  await noSideScroll(page);
  await page.screenshot({
    path: info.outputPath("stardraw-privacy.png"),
    fullPage: true,
  });
});
