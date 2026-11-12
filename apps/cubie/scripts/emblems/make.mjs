// 네이티브 Cubie의 티어 엠블럼 PNG(Resources/Emblems/<티어>.png, 64px)를 사이트 엠블럼 코드로 만든다. 이 맥에서 손으로 돌린다.
//
//   node apps/cubie/scripts/emblems/make.mjs
//
// 웹 미니 화면은 엠블럼을 다리로 보냈지만(docs/47 15-20), 네이티브 화면에는 웹이 없어 앱에 묶는다. 엠블럼을 고치면 다시 돌리고
// 앱 판을 낸다. render.tsx를 Vite로 묶어 빈 HTML에 싣고 화면 시험과 같은 시스템 Chrome을 화면 없이 띄워 부른다.
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../..");
const repo = resolve(appDir, "../..");
const web = join(repo, "apps/web");
const webRequire = createRequire(join(web, "package.json"));
const rootRequire = createRequire(join(repo, "package.json"));
const vitePath = createRequire(
  rootRequire.resolve("vitest/package.json"),
).resolve("vite");
const { build } = await import(pathToFileURL(vitePath).href);
const pw = await import(
  pathToFileURL(webRequire.resolve("@playwright/test")).href
);
const chromium = pw.chromium ?? pw.default.chromium;

const work = mkdtempSync(join(tmpdir(), "cubie-emblems-"));
try {
  await build({
    configFile: false,
    logLevel: "warn",
    root: here,
    define: { "process.env.NODE_ENV": '"production"' },
    esbuild: { jsx: "automatic" },
    build: {
      outDir: join(work, "dist"),
      emptyOutDir: true,
      minify: false,
      cssCodeSplit: false,
      lib: {
        entry: join(here, "render.tsx"),
        formats: ["es"],
        fileName: () => "render.js",
      },
      rolldownOptions: { output: { codeSplitting: false } },
    },
    resolve: {
      alias: [
        { find: /^@\//, replacement: `${join(web, "src")}/` },
        { find: /^react$/, replacement: join(web, "node_modules/react") },
        {
          find: /^react\/(.*)$/,
          replacement: `${join(web, "node_modules/react")}/$1`,
        },
        {
          find: /^react-dom\/(.*)$/,
          replacement: `${join(web, "node_modules/react-dom")}/$1`,
        },
      ],
    },
  });
  const js = readFileSync(join(work, "dist/render.js"), "utf8");
  let css = "";
  try {
    css = readFileSync(join(work, "dist/render.css"), "utf8");
  } catch {}
  writeFileSync(
    join(work, "index.html"),
    `<!doctype html><meta charset="utf-8"><style>${css}</style><body><script type="module">${js.replaceAll("</script", "<\\/script")}</script>`,
  );
  const browser = await chromium.launch({
    channel: "chrome",
    chromiumSandbox: true,
    headless: true,
  });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.error("페이지 오류:", e.message));
  await page.goto(pathToFileURL(join(work, "index.html")).href);
  await page.waitForFunction(() => typeof window.drawEmblems === "function");
  const urls = await page.evaluate(() => window.drawEmblems());
  await browser.close();
  const outDir = join(appDir, "Resources/Emblems");
  mkdirSync(outDir, { recursive: true });
  for (const [tier, url] of Object.entries(urls)) {
    if (!url) {
      console.error(`못 그림: ${tier}`);
      process.exitCode = 1;
      continue;
    }
    const b64 = url.slice(url.indexOf(",") + 1);
    writeFileSync(join(outDir, `${tier}.png`), Buffer.from(b64, "base64"));
    console.log(`만듦: Resources/Emblems/${tier}.png`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
