import { expect, type Page, test } from "./test";

/**
 * 3D 길 확인(2026-11-04, #1 느린 시험 줄이기와 함께). 다른 큐브 화면 시험은 시간을 아끼려고 「3D 끄기」(e2e/cube.ts
 * `no3d`)로 펼친 그림 길을 탄다. 그러면 3D 그림이 깨져도 그 시험들은 모두 통과하므로, 3D를 띄우는 부품마다 하나씩
 * 3D를 켠 채로 장면이 만들어지는지(`data-cube-ready`/`data-hero-ready`) 여기서 본다. 장면 하나만 띄우고 끝낸다
 * (GPU 없는 CI는 장면 하나에 몇 초 걸린다). 친 수를 따라 그리는지는 cube-lab, 손가락 밀기는 cube-home이 본다.
 *
 * | 부품 | 화면 |
 * |---|---|
 * | CubePlay(혼자·해 보기·훈련·대결·패턴 만들어 보기·십자 훈련) | /cube/solo |
 * | DemoCube(시연: 배우기·공식·패턴·핑거 트릭) | 표기 단원의 시연 단계 |
 * | StillCube(배우기 글·찾기·문제 단계) | 흰 십자 단원 첫 단계 |
 * | PracticeCube(키 익히기·조작 훈련) | /cube/keys/learn |
 * | StateCube(큐브의 수학) | 방향과 짝 카드 |
 * | CubeHero(첫 화면 연출) | /cube |
 */

/** GPU 없는 CI는 첫 장면에 5초 넘게 걸린다(멈춘 시험을 잡는 상한) */
const SCENE = { timeout: 30_000 };

async function only(page: Page, project: string) {
  // 부품의 3D 길은 화면 크기와 상관없어 데스크톱 하나로 본다
  test.skip(project !== "desktop", "3D 길은 데스크톱 하나로");
  await page.addInitScript(() =>
    sessionStorage.setItem("mighty-splash-seen", "1"),
  );
}

test("3D: 혼자 맞추기 큐브(CubePlay)", async ({ page }, info) => {
  await only(page, info.project.name);
  await page.goto("/cube/solo");
  await expect(
    page.locator("[data-cube-stage] [data-cube-canvas][data-cube-ready]"),
  ).toBeVisible(SCENE);
});

test("3D: 시연 큐브(DemoCube)", async ({ page }, info) => {
  await only(page, info.project.name);
  await page.goto("/cube/learn?lesson=333-notation");
  await page
    .locator('[aria-label="단계"] [data-step-to="demo"]')
    .first()
    .click();
  await expect(
    page.locator("[data-cube-demo] [data-cube-canvas][data-cube-ready]"),
  ).toBeVisible(SCENE);
});

test("3D: 정지 큐브(StillCube)", async ({ page }, info) => {
  await only(page, info.project.name);
  await page.goto("/cube/learn?lesson=333-white-cross");
  await expect(page.locator("[data-cube-still] [data-cube-ready]")).toHaveCount(
    1,
    SCENE,
  );
});

test("3D: 연습 큐브(PracticeCube)", async ({ page }, info) => {
  await only(page, info.project.name);
  await page.goto("/cube/keys/learn");
  await expect(
    page.locator("[data-practice-cube] [data-cube-ready]"),
  ).toHaveCount(1, SCENE);
});

test("3D: 수학 큐브(StateCube)", async ({ page }, info) => {
  await only(page, info.project.name);
  await page.goto("/cube/math#orient");
  await expect(page.locator("[data-cube-math='orient']")).toBeVisible();
  await expect(
    page.locator("[data-cube-math='orient'] [data-cube-ready]"),
  ).toHaveCount(1, SCENE);
});

test("3D: 첫 화면 연출(CubeHero)", async ({ page }, info) => {
  await only(page, info.project.name);
  // 시험 기본은 움직임 줄이기라 연출을 끈다. 여기서만 켠다
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // 3D가 준비된 순간에 대기 그림이 아직 있었는지(겹쳐 바꾸기) 적어 둔다
  await page.addInitScript(() => {
    const w = window as { __posterAtReady?: boolean };
    new MutationObserver(() => {
      if (w.__posterAtReady !== undefined) return;
      if (document.querySelector("[data-cube-hero][data-hero-ready]"))
        w.__posterAtReady =
          document.querySelector("[data-cube-hero] [data-hero-poster]") !==
          null;
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
  await page.goto("/cube");
  await expect(page.locator("[data-cube-hero][data-hero-ready]")).toBeVisible(
    SCENE,
  );
  // 3D가 다 나타나면 대기 그림을 치운다
  await expect(page.locator("[data-cube-hero][data-hero-shown]")).toBeVisible();
  await expect(page.locator("[data-cube-hero] [data-hero-poster]")).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => (window as { __posterAtReady?: boolean }).__posterAtReady,
    ),
  ).toBe(true);
});
