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
 * 3D 그림은 보지 않으므로 끄고(`no3d`) 큐브 그림(SVG)의 칸(`data-sticker-cell`)을 누른다.
 */

test.beforeEach(({ page }) => no3d(page));

test("배우기: 흰 십자 단원은 조각 찾기와 고르기 문제로 시작한다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=333-white-cross");
  const section = page.locator("[data-step-kind]");
  await expect(section).toHaveAttribute("data-step-kind", "find");
  // 글 단계에도 큐브 그림이 있다(3D 첫 그림 대신 준비 표시 또는 큐브 그림 대체를 기다린다)
  await expect(page.locator("[data-cube-still]")).toHaveCount(1);
  await shot(page, "learn-white-cross-find", info.project.name);

  // 조각 찾기: F2로 내려간 흰-초록 엣지 블럭. 틀린 칸(앞 센터)은 부드럽게 다시
  const find = page.locator('[data-act="find"]');
  const next = page.locator("[data-step-next]");
  await expect(next).toHaveText("건너뛰기 →");
  await page.locator('[data-sticker-cell="22"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  await expect(find.getByRole("status")).toContainText("다시 찾아보세요");
  // 앞면 아랫줄 가운데 = 흰-초록 엣지의 초록 칸
  await page.locator('[data-sticker-cell="25"]').click();
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

test("배우기: 루 첫 블록은 조각 찾기, ZZ 엣지 방향은 고르기 문제로 시작한다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=roux-fb");
  const section = page.locator("[data-step-kind]");
  await expect(section).toHaveAttribute("data-step-kind", "find");
  await expect(page.locator("[data-cube-still]")).toHaveCount(1);
  // 시연이 z2 y로 만드는 초록 블록의 흰-초록 엣지 블럭: 섞기 21 뒤 앞-오른쪽 자리, 흰 칸은 앞면 가운데 줄 오른쪽(23),
  // 초록 칸은 오른쪽 면 가운데 줄 왼쪽(12). 앞 센터(22)와 예전 답이던 흰-빨강 엣지(16)는 틀림
  const find = page.locator('[data-act="find"]');
  await page.locator('[data-sticker-cell="22"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  await page.locator('[data-sticker-cell="16"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  await page.locator('[data-sticker-cell="23"]').click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-roux-fb-find", info.project.name);

  // ZZ 엣지 방향: 셋째 단계 「위-왼쪽 엣지는 좋은 엣지일까요?」
  await page.goto("/cube/learn?lesson=zz-eo");
  const next = page.locator("[data-step-next]");
  await expect(section).toHaveAttribute("data-step-kind", "quiz");
  await next.click();
  await expect(section).toHaveAttribute("data-step-kind", "demo");
  await next.click();
  await expect(section).toHaveAttribute("data-step-kind", "quiz");
  const quiz = page.locator('[data-act="quiz"]');
  await expect(quiz).toContainText("위-왼쪽 엣지");
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

test("배우기: 큐브와 만나기는 환영 → 스티커와 조각 → 센터 여섯 세기 → 표준 색 배치 → 분해·조립", async ({
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
  await page.locator('[data-sticker-cell="7"]').click();
  await expect(parts.getByRole("status")).toContainText("흰-초록 엣지 블럭");
  // 흰-초록 엣지의 다른 칸(앞면 윗줄 가운데, 19)도 함께 표시된다
  await expect(page.locator('[data-sticker-cell="19"]')).toHaveAttribute(
    "data-sticker-mark",
    "pick",
  );
  await parts.locator('[data-parts-to="piece"]').click();
  await expect(parts).toHaveAttribute("data-act-passed", "");

  await goStep(page, 2);
  await expect(section).toHaveAttribute("data-step-kind", "find");
  const find = page.locator('[data-act="find"]');
  const count = find.locator("[data-find-count]");
  await expect(count).toHaveAttribute("data-find-count", "0/6");
  // 엣지 칸(위 앞 가운데)은 틀림: 세지 않고 빨강으로 알린다
  await page.locator('[data-sticker-cell="7"]').click();
  await expect(find.getByRole("status")).toContainText("엣지 블럭");
  await expect(count).toHaveAttribute("data-find-count", "0/6");
  // 센터 블럭 하나를 고르면 색이 드러나고 표시가 붙는다. 다시 누르면 풀린다
  const top = page.locator('[data-sticker-cell="4"]');
  await expect(top).toHaveAttribute("data-sticker-hidden", "");
  await top.click();
  await expect(count).toHaveAttribute("data-find-count", "1/6");
  await expect(top).not.toHaveAttribute("data-sticker-hidden", "");
  await expect(top).toHaveAttribute("data-sticker-mark", "pick");
  await top.click();
  await expect(count).toHaveAttribute("data-find-count", "0/6");
  for (const cell of [4, 13, 22, 31, 40, 49])
    await page.locator(`[data-sticker-cell="${cell}"]`).click();
  await expect(count).toHaveAttribute("data-find-count", "6/6");
  await expect(find).toHaveAttribute("data-act-passed", "");
  await expect(top).toHaveAttribute("data-sticker-mark", "right");
  await shot(page, "learn-pieces-count", info.project.name);

  // 표준 색 배치: 까만 큐브에서 흰색 맞은편 노란색 센터 찾기(위 센터는 틀림, 아래 센터 31이 맞음)
  await goStep(page, 3);
  await expect(section).toHaveAttribute("data-step-kind", "find");
  await expect(page.locator("[data-step-body]")).toContainText("표준 색 배치");
  await page.locator('[data-sticker-cell="4"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  await page.locator('[data-sticker-cell="31"]').click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-color-scheme-find", info.project.name);
  // 흰색 위·초록색 앞이면 오른쪽은? 주황색은 틀림, 빨간색이 맞음
  await goStep(page, 4);
  // 위(흰색, 칸 4)·앞(초록색, 칸 22) 센터 블럭만 보이고, 답인 오른쪽(칸 13)은 가려 있다
  await expect(
    page.locator("[data-sticker]:not([data-sticker-hidden])"),
  ).toHaveCount(2);
  for (const cell of [4, 22])
    await expect(page.locator(`[data-sticker="${cell}"]`)).not.toHaveAttribute(
      "data-sticker-hidden",
      "",
    );
  await expect(page.locator('[data-sticker="13"]')).toHaveAttribute(
    "data-sticker-hidden",
    "",
  );
  const pick = page.locator('[data-act="quiz"]');
  await page.locator("[data-learn-quiz] [data-choice='1']").click();
  await expect(pick).not.toHaveAttribute("data-act-passed", "");
  await page.locator("[data-learn-quiz] [data-choice='0']").click();
  await expect(pick).toHaveAttribute("data-act-passed", "");
  await expect(pick).toContainText("거울에 비친 큐브");
  await shot(page, "learn-color-scheme-quiz", info.project.name);

  // 분해·조립: 분해 → 축 → 센터(흰·초록은 먼저) → 엣지 둘 → 나머지 → 코너 하나 → 나머지
  await goStep(page, 5);
  const build = page.locator('[data-act="build"]');
  await build.locator("[data-build-start]").click();
  await expect(build).toHaveAttribute("data-build-phase", "core");
  await build.locator("[data-build-next]").click();
  const built = build.locator("[data-build-count]");
  await expect(built).toHaveAttribute("data-build-count", "2/6");
  const say = build.locator("[data-build-say]");
  // 노랑을 오른쪽에: 흰색 맞은편에 와야 한다
  await expect(build.locator("[data-build-pairs]")).toBeVisible();
  await page.locator('[data-sticker-cell="13"]').click();
  await expect(say).toHaveText("노란색은 흰색 맞은편에 위치해요.");
  await page.locator('[data-sticker-cell="31"]').click();
  await expect(built).toHaveAttribute("data-build-count", "3/6");
  // 빨강을 왼쪽에: 맞출 수 없는 큐브(거울)
  await page.locator('[data-sticker-cell="40"]').click();
  await expect(say).toContainText("맞출 수 없는 큐브");
  for (const cell of [13, 49, 40])
    await page.locator(`[data-sticker-cell="${cell}"]`).click();
  await expect(build).toHaveAttribute("data-build-phase", "edges");
  // 흰-초록(위 앞 가운데 7), 흰-빨강(위 오른쪽 가운데 5)
  for (const cell of [7, 5])
    await page.locator(`[data-sticker-cell="${cell}"]`).click();
  await build.locator("[data-build-fill]").click();
  await expect(build).toHaveAttribute("data-build-phase", "corners");
  await page.locator('[data-sticker-cell="8"]').click();
  await build.locator("[data-build-fill]").click();
  await expect(build).toHaveAttribute("data-act-passed", "");
  await expect(
    page.locator("[data-sticker-cell][data-sticker-hidden]"),
  ).toHaveCount(0);
});

test("배우기: 조각의 움직임은 센터 → 엣지 → 코너, 자리와 방향을 손으로 가른다", async ({
  page,
}, info) => {
  // 옛 주소(333-pieces)도 새 단원으로 연다
  await page.goto("/cube/learn?lesson=333-pieces");
  await expect(page.locator("[data-cube-learn]")).toHaveAttribute(
    "data-cube-learn",
    "333-piece-moves",
  );
  const section = page.locator("[data-step-kind]");
  const find = page.locator('[data-act="find"]');

  // 따라가기 확인 1: F R 뒤 흰-초록 엣지 블럭은 위-오른쪽(윗면 칸 5). 원래 자리(칸 7)는 틀림
  await goStep(page, 4);
  await page.locator('[data-sticker-cell="7"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  await page.locator('[data-sticker-cell="5"]').click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  // 따라가기 확인 2: R U2 뒤 흰-초록-빨강 코너 블럭은 위-앞-왼쪽(윗면 칸 6)
  await goStep(page, 5);
  await page.locator('[data-sticker-cell="8"]').click();
  await expect(find).not.toHaveAttribute("data-act-passed", "");
  const corner = page.locator('[data-sticker-cell="6"]');
  await expect(corner).toHaveAttribute("data-sticker-hidden", "");
  await corner.click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  // 찾은 코너 블럭은 가리기가 풀려 색이 드러난다(3D도 같은 마스크를 쓴다)
  await expect(corner).not.toHaveAttribute("data-sticker-hidden", "");
  await shot(page, "learn-pieces-track", info.project.name);

  // U 한 번: 흰 면은 그대로인데 자리가 틀림. 윗면을 세 번 더 돌려(= U') 되돌린다
  await goStep(page, 7);
  await expect(section).toHaveAttribute("data-step-kind", "try");
  await expect(page.locator("[data-step-body]")).toContainText(
    "흰 면은 그대로 다 흰색",
  );
  await inputReady(page);
  await shot(page, "learn-pieces-u-once", info.project.name);
  const buttons = page.locator("[data-cube-buttons] button");
  for (let i = 0; i < 3; i++) await buttons.filter({ hasText: /^U$/ }).click();
  await expect(page.locator("[data-cube-try]")).toHaveAttribute(
    "data-cube-passed",
    "",
  );

  // 제자리가 아닌 엣지 블럭 세기: 뒤(칸 1)는 제자리, 앞·왼쪽·오른쪽(칸 7·3·5)이 틀린 자리
  await goStep(page, 8);
  const count = find.locator("[data-find-count]");
  await expect(count).toHaveAttribute("data-find-count", "0/3");
  await page.locator('[data-sticker-cell="1"]').click();
  await expect(find.getByRole("status")).toContainText("제자리예요");
  await expect(count).toHaveAttribute("data-find-count", "0/3");
  for (const cell of [7, 3, 5])
    await page.locator(`[data-sticker-cell="${cell}"]`).click();
  await expect(count).toHaveAttribute("data-find-count", "3/3");
  await expect(find).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-pieces-misplaced", info.project.name);

  // 평가: 한 면을 맞춘 상태는? (가) 흰 면만 흰색 / (나) 흰 블럭이 제자리
  await goStep(page, 9);
  const quiz = page.locator('[data-act="quiz"]');
  await expect(quiz.locator("[data-quiz-picture]")).toHaveCount(2);
  await page.locator("[data-learn-quiz] [data-choice='0']").click();
  await expect(quiz).not.toHaveAttribute("data-act-passed", "");
  await page.locator("[data-learn-quiz] [data-choice='1']").click();
  await expect(quiz).toHaveAttribute("data-act-passed", "");
  await expect(quiz).toContainText("제자리에 바른 방향");

  // 자리 × 방향 정리
  await goStep(page, 12);
  await expect(page.locator("[data-step-body]")).toContainText("자리 ✓·방향 ✗");
  await page.locator("[data-learn-quiz] [data-choice='2']").click();
  await expect(quiz).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-pieces-place-turn", info.project.name);

  // 해 보기는 엣지 → 코너
  await goStep(page, 13);
  await expect(page.locator("[data-step-body]")).toContainText(
    "흰-초록 엣지 블럭",
  );
});

test("배우기: 놀이판에서 모든 키로 돌려 보고, 다른 조각을 골라 따라간다", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/learn?lesson=333-piece-moves");
  await goToStep(page, "play");
  const play = page.locator('[data-act="play"]');
  await inputReady(page);
  // 센터만 색: 큐브 그림에서 보이는 칸은 여섯
  const shown = page.locator("[data-sticker-cell]:not([data-sticker-hidden])");
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
  // 센터는 그대로 보인다
  await expect(shown).toHaveCount(6);
  // 다른 조각 보기: 코너 하나만 색(칸 셋)
  await play.locator('[data-play-choose="코너"]').click();
  await expect(shown).toHaveCount(3);
  // 처음으로
  await play.locator("[data-play-reset]").click();
  await expect(page.locator('[data-sticker-cell="8"]')).not.toHaveAttribute(
    "data-sticker-hidden",
    "",
  );
  await shot(page, "learn-pieces-play", info.project.name);
});

test("배우기: 첫 층 코너는 세 색 센터로 넣을 칸을 고른다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=333-first-corners-up");
  // 1번: 흰-초록-빨강이 들어갈 칸(흰 면 위, 위-앞-오른쪽) 누르기
  await goStep(page, 1);
  const find = page.locator('[data-act="find"]');
  // 앞면 왼쪽 위(18)는 위-앞-왼쪽 칸이라 틀림
  await page.locator('[data-sticker-cell="18"]').click();
  await expect(find.getByRole("status")).toContainText("센터 사이");
  // 앞면 오른쪽 위(20) = 위-앞-오른쪽 칸
  await page.locator('[data-sticker-cell="20"]').click();
  await expect(find).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-corner-slot", info.project.name);
});

test("배우기: 3×3을 아는 사람의 2×2는 코너만 보이는 3×3을 곁에 둔다", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=222-from333-corners");
  await expect(page.locator("[data-step-beside='3']")).toBeVisible();
  const quiz = page.locator('[data-act="quiz"]');
  await page.locator("[data-learn-quiz] [data-choice='0']").click();
  await expect(quiz).toHaveAttribute("data-act-passed", "");
  await shot(page, "learn-222-from333", info.project.name);
});
