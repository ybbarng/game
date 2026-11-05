import { inputReady, keysFor, no3d, shot, useNotationKeys } from "./cube";
import {
  expect,
  fastForwardUntil,
  type Page,
  SAVE_SCREENSHOTS,
  test,
} from "./test";

/**
 * 큐브 대결 핸디캡 「도움 다르게」(docs/51 4절, docs/47 9-8): 컴퓨터와 대결에서 내 도움을 고르고 한 판 한다.
 * 섞기는 씨앗으로 정해 둔다(`__cubeVsSeed`, vs-seed.ts). 섞기 글을 읽어 거꾸로 쳐서 맞춘다(「표기」 키).
 * 3D를 끄면 비스듬한 큐브 그림 둘이 큐브 자리에 나오므로, 가리기는 그 칸(`data-sticker-hidden`)으로 본다.
 * 「가리고 맞추기」는 스크린샷을 찍을 때만 3D를 켜 같은 3D 장면에서 색만 빠지는지 보고, 가린 칸은 장면의 칸 색으로 센다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.beforeEach(async ({ page }, info) => {
  if (!(SAVE_SCREENSHOTS && info.title.includes("가리고 맞추기")))
    await no3d(page);
  await useNotationKeys(page);
});

/**
 * 내 큐브(큐브 자리)에서 가린 칸 수. 3D면 장면의 칸 색(가림 = null, `__cubeTestHooks`), 3D를 못 그리면 큐브 그림 칸
 */
async function hiddenCount(page: Page): Promise<number> {
  const posters = page.locator("[data-cube-stage] [data-cube-posters]");
  if ((await posters.count()) > 0)
    return posters.locator("[data-sticker-hidden]").count();
  return page
    .locator("[data-cube-stage] [data-cube-canvas][data-cube-ready]")
    .evaluate((c) => {
      const view = (
        c as unknown as {
          __cubeView?: { slots: { color: number | null }[] };
        }
      ).__cubeView;
      return view ? view.slots.filter((s) => s.color === null).length : -1;
    });
}

/** 내 큐브 그림이 떴다(3D 장면 또는 큐브 그림) */
async function stageShown(page: Page): Promise<void> {
  await expect(
    page.locator(
      "[data-cube-stage] [data-cube-posters], [data-cube-stage] [data-cube-canvas][data-cube-ready]",
    ),
  ).toBeVisible();
}

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

async function setup(
  page: Page,
  o: { size: string; help: string; seed: string; inspection: boolean },
) {
  await page.addInitScript((s) => {
    const w = window as unknown as Record<string, unknown>;
    w.__cubeTestHooks = true;
    w.__cubeVsSeed = s;
  }, o.seed);
  await page.clock.install();
  await page.goto("/cube/vs");
  await page.locator("[data-cube-vs-size]").selectOption(o.size);
  await page.getByRole("button", { name: "초고수", exact: true }).click();
  await page.locator("[data-cube-vs-help]").selectOption(o.help);
  if (!o.inspection) await page.getByLabel("15초 살펴보기").uncheck();
}

async function phase(page: Page, name: string) {
  await expect(page.locator("[data-cube-race-phase]")).toHaveAttribute(
    "data-cube-race-phase",
    name,
    { timeout: SCRAMBLE_TIMEOUT },
  );
}

async function scrambleText(page: Page) {
  return (await page
    .locator("[data-cube-scramble]")
    .getAttribute("data-cube-scramble")) as string;
}

async function solve(page: Page, scramble: string) {
  await inputReady(page);
  for (const key of keysFor(inverse(scramble))) await page.keyboard.press(key);
  await expect(page.locator('[data-cube-peer="me"]')).toHaveAttribute(
    "data-cube-peer-status",
    "done",
  );
}

async function finalResult(page: Page) {
  const result = page.locator("[data-cube-result]");
  await fastForwardUntil(
    page,
    async () => (await result.getAttribute("data-cube-result")) === "final",
    { step: 5_000, timeout: 90_000 },
  );
  return result;
}

async function stageFits(page: Page, project: string) {
  if (project !== "desktop") return;
  const stage = await page.locator("[data-cube-stage]").boundingBox();
  expect(stage).toBeTruthy();
  if (stage) expect(stage.y + stage.height).toBeLessThanOrEqual(720);
}

test("컴퓨터와 대결: 힌트 허용이면 두 단계 힌트(지금 경우 → 다음 수)가 보이고, 결과 상자에 적힌다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "데스크톱·휴대폰 세로로 본다",
  );
  test.setTimeout(150_000);
  await setup(page, {
    size: "3",
    help: "hint",
    seed: "hp-1",
    inspection: false,
  });
  await page.locator("[data-cube-vs-start]").click();
  await phase(page, "race");
  const scramble = await scrambleText(page);
  await expect(page.locator("[data-cube-my-handicap]")).toContainText(
    "힌트 허용",
  );
  await page.locator('[data-cube-help-hint="1"]').click();
  await expect(page.locator("[data-cube-help-case]")).toHaveAttribute(
    "data-cube-help-case",
    /.+/,
  );
  // 다음 수는 힌트 2를 눌러야 보인다
  await expect(
    page.locator("[data-cube-help-hint-row] [data-cube-hint]"),
  ).toHaveCount(0);
  await page.locator('[data-cube-help-hint="2"]').click();
  await expect(
    page.locator("[data-cube-help-hint-row] [data-cube-hint]"),
  ).toHaveAttribute("data-cube-hint", /^[URFDLBxyz]/);
  await stageFits(page, info.project.name);
  await shot(page, "help-hint", info.project.name);

  await solve(page, scramble);
  // 다 맞추면 힌트 줄이 없어진다
  await expect(page.locator("[data-cube-help-hint-row]")).toHaveCount(0);
  const result = await finalResult(page);
  await expect(result.locator('[data-cube-rank="me"]')).toContainText(
    "힌트 허용",
  );
  await shot(page, "help-hint-result", info.project.name);
});

test("컴퓨터와 대결: 가리고 맞추기면 살펴보기 동안 보고, 풀리면 내 큐브를 가렸다가 맞추면 다시 보인다", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone-landscape",
    "데스크톱·휴대폰 세로로 본다",
  );
  test.setTimeout(150_000);
  await setup(page, {
    size: "2",
    help: "blind",
    seed: "hp-2",
    inspection: true,
  });
  await page.locator("[data-cube-vs-start]").click();
  await phase(page, "inspect");
  // 살펴보기 동안은 색이 있는 큐브(같은 큐브 자리에서 판이 시작되면 색만 빠진다)
  await stageShown(page);
  await expect.poll(() => hiddenCount(page)).toBe(0);
  await expect(page.locator("[data-cube-my-handicap]")).toContainText(
    "가리고 맞추기",
  );
  await shot(page, "help-blind-inspect", info.project.name);
  const scramble = await scrambleText(page);
  const race = page.locator("[data-cube-race-phase]");
  await fastForwardUntil(
    page,
    async () => (await race.getAttribute("data-cube-race-phase")) === "race",
    { step: 1_000, timeout: 30_000 },
  );
  // 2×2: 여섯 면 × 네 칸이 모두 까맣게 가려진다
  await expect.poll(() => hiddenCount(page)).toBe(24);
  await stageFits(page, info.project.name);
  await shot(page, "help-blind-solving", info.project.name);

  await solve(page, scramble);
  await expect.poll(() => hiddenCount(page)).toBe(0);
  await shot(page, "help-blind-solved", info.project.name);
  const result = await finalResult(page);
  await expect(result.locator('[data-cube-rank="me"]')).toContainText(
    "가리고 맞추기",
  );
  await shot(page, "help-blind-result", info.project.name);
});

test("온라인 대기실: 방장이 사람마다 도움을 고른다", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "온라인 대결은 키보드 기기만");
  await page.goto("/cube/online?net=local");
  await page.locator("[data-cube-enter]").click();
  const panel = page.locator("[data-cube-handicap]");
  const me = (await panel
    .locator("[data-cube-handicap-row]")
    .first()
    .getAttribute("data-cube-handicap-row")) as string;
  const help = panel.locator(`[data-cube-handicap-help="${me}"]`);
  await help.selectOption("blind");
  await expect(help).toHaveValue("blind");
  await shot(page, "help-lobby", info.project.name);
});
