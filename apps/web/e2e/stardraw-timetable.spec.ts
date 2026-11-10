import { expect, fixStardrawClock, test } from "./test";

test.beforeEach(({ page }) => fixStardrawClock(page));

test(
  "관측 시간표: 지금 회차부터 확정 회차와 예정 회차를 가르고 안내 문구를 둔다",
  { tag: "@no-phone-landscape" },
  async ({ page }, info) => {
    // 데스크톱·휴대폰 세로로
    await page.goto("/stardraw/timetable");
    const table = page.getByRole("region", { name: "관측 시간표" });
    await expect(table).toBeVisible();

    // 맨 위는 지금 예측받는 회차
    const first = table.locator("[data-timetable-round]").first();
    await expect(first).toHaveAttribute("data-state", "open");
    await expect(first).toContainText("예측 접수 중");
    // 지금 선은 지금 회차 막대에만 있다
    await expect(table.locator("[data-timeline-now]")).toHaveCount(1);
    await expect(first.locator("[data-timeline-now]")).toBeVisible();
    // 확정 회차 뒤에 안내 문구, 그 아래는 예정 회차
    const planned = table.locator("[data-timetable-planned]");
    await expect(planned).toHaveText(
      "이후 일정은 우주국 사정에 따라 변경될 수 있습니다.",
    );
    const from = Number(await planned.getAttribute("data-timetable-planned"));
    await expect(
      table.locator(`[data-timetable-round='${from}']`),
    ).toHaveAttribute("data-fixed", "0");
    await expect(
      table.locator(`[data-timetable-round='${from - 1}']`),
    ).toHaveAttribute("data-fixed", "1");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: info.outputPath("stardraw-timetable.png"),
      fullPage: true,
    });

    // 첫 화면 탭이 켜져 있다
    await expect(page.locator("nav [data-tab='home']")).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
);
