// 윷 던지기 3D 연출의 성능을 실제 시간으로 잰다(docs/37 14-5). 화면 시험은 시계를 잡아 그리기 시간을 잴 수 없어 따로 둔다.
// 빌드한 out/을 띄운 서버 주소를 준다: node scripts/measure-yut-toss.mjs http://localhost:4391 [CPU 느림 배수]
// 휴대폰 세로 크기(390×844, 배율 3)에서 혼자 하기를 열고, 내 차례에 한 번 던져 연출이 끝날 때까지
// 그리기 한 장 시간(renderer.render, CPU 쪽)과 화면 간격(requestAnimationFrame 사이)을 모으고,
// 3D 장면을 붙이기 전·후의 JS 메모리(CDP Performance.getMetrics)를 잰다.
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4391";
const slow = Number(process.argv[3] ?? 4);
// 넷째 값 soft: GPU 없이 소프트웨어로 그린다(SwiftShader, 느린 기기 대신)
const soft = process.argv[4] === "soft";

// 화면 시험과 같은 브라우저(패치된 시스템 Chrome, 샌드박스 켬, e2e/browser.ts)
const browser = await chromium.launch({
  channel: "chrome",
  chromiumSandbox: true,
  ...(soft
    ? { args: ["--use-angle=swiftshader", "--use-gl=angle", "--disable-gpu"] }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "no-preference",
});
await context.addInitScript(() => {
  sessionStorage.setItem("mighty-splash-seen", "1");
  localStorage.removeItem("yut-save");
  localStorage.setItem(
    "mighty-settings",
    JSON.stringify({ state: { sound: false }, version: 0 }),
  );
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
if (slow > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: slow });
const heapMb = async () => {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  return (
    (metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0) / 2 ** 20
  );
};

await page.goto(`${base}/yut`);
await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
await page.getByRole("button", { name: "옵션" }).click();
await page.getByRole("button", { name: "입문", exact: true }).click();
await page.getByRole("button", { name: "2개", exact: true }).click();
await page.getByRole("button", { name: "처음으로" }).click();
const before = await heapMb();
const t0 = Date.now();
await page.getByRole("button", { name: /나홀로 윷놀이/ }).click();
await page.locator('[data-toss-3d="ready"]').waitFor({ timeout: 60_000 });
const loadMs = Date.now() - t0;
const after = await heapMb();

// 내 차례가 올 때까지(컴퓨터가 먼저면 그 연출이 끝날 때까지)
const pad = page.locator("[data-throw]");
await pad.waitFor({ state: "visible", timeout: 60_000 });
await page.evaluate(() => {
  const w = window;
  w.__gaps = [];
  let last = performance.now();
  const tick = (now) => {
    w.__gaps.push(now - last);
    last = now;
    if (w.__gaps.length < 2000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const plays = await page.evaluate(() => window.__yutToss?.plays ?? 0);
const box = await pad.boundingBox();
const reach = Math.max(150, Math.round(844 * 0.3));
const x = box.x + box.width / 2;
const y = box.y + 40;
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x, y + reach * 0.5, { steps: 6 });
await page.mouse.move(x, y + reach * 0.5 - 30, { steps: 10 });
await page.mouse.up();
// 연출이 시작해서 끝날 때까지 화면 간격을 모은다
await page.waitForFunction(
  () => document.querySelector('[data-toss="playing"]'),
  null,
  { timeout: 30_000 },
);
const start = await page.evaluate(() => window.__gaps.length);
await page.waitForFunction((n) => (window.__yutToss?.plays ?? 0) > n, plays, {
  timeout: 60_000,
});
const result = await page.evaluate((from) => {
  const gaps = window.__gaps.slice(from).sort((a, b) => a - b);
  const pick = (q) =>
    gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))];
  return {
    toss: window.__yutToss,
    frames: gaps.length,
    gapMedian: pick(0.5),
    gapP95: pick(0.95),
    gapMax: gaps.at(-1),
  };
}, start);
console.log(
  JSON.stringify(
    {
      cpuSlow: slow,
      loadMs,
      heapMb: { before: before.toFixed(1), after3d: after.toFixed(1) },
      render: result.toss,
      rafGapMs: {
        median: result.gapMedian,
        p95: result.gapP95,
        max: result.gapMax,
        frames: result.frames,
      },
    },
    null,
    2,
  ),
);
await browser.close();
