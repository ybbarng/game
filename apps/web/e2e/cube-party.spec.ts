import { inputReady, keysFor, no3d, shot, useNotationKeys } from "./cube";
import { expect, fastForwardUntil, type Page, test } from "./test";

/**
 * 파티 모드 체력바 대결(docs/51 3-2, docs/47 9-6): 컴퓨터와 대결에서 「파티: 체력바」로 한 판 한다.
 * 컴퓨터가 이정표를 먼저 지나면 내 체력이 깎이고, 결과 상자에 남은 체력과 끝난 까닭이 적힌다.
 * 시계는 흐르게 두고, 기다릴 곳만 `fastForward`로 감는다(한 번에 컴퓨터 수가 하나씩 나간다).
 */

const SCRAMBLE_TIMEOUT = 60_000;

// 사람이 보려고 녹화할 때만(E2E_VIDEO=1). CI는 찍지 않는다
test.use({ video: process.env.E2E_VIDEO ? "on" : "off" });

test.beforeEach(async ({ page }) => {
  await no3d(page);
  await useNotationKeys(page);
});

function inverse(alg: string): string {
  return alg
    .trim()
    .split(/\s+/)
    .reverse()
    .map((t) =>
      t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : `${t}'`,
    )
    .join(" ");
}

/**
 * 섞기 씨앗(컴퓨터와 대결 화면 갈고리 `__cubeVsSeed`, vs-seed.ts). 섞기가 무작위면 컴퓨터가 단계를 건너뛰는 판이 섞여 흔들린다.
 * 씨앗마다 컴퓨터가 이정표를 언제 지나는지는 `vs-seed.test.ts`가 확인한다(해법이 바뀌면 거기서 먼저 드러난다)
 */
const SEEDS = { apart2: "hp-2", skip2: "hp-13", apart3: "hp-1" } as const;

async function startParty(
  page: Page,
  size: string,
  level: string,
  seed: string,
) {
  await page.addInitScript((s) => {
    const w = window as unknown as Record<string, unknown>;
    w.__cubeTestHooks = true;
    w.__cubeVsSeed = s;
  }, seed);
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.locator("[data-cube-vs-size]").selectOption(size);
  await page.getByRole("button", { name: level, exact: true }).click();
  await page.locator('[data-cube-vs-party="hp"]').click();
  // 체력바는 시간 순위 「평균 대비」와 함께 쓰지 않는다
  await expect(page.locator("[data-cube-vs-score]")).toBeHidden();
  await page.getByLabel("15초 살펴보기").uncheck();
  await page.locator("[data-cube-vs-start]").click();
  await expect(page.locator("[data-cube-race-phase]")).toHaveAttribute(
    "data-cube-race-phase",
    "race",
    { timeout: SCRAMBLE_TIMEOUT },
  );
  await inputReady(page);
  await expect(page.locator('[data-cube-hp="me"]')).toHaveAttribute(
    "data-cube-hp-value",
    "100",
  );
  // 체력은 내 큐브 위(내 자리)와 상대 자리마다(docs/47 9-9)
  await expect(
    page.locator(
      '[data-cube-seat][data-cube-peer="bot1"] [data-cube-hp="bot1"]',
    ),
  ).toBeVisible();
  return (await page
    .locator("[data-cube-scramble]")
    .getAttribute("data-cube-scramble")) as string;
}

const hpOf = async (page: Page, id: string) =>
  Number(
    await page
      .locator(`[data-cube-hp="${id}"]`)
      .getAttribute("data-cube-hp-value"),
  );

async function finalResult(page: Page) {
  const result = page.locator("[data-cube-result]");
  await fastForwardUntil(
    page,
    async () => (await result.getAttribute("data-cube-result")) === "final",
    { step: 1_000, timeout: 90_000 },
  );
  return result;
}

/** 큐브 칸이 화면 안에 다 들어온다(1280×720, 휴대폰 가로) */
async function stageFits(page: Page) {
  const stage = await page.locator("[data-cube-stage]").boundingBox();
  const view = page.viewportSize();
  expect(stage).toBeTruthy();
  if (stage && view) {
    expect(stage.y + stage.height).toBeLessThanOrEqual(view.height + 1);
    expect(stage.x + stage.width).toBeLessThanOrEqual(view.width + 1);
  }
}

test("2×2 체력바: 컴퓨터가 첫 층을 먼저 지나면 내 체력이 깎이고, 내가 끝까지 맞추면 이긴다", async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  // 깎이는 연출을 본다(움직임 줄이기를 끈다)
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const scramble = await startParty(page, "2", "입문", SEEDS.apart2);
  if (info.project.name !== "phone-portrait") await stageFits(page);
  // 컴퓨터가 첫 층을 지나기를 기다린다: 내 체력 100 → 50
  await fastForwardUntil(page, async () => (await hpOf(page, "me")) < 100, {
    step: 600,
    timeout: 90_000,
  });
  expect(await hpOf(page, "me")).toBe(50);
  expect(await hpOf(page, "bot1")).toBe(100);
  // 체력바가 깎인 뒤에도 큐브 칸이 화면 안(결과 상자가 뜨기 전, 다른 대결 화면 시험과 같다)
  if (info.project.name !== "phone-portrait") await stageFits(page);
  await shot(page, "party-hit", info.project.name);

  for (const key of keysFor(inverse(scramble))) await page.keyboard.press(key);
  const result = await finalResult(page);
  await expect(result).toHaveAttribute("data-cube-party-end", "solved");
  await expect(result).toContainText("1위예요 · 끝까지 맞춤");
  // 내가 윗면을 먼저 지나 컴퓨터도 50
  await expect(result.locator('[data-cube-result-hp="me"]')).toHaveText("50");
  await expect(result.locator('[data-cube-result-hp="bot1"]')).toHaveText("50");
  await expect(result.locator('[data-cube-rank="me"]')).toContainText(
    "끝까지 맞춤",
  );
  await expect(page.locator('[data-cube-hp="bot1"]')).toHaveAttribute(
    "data-cube-hp-value",
    "50",
  );
  // 컴퓨터는 판이 정해져 멈췄다(계획의 앞부분만 두었다)
  await expect(result.locator('[data-cube-rank="bot1"]')).toContainText(
    "컴퓨터 계획 확인 ✓",
  );
  await shot(page, "party-result", info.project.name);
});

test("2×2 체력바: 컴퓨터가 윗면을 건너뛰어 한 수에 이정표 둘을 지나면 50, 1초 뒤 다시 50이 깎인다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "데스크톱·휴대폰 세로로 본다",
  );
  test.setTimeout(150_000);
  await startParty(page, "2", "입문", SEEDS.skip2);
  await fastForwardUntil(page, async () => (await hpOf(page, "me")) < 100, {
    step: 200,
    timeout: 90_000,
  });
  // 한 순간에는 이정표 하나 몫만
  expect(await hpOf(page, "me")).toBe(50);
  await shot(page, "party-skip", info.project.name);
  // 남은 몫은 판정 시각 + 1초. 처음 본 때는 컴퓨터의 다음 수(0.34초 뒤)가 온 뒤라 많아야 0.55초쯤 늦다
  await page.clock.fastForward(300);
  expect(await hpOf(page, "me")).toBe(50);
  await fastForwardUntil(page, async () => (await hpOf(page, "me")) === 0, {
    step: 100,
    timeout: 20_000,
  });
  const result = await finalResult(page);
  await expect(result).toHaveAttribute("data-cube-party-end", "last");
  await expect(result).toContainText("체력이 0이 되어 탈락했어요");
});

test("3×3 체력바: 가만히 있으면 이정표마다 깎여 경고가 뜨고, 0이 되면 탈락해 컴퓨터가 끝까지 남는다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "데스크톱·휴대폰 세로로 본다",
  );
  test.setTimeout(240_000);
  await startParty(page, "3", "입문", SEEDS.apart3);
  const warning = page.locator("[data-cube-hp-warning]");
  await fastForwardUntil(page, async () => (await warning.count()) > 0, {
    step: 600,
    timeout: 180_000,
  });
  await expect(warning).toContainText("체력이 얼마 안 남았어요 · 4");
  await expect(page.locator('[data-cube-hp="me"]')).toHaveAttribute(
    "data-cube-hp-low",
    "",
  );
  await shot(page, "party-low", info.project.name);

  const result = await finalResult(page);
  await expect(result).toHaveAttribute("data-cube-party-end", "last");
  await expect(result).toContainText("체력이 0이 되어 탈락했어요 · 2위");
  await expect(result.locator('[data-cube-rank="bot1"]')).toContainText(
    "끝까지 남음",
  );
  await expect(result.locator('[data-cube-rank="me"]')).toContainText("체력 0");
  await expect(result.locator('[data-cube-result-hp="me"]')).toHaveText("0");
  await expect(page.locator('[data-cube-peer="me"]')).toContainText("탈락");
  await shot(page, "party-ko", info.project.name);
});

test("온라인 대기실: 「파티: 체력바」를 고르면 5판 평균과 「평균 대비」가 빠진다", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "온라인 대결은 키보드 기기만");
  await page.goto("/cube/online?net=local");
  await page.locator("[data-cube-enter]").click();
  const party = page.locator("[data-cube-party]");
  await party.selectOption("hp");
  await expect(party).toHaveValue("hp");
  await expect(page.locator("option", { hasText: "5판 평균" })).toHaveCount(0);
  await expect(page.locator("[data-cube-handicap-score]")).toHaveCount(0);
  await shot(page, "party-lobby", info.project.name);
});
