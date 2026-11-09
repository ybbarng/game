import { readFileSync } from "node:fs";

import { latestCubie } from "../src/cubie/appcast";
import { expect, test } from "./test";

/**
 * 맥 앱 Cubie 내려받기 주소(/cubie/download, README가 적어 두는 주소). 들어오면 appcast 맨 위 판의 zip으로
 * 넘어간다. GitHub에는 나가지 않게 그 주소를 가로채 zip처럼(첨부 파일로) 돌려주고, 받기가 시작된 주소를 본다.
 */
test("appcast 맨 위 판의 zip을 내려받는다", async ({ page }, info) => {
  test.skip(
    info.project.name !== "desktop",
    "주소 넘기기는 화면 크기와 상관없다",
  );
  const latest = latestCubie(
    readFileSync(
      new URL("../public/cubie/appcast.xml", import.meta.url),
      "utf8",
    ),
  );
  await page.route("https://github.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/zip",
      headers: { "Content-Disposition": 'attachment; filename="Cubie.zip"' },
      body: "zip",
    }),
  );
  const download = page.waitForEvent("download");
  await page.goto("/cubie/download");
  expect((await download).url()).toBe(latest.url);
  // 넘어가지 않을 때 누를 링크도 같은 판
  await expect(page.locator("[data-cubie-zip]")).toHaveAttribute(
    "href",
    latest.url,
  );
  await expect(page.locator("main")).toHaveAttribute(
    "data-cubie-download",
    latest.version,
  );
});
