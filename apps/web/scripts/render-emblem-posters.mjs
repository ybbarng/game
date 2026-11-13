/**
 * 3D 엠블럼을 미리 찍은 그림을 만든다(docs/47 14-7). 3D 모양·재질·빛·바탕색이 바뀌면 다시 찍는다. CI에서는 돌리지
 * 않는다(GPU 없는 브라우저는 그림이 다르게 나온다).
 *
 * 1) 대기 그림 `public/cube/tiers/emblem3d/<티어>-<바탕>.webp`(src/cube/tiers/emblem3d/poster.ts): 미리보기
 *    `/cube/tiers/emblems`의 큰 3D 칸이 첫 장(정면)을 그린 뒤, 그 캔버스를 화면에 보이는 그대로(2배 화소) 찍는다. 그래서
 *    대기 그림과 3D 첫 장은 같은 카메라·같은 크기·같은 바탕이다(고정 규칙 2-1절).
 * 2) 정지 그림 `public/cube/tiers/emblem3d/still/<티어>-<s|m|l>.webp`(emblem3d/still.ts): 정면 한 장, 투명 바탕. 티어표·
 *    기록·티어 화면이 쓴다. 작은 단계(s)는 작게 봐도 알아보게 엠블럼을 칸에 더 채우고 후광을 줄인다.
 * 3) Cubie 앱에 묶는 PNG `apps/cubie/Resources/Emblems/<티어>.png`(32pt·64px, 메뉴 프로필 칸·기록 창·티어표 줄)와
 *    `Emblems/big/<티어>.png`(64pt·128px, 티어표 내 티어): 2)와 같은 길·같은 맞춤.
 *
 * 쓰는 법(apps/web에서):
 *   pnpm build                                        # out/ 이 있어야 한다
 *   E2E_PORT=5892 node scripts/render-emblem-posters.mjs   # ONLY=posters|stills|cubie 이면 그것만, TIER=gold 면 그 티어만
 *
 * - 목록은 `poster.ts`·`still.ts`와 같아야 한다(.ts를 그대로 불러올 수 없어 여기 다시 적는다). 어긋나면 단위 시험
 *   `emblem3d/poster.test.ts`가 빠진 파일·남은 파일을 잡는다.
 * - 브라우저는 화면 시험과 같이 시스템 Chrome(`e2e/browser.ts`). 보석은 SDR 번짐 길(`?emblem3d=bloom`)로 찍는다.
 * - 정적 빌드를 `serve`로 띄우고 끝나면 끈다.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { BROWSER } from "../e2e/browser.ts";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const posterDir = join(web, "public/cube/tiers/emblem3d");
const stillDir = join(posterDir, "still");
const cubieDir = join(web, "../cubie/Resources/Emblems");
const PORT = Number(process.env.E2E_PORT ?? 5892);
const QUALITY = 0.9;
const ONLY = process.env.ONLY ?? "";
const TIER = process.env.TIER ?? "";

// table.ts TIER_IDS와 같게
const TIERS = [
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
].filter((t) => !TIER || t === TIER);
const BGS = ["dark", "light"];
// still.ts STILL_CSS와 같게(파일은 두 배 화소). 작은 단계는 칸을 더 채우고 조금 밝히고 얇은 어두운 테두리를 두른다(SMALL로 바꿔 견줄 수 있다)
const SMALL = JSON.parse(
  process.env.SMALL ?? '{"fill":1.12,"halo":1,"exposure":1.4,"outline":1}',
);
const STILLS = [
  { step: "s", px: 64, ...SMALL },
  { step: "m", px: 128 },
  { step: "l", px: 256 },
];
// Cubie: 32pt(64px)는 작은 단계 맞춤, 64pt(128px)는 보통
const CUBIE = [
  { dir: cubieDir, px: 64, ...SMALL },
  { dir: join(cubieDir, "big"), px: 128 },
];

const want = (k) => !ONLY || ONLY === k;

if (
  !existsSync(join(web, "out/cube/tiers/emblems.html")) &&
  !existsSync(join(web, "out/cube/tiers/emblems/index.html"))
) {
  console.error("out/ 에 /cube/tiers/emblems 가 없다. 먼저 pnpm build");
  process.exit(1);
}

// pnpm을 거치지 않고 serve를 바로 띄운다(pnpm 아래 자식은 server.kill()로 꺼지지 않는다)
const server = spawn(
  join(web, "node_modules/.bin/serve"),
  ["out", "-l", String(PORT), "--no-port-switching"],
  { cwd: web, stdio: "ignore" },
);
const base = `http://localhost:${PORT}`;

async function waitServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/cube`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("서버가 뜨지 않았다");
}

/** PNG(바이트) → WebP(바이트), 브라우저 안에서 */
async function toWebp(page, png) {
  const b64 = await page.evaluate(
    async ([src, quality]) => {
      const bin = Uint8Array.from(atob(src), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(
        new Blob([bin], { type: "image/png" }),
      );
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext("2d").drawImage(bmp, 0, 0);
      const blob = await c.convertToBlob({ type: "image/webp", quality });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const x of buf) s += String.fromCharCode(x);
      return btoa(s);
    },
    [png.toString("base64"), QUALITY],
  );
  return Buffer.from(b64, "base64");
}

function save(file, bytes) {
  writeFileSync(file, bytes);
  console.log(
    `${file.slice(web.length + 1)} ${(bytes.length / 1024).toFixed(1)}KB`,
  );
}

async function posters(browser) {
  mkdirSync(posterDir, { recursive: true });
  for (const tier of TIERS)
    for (const bg of BGS) {
      const context = await browser.newContext({
        viewport: { width: 1000, height: 1600 },
        deviceScaleFactor: 2,
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      const q = new URLSearchParams({ tier, emblem3d: "bloom" });
      if (bg === "light") q.set("emblemBg", "light");
      await page.goto(`${base}/cube/tiers/emblems?${q}`);
      const box = page.locator(
        `[data-emblem3d="${tier}"][data-emblem3d-shown]`,
      );
      await box.waitFor({ timeout: 90_000 });
      // 대기 그림이 3D 첫 장 위에서 겹쳐 사라질 때까지(그 사이 찍으면 예전 대기 그림이 섞인다)
      await box
        .locator("[data-emblem3d-poster]")
        .waitFor({ state: "detached", timeout: 10_000 });
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const png = await box
        .locator("[data-emblem3d-stage] canvas")
        .screenshot();
      save(join(posterDir, `${tier}-${bg}.webp`), await toWebp(page, png));
      await context.close();
    }
}

/** 정지 그림 찍기: 미리보기의 고리(`?stills=1`)로 `captureShots`를 부른다. 돌려받는 것은 PNG data URL */
async function stills(browser, jobs) {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}/cube/tiers/emblems?stills=1&tier=gold`);
  await page.waitForFunction(() => typeof window.__emblemStills === "function");
  for (const job of jobs) {
    const [[url]] = await page.evaluate((j) => window.__emblemStills([j]), {
      tier: job.tier,
      px: job.px,
      yaws: [0],
      ...(job.fill ? { fill: job.fill } : {}),
      ...(job.halo !== undefined ? { halo: job.halo } : {}),
      ...(job.exposure ? { exposure: job.exposure } : {}),
      ...(job.outline ? { outline: job.outline } : {}),
    });
    const png = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    save(job.file, job.webp ? await toWebp(page, png) : png);
  }
  await context.close();
}

let browser;
try {
  await waitServer();
  browser = await chromium.launch({
    channel: BROWSER.channel,
    ...BROWSER.launchOptions,
  });
  if (want("posters")) await posters(browser);
  const jobs = [];
  if (want("stills")) {
    mkdirSync(stillDir, { recursive: true });
    for (const tier of TIERS)
      for (const s of STILLS)
        jobs.push({
          ...s,
          tier,
          webp: true,
          file: join(stillDir, `${tier}-${s.step}.webp`),
        });
  }
  if (want("cubie"))
    for (const c of CUBIE) {
      mkdirSync(c.dir, { recursive: true });
      for (const tier of TIERS)
        jobs.push({
          ...c,
          tier,
          webp: false,
          file: join(c.dir, `${tier}.png`),
        });
    }
  if (jobs.length) await stills(browser, jobs);
} finally {
  await browser?.close();
  server.kill();
}
