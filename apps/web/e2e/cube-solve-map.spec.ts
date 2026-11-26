import { expect, test } from "./test";

/**
 * 큐브 해법 지도 시안(/cube/learn-map, 2026-11-25). 남은 안(A 지도·E 카드), 여러 해법 고르기,
 * 「나」 표시와 견본 기록. 시안을 고르면 이 시험도 고른 안에 맞춰 줄인다.
 */

test("해법 지도: 지도는 「다 섞임」에서 시작하고 기록이 없으면 「나」도 거기, 초보자 길의 꼬리표는 그 단원으로 간다", async ({
  page,
}) => {
  await page.goto("/cube/learn-map");
  await expect(page.locator('[data-solve-map="a"]')).toBeVisible();
  await expect(page.locator('[data-node="scrambled"] [data-me]')).toBeVisible();
  await expect(page.locator("[data-node] [data-me]")).toHaveCount(1);
  // 큐브의 기초는 지도 밖 페이지라 지도에 출발 표시가 없다
  await expect(page.locator("[data-map-prep]")).toHaveCount(0);
  await expect(page.locator('[data-edge="first-corners"]')).toHaveAttribute(
    "href",
    "/cube/learn?lesson=333-first-corners-up",
  );
  // 단원이 없는 걸음(코너 방향 먼저)은 누를 수 없다
  await expect(page.locator('[data-edge="twist-first"]')).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("해법 지도: 해법을 여럿 고르면 주소에 담기고 고른 해법의 길만 선이 그려진다", async ({
  page,
}) => {
  await page.goto("/cube/learn-map?v=a&m=beginner");
  await expect(page.locator('[data-solve-map="a"]')).toBeVisible();
  await page.locator('[data-method="cfop"]').click();
  await expect(page).toHaveURL(/m=beginner%2Ccfop/);
  await expect(page.locator('[data-edge-line="f2l-pair-1"]')).toHaveCount(1);
  await expect(page.locator('[data-edge-line="roux-fb"]')).toHaveCount(0);
  // 두 해법이 함께 지나는 십자 길은 선 둘
  await expect(page.locator('[data-edge-line="cross"]')).toHaveCount(2);
});

test("해법 지도 E: 카드 띠는 큰 단계만(CFOP는 다 섞임 + 십자·F2L·OLL·PLL), 카드를 누르면 해법 화면에서 세부 걸음을 모두 보고, 단원 없는 걸음은 누를 수 없다", async ({
  page,
}) => {
  await page.goto("/cube/learn-map?v=cards-v&m=beginner");
  const card = page.locator('[data-card="cfop"]');
  await expect(card.locator("[data-strip-node]")).toHaveCount(5);
  await expect(card.locator('[data-strip-node="f2l"]')).toHaveCount(1);
  await expect(card.locator('[data-strip-node="pair-1"]')).toHaveCount(0);
  await expect(card.locator("[data-card-total]")).toHaveText("공식 119 · 55수");
  await card.click();
  await expect(page).toHaveURL(/method=cfop/);
  await expect(
    page.locator('[data-method-screen="cfop"] li [data-edge]'),
  ).toHaveCount(7);
  await page.goto(
    "/cube/learn-map?v=cards-h&m=beginner&method=beginner-twist-first",
  );
  await expect(
    page.locator('[data-method-screen] [data-edge="twist-first-place"]'),
  ).toHaveAttribute("aria-disabled", "true");
});

/**
 * 지도 안 상자(지점 그림·이름, 걸음 꼬리표) 가운데 주인이 다른 둘이 겹치는 쌍. 같은 지점의 그림·이름끼리는
 * 한 덩이라 보지 않는다. 「나」 표시는 지점 모서리에 일부러 걸쳐 두어 뺀다
 */
async function overlaps(page: import("@playwright/test").Page) {
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

test("해법 지도 A: 지점 그림·이름·꼬리표가 서로 겹치지 않는다(전체 보기·확대, 3×3·다른 해법·4×4)", async ({
  page,
}) => {
  for (const q of [
    "n=3&m=beginner&demo=1",
    "n=3&m=beginner,cfop,zz&demo=1&more=1",
    "n=4&demo=1",
  ]) {
    await page.goto(`/cube/learn-map?v=a&${q}`);
    await expect(page.locator('[data-solve-map="a"]')).toBeVisible();
    await expect(page.locator("[data-node]").first()).toBeVisible();
    expect(await overlaps(page), `${q} 전체 보기`).toEqual([]);
    const zoom = page.locator("[data-map-content]");
    const before = await zoom.getAttribute("data-map-zoom");
    for (let i = 0; i < 3; i++)
      await page.getByRole("button", { name: "크게" }).click();
    await expect(zoom).not.toHaveAttribute("data-map-zoom", before ?? "");
    expect(await overlaps(page), `${q} 확대`).toEqual([]);
  }
});

test("해법 지도 A: 처음에는 지도 전체가 한 화면에 들어오고 페이지는 스크롤되지 않는다", async ({
  page,
}) => {
  for (const v of ["a"]) {
    await page.goto(`/cube/learn-map?v=${v}&m=beginner`);
    const frame = page.locator("[data-map-frame]");
    await expect(frame).toBeVisible();
    const f = await frame.boundingBox();
    const content = page.locator("[data-map-content]");
    const c = await content.boundingBox();
    expect(f && c, v).toBeTruthy();
    if (!f || !c) return;
    expect(
      [
        c.x >= f.x - 1,
        c.y >= f.y - 1,
        c.x + c.width <= f.x + f.width + 1,
        c.y + c.height <= f.y + f.height + 1,
      ],
      v,
    ).toEqual([true, true, true, true]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      ),
      v,
    ).toBeLessThanOrEqual(0);
    // 「처음 자리로」도 이 전체 보기로
    await page.getByRole("button", { name: "크게" }).click();
    await page.getByRole("button", { name: "처음 자리로" }).click();
    await expect(content).toHaveAttribute(
      "data-map-zoom",
      (await content.getAttribute("data-map-zoom")) ?? "",
    );
    const c2 = await content.boundingBox();
    expect(c2 && Math.round(c2.width), v).toBe(Math.round(c.width));
  }
});

test("해법 지도: 폐기한 B 갈림길·C 노선도·D 막대 주소(v=b·v=c·v=d)로 열면 A 지도로 연다", async ({
  page,
}) => {
  for (const v of ["b", "c", "d"]) {
    await page.goto(`/cube/learn-map?v=${v}&m=beginner`);
    await expect(page.locator('[data-solve-map="a"]')).toBeVisible();
    await expect(page).toHaveURL(/v=a/);
  }
});

test("해법 지도 견본 기록: 지나온 길에 「나」, 약한 걸음·익숙한 상황 수가 보인다", async ({
  page,
}) => {
  await page.goto("/cube/learn-map?v=a&m=beginner&demo=1");
  await expect(page.locator('[data-node="f2l"] [data-me]')).toBeVisible();
  const second = page.locator('[data-edge="second-layer"]');
  await expect(second.locator("[data-edge-solo]")).toHaveAttribute(
    "data-edge-solo",
    "weak",
  );
  await expect(second.locator("[data-edge-train]")).toContainText("익숙 2/3");
});

test("해법 지도 4×4: 「3×3 맞추기」는 그 자리에서 펼치고, 3×3 지도에 들렀다 「← 4×4」로 펼친 채 돌아온다", async ({
  page,
}) => {
  await page.goto("/cube/learn-map?v=a&n=4");
  await page.locator('[data-edge="444-reduction:333"]').click();
  const panel = page.locator("[data-finish-panel]");
  await expect(panel).toHaveAttribute("data-finish-panel", "beginner");
  await expect(page).toHaveURL(/n=4&x=beginner/);
  // 고리는 초보자의 패리티 자리(둘째 층 엣지 뒤, 옆면 맞추기 뒤)에 한국 이름으로
  await expect(panel.locator("[data-parity-loop]")).toHaveText([
    /^토끼이빨OLL 패리티/,
    /^바보토끼이빨PLL 패리티/,
  ]);
  await panel.locator('[data-finish-method="cfop"]').click();
  await panel.locator("[data-finish-hop]").click();
  await expect(page).toHaveURL(/n=3&from=4&x=cfop&m=cfop/);
  // 들르기라 크기 탭은 4×4 그대로
  await expect(page.locator('[data-size="4"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("[data-map-back]").click();
  await expect(page).toHaveURL(/n=4&x=cfop/);
  await expect(panel).toHaveAttribute("data-finish-panel", "cfop");
});
