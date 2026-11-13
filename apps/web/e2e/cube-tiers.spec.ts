import { no3d, shot } from "./cube";
import { expect, type Locator, type Page, test } from "./test";

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
    "아직 Ao5가 없습니다",
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
  // 사다리: 열 티어 모두 잠김, 칸마다 미리 찍은 그림과 그 티어에 드는 시간
  await expect(page.locator("[data-cube-ladder]")).toHaveCount(10);
  await expect(page.locator("[data-cube-ladder-locked]")).toHaveCount(10);
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
  await expect(next).toContainText("Ao5 10초 이하");
  // 정지 그림: 내 티어(3D 대신) + 다음 티어
  await stillsLoaded(page.locator("[data-cube-tier-mine-box]"), 2);
  // 사다리: 다이아몬드가 내 칸, 그 위 셋(마스터·그랜드마스터·챌린저)만 잠김
  await expect(page.locator("[data-cube-ladder-mine]")).toHaveAttribute(
    "data-cube-ladder",
    "diamond",
  );
  const locked = page.locator("[data-cube-ladder-locked]");
  await expect(locked).toHaveCount(3);
  for (const t of ["master", "grandmaster", "challenger"])
    await expect(
      page.locator(`[data-cube-ladder="${t}"][data-cube-ladder-locked]`),
    ).toHaveCount(1);
  await noSideScroll(page);
  await shot(page, "tiers-mine", info.project.name);

  // 다른 크기는 아직 없다
  await page.locator("[data-cube-tier-size='4']").click();
  await expect(page.locator("[data-cube-tier-mine-box]")).toContainText(
    "아직 Ao5가 없습니다",
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
  await page.locator("[data-cube-records]").scrollIntoViewIfNeeded();
  await shot(page, "solo-tier", info.project.name);
  await tier.click();
  await expect(page).toHaveURL(/\/cube\/tiers\?n=3$/);
  await expect(page.locator("[data-cube-my-tier]")).toHaveText("다이아몬드 IV");
});

test("없앤 엠블럼 미리보기 주소로 들어오면 티어 화면으로 간다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await page.goto("/cube/tiers/emblems");
  await expect(page).toHaveURL(/\/cube\/tiers$/);
  await expect(page.getByRole("heading", { name: "티어표" })).toBeVisible();
});
