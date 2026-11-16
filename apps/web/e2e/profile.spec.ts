import { NO_PHONE_LANDSCAPE } from "./projects";
import { expect, type Page, test } from "./test";

/*
 * 내 기록: 기간 고르기, 같이 한 사람, 업적. 판을 실제로 두지 않고 이 기기 기록(localStorage)을 미리 넣는다.
 * 시계는 고정한다(기간 판단이 실제 날짜에 따라 달라지지 않게).
 */

const NOW = new Date("2026-11-17T06:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function omokRound(
  i: number,
  outcome: "win" | "loss",
  at: number,
  online: boolean,
) {
  const key = online ? "online:room1" : "solo:9";
  return {
    id: `${key}:${i}`,
    game: "omok",
    at,
    mode: online ? "online" : "solo",
    ...(online ? { with: ["철수"] } : {}),
    data: { stone: "black", outcome, by: "five", moves: 41 },
  };
}

/** 최근 사흘 친구(철수)와 다섯 판을 내리 이기고, 두 달 전 혼자 두 판을 졌다. 장기는 두 달 전 한 판 */
const BOOK = {
  version: 1,
  since: NOW.getTime() - 60 * DAY,
  rounds: [
    omokRound(1, "loss", NOW.getTime() - 60 * DAY, false),
    omokRound(2, "loss", NOW.getTime() - 60 * DAY + 60_000, false),
    ...[1, 2, 3, 4, 5].map((i) =>
      omokRound(i, "win", NOW.getTime() - 3 * DAY + i * 60_000, true),
    ),
    {
      id: "solo:4:1",
      game: "janggi",
      at: NOW.getTime() - 60 * DAY,
      mode: "solo",
      data: { side: "cho", outcome: "win", by: "checkmate", moves: 80 },
    },
  ],
  games: [],
};

async function openProfile(page: Page, game: string) {
  await page.clock.install({ time: NOW });
  await page.addInitScript((book) => {
    localStorage.setItem("mighty-stats", JSON.stringify(book));
  }, BOOK);
  await page.goto(`/profile?game=${game}`);
}

test(
  "내 기록: 기간을 고르면 그 기간 판만 세고, 같이 한 사람과 업적이 보인다",
  { tag: NO_PHONE_LANDSCAPE },
  async ({ page }, info) => {
    await openProfile(page, "omok");
    const period = page.getByRole("group", { name: "기간" });
    await expect(period.getByRole("button", { name: "전체" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("5승 2패 0무")).toBeVisible();

    // 업적은 기간과 상관없이 모든 기록으로: 첫 승·3연승·5연승·친구와 첫 승
    await expect(page.getByRole("heading", { name: "업적 4/9" })).toBeVisible();
    for (const id of ["first-win", "streak-3", "streak-5", "online-win"])
      await expect(page.locator(`[data-achievement="${id}"]`)).toHaveAttribute(
        "data-earned",
        "true",
      );
    await expect(
      page.locator('[data-achievement="streak-10"]'),
    ).toHaveAttribute("data-earned", "false");

    const people = page.getByRole("list", { name: "같이 한 사람" });
    await expect(people.getByRole("listitem")).toHaveCount(1);
    await expect(people).toContainText("철수");
    await expect(people).toContainText("5판 · 5승 0패");
    await expect(people).toContainText("100%");

    await period.getByRole("button", { name: "최근 7일" }).click();
    await expect(
      period.getByRole("button", { name: "최근 7일" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("5승 0패 0무")).toBeVisible();
    await expect(page.getByRole("heading", { name: "업적 4/9" })).toBeVisible();
    await page.screenshot({
      path: info.outputPath("profile-week.png"),
      fullPage: true,
    });

    // 장기는 두 달 전 기록뿐이라 최근 7일에는 비어 있다. 업적은 그대로 보인다.
    await page.getByRole("tab", { name: "楚 장기" }).click();
    await expect(page.getByText("이 기간에는 기록이 없습니다.")).toBeVisible();
    await expect(
      page.locator('[data-achievement="checkmate"]'),
    ).toHaveAttribute("data-earned", "true");
    await expect(page.getByRole("list", { name: "같이 한 사람" })).toHaveCount(
      0,
    );
    await period.getByRole("button", { name: "전체" }).click();
    await expect(page.getByText("1승 0패")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  },
);
