import {
  goStep,
  goToStep,
  inputReady,
  no3d,
  shot,
  useNotationKeys,
} from "./cube";
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

test("배우기: 큐브와 만나기는 환영 → 스티커와 조각 → 가운데 여섯 세기 → 분해·조립", async ({
  page,
}, info) => {
  await page.goto("/cube/learn");
  // 3×3 처음 맞추기의 첫 단원
  await expect(
    page.locator('[data-course="333-beginner"] [data-lesson]').first(),
  ).toHaveAttribute("data-lesson", "333-start");

  await page.goto("/cube/learn?lesson=333-start");
  const section = page.locator("[data-step-kind]");
  // 환영: 「따라오세요」를 누르면 다음 단계
  await expect(section).toHaveAttribute("data-step-kind", "welcome");
  await page.locator("[data-welcome-start]").click();
  await expect(section).toHaveAttribute("data-step-kind", "parts");
  // 스티커로 보기 → 칸을 누르면 그 조각이 들린다 → 조각으로 보기
  const parts = page.locator('[data-act="parts"]');
  await page.locator('[data-net-cell="7"]').click();
  await expect(parts.getByRole("status")).toContainText("흰-초록 모서리 조각");
  // 흰-초록 모서리의 다른 칸(앞면 윗줄 가운데, 19)도 함께 표시된다
  await expect(page.locator('[data-net-cell="19"]')).toHaveAttribute(
    "data-net-mark",
    "pick",
  );
  await parts.locator('[data-parts-to="piece"]').click();
  await expect(parts).toHaveAttribute("data-act-passed", "");

  await goStep(page, 2);
  await expect(section).toHaveAttribute("data-step-kind", "find");
  const find = page.locator('[data-act="find"]');
  const count = find.locator("[data-find-count]");
  await expect(count).toHaveAttribute("data-find-count", "0/6");
  // 모서리 칸(위 앞 가운데)은 틀림: 세지 않고 빨강으로 알린다
  await page.locator('[data-net-cell="7"]').click();
  await expect(find.getByRole("status")).toContainText("모서리 조각");
  await expect(count).toHaveAttribute("data-find-count", "0/6");
  // 가운데 하나를 고르면 색이 드러나고 표시가 붙는다. 다시 누르면 풀린다
  const top = page.locator('[data-net-cell="4"]');
  await expect(top).toHaveAttribute("data-net-hidden", "");
  await top.click();
  await expect(count).toHaveAttribute("data-find-count", "1/6");
  await expect(top).not.toHaveAttribute("data-net-hidden", "");
  await expect(top).toHaveAttribute("data-net-mark", "pick");
  await top.click();
  await expect(count).toHaveAttribute("data-find-count", "0/6");
  for (const cell of [4, 13, 22, 31, 40, 49])
    await page.locator(`[data-net-cell="${cell}"]`).click();
  await expect(count).toHaveAttribute("data-find-count", "6/6");
  await expect(find).toHaveAttribute("data-act-passed", "");
  await expect(top).toHaveAttribute("data-net-mark", "right");
  await shot(page, "learn-pieces-count", info.project.name);

  // 분해·조립: 분해 → 축 → 가운데(흰·초록은 먼저) → 모서리 둘 → 나머지 → 꼭짓점 하나 → 나머지
  await goStep(page, 3);
  const build = page.locator('[data-act="build"]');
  await build.locator("[data-build-start]").click();
  await expect(build).toHaveAttribute("data-build-phase", "core");
  await build.locator("[data-build-next]").click();
  const built = build.locator("[data-build-count]");
  await expect(built).toHaveAttribute("data-build-count", "2/6");
  const say = build.locator("[data-build-say]");
  // 노랑을 오른쪽에: 흰 맞은편에 와야 한다
  await page.locator('[data-net-cell="13"]').click();
  await expect(say).toContainText("흰 맞은편");
  await page.locator('[data-net-cell="31"]').click();
  await expect(built).toHaveAttribute("data-build-count", "3/6");
  // 빨강을 왼쪽에: 맞출 수 없는 큐브(거울)
  await page.locator('[data-net-cell="40"]').click();
  await expect(say).toContainText("맞출 수 없는 큐브");
  for (const cell of [13, 49, 40])
    await page.locator(`[data-net-cell="${cell}"]`).click();
  await expect(build).toHaveAttribute("data-build-phase", "edges");
  // 흰-초록(위 앞 가운데 7), 흰-빨강(위 오른쪽 가운데 5)
  for (const cell of [7, 5])
    await page.locator(`[data-net-cell="${cell}"]`).click();
  await build.locator("[data-build-fill]").click();
  await expect(build).toHaveAttribute("data-build-phase", "corners");
  await page.locator('[data-net-cell="8"]').click();
  await build.locator("[data-build-fill]").click();
  await expect(build).toHaveAttribute("data-act-passed", "");
  await expect(page.locator("[data-net-cell][data-net-hidden]")).toHaveCount(0);

  // 확인 문제: R U2를 돌린 뒤 가운데만 보이게 가린 큐브에서 흰-초록-빨강 꼭짓점 찾기
  await page.goto("/cube/learn?lesson=333-pieces");
  await goStep(page, 4);
  // 원래 자리(위-앞-오른쪽, 칸 8)에는 이제 다른 꼭짓점이 있다
  await page.locator('[data-net-cell="8"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  // R U2 뒤에는 위-앞-왼쪽(윗면 칸 6)
  const corner = page.locator('[data-net-cell="6"]');
  await expect(corner).toHaveAttribute("data-net-hidden", "");
  await corner.click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  // 찾은 꼭짓점은 가리기가 풀려 색이 드러난다(3D도 같은 마스크를 쓴다)
  await expect(corner).not.toHaveAttribute("data-net-hidden", "");
  await shot(page, "learn-pieces-track", info.project.name);

  // 평가: 한 면을 맞춘 상태는? (가) 흰 면만 흰색 / (나) 흰 조각이 제자리
  await goStep(page, 5);
  const quiz = page.locator('[data-act="quiz"]');
  await expect(quiz.locator("[data-quiz-picture]")).toHaveCount(2);
  await page.locator("[data-learn-quiz] [data-choice='0']").click();
  await expect(quiz).not.toHaveAttribute("data-act-passed", "");
  await page.locator("[data-learn-quiz] [data-choice='1']").click();
  await expect(quiz).toHaveAttribute("data-act-passed", "");
  await expect(quiz).toContainText("조각이 제자리");
});

test("배우기: 놀이판에서 모든 키로 돌려 보고, 다른 조각을 골라 따라간다", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/learn?lesson=333-pieces");
  await goToStep(page, "play");
  const play = page.locator('[data-act="play"]');
  await inputReady(page);
  // 가운데만 색: 펼친 그림에서 보이는 칸은 여섯
  const shown = page.locator("[data-net-cell]:not([data-net-hidden])");
  await expect(shown).toHaveCount(6);
  if (info.project.name === "desktop") {
    // 큐브 전체 돌리기(x)는 세지 않는다. 면·가운데 층·넓게 돌리기는 센다
    await page.keyboard.press("KeyX");
    await expect(play).toHaveAttribute("data-play-turns", "0");
    for (const k of ["KeyR", "Shift+KeyU", "KeyM", "Alt+KeyF"])
      await page.keyboard.press(k);
    await expect(play).toHaveAttribute("data-play-turns", "4");
    // 되돌리기(Backspace)도 한 수
    await page.keyboard.press("Backspace");
  } else {
    // 휴대폰: 표기 단추 줄
    const buttons = page.locator("[data-cube-buttons] button");
    for (const b of ["R", "U", "F", "L", "D"])
      await buttons.filter({ hasText: new RegExp(`^${b}$`) }).click();
  }
  await expect(play).toHaveAttribute("data-play-turns", "5");
  await expect(play).toHaveAttribute("data-act-passed", "");
  // 가운데는 그대로 보인다
  await expect(shown).toHaveCount(6);
  // 다른 조각 보기: 꼭짓점 하나만 색(칸 셋)
  await play.locator('[data-play-choose="꼭짓점"]').click();
  await expect(shown).toHaveCount(3);
  // 처음으로
  await play.locator("[data-play-reset]").click();
  await expect(page.locator('[data-net-cell="8"]')).not.toHaveAttribute(
    "data-net-hidden",
    "",
  );
  await shot(page, "learn-pieces-play", info.project.name);
});

test("배우기: 첫 층 꼭짓점은 세 색 가운데로 넣을 칸을 고른다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=333-first-corners-up");
  // 1번: 흰-초록-빨강이 들어갈 칸(흰 면 위, 위-앞-오른쪽) 누르기
  await goStep(page, 1);
  const find = page.locator('[data-act="find"]');
  // 앞면 왼쪽 위(18)는 위-앞-왼쪽 칸이라 틀림
  await page.locator('[data-net-cell="18"]').click();
  await expect(find.getByRole("status")).toContainText("가운데 사이");
  // 앞면 오른쪽 위(20) = 위-앞-오른쪽 칸
  await page.locator('[data-net-cell="20"]').click();
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
