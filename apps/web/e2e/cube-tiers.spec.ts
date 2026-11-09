import { no3d, shot } from "./cube";
import { expect, type Page, test } from "./test";

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
  await expect(page.locator("[data-cube-tier-row='diamond']")).toContainText(
    "14초",
  );
  await expect(page.locator("[data-cube-tier-mine-box]")).toContainText(
    "아직 Ao5가 없습니다",
  );
  await expect(page.locator("[data-cube-tier-mine]")).toHaveCount(0);
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
  await page.locator("[data-cube-records]").scrollIntoViewIfNeeded();
  await shot(page, "solo-tier", info.project.name);
  await tier.click();
  await expect(page).toHaveURL(/\/cube\/tiers\?n=3$/);
  await expect(page.locator("[data-cube-my-tier]")).toHaveText("다이아몬드 IV");
});
