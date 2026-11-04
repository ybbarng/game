import { mkdirSync, writeFileSync } from "node:fs";

import { no3d, useBackView } from "./cube";
import { expect, type Page, SAVE_SCREENSHOTS, test } from "./test";

/**
 * 큐브 맞추기를 게임 목록에 올린 것(docs/47 12절 C8): 첫 화면 목록에서 /cube로 가고, 처음 오셨나요 안내로
 * 이어진다. 휴대폰은 큐브를 밀어서 돌린다(밀기 계산은 view/swipe.test.ts가 보고, 여기서는 화면에서 수가
 * 들어가는지만 본다).
 *
 * 사람이 보는 스크린샷을 찍지 않을 때(CI)는 3D를 끈다(`no3d`): 판정은 펼친 그림과 링크로 하고, 3D 첫 화면 연출은
 * 스크린샷에만 쓴다. 밀기 시험은 3D 위를 미는 것이라 켠다.
 */

/** 스크린샷을 찍지 않으면 3D를 끈다(스크린샷은 3D 연출이 돈 뒤에 찍는다) */
async function no3dUnlessShots(page: Page) {
  if (!SAVE_SCREENSHOTS) await no3d(page);
}

async function shot(page: Page, name: string, project: string) {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

/** 3D 연출이 떠서 나타나는 전환까지 끝났을 때(스크린샷용. GPU 없는 브라우저는 첫 그림이 느려 상한을 넉넉히) */
async function heroShown(page: Page) {
  const canvas = page.locator("[data-cube-hero][data-hero-ready] canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => canvas.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
}

test("게임 목록의 큐브 맞추기에서 큐브 첫 화면과 안내로 간다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "배치가 세로 휴대폰과 같다",
  );
  await no3dUnlessShots(page);
  // 3D를 켠 로컬 스크린샷에서도 펼친 그림 칸을 누른다(기본 뒷면 보기는 거울)
  await useBackView(page, "net");
  await page.addInitScript(() =>
    sessionStorage.setItem("mighty-splash-seen", "1"),
  );
  await page.goto("/");
  const link = page.getByRole("link", { name: /큐브 맞추기/ });
  await expect(link).toHaveAttribute("href", "/cube");
  await shot(page, "center-home", info.project.name);

  await link.click();
  await expect(page).toHaveURL(/\/cube$/);
  await expect(
    page.getByRole("heading", { name: "큐브 맞추기" }),
  ).toBeVisible();
  // 메뉴는 묶음 여섯(맞추기·대결·배우기·연습·더 알아보기·실물 큐브)과 설정. 항목은 이름만
  const groups = page.locator("[data-cube-group]");
  await expect(groups).toHaveCount(6);
  expect(
    await groups.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-cube-group")),
    ),
  ).toEqual(["맞추기", "대결", "배우기", "연습", "더 알아보기", "실물 큐브"]);
  // 처음 온 사람: 강조는 배우기 첫 칸 「처음이라면」 하나
  await expect(
    page.locator("[data-cube-group='배우기'] a").first(),
  ).toHaveAttribute("data-cube-intro-link", "");
  await expect(page.locator("[data-cube-continue]")).toHaveCount(0);
  // 묶음마다 2열이 빈칸 없이 찬다(칸 너비 합이 줄 수 × 2)
  for (const cols of await groups.evaluateAll((els) =>
    els.map((g) =>
      [...g.querySelectorAll("a")].reduce(
        (n, a) => n + (a.classList.contains("col-span-2") ? 2 : 1),
        0,
      ),
    ),
  ))
    expect(cols % 2).toBe(0);
  await expect(
    page.locator("[data-cube-group='대결'] a").first(),
  ).toHaveAttribute("href", "/cube/online");
  await expect(page.getByRole("link", { name: "설정" })).toHaveAttribute(
    "href",
    "/cube/settings",
  );
  // 위 그림: 시험은 움직임 줄이기라 연출 없이 대기 그림(3D 첫 장면을 찍은 이미지)만(3D를 띄우지도 기다리지도 않는다)
  const poster = page.locator(
    "[data-cube-hero] img[data-hero-poster='image'][data-hero-poster-ready]",
  );
  await expect(poster).toBeVisible();
  expect(
    await poster.evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  // 이미지가 뜨면 받는 동안 대신 보이던 SVG는 치운다
  await expect(
    page.locator("[data-cube-hero] [data-hero-poster='svg']"),
  ).toHaveCount(0);
  await expect(page.locator("[data-cube-hero] canvas")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  if (SAVE_SCREENSHOTS) {
    // 사람이 보는 스크린샷은 연출을 켜고 3D가 돌기 시작한 뒤에(GPU 없는 브라우저는 첫 그림이 느려 상한을 넉넉히)
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await heroShown(page);
    await expect(page.locator("[data-cube-hero][data-hero-ready]")).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(page.locator("[data-hero-label]")).not.toHaveAttribute(
      "data-hero-label",
      "",
    );
  }
  await shot(page, "cube-home", info.project.name);

  await page.locator("[data-cube-intro-link]").click();
  const intro = page.locator("[data-cube-intro]");
  await expect(intro).toHaveAttribute("data-cube-intro", "words");
  // 세 가지 말: 공식을 고르면 통과
  const next = page.locator("[data-intro-next]");
  await expect(next).toHaveText("건너뛰기");
  await page.locator("[data-intro-quiz] [data-choice='1']").click();
  await expect(next).toHaveText("다음");
  await next.click();
  // 면 여섯: R U F L D B 차례로 그 면의 칸을 누른다(펼친 그림의 면 가운데)
  await expect(intro).toHaveAttribute("data-cube-intro", "faces");
  const ask = page.locator("[data-intro-face]");
  await page.locator('[data-net-cell="4"]').click();
  await expect(ask).toContainText("그건 위 면이에요");
  for (const [letter, cell] of [
    ["R", 13],
    ["U", 4],
    ["F", 22],
    ["L", 40],
    ["D", 31],
    ["B", 49],
  ] as const) {
    await expect(ask).toHaveAttribute("data-intro-face", letter);
    await page.locator(`[data-net-cell="${cell}"]`).click();
  }
  await expect(ask).toHaveAttribute("data-intro-face", "done");
  await shot(page, "intro-faces", info.project.name);

  // 키 배치: 「외우기 쉬운 표기」를 고르면 설정에 남고 그 규칙을 보인다
  await page
    .getByRole("navigation", { name: "안내 차례" })
    .getByText("키 배치")
    .click();
  await expect(intro).toHaveAttribute("data-cube-intro", "layout");
  await expect(page.locator('[data-layout-rule="twoHand"]')).toBeVisible();
  await page.locator('[data-layout-pick="notation"]').click();
  await expect(page.locator('[data-layout-rule="notation"]')).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("cube.keymap.v1")),
  ).toContain('"notation"');
  await shot(page, "intro-layout", info.project.name);
  if (info.project.name === "desktop" && SAVE_SCREENSHOTS) {
    // 아이콘과 공유 그림(사람이 보는 용도). 그림 주소는 화면이 아니라(준비 표시가 없다) 파일로 받아 둔다
    for (const [url, file] of [
      ["/cube/icon/192.png", "cube-icon.png"],
      ["/cube/apple-icon/180.png", "cube-apple-icon.png"],
      ["/cube/opengraph-image/share.png", "cube-share.png"],
    ] as const) {
      const res = await page.request.get(url);
      expect(res.ok(), url).toBe(true);
      mkdirSync("test-results/screens", { recursive: true });
      writeFileSync(`test-results/screens/${file}`, await res.body());
    }
  }
});

test("첫 화면 큐브: 대기 이미지를 못 받으면 깨진 이미지 대신 같은 각도의 SVG를 보인다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만");
  await no3d(page);
  // 창을 최소화했다 돌아와 다시 불러올 때 연결이 끊겨 있던 것처럼 이미지 받기를 실패시킨다
  // (화면 코드가 붙기 전에 실패해 onError를 놓치는 길도 함께 탄다)
  await page.route("**/cube/hero/*.webp", (route) => route.abort("failed"));
  await page.goto("/cube");
  await expect(
    page.locator("[data-cube-hero] [data-hero-poster='svg'] svg"),
  ).toBeVisible();
  await expect(
    page.locator("[data-cube-hero] img[data-hero-poster]"),
  ).toHaveCount(0);
  await shot(page, "hero-poster-failed", info.project.name);
});

test("설정의 첫 화면 큐브: 크기를 바꾸면 그 크기의 해법만 고를 수 있다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "데스크톱에서만");
  await no3dUnlessShots(page);
  // 3D를 켠 로컬 스크린샷에서도 펼친 그림 칸을 누른다(기본 뒷면 보기는 거울)
  await useBackView(page, "net");
  await page.goto("/cube/settings");
  const hero = page.locator("[data-settings-hero]");
  await hero.locator("[data-hero-method='3-cfop']").click();
  await expect(hero.locator("[data-hero-method='3-cfop']")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // 4×4로 바꾸면 3×3 해법은 없어지고 「번갈아」로
  await hero.locator("[data-hero-size='4']").click();
  await expect(hero.locator("[data-hero-method='3-cfop']")).toHaveCount(0);
  await expect(hero.locator("[data-hero-method='alternate']")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(hero.locator("[data-hero-method='4-cfop']")).toBeVisible();
  await shot(page, "settings-hero", info.project.name);

  if (SAVE_SCREENSHOTS) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/cube");
    await heroShown(page);
    await expect(page.locator("[data-cube-hero][data-hero-ready]")).toBeVisible(
      { timeout: 30_000 },
    );
    // 축소법 단계까지 보이게(풀이 계산을 기다린다)
    await expect(page.locator("[data-hero-label]")).toHaveAttribute(
      "data-hero-label",
      / · /,
      { timeout: 60_000 },
    );
    await shot(page, "cube-home-4x4", info.project.name);
  }
});

test("휴대폰: 칸 위를 밀면 그 층이 돈다", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-portrait", "휴대폰 세로에서만");
  // 큐브 전체 돌리기를 곁의 펼친 그림으로 본다(기본 뒷면 보기는 거울)
  await useBackView(page, "net");
  await page.goto("/cube/solo");
  const main = page.locator("main[data-cube-phase]");
  await expect(main).toHaveAttribute("data-cube-phase", "free");
  await expect(
    page.locator("[data-cube-stage][data-input-ready]"),
  ).toBeVisible();
  // 밀기는 3D 그림이 있어야 한다. CI의 GPU 없는 브라우저는 첫 그림에 5초 넘게 걸려 기본 상한을 넘었다
  // (멈춘 시험을 잡는 안전장치로 30초)
  const canvas = page.locator("[data-cube-canvas][data-cube-ready]");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const moves = page.locator("[data-cube-moves]");
  await expect(moves).toHaveText("0");

  // 손가락 밀기 한 번: 앞면 가운데쯤에서 위로
  await canvas.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width * 0.4;
    const y = r.top + r.height * 0.62;
    const fire = (type: string, dy: number) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 7,
          pointerType: "touch",
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          clientX: x,
          clientY: y + dy,
          bubbles: true,
        }),
      );
    fire("pointerdown", 0);
    fire("pointermove", -30);
    fire("pointermove", -60);
    fire("pointerup", -60);
  });
  await expect(moves).toHaveText("1");

  // 빈 곳(모서리)을 밀면 큐브 전체를 돌린다: 펼친 그림은 바뀌지만 수로 세지 않는다
  const net = page.locator("[data-cube-net-side] [data-cube-net]");
  const before = await net.innerHTML();
  await canvas.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width * 0.03;
    const y = r.top + r.height * 0.03;
    const fire = (type: string, dx: number) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 8,
          pointerType: "touch",
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          clientX: x + dx,
          clientY: y,
          bubbles: true,
        }),
      );
    fire("pointerdown", 0);
    fire("pointermove", 60);
    fire("pointerup", 60);
  });
  await expect
    .poll(() => net.innerHTML(), { intervals: [50] })
    .not.toBe(before);
  await expect(moves).toHaveText("1");
  await shot(page, "solo-swiped", info.project.name);
});
