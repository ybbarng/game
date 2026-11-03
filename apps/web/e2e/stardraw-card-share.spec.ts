import { expect, fixStardrawClock, type Page, test } from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

/** 패스키는 Chrome 가상 인증기로(누르면 곧바로 지문이 확인된 것처럼 서명) */
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

/** 패스키 부르기를 센다(공유본에서는 본인 확인을 부르지 않는다) */
async function countGets(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __gets: number };
    w.__gets = 0;
    const get = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = (o) => {
      w.__gets += 1;
      return get(o);
    };
  });
}
const gets = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gets: number }).__gets);

test("등록증 공유본: 복사한 주소를 열면 같은 등록증, 뒷면 공개 열쇠는 가려 꺼낼 수 없다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로 하나로");
  await virtualAuthenticator(page);
  await countGets(page);
  // 공유 시트가 없는 브라우저: 복사 길로. 복사한 글을 남긴다
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __copied: string }).__copied = text;
        },
      },
    });
  });

  await page.goto("/stardraw");
  await page
    .locator("[data-key-setup]")
    .getByRole("button", { name: "우주인 등록", exact: true })
    .click();
  await expect(page.locator("[data-issued='new']")).toBeVisible();
  await page.goto("/stardraw/id");
  const mine = page.locator("[data-idcard]");
  await expect(mine).toBeVisible();
  const number = (await mine.getAttribute("data-idcard")) as string;
  const name = (
    await mine.locator("dd").first().textContent()
  )?.trim() as string;
  expect(name.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "등록증 공유" }).click();
  await expect(
    page.getByRole("button", { name: "링크를 복사했어요" }),
  ).toBeVisible();
  const copied = await page.evaluate(
    () => (window as unknown as { __copied: string }).__copied,
  );
  expect(copied).toMatch(
    /, 하늘의 별 따기 우주인으로 등록했어요\. https?:\/\//,
  );
  const url = copied.slice(copied.lastIndexOf(" ") + 1);
  expect(url).toMatch(/\/stardraw\/card\?c=v1\.[\w-]{35}$/);
  // 주소에 공개 열쇠가 없다(내 등록증 뒷면에서 꺼내는 값과 겹치지 않는다)
  expect(url).not.toMatch(/04[0-9a-f]{20}/);

  await page.goto(url);
  const copy = page.locator(`[data-card-copy="${number}"]`);
  await expect(copy).toBeVisible();
  const card = copy.locator(`[data-idcard="${number}"]`);
  await expect(card.locator("[data-astronaut-number]")).toHaveText(number);
  await expect(card.locator("dd").first()).toHaveText(name);
  await expect(card.locator("[data-issue-date]")).toHaveText(
    /^\d{4}\. \d{1,2}\. \d{1,2}\.$/,
  );
  await expect(card.locator("[data-copy-mark]")).toContainText("공유본");
  await expect(card.locator("[data-copy-mark]")).toContainText(
    "본인 확인에 쓸 수 없습니다",
  );
  // 등록은 첫 예측서와 함께 오른다: 아직 장부에 없다
  await expect(page.locator("[data-card-check]")).toHaveAttribute(
    "data-card-check",
    "unsealed",
  );
  await expect(page.locator("[data-card-check]")).toHaveText(
    "아직 장부에 오르지 않은 등록증입니다.",
  );
  await expect(
    page.getByRole("link", { name: "나도 우주인 되기" }),
  ).toHaveAttribute("href", "/stardraw");
  // 앞면을 눌러도 본인 확인은 없다
  await card.click({ position: { x: 40, y: 30 } });
  await expect(page.locator("[data-owner-ok]")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("card-share-front.png"),
    fullPage: true,
  });

  // 뒤집으면 공개 열쇠는 가려 있고, 눌러도 꺼내지지 않는다
  await page.locator("[data-flip-card]").click();
  const back = page.locator("[data-idcard-back]");
  const mask = back.locator("[data-key-mask]");
  await expect(mask).toBeVisible();
  await expect(mask).toHaveAttribute("data-key-locked", "true");
  await expect(back.locator("button")).toHaveCount(0);
  await expect(
    back.locator("[data-back-fingermark] [data-fingermark]"),
  ).toBeVisible();
  await expect(back.locator("[data-copy-mark]")).toBeVisible();
  await mask.click();
  await expect(back.locator("[data-public-key]")).toHaveCount(0);
  await expect(back.getByRole("button", { name: "복사" })).toHaveCount(0);
  expect(await gets(page)).toBe(0);
  await page.screenshot({
    path: info.outputPath("card-share-back.png"),
    fullPage: true,
  });

  // 망가진 주소는 알아볼 수 없다고만 알린다
  await page.goto("/stardraw/card?c=v1.abc");
  await expect(page.locator("[data-card-unreadable]")).toHaveText(
    "알아볼 수 없는 등록증입니다.",
  );
  await expect(page.locator("[data-idcard]")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("card-share-broken.png"),
    fullPage: true,
  });
});
