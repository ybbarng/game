import { goToStep } from "./cube";
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
 * | DemoCube(시연: 배우기·공식·패턴·핑거 트릭) | /cube/fingers |
 * | StillCube(배우기 글·찾기·문제 단계) | 흰 십자 단원 첫 단계 |
 * | PracticeCube(키 익히기·조작 훈련) | /cube/keys/learn |
 * | StateCube(큐브의 수학) | 방향과 짝 카드 |
 * | CubeHero(첫 화면 연출) | /cube |
 * | 거울 판(뒷면 보기, StillCube) | 조각과 만나기 「가운데 조각 세기」 |
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
  // 핑거 트릭은 첫 화면에 시연 큐브 하나만 띄운다. 배우기 단원으로 가면 정지 큐브 장면을 먼저 만들고 시연 단계로
  // 넘어가 장면을 둘 만들었다(CI 14초, 2026-11-04 game-85). 시연이 도는 것은 기다리지 않고 장면이 생겼는지만 본다
  await page.goto("/cube/fingers");
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
  await page.goto("/cube");
  await expect(page.locator("[data-cube-hero][data-hero-ready]")).toBeVisible(
    SCENE,
  );
});

test("3D: 뒷면 거울 판이 생기고, 판 칸을 눌러 뒤쪽 조각을 찾는다", async ({
  page,
}, info) => {
  await only(page, info.project.name);
  // 화면 시험만: 캔버스에서 장면을 찾아 판 칸의 화면 자리를 묻는다(cube-view `__cubeTestHooks`)
  await page.addInitScript(() => {
    (window as { __cubeTestHooks?: boolean }).__cubeTestHooks = true;
  });
  // 조각과 만나기의 「가운데 조각 세기」: 기본 설정(뒷면 보기 = 거울)이라 판 셋이 뜬다
  await page.goto("/cube/learn?lesson=333-start");
  await goToStep(page, "find");
  const canvas = page.locator(
    "[data-cube-still] [data-cube-canvas][data-cube-ready]",
  );
  await expect(canvas).toHaveAttribute("data-cube-mirror", "on", SCENE);
  await expect(page.locator("[data-cube-net-side]")).toHaveCount(0);
  await expect(page.locator("[data-step-body]")).toContainText("거울에서");
  // 뒤·왼쪽·아래 판의 가운데 칸 = 안 보이는 세 면의 가운데 조각
  const count = page.locator("[data-find-count]");
  for (const [i, panel] of ["-z", "-x", "-y"].entries()) {
    const at = await canvas.evaluate(
      (el, p) =>
        (
          el as unknown as {
            __cubeView: {
              mirrorCellClient(
                p: string,
                u: number,
                v: number,
              ): { x: number; y: number } | null;
            };
          }
        ).__cubeView.mirrorCellClient(p, 0, 0),
      panel,
    );
    expect(at).not.toBeNull();
    await page.mouse.click(at?.x ?? 0, at?.y ?? 0);
    await expect(count).toHaveAttribute("data-find-count", `${i + 1}/6`);
  }
});
