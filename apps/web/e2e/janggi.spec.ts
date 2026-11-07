import { OPENING_LINE_MOVES } from "../src/janggi/opening-line";
import { useTestSpeed } from "./fast";
import { slowCpu, stopFrames, watchFrames } from "./frames";
import { expect, type Locator, type Page, ready, test } from "./test";

/** 판 크기와 가장자리 여백(JanggiBoard의 PAD) */
const PAD = 0.62;
const VIEW_W = 8 + PAD * 2;

const board = (page: Page) => page.getByRole("img", { name: /장기판/ });
const pieces = (page: Page) => page.locator("[data-piece]");

/** 기보 자리 이름("71") → 판 좌표. 초 편(뒤집지 않은 판)에서 본다 */
function xyOfName(name: string): [number, number] {
  const row = Number(name[0]);
  return [Number(name[1]) - 1, row === 0 ? 9 : row - 1];
}

async function tapPoint(
  page: Page,
  name: string,
  touch: boolean,
  root: Page | Locator = page,
) {
  const target = root.getByRole("img", { name: /장기판/ });
  // 배우기 판은 글 아래에 있어 화면 밖일 수 있다
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("판이 안 보인다");
  const unit = box.width / VIEW_W;
  const [x, y] = xyOfName(name);
  const px = box.x + (x + PAD) * unit;
  const py = box.y + (y + PAD) * unit;
  if (touch) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}

/** 내 기물(초 졸부터)을 골라 처음 보이는 갈 곳으로 옮긴다 */
async function playOne(page: Page, touch: boolean) {
  for (const from of ["71", "73", "77", "79", "75", "02", "08", "01", "09"]) {
    if (
      (await page
        .locator(`[data-point="${from}"][data-piece^="c"]`)
        .count()) === 0
    )
      continue;
    await tapPoint(page, from, touch);
    const target = page.locator("[data-target]").first();
    // 갈 곳이 없는 기물이면 점이 생기지 않는다. 다음 기물로.
    const shown = await target
      .waitFor({ timeout: 1500 })
      .then(() => true)
      .catch(() => false);
    if (!shown) continue;
    const to = (await target.getAttribute("data-target")) as string;
    await tapPoint(page, to, touch);
    await expect(
      page.locator(`[data-point="${to}"][data-piece^="c"]`),
    ).toHaveCount(1);
    return { from, to };
  }
  throw new Error("둘 수가 없다");
}

/** 첫 화면 → 옵션에서 컴퓨터(고르면)와 초를 고르고 → 나홀로 장기 */
async function startSolo(page: Page, level?: string) {
  await ready(page);
  await page.getByRole("button", { name: "옵션" }).click();
  if (level) await page.getByRole("button", { name: level }).click();
  await page.getByRole("button", { name: "초(먼저)" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 장기/ }).click();
}

test.beforeEach(async ({ page, context }) => {
  await useTestSpeed(context);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
    localStorage.removeItem("janggi-save");
  });
});

test("장기: 게임 목록에서 들어가 상차림을 고르고 두다가 무르고 기권한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("link", { name: /장기/ }).first().click();
  await expect(page).toHaveURL(/\/janggi$/);
  await expect(page.getByRole("heading", { name: "장기" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-home.png") });
  await startSolo(page, "입문");

  // 한(컴퓨터)이 먼저 상차림을 고르고, 내 차례가 온다.
  await page.getByRole("button", { name: "상마상마" }).click();
  await expect(pieces(page)).toHaveCount(32);
  await expect(page.getByRole("status")).toContainText("내 차례");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: info.outputPath("janggi-start.png") });

  // 한 수 두면 컴퓨터가 답하고 다시 내 차례.
  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await expect(page.locator("[data-move-count]")).toContainText("수");
  // 힌트: 고수가 고른 수의 출발·도착에 고리, 그 기물이 골라져 갈 곳 점이 보인다.
  await page.getByRole("button", { name: "힌트" }).click();
  await expect(page.locator("[data-hint]")).toHaveCount(2);
  await expect(page.locator("[data-target]").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-play.png") });
  await page.getByRole("button", { name: "무르기" }).click();
  await expect(page.locator("[data-hint]")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("내 차례");

  // 기권은 한 번 더 묻는다. 「계속 두기」면 판이 그대로다.
  await page.getByRole("button", { name: "기권" }).click();
  await page.getByRole("button", { name: "계속 두기" }).click();
  await expect(page.getByRole("status")).toContainText("내 차례");
  await page.getByRole("button", { name: "기권" }).click();
  await page.getByRole("button", { name: "기권하기" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요");
  await expect(page.locator('[data-result-banner="lose"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-end.png") });
  expect(errors).toEqual([]);
});

test("장기 배우기: 첫 단원 미션에서 차로 졸을 잡는다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "배우기 진행은 크기와 상관없다(공통 배우기 화면의 배치는 tutorial.spec이 세 크기로 본다)",
  );
  const touch = info.project.name.startsWith("phone");
  await page.goto("/janggi");
  await page.getByRole("button", { name: /장기 배우기/ }).click();
  await expect(page.getByText("0/13")).toBeVisible();
  await page.getByRole("button", { name: /장기는 어떤 게임/ }).click();
  await expect(board(page)).toBeVisible();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "상대 궁을 외통으로 몬다" }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "미션 시작" }).click();
  await tapPoint(page, "71", touch);
  await expect(page.locator('[data-target="41"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("janggi-mission.png") });
  await tapPoint(page, "41", touch);
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

/** 배우기 진행 기록에 앞 단원들을 끝낸 것으로 넣는다(단원은 차례로 열린다) */
async function completeLessons(page: Page, ids: string[]) {
  await page.addInitScript((completed) => {
    localStorage.setItem(
      "janggi-tutorial",
      JSON.stringify({ state: { completed }, version: 0 }),
    );
  }, ids);
}

const BEFORE_SETUPS = [
  "goal",
  "coords",
  "cannon",
  "horse",
  "check",
  "mate",
  "score",
  "opening",
];

const next = (page: Page) =>
  page.getByRole("button", { name: "다음", exact: true }).click();

async function openLesson(page: Page, title: RegExp) {
  await page.goto("/janggi");
  await page.getByRole("button", { name: /장기 배우기/ }).click();
  await page.getByRole("button", { name: title }).click();
  await expect(board(page)).toBeVisible();
}

async function missionSucceeded(page: Page) {
  await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
    timeout: 10_000,
  });
  await next(page);
}

/**
 * 직접 두는 예시를 끝까지 둔다: 초 수는 초록 고리(둘 기물 → 갈 자리)를 눌러 두고, 한 수는 저절로 둘 때까지 기다린다.
 * 맞혀 보기가 나오면 `guess` 자리를 누르고 결과(`right`·`wrong`)를 확인한다
 */
async function playExample(
  page: Page,
  touch: boolean,
  moves: number,
  guess?: { at: string; result: "right" | "wrong" },
) {
  const turn = page.locator("[data-play-turn]");
  const caption = page.locator("[data-replay-caption]");
  for (let n = 0; n < moves * 2 + 2; n++) {
    await expect(turn).not.toHaveAttribute("data-play-turn", "h", {
      timeout: 10_000,
    });
    const now = await turn.getAttribute("data-play-turn");
    if (now === "done") break;
    if (now === "guess") {
      if (!guess) throw new Error("맞혀 볼 자리를 받지 않았다");
      await expect(page.locator("[data-guess]")).toBeVisible();
      await tapPoint(page, guess.at, touch);
      await expect(page.locator("[data-guess-result]")).toHaveAttribute(
        "data-guess-result",
        guess.result,
      );
      continue;
    }
    const hints = page.locator("[data-hint]");
    await expect(hints).toHaveCount(2);
    const from = (await hints.nth(0).getAttribute("data-hint")) as string;
    const to = (await hints.nth(1).getAttribute("data-hint")) as string;
    const before = (await caption.textContent()) ?? "";
    await tapPoint(page, from, touch);
    await expect(page.locator(`[data-target="${to}"]`)).toHaveCount(1);
    await tapPoint(page, to, touch);
    await expect(caption).not.toHaveText(before);
  }
  await expect(turn).toHaveAttribute("data-play-turn", "done");
  await expect(caption).toContainText(`${moves}/${moves}수`);
}

const tally = (page: Page) => page.locator("[data-replay-tally]");
const note = (page: Page) => page.locator("[data-replay-note]");

test("장기 배우기: 자리 부르기 단원에서 좌표를 읽고 자리 이름 퀴즈를 푼다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "휴대폰 세로·PC만 본다");
  await completeLessons(page, ["goal"]);
  await openLesson(page, /자리 부르기/);
  await expect(page.locator("[data-axis-row]")).toHaveCount(10);
  await expect(page.locator("[data-axis-col]")).toHaveCount(9);
  for (const name of ["79", "01"])
    await expect(page.locator(`[data-ring="${name}"]`)).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("janggi-coords.png"),
    fullPage: true,
  });
  await next(page);
  await page.getByRole("button", { name: "95", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "19", exact: true }).click();
  await next(page);
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

test("장기 배우기: 포진 고르기 단원에서 차림마다 장점·약점 수순을 넘겨 보고 마상마상을 고른다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "휴대폰 세로·PC만 본다");
  const touch = info.project.name.startsWith("phone");
  await completeLessons(page, BEFORE_SETUPS);
  await openLesson(page, /포진 고르기/);
  // 판 위 단추로 내 차림을 바꾸면 그림과 이름이 바뀐다.
  await page.getByRole("button", { name: "상마마상" }).click();
  await expect(page.locator("[data-setup-caption]")).toContainText(
    "바깥상차림 · 양귀마",
  );
  await expect(page.locator('[data-point="02"][data-piece="cE"]')).toHaveCount(
    1,
  );
  await next(page);
  // 말풀이: 귀·면 고리
  await expect(
    page.getByRole("heading", { name: "먼저 알아 둘 말" }),
  ).toBeVisible();
  for (const name of ["84", "85", "86"])
    await expect(page.locator(`[data-ring="${name}"]`)).toHaveCount(1);
  await next(page);
  await next(page); // 한의 차림은 거꾸로
  // 귀마 장점: 초 혼자 세 수. 면포 자리를 일부러 틀리게 맞혀 본다(틀려도 정답을 보이고 이어 간다)
  await playExample(page, touch, 3, { at: "84", result: "wrong" });
  await expect(
    page.locator('[data-pick="85"][data-pick-ok="true"]'),
  ).toHaveCount(1);
  await expect(note(page)).toContainText("세 수 만에");
  // 초 혼자 둔 그림은 실제 대국 판이 아니라 이어 두기가 없다
  await expect(page.locator("[data-continue]")).toHaveCount(0);
  await next(page);
  // 귀마 약점: 빈 줄로 간 차를 잃는다
  await playExample(page, touch, 8, { at: "02", result: "right" });
  await expect(tally(page)).toContainText("초 13점 손해");
  await next(page);
  // 원앙마 장점: 상이 되잡아 5점 이득
  await playExample(page, touch, 7, { at: "75", result: "right" });
  await expect(tally(page)).toContainText("초 5점 이득");
  await page.screenshot({
    path: info.outputPath("janggi-setups-wonang.png"),
    fullPage: true,
  });
  await next(page);
  await playExample(page, touch, 5, { at: "75", result: "right" }); // 원앙마 약점: 다섯 수
  await next(page);
  await playExample(page, touch, 2, { at: "86", result: "right" }); // 양귀마 장점
  await next(page);
  // 양귀마 약점: 맞혀 보기 전에는 잡힐 위험 고리가 답을 알려 주지 않는다
  await playExample(page, touch, 6, { at: "75", result: "right" });
  await expect(tally(page)).toContainText("초 2점 손해");
  await page.screenshot({
    path: info.outputPath("janggi-setups-yang-center.png"),
    fullPage: true,
  });
  await next(page);
  // 같은 이름: 두 상을 올리면 서로 닿는다
  await expect(
    page.getByRole("heading", { name: "같은 이름끼리 상을 올려 보면" }),
  ).toBeVisible();
  await playExample(page, touch, 2, { at: "44", result: "right" });
  await expect(note(page)).toContainText("서로 잡을 수 있어요");
  await page.screenshot({
    path: info.outputPath("janggi-setups-same-name.png"),
    fullPage: true,
  });
  await next(page);
  // 다른 이름: 같은 식으로 올려도 닿지 않는다
  await expect(
    page.getByRole("heading", { name: "이름이 다르면" }),
  ).toBeVisible();
  await playExample(page, touch, 2);
  await expect(note(page)).toContainText("서로 잡을 수 없어요");
  await page.screenshot({
    path: info.outputPath("janggi-setups-other-name.png"),
    fullPage: true,
  });
  await next(page);
  // 맞상
  await expect(page.getByRole("heading", { name: /맞상/ })).toBeVisible();
  await playExample(page, touch, 4, { at: "44", result: "right" });
  await expect(tally(page)).toContainText("점수가 같아 손해 없음");
  await page.screenshot({
    path: info.outputPath("janggi-setups-matsang.png"),
    fullPage: true,
  });
  await next(page);
  await page.getByRole("button", { name: "마상마상(귀마)" }).click();
  await next(page);
  await page.getByRole("button", { name: "상마마상" }).click();
  await next(page);
  await page.getByRole("button", { name: "미션 시작" }).click();
  // 한(컴퓨터)이 먼저 고르고 내 차례가 오면 마상마상
  await page.getByRole("button", { name: "마상마상" }).click();
  await missionSucceeded(page);
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

test("장기 배우기: 첫 수와 초반 원칙 단원을 끝까지 따라 한다(첫 수·면포·천궁·피할 수)", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "휴대폰 세로·PC만 본다");
  const touch = info.project.name.startsWith("phone");
  await completeLessons(page, [...BEFORE_SETUPS, "setups"]);
  await openLesson(page, /첫 수와 초반 원칙/);
  // 막는 졸·상의 고리, 79를 비키면 오른쪽 차가 49까지 닿는다.
  for (const name of ["79", "08"])
    await expect(page.locator(`[data-ring="${name}"]`)).toHaveCount(1);
  await expect(page.locator('[data-target="49"]')).toHaveCount(0);
  await playExample(page, touch, 1, { at: "78", result: "right" });
  await expect(page.locator('[data-target="49"]')).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("janggi-first-move.png"),
    fullPage: true,
  });
  await next(page);

  // 미션: 상 쪽 졸 쓸기(79→78)
  await page.getByRole("button", { name: "미션 시작" }).click();
  await tapPoint(page, "79", touch);
  await expect(page.locator('[data-target="78"]')).toHaveCount(1);
  await tapPoint(page, "78", touch);
  await missionSucceeded(page);

  await expect(
    page.getByRole("heading", { name: /진마와 면포/ }),
  ).toBeVisible();
  await next(page);
  // 귀마 쪽 포도 면에 갈 수 있다
  await expect(page.getByRole("heading", { name: /귀마 쪽 포/ })).toBeVisible();
  await expect(page.locator('[data-target="85"]')).toHaveCount(1);
  await next(page);
  // 미션: 진마(02→83) 다음 포(82→85)
  await page.getByRole("button", { name: "미션 시작" }).click();
  await tapPoint(page, "02", touch);
  await tapPoint(page, "83", touch);
  // 컴퓨터가 답해 두 수가 쌓이면 내 차례다.
  await expect(page.locator('[data-move-count="2"]')).toHaveCount(1, {
    timeout: 15_000,
  });
  await tapPoint(page, "82", touch);
  await expect(page.locator('[data-target="85"]')).toHaveCount(1);
  await tapPoint(page, "85", touch);
  await missionSucceeded(page);

  await next(page); // 초반 원칙 넷
  // 천궁: 여섯째 수에 장군
  await expect(page.getByRole("heading", { name: /천궁/ })).toBeVisible();
  await playExample(page, touch, 6, { at: "85", result: "right" });
  await expect(page.locator('[data-check="85"]')).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("janggi-cheongung.png"),
    fullPage: true,
  });
  await next(page);
  // 변병 욕심: 같은 오른쪽 찻길, 11점 손해
  await expect(page.getByRole("heading", { name: /변병 욕심/ })).toBeVisible();
  await playExample(page, touch, 4, { at: "49", result: "right" });
  await expect(page.locator("[data-replay-caption]")).toContainText(
    "한 차 19→49 · 초 차 잃음",
  );
  await expect(tally(page)).toContainText("초 11점 손해");
  await page.screenshot({
    path: info.outputPath("janggi-avoid-rook.png"),
    fullPage: true,
  });
  // 여기서부터 컴퓨터와 이어 둔다. 연습 대국이라 하던 게임 저장을 건드리지 않는다
  const saved = JSON.stringify({ version: 1, log: [], marker: "하던 게임" });
  await page.evaluate((v) => localStorage.setItem("janggi-save", v), saved);
  await page.locator("[data-continue]").click();
  const game = page.locator("[data-continue-game]");
  await expect(game.locator("[data-move-count]")).toHaveAttribute(
    "data-move-count",
    "4",
  );
  await page.screenshot({
    // 덮는 판은 화면 크기만큼이라 보이는 화면만 찍는다
    path: info.outputPath("janggi-continue.png"),
  });
  await tapPoint(page, "71", touch, game);
  await expect(game.locator('[data-target="72"]')).toHaveCount(1);
  await tapPoint(page, "72", touch, game);
  await expect(game.locator("[data-move-count]")).toHaveAttribute(
    "data-move-count",
    "6",
    { timeout: 15_000 },
  );
  await game.getByRole("button", { name: "← 배우기" }).click();
  await expect(game).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("janggi-save"))).toBe(
    saved,
  );
  await expect(page.getByRole("heading", { name: /변병 욕심/ })).toBeVisible();
  await next(page);
  // 미끼를 보고 마를 깊이: 한 포가 병을 넘어 마를 잡는다
  await playExample(page, touch, 6, { at: "62", result: "right" });
  await expect(page.locator("[data-replay-caption]")).toContainText(
    "한 포 32→62 · 초 마 잃음",
  );
  await next(page);

  // 퀴즈 셋
  await page
    .getByRole("button", { name: "한 차(19)가 내 차를 잡아 11점 손해다" })
    .click();
  await next(page);
  await page.getByRole("button", { name: "포", exact: true }).click();
  await next(page);
  await page
    .getByRole("button", { name: "오른쪽 끝 졸을 옆으로(79→78)" })
    .click();
  await next(page);
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

/** 한 차림에 권하는 초 차림과 그 첫 수(matchups.ts·matchup-examples.ts와 같다) */
const DRILL_ANSWER: Record<string, { label: string; first: string }> = {
  NENE: { label: "상마상마", first: "71-72" },
  ENEN: { label: "마상마상", first: "79-78" },
  NEEN: { label: "마상마상", first: "79-78" },
  ENNE: { label: "마상마상", first: "79-78" },
};

async function playFirst(page: Page, text: string, touch: boolean) {
  const [from = "", to = ""] = text.split("-");
  await tapPoint(page, from, touch);
  await expect(page.locator(`[data-target="${to}"]`)).toHaveCount(1);
  await tapPoint(page, to, touch);
}

test("장기 배우기: 실제 차례대로 한 차림을 보고 내 차림·첫 수를 고르고, 짝 예시를 두고, 한으로도 겪는다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "휴대폰 세로·PC만 본다");
  const touch = info.project.name.startsWith("phone");
  await completeLessons(page, [...BEFORE_SETUPS, "setups", "first-moves"]);
  await openLesson(page, /상대 차림 보고 고르기/);
  // 차례 그림: 한 차림 → 초 차림 → 초 첫 수가 차례로 놓이고, 글은 그 뒤에.
  // 그림이 넘어가는 속도는 기기마다 달라 중간 모습은 보지 않고, 다 놓인 상태를 조건으로 기다린다
  await expect(page.locator("[data-order]")).toHaveAttribute("data-order", "3");
  await expect(page.locator("[data-order-done]")).toBeVisible();
  await expect(page.locator("[data-order-caption]")).toContainText(
    "초가 첫 수를 둬요",
  );
  await page.screenshot({
    path: info.outputPath("janggi-order.png"),
    fullPage: true,
  });
  await next(page);

  // 16가지 짝 표: 칸을 누르면 까닭, 그 짝 예시를 판에서 직접 둔다(상마상마끼리 맞상은 좌우를 뒤집은 수순)
  await expect(page.locator("[data-grade]")).toHaveCount(16);
  await page
    .getByRole("button", { name: "한 상마상마, 초 상마상마: 피해요" })
    .click();
  await expect(page.locator("[data-matchup-reason]")).toContainText("맞상");
  await page.screenshot({
    path: info.outputPath("janggi-matchups.png"),
    fullPage: true,
  });
  await page.locator("[data-pair-open]").click();
  await expect(page.locator('[data-pair-example="matsang"]')).toBeVisible();
  await playExample(page, touch, 4, { at: "46", result: "right" });
  await expect(tally(page)).toContainText("점수가 같아 손해 없음");
  await page.screenshot({
    path: info.outputPath("janggi-pair-example.png"),
    fullPage: true,
  });
  await next(page);
  await next(page);

  // 반복 문제: 한이 먼저 차린 뒤 고르고, 초라 첫 수를 둔다. 첫 문제는 일부러 틀린다.
  const drill = page.locator("[data-drill]");
  for (let i = 0; i < 10; i++) {
    await expect(page.locator("[data-drill-progress]")).toContainText(
      `${i + 1}/10`,
    );
    await expect(drill).toHaveAttribute("data-drill-stage", "pick");
    const han = (await drill.getAttribute("data-han-setup")) as string;
    const answer = DRILL_ANSWER[han] as { label: string; first: string };
    await drill
      .getByRole("button", {
        name: i === 0 ? "상마마상" : answer.label,
        exact: true,
      })
      .click();
    await expect(page.locator("[data-drill-result]")).toHaveAttribute(
      "data-drill-result",
      i === 0 ? "avoid" : "best",
    );
    await expect(drill).toHaveAttribute("data-drill-stage", "first");
    // 첫 수: 첫 문제는 권하지 않는 수(가운데 졸)를 둬 본다
    await playFirst(page, i === 0 ? "75-74" : answer.first, touch);
    await expect(page.locator("[data-first-move]")).toHaveAttribute(
      "data-first-move",
      i === 0 ? "other" : "good",
    );
    if (i === 1) {
      await page.screenshot({
        path: info.outputPath("janggi-drill.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "이 짝 예시 두어 보기" }).click();
      await expect(page.locator("[data-pair-example]")).toBeVisible();
      await page.screenshot({
        path: info.outputPath("janggi-drill-example.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "예시 닫기" }).click();
    }
    await page
      .getByRole("button", { name: i < 9 ? "다음 문제" : "결과 보기" })
      .click();
  }
  await expect(page.locator("[data-drill-done]")).toHaveAttribute(
    "data-drill-done",
    "9",
  );
  await next(page);

  // 한으로 겪어 보기: 내가 먼저 고르면 초가 보고 골라 맞상을 피하고 첫 수를 둔다
  const hanDrill = page.locator("[data-han-drill]");
  const picks = ["마상마상", "상마상마", "마상상마", "상마마상"];
  for (const [i, pick] of picks.entries()) {
    await expect(hanDrill).toHaveAttribute("data-han-drill", "pick");
    await hanDrill.getByRole("button", { name: pick, exact: true }).click();
    await expect(hanDrill).toHaveAttribute("data-han-drill", "done");
    await expect(page.locator("[data-han-drill-result]")).toHaveAttribute(
      "data-han-drill-result",
      "avoided",
    );
    if (i === 0)
      await page.screenshot({
        path: info.outputPath("janggi-han-drill.png"),
        fullPage: true,
      });
    await page
      .getByRole("button", { name: i < 3 ? "다음 판" : "결과 보기" })
      .click();
  }
  await expect(page.locator("[data-han-drill-done]")).toBeVisible();
  await next(page);
  await page.getByRole("button", { name: "마상마상", exact: true }).click();
  await next(page);
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

test("장기 배우기: 초반 21수를 까닭과 함께 넘겨 보고, 초 수를 직접 따라 둔다", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone-landscape", "휴대폰 세로·PC만 본다");
  const touch = info.project.name.startsWith("phone");
  await completeLessons(page, [
    ...BEFORE_SETUPS,
    "setups",
    "first-moves",
    "matchups",
  ]);
  await openLesson(page, /초반 21수/);
  await playExample(page, touch, OPENING_LINE_MOVES.length, {
    at: "99",
    result: "right",
  });
  await expect(tally(page)).toContainText("점수가 같아 손해 없음");
  await page.screenshot({
    path: info.outputPath("janggi-line-replay.png"),
    fullPage: true,
  });
  await next(page);

  // 따라 두기: 첫 수를 틀리면 판에 두지 않고 알린다.
  await tapPoint(page, "79", touch);
  await tapPoint(page, "78", touch);
  await expect(page.locator("[data-follow-miss]")).toBeVisible();
  await page.getByRole("button", { name: "힌트" }).click();
  await expect(page.locator('[data-ring="71"]')).toHaveCount(1);
  const mine = OPENING_LINE_MOVES.filter((_, i) => i % 2 === 0);
  for (const [k, text] of mine.entries()) {
    const [from = "", to = ""] = text.split("-");
    await tapPoint(page, from, touch);
    await expect(page.locator(`[data-target="${to}"]`)).toHaveCount(1);
    await tapPoint(page, to, touch);
    await expect(
      page.locator(`[data-follow-progress="${k + 1}/${mine.length}"]`),
    ).toHaveCount(1);
    if (k === 5)
      await page.screenshot({
        path: info.outputPath("janggi-line-follow.png"),
        fullPage: true,
      });
  }
  await expect(page.getByText("끝까지 따라 두었어요!")).toBeVisible();
  await next(page);
  await page
    .getByRole("button", {
      name: "72는 졸과 마가 지켜, 잡으면 한이 1점 손해다",
    })
    .click();
  await next(page);
  await page
    .getByRole("button", { name: "손해 없음(차를 하나씩 바꿈)" })
    .click();
  await next(page);
  await expect(page.getByText("단원 완료!")).toBeVisible();
});

test("장기: 방장이 방을 만들고 친구가 링크로 들어와 두고, 판 끝 검증을 통과한다", async ({
  context,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만 돌린다");
  const host = await context.newPage();
  const guest = await context.newPage();
  const errors: string[] = [];
  for (const p of [host, guest])
    p.on("pageerror", (e) => errors.push(e.message));

  await host.goto("/janggi?net=local");
  await host.getByRole("button", { name: /다함께 장기/ }).click();
  await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
  await host.getByRole("button", { name: "방 만들기", exact: true }).click();
  const link = await host.locator("input[readonly]").inputValue();
  expect(link).toContain("/janggi");

  await guest.goto(link);
  await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
  await guest.getByRole("button", { name: "들어가기" }).click();
  await expect(host.getByText("철수")).toBeVisible();
  await host.getByRole("button", { name: "시작하기" }).click();
  await expect(board(guest)).toBeVisible();

  // 상차림 둘(한 → 초): 차례인 쪽 화면에 단추가 뜨기를 기다려 고르고, 단추가 사라진 뒤 다음으로 간다.
  // 한 편은 판이 뒤집혀 보여 그 쪽은 단추·기권으로만 움직인다.
  const setup = (p: Page) => p.getByRole("button", { name: "마상마상" });
  for (let i = 0; i < 2; i++) {
    await expect
      .poll(
        async () =>
          (await setup(host).isVisible()) || (await setup(guest).isVisible()),
      )
      .toBe(true);
    const chooser = (await setup(host).isVisible()) ? host : guest;
    await setup(chooser).click();
    await expect(setup(chooser)).toHaveCount(0);
  }
  const cho = (await host.getByText("나는 초").count()) > 0 ? host : guest;
  const han = cho === host ? guest : host;
  await expect(cho.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await playOne(cho, false);
  await expect(han.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  // 한은 한 수 쉬고, 초가 기권한다.
  await han.getByRole("button", { name: "한 수 쉬기" }).click();
  await expect(cho.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await cho.getByRole("button", { name: "기권" }).click();
  await cho.getByRole("button", { name: "기권하기" }).click();
  await expect(han.getByRole("status")).toHaveText("상대가 기권했어요");
  await han.screenshot({ path: info.outputPath("janggi-online.png") });

  // 방장이 나가면 기록이 공개되고, 참가자가 처음부터 다시 둬 보며 확인한다.
  await host.getByRole("button", { name: "← 장기" }).click();
  await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test("장기: 끝낸 판은 내 기록에 쌓이고 복기에서 한 수씩 다시 본다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "기록은 화면 크기와 상관없다");
  await page.goto("/janggi");
  await startSolo(page);
  await page.getByRole("button", { name: "마상상마" }).click();
  await playOne(page, false);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "기권" }).click();
  await page.getByRole("button", { name: "기권하기" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요");
  // 복기 기록이 실제로 쓰인 뒤에 떠난다.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const names = await indexedDB.databases();
        return names.some((d) => d.name === "mighty-review");
      }),
    )
    .toBe(true);
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("mighty-review", 1);
        open.onsuccess = () => {
          const all = open.result
            .transaction("games")
            .objectStore("games")
            .getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve(
              (all.result as { game: string; over: boolean }[]).some(
                (g) => g.game === "janggi" && g.over,
              ),
            );
          };
        };
      }),
  );

  await page.goto("/profile?game=janggi");
  await expect(page.getByRole("tab", { name: "楚 장기" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("0승 1패")).toBeVisible();

  await page.goto("/review");
  await page.getByRole("button", { name: /楚 장기 · 혼자/ }).click();
  await page.getByRole("button", { name: "처음" }).click();
  // 상차림 전에는 마·상 여덟을 뺀 24개다.
  await expect(pieces(page)).toHaveCount(24);
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(pieces(page)).toHaveCount(32);
  await page.getByRole("button", { name: "한 수 앞으로" }).click();
  await expect(page.getByText(/다음 수: /)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: info.outputPath("janggi-review.png") });
});

test("장기 수 배우기: 외통 문제를 틀렸다 다시 풀고, 진행이 목록에 남는다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/janggi");
  await page.getByRole("button", { name: /장기 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  const mate1 = page.getByRole("region", { name: "한 수 외통" });
  await expect(mate1.getByText("0/13")).toBeVisible();
  await mate1.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText("한 수로 외통을 만드세요");

  // 궁을 한 칸 옮기는 수는 외통이 아니다.
  await tapPoint(page, "96", touch);
  const to = await page
    .locator("[data-target]")
    .first()
    .getAttribute("data-target");
  await tapPoint(page, to as string, touch);
  await expect(page.getByRole("status")).toHaveText("외통이 아니에요");
  await page.getByRole("button", { name: "다시 하기" }).click();

  // 정답: 차 48 → 44
  await tapPoint(page, "48", touch);
  await tapPoint(page, "44", touch);
  await expect(page.getByRole("status")).toHaveText("외통!");
  await expect(page.getByText(/차를 44로: 장군!/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-puzzle.png") });
  await page.getByRole("button", { name: "다음 문제" }).click();
  await expect(page.getByText("한 수 외통 2/13")).toBeVisible();
  await page.getByRole("button", { name: "← 목록" }).click();
  await expect(mate1.getByText("1/13")).toBeVisible();
  await expect(
    mate1.getByRole("button", { name: "한 수 외통 1번 (풂)" }),
  ).toBeVisible();

  // 양수겸장: 마 하나로 궁과 차를 함께 노린다.
  await page
    .getByRole("region", { name: "양수겸장" })
    .getByRole("button", { name: "풀기 시작" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "한 수로 두 곳을 함께 노리세요",
  );
  await tapPoint(page, "77", touch);
  await tapPoint(page, "56", touch);
  await expect(page.getByRole("status")).toHaveText("양수겸장!");
  await expect(page.getByText(/함께 노린다/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-fork.png") });
  await page.getByRole("button", { name: "← 목록" }).click();

  // 두 수 외통: 첫 수 뒤 한이 받고, 다시 내 차례가 온다.
  const mate2 = page.getByRole("region", { name: "두 수 외통" });
  await mate2.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "두 수 만에 외통: 첫 수를 두세요",
  );
  await tapPoint(page, "62", touch);
  await tapPoint(page, "65", touch);
  await expect(page.getByRole("status")).toHaveText("이제 외통을 만드세요", {
    timeout: 10_000,
  });
});

test("장기 수 배우기: 포 길 열기를 틀렸다 다시 풀고, 멱 막기와 세 수 외통 첫 수를 둔다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "문제 풀이 진행은 크기와 상관없다(공통 문제 화면의 배치는 장기 외통 문제가 세 크기로 본다)",
  );
  const touch = info.project.name.startsWith("phone");
  await page.goto("/janggi");
  await page.getByRole("button", { name: /장기 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  const cannon = page.getByRole("region", { name: "포 길 열기" });
  await expect(cannon.getByText("0/10")).toBeVisible();
  await cannon.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "포 길을 열어 큰 기물을 노리세요",
  );

  // 궁을 옮기는 수는 포 길을 열지 않는다.
  await tapPoint(page, "96", touch);
  const to = await page
    .locator("[data-target]")
    .first()
    .getAttribute("data-target");
  await tapPoint(page, to as string, touch);
  await expect(page.getByRole("status")).toHaveText(
    "그 수로는 포 길이 열리지 않아요",
  );
  await page.getByRole("button", { name: "다시 하기" }).click();

  // 정답: 졸 72 → 73. 졸이 다리가 되어 포가 차를 노린다.
  await tapPoint(page, "72", touch);
  await tapPoint(page, "73", touch);
  await expect(page.getByRole("status")).toHaveText("포 길이 열렸어요!");
  await expect(page.getByText(/졸이 다리가 되어/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-cannon.png") });
  await page.getByRole("button", { name: "← 목록" }).click();
  await expect(cannon.getByText("1/10")).toBeVisible();

  // 멱 막기: 포를 23으로 옮겨 상의 멱을 막는다.
  await page
    .getByRole("region", { name: "멱 막기" })
    .getByRole("button", { name: "풀기 시작" })
    .click();
  await tapPoint(page, "27", touch);
  await tapPoint(page, "23", touch);
  await expect(page.getByRole("status")).toHaveText("멱을 막았어요!");
  await expect(page.getByText(/멱을 막아/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-block.png") });
  await page.getByRole("button", { name: "← 목록" }).click();

  // 세 수 외통: 첫 수 뒤 한이 받고, 외통까지 두 수가 남는다.
  await page
    .getByRole("region", { name: "세 수 외통" })
    .getByRole("button", { name: "풀기 시작" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "세 수 만에 외통: 첫 수를 두세요",
  );
  await tapPoint(page, "19", touch);
  await tapPoint(page, "14", touch);
  await expect(page.getByRole("status")).toHaveText("외통까지 두 수 남았어요", {
    timeout: 10_000,
  });
});

test("장기 개인 시간: 상차림 뒤부터 시계가 가고, 다 쓰면 시간패다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "시계는 화면 크기와 상관없다");
  await page.clock.install();
  await page.goto("/janggi");
  await ready(page);
  await page.getByRole("button", { name: "옵션" }).click();
  await page.getByRole("button", { name: "빠른 3분" }).click();
  await page.getByRole("button", { name: "초(먼저)" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 장기/ }).click();
  // 상차림을 고르는 동안은 시계가 가지 않는다.
  await page.clock.runFor(60_000);
  await page.getByRole("button", { name: "마상마상" }).click();
  await expect(page.locator('[data-seat="me"] [data-clock]')).toHaveText(
    "3:00",
  );
  await page.clock.runFor(270_001);
  await expect(page.getByRole("status")).toHaveText("시간이 다 돼 졌어요");
  await page.screenshot({ path: info.outputPath("janggi-time.png") });
});

test("장기 수 배우기: 장군 풀기를 틀렸다 다시 풀고 해설을 본다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "문제 화면 배치는 위 외통 문제 시험이 세 크기로 본다",
  );
  await page.goto("/janggi");
  await page.getByRole("button", { name: /장기 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  const escapeSet = page.getByRole("region", { name: "장군 풀기" });
  await expect(escapeSet.getByText("0/15")).toBeVisible();
  await escapeSet.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText("장군을 손해 없이 푸세요");

  // 첫 문제(escape-1)의 정답은 차 59 → 54(장군 부른 차를 잡기). 궁을 비키면 손해다.
  await tapPoint(page, "84", false);
  const to = await page
    .locator("[data-target]")
    .first()
    .getAttribute("data-target");
  await tapPoint(page, to as string, false);
  await expect(page.getByRole("status")).toHaveText("그 풀기로는 손해를 봐요");
  await page.getByRole("button", { name: "다시 하기" }).click();

  await tapPoint(page, "59", false);
  await tapPoint(page, "54", false);
  await expect(page.getByRole("status")).toHaveText("잘 풀었어요!");
  await expect(page.getByText(/장군 부른 차를 잡는다/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-escape.png") });
});

test("장기 수 배우기: 잡힐 기물 지키기를 틀렸다 다시 풀고 해설을 본다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "문제 화면 배치는 위 외통 문제 시험이 세 크기로 본다",
  );
  await page.goto("/janggi");
  await page.getByRole("button", { name: /장기 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  const defendSet = page.getByRole("region", { name: "잡힐 기물 지키기" });
  await expect(defendSet.getByText("0/10")).toBeVisible();
  await defendSet.getByRole("button", { name: "풀기 시작" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "노림을 받는 기물을 지키세요",
  );

  // 첫 문제(defend-1): 한 상이 차(39)를 노린다. 49로 비키면 손해이고, 29가 정답이다.
  await tapPoint(page, "39", false);
  await tapPoint(page, "49", false);
  await expect(page.getByRole("status")).toHaveText("그 수로는 기물을 잃어요");
  await page.getByRole("button", { name: "다시 하기" }).click();

  await tapPoint(page, "39", false);
  await tapPoint(page, "29", false);
  await expect(page.getByRole("status")).toHaveText("잘 지켰어요!");
  await expect(page.getByText(/차를 29로 비킨다/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("janggi-defend.png") });
});

test("장기 초고수: 옵션에서 고르면 상대 자리 표에 노림이 잘리지 않고 보이고 한 수를 받는다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/janggi");
  await startSolo(page, "초고수");
  await page.getByRole("button", { name: "상마상마" }).click();
  await expect(page.locator("[data-plan]")).toContainText("노림: ");
  // 「차 길 열기·기물 전개」는 노림 문구 가운데 가장 긴 축이다. 좁은 휴대폰에서도 잘리지 않아야 한다.
  expect(
    await page
      .locator("[data-plan]")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await expect(page.locator("[data-plan]")).toContainText("노림: ");
  await page.screenshot({ path: info.outputPath("janggi-master.png") });
});

test("장기: 초고수가 생각하는 동안에도 화면이 멈추지 않는다(CPU 4배 느리게, 워커 계산)", async ({
  page,
}, info) => {
  // CPU 느리게 하기는 Chromium CDP라 데스크톱 한 화면에서만 본다.
  test.skip(info.project.name !== "desktop", "데스크톱에서만");
  await page.goto("/janggi");
  await startSolo(page, "초고수");
  await page.getByRole("button", { name: "상마상마" }).click();
  await expect(page.getByRole("status")).toContainText("내 차례");
  await slowCpu(page, 4);
  // 첫 수는 초고수도 가볍게 답한다. 세 수를 이어 두며 컴퓨터가 생각하는 동안만 잰다(내 수를 그리는 때는 빼고).
  let maxGap = 0;
  let span = 0;
  for (let i = 0; i < 3; i++) {
    await playOne(page, false);
    await watchFrames(page);
    // 컴퓨터가 답하면 다시 내 차례(느린 CPU라 넉넉히 기다린다).
    await expect(page.getByRole("status")).toContainText("내 차례", {
      timeout: 30_000,
    });
    const round = await stopFrames(page);
    maxGap = Math.max(maxGap, round.maxGap);
    span += round.span;
  }
  info.annotations.push({
    type: "frames",
    description: `가장 긴 프레임 간격 ${maxGap}ms, 잰 시간 ${span}ms`,
  });
  console.info(`[장기 초고수] 가장 긴 프레임 간격 ${maxGap}ms / ${span}ms`);
  // 화면 스레드에서 세면 CPU 4배 느린 판에서 한 번에 0.8초 넘게 멈춘다(고수 한 수 약 0.2초 × 4).
  // 재는 구간에 컴퓨터 수를 그리는 순간도 들어가 CI 기기 속도에 따라 흔들리지 않게 넉넉히 400ms로 가린다
  expect(maxGap).toBeLessThan(400);
});
