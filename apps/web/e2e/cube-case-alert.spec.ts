import { applyAlgorithm, solve3x3, solvedFacelets } from "@game/cube-solver";

import {
  installClock,
  keysFor,
  no3d,
  pauseClock,
  shot,
  useNotationKeys,
} from "./cube";
import { expect, test } from "./test";

/**
 * 혼자 맞추기 「상황 알림」(설정 「혼자 맞추기 상황 알림(내 목록)」, docs/47 8-1). 내 목록(버릇 들이는 중)에 PLL T를
 * 두고, 섞인 큐브에서 「F2L은 맞고 윗면만 T 퍼뮤」 상태로 가는 수를 친다. 그 상태에 이르면 큐브 구석에 상황 이름과
 * 쓰는 공식이 뜨고, T 공식으로 마저 맞추면 결과에 「만난 내 상황」이 남는다.
 *
 * 가는 수는 3×3 해법기로 구한다: 맞춘 큐브에 T 공식(흰 면이 위라 노란 면이 아래, 그래서 z2로 옮긴 것) → 섞기를 둔
 * 상태를 풀면, 그 해를 섞인 큐브에 치는 것이 곧 「T 공식의 거꾸로를 둔 큐브」로 가는 길이다. 섞기의 거꾸로를 먼저
 * 치면 중간에 맞춘 큐브를 지나 판이 끝나므로 이렇게 한다.
 */

const SCRAMBLE_TIMEOUT = 60_000;
/** PLL T 대표 공식(learn 자료의 pll-t 첫 공식)을 z2로 옮긴 것: 흰 면 위로 쥔 채 노란 면(아래)에서 T 퍼뮤 */
const T_ON_YELLOW = "L D L' D' L' F L2 D' L' D' L D L' F'";

test.beforeEach(async ({ page }) => {
  await no3d(page);
  await useNotationKeys(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "cube.settings.v1",
      JSON.stringify({ version: 1, caseAlert: true }),
    );
    localStorage.setItem(
      "cube.algs.v1",
      JSON.stringify({ "pll-t": { mine: [], habit: "learning" } }),
    );
  });
});

test(
  "상황 알림: 내 목록 상황에 이르면 구석에 이름과 공식이 뜨고, 기록에 만난 상황이 남는다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    await installClock(page);
    await page.goto("/cube/solo");
    const main = page.locator("main[data-cube-phase]");
    await expect(
      page.locator("[data-cube-stage][data-input-ready]"),
    ).toBeVisible({ timeout: SCRAMBLE_TIMEOUT });
    await pauseClock(page);

    await page.locator("[data-cube-scramble-button]").click();
    await expect(main).toHaveAttribute("data-cube-phase", "inspect", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const scramble =
      (await page
        .locator("[data-cube-scramble]")
        .getAttribute("data-cube-scramble")) ?? "";
    const toCase = solve3x3(
      applyAlgorithm(solvedFacelets(3), `${T_ON_YELLOW} ${scramble}`),
    );
    const keys = keysFor(toCase);
    expect(keys.length).toBeGreaterThan(0);

    // 살펴보기 중에는 알림이 없다
    const alert = page.locator("[data-case-alert]");
    await expect(alert).toHaveCount(0);

    for (const k of keys) await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-cube-phase", "solving");
    await expect(alert).toHaveAttribute("data-case-alert", "pll-t");
    await expect(alert).toContainText("T 퍼뮤");
    await shot(page, "case-alert", info.project.name);
    // 큐브 그림 구석: 무대 안에 들고(키 그림 위에 겹치지 않는다), 왼쪽 아래에 붙는다
    // 칸 크기는 화면 높이에 맞춰 한 번 더 바뀔 수 있어(`fitViewport`) 자리가 맞을 때까지 기다린다
    const stage = page.locator("[data-cube-stage]");
    await expect
      .poll(async () => {
        const s = await stage.boundingBox();
        const b = await alert.boundingBox();
        if (!s || !b) return "없음";
        const inside =
          b.x >= s.x &&
          b.y >= s.y &&
          b.x + b.width <= s.x + s.width &&
          b.y + b.height <= s.y + s.height;
        const corner = b.x - s.x < s.width / 2 && b.y - s.y > s.height / 2;
        return `${inside ? "안" : "밖"}·${corner ? "왼쪽 아래" : "다른 곳"}`;
      })
      .toBe("안·왼쪽 아래");

    // T 공식으로 마저 맞추면 알림이 사라지고 결과에 만난 상황이 남는다
    for (const k of keysFor(T_ON_YELLOW)) await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-cube-phase", "done");
    await expect(alert).toHaveCount(0);
    await expect(page.locator("[data-cube-met]")).toHaveAttribute(
      "data-cube-met",
      "pll-t",
    );
    const saved = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("cube.records.v1") ?? "{}")[
          "solo-3"
        ][0],
    );
    expect(saved.myCases).toEqual(["pll-t"]);
    await shot(page, "case-alert-done", info.project.name);
  },
);
