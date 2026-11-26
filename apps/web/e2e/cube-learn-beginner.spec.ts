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

test("배우기: 흰 십자는 첫머리에 다섯 모양을 훑고, 옆으로 옮겨 올리는 공식을 네 덩어리로 보이고, 끝에 모양마다 할 일을 다시 묶는다", async ({
  page,
}, info) => {
  const body = page.locator("[data-step-body]");
  await page.goto("/cube/learn?lesson=333-white-cross");

  // 3번(0부터 2): 할 일 없이 모양만
  await goStep(page, 2);
  const look = page.locator('[data-sheet="beginner-cross-look"]');
  await expect(look.locator("[data-sheet-case]")).toHaveCount(5);
  await expect(look).not.toContainText("F2");
  await shot(page, "learn-beginner-cross-look", info.project.name);

  // 8번(0부터 7): 흰색이 앞이면 D R F' R'(옮기고 세우고 올리고 되돌린다)
  await goStep(page, 7);
  await expect(body).toContainText("옆으로 옮겨서 세운 뒤 올려요");
  const chunks = page.locator("[data-alg-chunk]");
  await expect(chunks).toHaveCount(4);
  for (const [i, m] of ["D", "R", "F'", "R'"].entries())
    await expect(chunks.nth(i)).toHaveAttribute("data-alg-chunk", m);
  await shot(page, "learn-beginner-cross-flip", info.project.name);

  // 22번(0부터 21): 정리 그림은 모양마다 할 일
  await goStep(page, 21);
  const all = page.locator('[data-sheet="beginner-cross"]');
  await expect(all.locator("[data-sheet-case]")).toHaveCount(5);
  await expect(all.locator('[data-sheet-case="down-side"]')).toContainText(
    "아래-오른쪽으로 데려와",
  );
  await expect(all.locator('[data-sheet-case="middle"]').first()).toContainText(
    "아래 층에 내려요",
  );
  await expect(body).not.toContainText("전체를 보며");
  await shot(page, "learn-beginner-cross-sheet", info.project.name);
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
