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
 * 추첨으로). 메뉴가 없는 응모 화면의 「처음으로」는 어디서 들어왔든 첫 화면이다.
 * 탭바가 있는 영수증에는 「처음으로」를 두지 않는다(켜진 탭은 내 응모인데 단추는 홈으로 가 어긋났다, B안)
 */
test("응모 화면 「처음으로」는 늘 첫 화면으로, 영수증은 탭으로", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "PC와 휴대폰 세로로");
  await virtualAuthenticator(page);
  const id = await registerAndEnter(page);
  const home = page.locator("[data-greeting]");

  // 내 응모 → 영수증: 머리 줄 단추 없이 내 응모 탭이 켜져 있다
  await page.goto("/stardraw/mine");
  await page
    .getByRole("region", { name: "내 응모" })
    .getByRole("listitem")
    .first()
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(`[data-receipt='${id}']`)).toBeVisible();
  await expect(page.getByRole("button", { name: /^← / })).toHaveCount(0);
  await expect(page.locator("nav [data-tab='mine']")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.screenshot({ path: info.outputPath("nav-home-receipt.png") });
  await page.locator("nav [data-tab='home']").click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(home).toBeVisible();

  // 추첨 결과 → 「다음 회차 응모」 → 「처음으로」
  await openDrawResult(page);
  await page.getByRole("button", { name: "다음 회차 응모" }).click();
  await expect(page).toHaveURL(/\/stardraw\/enter$/);
  await page.getByRole("button", { name: "← 처음으로" }).click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(home).toBeVisible();
  await page.screenshot({ path: info.outputPath("nav-home-first.png") });
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
 * 휴대폰은 추첨 화면 머리 줄 왼쪽에 「홈」 하나, PC는 다른 화면처럼 위쪽 메뉴 줄. 둘 다 하늘판 위에 겹치지 않는다.
 * 「← 돌아가기」는 없다(바로 전 화면은 브라우저·기기의 뒤로 가기, B안)
 */
test("추첨 화면에서 바로 첫 화면으로: 기다리는 화면과 결과 화면", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "PC와 휴대폰 세로로");
  await virtualAuthenticator(page);
  await registerAndEnter(page);
  const home = page.locator("[data-greeting]");
  const goHome = page.locator("[data-tab='home']");
  const backButtons = page.getByRole("button", { name: /^← / });

  // 결과 전: 추첨을 기다리는 화면
  await goHome.click();
  await page.locator("[data-card='entered'] [data-go-draw]").click();
  await expect(page.locator("[data-draw-wait='1']")).toBeVisible();
  await expect(goHome).toHaveCount(1);
  await expect(backButtons).toHaveCount(0);
  await homeAboveSky(page);
  await page.screenshot({ path: info.outputPath("nav-home-draw-wait.png") });
  await goHome.click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(home).toBeVisible();

  // 결과 화면
  await openDrawResult(page);
  await expect(goHome).toHaveCount(1);
  await expect(backButtons).toHaveCount(0);
  await homeAboveSky(page);
  await page.screenshot({ path: info.outputPath("nav-home-draw.png") });
  await goHome.click();
  await expect(page).toHaveURL(/\/stardraw$/);
  await expect(home).toBeVisible();
});

/**
 * 2026-11-01 사용자 B안: 화면마다 속한 탭을 하나로 정했다. 영수증·내 기록은 내 응모 탭, 회차 결과·관측 기록은 지난 회차
 * 탭이 켜진다. 내 기록·관측 기록은 더 보기에서 빠지고 화면 안 한 길(내 응모 「내 기록」 칸, 지난 회차 「관측 기록」)로만
 * 들어간다. 탭바·메뉴 줄이 있는 화면에는 「← 처음으로」「← 돌아가기」 같은 단추가 없다. 회차 결과의 「← 지난 회차」만
 * 남고, 어디서 들어왔든 지난 회차 목록으로 간다. 첫 화면의 지난 회차 한 줄은 그 회차 결과로 바로 간다
 */
test("화면마다 속한 탭이 켜지고, 메뉴가 있는 화면에는 돌아가기가 없다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "PC와 휴대폰 세로로");
  await virtualAuthenticator(page);
  await registerAndEnter(page);
  const backButtons = page.getByRole("button", { name: /^← / });
  const tabOn = (t: string) =>
    expect(page.locator(`nav [data-tab='${t}']`)).toHaveAttribute(
      "aria-current",
      "page",
    );
  // 추첨을 넘겨 지난 회차를 만들고 결과를 열어 본다(첫 화면에 지난 회차 한 줄이 보이게)
  await page.locator("nav [data-tab='home']").click();
  await openDrawResult(page);
  await page.locator("[data-tab='home']").click();

  // 더 보기에는 내 기록·관측 기록이 없다(내 등록증과 앱 밖 페이지만)
  await page.locator("[data-tab='more']").click();
  await expect(page.locator("[data-my-name]")).toBeVisible();
  for (const name of ["내 기록", "관측 기록"])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await page.screenshot({ path: info.outputPath("nav-more.png") });
  await page.locator("[data-tab='more']").click();

  // 첫 화면 지난 회차 한 줄 → 그 회차 결과(지난 회차 탭) → 「← 지난 회차」는 뒤로 가기가 아니라 목록으로
  await page.locator("[data-last-round='1']").click();
  await expect(page).toHaveURL(/\/stardraw\/rounds#1$/);
  await tabOn("rounds");
  await page.getByRole("button", { name: "← 지난 회차" }).click();
  await expect(page).toHaveURL(/\/stardraw\/rounds$/);
  await expect(page.getByRole("region", { name: "지난 회차" })).toBeVisible();
  await tabOn("rounds");
  await expect(backButtons).toHaveCount(0);

  // 주소로 바로 연 회차 결과도 「← 지난 회차」는 목록으로
  await page.goto("/stardraw");
  await page.goto("/stardraw/rounds#1");
  await page.getByRole("button", { name: "← 지난 회차" }).click();
  await expect(page).toHaveURL(/\/stardraw\/rounds$/);

  // 관측 기록: 지난 회차 머리 줄에서 들어가고, 지난 회차 탭이 켜진다
  await page.getByRole("button", { name: "관측 기록", exact: true }).click();
  await expect(page).toHaveURL(/\/stardraw\/stats$/);
  await tabOn("rounds");
  await expect(backButtons).toHaveCount(0);

  // 내 응모 → 「내 기록」 칸: 내 응모 탭이 켜진다
  await page.locator("nav [data-tab='mine']").click();
  await tabOn("mine");
  await expect(backButtons).toHaveCount(0);
  await page.locator("[data-open-records]").click();
  await expect(page).toHaveURL(/\/stardraw\/mine#records$/);
  await tabOn("mine");
  await expect(backButtons).toHaveCount(0);
});

/**
 * 2026-11-01 사용자: 영수증을 열어 둔 채 추첨을 기다리면 추첨(회차 방)으로 가는 길이 없었다. 결과 전에는 첫 화면 회차
 * 카드와 같은 「추첨 보러 가기」가 있고, 영수증을 연 채로 결과가 나오면 새로고침 없이 「추첨 보기」로 바뀐다
 */
test("영수증: 결과 전에는 「추첨 보러 가기」, 결과가 나오면 「추첨 보기」", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "PC와 휴대폰 세로로");
  await virtualAuthenticator(page);
  const id = await registerAndEnter(page);
  const goDraw = page.getByRole("button", { name: "추첨 보러 가기" });
  await expect(goDraw).toBeVisible();
  // 결과 전 영수증 아래쪽은 상태 문구가 아니라 맺음말(상태는 영수증 밖 단추가 맡는다)
  const receipt = page.locator(`[data-receipt='${id}']`);
  await expect(receipt.locator("[data-receipt-thanks]")).toHaveText(
    "관측에 참여해 주셔서 감사합니다.",
  );
  await expect(page.getByText("추첨을 기다리고 있습니다")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("receipt-draw-wait.png"),
    fullPage: true,
  });
  await goDraw.click();
  await expect(page).toHaveURL(/\/stardraw\/rounds#draw-1$/);
  await expect(page.locator("[data-draw-wait='1']")).toBeVisible();

  // 영수증으로 돌아와 연 채로 1회 추첨 시각(13:00)을 넘기면 결과를 가린 「추첨 보기」로 바뀐다
  await page.goBack();
  await expect(receipt).toBeVisible();
  await page.clock.setSystemTime(new Date("2026-11-02T04:00:30Z"));
  const drawFirst = page.locator("[data-receipt] [data-draw-first='1']");
  await expect(drawFirst).toBeVisible({ timeout: 30_000 });
  await expect(goDraw).toHaveCount(0);
  await expect(receipt.locator("[data-receipt-thanks]")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("receipt-draw-ready.png"),
    fullPage: true,
  });
  await drawFirst.click();
  await expect(page).toHaveURL(/\/stardraw\/rounds#draw-1$/);
  await expect(page.locator("[data-draw-result]")).toBeVisible({
    timeout: 30_000,
  });
});

/**
 * 2026-11-01 사용자: 첫 화면의 「← 게임 목록」이 한 줄을 따로 차지해 아쉬웠고, 제목 줄에 겹친 「<」는 링크로 바로 들어온
 * 사람에게 "아까 있던 곳으로"로 읽혔다. 게임 목록 길은 PC 메뉴 줄 맨 왼쪽 「게임 목록」, 휴대폰 더 보기 맨 위 「게임 목록」
 * 하나씩이고 화살표가 없다. 입구(등록 전)는 우주국 안내가 제목·소개 문구 아래, 정답 예시 하늘 위에 온다
 */
test("게임 목록으로 가는 길: PC는 메뉴 줄, 휴대폰은 더 보기 하나", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "PC와 휴대폰 세로로");
  const phone = info.project.name === "phone-portrait";
  const games = page.locator("[data-games-link]:visible");
  await page.goto("/stardraw");
  const notice = page.locator("[data-gate]");
  await expect(notice).toBeVisible();

  // 입구: 제목·소개 문구 → 우주국 안내 → 정답 예시 하늘 순서
  const top = async (sel: string) =>
    ((await page.locator(sel).first().boundingBox())?.y ??
      Number.NaN) as number;
  const titleY = await top(".sd-title");
  const noticeY = await top("[data-gate]");
  const introY = await top("[data-intro]");
  expect(titleY).toBeLessThan(noticeY);
  expect(noticeY).toBeLessThan(introY);

  // 본문에는 게임 목록 길(화살표 포함)이 없다
  await expect(page.locator("main > div [data-games-link]")).toHaveCount(0);
  if (phone) {
    await expect(games).toHaveCount(0);
    await page.locator("[data-tab='more']").click();
    const item = page
      .getByRole("dialog", { name: "더 보기" })
      .getByRole("link", { name: "게임 목록", exact: true });
    await expect(item).toBeVisible();
    await item.click();
  } else {
    await expect(games).toHaveCount(1);
    const item = page
      .locator("nav")
      .getByRole("link", { name: "게임 목록", exact: true });
    await expect(item).toBeVisible();
    await item.click();
  }
  await expect(page).toHaveURL(/\/$/);
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
