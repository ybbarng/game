import {
  type BrowserContext,
  expect,
  type Page,
  SAVE_SCREENSHOTS,
} from "./test";

/**
 * 큐브 화면 시험이 함께 쓰는 것.
 *
 * `no3d`: 「3D 끄기」. 3D를 못 그리는 기기와 같은 길(펼친 그림)로 화면을 띄운다(`src/cube/view/index.ts`
 * `loadCubeView`). GPU 없는 CI는 three.js 장면 하나를 만들고 첫 그림을 그리는 데 몇 초씩 쓰고, 그동안 화면
 * 스레드가 막혀 키 입력·단계 넘김까지 늦어졌다. 소프트웨어 그리기는 CPU를 여럿 써서 같은 기계에서 함께 도는
 * 다른 시험까지 느려졌다(2026-11-04 #1, 배우기 시험 하나가 26~30초, 3D가 없는 핑거 트릭도 15초).
 * 3D 그림 자체를 보지 않는 큐브 시험은 모두 이것을 부르고 시작한다. 3D 그림이 수를 따라가는지는 cube-lab,
 * 3D 위 밀기는 cube-home의 휴대폰 시험이 3D를 켜고 본다.
 */
export async function no3d(
  target: Pick<Page | BrowserContext, "addInitScript">,
): Promise<void> {
  await target.addInitScript(() => {
    (window as { __cubeNo3d?: boolean }).__cubeNo3d = true;
  });
}

/** 키 배치를 「표기」로(R = R, Shift+R = R', 두 번 = R2) */
export async function useNotationKeys(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "cube.keymap.v1",
      JSON.stringify({
        version: 1,
        preset: "notation",
        bindings: [],
        mouseRotate: false,
      }),
    );
  });
}

/** 공식 글 → 「표기」 배치 키 */
export function keysFor(alg: string): string[] {
  const keys: string[] = [];
  for (const token of alg.trim().split(/\s+/)) {
    const code = `Key${(token[0] as string).toUpperCase()}`;
    if (token.includes("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(`Shift+${code}`);
    else keys.push(code);
  }
  return keys;
}

/** 키 입력 준비(3D 그림과 따로 붙는다) */
export const inputReady = (page: Page) =>
  expect(page.locator("[data-cube-stage][data-input-ready]")).toBeVisible();

/** 사람이 보는 스크린샷(CI는 찍지 않는다) */
export async function shot(
  page: Page,
  name: string,
  project: string,
): Promise<void> {
  if (!SAVE_SCREENSHOTS) return;
  await page.screenshot({
    path: `test-results/screens/cube-${name}-${project}.png`,
    fullPage: true,
  });
}

/** 배우기: 단계 목록에서 i번째(0부터) 단계로 바로 간다 */
export async function goStep(page: Page, i: number): Promise<void> {
  await page.locator('[aria-label="단계"] li').nth(i).locator("button").click();
  await expect(page.locator("[data-step-kind]")).toHaveAttribute(
    "data-step",
    String(i),
  );
}

/**
 * 배우기: 단계 표시에서 그 종류의 첫 단계 단추를 눌러 바로 간다. 「다음」으로 차례로 넘기면 단계마다 장면을
 * 새로 만들어 느린 기기에서 오래 걸렸다(2026-11-04 #90)
 */
export async function goToStep(page: Page, kind: string): Promise<void> {
  await page
    .locator(`[aria-label="단계"] [data-step-to="${kind}"]`)
    .first()
    .click();
  await expect(page.locator("[data-step-kind]")).toHaveAttribute(
    "data-step-kind",
    kind,
  );
}
