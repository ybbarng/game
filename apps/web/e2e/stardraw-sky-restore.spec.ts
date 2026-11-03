import { expect, test } from "./test";

/**
 * 안드로이드 크롬은 탭이 뒤로 가면 캔버스 그림 메모리를 버리고(contextlost) 돌아오면 비운 채 되살린다(contextrestored).
 * 버려진 동안 흰 바탕·깨진 그림 표시가 보이던 일(2026-11-03 사용자): 그동안 캔버스를 숨기고, 되살아나면 다시 그린다
 */
test("밤하늘 캔버스가 버려졌다 되살아나면 숨겼다가 다시 그려 보인다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "캔버스 동작은 화면 크기와 무관");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/stardraw");
  const sky = page.locator("canvas[data-sky]").first();
  await expect(sky).toBeAttached();
  const painted = () =>
    sky.evaluate((c: HTMLCanvasElement) => {
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      const { data } = g.getImageData(0, 0, c.width, c.height);
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
      return false;
    });
  await expect.poll(painted).toBe(true);

  // 버려지면 숨는다(감싸는 칸의 밤하늘 색이 보인다)
  await sky.evaluate((c: HTMLCanvasElement) =>
    c.dispatchEvent(new Event("contextlost", { cancelable: true })),
  );
  await expect(sky).toHaveCSS("visibility", "hidden");

  // 브라우저가 비운 채 되살린다 → 다시 그려 보인다(움직이지 않는 하늘도)
  await sky.evaluate((c: HTMLCanvasElement) => {
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    c.dispatchEvent(new Event("contextrestored"));
  });
  await expect(sky).toHaveCSS("visibility", "visible");
  expect(await painted()).toBe(true);
});
