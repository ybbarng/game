import { no3d } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브의 기초(`/cube/basics`, docs/47 16-27): 맨 위 분해한 큐브의 속(3D, 못 그리면 SVG), 기초 단원 셋(이름과 ✓),
 * 키 익히기·핑거 트릭, 맨 아래 해법 배우기. 기초 단원은 단원 id가 그대로이고, 마지막 단원 다음은 초보자 과정 첫 단원이다.
 */

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

test("큐브의 기초: 제목, 분해 그림, 기초 단원 셋, 연습 둘, 해법 배우기 칸", async ({
  page,
}, info) => {
  await no3d(page);
  // 「큐브와 만나기」를 끝낸 기기
  await page.addInitScript(() =>
    localStorage.setItem(
      "cube.learn.v1",
      JSON.stringify({ lessons: { "333-start": { passed: [], done: true } } }),
    ),
  );
  await page.goto("/cube/basics");
  await expect(page).toHaveTitle("큐브의 기초");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "큐브의 기초",
  );
  // 3D를 못 그리면 조각을 떼어 놓은 그림
  await expect(
    page.locator("[data-basics-model] [data-cube-exploded]"),
  ).toBeVisible();

  const lessons = page.locator("[data-cube-basics] [data-lesson]");
  expect(
    await lessons.evaluateAll((els) =>
      els.map((a) => [
        a.getAttribute("data-lesson"),
        a.getAttribute("href"),
        a.textContent,
      ]),
    ),
  ).toEqual([
    ["333-start", "/cube/learn?lesson=333-start", "✓큐브와 만나기"],
    ["333-piece-moves", "/cube/learn?lesson=333-piece-moves", "2조각의 움직임"],
    ["333-notation", "/cube/learn?lesson=333-notation", "3표기 읽기"],
  ]);
  await expect(lessons.first()).toHaveAttribute("data-lesson-done", "");

  await expect(page.locator("[data-basics-keys]")).toHaveAttribute(
    "href",
    "/cube/intro?part=keys",
  );
  await expect(page.locator("[data-basics-fingers]")).toHaveAttribute(
    "href",
    "/cube/fingers",
  );
  // 해법 배우기 칸은 맨 아래
  const last = page.locator("[data-cube-basics] > a").last();
  await expect(last).toHaveAttribute("data-basics-methods", "");
  await expect(last).toHaveText("🧭해법 배우기 →");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await shot(page, "basics", info.project.name);

  await last.click();
  await expect(page).toHaveURL(/\/cube\/methods$/);
});

test("기초 단원: 돌아가기는 큐브의 기초, 마지막 단원 다음은 초보자 과정 첫 단원", async ({
  page,
}) => {
  await no3d(page);
  await page.goto("/cube/learn?lesson=333-notation");
  const back = page.locator("[data-lesson-back]");
  await expect(back).toHaveText("← 큐브의 기초");
  await expect(back).toHaveAttribute("href", "/cube/basics");
  // 단원 머리에 초보자 과정 단계 띠가 없다(기초는 단계가 없는 과정)
  await expect(page.locator("[data-stage-header]")).toHaveCount(0);
  await page.locator("[data-step-to]").last().click();
  await expect(page.locator("[data-lesson-next]")).toHaveAttribute(
    "href",
    "/cube/learn?lesson=333-beginner-map",
  );

  // 해법 단원의 돌아가기는 해법 배우기
  await page.goto("/cube/learn?lesson=333-safe-turns");
  await expect(back).toHaveText("← 해법 배우기");
  await expect(back).toHaveAttribute("href", "/cube/methods?m=333-beginner");
});

test(
  "큐브의 기초 3D: 동작 줄이기면 멈춰 있고, 끌어 돌린 각도는 손을 떼도 남는다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 데스크톱에서만(마우스 끌기)
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/cube/basics");
    const canvas = page.locator('[data-core-cube="live"]');
    // GPU 없는 브라우저는 첫 장면이 느려 상한을 넉넉히
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    const yaw = async () => Number(await canvas.getAttribute("data-core-yaw"));
    // 엣지 블럭의 스티커와 혀가 보이는 멈춘 각(core-spin.ts REST_YAW, 150°)
    await expect.poll(yaw).toBeCloseTo((150 * Math.PI) / 180, 2);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("캔버스 자리가 없다");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, y, { steps: 5 });
    await page.mouse.up();
    // 100px × 0.012 = 1.2라디안 돌고, 손을 떼도 그대로
    await expect.poll(yaw).toBeCloseTo((150 * Math.PI) / 180 + 1.2, 2);
    await shot(page, "basics-3d", info.project.name);
  },
);
