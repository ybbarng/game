import { installClock, no3d, pauseClock, shot, useNotationKeys } from "./cube";
import { expect, fastForwardUntil, type Page, test } from "./test";

/**
 * 큐브 미니 모드(/cube/mini, 맥 앱 Cubie의 화면, docs/47 15절). 3D 그림은 보지 않으므로 끈다(`no3d`).
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

  // 가장 작은 창(48px): 2×2·3×3은 거울이 남는다. 7×7은 거울 칸이 너무 작아 접고 큐브만(문턱 10 × n px)
  await page.setViewportSize({ width: 48, height: 48 });
  await expect(main).toHaveAttribute("data-mini-mirror", "on");
  await shot(page, "mini-tiny", info.project.name);
  await fromApp(page, { type: "size", n: 7 });
  await expect(main).toHaveAttribute("data-mini-mirror", "folded");
  await page.setViewportSize({ width: 70, height: 80 });
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

test("앱이 따로 여는 창: 기록과 단축키(지금 크기·배치)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "앱 창은 데스크톱에서");
  await page.addInitScript(() => {
    localStorage.setItem(
      "cube.mini.v1",
      JSON.stringify({
        version: 1,
        n: 4,
        mirror: true,
        records: {
          "4": [
            {
              at: Date.UTC(2026, 10, 9, 3),
              n: 4,
              mode: "solo",
              ms: 61_230,
              penalty: 0,
              moves: 88,
              scramble: "R",
              no: 1,
            },
          ],
        },
      }),
    );
  });
  await page.goto("/cube/mini?view=records");
  const records = page.locator("[data-mini-records='4']");
  await expect(records.locator("[data-mini-record]")).toHaveCount(1);
  await expect(records.locator("[data-mini-best]")).toHaveText("1:01.23");
  await expect(records.locator("[data-mini-records-close]")).toHaveCount(0);

  await page.goto("/cube/mini?view=keys");
  const keys = page.locator("[data-mini-keys='4']");
  await expect(keys).toContainText("⌃⌥⌘C");
  await expect(keys).toContainText("Enter");
  await expect(keys).toContainText("배치 「표기」");
  await shot(page, "mini-keys", info.project.name);
});

/**
 * 앱 안(다리 흉내): 앱은 키마다 바로 앞에 출처(`key`)를 보낸다. 한 수라도 다른 프로그램이 넣은 키면 그 판 기록에
 * 「다른 프로그램 입력」이 붙고, 모두 실제 키보드면 붙지 않는다. 앱 안에서는 바탕이 투명하고, 큐브 자리(`hit`)를 앱에 알린다
 */
test("앱 안: 다른 프로그램이 넣은 키가 섞인 판은 기록에 표시한다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    (window as unknown as { __toApp: unknown[] }).__toApp = sent;
    (
      window as unknown as {
        webkit: { messageHandlers: Record<string, unknown> };
      }
    ).webkit = {
      messageHandlers: { cubie: { postMessage: (m: unknown) => sent.push(m) } },
    };
  });
  await installClock(page);
  await page.goto("/cube/mini");
  const main = page.locator("main[data-mini]");
  await expect(main).toHaveAttribute("data-input-ready", "", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await pauseClock(page);
  // 앱 안에서는 바탕을 그리지 않고, 브라우저 구석 메뉴도 없다
  await expect(main).not.toHaveClass(/bg-neutral-950/);
  await expect(page.locator("[data-mini-menu]")).toHaveCount(0);
  const sent = () =>
    page.evaluate(
      () => (window as unknown as { __toApp: { type: string }[] }).__toApp,
    );
  expect((await sent()).some((m) => m.type === "ready")).toBe(true);
  await fromApp(page, { type: "focus", focused: true });

  /** 섞고 거꾸로 쳐서 맞춘다. `fake`번째 수만 다른 프로그램이 넣은 키로 알린다 */
  async function solveOnce(fake: number | null) {
    await fromApp(page, { type: "key", source: "keyboard" });
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const keys = inverseKeys(
      (await main.getAttribute("data-mini-scramble")) ?? "",
    );
    for (const [i, k] of keys.entries()) {
      await fromApp(page, {
        type: "key",
        source: i === fake ? "synthetic" : "keyboard",
      });
      await page.keyboard.press(k);
    }
    await expect(main).toHaveAttribute("data-mini-phase", "done");
  }
  await solveOnce(null);
  await solveOnce(3);

  await fromApp(page, { type: "records", open: true });
  const rows = page.locator("[data-mini-records='3'] [data-mini-record]");
  await expect(rows).toHaveCount(2);
  // 새것이 앞: 둘째 판만 표시
  await expect(rows.nth(0).locator("[data-mini-source]")).toHaveAttribute(
    "data-mini-source",
    "synthetic",
  );
  await expect(rows.nth(1).locator("[data-mini-source]")).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("cube.mini.v1") ?? "{}"),
  );
  expect(
    saved.records["3"].map((r: { inputSource: string }) => r.inputSource),
  ).toEqual(["synthetic", "keyboard"]);
});
