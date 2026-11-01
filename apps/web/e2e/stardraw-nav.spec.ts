import { expect, fixStardrawClock, type Page, test } from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

/** 패스키는 Chrome 가상 인증기(CDP WebAuthn)로 */
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

/**
 * 2026-10-31 운영(안드로이드 폰): 응모한 뒤 첫 화면 「영수증」을 누르면 영수증 대신 내 응모 목록이 떴다(봉투 → 지난 회차
 * 목록에 이어 같은 꼴이 되풀이). 페이지를 바꾸는 라우터 이동이 # 조각을 놓친 탓이라, 별 따기 화면끼리는 주소만 바꾸고
 * 한 부품이 그리게 했다. 다른 경로로 옮겨도 그 화면이 뜨고, 뒤로가기·새로고침도 그 화면으로 돌아오는지 본다
 */
test("첫 화면 「영수증」은 그 영수증으로, 뒤로가기는 첫 화면, 새로고침은 그 영수증", async ({
  page,
}) => {
  await virtualAuthenticator(page);
  await page.goto("/stardraw");
  // 처음 온 사람은 첫 화면 입구에서 바로 우주인 등록
  await page.getByRole("button", { name: "우주인 등록", exact: true }).click();
  await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();
  const receipt = page.locator("[data-receipt]");
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  const id = await receipt.getAttribute("data-receipt");

  await page.goto("/stardraw");
  const card = page.locator("[data-card='entered']");
  await card.getByRole("button", { name: "영수증" }).click();
  await expect(page).toHaveURL(new RegExp(`/stardraw/mine#t-${id}$`));
  await expect(page.locator(`[data-receipt='${id}']`)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(card).toBeVisible();

  await page.goForward();
  await expect(page.locator(`[data-receipt='${id}']`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-receipt='${id}']`)).toBeVisible();

  // 첫 화면 「내 응모」로 다른 경로의 목록에 갔다가 응모권을 눌러도 그 영수증으로
  await page.goto("/stardraw");
  await page.getByRole("button", { name: /^내 응모/ }).click();
  await expect(page).toHaveURL(/\/stardraw\/mine$/);
  await page
    .getByRole("region", { name: "내 응모" })
    .getByRole("listitem")
    .first()
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(`[data-receipt='${id}']`)).toBeVisible();
});

/** 처음 온 사람이 우주인 등록 뒤 자동으로 골라 응모하고, 영수증의 응모권 번호를 돌려준다 */
async function registerAndEnter(page: Page): Promise<string> {
  await page.goto("/stardraw");
  await page.getByRole("button", { name: "우주인 등록", exact: true }).click();
  await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();
  const receipt = page.locator("[data-receipt]");
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  return (await receipt.getAttribute("data-receipt")) as string;
}

/** 첫 화면에서 연습 장부를 다음 추첨까지 넘기고 결과 봉투를 열어 추첨 결과까지 */
async function openDrawResult(page: Page) {
  await page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ }).click();
  const envelope = page.locator("[data-envelope]").first();
  await expect(envelope).toBeVisible({ timeout: 60_000 });
  await envelope.click();
  await expect(page.locator("[data-draw-result]")).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * 2026-11-01 사용자: 「처음으로」가 첫 화면이 아니라 뒤로 가기처럼 움직였다(추첨 결과 → 「다음 회차 응모」 → 「처음으로」가
 * 추첨으로, 내 응모 → 영수증 → 「처음으로」가 내 응모로). 어디서 눌러도 첫 화면이다
 */
test("「처음으로」는 바로 전 화면이 아니라 늘 첫 화면으로", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "PC와 휴대폰 세로로");
  await virtualAuthenticator(page);
  const id = await registerAndEnter(page);
  const home = page.locator("[data-greeting]");

  // 내 응모 → 영수증 → 「처음으로」
  await page.goto("/stardraw/mine");
  await page
    .getByRole("region", { name: "내 응모" })
    .getByRole("listitem")
    .first()
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(`[data-receipt='${id}']`)).toBeVisible();
  await page.getByRole("button", { name: "← 처음으로" }).click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(home).toBeVisible();

  // 추첨 결과 → 「다음 회차 응모」 → 「처음으로」
  await openDrawResult(page);
  await page.getByRole("button", { name: "다음 회차 응모" }).click();
  await expect(page).toHaveURL(/\/stardraw\/enter$/);
  await page.getByRole("button", { name: "← 처음으로" }).click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(home).toBeVisible();
});
