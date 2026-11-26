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
  // 8번(0부터 7): 코너 돌리기 한 번마다 다음 모양으로 바뀌는 차례와 경우 그림(모양마다 횟수)
  await goStep(page, 7);
  await expect(body).toContainText("다 맞음까지 남은 횟수만큼");
  const sheet = page.locator('[data-sheet="beginner-corners"]');
  await expect(sheet.locator("[data-sheet-case]")).toHaveCount(6);
  await expect(sheet.locator('[data-sheet-case="bottom-down"]')).toContainText(
    "세 번 쳐요",
  );
  await expect(sheet.locator('[data-sheet-case="bottom-front"]')).toContainText(
    "거꾸로 한 번",
  );
  await shot(page, "learn-beginner-first-corners", info.project.name);

  await page.goto("/cube/learn?lesson=333-ll-corner-place");
  await goStep(page, 3);
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

test("배우기: 코너 방향 먼저(신광사 해법) 두 강은 모든 경우 그림·관계도·덩어리 짜임을 보인다(docs/47 16-33)", async ({
  page,
}, info) => {
  const cases = (name: string) =>
    page.locator(`[data-sheet="${name}"] [data-sheet-case]`);
  const chunks = page.locator("[data-alg-chunks] [data-alg-chunk]");

  await page.goto("/cube/learn?lesson=333-tf-twist");
  await goStep(page, 1);
  await expect(cases("beginner-tf-twist")).toHaveCount(8);
  await shot(page, "learn-tf-twist-cases", info.project.name);
  await goStep(page, 2);
  await expect(chunks).toHaveCount(4);
  await expect(page.locator("[data-step-body]")).toContainText(
    "첫 층 코너 돌리기 R' D' R D와 같은 꼴",
  );
  await shot(page, "learn-tf-twist-chunks", info.project.name);
  // 관계도: 일곱 모양 + 다 맞음, 둘인 모양은 하나짜리 모양으로, 기본형은 다 맞음으로
  await goStep(page, 6);
  const flow = page.locator('[data-sheet="tf-flow"]');
  await expect(flow.locator("[data-flow-node]")).toHaveCount(8);
  await expect(flow.locator('[data-flow-node="side"]')).toHaveAttribute(
    "data-flow-to",
    "fish",
  );
  await expect(flow.locator('[data-flow-node="base"]')).toHaveAttribute(
    "data-flow-to",
    "done",
  );
  await shot(page, "learn-tf-twist-flow", info.project.name);

  await page.goto("/cube/learn?lesson=333-tf-place");
  await goStep(page, 1);
  await expect(cases("beginner-tf-place")).toHaveCount(5);
  await goStep(page, 2);
  await expect(chunks).toHaveCount(5);
  await shot(page, "learn-tf-place-chunks", info.project.name);
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

test("배우기·공식 연습: 노란 십자는 윗층 엣지의 노란 칸만 보이고 코너 블럭은 가린다", async ({
  page,
}, info) => {
  // 큐브 그림 윗면(흰 면 아래로 쥔 상태): 칸 0은 코너, 칸 4는 노란 센터
  const corner = page.locator('[data-sticker="0"]').first();
  const center = page.locator('[data-sticker="4"]').first();
  await page.goto("/cube/learn?lesson=333-ll-cross");
  for (const [step, name] of [
    [0, "line"],
    [4, "ell"],
    [7, "dot"],
  ] as const) {
    await goStep(page, step);
    await expect(corner).toHaveAttribute("data-sticker-hidden", "");
    await expect(center).not.toHaveAttribute("data-sticker-hidden", "");
    await shot(page, `learn-ll-cross-${name}`, info.project.name);
  }

  await page.goto("/cube/train?set=beginner-yellow-cross");
  await expect(page.locator("[data-practice-stage]")).toHaveAttribute(
    "data-practice-stage",
    "beginner-yellow-cross",
  );
  // 문제가 놓인 뒤(가리기는 문제 판에만 붙는다)
  await expect(page.locator("main[data-practice-stage]")).toHaveAttribute(
    "data-practice-phase",
    "play",
  );
  await expect(corner).toHaveAttribute("data-sticker-hidden", "");
  await shot(page, "train-beginner-yellow-cross", info.project.name);
});
