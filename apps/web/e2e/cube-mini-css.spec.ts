import { shot, useNotationKeys } from "./cube";
import { expect, type Page, test } from "./test";

/**
 * Cubie 미니 화면의 CSS 3D 그리기(실험 주소 `?render=css`, docs/52 5-4). three.js 대신 CSS 3D 상자로 큐브를 그려도
 * 섞기 연출·수 돌리기·거울·맞춤 판정이 그대로인지 본다. CSS 3D는 GPU 장면을 만들지 않아 시험의 「3D 끄기」와
 * 상관없이 그린다. 연출을 켜고 실제 시간으로 돌리되, 기다리기는 모두 조건(장면이 멈췄는지·화면 상태)으로 한다
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.beforeEach(async ({ page }) => {
  await useNotationKeys(page);
});

/** 앱 다리 흉내: 웹이 앱에 보내는 것을 `__toApp`에 모은다 */
async function fakeApp(page: Page) {
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    const w = window as unknown as {
      __toApp: unknown[];
      __cubeTestHooks: boolean;
      webkit: { messageHandlers: Record<string, unknown> };
    };
    w.__toApp = sent;
    w.__cubeTestHooks = true;
    w.webkit = {
      messageHandlers: { cubie: { postMessage: (m: unknown) => sent.push(m) } },
    };
  });
}

async function fromApp(page: Page, detail: Record<string, unknown>) {
  await page.evaluate(
    (d) => window.dispatchEvent(new CustomEvent("cubie", { detail: d })),
    detail,
  );
}

function inverseKeys(scramble: string): string[] {
  const keys: string[] = [];
  for (const token of scramble.trim().split(/\s+/).reverse()) {
    const code = `Key${token[0] as string}`;
    if (token.endsWith("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(code);
    else keys.push(`Shift+${code}`);
  }
  return keys;
}

/** 장면 상태: 도는 수가 없는지, 끝낸 수, 여섯 면이 저마다 한 색인지(장면이 그린 모양) */
const scene = (page: Page) =>
  page.locator("[data-cube-canvas]").evaluate((host) => {
    const v = (
      host as unknown as {
        __cubeView?: {
          idle: boolean;
          movesDone: number;
          stickers(): { normal: string; color: number | null }[];
        };
      }
    ).__cubeView;
    if (!v) return null;
    const faces = new Map<string, Set<number | null>>();
    for (const s of v.stickers()) {
      const set = faces.get(s.normal) ?? new Set();
      set.add(s.color);
      faces.set(s.normal, set);
    }
    return {
      idle: v.idle,
      done: v.movesDone,
      solved: [...faces.values()].every((s) => s.size === 1),
    };
  });

test(
  "CSS 3D(?render=css): 섞기 연출을 보이고, 키로 돌려 맞추면 장면도 맞춘 모양이 된다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 키보드 조작은 데스크톱만
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 200, height: 200 });
    await fakeApp(page);
    await page.goto("/cube/mini?render=css");
    const main = page.locator("main[data-mini]");
    const host = page.locator("[data-cube-canvas]");
    await expect(host).toHaveAttribute("data-cube-ready", "");
    await expect(host).toHaveAttribute("data-cube-render", "css");
    // WebGL 캔버스를 만들지 않는다
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    expect((await scene(page))?.solved).toBe(true);

    // 섞기(배치의 「다시 섞기」 Enter): 3×3은 맞춘 큐브에서 섞기 수를 하나씩 빠르게 돌린다
    await fromApp(page, { type: "focus", focused: true });
    const before = (await scene(page))?.done ?? 0;
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const text = (await main.getAttribute("data-mini-scramble")) ?? "";
    // 연출이 끝나기를 기다린다(장면이 섞기 수를 모두 돌리고 멈춤)
    await expect(main).not.toHaveAttribute("data-scramble-show", "on");
    await expect
      .poll(async () => (await scene(page))?.idle, { timeout: 10_000 })
      .toBe(true);
    const shown = await scene(page);
    expect(shown?.solved).toBe(false);
    // 연출은 수마다 돌렸다. 연출이 끝나는 순간 섞인 모양으로 칠하면서 돌던 마지막 수를 버릴 수 있다
    // (`viewShowTarget.scrambled`)
    const count = text.trim().split(/\s+/).length;
    expect((shown?.done ?? 0) - before).toBeGreaterThanOrEqual(count - 1);
    expect((shown?.done ?? 0) - before).toBeLessThanOrEqual(count);
    // 직접 맞추는 동안은 거울 판이 보이고, 앱에 큐브·판 셋 자리를 알린다
    await expect(main).toHaveAttribute("data-mini-mirror-shown", "");
    await expect(host).toHaveAttribute("data-cube-mirror", "on");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __toApp: { type: string; rects?: number[][] }[];
              }
            ).__toApp
              .filter((m) => m.type === "hit")
              .at(-1)?.rects?.length,
        ),
      )
      .toBe(4);
    await shot(page, "mini-css-scrambled", info.project.name);

    // 거꾸로 돌려 맞춘다(수마다 장면이 돌림 상자를 돌린 뒤 조각에 굳힌다)
    const keys = inverseKeys(text);
    await page.keyboard.press(keys[0] as string);
    await expect(main).toHaveAttribute("data-mini-phase", "solving");
    for (const k of keys.slice(1)) await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-mini-phase", "done");
    await expect(main).toHaveAttribute("data-mini-solved", "");
    await expect
      .poll(async () => (await scene(page))?.idle, { timeout: 10_000 })
      .toBe(true);
    const end = await scene(page);
    expect(end?.solved).toBe(true);
    expect((end?.done ?? 0) - (shown?.done ?? 0)).toBe(keys.length);
  },
);
