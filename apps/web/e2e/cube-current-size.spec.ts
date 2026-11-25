import { no3d, pickSize, presetCurrentSize, shot } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 「지금 크기」(docs/47 16-28): 사이트가 큐브 크기 하나를 기억한다.
 * - 하는 화면은 지금 크기로 열고, 화면 안에서 바꾸면 지금 크기도 바뀐다.
 * - 보는 화면은 지금 크기로 열되, 화면 안에서 바꿔도 지금 크기는 그대로다.
 * - 그 화면에 없는 크기면 지금 크기는 그대로 두고 그 화면은 3×3으로 연다.
 * 판정은 화면마다 크기 단추의 고른 값(`data-value`·`aria-pressed`)으로 한다. 크기 자체의 저장 규칙은
 * `src/cube/current-size.test.ts`, 대결방 처음 크기는 `online/room.test.ts`가 본다.
 */

test.beforeEach(({ page }) => no3d(page));

/** 첫 화면의 지금 크기 */
async function homeSize(page: Page): Promise<string | null> {
  await page.goto("/cube");
  const picker = page.locator("[data-cube-home-size]");
  await expect(picker.locator("[aria-pressed='true']")).toHaveCount(1);
  return picker.getAttribute("data-value");
}

const pressed = (page: Page, selector: string) =>
  expect(page.locator(selector)).toHaveAttribute("aria-pressed", "true");

test("하는 화면은 첫 화면에서 고른 지금 크기로 열린다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await page.goto("/cube");
  await pickSize(page, "[data-cube-home-size]", 4);
  await expect(page.locator("[data-cube-hero]")).toHaveAttribute(
    "data-hero-n",
    "4",
  );

  await page.goto("/cube/solo");
  await expect(page.locator("[data-cube-size]")).toHaveAttribute(
    "data-value",
    "4",
  );
  await page.goto("/cube/blind");
  await expect(page.locator("[data-cube-size]")).toHaveAttribute(
    "data-value",
    "4",
  );
  await page.goto("/cube/daily");
  await expect(page.locator("[data-cube-size]")).toHaveAttribute(
    "data-value",
    "4",
  );
  await page.goto("/cube/vs");
  await expect(page.locator("[data-cube-vs-size]")).toHaveAttribute(
    "data-value",
    "4",
  );
  await page.goto("/cube/timer");
  await expect(page.locator("nav[data-cube-event]")).toHaveAttribute(
    "data-cube-event",
    "444",
  );
  await page.goto("/cube/methods");
  await pressed(page, '[data-size-tab="4"]');
  await expect(page.locator("[data-course-size]")).toHaveAttribute(
    "data-course-size",
    "4",
  );
  await page.goto("/cube/patterns");
  await expect(page.locator("[data-pattern-size]")).toHaveAttribute(
    "data-pattern-size",
    "4",
  );
  await expect(page.locator("[data-mine-size]")).toHaveAttribute(
    "data-value",
    "4",
  );
  await page.goto("/cube/patterns?tab=make");
  await pressed(page, '[data-cube-shape-size="4"]');
  await page.goto("/cube/keys");
  await pressed(page, '[data-size="4"]');
  // 보는 화면도 지금 크기로 열린다
  await page.goto("/cube/tiers");
  await pressed(page, '[data-cube-tier-size="4"]');
  await page.goto("/cube/math#count");
  await expect(page.locator("[data-count-size]")).toHaveAttribute(
    "data-count-size",
    "4",
  );
});

test("하는 화면에서 크기를 바꾸면 지금 크기가 바뀌어 다른 화면도 따라간다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await page.goto("/cube/solo");
  await pickSize(page, "[data-cube-size]", 5);
  expect(await homeSize(page)).toBe("5");

  await page.goto("/cube/timer");
  await page.locator('[data-cube-timer-size] [data-size-option="2"]').click();
  expect(await homeSize(page)).toBe("2");
  // 블라인드를 켜면 3×3 블라인드, 지금 크기도 3×3
  await page.goto("/cube/timer");
  await page.locator("[data-cube-event-blind]").click();
  await expect(page.locator("nav[data-cube-event]")).toHaveAttribute(
    "data-cube-event",
    "333bf",
  );
  expect(await homeSize(page)).toBe("3");

  await page.goto("/cube/methods");
  await page.locator('[data-size-tab="2"]').click();
  expect(await homeSize(page)).toBe("2");

  await page.goto("/cube/patterns?tab=make");
  await page.locator('[data-cube-shape-size="4"]').click();
  expect(await homeSize(page)).toBe("4");

  await page.goto("/cube/keys");
  await page.locator('[data-size="7"]').click();
  expect(await homeSize(page)).toBe("7");

  await page.goto("/cube/vs");
  await pickSize(page, "[data-cube-vs-size]", 2);
  expect(await homeSize(page)).toBe("2");

  await page.goto("/cube/patterns");
  await pickSize(page, "[data-pattern-sizes]", 5);
  expect(await homeSize(page)).toBe("5");
});

test("보는 화면에서 크기를 바꿔도 지금 크기는 그대로다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await page.goto("/cube");
  await pickSize(page, "[data-cube-home-size]", 5);

  await page.goto("/cube/tiers");
  await page.locator('[data-cube-tier-size="2"]').click();
  await expect(page.locator("main[data-cube-tiers]")).toHaveAttribute(
    "data-cube-tiers",
    "2",
  );
  expect(await homeSize(page)).toBe("5");

  // 주소 ?n=로 연 티어표는 주소가 이기고, 지금 크기는 바꾸지 않는다
  await page.goto("/cube/tiers?n=7");
  await pressed(page, '[data-cube-tier-size="7"]');
  expect(await homeSize(page)).toBe("5");

  await page.goto("/cube/math#count");
  await page.locator('[data-count-tab="2"]').click();
  await expect(page.locator("[data-count-size]")).toHaveAttribute(
    "data-count-size",
    "2",
  );
  // 같은 페이지에서 해시만 바꾸면 카드를 다시 읽지 않아 첫 화면을 들른다
  expect(await homeSize(page)).toBe("5");
  await page.goto("/cube/math#sizes");
  await pressed(page, '[data-sizes-tab="5"]');
  await page.locator('[data-sizes-tab="6"]').click();
  expect(await homeSize(page)).toBe("5");

  // 해법 배우기를 과정 주소(?m=)로 열면 그 과정 크기를 보이되 지금 크기는 그대로
  await page.goto("/cube/methods?m=222-beginner");
  await pressed(page, '[data-size-tab="2"]');
  expect(await homeSize(page)).toBe("5");
});

test("그 화면에 없는 크기면 3×3으로 열리고 지금 크기는 그대로다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await presetCurrentSize(page, 6);
  for (const [path, picker] of [
    ["/cube/vs", "[data-cube-vs-size]"],
    ["/cube/challenge", "[data-cube-size]"],
    ["/cube/daily", "[data-cube-size]"],
    ["/cube/patterns", "[data-pattern-sizes]"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(picker)).toHaveAttribute("data-value", "3");
  }
  await page.goto("/cube/methods");
  await pressed(page, '[data-size-tab="3"]');
  await page.goto("/cube/patterns?tab=make");
  await pressed(page, '[data-cube-shape-size="3"]');
  // 6×6은 단축키 표·혼자 맞추기·티어표에는 있다
  await page.goto("/cube/keys");
  await pressed(page, '[data-size="6"]');
  await page.goto("/cube/solo");
  await expect(page.locator("[data-cube-size]")).toHaveAttribute(
    "data-value",
    "6",
  );
  // 크기와 패리티 카드(4×4~7×7)
  await page.goto("/cube/math#sizes");
  await pressed(page, '[data-sizes-tab="6"]');
  expect(await homeSize(page)).toBe("6");
});

test("다른 탭에서 지금 크기를 바꾸면 열려 있는 화면이 따라간다", {
  tag: "@only-desktop",
}, async ({ context }) => {
  await no3d(context);
  const keys = await context.newPage();
  await keys.goto("/cube/keys");
  await pressed(keys, '[data-size="3"]');
  const home = await context.newPage();
  await home.goto("/cube");
  await pickSize(home, "[data-cube-home-size]", 7);
  await pressed(keys, '[data-size="7"]');
});

test("친구와 대결: 방장이 만든 방의 처음 크기는 방장의 지금 크기", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await page.goto("/cube");
  await pickSize(page, "[data-cube-home-size]", 4);
  await page.goto("/cube/online?net=local");
  await page.locator("[data-cube-enter]").click();
  await expect(page.locator("[data-cube-room-size]")).toHaveAttribute(
    "data-value",
    "4",
  );
  // 방에서 크기를 고르면 방장의 지금 크기도 바뀐다
  await pickSize(page, "[data-cube-room-size]", 2);
  expect(await homeSize(page)).toBe("2");
});

// 사람이 보는 스크린샷만: 크기 단추가 있는 화면들(휴대폰 폭에서 넘치지 않는지 눈으로 본다)
test("크기 단추 생김새(스크린샷)", async ({ page }, info) => {
  test.skip(!SAVE_SCREENSHOTS, "스크린샷을 찍을 때만");
  await page.goto("/cube");
  await pickSize(page, "[data-cube-home-size]", 4);
  await shot(page, "size-home", info.project.name);
  for (const [path, name] of [
    ["/cube/solo", "solo"],
    ["/cube/timer", "timer"],
    ["/cube/vs", "vs"],
    ["/cube/methods", "methods"],
    ["/cube/patterns", "patterns"],
    ["/cube/patterns?tab=make", "shape"],
    ["/cube/keys", "keys"],
    ["/cube/tiers", "tiers"],
    ["/cube/math#count", "math-count"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("[data-cube-size-picker]").first()).toBeVisible();
    await shot(page, `size-${name}`, info.project.name);
  }
  // 친구와 대결은 키보드가 있는 기기에서만 들어간다
  if (info.project.name !== "desktop") return;
  await page.goto("/cube/online?net=local");
  await page.locator("[data-cube-enter]").click();
  await expect(page.locator("[data-cube-room-size]")).toBeVisible();
  await shot(page, "size-room", info.project.name);
});
