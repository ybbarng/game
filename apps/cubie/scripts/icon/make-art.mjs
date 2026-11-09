// Cubie 앱 아이콘 그림 만들기(사이트 3D 큐브로). 이 맥에서 손으로 돌린다(CI에 넣지 않는다).
//
//   node apps/cubie/scripts/icon/make-art.mjs --out <폴더>              시안마다 1024·512·128·32·16 PNG와 비교판 options.png
//   node apps/cubie/scripts/icon/make-art.mjs --out <폴더> --only a-clean   그 시안만
//   node apps/cubie/scripts/icon/make-art.mjs --icns <시안>              Resources/AppIcon.icns를 그 시안으로 바꾼다
//
// render.ts를 Vite로 묶어 빈 HTML에 싣고, 화면 시험과 같은 시스템 Chrome(샌드박스 켬, apps/web/e2e/browser.ts)을
// 화면 없이 띄워 window.drawIcon을 부른다. 비교판 맨 윗줄에는 지금 Resources/AppIcon.icns를 놓는다.
import { execFileSync } from "node:child_process";
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
const webRequire = createRequire(join(repo, "apps/web/package.json"));
const rootRequire = createRequire(join(repo, "package.json"));
// vite는 vitest가 들고 있다(저장소에 바로 깔린 의존이 아니다)
const vitePath = createRequire(
  rootRequire.resolve("vitest/package.json"),
).resolve("vite");
const { build } = await import(pathToFileURL(vitePath).href);
const pw = await import(
  pathToFileURL(webRequire.resolve("@playwright/test")).href
);
const chromium = pw.chromium ?? pw.default.chromium;

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i < 0 ? undefined : args[i + 1];
};
const out = opt("--out");
const only = opt("--only");
const icns = opt("--icns");
if (!out && !icns) {
  console.error("--out <폴더> 또는 --icns <시안>을 주세요");
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "cubie-icon-"));
try {
  // 묶기
  await build({
    configFile: false,
    logLevel: "warn",
    root: here,
    build: {
      outDir: join(work, "dist"),
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: join(here, "render.ts"),
        formats: ["es"],
        fileName: () => "render.js",
      },
      rolldownOptions: { output: { codeSplitting: false } },
    },
    // render.ts는 apps/web 밖이라 three를 찾지 못한다: 사이트와 같은 판을 쓰게 apps/web 것으로
    resolve: { alias: { three: join(repo, "apps/web/node_modules/three") } },
  });
  const js = readFileSync(join(work, "dist/render.js"), "utf8");
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent"><script type="module">${js.replaceAll("</script", "<\\/script")}</script>`;
  writeFileSync(join(work, "index.html"), html);

  const browser = await chromium.launch({
    channel: "chrome",
    chromiumSandbox: true,
    headless: true,
  });
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width: 1200, height: 1200 },
  });
  page.on("pageerror", (e) => console.error("페이지 오류:", e.message));
  await page.goto(pathToFileURL(join(work, "index.html")).href);
  await page.waitForFunction(() => typeof window.drawIcon === "function");
  const options = await page.evaluate(() => window.iconOptions);

  const png = async (id, px) => {
    const url = await page.evaluate(
      ([i, p]) => window.drawIcon(i, p),
      [id, px],
    );
    return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  };

  if (icns) {
    if (!options.some((o) => o.id === icns))
      throw new Error(`없는 시안: ${icns}`);
    const set = join(work, "AppIcon.iconset");
    mkdirSync(set);
    for (const base of [16, 32, 128, 256, 512]) {
      writeFileSync(
        join(set, `icon_${base}x${base}.png`),
        await png(icns, base),
      );
      writeFileSync(
        join(set, `icon_${base}x${base}@2x.png`),
        await png(icns, base * 2),
      );
    }
    const dest = join(appDir, "Resources/AppIcon.icns");
    execFileSync("/usr/bin/iconutil", ["-c", "icns", set, "-o", dest]);
    console.log(`만듦: ${dest}`);
  }

  if (out) {
    mkdirSync(out, { recursive: true });
    const pick = options.filter((o) => !only || o.id === only);
    for (const o of pick)
      for (const px of [1024, 512, 128, 32, 16])
        writeFileSync(join(out, `${o.id}-${px}.png`), await png(o.id, px));
    // 지금 아이콘(비교용)
    const cur = join(work, "current.iconset");
    execFileSync("/usr/bin/iconutil", [
      "-c",
      "iconset",
      join(appDir, "Resources/AppIcon.icns"),
      "-o",
      cur,
    ]);
    const curPng = (name) =>
      `data:image/png;base64,${readFileSync(join(cur, name)).toString("base64")}`;
    const rows = [
      {
        name: "지금 아이콘(0.1.1)",
        big: curPng("icon_512x512@2x.png"),
        mid: curPng("icon_128x128.png"),
        small: curPng("icon_32x32.png"),
      },
    ];
    for (const o of pick) {
      const d = async (px) =>
        `data:image/png;base64,${(await png(o.id, px)).toString("base64")}`;
      rows.push({
        name: `${o.id} · ${o.name}`,
        big: await d(1024),
        mid: await d(128),
        small: await d(32),
      });
    }
    const sheet = await page.evaluate(async (rows) => {
      const load = (src) =>
        new Promise((ok, no) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = no;
          i.src = src;
        });
      // 한 칸: 1024 그림을 300으로, 128·32는 실제 크기, 32를 4배(픽셀 그대로)
      const half = 300 + 128 + 32 + 128 + 5 * 24;
      const rowH = 300 + 2 * 24 + 30;
      const c = document.createElement("canvas");
      c.width = half * 2;
      c.height = rowH * rows.length;
      const g = c.getContext("2d");
      for (const [side, bg, ink] of [
        [0, "#f2f2f5", "#222"],
        [1, "#1e1e22", "#ddd"],
      ]) {
        g.fillStyle = bg;
        g.fillRect(side * half, 0, half, c.height);
        for (const [k, r] of rows.entries()) {
          const [big, mid, small] = await Promise.all([
            load(r.big),
            load(r.mid),
            load(r.small),
          ]);
          const y = k * rowH;
          let x = side * half + 24;
          g.fillStyle = ink;
          g.font = "600 18px -apple-system, sans-serif";
          if (side === 0) g.fillText(r.name, x, y + 26);
          const top = y + 30 + 24;
          g.imageSmoothingQuality = "high";
          g.drawImage(big, x, top, 300, 300);
          x += 300 + 24;
          g.drawImage(mid, x, top + 300 - 128);
          x += 128 + 24;
          g.drawImage(small, x, top + 300 - 32);
          x += 32 + 24;
          g.imageSmoothingEnabled = false;
          g.drawImage(small, x, top + 300 - 128, 128, 128);
          g.imageSmoothingEnabled = true;
        }
      }
      return c.toDataURL("image/png");
    }, rows);
    writeFileSync(
      join(out, "options.png"),
      Buffer.from(sheet.slice(sheet.indexOf(",") + 1), "base64"),
    );
    console.log(`미리보기: ${out}`);
  }
  await browser.close();
} finally {
  rmSync(work, { recursive: true, force: true });
}
