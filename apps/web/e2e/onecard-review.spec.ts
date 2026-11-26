import { prepareFast } from "./fast";
import { expect, type Page, test } from "./test";

/*
 * 원카드 복기를 판 위(원카드 게임 화면)에서 본다. 기록은 단위 시험(onecard/review.test.ts)이 지키는 대본 기록 파일을
 * 「가져오기」로 넣는다: 셋이서 다섯 장, 2번째 걸음에 컴퓨터 2 헛외침, 22번째 걸음에 내가 컴퓨터 2를 잡음.
 * 판 상태 다시 만들기는 단위 시험이 보고, 여기서는 목록 → 다시 보기 열기 → 앞뒤로 넘기기 → 그 걸음의 고유 사건(말풍선·글)만 본다
 */

const ARCHIVE = new URL("./onecard-review-archive.json", import.meta.url)
  .pathname;

const notes = (page: Page) =>
  page.getByRole("status", { name: "이 걸음에 일어난 일" });
const forward = (page: Page) =>
  page.getByRole("button", { name: "한 걸음 앞으로" });
const step = (page: Page) =>
  page.getByRole("toolbar", { name: "다시 보기" }).getByText(/\d+\/97/);

test("원카드 복기: 판 위에서 한 걸음씩 앞뒤로 넘기고, 헛외침·잡기·벌칙 장이 그 걸음에 보인다", async ({
  page,
}, testInfo) => {
  await prepareFast(page);
  await page.goto("/review");
  await page.getByLabel("복기 기록 파일").setInputFiles(ARCHIVE);
  await expect(page.getByText("1게임을 가져왔어요.")).toBeVisible();
  await page.getByRole("button", { name: /원카드 · 혼자/ }).click();

  // 판 한눈에 보기: 순위와 외침·잡기·헛외침 수
  await expect(page.getByRole("list", { name: "순위" })).toContainText(
    "2등 나",
  );
  await expect(page.getByText("잡기 1번")).toBeVisible();
  await expect(page.getByText("헛외침 1번")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("1-review-list.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "▶ 이 판 다시 보기" }).click();
  const table = page.locator("main[data-game='onecard'][data-replay]");
  await expect(table).toBeVisible();
  await expect(step(page)).toHaveText("다시 보기 · 1판 · 0/97");
  // 다시 보기에서는 더미를 치지 못한다. 맨 위 카드는 평소처럼 그린 프레임이 적힌다(반응 시간을 재는 자리)
  const pile = page.locator("[data-pile]");
  await expect(pile).toBeDisabled();
  await expect
    .poll(() =>
      pile.evaluate(
        (el) =>
          el.getAttribute("data-shown-turn") ===
          el.getAttribute("data-turn-no"),
      ),
    )
    .toBe(true);

  // 2번째 걸음: 컴퓨터 2 헛외침(말풍선과 글이 그 걸음 동안 남는다)
  await forward(page).click();
  await forward(page).click();
  await expect(step(page)).toHaveText(/ 2\/97$/);
  await expect(notes(page)).toHaveText(/헛외침 · .*헛외침 벌칙 1장$/);
  await expect(table.locator("[data-bubble='false']")).toHaveText("헛외침!");

  // 한 걸음 뒤로 가면 그 걸음의 일이 사라진다
  await page.getByRole("button", { name: "한 걸음 뒤로" }).click();
  await expect(step(page)).toHaveText(/ 1\/97$/);
  await expect(notes(page)).toHaveText("");
  await expect(table.locator("[data-bubble]")).toHaveCount(0);

  // 22번째 걸음: 내가 컴퓨터 2를 잡고 컴퓨터 2가 벌칙 한 장
  for (let i = 1; i < 22; i++) await forward(page).click();
  await expect(step(page)).toHaveText(/ 22\/97$/);
  await expect(notes(page)).toHaveText(/^나: .* 잡음 · .*잡혀서 벌칙 1장$/);
  await expect(table.locator("[data-bubble='caught']")).toHaveText("잡혔다!");
  await page.screenshot({ path: testInfo.outputPath("2-replay-caught.png") });

  // 모든 패 펼치기와 상황판
  const reveal = page.getByRole("switch", { name: "모든 패 보기" });
  await reveal.click();
  await expect(reveal).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: testInfo.outputPath("3-replay-open.png") });
  await page.getByRole("button", { name: "상황판" }).click();
  const board = page.getByRole("complementary", { name: "상황판" });
  await expect(board).toContainText("버린 더미");
  await expect(board).toContainText(/실제:/);
  await page.screenshot({ path: testInfo.outputPath("4-replay-board.png") });
});
