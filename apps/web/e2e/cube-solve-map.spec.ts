import type { Page } from "@playwright/test";
import { ONLY_DESKTOP } from "./projects";
import { expect, test } from "./test";
import { renderedLines } from "./word-wrap";

/**
 * 해법 배우기(/cube/methods)의 해법 카드와 지도(docs/47 16-30). 첫 모습은 해법 카드 세로, 「전체 보기」는 지도,
 * 카드를 누르면 해법 화면. 여러 해법 고르기, 진도 밝기, 같은 단계·「나」 표시 없음, 큰 큐브 「3×3 맞추기」 펼치기,
 * 휴대폰 폭 줄바꿈.
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

test("해법 배우기 첫 모습: 해법 카드가 초보자 → 고급 차례로 세로, CFOP 띠는 큰 단계(다 섞임 + 십자·F2L·OLL·PLL)", async ({
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
  await expect(cfop.locator("[data-card-total]")).toHaveText(
    "공식 87개 · 55수",
  );
  expect(
    await cfop
      .locator("[data-strip-node]")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-strip-node")),
      ),
  ).toEqual(["scrambled", "cross", "f2l", "oll", "solved"]);
  // 2단계 OLL·PLL은 OLL 둘·PLL 둘이 띠에 보인다
  expect(
    await page
      .locator('[data-card="two-look"] [data-strip-name]')
      .allInnerTexts(),
  ).toEqual([
    "다 섞임",
    "아래 두 층",
    "노란 십자",
    "노란 면",
    "코너 자리",
    "다 맞음",
  ]);
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
  // 짝 넷을 넣는 F2L은 한 걸음(같은 일을 되풀이하는 걸음은 하나로)
  expect(
    await screen
      .locator("li [data-edge]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-edge"))),
  ).toEqual(["cross", "f2l", "oll", "pll"]);
  await expect(
    screen.locator('[data-method-course] [data-course="cfop"]'),
  ).toBeVisible();
  await screen.locator("[data-method-back]").click();
  await expect(page).toHaveURL(/\/cube\/methods$/);
  await expect(page.locator('[data-card="cfop"]')).toBeVisible();
  // 코너 방향 먼저의 마지막 층 걸음은 그 강의 단원으로 간다(docs/47 16-33)
  await page.goto("/cube/methods?method=beginner-twist-first");
  await expect(
    page.locator('[data-method-screen] [data-edge="twist-first-edges"]'),
  ).toHaveAttribute("href", "/cube/learn?lesson=333-tf-edges");
  await page.goto("/cube/methods?method=petrus");
  await expect(
    page.locator('[data-method-screen] [data-edge="petrus-f2l"]'),
  ).toHaveAttribute("aria-disabled", "true");
});

test("전체 보기: 지도는 「다 섞임」에서 시작하고, 초보자 길의 꼬리표는 그 단원으로 간다", async ({
  page,
}) => {
  await page.goto("/cube/methods");
  await page.locator("[data-open-map]").click();
  await expect(page).toHaveURL(/view=map/);
  await expect(page.locator('[data-solve-map="map"]')).toBeVisible();
  await expect(page.locator('[data-node="scrambled"]')).toBeVisible();
  await expect(page.locator('[data-edge="first-corners"]')).toHaveAttribute(
    "href",
    "/cube/learn?lesson=333-first-corners-up",
  );
  // 코너 방향 먼저 길의 꼬리표도 그 강의 단원으로 간다
  await expect(page.locator('[data-edge="twist-first-face"]')).toHaveAttribute(
    "href",
    "/cube/learn?lesson=333-tf-face",
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
  // CFOP F2L은 선 하나(짝마다 나누지 않는다)
  await expect(page.locator('[data-edge-line="f2l"]')).toHaveCount(1);
  await expect(page.locator('[data-edge-line="roux-fb"]')).toHaveCount(0);
  // 두 해법이 함께 지나는 십자 길은 선 둘
  await expect(page.locator('[data-edge-line="cross"]')).toHaveCount(2);
});

test("전체 보기: 고르지 않은 해법의 걸음 꼬리표도 단계 이름·공식 수·평균 수를 고른 길과 같은 모습으로 보인다", async ({
  page,
}) => {
  await page.goto("/cube/methods?view=map&sel=beginner");
  await expect(page.locator('[data-solve-map="map"]')).toBeVisible();
  // CFOP는 고르지 않았지만 F2L 걸음에 이름과 공식 수가 있다
  const f2l = page.locator('[data-edge="f2l"]');
  await expect(f2l).toContainText("F2L");
  await expect(f2l).toContainText("공식 9개 · 23수");
  // 해법 칩의 공식 수도 개수로 읽힌다(「공식 87」은 87번 공식처럼 읽힌다)
  await expect(page.locator('[data-method="cfop"]')).toContainText("공식 87개");
  // 고른 길(초보자 흰 십자)과 같은 모습(포커스로 바꾸지 않는다)
  expect(await f2l.getAttribute("class")).toBe(
    await page.locator('[data-edge="cross"]').getAttribute("class"),
  );
  // 해법을 골라도 지점 자리는 그대로(꼬리표 크기를 고른 해법과 상관없이 어림한다)
  const at = () =>
    page
      .locator('[data-node="f2l"]')
      .evaluate(
        (el) =>
          `${(el as HTMLElement).style.left},${(el as HTMLElement).style.top}`,
      );
  const before = await at();
  await page.locator('[data-method="cfop"]').click();
  await expect(page).toHaveURL(/sel=beginner%2Ccfop/);
  expect(await at()).toBe(before);
});

/**
 * 지도 안 상자(지점 그림·이름, 걸음 꼬리표, 패리티 고리 칸) 가운데 주인이 다른 둘이 겹치는 쌍. 같은 지점의 그림·이름끼리는
 * 한 덩이라 보지 않는다
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
    // 패리티 고리 칸(큰 큐브 지도, 4×4에서 들른 3×3 지도)
    add(
      "[data-parity-loop]",
      (el) => `loop:${el.getAttribute("data-parity-loop")}`,
    );
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

/** 겹침을 볼 지도: 크기마다 기본·여러 해법, 3×3은 다른 해법 펼침·모든 해법, 큰 큐브 「3×3 맞추기」 펼침과 들르기 */
const OVERLAP_MAPS = [
  [2, ""],
  [2, "sel=222-beginner,222-from333,ortega"],
  [3, "sel=beginner"],
  [3, "sel=beginner,cfop,zz&more=1"],
  [
    3,
    "sel=beginner,beginner-twist-first,two-look,cfop,roux,zz,petrus,zz-coll,zz-zbll,cfop-1lll,corners-first&more=1",
  ],
  [3, "sel=cfop&from=4&x=cfop"],
  [4, ""],
  [4, "sel=444-reduction,444-yau"],
  [4, "sel=444-reduction&x=beginner"],
  [5, ""],
] as const;

test("전체 보기: 지점 그림·이름·꼬리표가 서로 겹치지 않는다(전체 보기·확대, 2×2~5×5·여러 해법·다른 해법·펼침, 기록 있음)", async ({
  page,
}) => {
  await withProgress(page);
  for (const [n, q] of OVERLAP_MAPS) {
    await page.addInitScript((size) => {
      localStorage.setItem("cube.size.v1", JSON.stringify({ v: 1, n: size }));
    }, n);
    await page.goto(`/cube/methods?view=map&${q}`);
    await expect(page.locator('[data-solve-map="map"]')).toBeVisible();
    await expect(page.locator("[data-node]").first()).toBeVisible();
    // 한 지도에서 멈추지 않고 모든 지도의 겹침을 한 번에 보인다(soft)
    expect.soft(await overlaps(page), `${n} ${q} 전체 보기`).toEqual([]);
    const zoom = page.locator("[data-map-content]");
    const before = await zoom.getAttribute("data-map-zoom");
    for (let i = 0; i < 3; i++)
      await page.getByRole("button", { name: "크게" }).click();
    await expect(zoom).not.toHaveAttribute("data-map-zoom", before ?? "");
    expect.soft(await overlaps(page), `${n} ${q} 확대`).toEqual([]);
  }
});

/** 지점 이름이 화면에 그려진 글자 크기(px): 글씨 크기 × 지도 배율 */
async function nameFontPx(page: Page, node: string) {
  return page.evaluate((id) => {
    const el = document.querySelector(
      `[data-node="${id}"] [data-node-part="name"]`,
    );
    const zoom = document
      .querySelector("[data-map-content]")
      ?.getAttribute("data-map-zoom");
    if (!el || !zoom) return 0;
    return Number.parseFloat(getComputedStyle(el).fontSize) * Number(zoom);
  }, node);
}

test("전체 보기: 처음 모습은 칸 이름이 11px 이상으로 읽히고 「다 섞임」에서 고른 해법 길이 보이며, 페이지는 스크롤되지 않는다", async ({
  page,
}) => {
  await page.goto("/cube/methods?view=map&sel=beginner");
  const frame = page.locator("[data-map-frame]");
  await expect(frame).toBeVisible();
  await expect(
    page.locator('[data-node="scrambled"] [data-node-part="name"]'),
  ).toBeVisible();
  await expect
    .poll(() => nameFontPx(page, "scrambled"))
    .toBeGreaterThanOrEqual(11);
  // 다 섞임과 그다음 지점(흰 십자)이 틀 안에
  const f = await frame.boundingBox();
  const inFrame = async (id: string) => {
    const b = await page.locator(`[data-node="${id}"]`).boundingBox();
    return (
      !!f &&
      !!b &&
      b.x >= f.x - 1 &&
      b.y >= f.y - 1 &&
      b.x + b.width <= f.x + f.width + 1 &&
      b.y + b.height <= f.y + f.height + 1
    );
  };
  expect([await inFrame("scrambled"), await inFrame("cross")]).toEqual([
    true,
    true,
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    ),
  ).toBeLessThanOrEqual(0);
  // 「처음 자리로」도 같은 처음 모습으로
  const content = page.locator("[data-map-content]");
  const zoom = await content.getAttribute("data-map-zoom");
  await page.getByRole("button", { name: "크게" }).click();
  await expect(content).not.toHaveAttribute("data-map-zoom", zoom ?? "");
  await page.getByRole("button", { name: "처음 자리로" }).click();
  await expect(content).toHaveAttribute("data-map-zoom", zoom ?? "");
  // 해법을 더 골라도 글자가 읽히는 배율 아래로 줄이지 않는다
  await page.locator('[data-method="cfop"]').click();
  await expect(page).toHaveURL(/sel=beginner%2Ccfop/);
  await expect
    .poll(() => nameFontPx(page, "scrambled"))
    .toBeGreaterThanOrEqual(11);
});

/** 견본 기록: 초보자 흰 십자 강 둘(안전한 회전·흰 십자)의 진도 */
const CROSS_SCENES = {
  없음: null,
  "흰 십자 완료": {
    "333-safe-turns": { passed: [], done: true },
    "333-white-cross": { passed: [], done: true },
  },
  "흰 십자 배우는 중": {
    "333-safe-turns": { passed: [], done: true },
    "333-white-cross": { passed: [1], done: false },
  },
} as const;

/** 초보자 카드 띠: 칸마다 밝기와 그 칸으로 들어오는 화살표 밝기(첫 칸은 화살표 없음) */
const beginnerStrip = (page: Page) =>
  page
    .locator('[data-card="beginner"] [data-card-strip] > li')
    .evaluateAll((lis) =>
      lis.flatMap((li) => {
        const cell = li.querySelector("[data-strip-node]");
        if (!cell) return [];
        const arrow = li.querySelector("[data-step-arrow]");
        return [
          `${arrow ? `${arrow.getAttribute("data-step-arrow")}→` : ""}${cell.getAttribute("data-strip-node")}:${cell.getAttribute("data-strip-lit")}`,
        ];
      }),
    );

for (const [scene, lessons] of Object.entries(CROSS_SCENES)) {
  test(`진도 밝기(${scene}): 다 섞임은 늘 밝고, 배우는 중이면 화살표만, 완료면 화살표와 칸이 밝다. 글자 표시는 없다`, async ({
    page,
  }) => {
    if (lessons)
      await page.addInitScript((value) => {
        localStorage.setItem("cube.learn.v1", value);
      }, JSON.stringify({ lessons }));
    await page.goto("/cube/methods");
    await expect(page.locator('[data-card="beginner"]')).toBeVisible();
    const cross =
      scene === "흰 십자 완료"
        ? "lit→cross:lit"
        : scene === "흰 십자 배우는 중"
          ? "lit→cross:dim"
          : "dim→cross:dim";
    expect(await beginnerStrip(page)).toEqual([
      "scrambled:lit",
      cross,
      "dim→first-layer:dim",
      "dim→f2l:dim",
      "dim→yellow-cross:dim",
      "dim→yellow-edges:dim",
      "dim→ll-corners-placed:dim",
      "dim→solved:dim",
    ]);
    // 진도는 화면 낭독기용 숨은 글로만
    const name = page.locator(
      '[data-card="beginner"] [data-strip-node="cross"] [data-strip-name]',
    );
    await expect(name).toHaveText(
      scene === "흰 십자 완료"
        ? "흰 십자 완료"
        : scene === "흰 십자 배우는 중"
          ? "흰 십자 배우는 중"
          : "흰 십자",
    );
    await expect(name.locator(".sr-only")).toHaveCount(lessons ? 1 : 0);
    expect(await page.locator("[data-map-cards]").innerText()).not.toContain(
      "✓",
    );
    // 지도: 걸음 선은 화살표, 끝 지점은 칸과 같은 규칙
    await page.goto("/cube/methods?view=map&sel=beginner");
    await expect(page.locator('[data-node="cross"]')).toBeVisible();
    expect([
      await page
        .locator('[data-node="scrambled"] [data-node-lit]')
        .getAttribute("data-node-lit"),
      await page
        .locator('[data-edge-line="cross"]')
        .getAttribute("data-edge-lit"),
      await page
        .locator('[data-node="cross"] [data-node-lit]')
        .getAttribute("data-node-lit"),
      await page
        .locator('[data-edge-line="first-corners"]')
        .getAttribute("data-edge-lit"),
    ]).toEqual([
      "lit",
      cross.startsWith("lit") ? "lit" : "dim",
      cross.endsWith(":lit") ? "lit" : "dim",
      "dim",
    ]);
  });
}

/**
 * 카드·해법 화면·지도 안의 글 조각(화면 읽기용 글 포함) 가운데 같은 단계 표시(「= 초보자」·「초보자와 같음」)나
 * 내 위치 「나」 표시인 것
 */
async function stageOrMeMarks(page: Page, root: string) {
  return page.locator(root).evaluate((el) => {
    const out: string[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = (n.textContent ?? "").trim();
      // JSX `= {이름}`은 글 조각 「=」와 이름으로 갈린다
      if (t === "나" || t.includes("같음") || /^=(\s|$)/.test(t)) out.push(t);
    }
    return out;
  });
}

test("카드·해법 화면·지도에는 같은 단계 표시와 「나」 표시가 없다(기록 없음·있음)", async ({
  page,
}) => {
  for (const progress of [false, true]) {
    if (progress) await withProgress(page);
    await page.goto("/cube/methods?more=1");
    await expect(page.locator('[data-card="cfop"]')).toBeVisible();
    expect(
      await stageOrMeMarks(page, "[data-map-cards]"),
      `카드 기록 ${progress}`,
    ).toEqual([]);
    await page.goto("/cube/methods?method=cfop");
    await expect(page.locator('[data-method-screen="cfop"]')).toBeVisible();
    expect(
      await stageOrMeMarks(page, '[data-method-screen="cfop"]'),
      `해법 화면 기록 ${progress}`,
    ).toEqual([]);
    await page.goto("/cube/methods?view=map&sel=beginner,cfop&more=1");
    await expect(page.locator('[data-node="scrambled"]')).toBeVisible();
    expect(
      await stageOrMeMarks(page, '[data-solve-map="map"]'),
      `지도 기록 ${progress}`,
    ).toEqual([]);
  }
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

/**
 * 화면 밖으로 잘린 요소: 화면 왼쪽·오른쪽을 넘는 요소. 페이지 가로 넘침(문서 scrollWidth)만 보면, 스스로 가로 스크롤인
 * 상자(예전 지도 위 줄의 overflow-x-auto) 안에서 잘린 것은 문서 폭을 늘리지 않아 잡지 못했다(2026-11-26 HQ 검토).
 * 밀어서 볼 수 있는 줄(`scroller`)은 넘침이 있으면 밀 수 있다는 표시(`data-scroll-more`)가 보여야 한다
 */
async function clippedOut(page: Page, root: string, scroller?: string) {
  return page.evaluate(
    ({ root, scroller }) => {
      const out: string[] = [];
      const r = document.querySelector(root);
      if (!r) return ["없음"];
      const vw = window.innerWidth;
      // 뿌리 자신도 본다. 밀 수 있는 줄은 그 상자는 보고(화면 안이어야 한다) 안쪽만 건너뛴다
      for (const el of [
        r as HTMLElement,
        ...r.querySelectorAll<HTMLElement>("*"),
      ]) {
        if (scroller && el.parentElement?.closest(scroller)) continue;
        if (el.closest(".sr-only") || el.classList.contains("sr-only"))
          continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.left < -0.5 || b.right > vw + 0.5)
          out.push(
            `${el.tagName.toLowerCase()} 「${(el.textContent ?? "").slice(0, 12)}」 ${Math.round(b.left)}~${Math.round(b.right)}`,
          );
        // 스스로 잘라 숨기는 상자(넘친 글을 감춤)
        const s = getComputedStyle(el);
        if (
          s.overflowX !== "visible" &&
          el.scrollWidth > el.clientWidth + 1 &&
          !(scroller && el.matches(scroller))
        )
          out.push(
            `${el.tagName.toLowerCase()} 안에서 잘림 「${(el.textContent ?? "").slice(0, 12)}」`,
          );
      }
      if (scroller) {
        const sc = document.querySelector<HTMLElement>(scroller);
        if (
          sc &&
          sc.scrollWidth > sc.clientWidth + 1 &&
          !sc.parentElement?.querySelector('[data-scroll-more="right"]')
        )
          out.push("밀 수 있다는 표시 없음");
      }
      return out;
    },
    { root, scroller },
  );
}

test("휴대폰 폭(320·375·390·430)과 PC에서 카드·지도는 넘치거나 잘리지 않고, 칸 이름은 낱말 중간에서 줄이 바뀌지 않고 두 줄을 넘지 않는다(2×2~5×5)", {
  tag: ONLY_DESKTOP,
}, async ({ page }) => {
  for (const w of [320, 375, 390, 430, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const n of [2, 3, 4, 5]) {
      await page.addInitScript((size) => {
        localStorage.setItem("cube.size.v1", JSON.stringify({ v: 1, n: size }));
      }, n);
      await page.goto("/cube/methods?more=1");
      await expect(page.locator(`[data-method-cards="${n}"]`)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
        `${w} ${n}×${n} 카드 가로 넘침`,
      ).toBeLessThanOrEqual(0);
      expect(
        await clippedOut(page, "[data-method-cards]"),
        `${w} ${n}×${n} 카드 잘림`,
      ).toEqual([]);
      const bad: string[] = [];
      for (const el of await page
        .locator("[data-card] [data-strip-name]")
        .all()) {
        const lines = await renderedLines(el);
        const words = (await el.innerText()).split(/\s+/).filter(Boolean);
        const lineWords = lines.flatMap((l) => l.split(/\s+/).filter(Boolean));
        if (lines.length > 2 || lineWords.join("|") !== words.join("|"))
          bad.push(lines.join(" / "));
      }
      expect(bad, `${w} ${n}×${n} 칸 글 줄바꿈`).toEqual([]);
    }
    await page.goto("/cube/methods?view=map&sel=beginner");
    await expect(page.locator('[data-solve-map="map"]')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
      `${w} 지도 가로 넘침`,
    ).toBeLessThanOrEqual(0);
    expect(
      await clippedOut(page, "[data-map-bar]", "[data-map-methods]"),
      `${w} 지도 위 줄 잘림`,
    ).toEqual([]);
  }
});
