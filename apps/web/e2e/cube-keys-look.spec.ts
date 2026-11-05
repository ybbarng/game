import type { Page } from "@playwright/test";

import { goStep, inputReady, no3d } from "./cube";
import { expect, test } from "./test";

/**
 * 차분한 키 그림(2026-11-05, 사용자 「키보드 아직 너무 어지러움」, docs/47 4-5). 칸 바탕은 무채색, 면 색은 작은 표시
 * 하나(기본 아래선), 칸에는 수 하나만 크게(키 글자는 작게, 같은 글자면 한 번만), Shift 층 글은 Shift를 누르는 동안만,
 * 동작 없는 키는 아주 흐리게. 혼자 맞추기·배우기·키 익히기·화면 키보드가 같은 규칙인지 본다.
 *
 * 견주기: `E2E_SCREENSHOTS=1 KEY_LOOK=line|dot|tint`로 돌리면 그 안으로 키 그림마다 스크린샷을 남긴다
 * (`test-results/key-look/<안>/`). 3D 그림은 보지 않으므로 끈다.
 */

const SAVE = !!process.env.E2E_SCREENSHOTS;
const LOOK = process.env.KEY_LOOK ?? "";
const TAG = LOOK || "default";
/** Playwright는 돌 때마다 test-results를 비우므로, 여러 안을 견주려면 `KEY_LOOK_DIR`로 밖에 남긴다 */
const DIR = process.env.KEY_LOOK_DIR ?? "test-results/key-look";

test.beforeEach(async ({ page }) => {
  await no3d(page);
  if (LOOK)
    await page.addInitScript(
      (v) => localStorage.setItem("cube.keyLook", v),
      LOOK,
    );
});

const SCHEME_COLORS: Record<string, number[]> = {
  highContrast: [0xffffff, 0xe00000, 0x00b000, 0xffee00, 0xff8a00, 0x0040ff],
  colorblind: [0xffffff, 0xd55e00, 0x009e73, 0xf0e442, 0xe69f00, 0x0072b2],
};

async function setup(
  page: Page,
  opts: { preset?: "notation"; scheme?: string },
): Promise<void> {
  const colors = opts.scheme ? SCHEME_COLORS[opts.scheme] : undefined;
  await page.addInitScript(
    (o) => {
      if (o.preset)
        localStorage.setItem(
          "cube.keymap.v1",
          JSON.stringify({
            version: 1,
            preset: o.preset,
            bindings: [],
            mouseRotate: false,
          }),
        );
      if (o.scheme)
        localStorage.setItem(
          "cube.settings.v1",
          JSON.stringify({
            version: 1,
            colorScheme: o.scheme,
            colors: o.colors,
          }),
        );
    },
    { ...opts, colors },
  );
}

async function snap(page: Page, sel: string, name: string, project: string) {
  if (!SAVE) return;
  await page
    .locator(sel)
    .first()
    .screenshot({ path: `${DIR}/${TAG}/${name}-${project}.png` });
}

test("혼자 맞추기 「두 손」: 수 하나만 크게, 면 색은 작은 표시, Shift 층은 누르는 동안만", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "세로·PC만");
  const phone = info.project.name === "phone-portrait";
  await page.goto("/cube/solo");
  await inputReady(page);
  if (phone) await page.locator("[data-cube-input-toggle]").click();
  const keys = page.locator("[data-cube-keys]");
  await expect(keys).toBeVisible();
  const key = (code: string) => keys.locator(`[data-key="${code}"]`);

  // R(I)은 빨강(면 1), R'(K)은 같은 색을 흐리게. 칸 글은 수 하나(Shift 층 Rw는 없다)
  await expect(key("KeyI")).toHaveAttribute("data-key-paint", "1");
  await expect(key("KeyK")).toHaveAttribute("data-key-paint", "1'");
  await expect(key("KeyI").locator("[data-key-label]")).toHaveText("R");
  await expect(key("KeyI")).not.toContainText("Rw");
  // 키 글자와 수가 다르면(L 키 = D') 키 글자는 작게 따로
  await expect(key("KeyL").locator("[data-key-cap]")).toHaveText("L");
  await expect(key("KeyL").locator("[data-key-label]")).toHaveText("D'");
  // 큐브 돌리기(T = x)는 색 없음, 동작 없는 키(3×3의 3)는 흐리게
  await expect(key("KeyT").locator("[data-key-mark]")).toHaveCount(0);
  await expect(key("Digit3")).toHaveAttribute("data-key-idle", "");
  await snap(page, "[data-cube-keys]", "solo-two-hand", info.project.name);

  if (!phone) {
    // Shift를 누르는 동안 넓게(Rw)가 보인다
    await page.keyboard.down("Shift");
    await expect(key("KeyI").locator("[data-key-label]")).toHaveText("Rw");
    await snap(page, "[data-cube-keys]", "solo-shift", info.project.name);
    await page.keyboard.up("Shift");
    await expect(key("KeyI").locator("[data-key-label]")).toHaveText("R");
  }
});

test("혼자 맞추기 「표기」: 키 글자와 수가 같으면 한 번만", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "세로·PC만");
  await setup(page, { preset: "notation" });
  await page.goto("/cube/solo");
  await inputReady(page);
  if (info.project.name === "phone-portrait")
    await page.locator("[data-cube-input-toggle]").click();
  const keys = page.locator("[data-cube-keys]");
  const key = (code: string) => keys.locator(`[data-key="${code}"]`);
  await expect(key("KeyR").locator("[data-key-label]")).toHaveText("R");
  await expect(key("KeyR").locator("[data-key-cap]")).toHaveCount(0);
  await expect(key("KeyR")).not.toContainText("R'");
  await snap(page, "[data-cube-keys]", "solo-notation", info.project.name);
});

for (const scheme of ["highContrast", "colorblind"] as const) {
  test(`혼자 맞추기 키 그림(${scheme})`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "PC만");
    await setup(page, { scheme });
    await page.goto("/cube/solo");
    await inputReady(page);
    await expect(
      page.locator('[data-cube-keys] [data-key="KeyI"]'),
    ).toHaveAttribute("data-key-paint", "1");
    await snap(page, "[data-cube-keys]", `solo-${scheme}`, info.project.name);
  });
}

test("배우기 해 보기: 같은 키 그림", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "PC만");
  await page.goto("/cube/learn?lesson=333-white-cross");
  const count = await page.locator('[aria-label="단계"] li').count();
  await goStep(page, count - 1);
  const keys = page.locator("[data-cube-keys]");
  await expect(keys).toBeVisible();
  await expect(keys.locator('[data-key="KeyI"] [data-key-label]')).toHaveText(
    "R",
  );
  await snap(page, "[data-cube-keys]", "learn", info.project.name);
});

test("키 익히기는 같은 규칙, 단축키 표 「모두」는 층마다 적는다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "세로·PC만");
  const phone = info.project.name === "phone-portrait";
  await page.goto("/cube/keys/learn");
  await expect(page.locator("main[data-keys-ready]")).toBeVisible();
  const map = page.locator(phone ? "[data-cube-keys]" : "[data-keyboard-map]");
  await expect(map).toBeVisible();
  // Shift 층(Rw)은 누르기 전에는 없다
  await expect(map.locator('[data-key="KeyI"]')).not.toContainText("Rw");
  await snap(
    page,
    phone ? "[data-cube-keys]" : "[data-keyboard-map]",
    "keys-learn",
    info.project.name,
  );
  await page.goto("/cube/keys");
  const table = page.locator("[data-keyboard-map]");
  await expect(table).toBeVisible();
  await expect(
    table.locator('[data-key="KeyI"] [data-layer-line="shift"]'),
  ).toHaveText("Rw");
  await snap(page, "[data-keyboard-map]", "keys-table", info.project.name);
});
