import { mkdirSync, writeFileSync } from "node:fs";

import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브 맞추기를 게임 목록에 올린 것(docs/47 12절 C8): 첫 화면 목록에서 /cube로 가고, 처음 오셨나요 안내로
 * 이어진다. 휴대폰은 큐브를 밀어서 돌린다(밀기 계산은 view/swipe.test.ts가 보고, 여기서는 화면에서 수가
 * 들어가는지만 본다).
 */

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

test("게임 목록의 큐브 맞추기에서 큐브 첫 화면과 안내로 간다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "배치가 세로 휴대폰과 같다",
  );
  await page.addInitScript(() =>
    sessionStorage.setItem("mighty-splash-seen", "1"),
  );
  await page.goto("/");
  const link = page.getByRole("link", { name: /큐브 맞추기/ });
  await expect(link).toHaveAttribute("href", "/cube");
  await shot(page, "center-home", info.project.name);

  await link.click();
  await expect(page).toHaveURL(/\/cube$/);
  await expect(
    page.getByRole("heading", { name: "큐브 맞추기" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await shot(page, "cube-home", info.project.name);

  await page.locator("[data-cube-intro-link]").click();
  await expect(page.locator("[data-cube-intro]")).toHaveAttribute(
    "data-cube-intro",
    "notation",
  );
  // 퀴즈를 맞혀야 다음으로
  const next = page.locator("[data-intro-next]");
  await expect(next).toBeDisabled();
  await page.locator("[data-intro-quiz] [data-choice='1']").click();
  await next.click();
  await expect(page.locator("[data-cube-intro]")).toHaveAttribute(
    "data-cube-intro",
    "keys",
  );
  await shot(page, "intro-keys", info.project.name);

  if (info.project.name === "desktop" && SAVE_SCREENSHOTS) {
    // 아이콘과 공유 그림(사람이 보는 용도). 그림 주소는 화면이 아니라(준비 표시가 없다) 파일로 받아 둔다
    for (const [url, file] of [
      ["/cube/icon/192.png", "cube-icon.png"],
      ["/cube/apple-icon/180.png", "cube-apple-icon.png"],
      ["/cube/opengraph-image/share.png", "cube-share.png"],
    ] as const) {
      const res = await page.request.get(url);
      expect(res.ok(), url).toBe(true);
      mkdirSync("test-results/screens", { recursive: true });
      writeFileSync(`test-results/screens/${file}`, await res.body());
    }
  }
});

test("휴대폰: 칸 위를 밀면 그 층이 돈다", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로에서만");
  await page.goto("/cube/solo");
  const main = page.locator("main[data-cube-phase]");
  await expect(main).toHaveAttribute("data-cube-phase", "free");
  await expect(
    page.locator("[data-cube-stage][data-input-ready]"),
  ).toBeVisible();
  const canvas = page.locator("[data-cube-canvas][data-cube-ready]");
  await expect(canvas).toBeVisible();
  const moves = page.locator("[data-cube-moves]");
  await expect(moves).toHaveText("0");

  // 손가락 밀기 한 번: 앞면 가운데쯤에서 위로
  await canvas.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width * 0.4;
    const y = r.top + r.height * 0.62;
    const fire = (type: string, dy: number) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 7,
          pointerType: "touch",
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          clientX: x,
          clientY: y + dy,
          bubbles: true,
        }),
      );
    fire("pointerdown", 0);
    fire("pointermove", -30);
    fire("pointermove", -60);
    fire("pointerup", -60);
  });
  await expect(moves).toHaveText("1");

  // 빈 곳(모서리)을 밀면 큐브 전체를 돌린다: 펼친 그림은 바뀌지만 수로 세지 않는다
  const net = page.locator("[data-cube-stage] [data-cube-net]");
  const before = await net.innerHTML();
  await canvas.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width * 0.03;
    const y = r.top + r.height * 0.03;
    const fire = (type: string, dx: number) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 8,
          pointerType: "touch",
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          clientX: x + dx,
          clientY: y,
          bubbles: true,
        }),
      );
    fire("pointerdown", 0);
    fire("pointermove", 60);
    fire("pointerup", 60);
  });
  await expect
    .poll(() => net.innerHTML(), { intervals: [50] })
    .not.toBe(before);
  await expect(moves).toHaveText("1");
  await shot(page, "solo-swiped", info.project.name);
});
