import { no3d } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 내 공식(/cube/algs, docs/47 8절 「내 공식」). 새 공식은 입력이 멈추면 검사되고, 맞는 것만 넣을 수 있다.
 * 검사는 짧은 지연 뒤 화면 안 순수 계산이라 입력 뒤 검사 결과(`[data-alg-check]`)를 조건으로 기다린다.
 */

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS || project !== "desktop") return;
  await page.screenshot({
    path: `test-results/screens/cube-algs-${name}-${project}.png`,
    fullPage: true,
  });
}

// 3D 그림은 보지 않으므로 끈다(e2e/cube.ts `no3d`)
test.beforeEach(({ page }) => no3d(page));

test("내 공식: 맞는 공식은 넣고 틀린 공식은 막고, 좌우 대칭으로 만든 공식도 검사한다", async ({
  page,
}, info) => {
  await page.goto("/cube/algs");
  await expect(page.locator('[data-case-open="oll-27"]')).toBeVisible();
  await shot(page, "list", info.project.name);

  await page.locator('[data-case-open="oll-27"]').click();
  const detail = page.locator('[data-alg-case="oll-27"]');
  await expect(detail).toBeVisible();
  const input = detail.locator("[data-alg-input]");
  const check = detail.locator("[data-alg-check]");
  const add = detail.locator("[data-alg-add]");

  // 틀린 공식: 까닭을 보이고 넣기를 막는다
  await input.fill("R U R'");
  await expect(check).toHaveAttribute("data-alg-check", "bad");
  await expect(check.locator("[data-alg-check-message]")).toHaveText(
    "F2L이 깨짐",
  );
  await expect(add).toBeDisabled();

  // 맞는 공식(수네를 뒤에서): 앞 윗면 돌리기를 붙여 넣는다
  await input.fill("L U L' U L U2 L'");
  await expect(check).toHaveAttribute("data-alg-check", "ok");
  await shot(page, "check-ok", info.project.name);
  await add.click();
  const mine = detail.locator('[data-alg-row="mine"]');
  await expect(mine).toHaveCount(1);
  await expect(mine.locator("[data-alg-text]")).toHaveText(
    /^U\S* L U L' U L U2 L'$/,
  );

  // 쓰는 공식으로 고르면 목록 카드에도 보이고, 새로 열어도 남아 있다
  await mine.locator("[data-alg-use]").click();
  await expect(mine).toHaveAttribute("data-alg-used", "");
  await page.reload();
  await page.locator('[data-case-open="oll-27"]').click();
  await expect(
    page.locator('[data-alg-case="oll-27"] [data-alg-row="mine"]'),
  ).toHaveAttribute("data-alg-used", "");

  // 대표 공식으로 돌려 두고, 좌우 대칭 단추: 수네의 거울은 안티수네(OLL 26)를 푼다
  const d = page.locator('[data-alg-case="oll-27"]');
  await d.locator('[data-alg-row="main"] [data-alg-use]').click();
  await d.locator('[data-alg-mirror="M"]').click();
  await expect(d.locator("[data-alg-input]")).toHaveValue("L' U' L U' L' U2 L");
  await expect(d.locator("[data-alg-check]")).toHaveAttribute(
    "data-alg-check",
    "bad",
  );
  await expect(d.locator("[data-alg-check-other]")).toContainText("OLL 26");
  await shot(page, "mirror", info.project.name);
});

test("공식 링크: 받은 공식을 시연하고 넣을 수 있다", async ({ page }) => {
  await page.goto(
    "/cube/algs?case=pll-ua&alg=R+U%27+R+U+R+U+R+U%27+R%27+U%27+R2",
  );
  const d = page.locator('[data-alg-case="pll-ua"]');
  await expect(d.locator("[data-alg-input]")).toHaveValue(
    "R U' R U R U R U' R' U' R2",
  );
  await expect(d.locator("[data-alg-check]")).toHaveAttribute(
    "data-alg-check",
    "ok",
  );
  await expect(page.locator("[data-cube-demo]")).toBeVisible();
  await d.locator("[data-alg-add]").click();
  // 자료에 이미 있는 대안이라 그대로
  await expect(page.locator("[data-algs-notice]")).toHaveText("이미 있음");
});

test("가져오기: 워커에서 검사해 맞는 것만 넣고, 같은 공식이 되풀이돼도 뺀 목록에 모두 보인다", async ({
  page,
}) => {
  await page.goto("/cube/algs");
  await expect(page.locator('[data-case-open="oll-27"]')).toBeVisible();
  const text = JSON.stringify({
    format: "cube-algs",
    version: 1,
    cases: {
      "oll-27": { mine: ["L U L' U L U2 L'", "R U R'", "R U R'"] },
    },
  });
  await page.locator("[data-algs-import]").setInputFiles({
    name: "cube-algs.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await expect(page.locator("[data-algs-notice]")).toHaveText(
    "가져옴 1 · 뺌 2",
  );
  await expect(page.locator("[data-algs-rejected] li")).toHaveCount(2);
  await page.locator('[data-case-open="oll-27"]').click();
  await expect(
    page.locator('[data-alg-case="oll-27"] [data-alg-row="mine"]'),
  ).toHaveCount(1);
});
