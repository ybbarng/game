import {
  captureMoves,
  groupOf,
  ladderMoves,
  step as playStep,
  pointAt,
  pointName,
} from "@game/baduk-engine";

import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "../src/baduk/puzzles";
import {
  defenseFor,
  puzzleState,
  spotMoveOf,
  spotsOf,
  targetOf,
} from "../src/baduk/study";
import { useTestSpeed } from "./fast";
import { expect, type Page, ready, test } from "./test";
import { linesBreakAtSpaces } from "./word-wrap";

/** 9줄 판과 가장자리 여백(BadukBoard의 BADUK_PAD) */
const SIZE = 9;
const PAD = 1;
const VIEW = SIZE - 1 + PAD * 2;
const COLUMNS = "ABCDEFGHJ";

const board = (page: Page) => page.getByRole("img", { name: /바둑판/ });
const stones = (page: Page) => page.locator("[data-stone]");

/** 자리 이름("E5")을 누른다. 손가락은 한 번 겨누고 다시 눌러 둔다 */
async function placeAt(page: Page, name: string, touch: boolean) {
  const box = await board(page).boundingBox();
  if (!box) throw new Error("판이 안 보인다");
  const unit = box.width / VIEW;
  const x = COLUMNS.indexOf(name[0] as string);
  const y = SIZE - Number(name.slice(1));
  const px = box.x + (x + PAD) * unit;
  const py = box.y + (y + PAD) * unit;
  if (touch) {
    await page.touchscreen.tap(px, py);
    await expect(page.getByRole("status")).toContainText(
      `${name}: 한 번 더 누르면 둬요.`,
    );
    await page.touchscreen.tap(px, py);
  } else await page.mouse.click(px, py);
}

/** 빈 자리 하나에 내 돌을 둔다 */
async function playOne(page: Page, touch: boolean, stone = "black") {
  for (const name of ["E5", "C3", "G7", "C7", "G3", "E3", "E7", "C5", "G5"]) {
    if ((await page.locator(`[data-point="${name}"]`).count()) > 0) continue;
    await placeAt(page, name, touch);
    await expect(
      page.locator(`[data-point="${name}"][data-stone="${stone}"]`),
    ).toHaveCount(1);
    return name;
  }
  throw new Error("둘 곳이 없다");
}

/** 첫 화면 → 옵션에서 9줄·컴퓨터(고르면)·흑을 고르고 → 나홀로 바둑 */
async function startSolo(page: Page, level?: string) {
  await ready(page);
  await page.getByRole("button", { name: "옵션" }).click();
  // 기본은 19줄이다. 시험은 짧게 9줄로 둔다.
  await page.getByRole("button", { name: "9줄", exact: true }).click();
  if (level) await page.getByRole("button", { name: level }).click();
  await page.getByRole("button", { name: "흑(먼저)" }).click();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: /나홀로 바둑/ }).click();
}

test.beforeEach(async ({ page, context }) => {
  await useTestSpeed(context);
  await page.addInitScript(() => {
    sessionStorage.setItem("mighty-splash-seen", "1");
  });
});

test("바둑: 게임 목록에서 들어가 두고, 새로고침 뒤 이어 두고, 무르고 기권한다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("link", { name: /바둑/ }).first().click();
  await expect(page).toHaveURL(/\/baduk$/);
  await expect(page.getByRole("heading", { name: "바둑" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("baduk-home.png") });
  await startSolo(page, "입문");

  await expect(page.getByRole("status")).toContainText("내 차례");
  await expect(stones(page)).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: info.outputPath("baduk-start.png") });

  // 한 수 두면 컴퓨터가 답하고 다시 내 차례.
  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await expect(stones(page)).toHaveCount(2);

  // 새로고침해도 이어 둘 수 있다.
  await page.reload();
  await page.getByRole("button", { name: /이어하기/ }).click();
  await expect(stones(page)).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText("내 차례");

  await playOne(page, touch);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 15_000,
  });
  await expect(stones(page)).toHaveCount(4);
  await page.getByRole("button", { name: "세어 보기" }).click();
  await expect(page.getByText(/지금 세면 흑/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("baduk-play.png") });
  await page.getByRole("button", { name: "세어 보기" }).click();

  await page.getByRole("button", { name: "무르기" }).click();
  await expect(stones(page)).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText("내 차례");

  // 힌트는 컴퓨터가 고른 자리에 초록 고리를 두고 그 자리를 겨눈다.
  await page.getByRole("button", { name: "힌트" }).click();
  await expect(page.locator("[data-hint]")).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("힌트: 초록 고리");
  await page.screenshot({ path: info.outputPath("baduk-hint.png") });

  await page.getByRole("button", { name: "기권" }).click();
  // 기권은 한 번 더 묻는다. 「계속 두기」면 판이 그대로다.
  await page.getByRole("button", { name: "계속 두기" }).click();
  await expect(page.getByRole("button", { name: "쉬기" })).toBeVisible();
  await expect(stones(page)).toHaveCount(2);
  await page.getByRole("button", { name: "기권" }).click();
  await page.getByRole("button", { name: "기권하기" }).click();
  await expect(page.getByRole("status")).toHaveText("기권했어요.");
  await expect(page.locator('[data-result-banner="lose"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("baduk-end.png") });

  // 다 끝난 게임은 이어하기에 남지 않는다.
  await page.getByRole("button", { name: "다시 하기" }).click();
  await expect(page.getByRole("button", { name: /나홀로 바둑/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test(
  "바둑: 둘이 이어 쉬면 판 위 그대로 세어 끝난다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 세기는 화면 크기와 상관없다
    await page.goto("/baduk");
    await startSolo(page);
    await playOne(page, false);
    await expect(page.getByRole("status")).toContainText("내 차례", {
      timeout: 15_000,
    });
    // 컴퓨터가 쉬면 따라 쉬고, 아니면 내가 먼저 쉰다. 어느 쪽이든 결국 둘이 이어 쉰다.
    const over = page.getByRole("button", { name: "다시 하기" });
    const pass = page.getByRole("button", { name: "쉬기" });
    for (let i = 0; i < 80; i++) {
      // 판이 끝났거나 내 차례가 올 때까지 기다린다.
      await expect(over.or(pass)).toBeVisible({ timeout: 15_000 });
      if (await over.isVisible()) break;
      await pass.click();
      await expect(pass).toBeHidden();
    }
    await expect(page.getByRole("status")).toContainText("세어 보니");
    await expect(page.getByText(/흑 \d+ : 백 [\d.]+/).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath("baduk-count.png") });
  },
);

test(
  "바둑 배우기: 첫 단원 미션을 틀렸다가 다시 해서 백 한 점을 따낸다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 배우기 진행은 크기와 상관없다(공통 배우기 화면의 배치는 tutorial.spec이 세 크기로 본다)
    const touch = info.project.name.startsWith("phone");
    await page.goto("/baduk");
    await page.getByRole("button", { name: /바둑 배우기/ }).click();
    await expect(page.getByText("0/8")).toBeVisible();
    await page.getByRole("button", { name: /바둑은 어떤 게임/ }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    // 둘째 설명(활로와 따내기)에는 판 그림이 있다.
    await expect(board(page)).toBeVisible();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page
      .getByRole("button", { name: "그 돌의 활로를 모두 막았을 때" })
      .click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "미션 시작" }).click();
    await expect(stones(page)).toHaveCount(4);
    // 활로가 하나 남은 백 E5에 단수 표시(빨간 테두리)가 있다.
    await expect(page.locator("[data-atari]")).toHaveCount(1);
    await expect(page.locator('[data-atari="E5"]')).toHaveCount(1);
    await placeAt(page, "A1", touch);
    await expect(page.getByRole("dialog", { name: "미션 실패" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "다시 하기" }).click();
    await expect(stones(page)).toHaveCount(4);
    await page.screenshot({ path: info.outputPath("baduk-mission.png") });
    await placeAt(page, "E4", touch);
    await expect(page.getByRole("dialog", { name: "미션 성공" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByText("단원 완료!")).toBeVisible();
  },
);

test(
  "바둑: 방장이 방을 만들고 친구가 링크로 들어와 두고, 둘이 쉬어 세고, 판 끝 검증을 통과한다",
  { tag: "@only-desktop" },
  async ({ context }, info) => {
    // 데스크톱에서만 돌린다
    const host = await context.newPage();
    const guest = await context.newPage();
    const errors: string[] = [];
    for (const p of [host, guest])
      p.on("pageerror", (e) => errors.push(e.message));

    await host.goto("/baduk?net=local");
    await ready(host);
    await host.getByRole("button", { name: "옵션" }).click();
    await host.getByRole("button", { name: "9줄", exact: true }).click();
    await host.getByRole("button", { name: "처음으로" }).click();
    await host.getByRole("button", { name: /다함께 바둑/ }).click();
    await host.getByPlaceholder("친구에게 보일 이름").fill("방장");
    await host.getByRole("button", { name: "방 만들기", exact: true }).click();
    const link = await host.locator("input[readonly]").inputValue();
    expect(link).toContain("/baduk");

    await guest.goto(link);
    await guest.getByPlaceholder("친구에게 보일 이름").fill("철수");
    await guest.getByRole("button", { name: "들어가기" }).click();
    await expect(host.getByText("철수")).toBeVisible();
    await host.getByRole("button", { name: "시작하기" }).click();
    await expect(board(guest)).toBeVisible();
    await expect(board(host)).toBeVisible();

    const black = (await host.getByText("나는 흑").count()) > 0 ? host : guest;
    const white = black === host ? guest : host;
    await expect(black.getByRole("status")).toContainText("내 차례", {
      timeout: 15_000,
    });
    await playOne(black, false);
    await expect(white.getByRole("status")).toContainText("내 차례", {
      timeout: 15_000,
    });
    await expect(white.locator('[data-point="E5"]')).toHaveCount(1);
    // 백이 쉬고 흑도 쉬면 판 위 그대로 센다: 흑 81 : 백 7.5
    await white.getByRole("button", { name: "쉬기" }).click();
    await expect(black.getByRole("status")).toContainText("상대가 쉬었어요", {
      timeout: 15_000,
    });
    await black.getByRole("button", { name: "쉬기" }).click();
    await expect(black.getByRole("status")).toHaveText("세어 보니 이겼어요!");
    await expect(white.getByRole("status")).toHaveText("세어 보니 졌어요.", {
      timeout: 15_000,
    });
    await expect(white.getByText("흑 81 : 백 7.5").first()).toBeVisible();
    await white.screenshot({ path: info.outputPath("baduk-online.png") });

    // 방장이 나가면 기록이 공개되고, 참가자가 처음부터 다시 둬 보며 확인한다.
    await host.getByRole("button", { name: "← 바둑" }).click();
    await expect(guest.getByText(/검증.*문제없음/)).toBeVisible({
      timeout: 10_000,
    });
    expect(errors).toEqual([]);
  },
);

test(
  "바둑: 끝낸 판은 내 기록에 쌓이고 복기에서 한 수씩 다시 본다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 기록은 화면 크기와 상관없다
    await page.goto("/baduk");
    await startSolo(page);
    await playOne(page, false);
    await expect(page.getByRole("status")).toContainText("내 차례", {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "기권" }).click();
    await page.getByRole("button", { name: "기권하기" }).click();
    await expect(page.getByRole("status")).toHaveText("기권했어요.");
    // 복기 기록이 실제로 쓰인 뒤에 떠난다.
    await page.waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          const open = indexedDB.open("mighty-review", 1);
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains("games")) {
              db.close();
              resolve(false);
              return;
            }
            const all = db.transaction("games").objectStore("games").getAll();
            all.onsuccess = () => {
              db.close();
              resolve(
                (all.result as { game: string; over: boolean }[]).some(
                  (g) => g.game === "baduk" && g.over,
                ),
              );
            };
          };
          open.onerror = () => resolve(false);
        }),
    );

    await page.goto("/profile?game=baduk");
    await expect(page.getByRole("tab", { name: "⚫ 바둑" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("0승 1패")).toBeVisible();

    await page.goto("/review");
    await page.getByRole("button", { name: /⚫ 바둑 · 혼자/ }).click();
    await page.getByRole("button", { name: "처음" }).click();
    await expect(stones(page)).toHaveCount(0);
    await expect(page.getByText(/다음 수: /)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "한 수 앞으로" }).click();
    await expect(stones(page)).toHaveCount(1);
    await page.screenshot({ path: info.outputPath("baduk-review.png") });
  },
);

test(
  "바둑 개인 시간: 시계가 가고, 다 쓰면 시간패다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 시계는 화면 크기와 상관없다
    await page.clock.install();
    await page.goto("/baduk");
    await ready(page);
    await page.getByRole("button", { name: "옵션" }).click();
    await page.getByRole("button", { name: "빠른 3분" }).click();
    await page.getByRole("button", { name: "흑(먼저)" }).click();
    await page.getByRole("button", { name: "처음으로" }).click();
    await page.getByRole("button", { name: /나홀로 바둑/ }).click();
    await expect(page.locator('[data-seat="me"] [data-clock]')).toHaveText(
      "3:00",
    );
    await page.clock.runFor(270_001);
    await expect(page.getByRole("status")).toHaveText("시간이 다 돼 졌어요.");
    await page.screenshot({ path: info.outputPath("baduk-time.png") });
  },
);

test(
  "바둑 수 배우기: 단수 방향을 틀렸다 다시 풀고, 축으로 몰아 따내고, 급소로 잡는다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 문제 풀이 진행은 크기와 상관없다(공통 문제 화면의 배치는 장기 외통 문제가 세 크기로 본다)
    const touch = info.project.name.startsWith("phone");
    await page.goto("/baduk");
    await page.getByRole("button", { name: /바둑 배우기/ }).click();
    await page.getByRole("button", { name: /수 배우기/ }).click();
    const atari = page.getByRole("region", { name: "단수 방향" });
    await expect(atari.getByText("0/8")).toBeVisible();
    await atari.getByRole("button", { name: "풀기 시작" }).click();
    await expect(page.getByRole("status")).toHaveText("△ 백 돌을 따내세요.");

    // G1에서 단수 치면 백이 F2로 뻗어 달아난다.
    await placeAt(page, "G1", touch);
    await expect(page.getByRole("status")).toHaveText("그 수로는 못 따내요.");
    await page.getByRole("button", { name: "다시 하기" }).click();

    // 정답: F2에서 단수 → 백이 받고(달아날 곳이 없어 쉰다) → 따낸다.
    await placeAt(page, "F2", touch);
    await expect(page.getByRole("status")).toHaveText("계속 몰아 따내세요.", {
      timeout: 10_000,
    });
    await placeAt(page, "G1", touch);
    await expect(page.getByRole("status")).toHaveText("따냈어요!");
    await expect(page.getByText(/수 만에 백 돌/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("baduk-atari.png") });
    await page.getByRole("button", { name: "← 목록" }).click();
    await expect(atari.getByText("1/8")).toBeVisible();

    // 축: 계속 단수로 몰아 따낸다(백은 늘 같은 수로 버틴다).
    await page
      .getByRole("region", { name: "축", exact: true })
      .getByRole("button", { name: "풀기 시작" })
      .click();
    for (const name of ["C3", "C6", "B6", "A6"]) {
      await placeAt(page, name, touch);
      await expect(page.getByRole("status")).toHaveText("계속 몰아 따내세요.", {
        timeout: 10_000,
      });
    }
    await placeAt(page, "A3", touch);
    await expect(page.getByRole("status")).toHaveText("따냈어요!");
    await page.screenshot({ path: info.outputPath("baduk-ladder.png") });
    await page.getByRole("button", { name: "← 목록" }).click();

    // 눈 빼앗기: 귀의 곧은 세 집은 가운데가 급소다.
    await page
      .getByRole("region", { name: "눈 빼앗기" })
      .getByRole("button", { name: "풀기 시작" })
      .click();
    await expect(page.getByRole("status")).toHaveText("△ 백 무리를 잡으세요.");
    await placeAt(page, "A8", touch);
    await expect(page.getByRole("status")).toHaveText("잡았어요!");
    await expect(page.getByText(/급소/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("baduk-kill.png") });
  },
);

/** 19줄 판의 자리("E17")를 누른다. 손가락은 한 번 겨누고 다시 눌러 둔다 */
async function placeAt19(page: Page, name: string, touch: boolean) {
  const size = 19;
  const view = size - 1 + PAD * 2;
  const columns = "ABCDEFGHJKLMNOPQRST";
  const box = await board(page).boundingBox();
  if (!box) throw new Error("판이 안 보인다");
  const unit = box.width / view;
  const px = box.x + (columns.indexOf(name[0] as string) + PAD) * unit;
  const py = box.y + (size - Number(name.slice(1)) + PAD) * unit;
  if (touch) {
    await page.touchscreen.tap(px, py);
    await page.touchscreen.tap(px, py);
  } else await page.mouse.click(px, py);
}

/**
 * 긴 축 문제에서 흑이 둘 수: 화면과 같은 백 응수(`defenseFor`)를 받으며, 축으로 가장 빨리 잡는 단수를 고른다.
 * 화면이 쓰는 규칙 자료를 그대로 읽으니, 자료가 바뀌어도 시험을 고칠 일이 없다
 */
function ladderLine(id: string): string[] {
  const p = BADUK_PUZZLE_SETS.flatMap((s) => s.puzzles).find(
    (q) => q.id === id,
  ) as BadukPuzzle;
  const target = targetOf(p);
  let state = puzzleState(p);
  let move = p.solution;
  const moves: string[] = [];
  for (let i = 0; i < 30; i++) {
    moves.push(move);
    const mine = playStep(state, 0, {
      type: "place",
      at: pointAt(move, SIZE),
    });
    if (!mine.ok) throw new Error(mine.error);
    state = mine.state;
    if (state.board[target] === 0) return moves;
    const theirs = playStep(state, 1, defenseFor(p, state, i));
    if (!theirs.ok) throw new Error(theirs.error);
    state = theirs.state;
    let best: { at: number; n: number } | null = null;
    for (const l of groupOf(state.board, target).liberties) {
      const n = ladderMoves(
        state.board,
        1,
        target,
        l,
        new Set(state.positions),
      );
      if (n !== null && (best === null || n < best.n)) best = { at: l, n };
    }
    if (!best) throw new Error("축이 끊겼다");
    move = pointName(best.at, SIZE);
  }
  throw new Error("따내지 못했다");
}

test(
  "바둑 수 배우기 단원: 패로 버티기를 읽고, 팻감을 써 되따내고, 팻감을 받고, 긴 축을 끝까지 몰고, 삼연성을 따라 둔다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 풀이 진행은 크기와 상관없다(공통 문제·단원 화면의 배치는 다른 시험이 세 크기로 본다)
    const touch = info.project.name.startsWith("phone");
    await page.goto("/baduk");
    await page.getByRole("button", { name: /바둑 배우기/ }).click();
    await page.getByRole("button", { name: /수 배우기/ }).click();

    // 단원: 설명 넷(둘째에서 팻감 그림, 넷째에서 패 잇기 그림) → 퀴즈 셋 → 끝
    const lessons = page.getByRole("region", { name: "단원 읽기" });
    await lessons.getByRole("button", { name: "패로 버티기" }).click();
    await expect(
      page.getByRole("heading", { name: "패를 따인 쪽" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "팻감을 쓴다" }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath("baduk-lesson-ko.png") });
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "패를 잇는 때" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("baduk-lesson-ko-connect.png"),
    });
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page
      .getByRole("button", { name: /없다\. 먼저 다른 곳에 팻감을/ })
      .click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: /두 점을 살려 받는다/ }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "패를 이어 끝낸다" }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByText("단원 완료!")).toBeVisible();
    await page.getByRole("button", { name: "단원 목록으로" }).click();
    await expect(
      lessons.getByRole("button", { name: "패로 버티기 (끝냄)" }),
    ).toBeVisible();

    // 팻감 쓰기: × 자리는 둘 수 없다 → 팻감 → 백이 받는다 → 되따낸다
    const threat = page.getByRole("region", { name: "팻감 쓰기" });
    await threat.getByRole("button", { name: "풀기 시작" }).click();
    const status = page.getByRole("status");
    await expect(status).toHaveText(
      "× 자리는 지금 되따낼 수 없어요. 팻감을 쓰세요.",
    );
    await placeAt(page, "E6", touch);
    await expect(page.locator('[data-point="E6"]')).toHaveCount(0);
    await placeAt(page, "J2", touch);
    await expect(status).toHaveText("백이 받았어요. 이제 패를 되따내세요.", {
      timeout: 10_000,
    });
    await expect(
      page.locator('[data-point="J5"][data-stone="white"]'),
    ).toHaveCount(1);
    await placeAt(page, "E6", touch);
    await expect(status).toHaveText("되따냈어요!");
    await expect(page.getByText(/팻감이에요/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("baduk-ko-threat.png") });
    await page.getByRole("button", { name: "← 목록" }).click();

    // 팻감 받기: 노림받은 흑 두 점을 잇는다
    await page
      .getByRole("region", { name: "팻감 받기" })
      .getByRole("button", { name: "풀기 시작" })
      .click();
    await expect(status).toHaveText(
      "백이 팻감을 썼어요. △ 흑 돌을 살려 받으세요.",
    );
    await placeAt(page, "A6", touch);
    await expect(status).toHaveText("받았어요!");
    await page.getByRole("button", { name: "← 목록" }).click();

    // 긴 축: 판 끝까지 몬다
    await page
      .getByRole("region", { name: "긴 축" })
      .getByRole("button", { name: "풀기 시작" })
      .click();
    const line = ladderLine("long-ladder-1");
    expect(line.length).toBeGreaterThanOrEqual(10);
    for (const [i, name] of line.entries()) {
      await placeAt(page, name, touch);
      if (i < line.length - 1)
        await expect(status).toHaveText("계속 몰아 따내세요.", {
          timeout: 10_000,
        });
    }
    await expect(status).toHaveText("따냈어요!");
    await page.screenshot({ path: info.outputPath("baduk-long-ladder.png") });
    await page.getByRole("button", { name: "← 목록" }).click();

    // 축머리: 첫 문제 그림
    await page
      .getByRole("region", { name: "축머리" })
      .getByRole("button", { name: "풀기 시작" })
      .click();
    await expect(status).toHaveText(
      "□ 축머리를 피해 축으로 △ 백 돌을 잡으세요.",
    );
    await page.screenshot({ path: info.outputPath("baduk-breaker.png") });
    await page.getByRole("button", { name: "← 목록" }).click();

    // 포석 따라 두기: 삼연성
    await page
      .getByRole("region", { name: "포석 따라 두기" })
      .getByRole("button", { name: "삼연성(흑)" })
      .click();
    await placeAt19(page, "Q16", touch);
    await expect(
      page.locator('[data-point="D4"][data-stone="white"]'),
    ).toHaveCount(1);
    await placeAt19(page, "Q4", touch);
    await expect(
      page.locator('[data-point="D16"][data-stone="white"]'),
    ).toHaveCount(1);
    await placeAt19(page, "Q10", touch);
    await expect(status).toHaveText("수순을 끝까지 두었어요!");
    await page.screenshot({ path: info.outputPath("baduk-fuseki.png") });
  },
);

/**
 * 장문 문제에서 흑이 둘 수: 화면과 같은 백 응수(`defenseFor`)를 받으며, 남은 수 안에 따내는 첫 수를 고른다.
 * 화면이 쓰는 자료와 판정을 그대로 읽으니, 자료가 바뀌어도 시험을 고칠 일이 없다
 */
function netLine(id: string): string[] {
  const p = BADUK_PUZZLE_SETS.flatMap((s) => s.puzzles).find(
    (q) => q.id === id,
  ) as Extract<BadukPuzzle, { kind: "capture" }>;
  const target = targetOf(p);
  let state = puzzleState(p);
  let move = pointAt(p.solution, SIZE);
  const moves: string[] = [];
  for (let i = 0; i < p.within; i++) {
    moves.push(pointName(move, SIZE));
    const mine = playStep(state, 0, { type: "place", at: move });
    if (!mine.ok) throw new Error(mine.error);
    state = mine.state;
    if (state.board[target] === 0) return moves;
    const theirs = playStep(state, 1, defenseFor(p, state, i));
    if (!theirs.ok) throw new Error(theirs.error);
    state = theirs.state;
    const next = captureMoves(state.board, 1, target, p.within - i - 1)[0];
    if (next === undefined) throw new Error("장문이 끊겼다");
    move = next;
  }
  throw new Error("따내지 못했다");
}

/** 끝내기 문제의 A·B 자리(화면 그림과 같은 엔진 읽기): [정답, 다른 곳] */
function endgameMoves(id: string): [string, string] {
  const p = BADUK_PUZZLE_SETS.flatMap((s) => s.puzzles).find(
    (q) => q.id === id,
  ) as Extract<BadukPuzzle, { kind: "endgame" }>;
  const { board } = puzzleState(p);
  const marks = spotsOf(p).map((spot) =>
    pointName(spotMoveOf(board, spot), SIZE),
  );
  const other = marks.find((m) => m !== p.solution) as string;
  return [p.solution, other];
}

test(
  "바둑 수 배우기: 끝내기 단원을 읽고, 패를 잇고, 축이 막히면 장문으로 잡고, 큰 끝내기·선수 끝내기를 고른다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    const touch = info.project.name.startsWith("phone");
    await page.goto("/baduk");
    await page.getByRole("button", { name: /바둑 배우기/ }).click();
    await page.getByRole("button", { name: /수 배우기/ }).click();
    const status = page.getByRole("status");

    // 끝내기 단원: 설명 여섯 → 퀴즈 둘 → 끝
    const lessons = page.getByRole("region", { name: "단원 읽기" });
    await lessons.getByRole("button", { name: "끝내기 기초" }).click();
    await expect(page.getByRole("heading", { name: "끝내기란" })).toBeVisible();
    for (const title of [
      "점수를 다시 세기",
      "몇 점짜리일까",
      "큰 곳부터",
      "선수와 후수",
      "어디부터 둘까",
    ]) {
      await page.getByRole("button", { name: "다음", exact: true }).click();
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      if (title === "몇 점짜리일까" || title === "어디부터 둘까")
        await page.screenshot({
          path: info.outputPath(`baduk-lesson-endgame-${title}.png`),
        });
    }
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "2점짜리" }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: /^선수/ }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByText("단원 완료!")).toBeVisible();
    await page.getByRole("button", { name: "단원 목록으로" }).click();
    await expect(
      lessons.getByRole("button", { name: "끝내기 기초 (끝냄)" }),
    ).toBeVisible();

    // 패 잇기: 받지 않고 패를 잇는다
    await page
      .getByRole("region", { name: "패 잇기" })
      .getByRole("button", { name: "풀기 시작" })
      .click();
    await expect(status).toHaveText(
      "백이 팻감을 썼어요. 받을지, 패를 이을지 골라 두세요.",
    );
    const connect = BADUK_PUZZLE_SETS.flatMap((s) => s.puzzles).find(
      (q) => q.id === "ko-connect-1",
    ) as BadukPuzzle;
    await placeAt(page, connect.solution, touch);
    await expect(status).toHaveText("패를 이었어요!");
    await expect(page.getByText(/패를 지면 흑/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("baduk-ko-connect.png") });
    await page.getByRole("button", { name: "← 목록" }).click();

    // 축이 막히면 장문
    await page
      .getByRole("region", { name: "축이 막히면 장문" })
      .getByRole("button", { name: "풀기 시작" })
      .click();
    await expect(status).toHaveText(
      "□ 축머리가 두 쪽에 있어요. 장문으로 △ 백 돌을 잡으세요.",
    );
    const net = netLine("blocked-net-1");
    for (const [i, name] of net.entries()) {
      await placeAt(page, name, touch);
      if (i < net.length - 1)
        await expect(status).toHaveText("계속 몰아 따내세요.", {
          timeout: 10_000,
        });
    }
    await expect(status).toHaveText("따냈어요!");
    await page.screenshot({ path: info.outputPath("baduk-blocked-net.png") });
    await page.getByRole("button", { name: "← 목록" }).click();

    // 큰 끝내기부터: 작은 곳은 틀리고, 큰 곳은 푼다
    await page
      .getByRole("region", { name: "큰 끝내기부터" })
      .getByRole("button", { name: "풀기 시작" })
      .click();
    await expect(status).toHaveText(
      "끝내기가 두 곳(A·B) 남았어요. 큰 곳에 두세요.",
    );
    const [big, small] = endgameMoves("endgame-bigger-1");
    await placeAt(page, small, touch);
    await expect(status).toHaveText("그곳은 작은 끝내기예요.");
    await page.getByRole("button", { name: "다시 하기" }).click();
    await placeAt(page, big, touch);
    await expect(status).toHaveText("끝내기를 잘 골랐어요!");
    await expect(page.getByText(/점짜리 후수 끝내기예요/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("baduk-endgame-big.png") });
    await page.getByRole("button", { name: "← 목록" }).click();

    // 선수 끝내기부터: 선수 → 백이 받는다 → 남은 곳
    await page
      .getByRole("region", { name: "선수 끝내기부터" })
      .getByRole("button", { name: "풀기 시작" })
      .click();
    const [sente, gote] = endgameMoves("endgame-sente-1");
    await placeAt(page, sente, touch);
    await expect(status).toHaveText("백이 받았어요. 남은 곳에 두세요.", {
      timeout: 10_000,
    });
    await placeAt(page, gote, touch);
    await expect(status).toHaveText("끝내기를 잘 골랐어요!");
    await expect(page.getByText(/선수예요/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("baduk-endgame-sente.png") });
  },
);

test("바둑 수 배우기: 맞힌 뒤 큰 결과 제목과 해설은 낱말 중간에서 줄이 바뀌지 않고 상자를 넘치지 않는다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/baduk");
  await page.getByRole("button", { name: /바둑 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  await page
    .getByRole("region", { name: "큰 끝내기부터" })
    .getByRole("button", { name: "풀기 시작" })
    .click();
  const [big] = endgameMoves("endgame-bigger-1");
  await placeAt(page, big, touch);
  const title = page.getByRole("status");
  await expect(title).toHaveText("끝내기를 잘 골랐어요!");
  // 결과 상자는 pop-in으로 커진다. 연출이 끝난 뒤에 줄을 잰다
  const box = page.locator("[data-outcome]");
  await box.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished)),
  );
  const { lines, words, lineWords } = await linesBreakAtSpaces(title);
  expect(
    lineWords,
    `화면 줄 ${JSON.stringify(lines)}이 낱말 ${JSON.stringify(words)} 중간에서 끊겼다`,
  ).toEqual(words);
  // 아래 해설 줄도 같은 화면 틀이라 낱말 단위로 바뀐다(「끝내기예 / 요.」가 아니게)
  const notes = page.getByRole("listitem");
  await expect(notes).not.toHaveCount(0);
  for (const note of await notes.all()) {
    const wrap = await linesBreakAtSpaces(note);
    expect(
      wrap.lineWords,
      `해설 줄 ${JSON.stringify(wrap.lines)}이 낱말 중간에서 끊겼다`,
    ).toEqual(wrap.words);
  }
  // 긴 낱말이 상자 밖으로 삐져나가지 않는다
  const overflow = await box.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBe(0);
  await page.screenshot({
    path: info.outputPath(`baduk-outcome-wrap-${info.project.name}.png`),
  });
});

test("바둑 정석 따라 두기: 수순에 없는 수는 두지 않고, 마늘모 붙임을 끝까지 둔다", async ({
  page,
}, info) => {
  const touch = info.project.name.startsWith("phone");
  await page.goto("/baduk");
  await page.getByRole("button", { name: /바둑 배우기/ }).click();
  await page.getByRole("button", { name: /수 배우기/ }).click();
  const set = page.getByRole("region", { name: "정석 따라 두기" });
  await set
    .getByRole("button", { name: "화점 날일자 걸침 — 마늘모 붙임(흑)" })
    .click();
  // 백이 먼저 걸쳐 온다.
  await expect(
    page.locator('[data-point="F17"][data-stone="white"]'),
  ).toHaveCount(1);
  await expect(page.getByRole("status")).toHaveText("수순의 다음 수를 두세요.");

  await placeAt19(page, "A1", touch);
  await expect(page.getByRole("status")).toHaveText(
    /이 수순에서 두는 수가 아니에요/,
  );
  await expect(page.locator('[data-point="A1"]')).toHaveCount(0);

  await placeAt19(page, "E17", touch);
  await expect(
    page.locator('[data-point="F16"][data-stone="white"]'),
  ).toHaveCount(1);
  await placeAt19(page, "D14", touch);
  await expect(page.getByRole("status")).toHaveText("수순을 끝까지 두었어요!");
  await page.screenshot({ path: info.outputPath("baduk-joseki.png") });
});

test(
  "바둑 정석 단원과 소목 한 칸 높은 걸침: 돌 모양 이름을 읽고, 백이 어느 쪽으로 이어도 수순을 끝까지 둔다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 수순 진행은 크기와 상관없다(수순 화면 배치는 위 마늘모 붙임 시험이 세 크기로 본다)
    const touch = info.project.name.startsWith("phone");
    await page.goto("/baduk");
    await page.getByRole("button", { name: /바둑 배우기/ }).click();
    await page.getByRole("button", { name: /수 배우기/ }).click();

    // 단원: 설명 일곱 → 퀴즈 둘 → 끝
    const lessons = page.getByRole("region", { name: "단원 읽기" });
    await lessons
      .getByRole("button", { name: "정석: 귀에서 주고받기" })
      .click();
    await expect(page.getByRole("heading", { name: "정석이란" })).toBeVisible();
    for (const title of [
      "걸침과 날일자",
      "한 칸 뛰기",
      "붙임, 젖힘, 마늘모",
      "끊는 자리, 서기, 기기",
      "벽과 두터움",
      "따라 둘 정석",
    ]) {
      await page.getByRole("button", { name: "다음", exact: true }).click();
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      if (title === "붙임, 젖힘, 마늘모" || title === "끊는 자리, 서기, 기기")
        await page.screenshot({
          path: info.outputPath(`baduk-lesson-joseki-${title}.png`),
        });
    }
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "걸침", exact: true }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("button", { name: "끊는다", exact: true }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByText("단원 완료!")).toBeVisible();
    await page.getByRole("button", { name: "단원 목록으로" }).click();
    await expect(
      lessons.getByRole("button", { name: "정석: 귀에서 주고받기 (끝냄)" }),
    ).toBeVisible();

    // 수순: 흑이 먼저 붙인다 → 백 젖힘 → 물러서기 → 백은 F16(곧게) 또는 G16(한 칸 건너) → 한 칸 뛰기 → 백 벌림
    await page
      .getByRole("region", { name: "정석 따라 두기" })
      .getByRole("button", {
        name: "소목 한 칸 높은 걸침 — 붙이고 물러서기(흑)",
      })
      .click();
    const status = page.getByRole("status");
    await expect(status).toHaveText("수순의 다음 수를 두세요.");
    await placeAt19(page, "E17", touch);
    await expect(
      page.locator('[data-point="F17"][data-stone="white"]'),
    ).toHaveCount(1);
    await placeAt19(page, "D17", touch);
    const connected = page.locator(
      '[data-point="F16"][data-stone="white"], [data-point="G16"][data-stone="white"]',
    );
    await expect(connected).toHaveCount(1);
    await placeAt19(page, "C14", touch);
    await expect(status).toHaveText("수순을 끝까지 두었어요!");
    await page.screenshot({
      path: info.outputPath("baduk-joseki-34-high.png"),
    });
  },
);

test("바둑 초고수: 옵션에서 고르고, 생각하는 동안 「생각하는 중」을 보이다가 한 수 받는다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 컴퓨터 단계는 화면 크기와 상관없다
  await page.goto("/baduk");
  await startSolo(page, "초고수");
  await expect(page.getByRole("status")).toContainText("내 차례");
  // 상태 줄이 지나간 글자를 모두 적어 둔다. 생각이 짧아도 놓치지 않는다(기다리는 시간에 기대지 않는다).
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    const status = document.querySelector('[role="status"]');
    if (!status) throw new Error("상태 줄이 없다");
    new MutationObserver(() => seen.push(status.textContent ?? "")).observe(
      status,
      { childList: true, characterData: true, subtree: true },
    );
  });
  await placeAt(page, "E5", false);
  await expect(page.getByRole("status")).toContainText("내 차례", {
    timeout: 30_000,
  });
  await expect(stones(page)).toHaveCount(2);
  const seen = await page.evaluate(
    () => (window as unknown as { __seen: string[] }).__seen,
  );
  // 계산은 웹 워커에서 돌아 화면이 멈추지 않고, 컴퓨터 수가 오기 전에 상태 줄이 먼저 바뀐다.
  expect(seen).toContain("컴퓨터가 생각하는 중…");
});
