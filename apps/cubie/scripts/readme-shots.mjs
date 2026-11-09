#!/usr/bin/env node
// README(apps/cubie/README.md)의 그림을 만든다. 앱을 띄우지 않는다(사용자 화면을 건드리지 않게).
//
// **흉내다**: Cubie 앱이 여는 것과 같은 웹 미니 모드(/cube/mini)를 헤드리스 Chrome에서 앱처럼 열고
// (앱 다리 `webkit.messageHandlers.cubie`를 흉내 내고, 앱이 넣는 투명 바탕 CSS를 똑같이 넣는다) 투명 바탕으로
// 찍은 뒤, 이 스크립트가 그린 바탕화면 위 오른쪽 아래에 얹는다. 메뉴 막대·문서 창·바탕화면은 그림이고 실제 맥 화면이
// 아니다. 기록 창도 앱이 보통 창으로 여는 `/cube/mini?view=records`를 그 크기(380×600)로 찍어 창 틀을 그려 얹었다.
//
//   pnpm --filter @game/web build
//   pnpm --filter @game/web exec serve out -l 4391     # 다른 터미널
//   node apps/cubie/scripts/readme-shots.mjs [http://localhost:4391]
//
// 결과: apps/cubie/docs/*.png, hero.gif·hero.webp(홈 시연을 섞고 맞추는 움직이는 그림). ffmpeg가 있어야 한다.
// 시간은 Playwright 가짜 시계로 감아서 맞추는 기록의 시간·떠 있을 때 움직임이 기기 속도와 상관없이 같게 나온다.
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "../docs");
const require = createRequire(path.join(here, "../../web/package.json"));
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
/** `--hero`: 움직이는 그림만 다시 만든다. `--keep <폴더>`: 찍은 프레임을 그 폴더에 남긴다(고를 때 보기) */
const HERO_ONLY = args.includes("--hero");
const KEEP = args.includes("--keep") ? args[args.indexOf("--keep") + 1] : null;
const BASE = args.find((a) => a.startsWith("http")) ?? "http://localhost:4391";
const CLOCK_START = Date.UTC(2026, 10, 9, 7, 0);

/** 앱이 넣는 것과 같은 투명 바탕(CubeWindow.swift)과 앱 다리 흉내, 「표기」 키 배치(시험이 키로 맞추기 쉽게) */
function appLike() {
  window.webkit = { messageHandlers: { cubie: { postMessage() {} } } };
  localStorage.setItem(
    "cube.keymap.v1",
    JSON.stringify({
      version: 1,
      preset: "notation",
      bindings: [],
      mouseRotate: false,
    }),
  );
  if (!location.search.includes("view=")) {
    const put = () => {
      const s = document.createElement("style");
      s.textContent =
        "html,body,main[data-mini]{background:transparent!important}";
      document.head.append(s);
    };
    if (document.head) put();
    else document.addEventListener("DOMContentLoaded", put);
  }
}

const fromApp = (page, detail) =>
  page.evaluate(
    (d) => window.dispatchEvent(new CustomEvent("cubie", { detail: d })),
    detail,
  );

async function waitAttr(page, sel, attr, value, timeout = 60_000) {
  await page.waitForFunction(
    ([s, a, v]) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const got = el.getAttribute(a);
      return v === null ? got !== null : got === v;
    },
    [sel, attr, value],
    { timeout, polling: 50 },
  );
}

/** 섞기 글의 거꾸로를 「표기」 배치 키로 */
function inverseKeys(scramble) {
  const keys = [];
  for (const token of scramble.trim().split(/\s+/).reverse()) {
    const code = `Key${token[0]}`;
    if (token.endsWith("2")) keys.push(code, code);
    else if (token.endsWith("'")) keys.push(code);
    else keys.push(`Shift+${code}`);
  }
  return keys;
}

async function cubePage(
  browser,
  size,
  { motion = false, settings = null } = {},
) {
  const ctx = await browser.newContext({
    viewport: { width: size, height: size },
    deviceScaleFactor: 2,
    reducedMotion: motion ? "no-preference" : "reduce",
    colorScheme: "dark",
  });
  await ctx.addInitScript(appLike);
  if (settings)
    await ctx.addInitScript(
      (s) => localStorage.setItem("cube.settings.v1", s),
      JSON.stringify(settings),
    );
  const page = await ctx.newPage();
  await page.clock.install({ time: CLOCK_START });
  await page.goto(`${BASE}/cube/mini`);
  await waitAttr(page, "[data-cube-canvas]", "data-cube-ready", null);
  await waitAttr(page, "main[data-mini]", "data-input-ready", null);
  return page;
}

/** 한 판을 섞고 `seconds`초 동안 키로 맞춘다(포커스 있음). 수 사이 시간을 가짜 시계로 고르게 둔다 */
async function solveOnce(page, seconds) {
  await page.keyboard.press("Enter");
  await waitAttr(page, "main[data-mini]", "data-mini-phase", "ready");
  const scramble = await page
    .locator("main[data-mini]")
    .getAttribute("data-mini-scramble");
  const keys = inverseKeys(scramble);
  const gap = Math.round((seconds * 1000) / (keys.length - 1));
  for (const [i, k] of keys.entries()) {
    if (i > 0) await page.clock.runFor(gap);
    await page.keyboard.press(k);
  }
  await waitAttr(page, "main[data-mini]", "data-mini-phase", "done");
}

const shot = (page) => page.screenshot({ omitBackground: true, type: "png" });
const dataUrl = (buf) => `data:image/png;base64,${buf.toString("base64")}`;

/**
 * 바탕화면 그림(흉내). 밤하늘 남색 바탕에 보랏빛 빛무리(앱 아이콘과 같은 색), 위 메뉴 막대, 왼쪽에 하던 일 창.
 * 큐브 창은 오른쪽 아래 구석에서 16pt 안쪽(앱의 처음 자리와 같다)
 */
function desktopHtml({ cube, cubeSize, window: win }) {
  const lines = Array.from({ length: 14 }, (_, i) => {
    const w = [72, 54, 88, 40, 66, 80, 30, 76, 58, 84, 46, 70, 62, 36][i];
    return `<div class="ln" style="width:${w}%"></div>`;
  }).join("");
  return `<!doctype html><html><head><meta name="color-scheme" content="dark"><style>
  html,body{margin:0;height:100%;font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:#e8e8f0}
  body{position:relative;overflow:hidden;background:
    radial-gradient(60% 70% at 78% 85%, #6d4bd8aa, transparent 70%),
    radial-gradient(50% 60% at 15% 10%, #2a6fdb66, transparent 70%),
    linear-gradient(160deg,#141a3a,#0c1028 55%,#1b1240)}
  .bar{position:absolute;inset:0 0 auto 0;height:26px;background:#1a1d2ecc;display:flex;align-items:center;
    justify-content:flex-end;gap:14px;padding:0 14px;font-size:13px;color:#f2f2f7}
  .bar img{height:16px;filter:invert(1)}
  .doc{position:absolute;left:56px;top:70px;width:520px;height:380px;border-radius:12px;background:#22252f;
    box-shadow:0 20px 60px #0008;overflow:hidden}
  .doc .tb,.rec .tb{height:30px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#2c2f3a}
  .dot{width:11px;height:11px;border-radius:50%;background:#5a5d68}
  .doc .body{padding:22px 26px;display:flex;flex-direction:column;gap:12px}
  .ln{height:9px;border-radius:5px;background:#3a3e4c}
  .rec{position:absolute;border-radius:12px;background:#0a0a0a;box-shadow:0 20px 60px #000a;overflow:hidden}
  .rec .tb{justify-content:flex-start;font-size:12px;color:#c8c8d0}
  .rec .tb span{flex:1;text-align:center;margin-right:50px}
  .cube{position:absolute;right:16px;bottom:16px}
  </style></head><body>
  <div class="bar"><img src="${menuIcon}"><span>11월 9일 (월) 오후 4:20</span></div>
  <div class="doc"><div class="tb"><i class="dot"></i><i class="dot"></i><i class="dot"></i></div><div class="body">${lines}</div></div>
  ${win ? `<div class="rec" style="left:${win.left}px;top:${win.top}px;width:${win.w}px"><div class="tb"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span>${win.title}</span></div><img src="${win.src}" style="display:block;width:${win.w}px;height:${win.h}px"></div>` : ""}
  <img class="cube" src="${cube}" style="width:${cubeSize}px;height:${cubeSize}px">
  </body></html>`;
}

let menuIcon = "";

async function compose(browser, file, html, { width, height }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.waitForFunction(() =>
    [...document.images].every((i) => i.complete),
  );
  const png = path.join(
    mkdtempSync(path.join(tmpdir(), "cubie-shot-")),
    "shot.png",
  );
  await page.screenshot({ path: png });
  await ctx.close();
  // 바탕 빛무리가 있어 PNG는 한 장 약 0.5MB라 WebP(손실, 품질 88. 기록 창 글자가 번지지 않는 값)로 줄인다
  const out = path.join(OUT, file.replace(/\.png$/, ".webp"));
  execFileSync("cwebp", ["-quiet", "-q", "88", "-m", "6", png, "-o", out]);
  rmSync(path.dirname(png), { recursive: true, force: true });
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  menuIcon = dataUrl(
    readFileSync(path.join(here, "../Resources/MenuIcon@2x.png")),
  );
  // README 맨 위 아이콘: 앱 아이콘(Resources/AppIcon.icns, make-icon.swift)의 가장 큰 판을 256px로
  const iconTmp = mkdtempSync(path.join(tmpdir(), "cubie-icon-"));
  execFileSync(
    "sips",
    [
      "-s",
      "format",
      "png",
      path.join(here, "../Resources/AppIcon.icns"),
      "--out",
      path.join(iconTmp, "icon.png"),
    ],
    { stdio: "ignore" },
  );
  execFileSync("magick", [
    path.join(iconTmp, "icon.png"),
    "-resize",
    "256x256",
    "-strip",
    path.join(OUT, "icon.png"),
  ]);
  rmSync(iconTmp, { recursive: true, force: true });
  const browser = await chromium.launch({
    channel: "chrome",
    chromiumSandbox: true,
  });
  const CUBE = 150;
  const DESK = { width: 900, height: 560 };
  try {
    if (HERO_ONLY) return await heroFrames(browser);
    // 1) 맞추는 중: 섞고 몇 수 둔 큐브와 거울(거울은 직접 맞추는 동안만 보인다)
    const p = await cubePage(browser, CUBE);
    await fromApp(p, { type: "focus", focused: true });
    // 기록 다섯 판(티어는 최고 Ao5로 매긴다). 시간은 가짜 시계로 정한다
    for (const s of [24.3, 21.8, 26.1, 19.7, 22.4]) await solveOnce(p, s);
    const solved = await shot(p);
    await p.keyboard.press("Enter");
    await waitAttr(p, "main[data-mini]", "data-mini-phase", "ready");
    await p.keyboard.press("KeyR");
    await waitAttr(p, "main[data-mini]", "data-mini-mirror-shown", null);
    await p.clock.runFor(800);
    const scrambled = await shot(p);
    // 기록 창: 같은 기기 저장소를 쓰도록 같은 페이지에서 연다
    const storage = await p.evaluate(() => JSON.stringify({ ...localStorage }));
    await p.context().close();

    await compose(
      browser,
      "desktop-solving.png",
      desktopHtml({ cube: dataUrl(scrambled), cubeSize: CUBE }),
      DESK,
    );
    await compose(
      browser,
      "desktop-solved.png",
      desktopHtml({ cube: dataUrl(solved), cubeSize: CUBE }),
      DESK,
    );

    const recCtx = await browser.newContext({
      viewport: { width: 380, height: 520 },
      deviceScaleFactor: 2,
      reducedMotion: "no-preference",
      colorScheme: "dark",
    });
    await recCtx.addInitScript((s) => {
      for (const [k, v] of Object.entries(JSON.parse(s)))
        localStorage.setItem(k, v);
    }, storage);
    const r = await recCtx.newPage();
    await r.clock.install({ time: CLOCK_START + 3_600_000 });
    await r.goto(`${BASE}/cube/mini?view=records`);
    await r.locator("[data-mini-records]").waitFor();
    await r.clock.runFor(500);
    const records = await r.screenshot({ type: "png" });
    await r.locator("[data-mini-replay-open]").first().click();
    await r.locator("[data-mini-replay]").waitFor();
    await r.clock.runFor(9_000);
    const replay = await r.screenshot({ type: "png" });
    await recCtx.close();

    for (const [file, src, title] of [
      ["desktop-records.png", records, "Cubie 기록"],
      ["desktop-replay.png", replay, "Cubie 기록"],
    ]) {
      await compose(
        browser,
        file,
        desktopHtml({
          cube: dataUrl(solved),
          cubeSize: CUBE,
          window: {
            left: 330,
            top: 14,
            w: 380,
            h: 520,
            src: dataUrl(src),
            title,
          },
        }).replace('<div class="doc">', '<div class="doc" style="opacity:.6">'),
        { width: DESK.width, height: DESK.height + 0 },
      );
    }

    // 2) 홈 시연(맞춘 큐브가 가만히 떠 있을 때 섞고 맞추는 연출). 기록이 없어야 내 판 다시 보기 대신 이것이 돈다
    await heroFrames(browser);
  } finally {
    await browser.close();
  }
}

/**
 * 홈 시연(맞춘 큐브가 가만히 떠 있을 때 섞고 맞추는 연출, docs/47 15-5)을 찍어 GIF·WebP로 묶는다.
 * 앱의 기본(해법 번갈아 고르기) 대신 프리드리히(CFOP)로 둔다. 수가 적어 빠르게 돌려도 알아볼 만하다.
 * 시연 한 판을 `PLAY_SECONDS`초 안팎으로 빠르게 돌린다
 */
const PLAY_SECONDS = 7;
const PLAY_FPS = 25; // GIF 지연은 1/100초 단위라 4/100초(25장)로 맞춘다
const STEP = 100; // 가짜 시계로 감는 한 장 사이(ms)

async function heroFrames(browser) {
  const SIZE = 150;
  const page = await cubePage(browser, SIZE, {
    motion: true,
    settings: { version: 1, heroSize: 3, heroMethod: "3-cfop" },
  });
  await fromApp(page, { type: "focus", focused: false });
  await waitAttr(page, "main[data-mini]", "data-mini-idle-armed", null);
  // 맞춘 모습을 조금 앞에 둔다(떠 있을 때 움직임은 포커스를 잃고 60초 뒤)
  await page.clock.runFor(59_500);
  const dir = KEEP ?? mkdtempSync(path.join(tmpdir(), "cubie-hero-"));
  mkdirSync(dir, { recursive: true });
  const shots = [];
  let started = false;
  for (let t = 0; t < 120_000; t += STEP) {
    const file = path.join(dir, `${String(shots.length).padStart(4, "0")}.png`);
    writeFileSync(file, await shot(page));
    shots.push(file);
    const idle = await page
      .locator("main[data-mini]")
      .getAttribute("data-mini-idle");
    if (idle) started = true;
    else if (started) break;
    await page.clock.runFor(STEP);
  }
  await page.context().close();
  const simSeconds = (shots.length * STEP) / 1000;
  const every = Math.max(
    1,
    Math.round(simSeconds / PLAY_SECONDS / PLAY_FPS / (STEP / 1000)),
  );
  const picked = shots.filter((_, i) => i % every === 0);
  console.log(
    `hero: ${shots.length}장(${simSeconds.toFixed(1)}초) → ${every}장마다 ${picked.length}장, ${(picked.length / PLAY_FPS).toFixed(1)}초`,
  );
  await encodeHero(browser, dir, picked, SIZE * 2);
  if (!KEEP) rmSync(dir, { recursive: true, force: true });
}

/**
 * 바탕: 바탕화면과 같은 남색에 둥근 모서리. 투명 GIF는 가장자리 알파가 한 비트라 밝은 README에서 큐브 둘레가
 * 들쭉날쭉하므로, 밝은·어두운 바탕 모두에서 한 장의 그림으로 보이게 바탕을 깐다(모서리 밖만 투명)
 */
async function encodeHero(browser, dir, picked, W) {
  const ctx = await browser.newContext({
    viewport: { width: W / 2, height: W / 2 },
    deviceScaleFactor: 2,
  });
  const bgPage = await ctx.newPage();
  await bgPage.setContent(
    `<body style="margin:0;background:transparent"><div style="width:${W / 2}px;height:${W / 2}px;border-radius:18px;background:radial-gradient(70% 70% at 70% 80%,#4a3a9a,#161a3a 75%)"></div></body>`,
  );
  const bg = path.join(dir, "bg.png");
  await bgPage.screenshot({ path: bg, omitBackground: true });
  await ctx.close();
  const comp = picked.map((f, i) => {
    const out = path.join(dir, `c${String(i).padStart(4, "0")}.png`);
    execFileSync("magick", [bg, f, "-composite", out]);
    return out;
  });
  // README에는 움직이는 WebP를 쓴다. 같은 프레임의 GIF(96색)는 2.1MB, WebP(손실, 품질 60)는 0.43MB였고
  // 바탕 빛무리도 WebP가 띠 없이 매끄럽다(2026-11-09). GIF는 견주기용으로 프레임 폴더에만 만든다
  const gif = path.join(dir, "hero.gif");
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-framerate",
    String(PLAY_FPS),
    "-i",
    path.join(dir, "c%04d.png"),
    "-filter_complex",
    "split[a][b];[a]palettegen=max_colors=96:reserve_transparent=1[p];[b][p]paletteuse=dither=none:diff_mode=rectangle:alpha_threshold=128",
    "-loop",
    "0",
    gif,
  ]);
  const webp = path.join(OUT, "hero.webp");
  execFileSync("img2webp", [
    "-loop",
    "0",
    "-min_size",
    "-lossy",
    "-q",
    "60",
    "-m",
    "6",
    "-d",
    String(Math.round(1000 / PLAY_FPS)),
    ...comp,
    "-o",
    webp,
  ]);
  const kb = (f) => `${Math.round(statSync(f).size / 1024)}KB`;
  console.log(`hero.webp ${kb(webp)} · 견주기 GIF ${kb(gif)}`);
  for (const f of comp) rmSync(f);
}

await main();
