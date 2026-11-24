import { NO_PHONE_LANDSCAPE } from "./projects";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/*
 * 마이티 복기의 조커콜 효과. 기록은 단위 시험(review/joker-call-mark.test.ts)이 지키는 기록 파일을 「가져오기」로 넣는다:
 * 혼자 하기 씨앗 137, 1판 첫 턴 조커콜은 같은 편 조커라 효과 없음, 2판 셋째 턴 조커콜은 상대 조커를 끌어내 먹어 효과 있음.
 */

const ARCHIVE = new URL("./mighty-review-archive.json", import.meta.url)
  .pathname;

const roundCard = (page: Page, n: number) =>
  page.locator("section").filter({
    has: page.getByRole("heading", { name: `${n}판`, exact: true }),
  });

test(
  "마이티 복기: 판마다 조커콜 수와 효과 수, 턴 표의 조커콜 카드에 효과 여부가 보인다",
  { tag: NO_PHONE_LANDSCAPE },
  async ({ page }, info) => {
    await page.goto("/review");
    await page.getByLabel("복기 기록 파일").setInputFiles(ARCHIVE);
    await expect(page.getByText("1게임을 가져왔어요.")).toBeVisible();
    await page.getByRole("button", { name: /마이티 · 혼자/ }).click();

    const first = roundCard(page, 1);
    await expect(first).toContainText("1번 · 효과 0번");
    await expect(first.getByText("조커콜 효과 없음")).toHaveCount(1);
    await expect(first.getByText("조커콜 효과 있음")).toHaveCount(0);

    const second = roundCard(page, 2);
    await expect(second).toContainText("1번 · 효과 1번");
    await expect(second.getByText("조커콜 효과 있음")).toHaveCount(1);
    await expect(second.getByText("조커콜 효과 없음")).toHaveCount(0);

    if (SAVE_SCREENSHOTS)
      await second.screenshot({
        path: info.outputPath("review-joker-call.png"),
      });
    await page.screenshot({
      path: info.outputPath("review-joker-call-page.png"),
      fullPage: true,
    });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  },
);

test("복기: 게임을 보다 뒤로가기면 목록으로 돌아오고, 지우기는 한 번 더 묻는다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  await page.goto("/review");
  await page.getByLabel("복기 기록 파일").setInputFiles(ARCHIVE);
  const game = page.getByRole("button", { name: /마이티 · 혼자/ });
  await game.click();
  await expect(roundCard(page, 1)).toBeVisible();
  await expect(page).toHaveURL(/\/review\?id=/);

  await page.goBack();
  await expect(game).toBeVisible();
  await expect(page).toHaveURL(/\/review$/);

  await page.getByRole("button", { name: "지우기" }).click();
  await expect(page.getByText("정말 지울까요?")).toBeVisible();
  await page.getByRole("button", { name: "취소" }).click();
  await expect(game).toBeVisible();
  await page.getByRole("button", { name: "지우기" }).click();
  await page.getByRole("button", { name: "지우기" }).click();
  await expect(page.getByText("아직 남긴 게임이 없어요.")).toBeVisible();
});
