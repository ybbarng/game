import { no3d, shot } from "./cube";
import { expect, type Locator, type Page, test } from "./test";
import { renderedLines } from "./word-wrap";

/**
 * 큐브 티어표(`/cube/tiers`, docs/47 14절). 티어·Ao5 계산은 단위 시험(`tiers/rank.test.ts`, `records.test.ts`)이 맡고,
 * 여기서는 메뉴에서 가는 길, 크기 고르기, 이 기기 기록의 티어 짚기, 출처 문구, 혼자 맞추기 기록 칸의 티어 표시를 본다.
 */

/** 3×3 혼자 맞추기 기록 5판(Ao5 13.40초 = 다이아몬드 IV)을 이 기기에 넣는다 */
async function seedRecords(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem("cube.records.v1")) return;
    const times = [13_000, 13_400, 13_800, 12_000, 20_000];
    localStorage.setItem(
      "cube.records.v1",
      JSON.stringify({
        "solo-3": times.map((ms, i) => ({
          at: 1_700_000_000_000 - i * 60_000,
          no: 5 - i,
          n: 3,
          mode: "solo",
          ms,
          penalty: 0,
          moves: 55,
          scramble: "R U R' U'",
          inputs: ["keyboard"],
          inspection: true,
        })),
      }),
    );
  });
}

async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
}

/** `scope` 안의 엠블럼 `count`개가 모두 정지 그림이고 그림을 받았다(평면 SVG `.cube-emblem` 없음) */
async function stillsLoaded(scope: Locator, count: number) {
  const imgs = scope.locator("[data-cube-emblem-still] img");
  await expect(imgs).toHaveCount(count);
  await expect
    .poll(() =>
      imgs.evaluateAll((els) =>
        els.every((e) => (e as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);
  await expect(scope.locator(".cube-emblem svg")).toHaveCount(0);
}

/** 사다리 칸 그림의 중간 밝기(보고 있지 않은 칸, TierShowcase.tsx `LADDER_REST`) */
const REST = "brightness(0.72) saturate(0.85)";

/** 사다리 칸 열 개의 그림 필터(티어 차례) */
async function artFilters(page: Page): Promise<string[]> {
  const got = await page
    .locator("[data-cube-ladder] [data-cube-ladder-art]")
    .evaluateAll((els) =>
      els.map((e) => [
        e.closest("[data-cube-ladder]")?.getAttribute("data-cube-ladder") ?? "",
        getComputedStyle(e).filter,
      ]),
    );
  const by = new Map(got.map(([t, f]) => [t, f]));
  return TIERS.map((t) => by.get(t) ?? "");
}

/** 그 칸만 보고 있는 칸(제 밝기, 표시)이고 나머지 아홉은 같은 중간 밝기 */
async function expectShown(page: Page, tier: string) {
  await expect(page.locator("[data-cube-ladder-shown]")).toHaveCount(1);
  await expect(page.locator("[data-cube-ladder-shown]")).toHaveAttribute(
    "data-cube-ladder",
    tier,
  );
  await expect(page.locator(`[data-cube-ladder="${tier}"]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // 밝기는 0.2초 동안 바뀌므로 다 바뀔 때까지 기다린다(티어 차례대로 열 칸)
  const want = TIERS.map((t) => (t === tier ? "none" : REST));
  await expect.poll(() => artFilters(page)).toEqual(want);
  // 고른 칸 테두리: 3px, 어두운 바탕(#171717)과 내 칸 배경 판(#2e2e2e) 둘 다에 대해 명도 대비 3:1 이상
  const ring = page.locator(`[data-cube-ladder="${tier}"]`);
  await expect.poll(() => ringOf(ring)).toContain("0px 0px 0px 3px");
  const rgb = (await ringOf(ring)).match(/rgba?\((\d+), (\d+), (\d+)/);
  expect(rgb).not.toBeNull();
  const [r, g, b] = (rgb ?? []).slice(1, 4).map(Number) as [
    number,
    number,
    number,
  ];
  for (const bg of [0x17, 0x2e])
    expect(contrastRgb([r, g, b], [bg, bg, bg])).toBeGreaterThanOrEqual(3);
}

/** 두 sRGB 색의 명도 대비(WCAG) */
function contrastRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const lum = ([r, g, b]: readonly [number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const TIERS = [
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
];

/** 칸 테두리(box-shadow) */
const ringOf = (cell: Locator) =>
  cell.evaluate((e) => getComputedStyle(e).boxShadow);

/** 사다리 칸 열 개가 미리 찍은 그림을 받았다 */
async function spritesLoaded(page: Page) {
  const cells = page.locator("[data-cube-ladder-sprite]");
  await expect(cells).toHaveCount(10);
  await expect
    .poll(() =>
      cells.evaluateAll(async (els) => {
        const urls = els.map(
          (e) =>
            getComputedStyle(e).backgroundImage.match(
              /url\("?(.+?)"?\)/,
            )?.[1] ?? "",
        );
        const ok = await Promise.all(
          urls.map(
            (u) =>
              new Promise<boolean>((r) => {
                const img = new Image();
                img.onload = () => r(img.naturalWidth > 0);
                img.onerror = () => r(false);
                img.src = u;
              }),
          ),
        );
        return ok.every(Boolean);
      }),
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await no3d(page);
});

test("큐브 메뉴에서 티어표로 가고, 기록이 없으면 표만 보인다", async ({
  page,
}, info) => {
  await page.goto("/cube");
  await page.locator("[data-cube-tiers-link]").click();
  await expect(page).toHaveURL(/\/cube\/tiers$/);
  await expect(page.getByRole("heading", { name: "티어표" })).toBeVisible();
  // 처음은 3×3, 열 티어가 위(챌린저)부터
  await expect(page.locator("[data-cube-tier-table='3']")).toBeVisible();
  const rows = page.locator("[data-cube-tier-row]");
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toHaveAttribute(
    "data-cube-tier-row",
    "challenger",
  );
  await expect(rows.last()).toHaveAttribute("data-cube-tier-row", "iron");
  // 줄마다 그 티어 엠블럼
  await expect(
    page.locator("[data-cube-tier-row] [data-cube-emblem]"),
  ).toHaveCount(10);
  await expect(rows.first().locator("[data-cube-emblem]")).toHaveAttribute(
    "data-cube-emblem",
    "challenger",
  );
  // 엠블럼은 3D를 정면에서 찍은 정지 그림(3D를 끈 기기에서도 같은 그림). 평면 SVG는 없다
  await stillsLoaded(page.locator("[data-cube-tier-row]"), 10);
  await expect(page.locator("[data-cube-tier-row='diamond']")).toContainText(
    "14초",
  );
  await expect(page.locator("[data-cube-tier-mine-box]")).toContainText(
    "아직 5판 평균이 없어요",
  );
  await expect(page.locator("[data-cube-tier-mine]")).toHaveCount(0);
  // 진열: 기록이 없으면 내 티어 칸은 처음 얻을 아이언을 잠긴 채로 보이고, 다음 티어 칸은 없다
  await expect(page.locator("[data-cube-tier-hero]")).toHaveAttribute(
    "data-cube-tier-hero",
    "iron",
  );
  await expect(page.locator("[data-cube-tier-hero]")).toHaveAttribute(
    "data-cube-tier-locked",
    "",
  );
  await expect(page.locator("[data-cube-next-tier]")).toHaveCount(0);
  // 사다리: 기록 없음이면 위쪽 큰 칸의 아이언이 고른 칸(제 밝기 + 3px 테두리), 나머지는 중간 밝기. 내 칸 배경 판은 없다
  await expect(page.locator("[data-cube-ladder]")).toHaveCount(10);
  await expectShown(page, "iron");
  await expect(page.locator("[data-cube-ladder-mine]")).toHaveCount(0);
  await expect
    .poll(() => ringOf(page.locator('[data-cube-ladder="iron"]')))
    .toContain("0px 0px 0px 3px");
  await expect(page.locator('[data-cube-ladder="diamond"]')).toContainText(
    "14초 이하",
  );
  await expect(page.locator('[data-cube-ladder="iron"]')).toContainText(
    "다 맞춤",
  );
  await spritesLoaded(page);
  // WCA 결과 내보내기 README가 요구하는 출처 문구(그대로)
  await expect(page.locator("[data-cube-wca-credit]")).toHaveText(
    "This information is based on competition results owned and maintained by the World Cube Assocation, published at https://worldcubeassociation.org/results as of November 9, 2026.",
  );
  await noSideScroll(page);
  await shot(page, "tiers-empty", info.project.name);

  // 크기를 고르면 그 크기 표, 주소에도 남는다
  await page.locator("[data-cube-tier-size='7']").click();
  await expect(page.locator("[data-cube-tier-table='7']")).toBeVisible();
  await expect(page).toHaveURL(/\/cube\/tiers\?n=7$/);
  // 7×7 아이언은 구간 없이 「다 맞춤」
  await expect(page.locator("[data-cube-tier-row='iron']")).toContainText(
    "다 맞춤",
  );
  await noSideScroll(page);
});

test("이 기기 기록의 최고 Ao5와 티어를 짚고, 혼자 맞추기 기록 칸에서 이어진다", async ({
  page,
}, info) => {
  await seedRecords(page);
  await page.goto("/cube/tiers?n=3");
  await expect(page.locator("[data-cube-my-tier]")).toHaveText("다이아몬드 IV");
  await expect(page.locator("[data-cube-tier-mine-box]")).toContainText(
    "13.40",
  );
  await expect(page.locator("[data-cube-tier-mine]")).toHaveAttribute(
    "data-cube-tier-row",
    "diamond",
  );
  await expect(page.locator("[data-cube-tier-cell]")).toHaveText("14초");
  // 내 티어 칸: 엠블럼(3D를 끈 기기라 정지 그림)과 구간 표시(IV = 하나), 다음 티어 마스터까지 3.40초
  await expect(page.locator("[data-cube-tier-hero]")).toHaveAttribute(
    "data-cube-tier-hero",
    "diamond",
  );
  await expect(page.locator("[data-cube-tier-locked]")).toHaveCount(0);
  await expect(
    page.locator("[data-cube-tier-mine-box] [data-cube-tier-division]"),
  ).toHaveAttribute("data-cube-tier-division", "IV");
  const next = page.locator("[data-cube-next-tier]");
  await expect(next).toHaveAttribute("data-cube-next-tier", "master");
  await expect(next.locator("[data-cube-next-gap]")).toHaveText("3.40초");
  await expect(next).toContainText("5판 평균 10초 이하");
  // 정지 그림: 내 티어(3D 대신) + 다음 티어
  await stillsLoaded(page.locator("[data-cube-tier-mine-box]"), 2);
  // 사다리: 다이아몬드가 내 칸이고 처음 보고 있는 칸이라 그 칸만 제 밝기, 나머지 아홉은 같은 중간 밝기
  const cell = (t: string) => page.locator(`[data-cube-ladder="${t}"]`);
  await expect(page.locator("[data-cube-ladder-mine]")).toHaveAttribute(
    "data-cube-ladder",
    "diamond",
  );
  await expectShown(page, "diamond");
  // 내 자리 = 밝은 배경: 내 칸은 구간 표의 내 줄과 같은 배경 판, 다른 칸은 배경 없음. 가는 노란 선은 없다
  const mineBg = await page
    .locator("[data-cube-tier-mine] th")
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(mineBg).not.toBe("rgba(0, 0, 0, 0)");
  const bgOf = (t: string) =>
    cell(t).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bgOf("diamond")).toBe(mineBg);
  expect(await bgOf("emerald")).toBe("rgba(0, 0, 0, 0)");
  // 내 티어를 보고 있으면 배경 판 + 다이아몬드 색 테두리
  await expect.poll(() => ringOf(cell("diamond"))).toContain("56, 189, 248");
  await expect
    .poll(() => ringOf(cell("diamond")))
    .not.toContain("252, 211, 77");
  await noSideScroll(page);
  await shot(page, "tiers-mine", info.project.name);

  // 아직 얻지 못한 마스터를 누르면 그 칸이 밝아지고 마스터 색 테두리, 내 칸은 배경 판만 남는다(테두리 없음)
  await cell("master").click();
  await expectShown(page, "master");
  await expect.poll(() => ringOf(cell("master"))).toContain("232, 121, 249");
  expect(await bgOf("diamond")).toBe(mineBg);
  await expect.poll(() => ringOf(cell("diamond"))).toBe("none");
  await shot(page, "tiers-picked", info.project.name);
  // 다른 칸을 누르면 앞 칸은 다시 중간 밝기
  await cell("challenger").click();
  await expectShown(page, "challenger");
  // 같은 칸을 다시 누르면 내 티어로
  await cell("challenger").click();
  await expectShown(page, "diamond");

  // 다른 크기는 아직 없다
  await page.locator("[data-cube-tier-size='4']").click();
  await expect(page.locator("[data-cube-tier-mine-box]")).toContainText(
    "아직 5판 평균이 없어요",
  );

  // 혼자 맞추기 기록 칸: 지금 티어, 누르면 그 크기 티어표
  await page.goto("/cube/solo");
  const tier = page.locator("[data-cube-records-tier] a");
  await expect(tier).toHaveText("다이아몬드 IV");
  await expect(tier).toHaveAttribute("href", "/cube/tiers?n=3");
  await expect(tier.locator("[data-cube-emblem]")).toHaveAttribute(
    "data-cube-emblem",
    "diamond",
  );
  await stillsLoaded(tier, 1);
  // 구간 안 자리 막대(docs/47 14-9): 다이아몬드 IV 14.00 → 다이아몬드 III 13.00, 13.40은 왼쪽에서 60%
  const band = page.locator("[data-cube-records] [data-cube-tier-band]");
  await expect(band).toHaveAttribute("data-cube-tier-band", "diamond");
  await expect(band).toHaveAttribute(
    "aria-label",
    "다이아몬드 IV 14.00 → 다이아몬드 III 13.00 · 최고 5판 평균 13.40",
  );
  await expect(band.locator("[data-band-value]")).toHaveText("13.40");
  await page.locator("[data-cube-records]").scrollIntoViewIfNeeded();
  await shot(page, "solo-tier", info.project.name);
  await tier.click();
  await expect(page).toHaveURL(/\/cube\/tiers\?n=3$/);
  await expect(page.locator("[data-cube-my-tier]")).toHaveText("다이아몬드 IV");
});

/**
 * 2026-11-18 사용자 기록(Cubie 3×3 11판, 기록 창은 최고 5판 평균 2:35.09 = 브론즈 II). 1번과 7~11번은 사용자 스크린샷의
 * 시간이고, 2~6번은 그 사이를 채운 느린 판이다(최고 5판 평균은 7~11번에서 나온다)
 */
const USER_3X3 = [
  508_450, 460_000, 415_000, 370_000, 330_000, 290_000, 249_710, 186_830,
  123_810, 139_800, 138_650,
];

/** Cubie 기록(`cube.mini.v1`)만 넣는다. 사이트 혼자 맞추기 기록은 없다 */
async function seedCubieRecords(page: Page) {
  await page.addInitScript((times) => {
    if (localStorage.getItem("cube.mini.v1")) return;
    const list = times.map((ms, i) => ({
      at: Date.UTC(2026, 10, 10 + Math.floor(i / 2), 12),
      no: i + 1,
      n: 3,
      mode: "solo",
      ms,
      penalty: 0,
      moves: 120,
      scramble: "R U R' U'",
    }));
    list.reverse();
    localStorage.setItem(
      "cube.mini.v1",
      JSON.stringify({
        version: 1,
        n: 3,
        mirror: true,
        records: { 3: list },
        best5: {},
      }),
    );
  }, USER_3X3);
}

test(
  "Cubie 창(records=cubie)은 Cubie 기록으로 티어를 매긴다",
  {
    tag: "@only-desktop",
  },
  async ({ page }, info) => {
    await no3d(page);
    await seedCubieRecords(page);
    await page.goto("/cube/tiers?n=3&records=cubie");
    const box = page.locator("[data-cube-tier-mine-box]");
    await expect(page.locator("[data-cube-my-tier]")).toHaveText("브론즈 II");
    await expect(box).toContainText("내 최고 5판 평균 2:35.09");
    await expect(page.locator("[data-cube-tier-basis]")).toHaveText(
      "Cubie 기록 기준이에요. 기록은 이 기기에만 저장돼요.",
    );
    await expect(page.locator("[data-cube-tier-mine]")).toHaveAttribute(
      "data-cube-tier-row",
      "bronze",
    );
    // 다음 판 목표(docs/47 14-8): 다음 판 2:51.56 안이면 바로 위 구간
    await expect(box.locator("[data-cube-next-solve]")).toHaveText(
      "다음 판 2:51.56 안이면 브론즈 I",
    );
    // 티어 이력: 그래프(그림 설명), 바뀐 순간 넷(최신이 위)
    const hist = page.locator("[data-cube-tier-history='3']");
    await expect(hist.getByRole("img")).toHaveAttribute(
      "aria-label",
      "3×3 티어 이력, 11판. 아이언 I에서 브론즈 II까지.",
    );
    await expect(hist.locator("[data-cube-history-dot]")).toHaveCount(4);
    await expect(hist.locator("[data-cube-history-changes] li")).toHaveText([
      "11/15 브론즈 III → 브론즈 II",
      "11/14 브론즈 IV → 브론즈 III",
      "11/13 아이언 I → 브론즈 IV",
      "11/12 아이언 I",
    ]);
    await shot(page, "tiers-cubie", info.project.name);
    // 휴대폰 너비: 그래프가 칸 폭에 맞춰 다시 그려지고 옆으로 넘치지 않는다
    await page.setViewportSize({ width: 360, height: 780 });
    await expect
      .poll(() =>
        hist.getByRole("img").evaluate((e) => e.getBoundingClientRect().width),
      )
      .toBeLessThanOrEqual(328);
    await noSideScroll(page);
    await hist.scrollIntoViewIfNeeded();
    await shot(page, "tiers-history-phone", info.project.name);
    await page.setViewportSize({ width: 1280, height: 800 });
    // 크기를 바꿔도 Cubie 기록으로(주소에 남는다)
    await page.locator("[data-cube-tier-size='4']").click();
    await expect(page).toHaveURL(/records=cubie/);
    await expect(page.locator("[data-cube-tier-none]")).toHaveText(
      "이 크기는 아직 5판 평균이 없어요. Cubie에서 5판 맞추면 생겨요.",
    );
    // 브라우저의 사이트 티어 화면은 사이트 혼자 맞추기 기록 그대로(Cubie 기록을 섞지 않는다)
    await page.goto("/cube/tiers?n=3");
    await expect(page.locator("[data-cube-my-tier]")).toHaveCount(0);
    await expect(page.locator("[data-cube-tier-basis]")).toHaveAttribute(
      "data-cube-tier-basis",
      "solo",
    );
  },
);

test(
  "Cubie 기록 화면은 티어를 정한 최고 5판과 빠진 두 판, 다음 판 목표를 보인다",
  {
    tag: "@only-desktop",
  },
  async ({ page }, info) => {
    await seedCubieRecords(page);
    await page.setViewportSize({ width: 380, height: 600 });
    await page.goto("/cube/mini?view=records");
    const sum = page.locator("[data-mini-summary]");
    await expect(sum).toContainText("최근 5판 평균");
    await expect(sum).toContainText("최근 12판 평균");
    await expect(page.locator("[data-mini-best5]")).toHaveText(
      "2:35.09 · 7~11번",
    );
    // 7~11번이 짚이고, 빠진 가장 빠른 판(9번)·가장 느린 판(7번)은 괄호
    await expect(page.locator("[data-mini-best-five]")).toHaveCount(5);
    await expect(page.locator("[data-mini-best-five='fast']")).toContainText(
      "(2:03.81)",
    );
    await expect(page.locator("[data-mini-best-five='slow']")).toContainText(
      "(4:09.71)",
    );
    await expect(page.locator("[data-mini-next-solve]")).toHaveText(
      "다음 판 2:51.56 안이면 브론즈 I",
    );
    await expect(
      page.locator("[data-mini-tiers] a", { hasText: "티어표" }),
    ).toHaveAttribute("href", "/cube/tiers?n=3&records=cubie");
    await shot(page, "mini-records-best5", info.project.name);
  },
);

/** 지금 자리 표시(흰 세로 선)의 가운데가 지금 칸 왼쪽 경계에서 오른쪽 경계까지의 몇 %인지(0~1) */
async function markerRatio(band: Locator): Promise<number> {
  return band.evaluate((e) => {
    const r = (s: string) =>
      (e.querySelector(s) as HTMLElement).getBoundingClientRect();
    const here = r("[data-band-cell='here']");
    const mark = r("[data-band-mark]");
    return (mark.left + mark.width / 2 - here.left) / here.width;
  });
}

/** 막대의 칸 이름들(왼쪽부터, 없는 칸은 빠짐) */
async function bandNames(band: Locator): Promise<string[]> {
  return band
    .locator("[data-band-name]")
    .evaluateAll((list) => list.map((n) => n.textContent ?? ""));
}

/**
 * 막대 모양(docs/47 14-9, 사용자 2026-11-19 세 칸 사다리). 어긋난 것을 글로 돌려준다.
 * - 칸: 있어야 할 칸만 있고(`cells`), 옆 칸이 없는 쪽은 지금 칸이 막대 끝까지(빈 자리 없음), 옆 칸은 막대의 1/4 이하, 칸 사이 틈
 * - 밝기 세 단계: 지금 칸 지나온 부분 > 남은 부분 > 옆 칸(진하기)
 * - 글: 숫자·경계 시간·칸 이름이 막대와 창 밖으로 나가지 않고, 경계 시간은 경계 아래 가운데(아니면 막대 끝으로 밀림), 칸 이름은
 *   칸 아래 가운데(아니면 밀림), 같은 줄 글끼리 겹치지 않고, 이름 줄은 시간 줄 아래
 */
async function bandShapeProblems(
  band: Locator,
  cells: { down: boolean; up: boolean },
): Promise<string[]> {
  return band.evaluate((e, want) => {
    if (!e.querySelector("[data-band-mark]")) return ["표시를 아직 안 그림"];
    const q = (s: string) => e.querySelector(s) as HTMLElement | null;
    const box = (s: string) => (q(s) as HTMLElement).getBoundingClientRect();
    const out: string[] = [];
    const t = box("[data-band-track]");
    const here = box("[data-band-cell='here']");
    const down = q("[data-band-cell='down']");
    const up = q("[data-band-cell='up']");
    if (!!down !== want.down) out.push(`아래 칸 ${!!down}`);
    if (!!up !== want.up) out.push(`위 칸 ${!!up}`);
    if (!!q("[data-band-name='down']") !== want.down) out.push("아래 칸 이름");
    if (!!q("[data-band-name='up']") !== want.up) out.push("위 칸 이름");
    const near = (a: number, b: number) => Math.abs(a - b) < 1;
    if (!down && !near(here.left, t.left))
      out.push(`왼쪽 빈 자리 ${here.left - t.left}`);
    if (!up && !near(here.right, t.right))
      out.push(`오른쪽 빈 자리 ${t.right - here.right}`);
    for (const [name, c] of [
      ["아래 칸", down],
      ["위 칸", up],
    ] as const) {
      if (!c) continue;
      const r = c.getBoundingClientRect();
      if (r.width > t.width / 4 + 0.5 || r.width < 20)
        out.push(`${name} 폭 ${r.width} / ${t.width}`);
    }
    if (down && down.getBoundingClientRect().right >= here.left - 0.5)
      out.push("아래 칸과 지금 칸 사이 틈 없음");
    if (up && up.getBoundingClientRect().left <= here.right + 0.5)
      out.push("지금 칸과 위 칸 사이 틈 없음");
    // 밝기 세 단계(진하기)
    const alpha = (el: Element | null) => {
      if (!el) return null;
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? [];
      return m.length >= 4 ? Number(m[3]) : 1;
    };
    const done = alpha(q("[data-band-done]"));
    const rest = alpha(q("[data-band-cell='here']"));
    for (const [name, a] of [
      ["아래 칸", alpha(down)],
      ["위 칸", alpha(up)],
    ] as const)
      if (a !== null && rest !== null && !(a < rest))
        out.push(`${name} 진하기 ${a} ≥ 남은 부분 ${rest}`);
    if (done === null || rest === null || !(rest < done))
      out.push(`남은 부분 진하기 ${rest} ≥ 지나온 부분 ${done}`);
    // 글
    const vw = document.documentElement.clientWidth;
    const edgeOf = (s: string) =>
      s.endsWith("'low']")
        ? here.left
        : s.endsWith("'high']")
          ? here.right
          : null;
    const cellOf = (s: string) => {
      const c = q(s.replace("data-band-name", "data-band-cell"));
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return r.left + r.width / 2;
    };
    const texts = [
      "[data-band-value]",
      "[data-band-time='low']",
      "[data-band-time='high']",
      "[data-band-name='down']",
      "[data-band-name='here']",
      "[data-band-name='up']",
    ].filter((s) => q(s));
    for (const s of texts) {
      const r = box(s);
      if (r.left < t.left - 0.5 || r.right > t.right + 0.5)
        out.push(`${s} 막대 밖 ${r.left}~${r.right} / ${t.left}~${t.right}`);
      if (r.left < 0 || r.right > vw) out.push(`${s} 창 밖`);
      const pushed = near(r.left, t.left) || near(r.right, t.right);
      const mid = r.left + r.width / 2;
      const x = s.includes("time") ? edgeOf(s) : cellOf(s);
      if (x !== null && !near(mid, x) && !pushed)
        out.push(`${s} 가운데에서 떨어짐 ${mid} / ${x}`);
    }
    const rows = [
      ["[data-band-time='low']", "[data-band-time='high']"],
      [
        "[data-band-name='down']",
        "[data-band-name='here']",
        "[data-band-name='up']",
      ],
    ].map((row) => row.filter((s) => q(s)).map(box));
    for (const row of rows)
      for (let i = 1; i < row.length; i++)
        if ((row[i - 1] as DOMRect).right > (row[i] as DOMRect).left + 0.5)
          out.push(`같은 줄 글이 겹침 ${i}`);
    const timeBottom = Math.max(...(rows[0] ?? []).map((r) => r.bottom));
    for (const r of rows[1] ?? [])
      if (r.top < timeBottom - 0.5) out.push("이름 줄이 시간 줄과 겹침");
    return out;
  }, cells);
}

test(
  "Cubie 기록 화면의 구간 안 자리 막대: 세 칸 사다리, 꼭대기·맨 아래는 옆 칸 없이 끝까지, 5판 전이면 없다",
  {
    tag: "@only-desktop",
  },
  async ({ page }, info) => {
    // 3×3은 사용자 기록(브론즈 II, 2:35.09), 2×2는 챌린저(5판 평균 1.25초), 6×6은 맨 아래 아이언(5판 평균 100분),
    // 4×4는 기록 없음
    await page.addInitScript((times) => {
      if (localStorage.getItem("cube.mini.v1")) return;
      const make = (n: number, list: number[]) =>
        list
          .map((ms, i) => ({
            at: Date.UTC(2026, 10, 10 + Math.floor(i / 2), 12),
            no: i + 1,
            n,
            mode: "solo",
            ms,
            penalty: 0,
            moves: 40,
            scramble: "R U R' U'",
          }))
          .reverse();
      localStorage.setItem(
        "cube.mini.v1",
        JSON.stringify({
          version: 1,
          n: 3,
          mirror: true,
          records: {
            3: make(3, times),
            2: make(2, [1_200, 1_300, 1_250, 1_400, 1_100]),
            6: make(6, [5_900_000, 6_000_000, 6_100_000, 5_800_000, 6_200_000]),
          },
          best5: {},
        }),
      );
    }, USER_3X3);
    await page.setViewportSize({ width: 380, height: 600 });
    await page.goto("/cube/mini?view=records");
    const band = page.locator("[data-mini-tiers] [data-cube-tier-band]");
    // 세 칸 브론즈 III·브론즈 II·브론즈 I, 경계 3:10.00·2:30.00, 표시 2:35.09(지금 칸 안에서 시간에 비례: 87.3%)
    const both = { down: true, up: true };
    await expect(band).toHaveAttribute("data-cube-tier-band", "bronze");
    await expect(band).toHaveAttribute(
      "aria-label",
      "브론즈 II 3:10.00 → 브론즈 I 2:30.00 · 최고 5판 평균 2:35.09",
    );
    await expect
      .poll(() => bandNames(band))
      .toEqual(["브론즈 III", "브론즈 II", "브론즈 I"]);
    await expect(band.locator("[data-band-time='low']")).toHaveText("3:10.00");
    await expect(band.locator("[data-band-time='high']")).toHaveText("2:30.00");
    await expect(band.locator("[data-band-value]")).toHaveText("2:35.09");
    await expect.poll(() => bandShapeProblems(band, both)).toEqual([]);
    expect(await markerRatio(band)).toBeCloseTo(0.87275, 2);
    // 막대는 다음 판 목표 바로 위
    const below = await page
      .locator("[data-mini-next-solve]")
      .evaluate((e) => e.getBoundingClientRect().top);
    const bandBottom = await band.evaluate(
      (e) => e.getBoundingClientRect().bottom,
    );
    expect(bandBottom).toBeLessThanOrEqual(below);
    await shot(page, "mini-records-band", info.project.name);

    // 꼭대기(2×2 챌린저): 위 칸 없이 지금 칸이 막대 오른쪽 끝(0.00)까지, 1.50에서 0까지 1.25는 16.7%
    const top = { down: true, up: false };
    await page.locator("[data-mini-tier-size='2']").click();
    await expect(band).toHaveAttribute("data-cube-tier-band", "challenger");
    await expect
      .poll(() => bandNames(band))
      .toEqual(["그랜드마스터", "챌린저"]);
    await expect(band.locator("[data-band-time='high']")).toHaveText("0.00");
    await expect(band.locator("[data-band-time='low']")).toHaveText("1.50");
    await expect.poll(() => bandShapeProblems(band, top)).toEqual([]);
    expect(await markerRatio(band)).toBeCloseTo(0.25 / 1.5, 2);
    await shot(page, "mini-records-band-top", info.project.name);

    // 맨 아래(6×6 아이언, 상한 없음): 아래 칸 없이 지금 칸이 막대 왼쪽 끝(「다 맞춤」)부터, 셈은 80분의 두 배에서 75%
    const bottom = { down: false, up: true };
    await page.locator("[data-mini-tier-size='6']").click();
    await expect(band).toHaveAttribute("data-cube-tier-band", "iron");
    await expect.poll(() => bandNames(band)).toEqual(["아이언", "브론즈 IV"]);
    await expect(band.locator("[data-band-time='low']")).toHaveText("다 맞춤");
    await expect(band.locator("[data-band-time='high']")).toHaveText(
      "80:00.00",
    );
    await expect.poll(() => bandShapeProblems(band, bottom)).toEqual([]);
    expect(await markerRatio(band)).toBeCloseTo(0.75, 2);
    await shot(page, "mini-records-band-bottom", info.project.name);

    // 5판 전(4×4): 막대를 두지 않는다(칸의 「5판 뒤에」가 알린다)
    await page.locator("[data-mini-tier-size='4']").click();
    await expect(
      page.locator("[data-mini-tier-size='4'][aria-pressed='true']"),
    ).toHaveCount(1);
    await expect(band).toHaveCount(0);

    // 휴대폰 너비(320px): 글이 막대와 창 밖으로 나가지 않고 겹치지 않으며 옆으로 넘치지 않는다. 꼭대기·맨 아래도
    await page.locator("[data-mini-tier-size='3']").click();
    await page.setViewportSize({ width: 320, height: 640 });
    await expect(band).toHaveAttribute("data-cube-tier-band", "bronze");
    await expect.poll(() => bandShapeProblems(band, both)).toEqual([]);
    expect(await markerRatio(band)).toBeCloseTo(0.87275, 2);
    await noSideScroll(page);
    await shot(page, "mini-records-band-phone", info.project.name);
    await page.locator("[data-mini-tier-size='2']").click();
    await expect(band).toHaveAttribute("data-cube-tier-band", "challenger");
    await expect.poll(() => bandShapeProblems(band, top)).toEqual([]);
    await noSideScroll(page);
    await page.locator("[data-mini-tier-size='6']").click();
    await expect(band).toHaveAttribute("data-cube-tier-band", "iron");
    await expect.poll(() => bandShapeProblems(band, bottom)).toEqual([]);
    await noSideScroll(page);
  },
);

/** Cubie 기록 창 티어 칸마다 글이 칸 안에 다 보이는지, 같은 줄 칸끼리 높이가 같은지(어긋난 것만 글로) */
async function tierCellProblems(page: Page): Promise<string[]> {
  return page.locator("[data-mini-tiers]").evaluate((root) => {
    const out: string[] = [];
    const cells = [
      ...root.querySelectorAll<HTMLElement>("[data-mini-tier-size]"),
    ];
    const rows = new Map<number, number[]>();
    for (const c of cells) {
      const box = c.getBoundingClientRect();
      const key = Math.round(box.top);
      rows.set(key, [...(rows.get(key) ?? []), Math.round(box.height)]);
      for (const s of c.querySelectorAll<HTMLElement>("span span")) {
        const r = s.getBoundingClientRect();
        if (
          s.scrollWidth > s.clientWidth + 1 ||
          r.left < box.left - 0.5 ||
          r.right > box.right + 0.5 ||
          r.top < box.top - 0.5 ||
          r.bottom > box.bottom + 0.5
        ) {
          out.push(
            `${c.dataset.miniTierSize}: 「${s.textContent}」 칸 밖(글 ${Math.round(r.left)}~${Math.round(r.right)}·넘친 폭 ${s.scrollWidth - s.clientWidth}, 칸 ${Math.round(box.left)}~${Math.round(box.right)})`,
          );
        }
      }
    }
    for (const [top, hs] of rows) {
      if (new Set(hs).size > 1) out.push(`${top}줄 칸 높이 ${hs.join("·")}`);
    }
    return out;
  });
}

test(
  "Cubie 기록 화면 티어 칸: 시간이 길면(6×6·7×7 100분대) 크기와 시간 사이에서 줄을 바꿔 다 보이고, 같은 줄 칸은 높이가 같다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    await page.addInitScript(() => {
      if (localStorage.getItem("cube.mini.v1")) return;
      const make = (n: number, list: number[]) =>
        list
          .map((ms, i) => ({
            at: Date.UTC(2026, 10, 10, 12, i),
            no: i + 1,
            n,
            mode: "solo",
            ms,
            penalty: 0,
            moves: 40,
            scramble: "R U R' U'",
          }))
          .reverse();
      localStorage.setItem(
        "cube.mini.v1",
        JSON.stringify({
          version: 1,
          n: 3,
          mirror: true,
          records: {
            3: make(3, [23_000, 24_000, 22_500, 25_000, 23_900]),
            6: make(6, [5_900_000, 6_000_000, 6_100_000, 5_800_000, 6_200_000]),
            7: make(7, [7_900_000, 8_000_000, 8_100_000, 7_800_000, 8_200_000]),
          },
          best5: {},
        }),
      );
    });
    for (const width of [380, 320]) {
      await page.setViewportSize({ width, height: 640 });
      await page.goto("/cube/mini?view=records");
      const six = page.locator(
        "[data-mini-tier-size='6'] [data-mini-tier-top]",
      );
      await expect(six).toHaveText("6×6 100:00.00");
      await expect(
        page.locator("[data-mini-tier-size='7'] [data-mini-tier-top]"),
      ).toHaveText("7×7 133:20.00");
      // 380px: 한 줄에 안 들어가 크기와 시간 사이에서 두 줄(줄 높이 16px). 320px: 시간도 칸보다 길어 「:」 뒤에서 한 번 더
      expect(
        await six.evaluate((e) => Math.round(e.getBoundingClientRect().height)),
      ).toBe(width === 380 ? 32 : 48);
      await shot(page, `mini-records-tier-cells-${width}`, info.project.name);
      await expect.poll(() => tierCellProblems(page)).toEqual([]);
      await noSideScroll(page);
      // 6×6을 고르면 목표 글 「… 최고 5판 평균을 20:00.00 줄여야 해요.」의 시간이 한 줄 안에 있다(「20: / 00.00」 아님).
      // 1분 넘는 분:초 꼴 뒤에는 「초」를 붙이지 않는다(「20:00.00초」는 20초처럼 읽힌다).
      // WebKit(Cubie 앱 엔진)은 320px에서 「:」 뒤를 끊었는데 이 시험 브라우저(Chromium)는 끊지 않아, 시간이 끊기지 않는
      // 한 덩이(white-space: nowrap)인지도 본다
      await page.locator("[data-mini-tier-size='6']").click();
      const goal = page.locator("[data-mini-next-solve]");
      await expect(goal).toContainText("20:00.00 줄여야 해요.");
      expect(
        (await renderedLines(goal)).some((l) => l.includes("20:00.00")),
      ).toBe(true);
      await expect(
        goal.locator("span", { hasText: /^20:00\.00$/ }),
      ).toHaveCSS("white-space", "nowrap");
    }
  },
);

/** 기록 줄마다 입력 표시 칩 밖의 글(번호·때·시간·수·「다시 보기」)이 두 줄로 갈린 것 */
function recordRowSplits(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const li of document.querySelectorAll<HTMLElement>(
      "[data-mini-record]",
    )) {
      for (const c of li.children) {
        if (c.matches("[data-mini-source]")) continue;
        const range = document.createRange();
        range.selectNodeContents(c);
        const tops = new Set(
          [...range.getClientRects()].map((r) => Math.round(r.top)),
        );
        if (tops.size > 1) out.push(`「${c.textContent}」 ${tops.size}줄`);
      }
    }
    return out;
  });
}

test(
  "Cubie 기록 창 가장 작은 크기(320×600): 기록 줄의 시간·수·「다시 보기」는 갈리지 않고, 다시 보기 큐브는 상자 안에 든다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    await page.addInitScript(() => {
      if (localStorage.getItem("cube.mini.v1")) return;
      // 앱 기록 창과 같은 저장소 꼴: 다른 프로그램 입력·마우스 칩이 붙은 판과 다시 볼 수 있는 판
      const list = [21_340, 19_870, 25_010, 18_220, 23_400, 20_990, 22_150]
        .map((ms, i) => ({
          at: Date.UTC(2026, 10, 12, 1, 0) + (i + 1) * 97_000,
          no: i + 1,
          n: 3,
          mode: "solo",
          ms,
          penalty: 0,
          moves: 59,
          scramble: "R U R' U'",
          replay: "U@0 R@300 U'@600 R'@900",
          ...(i === 5 ? { keyOrigin: "synthetic" } : {}),
          ...(i === 4 ? { inputs: ["key", "swipe"] } : {}),
        }))
        .reverse();
      localStorage.setItem(
        "cube.mini.v1",
        JSON.stringify({
          version: 1,
          n: 3,
          mirror: true,
          records: { 3: list },
          best5: {},
        }),
      );
    });
    await page.setViewportSize({ width: 320, height: 600 });
    await page.goto("/cube/mini?view=records");
    await expect(page.locator("[data-mini-source='synthetic']")).toBeVisible();
    await expect.poll(() => recordRowSplits(page)).toEqual([]);
    await noSideScroll(page);
    await page.locator("[data-mini-replay-open]").first().click();
    const box = page.locator("[data-mini-replay]");
    // 3D(캔버스)를 못 그리는 브라우저는 같은 자리에 큐브 그림
    const cube = box.locator("[data-cube-canvas], [data-cube-no3d]");
    await expect(cube).toBeVisible();
    await shot(page, "mini-records-min-replay", info.project.name);
    const [boxR, canvasR] = await Promise.all([
      box.boundingBox(),
      cube.boundingBox(),
    ]);
    expect(canvasR && boxR && canvasR.y + canvasR.height).toBeLessThanOrEqual(
      (boxR?.y ?? 0) + (boxR?.height ?? 0) + 0.5,
    );
  },
);

test("없앤 엠블럼 미리보기 주소로 들어오면 티어 화면으로 간다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await page.goto("/cube/tiers/emblems");
  await expect(page).toHaveURL(/\/cube\/tiers$/);
  await expect(page.getByRole("heading", { name: "티어표" })).toBeVisible();
});
