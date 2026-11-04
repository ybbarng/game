import {
  goStep,
  goToStep,
  inputReady,
  keysFor,
  no3d,
  shot,
  useNotationKeys,
} from "./cube";
import { expect, test } from "./test";

/**
 * 큐브 배우기의 해 보기·시연(/cube/learn, docs/47 8절). 고르기·조각 찾기 단계는 cube-learn-acts, 훈련·핑거
 * 트릭은 cube-train이 본다(한 파일이 길어 CI 조각에 고르게 나뉘도록 나눴다, 2026-11-04).
 * 「표기」 배치로 친다(R = R, Shift+R = R', 두 번 = R2). 움직임 줄이기라 장면 회전은 바로 끝난다.
 * 3D 그림은 보지 않으므로 끄고(`no3d`) 펼친 그림으로 본다. 키 입력은 입력 준비를 기다린다.
 */

test.beforeEach(({ page }) => no3d(page));

test("배우기: 첫 해보기 단원에서 힌트를 따라 치면 통과한다", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/learn");
  await expect(page.locator("[data-course]").first()).toBeVisible();
  await shot(page, "learn-list", info.project.name);

  await page.locator('[data-lesson="333-notation"]').click();
  await expect(page.locator("main")).toHaveAttribute(
    "data-cube-learn",
    "333-notation",
  );
  // 시연 단계 하나 보기
  await goToStep(page, "demo");
  await expect(page.locator("[data-cube-demo]")).toBeVisible();
  await shot(page, "learn-demo", info.project.name);
  await goToStep(page, "try");
  await inputReady(page);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.locator("[data-cube-hint-button]").click();
  const hint = (await page
    .locator("[data-cube-hint]")
    .getAttribute("data-cube-hint")) as string;
  for (const k of keysFor(hint)) await page.keyboard.press(k);
  await expect(page.locator("[data-cube-pass]")).toBeVisible();
  await expect(page.locator("[data-cube-try]")).toHaveAttribute(
    "data-cube-passed",
    "",
  );
  await shot(page, "learn-try-passed", info.project.name);

  // 진도가 이 기기에 남는다
  await page.goto("/cube/learn");
  await expect(page.locator('[data-lesson="333-notation"]')).toContainText(
    "해보기 1/",
  );
});

/** 「두 손」 배치(기본)의 면 수 → 키캡 글(keys/move-keys.ts `keycapLabel`) */
const TWO_HAND: Record<string, string> = {
  R: "I",
  "R'": "K",
  L: "D",
  "L'": "E",
  U: "J",
  "U'": "F",
  D: "S",
  "D'": "L",
  F: "H",
  "F'": "G",
  B: "W",
  "B'": "O",
};
const twoHandCaps = (move: string) => {
  const base = TWO_HAND[move.replace(/2$/, "")] as string;
  return move.endsWith("2") ? `${base} ${base}` : base;
};

test("배우기: 「두 손」 배치면 시연·힌트·따라 하기에 그 키를 함께 보인다(R → I)", async ({
  page,
}, info) => {
  // 키 배치를 저장하지 않으면 「두 손」
  await page.goto("/cube/learn?lesson=333-notation");
  const desktop = info.project.name === "desktop";
  await goToStep(page, "demo");
  const demo = page.locator("[data-cube-demo]");
  const first = demo.locator("[data-move-chip]").first();
  const firstMove = (await first.getAttribute("data-move-chip")) as string;
  if (desktop)
    await expect(demo.locator("[data-move-keys]").first()).toHaveAttribute(
      "data-move-keys",
      twoHandCaps(firstMove),
    );
  else await expect(demo.locator("[data-move-keys]")).toHaveCount(0);
  await shot(page, "learn-keys-demo", info.project.name);

  await goToStep(page, "try");
  await inputReady(page);
  await page.locator("[data-cube-hint-button]").click();
  const hint = page.locator("[data-cube-hint]");
  const move = (await hint.getAttribute("data-cube-hint")) as string;
  if (!desktop) {
    // 휴대폰은 키캡 없이 표기만
    await expect(hint.locator("[data-move-keys]")).toHaveCount(0);
    await shot(page, "learn-keys-hint", info.project.name);
    return;
  }
  const caps = twoHandCaps(move);
  await expect(hint.locator("[data-move-keys]")).toHaveAttribute(
    "data-move-keys",
    caps,
  );
  // 키 그림에서 칠 키가 빛난다
  const code = `Key${caps.split(" ")[0]}`;
  await expect(page.locator(`[data-key="${code}"][data-key-want]`)).toHaveCount(
    1,
  );
  await shot(page, "learn-keys-hint", info.project.name);
  for (const k of caps.split(" ")) await page.keyboard.press(`Key${k}`);
  await expect(page.locator("[data-cube-pass]")).toBeVisible();

  // 따라 하기: 본문 속 수와 칠 수에도 같은 키
  await goToStep(page, "turn");
  await inputReady(page);
  const turn = page.locator('[data-act="turn"] [data-move-keys]');
  await expect(turn).toHaveCount(1);
  const turnCaps = (await turn.getAttribute("data-move-keys")) as string;
  await expect(
    page.locator("[data-step-body] [data-move-keys]").first(),
  ).toBeVisible();
  for (const k of turnCaps.split(" ")) await page.keyboard.press(`Key${k}`);
  await expect(page.locator('[data-act="turn"]')).toHaveAttribute(
    "data-act-passed",
    "",
  );
});

test("배우기: 크기별 해법 목록과 ZZ 모서리 방향 해 보기", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/learn");
  const size3 = page.locator('[data-course-size="3"]');
  await expect(size3.locator('[data-course="roux"]')).toBeVisible();
  await expect(size3.locator('[data-course="zz"]')).toBeVisible();
  await expect(
    page.locator('[data-course-size="4"] [data-course="444-yau"]'),
  ).toBeVisible();

  // ZZ 모서리 방향: 모서리만 보이는 가리기로 해 보기
  await page.locator('[data-lesson="zz-eo"]').click();
  await goToStep(page, "try");
  await inputReady(page);
  await shot(page, "learn-zz-eo", info.project.name);
});

test("배우기: 야우 모서리 묶기 시연", async ({ page }, info) => {
  await page.goto("/cube/learn?lesson=yau-edges");
  await goToStep(page, "demo");
  await expect(page.locator("[data-cube-demo]")).toBeVisible();
  await shot(page, "learn-yau-demo", info.project.name);
});

test("배우기: 루 해 보기(가운데 층 M)", async ({ page }, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/learn?lesson=roux-intro");
  await expect(page.locator("main")).toHaveAttribute(
    "data-cube-learn",
    "roux-intro",
  );
  await goToStep(page, "try");
  await inputReady(page);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  // 힌트는 한 수씩 보여 준다(M' U2 M, 세 수)
  for (let i = 0; i < 3; i++) {
    await page.locator("[data-cube-hint-button]").click();
    const hint = page.locator("[data-cube-hint]");
    await expect(hint).toHaveCount(1);
    for (const k of keysFor((await hint.getAttribute("data-cube-hint")) ?? ""))
      await page.keyboard.press(k);
  }
  await expect(page.locator("[data-cube-pass]")).toBeVisible();
  await shot(page, "learn-roux-passed", info.project.name);
});

test("배우기: 흰 십자 경우별 해 보기(가운데 줄, 옆색 쪽 면으로 올리기)", async ({
  page,
}, info) => {
  await useNotationKeys(page);
  await page.goto("/cube/learn?lesson=333-white-cross");
  // 7번: 흰색이 앞을 보는 가운데 줄 모서리를 R로 올린다
  await goStep(page, 7);
  const section = page.locator("[data-step-kind]");
  await expect(section).toHaveAttribute("data-step-kind", "try");
  await expect(section).toContainText("가운데 줄 모서리");
  await inputReady(page);
  await shot(page, "learn-cross-case", info.project.name);

  test.skip(info.project.name !== "desktop", "키보드 조작은 데스크톱만");
  await page.locator("[data-cube-hint-button]").click();
  const hint = (await page
    .locator("[data-cube-hint]")
    .getAttribute("data-cube-hint")) as string;
  expect(hint).toBe("R");
  for (const k of keysFor(hint)) await page.keyboard.press(k);
  await expect(page.locator("[data-cube-try]")).toHaveAttribute(
    "data-cube-passed",
    "",
  );
});
