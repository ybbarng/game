import {
  goStep,
  goToStep,
  inputReady,
  keysFor,
  no3d,
  shot,
  useNotationKeys,
} from "./cube";
import { expect, type Page, test } from "./test";

/**
 * 큐브 배우기의 무작위 해 보기 두 단계 힌트, 마무리 진행 띠, 단계까지 남는 진도(docs/47 8-1).
 * 「표기」 배치로 친다. 3D 그림은 보지 않으므로 끈다(`no3d`).
 */

test.beforeEach(({ page }) => no3d(page));

/** 마지막 단계(무작위 해 보기)로 간다 */
async function goLast(page: Page) {
  const count = await page.locator('[aria-label="단계"] li').count();
  await goStep(page, count - 1);
}

/** 힌트 2가 보이는 다음 수를 친다(접혀 있으면 힌트 2를 누른다) */
async function playHint(page: Page): Promise<void> {
  const chip = page.locator("[data-cube-hint]");
  if ((await chip.count()) === 0)
    await page.locator("[data-cube-hint-move]").click();
  const move = (await chip.getAttribute("data-cube-hint")) as string;
  const before = await page.locator("[data-cube-try]").textContent();
  for (const k of keysFor(move)) await page.keyboard.press(k);
  // 친 수가 들어갔을 때까지(수 세기가 바뀐다. 큐브 돌리기는 세지 않으니 힌트 칩이 바뀌는 것으로도 본다)
  await expect
    .poll(async () => {
      const now = await page.locator("[data-cube-try]").textContent();
      return now !== before;
    })
    .toBe(true);
}

test("무작위 해 보기: 힌트 1은 지금 경우, 힌트 2는 다음 수, 따라 치면 통과", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/learn?lesson=333-white-cross");
  await goLast(page);
  await inputReady(page);
  await expect(page.getByText("정해진 모범 답 없음")).toHaveCount(0);
  await page.locator("[data-cube-hint-case]").click();
  await expect(page.locator("[data-cube-taught-case]")).toHaveAttribute(
    "data-cube-taught-case",
    /^흰-(빨강|초록|주황|파랑) 엣지: .+ 경우$/,
  );
  await expect(page.locator("[data-cube-hint]")).toHaveCount(0);
  await shot(page, "learn-hint-case", info.project.name);
  await page.locator("[data-cube-hint-move]").click();
  await expect(page.locator("[data-cube-hint]")).toHaveCount(1);
  await shot(page, "learn-hint-move", info.project.name);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  const tryBox = page.locator("[data-cube-try]");
  for (let i = 0; i < 40; i++) {
    if ((await tryBox.getAttribute("data-cube-passed")) !== null) break;
    await playHint(page);
  }
  await expect(tryBox).toHaveAttribute("data-cube-passed", "");
});

test("마무리: 일곱 단계 진행 띠가 맞은 단계를 따라가고 칸마다 단원으로 잇는다", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/learn?lesson=333-beginner-finale");
  await goToStep(page, "try");
  await inputReady(page);
  const progress = page.locator("[data-finale-progress]");
  await expect(progress).toHaveAttribute("data-finale-progress", "0");
  await expect(progress.locator("[data-finale-cell]")).toHaveCount(7);
  await expect(progress.locator("[data-finale-review]")).toHaveAttribute(
    "data-finale-review",
    "333-white-cross",
  );
  await expect(progress.locator("[data-finale-cell='4'] a")).toHaveAttribute(
    "href",
    "/cube/learn?lesson=333-ll-edges",
  );
  await page.locator("[data-cube-hint-case]").click();
  await shot(page, "learn-finale-strip", info.project.name);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  // 힌트대로 흰 십자까지: 띠가 1단계 맞음으로 바뀐다
  for (let i = 0; i < 40; i++) {
    if ((await progress.getAttribute("data-finale-progress")) !== "0") break;
    await playHint(page);
  }
  await expect(progress).toHaveAttribute("data-finale-progress", "1");
  await expect(progress.locator("[data-finale-cell='0']")).toHaveAttribute(
    "data-done",
    "",
  );
});

test("진도: 마지막으로 본 단계로 다시 열고, 해 보기가 남으면 꼬리표, 첫 화면은 「이어서 배우기」", async ({
  page,
}, info) => {
  await page.goto("/cube/learn?lesson=333-ll-edges");
  await goStep(page, 3);
  await page.reload();
  await expect(page.locator("[data-step-kind]")).toHaveAttribute(
    "data-step",
    "3",
  );
  // 마지막 단계가 해 보기가 아닌 단원(첫 층 코너: 끝에 뒤집기 둘러보기·고르기)의 끝에서 꼬리표
  await page.goto("/cube/learn?lesson=333-first-corners-up");
  await goLast(page);
  const left = page.locator("[data-lesson-try-left]");
  await expect(left).toBeVisible();
  // 해 보기가 남으면 「다음 단원」은 강조색이 아니다. 단계 띠 아래에는 아이콘 뜻
  await expect(page.locator("[data-lesson-next]")).toHaveAttribute(
    "data-lesson-next",
    "plain",
  );
  await expect(page.locator("[data-step-legend]")).toContainText("해보기");
  await shot(page, "learn-try-left", info.project.name);
  // 누르면 그 해 보기로
  const at = (await left.getAttribute("data-lesson-try-left")) as string;
  await left.click();
  await expect(page.locator("[data-step-kind]")).toHaveAttribute(
    "data-step",
    at,
  );
  await page.goto("/cube/learn?lesson=333-ll-edges");
  await page.goto("/cube");
  // 첫 화면 「다음에 할 것」이 보던 단원으로 잇는다(docs/47 16-5)
  const cont = page.locator("[data-cube-next]");
  await expect(cont).toHaveAttribute("data-cube-next", "first-solve");
  await expect(cont).toContainText("처음 맞추기 이어서: 옆면 맞추기");
  await expect(cont).toHaveAttribute("href", "/cube/learn?lesson=333-ll-edges");
  await shot(page, "home-next-continue", info.project.name);
});

test("진도: 해 보기 밖의 마친 단계(고르기)도 다시 열면 초록으로 남는다", async ({
  page,
}) => {
  await page.goto("/cube/learn?lesson=333-ll-cross");
  await goStep(page, 2);
  const third = page.locator('[aria-label="단계"] li').nth(2).locator("button");
  await expect(page.locator("[data-step-kind]")).toHaveAttribute(
    "data-step-kind",
    "quiz",
  );
  await page.locator('[data-choice="0"]').click();
  await expect(third).toHaveAttribute("data-step-done", "");
  await page.reload();
  await goStep(page, 0);
  await expect(third).toHaveAttribute("data-step-done", "");
});
