import type { Page } from "@playwright/test";
import { ONLY_DESKTOP } from "./projects";
import { expect, test } from "./test";
import { renderedLines } from "./word-wrap";

/**
 * 해법 배우기(/cube/methods)의 해법 카드와 지도(docs/47 16-30). 첫 모습은 해법 카드 세로, 「전체 보기」는 지도,
 * 카드를 누르면 해법 화면. 여러 해법 고르기, 「나」 표시, 큰 큐브 「3×3 맞추기」 펼치기, 휴대폰 폭 줄바꿈.
 */

/** 이 기기의 배우기 진행(초보자 아래 두 층까지 끝냄, 노란 십자는 하는 중, 2단계 OLL·CFOP 십자·루 첫 블록 끝냄) */
async function withProgress(page: Page) {
  const done = { passed: [], done: true };
  const progress = {
    lessons: {
      "333-start": done,
      "333-piece-moves": done,
      "333-notation": done,
      "333-safe-turns": done,
      "333-white-cross": done,
      "333-first-corners-up": done,
      "333-second-layer": done,
      "333-ll-cross": { passed: [1], done: false },
      "cfop-2look-oll": done,
      "cfop-cross": done,
      "roux-fb": done,
    },
  };
  await page.addInitScript((value) => {
    localStorage.setItem("cube.learn.v1", value);
  }, JSON.stringify(progress));
}

const cardIds = (page: Page) =>
  page
    .locator("[data-card]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-card")));

test("해법 배우기 첫 모습: 해법 카드가 초보자 → 고급 차례로 세로, CFOP 띠는 큰 단계(다 섞임 + 십자·F2L·OLL·PLL), 앞 카드와 같은 단계는 표시로 묶는다", async ({
  page,
}) => {
  await page.goto("/cube/methods");
  await expect(page.locator('[data-method-cards="3"]')).toBeVisible();
  expect(await cardIds(page)).toEqual([
    "beginner",
    "beginner-twist-first",
    "two-look",
    "cfop",
    "roux",
    "zz",
    "petrus",
  ]);
  const cfop = page.locator('[data-card="cfop"]');
  await expect(cfop.locator("[data-strip-node]")).toHaveCount(5);
  await expect(cfop.locator('[data-strip-node="pair-1"]')).toHaveCount(0);
  await expect(cfop.locator("[data-card-total]")).toHaveText("공식 87 · 55수");
  // 십자·아래 두 층은 초보자와, 노란 면은 2단계와 같은 단계
  expect(
    await cfop
      .locator("[data-strip-node]")
      .evaluateAll((els) =>
        els.map(
          (el) =>
            `${el.getAttribute("data-strip-node")}:${el.getAttribute("data-same-as") ?? ""}`,
        ),
      ),
  ).toEqual([
    "scrambled:",
    "cross:beginner",
    "f2l:beginner",
    "oll:two-look",
    "solved:",
  ]);
  await expect(
    cfop.locator('[data-strip-node="oll"] [data-strip-same]'),
  ).toHaveText("OLL·PLL과 같음");
  // 시안 고르기 단추·견본 기록은 없다
  await expect(page.getByRole("button", { name: "견본 기록" })).toHaveCount(0);
  // 강의 목록(단원·연습)은 카드 아래에 그대로
  await expect(
    page.locator('[data-course-size="3"] [data-course="cfop"]'),
  ).toBeVisible();
  // 접은 해법은 「다른 해법」으로 펼친다
  await page.locator("[data-more-methods]").click();
  await expect(page.locator('[data-card="zz-zbll"]')).toBeVisible();
  await expect(page).toHaveURL(/more=1/);
});

test("해법 카드를 누르면 해법 화면에서 세부 걸음과 그 해법의 강의를 보고, 단원 없는 걸음은 누를 수 없고, ← 해법 목록으로 돌아온다", async ({
  page,
}) => {
  await page.goto("/cube/methods");
  await page.locator('[data-card="cfop"]').click();
  await expect(page).toHaveURL(/\/cube\/methods\?method=cfop$/);
  const screen = page.locator('[data-method-screen="cfop"]');
  await expect(screen.locator("li [data-edge]")).toHaveCount(7);
  await expect(
    screen.locator('[data-method-course] [data-course="cfop"]'),
  ).toBeVisible();
  await screen.locator("[data-method-back]").click();
  await expect(page).toHaveURL(/\/cube\/methods$/);
  await expect(page.locator('[data-card="cfop"]')).toBeVisible();
  await page.goto("/cube/methods?method=beginner-twist-first");
  await expect(
    page.locator('[data-method-screen] [data-edge="twist-first-place"]'),
  ).toHaveAttribute("aria-disabled", "true");
});

test("전체 보기: 지도는 「다 섞임」에서 시작하고 기록이 없으면 「나」도 거기, 초보자 길의 꼬리표는 그 단원으로 간다", async ({
  page,
}) => {
  await page.goto("/cube/methods");
  await page.locator("[data-open-map]").click();
  await expect(page).toHaveURL(/view=map/);
  await expect(page.locator('[data-solve-map="map"]')).toBeVisible();
  await expect(page.locator('[data-node="scrambled"] [data-me]')).toBeVisible();
  await expect(page.locator("[data-node] [data-me]")).toHaveCount(1);
  await expect(page.locator('[data-edge="first-corners"]')).toHaveAttribute(
    "href",
    "/cube/learn?lesson=333-first-corners-up",
  );
  // 단원이 없는 걸음(코너 방향 먼저)은 누를 수 없다
  await expect(page.locator('[data-edge="twist-first"]')).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.locator("[data-map-close]").click();
  await expect(page.locator('[data-method-cards="3"]')).toBeVisible();
  await expect(page).not.toHaveURL(/view=map/);
});

test("전체 보기: 해법을 여럿 고르면 주소에 담기고 고른 해법의 길만 선이 그려진다", async ({
  page,
}) => {
  await page.goto("/cube/methods?view=map&sel=beginner");
  await expect(page.locator('[data-solve-map="map"]')).toBeVisible();
  await page.locator('[data-method="cfop"]').click();
  await expect(page).toHaveURL(/sel=beginner%2Ccfop/);
  await expect(page.locator('[data-edge-line="f2l-pair-1"]')).toHaveCount(1);
  await expect(page.locator('[data-edge-line="roux-fb"]')).toHaveCount(0);
  // 두 해법이 함께 지나는 십자 길은 선 둘
  await expect(page.locator('[data-edge-line="cross"]')).toHaveCount(2);
});

/**
 * 지도 안 상자(지점 그림·이름, 걸음 꼬리표) 가운데 주인이 다른 둘이 겹치는 쌍. 같은 지점의 그림·이름끼리는
 * 한 덩이라 보지 않는다. 「나」 표시는 지점 모서리에 일부러 걸쳐 두어 뺀다
 */
async function overlaps(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-map-content]");
    if (!root) return ["지도 없음"];
    type Box = { owner: string; what: string; r: DOMRect };
    const boxes: Box[] = [];
    const add = (sel: string, owner: (el: Element) => string) => {
      for (const el of root.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0)
          boxes.push({ owner: owner(el), what: sel, r });
      }
    };
    const nodeOf = (el: Element) =>
      el.closest("[data-node]")?.getAttribute("data-node") ?? "?";
    add("[data-node] [data-node-part]", (el) => `node:${nodeOf(el)}`);
    add("[data-edge]", (el) => `edge:${el.getAttribute("data-edge")}`);
    const out: string[] = [];
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1)) {
        if (a.owner === b.owner) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 1 && h > 1) out.push(`${a.owner} × ${b.owner}`);
      }
    return out;
  });
}

test("전체 보기: 지점 그림·이름·꼬리표가 서로 겹치지 않는다(전체 보기·확대, 3×3·다른 해법·4×4, 기록 있음)", async ({
  page,
}) => {
  await withProgress(page);
  for (const [n, q] of [
    [3, "sel=beginner"],
    [3, "sel=beginner,cfop,zz&more=1"],
    [4, ""],
  ] as const) {
    await page.addInitScript((size) => {
      localStorage.setItem("cube.size.v1", JSON.stringify({ v: 1, n: size }));
    }, n);
    await page.goto(`/cube/methods?view=map&${q}`);
    await expect(page.locator('[data-solve-map="map"]')).toBeVisible();
    await expect(page.locator("[data-node]").first()).toBeVisible();
    expect(await overlaps(page), `${n} ${q} 전체 보기`).toEqual([]);
    const zoom = page.locator("[data-map-content]");
    const before = await zoom.getAttribute("data-map-zoom");
    for (let i = 0; i < 3; i++)
      await page.getByRole("button", { name: "크게" }).click();
    await expect(zoom).not.toHaveAttribute("data-map-zoom", before ?? "");
    expect(await overlaps(page), `${n} ${q} 확대`).toEqual([]);
  }
});

test("전체 보기: 처음에는 지도 전체가 한 화면에 들어오고 페이지는 스크롤되지 않는다", async ({
  page,
}) => {
  await page.goto("/cube/methods?view=map&sel=beginner");
  const frame = page.locator("[data-map-frame]");
  await expect(frame).toBeVisible();
  const f = await frame.boundingBox();
  const content = page.locator("[data-map-content]");
  const c = await content.boundingBox();
  expect(f && c).toBeTruthy();
  if (!f || !c) return;
  expect([
    c.x >= f.x - 1,
    c.y >= f.y - 1,
    c.x + c.width <= f.x + f.width + 1,
    c.y + c.height <= f.y + f.height + 1,
  ]).toEqual([true, true, true, true]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    ),
  ).toBeLessThanOrEqual(0);
  // 「처음 자리로」도 이 전체 보기로
  await page.getByRole("button", { name: "크게" }).click();
  await page.getByRole("button", { name: "처음 자리로" }).click();
  const c2 = await content.boundingBox();
  expect(c2 && Math.round(c2.width)).toBe(Math.round(c.width));
});

test("기록이 있으면 지나온 길에 「나」, 카드에는 끝낸 단계에 ✓", async ({
  page,
}) => {
  await withProgress(page);
  await page.goto("/cube/methods");
  const beginner = page.locator('[data-card="beginner"]');
  await expect(
    beginner.locator('[data-strip-node="f2l"] [data-me]'),
  ).toBeVisible();
  await expect(
    beginner.locator('[data-strip-node="f2l"] [data-strip-name]'),
  ).toHaveText("✓ 아래 두 층");
  await page.goto("/cube/methods?view=map&sel=beginner");
  await expect(page.locator('[data-node="f2l"] [data-me]')).toBeVisible();
});

test("전체 보기 4×4: 「3×3 맞추기」는 그 자리에서 펼치고, 3×3 지도에 들렀다 「← 4×4」로 펼친 채 돌아온다(크기 단추는 4×4 그대로)", async ({
  page,
}) => {
  await page.goto("/cube/methods");
  await page.locator('[data-size-tab="4"]').click();
  await page.locator("[data-open-map]").click();
  await page.locator('[data-edge="444-reduction:333"]').click();
  const panel = page.locator("[data-finish-panel]");
  await expect(panel).toHaveAttribute("data-finish-panel", "beginner");
  await expect(page).toHaveURL(/x=beginner/);
  // 고리는 초보자의 패리티 자리(둘째 층 엣지 뒤, 옆면 맞추기 뒤)에 한국 이름으로
  await expect(panel.locator("[data-parity-loop]")).toHaveText([
    /^토끼이빨OLL 패리티/,
    /^바보토끼이빨PLL 패리티/,
  ]);
  await panel.locator('[data-finish-method="cfop"]').click();
  await panel.locator("[data-finish-hop]").click();
  await expect(page).toHaveURL(/[?&]from=4(&|$)/);
  const q = new URL(page.url()).searchParams;
  expect([q.get("view"), q.get("x"), q.get("sel")]).toEqual([
    "map",
    "cfop",
    "cfop",
  ]);
  await expect(
    page.locator('[data-map-sizes] [data-size="4"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-map-back]").click();
  await expect(page).not.toHaveURL(/from=/);
  await expect(panel).toHaveAttribute("data-finish-panel", "cfop");
});

test("휴대폰 폭(320·375·390·430)과 PC에서 카드·지도는 가로로 넘치지 않고, 카드 칸 이름·같음 표시는 낱말 중간에서 줄이 바뀌지 않고 두 줄을 넘지 않는다", {
  tag: ONLY_DESKTOP,
}, async ({ page }) => {
  for (const w of [320, 375, 390, 430, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/cube/methods?more=1");
    await expect(page.locator('[data-card="zz-zbll"]')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
      `${w} 카드 가로 넘침`,
    ).toBeLessThanOrEqual(0);
    const texts = page.locator(
      "[data-card] [data-strip-name], [data-card] [data-strip-same]",
    );
    const bad: string[] = [];
    for (const el of await texts.all()) {
      const lines = await renderedLines(el);
      const words = (await el.innerText()).split(/\s+/).filter(Boolean);
      const lineWords = lines.flatMap((l) => l.split(/\s+/).filter(Boolean));
      if (lines.length > 2 || lineWords.join("|") !== words.join("|"))
        bad.push(lines.join(" / "));
    }
    expect(bad, `${w} 칸 글 줄바꿈`).toEqual([]);
    await page.goto("/cube/methods?view=map&sel=beginner");
    await expect(page.locator('[data-solve-map="map"]')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
      `${w} 지도 가로 넘침`,
    ).toBeLessThanOrEqual(0);
  }
});
