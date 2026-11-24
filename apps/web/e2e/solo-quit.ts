import { expect, type Page } from "./test";

/** 혼자 하기 위쪽 막대 「설정」 메뉴 맨 아래 「그만하기」를 누르고, 「정말 그만할까요?」에 「그만하기」로 답한다 */
export async function quitFromSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "설정", exact: true }).click();
  const menu = page.locator("[data-settings-menu]");
  await menu.getByRole("button", { name: "그만하기", exact: true }).click();
  await expect(menu.getByText("정말 그만할까요?")).toBeVisible();
  await menu.getByRole("button", { name: "그만하기", exact: true }).click();
  await expect(menu).toHaveCount(0);
}

/**
 * 그만둔 뒤 끝 화면: 결과 상자에 승패·비김 없이 「게임을 끝냈어요.」, 판 끝 단추(「다시 하기」·「처음으로」),
 * 내 기록에는 이 게임이 「그만둔 게임」(이기지 않음) 하나로 남는다
 */
export async function expectQuitEnd(page: Page, game: string): Promise<void> {
  await expect(
    page.getByRole("status").filter({ hasText: "게임을 끝냈어요." }),
  ).toBeVisible();
  await expect(page.locator("[data-outcome]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다시 하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "처음으로" })).toBeVisible();
  const games = await page.evaluate((id) => {
    const book = JSON.parse(localStorage.getItem("mighty-stats") ?? "{}") as {
      games?: { game: string; data: { retired?: boolean; won?: boolean } }[];
    };
    return (book.games ?? [])
      .filter((g) => g.game === id)
      .map((g) => ({ retired: g.data.retired, won: g.data.won }));
  }, game);
  expect(games).toEqual([{ retired: true, won: false }]);
}
