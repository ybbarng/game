import {
  CLOCK_START,
  installClock,
  no3d,
  pauseClock,
  shot,
  useNotationKeys,
} from "./cube";
import { expect, type Page, test } from "./test";

/**
 * 오늘의 섞기(/cube/daily, docs/51 2-4). 날짜 씨앗 섞기를 받아 거꾸로 쳐서 맞추면 결과와 공유 글이 나오고, 다시 들어가면
 * 「오늘 완료」이고 같은 섞기를 연습으로 푼다(기록은 그대로). 시계는 가짜 시계(`installClock`, 2026-01-01 00:00 UTC =
 * 한국 시각 1월 1일 오전 9시)라 날짜가 정해져 있다. 3D 그림은 보지 않으므로 끈다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.beforeEach(async ({ page }) => {
  await no3d(page);
  await useNotationKeys(page);
});

/** 섞기 글의 거꾸로를 「표기」 배치 키로 */
function inverseKeys(scramble: string): string[] {
  const keys: string[] = [];
  for (const token of scramble.trim().split(/\s+/).reverse()) {
    const code = `Key${token[0] as string}`;
    if (token.endsWith("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(code);
    else keys.push(`Shift+${code}`);
  }
  return keys;
}

/** 오늘의 섞기를 받아 살펴보기에 들어가고, 섞기 글을 돌려준다 */
async function receive(page: Page): Promise<string> {
  await page.locator("[data-cube-scramble-button]").click();
  await expect(page.locator("main[data-cube-phase]")).toHaveAttribute(
    "data-cube-phase",
    "inspect",
    { timeout: SCRAMBLE_TIMEOUT },
  );
  return (
    (await page
      .locator("[data-cube-scramble]")
      .getAttribute("data-cube-scramble")) ?? ""
  );
}

/** 섞기를 거꾸로 친다. 수 사이에 가짜 시계를 `gap`만큼 흘린다(시간이 0초로 나오지 않게) */
async function solve(page: Page, scramble: string, gap = 400) {
  for (const [i, k] of inverseKeys(scramble).entries()) {
    if (i > 0) await page.clock.fastForward(gap);
    await page.keyboard.press(k);
  }
  await expect(page.locator("main[data-cube-phase]")).toHaveAttribute(
    "data-cube-phase",
    "done",
  );
}

/** 큐브 칸 아래 끝이 첫 화면 안에 있다 */
async function expectStageOnScreen(page: Page) {
  const height = page.viewportSize()?.height ?? 0;
  await expect
    .poll(async () => {
      const box = await page.locator("[data-cube-stage]").boundingBox();
      return box ? box.y + box.height : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(height);
}

test(
  "오늘의 섞기: 받아 풀면 결과와 공유 글, 다시 들어가면 「오늘 완료」와 연습",
  { tag: "@no-phone-landscape" },
  async ({ page, context }, info) => {
    // 휴대폰 세로와 데스크톱으로 본다
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await installClock(page);
    // 혼자 맞추기의 갈래에서 들어간다(docs/47 16-2). 아직 안 했으니 「오늘 완료」 표시는 없다
    await page.goto("/cube/solo");
    const link = page.locator("[data-cube-daily-link]");
    await expect(link).toHaveAttribute("href", "/cube/daily");
    await expect(link).not.toHaveAttribute("data-cube-daily-done");
    await link.click();
    await expect(page).toHaveURL(/\/cube\/daily$/);
    await expect(
      page.locator("[data-cube-stage][data-input-ready]"),
    ).toBeVisible({ timeout: SCRAMBLE_TIMEOUT });
    await pauseClock(page);
    const button = page.locator("[data-cube-scramble-button]");
    await expect(button).toHaveText("오늘의 섞기 받기");
    await expect(page.locator("[data-cube-daily-done]")).toHaveCount(0);

    const text = await receive(page);
    expect(text.split(" ").length).toBeGreaterThan(10);
    const attempt = page.locator("[data-cube-daily-attempt]");
    await expect(attempt).toHaveAttribute(
      "data-cube-daily-attempt",
      "official",
    );
    // 기록 시도 중에는 다시 섞기·크기 바꾸기를 막는다
    await expect(button).toBeDisabled();
    await expect(page.locator("[data-cube-size]")).toBeDisabled();
    await shot(page, "daily-inspect", info.project.name);

    await solve(page, text);
    await expect(page.locator("[data-cube-result]")).toHaveAttribute(
      "data-cube-result",
      "solved",
    );
    await expect(page.locator("[data-cube-practice]")).toHaveCount(0);
    await expect(page.locator("[data-cube-splits]")).toBeVisible();
    await expect(page.locator("[data-cube-daily-done]")).toBeVisible();
    await expect(page.locator("[data-cube-streak]")).toHaveAttribute(
      "data-cube-streak",
      "1",
    );
    // 공유 글: 날짜·크기·시간·구간 칩 모양, 섞기는 없다. 견줄 옛 기록이 없어 칩은 모두 ⬜
    const share = page.locator("[data-cube-share]:visible").first();
    const shareText = (await share.getAttribute("data-cube-share")) ?? "";
    const lines = shareText.split("\n");
    expect(lines[0]).toBe("큐브 맞추기 오늘의 섞기 01/01 3×3");
    expect(lines[1]).toMatch(/^\d+\.\d\d초 ⬜+$/);
    expect(lines.at(-1)).toBe("https://game.byb.kr/cube/daily");
    expect(shareText).not.toContain(text);
    await share.click();
    await expect(share).toHaveAttribute("data-cube-copied", "yes");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      shareText,
    );
    if (info.project.name === "desktop") await expectStageOnScreen(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await shot(page, "daily-done", info.project.name);

    // 다시 들어가면: 혼자 맞추기 갈래에 「오늘 완료」
    await page.goto("/cube/solo");
    await expect(page.locator("[data-cube-daily-link]")).toHaveAttribute(
      "data-cube-daily-done",
      "",
    );
    // 기록 시도는 혼자 맞추기 기록에도 하나 들어갔다
    await expect(page.locator("[data-cube-records] li")).toHaveCount(1);
    await page.locator("[data-cube-daily-link]").click();
    await expect(
      page.locator("[data-cube-stage][data-input-ready]"),
    ).toBeVisible({ timeout: SCRAMBLE_TIMEOUT });
    // 앞에서 시계를 10분 뒤에 멈췄으니 그보다 뒤로 다시 멈춘다(같은 날, 한국 시각 오전 9시 20분)
    await page.clock.pauseAt(CLOCK_START + 20 * 60_000);
    await expect(page.locator("[data-cube-daily-done]")).toBeVisible();
    await expect(button).toHaveText("연습으로 다시");
    await expect(
      page.locator("[data-cube-daily-panel] [data-cube-share]"),
    ).toHaveAttribute("data-cube-share", shareText);
    await shot(page, "daily-again", info.project.name);

    // 연습: 같은 섞기, 결과에 「연습」, 오늘 기록·공유 글은 그대로
    const again = await receive(page);
    expect(again).toBe(text);
    await expect(attempt).toHaveAttribute(
      "data-cube-daily-attempt",
      "practice",
    );
    await expect(button).toBeEnabled();
    await solve(page, again, 200);
    await expect(page.locator("[data-cube-practice]")).toBeVisible();
    await expect(
      page.locator("[data-cube-daily-panel] [data-cube-share]"),
    ).toHaveAttribute("data-cube-share", shareText);
    await expect(page.locator("[data-cube-streak]")).toHaveAttribute(
      "data-cube-streak",
      "1",
    );
    const stored = await page.evaluate(() => {
      const daily = JSON.parse(localStorage.getItem("cube.daily.v1") ?? "{}");
      const records = JSON.parse(
        localStorage.getItem("cube.records.v1") ?? "{}",
      );
      return {
        days: (daily.entries ?? []).length,
        solo: (records["solo-3"] ?? []).length,
      };
    });
    expect(stored).toEqual({ days: 1, solo: 1 });
    if (info.project.name === "desktop") await expectStageOnScreen(page);
    await shot(page, "daily-practice", info.project.name);
  },
);
