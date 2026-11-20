import { BROWSER } from "./browser";
import { no3d } from "./cube";
import { expect, test } from "./test";

/**
 * 스크롤 막대가 내용 폭을 차지하는 브라우저에서 Cubie 기록 창(/cube/mini?view=records). macOS 「스크롤 막대 보기: 항상」이나
 * 마우스를 이은 맥과 같은 꼴이다. Playwright는 헤드리스 Chrome에 `--hide-scrollbars`를 넘겨 막대를 숨기므로 이 파일만 그
 * 인자를 빼고 띄운다(샌드박스 등 나머지는 e2e/browser.ts 그대로. 이 설정은 파일 맨 위에만 둘 수 있어 따로 둔다)
 */
test.use({
  launchOptions: {
    ...BROWSER.launchOptions,
    ignoreDefaultArgs: ["--hide-scrollbars"],
  },
});

test.beforeEach(async ({ page }) => {
  await no3d(page);
});

test("앱이 따로 여는 기록 창: 판이 많아 스크롤 막대가 내용 폭을 차지해도 「다시 보기」가 막대 앞에서 한 줄로 다 보인다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 2026-11-20 앱 기록 창에서 「다시 보기」가 막대에 가려 「다시 보」까지만 보였다. 꾸민 막대는 겹치지 않고 폭을 차지하므로
  // 처음 그리기 전에 넣는다
  await page.addInitScript(() => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      at: Date.UTC(2026, 10, 12, 1, i),
      n: 3,
      mode: "solo",
      ms: 19_000 + ((i * 1_733) % 9_000),
      penalty: 0,
      moves: 60,
      scramble: "R U",
      replay: "U'@0 R'@300",
      no: 20 - i,
    }));
    localStorage.setItem(
      "cube.mini.v1",
      JSON.stringify({
        version: 1,
        n: 3,
        mirror: true,
        records: { "3": records },
      }),
    );
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "::-webkit-scrollbar{width:15px;background:#2a2a2a}";
      document.head.appendChild(s);
    });
  });
  // 처음 너비 380과 가장 작은 320(앱 `SheetSize.records`)
  for (const width of [380, 320]) {
    await page.setViewportSize({ width, height: 600 });
    await page.goto("/cube/mini?view=records");
    await expect(page.locator("[data-mini-replay-open]")).toHaveCount(20);
    const got = await page.evaluate(() => {
      const ol = document.querySelector("[data-mini-record]")
        ?.parentElement as HTMLElement;
      const box = ol.getBoundingClientRect();
      const contentRight = box.left + ol.clientLeft + ol.clientWidth;
      const bad = [...document.querySelectorAll("[data-mini-replay-open]")]
        .map((b) => {
          const r = b.getBoundingClientRect();
          const li = (b.closest("li") as HTMLElement).getBoundingClientRect();
          return { right: r.right, top: r.top - li.top };
        })
        // 막대 밑으로 들어가거나 줄이 넘쳐 둘째 줄로 떨어진 단추
        .filter((b) => b.right > contentRight + 0.5 || b.top > 6);
      return { scrollbar: ol.offsetWidth - ol.clientWidth, bad: bad.length };
    });
    expect(got.scrollbar, `${width}px 막대 폭`).toBe(15);
    expect(got.bad, `${width}px 잘리거나 떨어진 「다시 보기」`).toBe(0);
  }
});
