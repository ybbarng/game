// 홈 시연 웹·네이티브 비교판(docs/52 5-6): 다시 볼 판이 없을 때 떠 있는 큐브가 사람 해법으로 푸는 연출이 같은지 본다.
// 네이티브는 화면 밖 스크린샷(창을 띄우지 않음)이 고른 멈춤 자리, 웹은 앱과 같은 엔진 WebKit(배율 2, 투명 바탕)으로 미니 화면을
// 열고 시계를 멈춘 채 같은 씨앗(Math.random을 mulberry32로)으로 홈 시연을 시작해 같은 시각까지 감아 찍는다.
//
//   apps/cubie/build.sh
//   CUBIE_NATIVE_SHOT=<폴더> CUBIE_NATIVE_SHOT_HERO=3-beginner:5 apps/cubie/Cubie.app/Contents/MacOS/Cubie
//   node apps/cubie/scripts/hero-compare.mjs <폴더> [사이트 주소, 기본 https://game.byb.kr]
//
// 결과: <폴더>/web-hero-<i>.png, <폴더>/compare-hero.png(위 줄 웹, 아래 줄 네이티브, 어두운 회색·#000 바탕).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../web/package.json"));
const { webkit } = require("@playwright/test");

const dir = path.resolve(process.argv[2] ?? ".");
const BASE = process.argv[3] ?? "https://game.byb.kr";
const SIDE = 96;

const [head, ...rest] = readFileSync(path.join(dir, "hero-frames.txt"), "utf8")
  .trim()
  .split("\n");
const [method, seedText] = head.split(" ");
const seed = Number(seedText);
const frames = rest.map((l) => {
  const [k, at] = l.split(" ").map(Number);
  return { k, at };
});

function appLike() {
  window.webkit = { messageHandlers: { cubie: { postMessage: () => {} } } };
  const put = () => {
    const s = document.createElement("style");
    s.textContent =
      "html,body,main[data-mini]{background:transparent!important}";
    document.head.append(s);
  };
  if (document.head) put();
  else document.addEventListener("DOMContentLoaded", put);
}

const browser = await webkit.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: SIDE, height: SIDE },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  await ctx.addInitScript(appLike);
  // 사이트 미니는 첫 화면 크기·해법 설정에서 해법을 고른다(번갈아면 초보자). 프리드리히를 견줄 때는 그것을 고른다
  if (method !== "3-beginner")
    await ctx.addInitScript(
      (m) =>
        localStorage.setItem(
          "cube.settings.v1",
          JSON.stringify({ heroSize: 3, heroMethod: m }),
        ),
      method,
    );
  const page = await ctx.newPage();
  await page.clock.install();
  await page.goto(`${BASE}/cube/mini`);
  await page.waitForSelector("[data-cube-canvas][data-cube-ready]", {
    timeout: 60_000,
  });
  await page.waitForSelector("main[data-mini][data-input-ready]", {
    timeout: 60_000,
  });
  const main = page.locator("main[data-mini]");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("cubie", { detail: { type: "focus", focused: false } }),
    ),
  );
  await main.and(page.locator("[data-mini-idle-armed]")).waitFor();
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 50);
  // 홈 시연의 섞기가 쓰는 난수를 코어와 같은 mulberry32(씨앗)로
  await page.evaluate((s) => {
    let state = s >>> 0;
    Math.random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
  await page.clock.fastForward(61_000);
  await main.and(page.locator("[data-mini-idle='hero']")).waitFor();
  const t0 = await page.evaluate(() => Date.now());
  // 풀이는 워커가 실제 시간으로 만든다: 섞기가 끝나기 전에 와 있게 잠깐 기다린다
  await page.waitForTimeout(3000);
  const shots = [];
  for (const [i, f] of frames.entries()) {
    const target = t0 + f.at - 120;
    const cur = await page.evaluate(() => Date.now());
    if (target > cur) await page.clock.runFor(target - cur);
    const buf = await page.screenshot({ omitBackground: true, type: "png" });
    writeFileSync(path.join(dir, `web-hero-${i}.png`), buf);
    shots.push(buf);
  }

  const img = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
  const native = (i) => readFileSync(path.join(dir, `native-hero-${i}.png`));
  const desks = { "어두운 회색": "#2a2b30", "#000": "#000" };
  const row = (title, desk, list) =>
    `<tr><th>${title}</th>${list
      .map(
        (b) =>
          `<td><div class="c" style="background:${desk}"><img src="${img(b)}"></div></td>`,
      )
      .join("")}</tr>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#888;font:12px -apple-system,sans-serif;color:#111}
    table{border-collapse:collapse} td,th{padding:4px} th{font-weight:600;text-align:center}
    .c{width:${SIDE}px;height:${SIDE}px} img{width:${SIDE}px;height:${SIDE}px;display:block}
  </style><table><tr><th>${method} 씨앗 ${seed}</th>${frames
    .map((f) => `<th>${f.k}수 앞<br>${(f.at / 1000).toFixed(1)}초</th>`)
    .join("")}</tr>
  ${Object.entries(desks)
    .map(
      ([name, desk]) =>
        row(`웹 · ${name}`, desk, shots) +
        row(
          `네이티브 · ${name}`,
          desk,
          frames.map((_, i) => native(i)),
        ),
    )
    .join("")}</table>`;
  const sheet = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width: 1400, height: 600 },
  });
  await sheet.setContent(html);
  await sheet
    .locator("table")
    .screenshot({ path: path.join(dir, "compare-hero.png") });
  console.log(path.join(dir, "compare-hero.png"));
} finally {
  await browser.close();
}
