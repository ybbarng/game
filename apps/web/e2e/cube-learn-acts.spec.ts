import { goStep, no3d, shot } from "./cube";
import { expect, test } from "./test";

/**
 * 큐브 배우기의 상호작용 단계(조각 찾기·고르기 문제·글자 표, /cube/learn, docs/47 8절).
 * 3D 그림은 보지 않으므로 끄고(`no3d`) 펼친 그림의 칸(`data-net-cell`)을 누른다.
 */

test.beforeEach(({ page }) => no3d(page));

test("배우기: 흰 십자 단원은 조각 찾기와 고르기 문제로 시작한다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=333-white-cross");
  const section = page.locator("[data-step-kind]");
  await expect(section).toHaveAttribute("data-step-kind", "find");
  // 글 단계에도 큐브 그림이 있다(3D 첫 그림 대신 준비 표시 또는 펼친 그림 대체를 기다린다)
  await expect(page.locator("[data-cube-still]")).toHaveCount(1);
  await shot(page, "learn-white-cross-find", info.project.name);

  // 조각 찾기: F2로 내려간 흰-초록 모서리. 틀린 칸(앞 가운데)은 부드럽게 다시
  const find = page.locator('[data-act="find"]');
  const next = page.locator("[data-step-next]");
  await expect(next).toHaveText("건너뛰기 →");
  await page.locator('[data-net-cell="22"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  await expect(find.getByRole("status")).toContainText("다시 찾아보세요");
  // 앞면 아랫줄 가운데 = 흰-초록 모서리의 초록 칸
  await page.locator('[data-net-cell="25"]').click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  await expect(next).toHaveText("다음 →");

  // 고르기 문제: 틀리면 다시, 맞히면 통과
  await next.click();
  await expect(section).toHaveAttribute("data-step-kind", "quiz");
  const quiz = page.locator('[data-act="quiz"]');
  await page.locator("[data-learn-quiz] [data-choice='0']").click();
  await expect(quiz).not.toHaveAttribute("data-act-passed", "");
  await page.locator("[data-learn-quiz] [data-choice='1']").click();
  await expect(quiz).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-white-cross-quiz", info.project.name);
});

test("배우기: 루 첫 블록은 조각 찾기, ZZ 모서리 방향은 고르기 문제로 시작한다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=roux-fb");
  const section = page.locator("[data-step-kind]");
  await expect(section).toHaveAttribute("data-step-kind", "find");
  await expect(page.locator("[data-cube-still]")).toHaveCount(1);
  // 섞인 큐브의 흰-빨강 모서리: 오른쪽 면 아랫줄 가운데(16)와 아랫면(32). 앞 가운데(22)는 틀림
  const find = page.locator('[data-act="find"]');
  await page.locator('[data-net-cell="22"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  await page.locator('[data-net-cell="16"]').click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-roux-fb-find", info.project.name);

  // ZZ 모서리 방향: 셋째 단계 「위-왼쪽 모서리는 좋은 모서리일까요?」
  await page.goto("/cube/learn?lesson=zz-eo");
  const next = page.locator("[data-step-next]");
  await expect(section).toHaveAttribute("data-step-kind", "quiz");
  await next.click();
  await expect(section).toHaveAttribute("data-step-kind", "demo");
  await next.click();
  await expect(section).toHaveAttribute("data-step-kind", "quiz");
  const quiz = page.locator('[data-act="quiz"]');
  await expect(quiz).toContainText("위-왼쪽 모서리");
  await page.locator("[data-learn-quiz] [data-choice='1']").click();
  await expect(quiz).not.toHaveAttribute("data-act-passed", "");
  await page.locator("[data-learn-quiz] [data-choice='0']").click();
  await expect(quiz).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-zz-eo-quiz", info.project.name);
});

test("배우기: F2L 짝 문제, 과정 끝 「다음에 할 것」, 블라인드 글자 표", async ({
  page,
}, info) => {
  // 목록: 먼저 배울 과정이 보인다(잠그지 않음)
  await page.goto("/cube/learn");
  await expect(
    page.locator('[data-course="cfop"] [data-course-requires]'),
  ).toHaveAttribute("data-course-requires", "333-beginner");

  // F2L 진짜 짝 문제
  await page.goto("/cube/learn?lesson=cfop-f2l-pair");
  await goStep(page, 1);
  const quiz = page.locator('[data-act="quiz"]');
  await expect(quiz.locator("[data-cube-still]")).toBeVisible();
  await page.locator("[data-learn-quiz] [data-choice='1']").click();
  await expect(quiz).not.toHaveAttribute("data-act-passed", "");
  await page.locator("[data-learn-quiz] [data-choice='0']").click();
  await expect(quiz).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-f2l-pair-quiz", info.project.name);

  // 과정 끝: CFOP 마무리 단원의 마지막 단계
  await page.goto("/cube/learn?lesson=cfop-finale");
  const steps = page.locator('ol[aria-label="단계"] button');
  await goStep(page, (await steps.count()) - 1);
  const next = page.locator('[data-course-next="cfop"]');
  await expect(next).toBeVisible();
  await expect(next.locator('[data-next-course="roux"]')).toBeVisible();
  await expect(next.locator('[data-next-drill="f2l"]')).toHaveAttribute(
    "href",
    "/cube/train?set=f2l",
  );
  await expect(next.locator("[data-next-timer]")).toBeVisible();
  await shot(page, "learn-course-next", info.project.name);

  // 블라인드: 글자마다 준비 수 표
  await page.goto("/cube/learn?lesson=bld-edges");
  const sheet = page.locator('[data-sheet="bld-edges"]');
  await expect(sheet.locator('[data-sheet-letter="J"]')).toContainText("d2");
  await expect(sheet.locator("[data-sheet-letter]")).toHaveCount(22);
});

test("배우기: 큐브의 조각 단원은 조각 찾기와 조각 따라가기로 시작한다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn");
  // 3×3 처음 맞추기의 첫 단원
  await expect(
    page.locator('[data-course="333-beginner"] [data-lesson]').first(),
  ).toHaveAttribute("data-lesson", "333-pieces");

  await page.goto("/cube/learn?lesson=333-pieces");
  const section = page.locator("[data-step-kind]");
  await expect(section).toHaveAttribute("data-step-kind", "find");
  const find = page.locator('[data-act="find"]');
  // 흰 가운데 찾기: 모서리 칸(위 앞 가운데)은 틀림, 윗면 한가운데(칸 4)가 맞음
  await page.locator('[data-net-cell="7"]').click();
  await expect(find.getByRole("status")).toContainText("모서리 조각");
  await page.locator('[data-net-cell="4"]').click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-pieces-find", info.project.name);

  // 조각 따라가기: R을 돌린 뒤 가운데만 보이게 가린 큐브에서 흰-초록-빨강 꼭짓점 찾기
  await goStep(page, 10);
  // 본문 속 수 R 옆에는 데스크톱에서 키캡이 붙으므로 수 다음 글과 수 칩으로 본다
  await expect(section).toContainText("이번에는 가운데만 보여요");
  await expect(
    section.locator('[data-step-body] [data-move-chip="R"]'),
  ).toHaveCount(1);
  // 원래 자리(위-앞-오른쪽, 칸 8)에는 이제 다른 꼭짓점이 있다
  await page.locator('[data-net-cell="8"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  // R 뒤에는 위-뒤-오른쪽(윗면 칸 2)
  await expect(page.locator('[data-net-cell="2"]')).toHaveAttribute(
    "data-net-hidden",
    "",
  );
  await page.locator('[data-net-cell="2"]').click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  // 찾은 꼭짓점은 가리기가 풀려 색이 드러난다(3D도 같은 마스크를 쓴다)
  await expect(page.locator('[data-net-cell="2"]')).not.toHaveAttribute(
    "data-net-hidden",
    "",
  );
  await shot(page, "learn-pieces-track", info.project.name);
});

test("배우기: 첫 층 꼭짓점은 두 옆색으로 넣을 칸을 고른다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=333-first-corners");
  // 3번: 흰-초록-주황이 들어갈 칸(아래-앞-오른쪽) 누르기
  await goStep(page, 3);
  const find = page.locator('[data-act="find"]');
  // 앞면 왼쪽 아래(24)는 아래-앞-왼쪽 칸이라 틀림
  await page.locator('[data-net-cell="24"]').click();
  await expect(find.getByRole("status")).toContainText("가운데 사이");
  // 앞면 오른쪽 아래(26) = 아래-앞-오른쪽 칸
  await page.locator('[data-net-cell="26"]').click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-corner-slot", info.project.name);
});

test("배우기: 3×3을 아는 사람의 2×2는 꼭짓점만 보이는 3×3을 곁에 둔다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=222-from333-corners");
  await expect(page.locator("[data-step-beside='3']")).toBeVisible();
  const quiz = page.locator('[data-act="quiz"]');
  await page.locator("[data-learn-quiz] [data-choice='0']").click();
  await expect(quiz).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-222-from333", info.project.name);
});
