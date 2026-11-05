import type { Locator, Page } from "@playwright/test";

import { inputReady, installClock, no3d, pauseClock, shot } from "./cube";
import { expect, test } from "./test";

/**
 * 화면 키보드(2026-11-05, docs/47 4-5): 키 그림의 칸을 눌러 수를 친다. 칸은 진짜 키처럼 keydown을 보내므로 해석기·
 * 사용자 배치(기본 「두 손」: I = R, K = R', J = U, F = U', Shift = 넓게)를 그대로 따른다. 판정은 같은 길을 해석기에
 * 이어 보는 단위 시험(VirtualKeys.test.ts)이 맡고, 여기서는 누르면 큐브가 도는지를 펼친 그림 칸 색으로 본다.
 * 3D 그림은 보지 않으므로 끈다.
 */

test.beforeEach(({ page }) => no3d(page));

/** 펼친 그림 칸 색(큐브 상태) */
const netColors = (page: Page) =>
  page
    .locator("[data-cube-net] rect")
    .evaluateAll((rs) => rs.map((r) => r.getAttribute("fill")).join(","));

async function press(target: Locator, phone: boolean): Promise<void> {
  if (phone) await target.tap();
  else await target.click();
}

test("혼자 맞추기: 키 그림을 눌러 R·U'·Shift+R(넓게)을 치고 되돌린다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "세로·PC만");
  const phone = info.project.name === "phone-portrait";
  // 눌림 표시(잠깐 빛남)를 시계로 정확히 본다
  await installClock(page);
  await page.goto("/cube/solo");
  await inputReady(page);
  await pauseClock(page);
  const keys = page.locator("[data-cube-keys]");
  const buttons = page.locator("[data-cube-buttons]");

  if (phone) {
    // 휴대폰 기본은 수 단추 줄. 「키보드로 치기」를 누르면 단추 줄 대신 키 그림
    await expect(buttons).toBeVisible();
    await expect(keys).toBeHidden();
    await page.locator("[data-cube-input-toggle]").click();
    await expect(page.locator("[data-cube-input-toggle]")).toHaveAttribute(
      "data-cube-input-toggle",
      "keys",
    );
    await expect(buttons).toBeHidden();
  }
  await expect(keys).toBeVisible();

  const key = (code: string) => keys.locator(`[data-key="${code}"]`);
  // 잘못 누르지 않게: 칸이 손가락 크기쯤(너비 30px·높이 40px 이상)이고 가로로 넘치지 않는다
  const box = await key("KeyI").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(30);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const solved = await netColors(page);
  const turned = async () =>
    expect.poll(() => netColors(page)).not.toBe(solved);
  const back = async () => expect.poll(() => netColors(page)).toBe(solved);

  // R(I): 돌고, 누른 칸이 잠깐 빛난다
  await press(key("KeyI"), phone);
  await turned();
  await expect(key("KeyI")).toHaveAttribute("data-key-state", "pressed");
  await page.clock.fastForward(300);
  await expect(key("KeyI")).not.toHaveAttribute("data-key-state", "pressed");
  // R'(K)로 되돌아온다
  await press(key("KeyK"), phone);
  await back();

  // U'(F) → U(J)
  await press(key("KeyF"), phone);
  await turned();
  await press(key("KeyJ"), phone);
  await back();

  // Shift 토글: 켜면 칸 글이 넓게(Rw)로 바뀌고, 다음 키 하나에 붙고 꺼진다
  const shift = keys.locator('[data-key-mod="shift"]');
  await press(shift, phone);
  await expect(shift).toHaveAttribute("aria-pressed", "true");
  await expect(key("KeyI")).toContainText("Rw");
  await press(key("KeyI"), phone);
  await expect(shift).toHaveAttribute("aria-pressed", "false");
  const wide = await netColors(page);
  expect(wide).not.toBe(solved);
  // 넓게는 R과 다르다: R을 치고 견준다
  await press(key("KeyK"), phone);
  await expect.poll(() => netColors(page)).not.toBe(wide);
  await press(key("KeyI"), phone);
  await expect.poll(() => netColors(page)).toBe(wide);
  // Shift+K(Rw')로 되돌아온다
  await press(shift, phone);
  await press(key("KeyK"), phone);
  await back();

  // 되돌리기 칸
  await press(key("KeyI"), phone);
  await turned();
  await press(keys.locator('[data-key-press="undo"]'), phone);
  await back();
  await shot(page, "virtual-keys-solo", info.project.name);

  if (phone) {
    // 고른 것은 남는다(다시 열어도 키 그림)
    await page.reload();
    await inputReady(page);
    await expect(keys).toBeVisible();
    await expect(buttons).toBeHidden();
  }
});

test("키 익히기: 키보드 없는 기기도 키 그림을 눌러 단계를 마친다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "세로·PC만");
  const phone = info.project.name === "phone-portrait";
  await page.goto("/cube/keys/learn");
  await expect(page.locator("main[data-keys-ready]")).toBeVisible();
  const main = page.locator("main[data-learn-step]");
  await expect(main).toHaveAttribute("data-learn-step", "home");
  // 키보드 없는 휴대폰은 맨 위에서 키 그림으로 치는 법과 배우기로 가는 길을 알린다(막다른 길이 되지 않게)
  const note = page.locator("[data-learn-no-keyboard]");
  if (phone) {
    await expect(note).toBeVisible();
    await expect(note.getByRole("link")).toHaveAttribute("href", "/cube/learn");
  } else await expect(note).toHaveCount(0);
  // 휴대폰은 누르기 쉬운 작은 키 그림, 데스크톱은 큰 키보드 그림(둘 다 누를 수 있다)
  const map = page.locator(phone ? "[data-cube-keys]" : "[data-keyboard-map]");
  await expect(map).toBeVisible();
  await press(map.locator('[data-key="KeyF"]'), phone);
  await press(map.locator('[data-key="KeyJ"]'), phone);
  await expect(main).toHaveAttribute("data-learn-finished", "");
  await shot(page, "virtual-keys-learn", info.project.name);
});
