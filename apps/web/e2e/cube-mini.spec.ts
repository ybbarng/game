import { installClock, no3d, pauseClock, shot, useNotationKeys } from "./cube";
import { expect, fastForwardUntil, type Page, test } from "./test";

/**
 * 큐브 미니 모드(/cube/mini, 맥 앱 Cubie의 화면, docs/47 14절). 3D 그림은 보지 않으므로 끈다(`no3d`).
 * 앱은 `window.dispatchEvent(new CustomEvent("cubie", …))`로 포커스·섞기·거울·크기·기록을 알린다. 시험은 같은 이벤트로
 * 앱을 흉내 낸다. 브라우저에서 연 화면은 구석 메뉴(⋯)로 같은 것을 고른다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.beforeEach(async ({ page }) => {
  await no3d(page);
  await useNotationKeys(page);
});

/** 앱이 보내는 것 흉내 */
async function fromApp(page: Page, detail: Record<string, unknown>) {
  await page.evaluate(
    (d) => window.dispatchEvent(new CustomEvent("cubie", { detail: d })),
    detail,
  );
}

/** 섞기 글의 거꾸로를 「표기」 배치 키로 */
function inverseKeys(scramble: string): string[] {
  const keys: string[] = [];
  for (const token of scramble.trim().split(/\s+/).reverse()) {
    const code = `Key${token[0] as string}`;
    if (token.endsWith("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(code);
    else keys.push(`Shift+${code}`);
  }
  return keys;
}

test("섞고 맞추면 기록에 남고, 포커스가 없던 시간은 재지 않는다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.setViewportSize({ width: 320, height: 380 });
  await installClock(page);
  await page.goto("/cube/mini");
  const main = page.locator("main[data-mini]");
  await expect(main).toHaveAttribute("data-input-ready", "", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await pauseClock(page);
  await fromApp(page, { type: "focus", focused: true });
  // 화면에는 큐브만: 시간·글이 없다
  await expect(main).not.toContainText(/초|수/);
  await shot(page, "mini-solved", info.project.name);

  // 섞기 키(배치의 「다시 섞기」, Enter)
  await page.keyboard.press("Enter");
  await expect(main).toHaveAttribute("data-mini-phase", "ready", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  const text = (await main.getAttribute("data-mini-scramble")) ?? "";
  const keys = inverseKeys(text);
  await page.clock.fastForward(5000); // 첫 수 전에 살펴본 시간은 재지 않는다
  await page.keyboard.press(keys[0] as string);
  await expect(main).toHaveAttribute("data-mini-phase", "solving");
  await page.clock.fastForward(2000);
  // 다른 앱으로 갔다가(포커스 잃음) 돌아온다
  await fromApp(page, { type: "focus", focused: false });
  await page.clock.fastForward(60_000);
  await fromApp(page, { type: "focus", focused: true });
  await page.clock.fastForward(1000);
  // Esc(배치의 「맞춘 상태로」)는 미니 모드에서 쓰지 않는다: 진행이 남는다
  await page.keyboard.press("Escape");
  await expect(main).toHaveAttribute("data-mini-phase", "solving");
  await shot(page, "mini-scrambled", info.project.name);
  for (const k of keys.slice(1)) await page.keyboard.press(k);
  await expect(main).toHaveAttribute("data-mini-phase", "done");
  await expect(main).toHaveAttribute("data-mini-solved", "");

  // 기록(앱 메뉴 「기록」): 시간은 포커스가 있던 3초만
  await fromApp(page, { type: "records", open: true });
  const panel = page.locator("[data-mini-records='3']");
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-mini-record]")).toHaveCount(1);
  await expect(panel.locator("[data-mini-record]").first()).toContainText(
    "3.00",
  );
  await expect(panel.locator("[data-mini-record]").first()).toContainText(
    `${keys.length}수`,
  );
  await expect(panel.locator("[data-mini-best]")).toHaveText("3.00");
  await shot(page, "mini-records", info.project.name);
  // 다른 크기 기록은 따로
  await panel.locator("[data-mini-records-size='2']").click();
  await expect(page.locator("[data-mini-records='2']")).toContainText(
    "아직 기록이 없어요",
  );
  await fromApp(page, { type: "records", open: false });
  await expect(page.locator("[data-mini-records]")).toHaveCount(0);
});

test("거울 끄기·크기 고르기를 기억하고, 작은 창에서는 거울을 접는다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "창 크기는 데스크톱에서");
  await page.setViewportSize({ width: 320, height: 380 });
  await page.goto("/cube/mini");
  const main = page.locator("main[data-mini]");
  await expect(main).toHaveAttribute("data-input-ready", "");
  await expect(main).toHaveAttribute("data-mini-mirror", "on");

  // 앱 메뉴 흉내
  await fromApp(page, { type: "mirror" });
  await expect(main).toHaveAttribute("data-mini-mirror", "off");
  await fromApp(page, { type: "size", n: 4 });
  await expect(main).toHaveAttribute("data-mini-n", "4");
  // 브라우저 구석 메뉴
  await page.locator("[data-mini-menu]").click();
  await page.locator("[data-mini-item='mirror']").click();
  await expect(main).toHaveAttribute("data-mini-mirror", "on");
  await page.locator("[data-mini-size='2']").click();
  await expect(main).toHaveAttribute("data-mini-n", "2");

  await page.reload();
  await expect(main).toHaveAttribute("data-mini-n", "2");
  await expect(main).toHaveAttribute("data-mini-mirror", "on");

  // 아주 작은 창: 거울을 접고 큐브만
  await page.setViewportSize({ width: 140, height: 160 });
  await expect(main).toHaveAttribute("data-mini-mirror", "folded");
  await shot(page, "mini-tiny", info.project.name);
  await page.setViewportSize({ width: 320, height: 380 });
  await expect(main).toHaveAttribute("data-mini-mirror", "on");
});

test("떠 있을 때: 섞인 큐브를 조금 돌렸다 되돌리고, 포커스를 받으면 바로 멈춘다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installClock(page);
  await page.goto("/cube/mini");
  const main = page.locator("main[data-mini]");
  await expect(main).toHaveAttribute("data-input-ready", "", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await pauseClock(page);
  await fromApp(page, { type: "focus", focused: true });
  await page.keyboard.press("Enter");
  await expect(main).toHaveAttribute("data-mini-phase", "ready", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await page.keyboard.press("KeyR");
  await expect(main).toHaveAttribute("data-mini-moves", "1");
  const scramble = await main.getAttribute("data-mini-scramble");

  await fromApp(page, { type: "focus", focused: false });
  await expect(main).toHaveAttribute("data-mini-idle", "");
  await page.clock.fastForward(60_000);
  await expect(main).toHaveAttribute("data-mini-idle", "jiggle");
  // 조금 섞기가 끝나면(4수 + 되돌리기 4수, 한 수 0.5초) 쉬고, 진행은 그대로
  await fastForwardUntil(
    page,
    async () => (await main.getAttribute("data-mini-idle")) === "",
    { step: 250 },
  );
  await expect(main).toHaveAttribute("data-mini-moves", "1");
  await expect(main).toHaveAttribute("data-mini-scramble", scramble ?? "");
  await expect(main).toHaveAttribute("data-mini-phase", "solving");

  // 다음 조금 섞기 도중에 포커스를 받으면 바로 멈춘다
  await page.clock.fastForward(2 * 60_000);
  await expect(main).toHaveAttribute("data-mini-idle", "jiggle");
  await fromApp(page, { type: "focus", focused: true });
  await expect(main).toHaveAttribute("data-mini-idle", "");
  await expect(main).toHaveAttribute("data-mini-moves", "1");
});
