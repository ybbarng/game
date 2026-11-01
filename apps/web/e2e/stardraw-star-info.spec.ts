import sky from "../src/stardraw/sky-data.json" with { type: "json" };
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

/** 하늘의 별 하나를 누른다(화면 밖 별도 누를 수 있게 캔버스에 click을 바로 보낸다, stardraw.spec.ts와 같다) */
async function tapStar(page: Page, canvas: string, n: number) {
  const star = sky.stars[n - 1];
  if (!star) throw new Error(`없는 별 ${n}`);
  await page.locator(canvas).evaluate((el, at) => {
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: rect.left + at.x * rect.width,
        clientY: rect.top + at.y * rect.width,
      }),
    );
  }, star);
}

/** 페이지 길이와 하늘 자리: 별 설명이 떠도 그대로여야 한다 */
async function layoutOf(page: Page, canvas: string) {
  const box = await page.locator(canvas).boundingBox();
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  return { box, height };
}

/**
 * 한 하늘에서 별 설명 규칙: 누르면 그 별 설명이 하늘 위에 뜨고(페이지는 밀리지 않는다), 다른 별을 누르면 바뀌고,
 * 같은 별을 다시 누르거나 바깥을 누르면 닫힌다
 */
async function checkStarInfo(
  page: Page,
  canvas: string,
  outside: ReturnType<Page["locator"]>,
) {
  const info = page.locator("[data-star-info]");
  await expect(info).toHaveCount(0);
  const before = await layoutOf(page, canvas);
  await tapStar(page, canvas, 7);
  await expect(page.locator("[data-star-info='7']")).toContainText(
    sky.stars[6]?.ko as string,
  );
  expect(await layoutOf(page, canvas)).toEqual(before);
  await tapStar(page, canvas, 1);
  await expect(page.locator("[data-star-info='1']")).toContainText(
    sky.stars[0]?.ko as string,
  );
  await tapStar(page, canvas, 1);
  await expect(info).toHaveCount(0);
  await tapStar(page, canvas, 7);
  await expect(page.locator("[data-star-info='7']")).toBeVisible();
  await outside.click();
  await expect(info).toHaveCount(0);
  // 오른쪽 위 ✕ 단추로도 닫힌다(손가락으로 누를 만한 크기)
  await tapStar(page, canvas, 7);
  const close = info.getByRole("button", { name: "설명 닫기" });
  const size = await close.boundingBox();
  expect(size?.width).toBeGreaterThanOrEqual(32);
  expect(size?.height).toBeGreaterThanOrEqual(32);
  await close.click();
  await expect(info).toHaveCount(0);
}

test("별 설명: 영수증·추첨을 기다리는 하늘·추첨 결과·지난 회차에서도 별을 누르면 그 별 설명이 뜬다", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone-landscape",
    "휴대폰 세로와 PC 두 크기로",
  );
  await virtualAuthenticator(page);
  await page.goto("/stardraw");
  await page.getByRole("button", { name: "우주인 등록", exact: true }).click();
  await page.getByRole("button", { name: "별을 고르러 가 볼까요?" }).click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "응모하기", exact: true }).click();

  // 영수증 안 작은 하늘
  await expect(page.locator("[data-receipt]")).toBeVisible({ timeout: 30_000 });
  const receiptSky = "[data-receipt] canvas[data-sky='receipt']";
  await checkStarInfo(page, receiptSky, page.locator("[data-ticket-id]"));
  await tapStar(page, receiptSky, 7);
  await page.locator(receiptSky).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("star-info-receipt.png"),
    fullPage: true,
  });

  // 추첨을 기다리는 하늘
  await page.goto("/stardraw");
  await page.locator("[data-card='entered'] [data-go-draw]").click();
  const wait = page.locator("[data-draw-wait='1']");
  await expect(wait).toContainText("추첨까지");
  await checkStarInfo(
    page,
    "[data-draw-wait] canvas[data-sky='draw']",
    wait.getByRole("heading"),
  );

  // 결과가 들어오면 그 자리에서 추첨(화면 시험은 움직임 줄이기라 결과가 바로 나온다)
  await page.getByRole("button", { name: /다음 추첨까지 건너뛰기/ }).click();
  const result = page.locator("[data-draw-result]");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await checkStarInfo(page, "canvas[data-sky='draw']", result);
  await tapStar(page, "canvas[data-sky='draw']", 7);
  await page.screenshot({
    path: testInfo.outputPath("star-info-draw.png"),
    fullPage: true,
  });
  // 위쪽 별을 누르면 설명 칸이 아래쪽(켜진 당첨 별 위)에 뜬다: 밝은 별 위에서도 글이 읽히는지 스크린샷으로 본다
  const upper = sky.stars.find((s) => s.y < 0.3);
  if (!upper) throw new Error("위쪽 별이 없다");
  await tapStar(page, "canvas[data-sky='draw']", upper.n);
  await expect(page.locator(`[data-star-info='${upper.n}']`)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("star-info-draw-low.png"),
    fullPage: true,
  });
  await tapStar(page, "canvas[data-sky='draw']", upper.n);

  // 지난 회차 결과(지난 회차 목록에서 연 추첨 화면, 새로 열어 결과부터 보인다)
  await page.goto("/stardraw/rounds#draw-1");
  await page.reload();
  await expect(result).toBeVisible({ timeout: 30_000 });
  await checkStarInfo(page, "canvas[data-sky='draw']", result);
});

test("별 설명: 첫 화면 정답 예시 하늘에서도 별을 누르면 그 별 설명이 뜬다", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone-landscape",
    "휴대폰 세로와 PC 두 크기로",
  );
  await page.goto("/stardraw");
  const intro = page.locator("section[aria-label='정답 예시']");
  await expect(intro).toBeVisible();
  await checkStarInfo(
    page,
    "section[aria-label='정답 예시'] canvas",
    intro.getByRole("heading"),
  );
  await tapStar(page, "section[aria-label='정답 예시'] canvas", 7);
  await page.screenshot({
    path: testInfo.outputPath("star-info-intro.png"),
    fullPage: true,
  });
});
