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

/** 「홈」이 하늘판 위에 겹치지 않고 위쪽에 따로 있는지(연출을 가리지 않는다) */
async function homeAboveSky(page: Page) {
  const homeBox = await page.locator("[data-tab='home']").boundingBox();
  const skyBox = await page.locator("canvas[data-sky='draw']").boundingBox();
  expect(homeBox).not.toBeNull();
  expect(skyBox).not.toBeNull();
  if (!homeBox || !skyBox) return;
  expect(homeBox.y + homeBox.height).toBeLessThanOrEqual(skyBox.y);
}

/**
 * 2026-11-01 사용자: 추첨 화면에서 첫 화면으로 가기 어렵다(탭바 없이 「돌아가기」만, 뒤로 가기라 온 길을 되밟았다).
 * 휴대폰은 추첨 화면 머리 줄 오른쪽에 「홈」, PC는 다른 화면처럼 위쪽 메뉴 줄. 둘 다 하늘판 위에 겹치지 않는다
 */
test("추첨 화면에서 바로 첫 화면으로: 기다리는 화면과 결과 화면", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "PC와 휴대폰 세로로");
  await virtualAuthenticator(page);
  await registerAndEnter(page);
  const home = page.locator("[data-greeting]");
  const goHome = page.locator("[data-tab='home']");

  // 결과 전: 추첨을 기다리는 화면
  await page.getByRole("button", { name: "← 처음으로" }).click();
  await page.locator("[data-card='entered'] [data-go-draw]").click();
  await expect(page.locator("[data-draw-wait='1']")).toBeVisible();
  await expect(goHome).toHaveCount(1);
  await homeAboveSky(page);
  await goHome.click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(home).toBeVisible();

  // 결과 화면
  await openDrawResult(page);
  await expect(goHome).toHaveCount(1);
  await homeAboveSky(page);
  await page.screenshot({ path: info.outputPath("nav-home-draw.png") });
  await goHome.click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(home).toBeVisible();
});

/**
 * 별 따기 앱 밖의 페이지(설명·검증·배우기·소속·등록증·우주국·개인정보·공유 응모권·데모)는 모두 첫 화면에 같은
 * 「← 하늘의 별 따기」가 보인다. 검증 페이지는 설명으로만 이어져 첫 화면까지 두 번 가야 했다(2026-11-01)
 */
test("앱 밖 페이지마다 첫 화면에 「← 하늘의 별 따기」", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "PC와 휴대폰 세로로");
  for (const path of [
    "/stardraw/about",
    "/stardraw/verify",
    "/stardraw/learn",
    "/stardraw/qualify",
    "/stardraw/id",
    "/stardraw/bureau",
    "/stardraw/privacy",
    `/stardraw/ticket#1-${"0".repeat(64)}`,
    "/stardraw/demo",
  ]) {
    await page.goto(path);
    const link = page.getByRole("link", {
      name: "← 하늘의 별 따기",
      exact: true,
    });
    await expect(link, path).toBeInViewport();
    await expect(link, path).toHaveAttribute("href", "/stardraw");
    if (path === "/stardraw/verify")
      await page.screenshot({ path: info.outputPath("nav-home-verify.png") });
  }
});
