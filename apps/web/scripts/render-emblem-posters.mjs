/**
 * 3D 엠블럼 대기 그림을 찍는다(`public/cube/tiers/emblem3d/*.webp`, src/cube/tiers/emblem3d/poster.ts).
 * 미리보기 `/cube/tiers/emblems`의 큰 3D 칸이 첫 장(정면)을 그린 뒤, 그 캔버스를 화면에 보이는 그대로(2배 화소 밀도)
 * 찍는다. 그래서 대기 그림과 3D 첫 장은 같은 카메라·같은 크기·같은 바탕이다(고정 규칙 2-1절). 3D 모양·재질·빛·
 * 바탕색이 바뀌면 다시 찍는다. CI에서는 돌리지 않는다(GPU 없는 브라우저는 그림이 다르게 나온다).
 *
 * 쓰는 법(apps/web에서):
 *   pnpm build                                        # out/ 이 있어야 한다
 *   E2E_PORT=5892 node scripts/render-emblem-posters.mjs   # ONLY=emerald 이면 파일 이름이 그 글자로 시작하는 것만
 *
 * - 찍을 목록은 `poster.ts`의 `POSTERS`와 같아야 한다(.ts를 그대로 불러올 수 없어 여기 다시 적는다). 어긋나면 단위
 *   시험 `emblem3d/poster.test.ts`가 빠진 파일을 잡는다.
 * - 브라우저는 화면 시험과 같이 시스템 Chrome(`e2e/browser.ts`). 보석은 SDR 번짐 길(`?emblem3d=bloom`)로 찍는다.
 *   HDR 화면의 HDR 길은 1.0을 넘는 빛이 더 밝을 뿐 자리·모양은 같다.
 * - 정적 빌드를 `serve`로 띄우고 끝나면 끈다.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { BROWSER } from "../e2e/browser.ts";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(web, "public/cube/tiers/emblem3d");
const PORT = Number(process.env.E2E_PORT ?? 5892);
const QUALITY = 0.9;
const ONLY = process.env.ONLY ?? "";

// poster.ts POSTERS와 같게
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
];
const STYLES = [
  "now",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "m2",
  "n",
  "q",
  "p",
  "o1",
  "o2",
  "calm",
  "calm1",
  "calm2",
];
const BGS = ["dark", "light"];
const JOBS = [
  ...TIERS.flatMap((tier) =>
    BGS.map((bg) => ({ tier, bg, style: null, file: `${tier}-${bg}.webp` })),
  ),
  ...STYLES.flatMap((style) =>
    BGS.map((bg) => ({
      tier: "emerald",
      bg,
      style,
      file: `emerald-${style}-${bg}.webp`,
    })),
  ),
  // 다른 보석 티어 × 아홉째 시안, 다이아몬드는 얕은 계단까지(poster.ts stylesForTier와 같게)
  ...["diamond", "master", "grandmaster", "challenger"].flatMap((tier) =>
    [
      "n",
      "q",
      "p",
      "o1",
      "o2",
      ...(tier === "diamond" ? ["soft", "soft1", "soft2"] : []),
    ].flatMap((style) =>
      BGS.map((bg) => ({
        tier,
        bg,
        style,
        file: `${tier}-${style}-${bg}.webp`,
      })),
    ),
  ),
].filter((j) => j.file.startsWith(ONLY));

if (
  !existsSync(join(web, "out/cube/tiers/emblems.html")) &&
  !existsSync(join(web, "out/cube/tiers/emblems/index.html"))
) {
  console.error("out/ 에 /cube/tiers/emblems 가 없다. 먼저 pnpm build");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

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

let browser;
try {
  await waitServer();
  browser = await chromium.launch({
    channel: BROWSER.channel,
    ...BROWSER.launchOptions,
  });
  for (const job of JOBS) {
    const context = await browser.newContext({
      viewport: { width: 1000, height: 1600 },
      deviceScaleFactor: 2,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const q = new URLSearchParams({ tier: job.tier, emblem3d: "bloom" });
    if (job.style) q.set("gem", job.style);
    if (job.bg === "light") q.set("emblemBg", "light");
    await page.goto(`${base}/cube/tiers/emblems?${q}`);
    const box = page.locator(
      `[data-emblem3d="${job.tier}"][data-emblem3d-shown]`,
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
    const png = await box.locator("[data-emblem3d-stage] canvas").screenshot();
    const webp = await page.evaluate(
      async ([b64, quality]) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
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
    const bytes = Buffer.from(webp, "base64");
    writeFileSync(join(outDir, job.file), bytes);
    console.log(`${job.file} ${(bytes.length / 1024).toFixed(1)}KB`);
    await context.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
