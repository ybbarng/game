/**
 * 큐브 첫 화면의 대기 그림을 찍는다(`public/cube/hero/<크기>-<색 묶음>.webp`, src/cube/hero/poster.ts).
 * 3D 첫 화면 연출(`CubeHero`)의 첫 장면(맞춘 큐브)을 실제 3D 장면으로, 첫 화면과 같은 캔버스 크기·그리기 품질로
 * 2배 화소 밀도에서 찍고 배경을 투명하게 둔다. 3D 모양(카메라·조각·빛·그림자)이나 색 묶음이 바뀌면 다시 찍는다.
 * CI에서는 돌리지 않는다(GPU 없는 브라우저는 그림이 다르게 나온다).
 *
 * 쓰는 법(apps/web에서):
 *   nice -n 15 pnpm build                       # out/ 이 있어야 한다
 *   E2E_PORT=5891 nice -n 15 node scripts/render-cube-posters.mjs
 *
 * - 브라우저는 화면 시험과 같이 시스템 Chrome(`e2e/browser.ts`)을 쓴다. `playwright install`은 하지 않는다.
 * - 정적 빌드를 `serve`로 띄우고 끝나면 끈다. `E2E_PORT`(기본 5891)가 비어 있어야 한다.
 * - 연출이 섞기를 시작하지 않게 IntersectionObserver를 「안 보임」으로 바꿔 둔다(맞춘 큐브에서 멈춘다).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { BROWSER } from "../e2e/browser.ts";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(web, "public/cube/hero");
const PORT = Number(process.env.E2E_PORT ?? 5891);
const SIZES = [2, 3, 4, 5];
const SCHEMES = ["standard", "highContrast", "colorblind"];
const QUALITY = 0.9;

if (
  !existsSync(join(web, "out/cube.html")) &&
  !existsSync(join(web, "out/cube/index.html"))
) {
  console.error("out/ 에 /cube 가 없다. 먼저 pnpm build");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const server = spawn(
  "pnpm",
  ["exec", "serve", "out", "-l", String(PORT), "--no-port-switching"],
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
  for (const scheme of SCHEMES)
    for (const n of SIZES) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 2,
        reducedMotion: "no-preference",
      });
      await context.addInitScript(
        ([settings]) => {
          sessionStorage.setItem("mighty-splash-seen", "1");
          localStorage.setItem("cube.settings.v1", settings);
          // 연출이 「화면에 안 보임」으로 멈춰 있게(맞춘 첫 장면 그대로)
          window.IntersectionObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
            takeRecords() {
              return [];
            }
          };
        },
        [JSON.stringify({ version: 1, colorScheme: scheme, heroSize: n })],
      );
      const page = await context.newPage();
      await page.goto(`${base}/cube`);
      await page
        .locator("[data-cube-hero][data-hero-shown]")
        .waitFor({ timeout: 30_000 });
      // 배경을 모두 비워 캔버스만 투명하게 찍는다
      await page.addStyleTag({
        content:
          "html, body, body * { background: transparent !important; box-shadow: none !important; }",
      });
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      const png = await page
        .locator("[data-cube-hero] canvas")
        .screenshot({ omitBackground: true });
      const webp = await page.evaluate(
        async ([b64, q]) => {
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bmp = await createImageBitmap(
            new Blob([bin], { type: "image/png" }),
          );
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          c.getContext("2d").drawImage(bmp, 0, 0);
          const blob = await c.convertToBlob({
            type: "image/webp",
            quality: q,
          });
          const buf = new Uint8Array(await blob.arrayBuffer());
          let s = "";
          for (const x of buf) s += String.fromCharCode(x);
          return btoa(s);
        },
        [png.toString("base64"), QUALITY],
      );
      const file = join(outDir, `${n}-${scheme}.webp`);
      const bytes = Buffer.from(webp, "base64");
      writeFileSync(file, bytes);
      console.log(`${n}-${scheme}.webp ${(bytes.length / 1024).toFixed(1)}KB`);
      await context.close();
    }
} finally {
  await browser?.close();
  server.kill();
}
