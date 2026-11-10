import type { Page } from "@playwright/test";

import { goStep, inputReady, no3d } from "./cube";
import { expect, test } from "./test";

/**
 * 키 그림 모양(2026-11-05, docs/47 4-5). 면 돌리기는 칸 바탕에 면 색을 옅게(선 없음), x·y·z는 무채색 칸에 축 면 색
 * 점선, M·E·S는 가운데 짧은 선. 칸에는 수 하나만 크게(키 글자는 작게, 같은 글자면 한 번만), Shift 층 글은 Shift를
 * 누르는 동안만, 동작 없는 키는 아주 흐리게. 색약 친화·높은 대비 배색은 주황(L) 칸 바탕에만 옅은 사선 무늬.
 * 손가락 자리는 키 익히기·단축키 표에서만 기본으로 보인다.
 *
 * `E2E_SCREENSHOTS=1`이면 키 그림마다 `test-results/key-look/`에 스크린샷을 남긴다. 3D 그림은 보지 않으므로 끈다.
 */

const SAVE = !!process.env.E2E_SCREENSHOTS;
const DIR = "test-results/key-look";

test.beforeEach(async ({ page }) => {
  await no3d(page);
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
    .screenshot({ path: `${DIR}/${name}-${project}.png` });
}

/** 혼자 맞추기의 키 그림(휴대폰은 「키보드로 치기」로 바꾼다) */
async function soloKeys(page: Page, phone: boolean) {
  await page.goto("/cube/solo");
  await inputReady(page);
  if (phone) await page.locator("[data-cube-input-toggle]").click();
  const keys = page.locator("[data-cube-keys]");
  await expect(keys).toBeVisible();
  return keys;
}

test("혼자 맞추기 「두 손」: 면은 바탕, x·y·z·M·E·S는 선, Shift 층은 누르는 동안만", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "세로·PC만");
  const phone = info.project.name === "phone-portrait";
  const keys = await soloKeys(page, phone);
  const key = (code: string) => keys.locator(`[data-key="${code}"]`);

  // R(I)은 빨강(면 1), R'(K)은 같은 색을 흐리게. 면 돌리기는 바탕에 색이 있고 선은 없다
  await expect(key("KeyI")).toHaveAttribute("data-key-paint", "1");
  await expect(key("KeyK")).toHaveAttribute("data-key-paint", "1'");
  await expect(key("KeyI").locator("[data-key-mark]")).toHaveCount(0);
  const bg = (code: string) =>
    key(code).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg("KeyI")).not.toBe(await bg("KeyK"));
  // 표준 배색은 사선 무늬가 없다
  await expect(keys.locator("[data-key-stripe]")).toHaveCount(0);
  await expect(key("KeyI").locator("[data-key-label]")).toHaveText("R");
  await expect(key("KeyI")).not.toContainText("Rw");
  // 키 글자와 수가 다르면(L 키 = D') 키 글자는 작게 따로
  await expect(key("KeyL").locator("[data-key-cap]")).toHaveText("L");
  await expect(key("KeyL").locator("[data-key-label]")).toHaveText("D'");
  // 큐브 돌리기(T = x)는 R 색 점선, 가운데 층(M·E·S)은 가운데 짧은 선. 그 칸 바탕은 무채색
  await expect(key("KeyT")).toHaveAttribute("data-key-paint", "sweep");
  await expect(
    key("KeyT").locator('[data-key-mark-shape="dotted"]'),
  ).toHaveCount(1);
  await expect(keys.locator('[data-key-mark-shape="short"]')).not.toHaveCount(
    0,
  );
  await expect(keys.locator('[data-key-mark-shape="solid"]')).toHaveCount(0);
  // 맞추는 화면은 손가락 자리를 기본으로 끈다(면 색처럼 보여 헷갈렸다)
  await expect(keys.locator("[data-key-finger]")).toHaveCount(0);
  // 동작 없는 키(3×3의 3)는 흐리게
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
  const keys = await soloKeys(page, info.project.name === "phone-portrait");
  const key = (code: string) => keys.locator(`[data-key="${code}"]`);
  await expect(key("KeyR").locator("[data-key-label]")).toHaveText("R");
  await expect(key("KeyR").locator("[data-key-cap]")).toHaveCount(0);
  await expect(key("KeyR")).not.toContainText("R'");
  await snap(page, "[data-cube-keys]", "solo-notation", info.project.name);
});

for (const scheme of ["highContrast", "colorblind"] as const) {
  test(`혼자 맞추기 키 그림(${scheme}): 주황 칸에만 사선 무늬`, async ({
    page,
  }, info) => {
    test.skip(info.project.name === "phone-landscape", "세로·PC만");
    await setup(page, { scheme });
    const keys = await soloKeys(page, info.project.name === "phone-portrait");
    await expect(keys.locator('[data-key="KeyI"]')).toHaveAttribute(
      "data-key-paint",
      "1",
    );
    // 무늬는 주황(L 면 색) 칸에만, 반대 방향(')에도 같은 무늬
    const striped = keys.locator("[data-key-stripe]");
    await expect(striped).not.toHaveCount(0);
    await expect(
      keys.locator('[data-key-stripe][data-key-paint="4\'"]'),
    ).not.toHaveCount(0);
    for (const el of await striped.all()) {
      await expect(el).toHaveAttribute("data-key-paint", /^4'?$/);
      expect(
        await el.evaluate((e) => getComputedStyle(e).backgroundImage),
      ).toContain("repeating-linear-gradient");
    }
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
  await expect(keys.locator("[data-key-finger]")).toHaveCount(0);
  await snap(page, "[data-cube-keys]", "learn", info.project.name);
});

test("키 익히기는 같은 규칙에 손가락 자리, 단축키 표 「모두」는 층마다 적는다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "세로·PC만");
  const phone = info.project.name === "phone-portrait";
  await page.goto("/cube/intro?part=keys");
  await expect(page.locator("[data-keys-ready]")).toBeVisible();
  const sel = phone ? "[data-cube-keys]" : "[data-keyboard-map]";
  const map = page.locator(sel);
  await expect(map).toBeVisible();
  // Shift 층(Rw)은 누르기 전에는 없다
  await expect(map.locator('[data-key="KeyI"]')).not.toContainText("Rw");
  // 키를 익히는 화면은 손가락 자리가 늘 보인다
  await expect(map.locator("[data-key-finger]")).not.toHaveCount(0);
  await snap(page, sel, "keys-learn", info.project.name);
  await page.goto("/cube/keys");
  const table = page.locator("[data-keyboard-map]");
  await expect(table).toBeVisible();
  await expect(
    table.locator('[data-key="KeyI"] [data-layer-line="shift"]'),
  ).toHaveText("Rw");
  await expect(table.locator("[data-key-finger]")).not.toHaveCount(0);
  await snap(page, "[data-keyboard-map]", "keys-table", info.project.name);
});
