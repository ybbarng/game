import {
  goToStep,
  inputReady,
  keysFor,
  no3d,
  shot,
  useNotationKeys,
} from "./cube";
import { expect, test } from "./test";

/**
 * 큐브 배우기의 단계 지도와 같은 공식 되풀이(/cube/learn, docs/47 8-2·8-6).
 * 3D 그림은 보지 않으므로 끈다(`no3d`).
 */

test.beforeEach(({ page }) => no3d(page));

test("배우기: 3×3 초보자 지도는 일곱 단계 띠와 단계별 시연, 고르기", async ({
  page,
}, info) => {
  await page.goto("/cube/learn");
  await expect(
    page.locator('[data-course="333-beginner"] [data-course-stages]'),
  ).toHaveText("7단계");

  await page.goto("/cube/learn?lesson=333-beginner-map");
  await expect(page.locator("[data-stage-header]")).toHaveAttribute(
    "data-stage-header",
    "map",
  );
  const demo = page.locator("[data-stage-demo]");
  await expect(demo).toHaveAttribute("data-stage-demo", "0");
  await expect(page.locator("[data-stage-strip='7'] li")).toHaveCount(7);
  await page.locator("[data-stage-next]").click();
  await expect(demo).toHaveAttribute("data-stage-demo", "1");
  await expect(page.locator("[data-stage-now]")).toContainText("첫 층 꼭짓점");
  // 띠의 마지막 칸을 누르면 그 단계 시연
  await page.locator("[data-stage-pick='6']").click();
  await expect(demo).toHaveAttribute("data-stage-demo", "6");
  await expect(
    page.locator("[data-stage-strip] li[aria-current='step']"),
  ).toHaveAttribute("data-stage", "6");
  await shot(page, "learn-map-demo", info.project.name);

  // 고르기: 흰 십자 다음 단계(답은 가운데)
  await goToStep(page, "quiz");
  await expect(page.locator("[data-stage-strip]")).toBeVisible();
  const quiz = page.locator('[data-act="quiz"]');
  await page.locator("[data-learn-quiz] [data-choice='1']").click();
  await expect(quiz).toHaveAttribute("data-act-passed", "");

  // 단계 단원 머리: 7단계 중 5단계
  await page.goto("/cube/learn?lesson=333-ll-edges");
  await expect(page.locator("[data-stage-label]")).toHaveText("7단계 중 5단계");
  await expect(
    page.locator("[data-stage-header] li[aria-current='step']"),
  ).toHaveAttribute("data-stage", "4");
});

test("배우기: 노란 십자는 같은 공식을 두 번 써서 통과한다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await useNotationKeys(page);
  await page.goto("/cube/learn?lesson=333-ll-cross");
  await goToStep(page, "try");
  await inputReady(page);
  const eo = "F R U R' U' F'";
  const tryBox = page.locator("[data-cube-try]");
  // 한 번 하면 가로줄이 될 뿐 아직 통과가 아니다
  for (const k of keysFor(eo)) await page.keyboard.press(k);
  await expect(tryBox).toContainText("수 6");
  await expect(tryBox).not.toHaveAttribute("data-cube-passed", "");
  // 같은 공식을 한 번 더
  for (const k of keysFor(eo)) await page.keyboard.press(k);
  await expect(tryBox).toHaveAttribute("data-cube-passed", "");
  await shot(page, "learn-ll-cross-twice", info.project.name);
});
