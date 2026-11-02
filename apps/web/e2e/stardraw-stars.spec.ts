import { expect, test } from "./test";

test("별 이야기: 실제 하늘에서 예측판으로 펴 보기", async ({ page }, info) => {
  test.skip(info.project.name === "phone-landscape", "데스크톱·휴대폰 세로로");
  await page.goto("/stardraw/stars");
  await expect(
    page.getByRole("heading", { name: "별 이야기", level: 1 }),
  ).toBeVisible();
  const morph = page.locator("[data-board-morph]");
  await expect(morph.locator("[data-morph-stage='실제 하늘']")).toBeVisible();
  // 실제 하늘에서 오리온 허리띠 20·37번은 거의 겹친다
  const gap = async () =>
    page.evaluate(() => {
      const at = (n: number) => {
        const c = document.querySelector(
          `[data-morph-star='${n}'] circle:last-of-type`,
        ) as SVGCircleElement;
        return [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))];
      };
      const [a, b] = [at(20), at(37)];
      return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0));
    });
  expect(await gap()).toBeLessThan(0.01);
  await morph.screenshot({ path: info.outputPath("stars-morph-real.png") });

  // 막대 가운데: 옮기는 중
  await morph.locator("[data-morph-range]").fill("500");
  await expect(morph.locator("[data-morph-stage='옮기는 중']")).toBeVisible();
  await morph.screenshot({ path: info.outputPath("stars-morph-mid.png") });

  // 끝까지 밀면 예측판(움직임 줄이기면 「펴 보기」가 바로 끝 자리로)
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await morph.locator("[data-morph-play]").click();
  await expect(morph.locator("[data-morph-stage='예측판']")).toBeVisible();
  expect(await gap()).toBeGreaterThan(0.05);
  await morph.screenshot({ path: info.outputPath("stars-morph-board.png") });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: info.outputPath("stars-page.png"),
    fullPage: true,
  });
});
