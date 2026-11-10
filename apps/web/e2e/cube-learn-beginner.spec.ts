import { goStep, no3d, shot } from "./cube";
import { expect, test } from "./test";

/**
 * 3×3 처음 맞추기의 경우별 정해진 길(docs/47 16-10): 첫 층 코너·코너 자리·코너 방향이 「이 모양이면 이렇게 쥐고
 * 이 공식 n번」으로 적혀 있고, 공식 연습 초보자 코너 방향 상황도 같은 이름이다. 길이 맞는지는 단위 시험
 * (beginner-path.test.ts)이 엔진으로 보고, 여기서는 화면에 그 글이 보이는지만 본다.
 */

test.beforeEach(({ page }) => no3d(page));

test("배우기: 첫 층 코너·코너 자리·코너 방향은 모양마다 공식과 횟수를 정해 보인다", async ({
  page,
}, info) => {
  const body = page.locator("[data-step-body]");

  await page.goto("/cube/learn?lesson=333-first-corners-up");
  await goStep(page, 4);
  await expect(body).toContainText("흰색이 오른쪽이면 한 번, 아래면 세 번");
  // 글 속 공식에는 키 그림이 붙으므로 공식 글자 대신 「거꾸로」와 횟수를 본다
  await expect(body).toContainText("흰색이 앞이면 거꾸로");
  await shot(page, "learn-beginner-first-corners", info.project.name);

  await page.goto("/cube/learn?lesson=333-ll-corner-place");
  await goStep(page, 2);
  await expect(body).toContainText(
    "대각선 건너편인 뒤-오른쪽 위면 공식을 한 번",
  );
  await shot(page, "learn-beginner-corner-place", info.project.name);

  await page.goto("/cube/learn?lesson=333-ll-corner-twist");
  await goStep(page, 0);
  await expect(body).toContainText("앞을 보면 거꾸로");
  await expect(body).toContainText("두 번");
  await expect(body).not.toContainText("때까지");
  await shot(page, "learn-beginner-corner-twist", info.project.name);
});

test("공식 연습: 초보자 코너 방향 상황은 노란색이 보는 쪽으로 부른다", async ({
  page,
}, info) => {
  await page.goto("/cube/train?set=beginner-twist");
  const main = page.locator("[data-practice-stage]");
  await expect(main).toHaveAttribute("data-practice-stage", "beginner-twist");
  await expect(page.locator("[data-practice-name]")).toContainText(
    /노란색 (오른쪽|앞)/,
  );
  await shot(page, "train-beginner-twist", info.project.name);
});
