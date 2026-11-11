import { mkdirSync, writeFileSync } from "node:fs";

import { installClock, no3d, pauseClock, shot, useNotationKeys } from "./cube";
import { expect, fastForwardUntil, type Page, test } from "./test";

/**
 * 큐브 미니 모드(/cube/mini, 맥 앱 Cubie의 화면, docs/47 15절). 3D 그림은 보지 않으므로 끈다(`no3d`).
 * 앱은 `window.dispatchEvent(new CustomEvent("cubie", …))`로 포커스·섞기·거울·크기·기록을 알린다. 시험은 같은 이벤트로
 * 앱을 흉내 낸다. 브라우저에서 연 화면은 구석 메뉴(⋯)로 같은 것을 고른다.
 */

const SCRAMBLE_TIMEOUT = 60_000;

test.beforeEach(async ({ page }, info) => {
  // 태그 @3d인 시험만 3D 장면을 띄운다(거울 페이드·누르는 자리는 장면에서만 보인다)
  if (!info.tags.includes("@3d")) await no3d(page);
  await useNotationKeys(page);
});

/** GPU 없는 CI는 첫 장면에 5초 넘게 걸린다(멈춘 시험을 잡는 상한, cube-3d.spec과 같다) */
const SCENE = { timeout: 30_000 };

/** 앱 다리 흉내: 웹이 앱에 보내는 것을 `__toApp`에 모은다 */
async function fakeApp(page: Page) {
  await page.addInitScript(() => {
    const sent: unknown[] = [];
    (window as unknown as { __toApp: unknown[] }).__toApp = sent;
    (
      window as unknown as {
        webkit: { messageHandlers: Record<string, unknown> };
      }
    ).webkit = {
      messageHandlers: { cubie: { postMessage: (m: unknown) => sent.push(m) } },
    };
  });
}

/** 앱이 보내는 것 흉내 */
async function fromApp(page: Page, detail: Record<string, unknown>) {
  await page.evaluate(
    (d) => window.dispatchEvent(new CustomEvent("cubie", { detail: d })),
    detail,
  );
}

/** 섞기 글의 거꾸로를 「표기」 배치 키로 */
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

test(
  "섞고 맞추면 기록에 남고, 포커스가 없던 시간은 재지 않는다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 키보드 조작은 데스크톱만
    await page.setViewportSize({ width: 320, height: 380 });
    await installClock(page);
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await pauseClock(page);
    await fromApp(page, { type: "focus", focused: true });
    // 화면에는 큐브만: 시간·글이 없다
    await expect(main).not.toContainText(/초|수/);
    await shot(page, "mini-solved", info.project.name);

    // 섞기 키(배치의 「다시 섞기」, Enter)
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const text = (await main.getAttribute("data-mini-scramble")) ?? "";
    const keys = inverseKeys(text);
    await page.clock.fastForward(5000); // 첫 수 전에 살펴본 시간은 재지 않는다
    await page.keyboard.press(keys[0] as string);
    await expect(main).toHaveAttribute("data-mini-phase", "solving");
    await page.clock.fastForward(2000);
    // 다른 앱으로 갔다가(포커스 잃음) 돌아온다
    await fromApp(page, { type: "focus", focused: false });
    await page.clock.fastForward(60_000);
    await fromApp(page, { type: "focus", focused: true });
    await page.clock.fastForward(1000);
    // Esc(배치의 「맞춘 상태로」)는 미니 모드에서 쓰지 않는다: 진행이 남는다
    await page.keyboard.press("Escape");
    await expect(main).toHaveAttribute("data-mini-phase", "solving");
    await shot(page, "mini-scrambled", info.project.name);
    for (const k of keys.slice(1)) await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-mini-phase", "done");
    await expect(main).toHaveAttribute("data-mini-solved", "");

    // 다 맞추면 짧은 축하: 이번 시간 숫자만 잠깐(첫 판이라 최고 기록 표시는 없다), 시간이 지나면 사라진다
    const cheer = page.locator("[data-mini-cheer]");
    await expect(cheer).toHaveAttribute("data-mini-cheer", "");
    await expect(cheer.locator("[data-mini-cheer-time]")).toHaveText("3.00");
    // 시험은 「동작 줄이기」라 큐브가 튀지 않는다(빛과 숫자만)
    await expect(page.locator("main[data-mini] .mini-cheer-pop")).toHaveCount(
      0,
    );
    await page.clock.fastForward(2500);
    await expect(cheer).toHaveCount(0);

    // 기록(앱 메뉴 「기록」): 시간은 포커스가 있던 3초만
    await fromApp(page, { type: "records", open: true });
    const panel = page.locator("[data-mini-records='3']");
    await expect(panel).toBeVisible();
    await expect(panel.locator("[data-mini-record]")).toHaveCount(1);
    await expect(panel.locator("[data-mini-record]").first()).toContainText(
      "3.00",
    );
    await expect(panel.locator("[data-mini-record]").first()).toContainText(
      `${keys.length}수`,
    );
    await expect(panel.locator("[data-mini-best]")).toHaveText("3.00");
    await shot(page, "mini-records", info.project.name);
    // 다른 크기 기록은 따로
    await panel.locator("[data-mini-records-size='2']").click();
    await expect(page.locator("[data-mini-records='2']")).toContainText(
      "아직 기록이 없어요",
    );
    await fromApp(page, { type: "records", open: false });
    await expect(page.locator("[data-mini-records]")).toHaveCount(0);
  },
);

/** 사람이 보는 스크린샷용: 모든 CSS 연출을 `ms` 순간에 세운다 */
async function freezeAnimations(page: Page, ms: number) {
  if (!process.env.E2E_SCREENSHOTS) return;
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.currentTime = t;
      a.pause();
    }
  }, ms);
}

test(
  "다 맞추면 큐브가 통 튀고 빛 고리가 퍼졌다 사라진다(작은 창에서도)",
  { tag: ["@3d", "@only-desktop"] },
  async ({ page }, info) => {
    // 키보드 조작은 데스크톱만
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 96, height: 96 });
    await installClock(page);
    await fakeApp(page);
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    await expect(page.locator("[data-cube-canvas]")).toHaveAttribute(
      "data-cube-ready",
      "",
      SCENE,
    );
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await pauseClock(page);
    await fromApp(page, { type: "focus", focused: true });
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const keys = inverseKeys(
      (await main.getAttribute("data-mini-scramble")) ?? "",
    );
    for (const k of keys) await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-mini-phase", "done");
    const cheer = page.locator("[data-mini-cheer]");
    await expect(cheer).toBeVisible();
    await expect(page.locator("main[data-mini] .mini-cheer-pop")).toHaveCount(
      1,
    );
    // 빛 고리는 큐브 둘레(큐브 사각형을 받아 그 가운데에 둔다)
    const glow = await cheer
      .locator(".mini-cheer-glow")
      .evaluate((el) => (el as HTMLElement).style.width);
    expect(glow).toMatch(/px$/);
    // 숫자가 창 안에 다 들어온다
    const box = await cheer.locator("[data-mini-cheer-time]").boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(96);
      expect(box.y + box.height).toBeLessThanOrEqual(96);
    }
    await freezeAnimations(page, 800);
    await shot(page, "mini-cheer-small", info.project.name);
    await page.clock.fastForward(2500);
    await expect(cheer).toHaveCount(0);
    await expect(page.locator("main[data-mini] .mini-cheer-pop")).toHaveCount(
      0,
    );
  },
);

test(
  "거울 끄기·크기 고르기를 기억하고, 작은 창에서는 거울을 접는다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 창 크기는 데스크톱에서
    await page.setViewportSize({ width: 320, height: 380 });
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    await expect(main).toHaveAttribute("data-input-ready", "");
    await expect(main).toHaveAttribute("data-mini-mirror", "on");

    // 앱 메뉴 흉내
    await fromApp(page, { type: "mirror" });
    await expect(main).toHaveAttribute("data-mini-mirror", "off");
    await fromApp(page, { type: "size", n: 4 });
    await expect(main).toHaveAttribute("data-mini-n", "4");
    // 브라우저 구석 메뉴
    await page.locator("[data-mini-menu]").click();
    await page.locator("[data-mini-item='mirror']").click();
    await expect(main).toHaveAttribute("data-mini-mirror", "on");
    await page.locator("[data-mini-size='2']").click();
    await expect(main).toHaveAttribute("data-mini-n", "2");

    await page.reload();
    await expect(main).toHaveAttribute("data-mini-n", "2");
    await expect(main).toHaveAttribute("data-mini-mirror", "on");

    // 가장 작은 창(48px): 2×2·3×3은 거울이 남는다. 7×7은 거울 칸이 너무 작아 접고 큐브만(문턱 10 × n px)
    await page.setViewportSize({ width: 48, height: 48 });
    await expect(main).toHaveAttribute("data-mini-mirror", "on");
    await shot(page, "mini-tiny", info.project.name);
    await fromApp(page, { type: "size", n: 7 });
    await expect(main).toHaveAttribute("data-mini-mirror", "folded");
    await page.setViewportSize({ width: 70, height: 80 });
    await expect(main).toHaveAttribute("data-mini-mirror", "on");
  },
);

/**
 * 거울은 직접 맞출 때만(docs/47 15-14): 맞춘 큐브에는 없고, 섞으면 나타나고, 포커스를 잃거나 다 맞추면 숨는다.
 * 숨으면 앱에 알리는 누르는 자리(`hit`)도 큐브 하나로 줄어 그 밖의 누르기가 아래 앱으로 간다. 시계는 진짜 시간
 * (페이드는 그림 프레임이 돌아야 끝난다)이고 기다림은 모두 조건으로 한다. 떠 있을 때 움직임은 1분 뒤라 끼지 않는다
 */
test(
  "거울은 직접 맞출 때만 보이고, 숨으면 누르는 자리도 줄어든다",
  {
    tag: ["@3d", "@only-desktop"],
  },
  async ({ page }, info) => {
    // 키보드 조작은 데스크톱만
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 320, height: 380 });
    await fakeApp(page);
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    const canvas = page.locator("[data-cube-canvas]");
    await expect(canvas).toHaveAttribute("data-cube-ready", "", SCENE);
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    // 앱 안에서는 마우스 둘러보기를 끈다(큐브 끌기는 앱이 창 옮기기로 받는다). 끌기를 받는 장면은 touch-action을 none으로 둔다
    expect(
      await canvas.evaluate((c) => (c as HTMLCanvasElement).style.touchAction),
    ).toBe("");
    /** 마지막으로 알린 누르는 자리 수(큐브 하나 + 보이는 거울 판 셋) */
    const hitCount = () =>
      page.evaluate(() => {
        const sent = (
          window as unknown as {
            __toApp: { type: string; rects?: unknown[] }[];
          }
        ).__toApp;
        return sent.filter((m) => m.type === "hit").at(-1)?.rects?.length ?? 0;
      });
    const hidden = async () => {
      await expect(main).not.toHaveAttribute("data-mini-mirror-shown");
      await expect(canvas).not.toHaveAttribute("data-cube-mirror", "on");
      await expect.poll(hitCount).toBe(1);
    };
    const shown = async () => {
      await expect(main).toHaveAttribute("data-mini-mirror-shown", "");
      await expect(canvas).toHaveAttribute("data-cube-mirror", "on");
      await expect.poll(hitCount).toBe(4);
    };

    // 맞춘 큐브: 포커스가 있어도 없다(메뉴 설정은 켜짐 그대로)
    await fromApp(page, { type: "focus", focused: true });
    await expect(main).toHaveAttribute("data-mini-mirror", "on");
    await hidden();
    await shot(page, "mini-mirror-solved", info.project.name);

    // 섞으면 나타난다
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await shown();
    await shot(page, "mini-mirror-solving", info.project.name);
    const keys = inverseKeys(
      (await main.getAttribute("data-mini-scramble")) ?? "",
    );

    // 다른 앱으로 가면(떠 있음) 숨고, 돌아오면 다시
    await fromApp(page, { type: "focus", focused: false });
    await hidden();
    await shot(page, "mini-mirror-floating", info.project.name);
    await fromApp(page, { type: "focus", focused: true });
    await shown();

    // 다 맞추면 사라진다
    for (const k of keys) await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-mini-phase", "done");
    await hidden();
  },
);

/** 스크린샷용 바탕화면 넷(검은·어두운·밝은·사진 흉내). 윤곽이 어느 바탕에서도 큐브 테두리를 갈라 주는지 사람이 견준다 */
const DESKS = {
  black: "#000",
  dark: "#2a2b30",
  light: "#ffffff",
  photo: [
    "radial-gradient(circle at 70% 30%, rgb(255 236 180 / 0.9) 0 6%, transparent 18%)",
    "repeating-linear-gradient(115deg, rgb(0 0 0 / 0.12) 0 3px, transparent 3px 9px)",
    "linear-gradient(#5d8fc4 0%, #b9d3ea 42%, #e7cf97 49%, #6a7f3c 53%, #34461f 75%, #1d2612 100%)",
  ].join(", "),
} as const;

/**
 * 큐브 윤곽(docs/47 15-23): 앱의 투명 창에서 큐브·거울 판 실루엣을 따라 도는 밝은 테두리 두 겹과 어두운 그림자.
 * 둥근 받침(원반)은 큐브와 따로 놀아 두지 않는다. 브라우저 미니 모드는 이미 어두운 바탕이 있어 윤곽을 두지 않는다
 */
test(
  "앱 창에서 큐브 윤곽을 따라 테두리를 두르고, 둥근 받침은 없다",
  {
    tag: ["@3d", "@only-desktop"],
  },
  async ({ page }, info) => {
    // 키보드 조작은 데스크톱만
    // 거울 페이드 없이 바로 자리 잡게
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 96, height: 96 });
    await fakeApp(page);
    // 앱이 넣는 투명 바탕(CubeWindow.swift)을 흉내 내고, 그 아래 바탕화면은 `--desk`로 바꿔 끼운다
    await page.addInitScript(() => {
      const put = () => {
        const s = document.createElement("style");
        s.textContent =
          "body,main[data-mini]{background:transparent!important}html{background:var(--desk,transparent)!important}";
        document.head.append(s);
      };
      if (document.head) put();
      else document.addEventListener("DOMContentLoaded", put);
    });
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    const canvas = page.locator("[data-cube-canvas]");
    await expect(canvas).toHaveAttribute("data-cube-ready", "", SCENE);
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const lastHit = () =>
      page.evaluate(() => {
        const sent = (
          window as unknown as {
            __toApp: { type: string; rects?: number[][] }[];
          }
        ).__toApp;
        return sent.filter((m) => m.type === "hit").at(-1)?.rects ?? [];
      });
    const filter = () => canvas.evaluate((c) => getComputedStyle(c).filter);
    /** 윤곽: 흰 빛 두 겹 뒤 검은 그림자 한 겹 */
    const outlined = async () => {
      const reds = [...(await filter()).matchAll(/rgba\((\d+),/g)].map(
        (m) => m[1],
      );
      expect(reds).toEqual(["255", "255", "0"]);
    };

    // 맞춘 큐브(거울 없음)
    await fromApp(page, { type: "focus", focused: true });
    await expect.poll(async () => (await lastHit()).length).toBe(1);
    await outlined();
    // 둥근 받침(원반)은 없다
    await expect(page.locator("[data-mini-backdrop]")).toHaveCount(0);
    // 윤곽은 누르기를 바꾸지 않는다: 큐브 가운데를 누르면 장면(캔버스)이 받는다
    const [cube] = await lastHit();
    expect(
      await page.evaluate(
        ([x = 0, y = 0, w = 0, h = 0]) =>
          document
            .elementFromPoint(x + w / 2, y + h / 2)
            ?.hasAttribute("data-cube-canvas") ?? false,
        cube ?? [],
      ),
    ).toBe(true);

    // 섞으면 거울이 나타난다(거울 판도 같은 캔버스라 판마다 제 윤곽을 받는다)
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await expect(main).toHaveAttribute("data-mini-mirror-shown", "");
    await expect.poll(async () => (await lastHit()).length).toBe(4);
    await outlined();
    for (const [name, desk] of Object.entries(DESKS)) {
      await page.evaluate(
        (d) => document.documentElement.style.setProperty("--desk", d),
        desk,
      );
      await shot(page, `mini-outline-${name}`, info.project.name);
    }

    // 떠 있으면 거울이 숨고 큐브가 창을 거의 채운다. 그래도 윤곽은 그대로
    await fromApp(page, { type: "focus", focused: false });
    await expect(main).not.toHaveAttribute("data-mini-mirror-shown");
    await expect.poll(async () => (await lastHit()).length).toBe(1);
    await outlined();
    for (const [name, desk] of Object.entries(DESKS)) {
      await page.evaluate(
        (d) => document.documentElement.style.setProperty("--desk", d),
        desk,
      );
      await shot(page, `mini-outline-${name}-floating`, info.project.name);
    }

    // 가장 큰 창에서도 같은 비율(윤곽 폭이 창 크기에 비례한다)
    const blur = async () =>
      Number(/([\d.]+)px\)\s*$/.exec(await filter())?.[1] ?? Number.NaN);
    const smallBlur = await blur();
    await page.setViewportSize({ width: 480, height: 480 });
    await expect.poll(async () => (await blur()) / smallBlur).toBeCloseTo(5, 0);
  },
);

test("브라우저 미니 모드는 바탕이 있어 윤곽을 두지 않는다", {
  tag: ["@3d", "@only-desktop"],
}, async ({ page }) => {
  // 창 크기는 데스크톱에서
  await page.setViewportSize({ width: 320, height: 380 });
  await page.goto("/cube/mini");
  const canvas = page.locator("[data-cube-canvas]");
  await expect(canvas).toHaveAttribute("data-cube-ready", "", SCENE);
  await expect(page.locator("main[data-mini]")).toHaveAttribute(
    "data-input-ready",
    "",
  );
  expect(await canvas.evaluate((c) => getComputedStyle(c).filter)).toBe("none");
});

test("떠 있을 때: 섞인 큐브를 조금 돌렸다 되돌리고, 포커스를 받으면 바로 멈춘다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 키보드 조작은 데스크톱만
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installClock(page);
  await page.goto("/cube/mini");
  const main = page.locator("main[data-mini]");
  await expect(main).toHaveAttribute("data-input-ready", "", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await pauseClock(page);
  await fromApp(page, { type: "focus", focused: true });
  await page.keyboard.press("Enter");
  await expect(main).toHaveAttribute("data-mini-phase", "ready", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await page.keyboard.press("KeyR");
  await expect(main).toHaveAttribute("data-mini-moves", "1");
  const scramble = await main.getAttribute("data-mini-scramble");

  await fromApp(page, { type: "focus", focused: false });
  await expect(main).toHaveAttribute("data-mini-idle", "");
  await expect(main).toHaveAttribute("data-mini-idle-armed", "");
  await page.clock.fastForward(60_000);
  await expect(main).toHaveAttribute("data-mini-idle", "jiggle");
  // 조금 섞기가 끝나면(4수 + 되돌리기 4수, 한 수 0.5초) 쉬고, 진행은 그대로
  await fastForwardUntil(
    page,
    async () => (await main.getAttribute("data-mini-idle")) === "",
    { step: 250 },
  );
  await expect(main).toHaveAttribute("data-mini-moves", "1");
  await expect(main).toHaveAttribute("data-mini-scramble", scramble ?? "");
  await expect(main).toHaveAttribute("data-mini-phase", "solving");

  // 다음 조금 섞기 도중에 포커스를 받으면 바로 멈춘다
  await page.clock.fastForward(2 * 60_000);
  await expect(main).toHaveAttribute("data-mini-idle", "jiggle");
  await fromApp(page, { type: "focus", focused: true });
  await expect(main).toHaveAttribute("data-mini-idle", "");
  await expect(main).toHaveAttribute("data-mini-moves", "1");
});

/**
 * 다시 보기(docs/47 15-13): 맞춘 판은 혼자 맞추기와 같은 다시 보기 재료를 남긴다. 맞춘 큐브로 떠 있으면 홈 시연 대신
 * 그 판을 다시 보고(섞기를 빠르게, 맞춘 과정은 그때 시각대로), 포커스를 받으면 바로 멈춘다. 기록 창에서 판을 고르면
 * 맞추던 속도로 다시 돌린다(멈추기·처음부터)
 */
test(
  "다시 보기: 떠 있을 때 내 판을 돌리고, 기록 창에서 판을 고르면 다시 본다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 키보드 조작은 데스크톱만
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 320, height: 380 });
    await installClock(page);
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await pauseClock(page);
    await fromApp(page, { type: "focus", focused: true });
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const keys = inverseKeys(
      (await main.getAttribute("data-mini-scramble")) ?? "",
    );
    // 한 수에 0.4초씩
    for (const k of keys) {
      await page.keyboard.press(k);
      await page.clock.fastForward(400);
    }
    await expect(main).toHaveAttribute("data-mini-phase", "done");
    const saved = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("cube.mini.v1") ?? "{}").records[
          "3"
        ][0],
    );
    // 혼자 맞추기와 같은 꼴: 섞기 글·씨앗, 수@시각(첫 수 0ms), 단계별 시각
    expect(typeof saved.seed).toBe("number");
    expect(saved.replay.split(" ")).toHaveLength(keys.length);
    expect(saved.replay).toMatch(/^\S+@0 /);
    expect(saved.splits).toMatch(/@\d+/);

    // 떠 있을 때: 1분 뒤 홈 시연 대신 내 판(1번)
    await fromApp(page, { type: "focus", focused: false });
    // 쉬기 타이머가 걸린 뒤에 시계를 감는다(포커스 알림 뒤 effect가 돌기 전에 감으면 타이머가 감은 뒤에 걸린다)
    await expect(main).toHaveAttribute("data-mini-idle-armed", "");
    await page.clock.fastForward(60_000);
    await expect(main).toHaveAttribute("data-mini-idle", "replay");
    await expect(main).toHaveAttribute("data-mini-idle-no", "1");
    await page.clock.fastForward(300);
    await shot(page, "mini-idle-replay", info.project.name);
    // 끝까지 돌면 맞춘 상태로 쉰다
    await fastForwardUntil(
      page,
      async () => (await main.getAttribute("data-mini-idle")) === "",
      { step: 500 },
    );
    await expect(main).toHaveAttribute("data-mini-solved", "");
    // 다음 차례(6분 뒤) 도중에 포커스를 받으면 바로 멈추고 맞춘 상태로, 입력을 받는다
    await page.clock.fastForward(6 * 60_000);
    await expect(main).toHaveAttribute("data-mini-idle", "replay");
    await page.clock.fastForward(500);
    await fromApp(page, { type: "focus", focused: true });
    await expect(main).toHaveAttribute("data-mini-idle", "");
    await expect(main).toHaveAttribute("data-mini-solved", "");
    await page.keyboard.press("KeyR");
    await expect(main).toHaveAttribute(
      "data-mini-moves",
      String(keys.length + 1),
    );

    // 기록 창(앱이 따로 여는 창, 380×600)에서 판을 고른다
    await page.setViewportSize({ width: 380, height: 600 });
    await page.goto("/cube/mini?view=records");
    const panel = page.locator("[data-mini-records='3']");
    await panel.locator("[data-mini-replay-open='1']").click();
    const box = panel.locator("[data-mini-replay]");
    await expect(box).toHaveAttribute("data-mini-replay", "playing");
    await expect(box).toHaveAttribute(
      "data-mini-replay-total",
      String(keys.length),
    );
    // 3D를 끈 이 시험에서는 본 화면과 같은 그림 대신(큐브 그림, 3D 모양은 아래 @3d 시험)
    await expect(box.locator("[data-cube-no3d]")).toHaveCount(1);
    await page.clock.fastForward(450);
    await shot(page, "mini-records-replay", info.project.name);
    // 멈추면 서 있고, 이어 보면 끝까지
    await box.locator("[data-mini-replay-toggle]").click();
    await expect(box).toHaveAttribute("data-mini-replay", "paused");
    const stopped = await box.getAttribute("data-mini-replay-played");
    await page.clock.fastForward(5000);
    await expect(box).toHaveAttribute("data-mini-replay-played", stopped ?? "");
    await box.locator("[data-mini-replay-toggle]").click();
    await fastForwardUntil(
      page,
      async () => (await box.getAttribute("data-mini-replay")) === "done",
    );
    await expect(box).toHaveAttribute(
      "data-mini-replay-played",
      String(keys.length),
    );
    // 처음부터
    await box.locator("[data-mini-replay-restart]").click();
    await expect(box).toHaveAttribute("data-mini-replay", "playing");
    await box.locator("[data-mini-replay-close]").click();
    await expect(panel.locator("[data-mini-replay]")).toHaveCount(0);
  },
);

/**
 * 기록 창 다시 보기의 모양(docs/47 15-13): 본 화면과 같은 3D 큐브 하나와 거울 셋. 거울은 「맞출 때만」 규칙과 달리
 * 다시 보는 동안 늘 보이고, 메뉴에서 거울을 껐으면 큐브만. 큐브·거울은 칸 안에 들어간다. 시계는 진짜 시간이고
 * (페이드는 그림 프레임이 돌아야 끝난다) 기다림은 모두 조건으로 한다
 */
test(
  "기록 창 다시 보기: 큐브 하나와 거울 셋, 메뉴에서 끈 거울은 끈 채로",
  { tag: ["@3d", "@only-desktop"] },
  async ({ page }, info) => {
    // 앱 창은 데스크톱에서
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      (window as { __cubeTestHooks?: boolean }).__cubeTestHooks = true;
      if (localStorage.getItem("cube.mini.v1")) return;
      localStorage.setItem(
        "cube.mini.v1",
        JSON.stringify({
          version: 1,
          n: 3,
          mirror: true,
          records: {
            "3": [
              {
                at: Date.UTC(2026, 10, 9, 3),
                n: 3,
                mode: "solo",
                ms: 1600,
                penalty: 0,
                moves: 5,
                scramble: "R U F' D2 L",
                replay: "L'@0 D2@400 F@800 U'@1200 R'@1600",
                no: 1,
              },
            ],
          },
        }),
      );
    });
    await page.setViewportSize({ width: 380, height: 600 });
    await page.goto("/cube/mini?view=records");
    const panel = page.locator("[data-mini-records='3']");
    await panel.locator("[data-mini-replay-open='1']").click();
    const box = panel.locator("[data-mini-replay]");
    const canvas = box.locator("[data-cube-canvas]");
    // SVG 큐브 그림 둘이 아니라 3D 장면 하나
    await expect(canvas).toHaveCount(1);
    await expect(box.locator("svg")).toHaveCount(0);
    await expect(canvas).toHaveAttribute("data-cube-ready", "", SCENE);
    await expect(box).toHaveAttribute("data-mini-replay-mirror", "on");
    await expect(canvas).toHaveAttribute("data-cube-mirror", "on");
    // Cubie 기록 창의 다시 보기도 마우스 둘러보기가 없다
    expect(
      await canvas.evaluate((c) => (c as HTMLCanvasElement).style.touchAction),
    ).toBe("");
    // 거울 판 칸이 장면 안에 그려진다(잘리지 않는다)
    const inside = await canvas.evaluate((c) => {
      const v = (
        c as unknown as {
          __cubeView?: {
            mirrorCellClient(
              p: string,
              u: number,
              v: number,
            ): { x: number; y: number } | null;
          };
        }
      ).__cubeView;
      const r = c.getBoundingClientRect();
      if (!v) return null;
      return ["-z", "-x", "-y"].flatMap((p) =>
        // 판 가운데에서 칸 단위: 3×3 판의 양 끝 모서리 칸
        [
          [-1, -1],
          [1, 1],
          [-1, 1],
          [1, -1],
        ].map(([u, w]) => {
          const at = v.mirrorCellClient(p, u as number, w as number);
          return (
            !!at &&
            at.x > r.left &&
            at.x < r.right &&
            at.y > r.top &&
            at.y < r.bottom
          );
        }),
      );
    });
    expect(inside).toHaveLength(12);
    expect(inside?.every(Boolean)).toBe(true);
    await shot(page, "mini-records-replay-3d", info.project.name);
    // 끝까지 돌면 맞춘 큐브, 거울은 그대로
    await expect(box).toHaveAttribute("data-mini-replay", "done", {
      timeout: 15_000,
    });
    await expect(box).toHaveAttribute("data-mini-replay-played", "5");
    await expect(canvas).toHaveAttribute("data-cube-mirror", "on");

    // 메뉴에서 거울을 끄면(떠 있는 창이 저장한다) 창이 다시 앞에 올 때 큐브만
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem("cube.mini.v1") ?? "{}");
      localStorage.setItem(
        "cube.mini.v1",
        JSON.stringify({ ...d, mirror: false }),
      );
      window.dispatchEvent(new Event("focus"));
    });
    await expect(box).toHaveAttribute("data-mini-replay-mirror", "off");
    await expect(canvas).toHaveAttribute("data-cube-mirror", "off");
    await box.locator("[data-mini-replay-close]").click();
    await expect(canvas).toHaveCount(0);
  },
);

test(
  "앱이 따로 여는 창: 기록과 단축키(지금 크기·배치)",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 앱 창은 데스크톱에서
    await page.addInitScript(() => {
      localStorage.setItem(
        "cube.mini.v1",
        JSON.stringify({
          version: 1,
          n: 4,
          mirror: true,
          // 4×4 다섯 판(Ao5 = 가운데 셋 평균 1:02.00), 2×2 한 판(Ao5 없음)
          records: {
            "4": [61_230, 62_000, 60_500, 63_000, 62_770].map((ms, i) => ({
              at: Date.UTC(2026, 10, 9, 3, i),
              n: 4,
              mode: "solo",
              ms,
              penalty: 0,
              moves: 88,
              scramble: "R",
              no: 5 - i,
            })),
            "2": [
              {
                at: Date.UTC(2026, 10, 9, 3),
                n: 2,
                mode: "solo",
                ms: 5000,
                penalty: 0,
                moves: 9,
                scramble: "R",
                no: 1,
              },
            ],
          },
        }),
      );
    });
    await page.goto("/cube/mini?view=records");
    const records = page.locator("[data-mini-records='4']");
    await expect(records.locator("[data-mini-record]")).toHaveCount(5);
    await expect(records.locator("[data-mini-best]")).toHaveText("1:00.50");
    await expect(records.locator("[data-mini-records-close]")).toHaveCount(0);
    // 크기별 티어(Cubie 기록 기준): 4×4는 Ao5 1:02.00의 티어, 2×2는 5판이 안 돼 없음
    const tiers = page.locator("[data-mini-tiers]");
    await expect(tiers).toContainText("Cubie 기록 기준");
    const four = tiers.locator("[data-mini-tier-size='4']");
    await expect(four).toContainText("1:02.00");
    await expect(four.locator("[data-cube-tier]")).toHaveCount(1);
    // 티어 이름 옆에 사이트와 같은 엠블럼(티어가 없는 크기는 없다)
    await expect(four.locator("[data-cube-emblem]")).toHaveCount(1);
    await expect(tiers.locator("[data-mini-tier-size='2']")).toContainText(
      "5판 뒤에",
    );
    await expect(
      tiers.locator("[data-mini-tier-size='2'] [data-cube-emblem]"),
    ).toHaveCount(0);
    await shot(page, "mini-records-tiers", info.project.name);

    await page.goto("/cube/mini?view=keys");
    const keys = page.locator("[data-mini-keys='4']");
    await expect(keys).toContainText("⌃⌥⌘C");
    await expect(keys).toContainText("큐브 끌기");
    await expect(keys).toContainText("핀치, ⌘ + 스크롤");
    await expect(keys).toContainText("Enter");
    await expect(keys).toContainText("배치 「표기」");
    await shot(page, "mini-keys", info.project.name);
  },
);

/** 앱의 큐브 옆 단축키 표 크기(`apps/cubie/Sources/Cubie/Config.swift` `keysPanelSize`와 같아야 한다) */
const KEYS_PANEL = { width: 560, height: 300 };

test(
  "큐브 옆 단축키 표(F1): 앱 패널 크기에 스크롤 없이 들어가고, 앱이 넘긴 키를 잠깐 빛내며 큐브 크기를 따른다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 앱 창은 데스크톱에서
    await page.setViewportSize(KEYS_PANEL);
    await page.goto("/cube/mini?view=keys&panel=1&n=4");
    const panel = page.locator("[data-mini-keys-panel='4']");
    await expect(panel).toContainText("Enter");
    await expect(panel).toContainText("섞기");
    await expect(panel).toContainText("\\");
    await expect(panel).toContainText("힌트");
    await expect(panel).toContainText("F1, Esc");
    // 패널은 키도 마우스도 받지 않으니 넘치면 볼 수 없다
    const fits = await page.evaluate(() => {
      const d = document.documentElement;
      const last = document.querySelector("[data-mini-keys-panel] > p");
      return {
        scroll:
          d.scrollHeight <= window.innerHeight &&
          d.scrollWidth <= window.innerWidth,
        bottom:
          (last?.getBoundingClientRect().bottom ?? Infinity) <=
          window.innerHeight,
      };
    });
    expect(fits).toEqual({ scroll: true, bottom: true });
    await expect.poll(() => overflowingKeyText(page)).toEqual([]);
    // Cubie가 쓰지 않는 동작(Esc 처음으로·Space 살펴보기)은 표에 없다
    await expect(panel).not.toContainText("처음으로");
    await expect(panel).not.toContainText("살펴보기");
    await shot(page, "mini-keys-panel", info.project.name);

    // 큐브 창에서 누른 키(앱이 `pressed`로 넘긴다)는 그 칸이 잠깐 빛나고 사라진다
    await fromApp(page, { type: "pressed", code: "KeyI" });
    const key = page.locator("[data-mini-keys-panel] [data-key='KeyI']");
    await expect(key).toHaveAttribute("data-key-state", "pressed");
    await expect(key).not.toHaveAttribute("data-key-state");
    // 큐브 크기가 바뀌면 그 크기의 키
    await fromApp(page, { type: "size", n: 3 });
    await expect(page.locator("[data-mini-keys-panel='3']")).toBeVisible();
    await expect.poll(() => overflowingKeyText(page)).toEqual([]);
  },
);

test("큐브 옆 단축키 표(F1) 기본 배치 「두 손」: 층 수 키 글이 잘리지 않고, 3×3에서는 빈 칸이다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 앱 창은 데스크톱에서
  // 기본 배치로(이 파일의 다른 시험은 「표기」 배치를 쓴다)
  await page.addInitScript(() => localStorage.removeItem("cube.keymap.v1"));
  await page.setViewportSize(KEYS_PANEL);
  await page.goto("/cube/mini?view=keys&panel=1&n=4");
  await expect(page.locator("[data-mini-keys-panel='4']")).toContainText(
    "배치 「두 손」",
  );
  // 4×4: 숫자 3·4는 왼손, 7·8은 오른손 층 수(바깥 층 수 바꾸기)
  await expect(page.locator("[data-key='Digit3']")).toContainText("왼손");
  await expect(page.locator("[data-key='Digit7']")).toContainText("오른손");
  await expect.poll(() => overflowingKeyText(page)).toEqual([]);
  // 3×3에서 층 수 키는 하는 일이 없어 빈 칸이다
  await fromApp(page, { type: "size", n: 3 });
  await expect(page.locator("[data-mini-keys-panel='3']")).toBeVisible();
  for (const code of ["Digit3", "Digit4", "Digit7", "Digit8"])
    await expect(
      page.locator(`[data-key='${code}'] [data-layer-line]`),
    ).toHaveCount(0);
  await expect.poll(() => overflowingKeyText(page)).toEqual([]);
});

/** 키보드 그림에서 칸을 넘쳐 잘리는 글(「…」)이 있는 칸의 키 이름 */
function overflowingKeyText(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-layer-line]")]
      .filter((el) => el.scrollWidth > el.clientWidth + 0.5)
      .map(
        (el) =>
          `${el.closest("[data-key]")?.getAttribute("data-key")}: ${el.textContent}`,
      ),
  );
}

test("앱 안: 단축키 표가 떠 있는 동안만 누른 키를 앱에 알리고, 그 키로 큐브는 그대로 돈다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 키보드 조작은 데스크톱만
  await fakeApp(page);
  await page.goto("/cube/mini");
  const main = page.locator("main[data-mini]");
  await expect(main).toHaveAttribute("data-input-ready", "", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await fromApp(page, { type: "focus", focused: true });
  const pressed = () =>
    page.evaluate(() =>
      (
        window as unknown as { __toApp: { type: string; code?: string }[] }
      ).__toApp
        .filter((m) => m.type === "pressed")
        .map((m) => m.code),
    );
  await page.keyboard.press("Enter");
  await expect(main).toHaveAttribute("data-mini-phase", "ready", {
    timeout: SCRAMBLE_TIMEOUT,
  });

  // 표가 없으면 보내지 않는다(시험의 배치는 「표기」: R 키가 R, U 키가 U)
  await page.keyboard.press("KeyR");
  await expect(main).toHaveAttribute("data-mini-moves", "1");
  expect(await pressed()).toEqual([]);
  // 표가 떠 있으면 누른 키를 보내고, 큐브도 돈다
  await fromApp(page, { type: "keysPanel", open: true });
  await page.keyboard.press("KeyU");
  await expect(main).toHaveAttribute("data-mini-moves", "2");
  await expect.poll(pressed).toEqual(["KeyU"]);
  // 닫으면 다시 보내지 않는다
  await fromApp(page, { type: "keysPanel", open: false });
  await page.keyboard.press("KeyR");
  await expect(main).toHaveAttribute("data-mini-moves", "3");
  expect(await pressed()).toEqual(["KeyU"]);
});

/** 앱이 받은 마지막 `profile` 메시지 */
async function lastProfile(page: Page) {
  return page.evaluate(() => {
    const sent = (window as unknown as { __toApp: { type: string }[] }).__toApp;
    return [...sent].reverse().find((m) => m.type === "profile") as
      | {
          name: string;
          photo: string | null;
          signedIn: boolean;
          n: number;
          tier: string | null;
          tierText: string;
          emblem: string | null;
        }
      | undefined;
  });
}

test(
  "앱 메뉴 프로필 칸: 익명 이름은 한 번 정해 남고, 지금 크기의 티어와 엠블럼 그림을 보낸다",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 앱 화면은 데스크톱에서
    await fakeApp(page);
    await page.addInitScript(() => {
      if (localStorage.getItem("cube.mini.v1")) return;
      localStorage.setItem(
        "cube.mini.v1",
        JSON.stringify({
          version: 1,
          n: 4,
          mirror: true,
          records: {
            "4": [61_230, 62_000, 60_500, 63_000, 62_770].map((ms, i) => ({
              at: Date.UTC(2026, 10, 9, 3, i),
              n: 4,
              mode: "solo",
              ms,
              penalty: 0,
              moves: 88,
              scramble: "R",
              no: 5 - i,
            })),
          },
        }),
      );
    });
    await page.goto("/cube/mini");
    await expect
      .poll(async () => (await lastProfile(page))?.emblem ?? null, SCENE)
      .toMatch(/^data:image\/png;base64,/);
    const first = await lastProfile(page);
    expect(first?.name).toMatch(/^익명 큐버 #\d{4}$/);
    expect(first).toMatchObject({
      photo: null,
      signedIn: false,
      n: 4,
      tier: expect.any(String),
    });
    expect(first?.tierText).toMatch(/^4×4 \S/);
    // 그림이 비지 않았다(엠블럼 너비 32pt의 2배 화소)
    const size = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let opaque = 0;
      for (let i = 3; i < px.length; i += 4)
        if ((px[i] as number) > 0) opaque++;
      return { w: img.width, opaque };
    }, first?.emblem as string);
    expect(size.w).toBe(64);
    expect(size.opaque).toBeGreaterThan(500);
    // 사람이 보는 용도: 앱에 넘긴 그림 그대로
    if (process.env.E2E_SCREENSHOTS) {
      mkdirSync("test-results/screens", { recursive: true });
      writeFileSync(
        `test-results/screens/cube-mini-profile-emblem-${info.project.name}.png`,
        Buffer.from(String(first?.emblem).split(",")[1] as string, "base64"),
      );
    }

    // 다시 열어도 같은 이름, 티어가 없는 크기는 엠블럼 없이 「5판 뒤에」
    await page.goto("/cube/mini");
    await expect
      .poll(async () => (await lastProfile(page))?.name)
      .toBe(first?.name);
    await fromApp(page, { type: "size", n: 2 });
    await expect
      .poll(async () => (await lastProfile(page))?.tierText)
      .toBe("2×2 5판 뒤에");
    expect((await lastProfile(page))?.emblem).toBeNull();
  },
);

/**
 * 앱 안(다리 흉내): 앱은 키마다 바로 앞에 출처(`key`)를 보낸다. 한 수라도 다른 프로그램이 넣은 키면 그 판 기록에
 * 「다른 프로그램 입력」이 붙고, 모두 실제 키보드면 붙지 않는다. 앱 안에서는 바탕이 투명하고, 큐브 자리(`hit`)를 앱에 알린다
 */
test("앱 안: 다른 프로그램이 넣은 키가 섞인 판은 기록에 표시한다", {
  tag: "@only-desktop",
}, async ({ page }) => {
  // 키보드 조작은 데스크톱만
  await fakeApp(page);
  await installClock(page);
  await page.goto("/cube/mini");
  const main = page.locator("main[data-mini]");
  await expect(main).toHaveAttribute("data-input-ready", "", {
    timeout: SCRAMBLE_TIMEOUT,
  });
  await pauseClock(page);
  // 앱 안에서는 바탕을 그리지 않고, 브라우저 구석 메뉴도 없다
  await expect(main).not.toHaveClass(/bg-neutral-950/);
  await expect(page.locator("[data-mini-menu]")).toHaveCount(0);
  const sent = () =>
    page.evaluate(
      () => (window as unknown as { __toApp: { type: string }[] }).__toApp,
    );
  expect((await sent()).some((m) => m.type === "ready")).toBe(true);
  // 메뉴 「섞기」 옆에 보일 키: 기본 배치는 Enter
  expect((await sent()).filter((m) => m.type === "state").at(-1)).toMatchObject(
    { scrambleKeys: [{ code: "Enter" }] },
  );
  await fromApp(page, { type: "focus", focused: true });

  /** 섞고 거꾸로 쳐서 맞춘다. `fake`번째 수만 다른 프로그램이 넣은 키로 알린다 */
  async function solveOnce(fake: number | null) {
    await fromApp(page, { type: "key", source: "keyboard" });
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const keys = inverseKeys(
      (await main.getAttribute("data-mini-scramble")) ?? "",
    );
    for (const [i, k] of keys.entries()) {
      await fromApp(page, {
        type: "key",
        source: i === fake ? "synthetic" : "keyboard",
      });
      await page.keyboard.press(k);
    }
    await expect(main).toHaveAttribute("data-mini-phase", "done");
  }
  await solveOnce(null);
  await solveOnce(3);

  await fromApp(page, { type: "records", open: true });
  const rows = page.locator("[data-mini-records='3'] [data-mini-record]");
  await expect(rows).toHaveCount(2);
  // 새것이 앞: 둘째 판만 표시
  await expect(rows.nth(0).locator("[data-mini-source]")).toHaveAttribute(
    "data-mini-source",
    "synthetic",
  );
  await expect(rows.nth(1).locator("[data-mini-source]")).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("cube.mini.v1") ?? "{}"),
  );
  // 혼자 맞추기와 같은 입력 방식 칸(inputs)과, 앱이 알린 키 출처 칸(keyOrigin)
  expect(
    saved.records["3"].map((r: { keyOrigin: string; inputs: string[] }) => [
      r.keyOrigin,
      r.inputs,
    ]),
  ).toEqual([
    ["synthetic", ["keyboard"]],
    ["hardware", ["keyboard"]],
  ]);
});

// ── 공식 보기(docs/47 15-15) ───────────────────────────────

/** 섞기 씨앗을 고정한다(섞기 글이 판마다 같다) */
async function fixSeed(page: Page, seed: number) {
  await page.addInitScript((s) => {
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = <T extends ArrayBufferView | null>(a: T): T => {
      if (a instanceof Uint32Array && a.length === 1) {
        a[0] = s;
        return a;
      }
      return real(a as never) as T;
    };
  }, seed);
}

const AMOUNT: Record<string, number> = { "": 1, "2": 2, "'": 3 };

/** 수 목록을 「표기」 배치 키로. 같은 면이 이어지면 합친다(합쳐 0이면 둘 다 없앤다) */
function notationKeys(tokens: string[]): string[] {
  const merged: { face: string; q: number }[] = [];
  for (const t of tokens) {
    const face = t[0] as string;
    const q = AMOUNT[t.slice(1)] as number;
    const last = merged.at(-1);
    if (last && last.face === face) {
      last.q = (last.q + q) % 4;
      if (last.q === 0) merged.pop();
    } else merged.push({ face, q });
  }
  return merged.flatMap(({ face, q }) => {
    const code = `Key${face}`;
    return q === 2 ? [code, code] : q === 3 ? [`Shift+${code}`] : [code];
  });
}

const invert = (t: string) =>
  t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : `${t}'`;

/**
 * OLL 1단계 「가로줄」 상황을 만드는 수(흰 면 위로 쥔 채). 흰 면을 아래로 쥐고(z2) `F R U R' U' F'`를 거꾸로 한 것과
 * 같은 상황을, 첫 수가 그 면인 꼴로(큐브를 y로 돌려 본 넷, 앞에 윗면 돌리기 D를 더한 하나). 섞기를 되돌리는 마지막 수와
 * 합쳐, 도중에 맞춘 큐브를 지나가지 않게 한다
 */
const LINE_SETUP: Record<string, string> = {
  F: "F D L D' L' F'",
  R: "R D F D' F' R'",
  B: "B D R D' R' B'",
  L: "L D B D' B' L'",
  D: "D F D L D' L' F'",
};

test(
  "공식 보기: 맞추는 동안 지금 상황의 공식 하나, 잠깐 보이고 횟수·시간 제한, 기록에 힌트 횟수",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 키보드 조작은 데스크톱만
    await fixSeed(page, 20261109);
    await page.setViewportSize({ width: 320, height: 380 });
    await installClock(page);
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    const card = page.locator("[data-mini-hint-card]");
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await pauseClock(page);
    await fromApp(page, { type: "focus", focused: true });

    // 섞기 전에는 볼 것이 없다
    await page.keyboard.press("Backslash");
    await expect(main).toHaveAttribute("data-mini-hint-msg", /섞은 뒤/);
    await page.clock.fastForward(2000);
    await expect(main).not.toHaveAttribute("data-mini-hint-msg");

    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const scramble = ((await main.getAttribute("data-mini-scramble")) ?? "")
      .trim()
      .split(/\s+/);
    const undo = [...scramble].reverse().map(invert);
    // 섞기를 되돌리는 마지막 수와 가로줄 상황의 첫 수를 같은 면으로 맞춰 합친다. 마지막 수가 윗면(흰 면)이면 D 꼴을 쓰고,
    // U와 D는 서로 바꿔 둬도 같아 D를 그 앞에 둔다(어느 쪽이든 맞춘 큐브를 지나가지 않는다)
    const last = undo.at(-1) as string;
    const lastFace = last[0] === "U" ? "D" : (last[0] as string);
    const setup = (LINE_SETUP[lastFace] as string).split(" ");
    const toCase =
      last[0] === "U"
        ? [...undo.slice(0, -1), "D", last, ...setup.slice(1)]
        : [...undo, ...setup];

    // 1번째: 섞인 큐브에는 십자 수(창이 넉넉해 창 안에 단계·공식·키캡)
    await page.keyboard.press("Backslash");
    await expect(main).toHaveAttribute("data-mini-hint", /\S/);
    await expect(main).toHaveAttribute("data-mini-hint-where", "inline");
    await expect(card).toHaveAttribute("data-mini-hint-card", "full");
    await expect(card).toContainText("십자");
    await expect(main).toHaveAttribute("data-mini-hints-used", "1");
    await shot(page, "mini-hint-cross", info.project.name);
    // 5초 뒤 사라진다
    await page.clock.fastForward(5000);
    await expect(main).toHaveAttribute("data-mini-hint", "");
    // 20초 안에는 다시 못 본다(남은 초)
    await page.keyboard.press("Backslash");
    await expect(main).toHaveAttribute(
      "data-mini-hint-msg",
      "15초 뒤에 다시 볼 수 있어요",
    );
    await page.clock.fastForward(15_000);

    // 2번째: 공식을 보다가 수를 두면 바로 사라진다
    const keys = notationKeys(toCase);
    await page.keyboard.press("Backslash");
    await expect(main).toHaveAttribute("data-mini-hint", /\S/);
    await page.keyboard.press(keys[0] as string);
    await expect(main).toHaveAttribute("data-mini-hint", "");
    // 섞기를 되돌리다 가로줄 상황으로(맞춘 큐브를 지나가지 않는다)
    for (const k of keys.slice(1)) await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-mini-phase", "solving");

    // 3번째: 가로줄 상황의 공식과 쥐는 법(흰 면이 위라 돌리기부터)
    await page.clock.fastForward(20_000);
    await page.keyboard.press("Backslash");
    await expect(main).toHaveAttribute("data-mini-hint", "F R U R' U' F'");
    await expect(main).toHaveAttribute("data-mini-hint-before", /^[xz]/);
    await expect(card).toContainText("OLL 1단계(노란 십자)");
    await expect(card).toContainText("엣지: 가로줄");
    await expect(main).toHaveAttribute("data-mini-hints-used", "3");
    await shot(page, "mini-hint-oll", info.project.name);
    // 한 판에 세 번까지
    await page.clock.fastForward(20_000);
    await page.keyboard.press("Backslash");
    await expect(main).toHaveAttribute(
      "data-mini-hint-msg",
      "이번 판 3번 다 봤어요",
    );

    // 상황을 되돌려 맞추면 기록에 힌트 3번
    for (const k of notationKeys([...setup].reverse().map(invert)))
      await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-mini-phase", "done");
    await fromApp(page, { type: "records", open: true });
    await expect(
      page
        .locator("[data-mini-record]")
        .first()
        .locator("[data-mini-record-hints]"),
    ).toHaveText("힌트 3번");
    // 새로 섞으면 횟수는 처음으로
    await fromApp(page, { type: "records", open: false });
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await expect(main).toHaveAttribute("data-mini-hints-used", "0");
  },
);

test(
  "공식 보기: 작은 앱 창은 앱 말풍선으로 보내고, 말풍선이 없는 옛 앱은 창 안에 작게",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    // 키보드 조작은 데스크톱만
    await fakeApp(page);
    await page.setViewportSize({ width: 96, height: 96 });
    await installClock(page);
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await pauseClock(page);
    await fromApp(page, { type: "focus", focused: true });
    await fromApp(page, { type: "scramble" });
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    type Sent = {
      type: string;
      lines?: { text: string; style: string }[] | null;
    };
    const lastHint = () =>
      page.evaluate(() =>
        (window as unknown as { __toApp: Sent[] }).__toApp
          .filter((m) => m.type === "hint")
          .at(-1),
      );

    // 옛 앱(말풍선 없음): 96px 창 안에 공식만 작게. 앱 메뉴 「공식 보기」
    await fromApp(page, { type: "hint" });
    await expect(main).toHaveAttribute("data-mini-hint-where", "inline");
    await expect(page.locator("[data-mini-hint-card]")).toHaveAttribute(
      "data-mini-hint-card",
      "small",
    );
    await shot(page, "mini-hint-small", info.project.name);
    await page.clock.fastForward(20_000);

    // 0.1.3 앱: 말풍선으로 줄을 보내고, 수를 두면 숨기기(null)
    await fromApp(page, { type: "caps", hintBubble: true });
    await page.keyboard.press("Backslash");
    await expect(main).toHaveAttribute("data-mini-hint-where", "bubble");
    await expect(page.locator("[data-mini-hint-card]")).toHaveCount(0);
    await expect
      .poll(async () => (await lastHint())?.lines?.[0]?.style)
      .toBe("title");
    const styles = ((await lastHint())?.lines ?? []).map((l) => l.style);
    expect(styles).toContain("alg");
    expect(styles).toContain("keys");
    await page.keyboard.press("KeyR");
    await expect.poll(async () => (await lastHint())?.lines).toBeNull();

    // 큰 크기는 판정이 없다(말풍선에 그 알림)
    await fromApp(page, { type: "size", n: 5 });
    await expect(main).toHaveAttribute("data-mini-n", "5");
    await fromApp(page, { type: "scramble" });
    await expect(main).toHaveAttribute("data-mini-phase", "ready", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await page.keyboard.press("Backslash");
    await expect
      .poll(async () => (await lastHint())?.lines?.[0]?.text)
      .toBe("이 크기는 힌트 없음");
  },
);

// ── 공식 연습(docs/47 16-11) ───────────────────────────────

/** 공식 낱말(면 돌리기만)을 「표기」 배치 키로. R2는 같은 키 두 번(반 바퀴를 나눠 쳐도 맞다) */
function formulaKeys(alg: string): string[] {
  return alg
    .trim()
    .split(/\s+/)
    .flatMap((t) => {
      const code = `Key${t[0] as string}`;
      if (t.endsWith("2")) return [code, code];
      return [t.endsWith("'") ? `Shift+${code}` : code];
    });
}

type PracticeSent = {
  type: string;
  lines?: { text: string; style: string }[] | null;
  practice?: string | null;
  practiceStages?: { id: string; title: string; group: string }[];
};

const sentLast = (page: Page, type: string) =>
  page.evaluate(
    (t) =>
      (window as unknown as { __toApp: PracticeSent[] }).__toApp
        .filter((m) => m.type === t)
        .at(-1),
    type,
  );

/** 연습 한 판의 남은 문제를 끝까지 친다(문제마다 맞춤 표시 0.7초를 시계로 감는다) */
async function finishRound(page: Page) {
  const main = page.locator("main[data-mini]");
  for (;;) {
    const phase = await main.getAttribute("data-mini-practice-phase");
    if (phase === "over") return;
    expect(phase).toBe("play");
    const index = (await main.getAttribute(
      "data-mini-practice-index",
    )) as string;
    const answer = (await main.getAttribute(
      "data-mini-practice-answer",
    )) as string;
    for (const k of formulaKeys(answer)) await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-mini-practice-phase", "pause");
    await expect(page.locator("[data-mini-practice-ok]")).toHaveCount(1);
    await page.clock.fastForward(700);
    await expect(main).not.toHaveAttribute("data-mini-practice-index", index);
  }
}

/** 첫 낱말과 다른 면의 키(틀린 수) */
const wrongKey = (first: string) => (first.startsWith("D") ? "KeyB" : "KeyD");

test(
  "공식 연습: 작은 앱 창은 말풍선에 공식만(키는 틀린 한 수만), 10문제 뒤 판 끝 결과, Esc로 끝내기",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    await fakeApp(page);
    await fixSeed(page, 20261110);
    await page.setViewportSize({ width: 96, height: 96 });
    await installClock(page);
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await pauseClock(page);
    await fromApp(page, { type: "focus", focused: true });
    await fromApp(page, { type: "caps", hintBubble: true });

    // 메뉴에 보일 단계를 앱에 알린다(사이트 연습 단계 그대로)
    await expect
      .poll(async () => (await sentLast(page, "state"))?.practiceStages?.length)
      .toBe(12);
    expect((await sentLast(page, "state"))?.practice).toBeNull();

    // 앱 메뉴 「공식 연습 ▸ 2층」
    await fromApp(page, { type: "practice", stage: "beginner-second" });
    await expect(main).toHaveAttribute("data-mini-practice", "beginner-second");
    await expect(main).toHaveAttribute("data-mini-practice-where", "bubble");
    await expect
      .poll(async () => (await sentLast(page, "state"))?.practice)
      .toBe("beginner-second");
    await expect
      .poll(async () => (await sentLast(page, "hint"))?.lines?.[0]?.text)
      .toBe("2층 1/10 · 콤보 0");
    let lines = (await sentLast(page, "hint"))?.lines ?? [];
    const answer = (await main.getAttribute(
      "data-mini-practice-answer",
    )) as string;
    expect(lines.find((l) => l.style === "alg")?.text).toBe(answer);
    // 따라 치기는 키를 보이지 않는다
    expect(lines.some((l) => l.style === "keys")).toBe(false);
    await expect(page.locator("[data-mini-practice-card]")).toHaveCount(0);

    // 틀린 수: 큐브에 넣지 않고 그 한 수의 키만 잠깐
    const first = answer.split(" ")[0] as string;
    await page.keyboard.press(wrongKey(first));
    await expect(main).toHaveAttribute("data-mini-practice-wrong", first);
    await expect(main).toHaveAttribute("data-mini-practice-index", "0");
    await expect
      .poll(
        async () =>
          (await sentLast(page, "hint"))?.lines?.find((l) => l.style === "keys")
            ?.text,
      )
      .toMatch(/^\S+ {2}\S/);
    lines = (await sentLast(page, "hint"))?.lines ?? [];
    expect(lines.find((l) => l.style === "keys")?.text.split("  ")[0]).toBe(
      first,
    );
    await page.clock.fastForward(1500);
    await expect(main).not.toHaveAttribute("data-mini-practice-wrong", /.+/);

    // 10문제를 끊김 없이 치면 판 끝 결과(말풍선)
    await finishRound(page);
    await expect
      .poll(async () => (await sentLast(page, "hint"))?.lines?.[0]?.text)
      .toBe("2층 한 판 끝");
    const texts = ((await sentLast(page, "hint"))?.lines ?? []).map(
      (l) => l.text,
    );
    expect(texts.some((t) => /^정확도 \d+% · 평균 /.test(t))).toBe(true);
    expect(texts).toContain("느렸던 공식");
    expect(texts.at(-1)).toBe("Enter 한 판 더 · Esc 연습 끝내기");

    // 연습은 맞추기 기록에 남지 않고, 연습 기록은 앱 저장소의 cube.mini. 아래에
    expect(
      (await page.evaluate(() => localStorage.getItem("cube.mini.v1"))) ?? "",
    ).not.toContain('"ms"');
    expect(
      await page.evaluate(() => localStorage.getItem("cube.mini.practice.v1")),
    ).toContain('"beginner-second"');
    expect(
      await page.evaluate(() => localStorage.getItem("cube.practice.v1")),
    ).toBeNull();

    // 섞기 키(Enter)는 판 끝에서 「한 판 더」
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-mini-practice-phase", "play");
    await expect(main).toHaveAttribute("data-mini-practice-index", "0");

    // 포커스를 잃으면 말풍선을 숨긴다(다른 앱을 쓰는 동안 화면에 남지 않게)
    await fromApp(page, { type: "focus", focused: false });
    await expect
      .poll(async () => (await sentLast(page, "hint"))?.lines)
      .toBeNull();
    await fromApp(page, { type: "focus", focused: true });

    // Esc(앱이 가로채 practice null로 보낸다): 연습 끝내기, 맞추기로
    await fromApp(page, { type: "practice", stage: null });
    await expect(main).not.toHaveAttribute("data-mini-practice", /.+/);
    await expect
      .poll(async () => (await sentLast(page, "hint"))?.lines)
      .toBeNull();
    await expect
      .poll(async () => (await sentLast(page, "state"))?.practice)
      .toBeNull();
  },
);

test(
  "공식 연습: 큰 창은 창 안에, 구석 메뉴로 시작, 틀린 한 수만 키캡, 판 끝 결과, Esc로 끝내기",
  { tag: "@only-desktop" },
  async ({ page }, info) => {
    await fixSeed(page, 20261110);
    await page.setViewportSize({ width: 360, height: 360 });
    await installClock(page);
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await pauseClock(page);
    await page.locator("[data-mini-menu]").click();
    await page.locator('[data-mini-item="practice"]').click();
    await page.locator('[data-mini-practice-stage="beginner-second"]').click();
    await expect(main).toHaveAttribute("data-mini-practice", "beginner-second");
    await expect(main).toHaveAttribute("data-mini-practice-where", "inline");
    const card = page.locator("[data-mini-practice-card]");
    await expect(card).toHaveAttribute("data-mini-practice-card", "full");
    await expect(card.locator("[data-mini-practice-name]")).not.toBeEmpty();
    await expect(card.locator('[data-token-state="now"]')).toHaveCount(1);
    // 키는 숨긴다
    await expect(page.locator("[data-mini-practice-wrong-keys]")).toHaveCount(
      0,
    );
    await shot(page, "mini-practice-inline", info.project.name);

    const answer = (await main.getAttribute(
      "data-mini-practice-answer",
    )) as string;
    await page.keyboard.press(wrongKey(answer.split(" ")[0] as string));
    await expect(card.locator('[data-token-state="wrong"]')).toHaveCount(1);
    await expect(page.locator("[data-mini-practice-wrong-keys]")).toHaveCount(
      1,
    );
    await shot(page, "mini-practice-wrong", info.project.name);
    await page.clock.fastForward(1500);
    await expect(page.locator("[data-mini-practice-wrong-keys]")).toHaveCount(
      0,
    );

    await finishRound(page);
    const summary = page.locator("[data-mini-practice-summary]");
    await expect(summary).toBeVisible();
    await expect(summary.locator('[data-stat="accuracy"] dd')).toHaveText(
      /^\d+%$/,
    );
    // 첫 문제에서 한 번 틀려 그 뒤 아홉 문제가 이어진 콤보
    await expect(summary.locator('[data-stat="combo"] dd')).toHaveText("9");
    await expect(
      summary.locator("[data-mini-practice-slow] li"),
    ).not.toHaveCount(0);
    await shot(page, "mini-practice-summary", info.project.name);

    await page.keyboard.press("Escape");
    await expect(main).not.toHaveAttribute("data-mini-practice", /.+/);
    await expect(summary).toHaveCount(0);
  },
);

test(
  "섞기 연출: 3×3은 섞기 수를 하나씩 빠르게 돌리고, 키를 누르면 바로 끝내 그 수를 넣는다. 7×7은 0.5초 짧은 연출",
  { tag: ["@3d", "@only-desktop"] },
  async ({ page }, info) => {
    // 키보드 조작은 데스크톱만
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 200, height: 200 });
    await installClock(page);
    await fakeApp(page);
    await page.goto("/cube/mini");
    const main = page.locator("main[data-mini]");
    await expect(page.locator("[data-cube-canvas]")).toHaveAttribute(
      "data-cube-ready",
      "",
      SCENE,
    );
    await expect(main).toHaveAttribute("data-input-ready", "", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await pauseClock(page);
    await fromApp(page, { type: "focus", focused: true });
    const showing = async () =>
      (await main.getAttribute("data-scramble-show")) === "on";

    // 하나씩 빠르게: 3×3 섞기(약 20수)는 1초 안팎이면 끝난다
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-scramble-show", "on", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await expect(main).toHaveAttribute("data-mini-phase", "ready");
    await page.clock.fastForward(400);
    await expect(main).toHaveAttribute("data-scramble-show", "on");
    await shot(page, "mini-scramble-moves", info.project.name);
    await fastForwardUntil(page, async () => !(await showing()), {
      step: 50,
      timeout: 10_000,
    });
    await shot(page, "mini-scramble-moves-done", info.project.name);

    // 연출 중 키: 바로 섞인 모양으로 두고 그 수부터 잰다
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-scramble-show", "on", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    const keys = inverseKeys(
      (await main.getAttribute("data-mini-scramble")) ?? "",
    );
    await page.keyboard.press(keys[0] as string);
    await expect(main).not.toHaveAttribute("data-scramble-show", /on/);
    await expect(main).toHaveAttribute("data-mini-phase", "solving");
    for (const k of keys.slice(1)) await page.keyboard.press(k);
    await expect(main).toHaveAttribute("data-mini-phase", "done");

    // 짧은 연출: 6×6·7×7은 크기와 상관없이 0.5초
    await fromApp(page, { type: "size", n: 7 });
    await expect(main).toHaveAttribute("data-mini-n", "7");
    await expect(page.locator("[data-cube-canvas]")).toHaveAttribute(
      "data-cube-ready",
      "",
      SCENE,
    );
    await page.keyboard.press("Enter");
    await expect(main).toHaveAttribute("data-scramble-show", "on", {
      timeout: SCRAMBLE_TIMEOUT,
    });
    await page.clock.fastForward(200);
    await shot(page, "mini-scramble-spin", info.project.name);
    await page.clock.fastForward(200);
    expect(await showing()).toBe(true);
    await fastForwardUntil(page, async () => !(await showing()), {
      step: 50,
      timeout: 10_000,
    });
  },
);
