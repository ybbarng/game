// 거울 판 생김새 전후 비교판(docs/47 15-23). 웹 미니 화면(맞추는 중, 거울 보임)은 앱과 같은 엔진 WebKit(배율 2, 투명 바탕)으로
// 찍고, 네이티브는 화면 밖 스크린샷(`CUBIE_NATIVE_SHOT`)의 native-mirror.png를 쓴다. 앱 창을 띄우지 않는다.
//
//   웹 찍기:   node apps/cubie/scripts/mirror-compare.mjs shoot <폴더> <사이트 주소> [창 한 변 pt, 기본 160] [?render=css]
//              → <폴더>/web-mirror.png(CSS 그리기는 web-mirror-css.png)
//   네이티브:  CUBIE_NATIVE_SHOT=<폴더> CUBIE_NATIVE_SHOT_SIDE=160 apps/cubie/Cubie.app/Contents/MacOS/Cubie
//   비교판:    node apps/cubie/scripts/mirror-compare.mjs sheet <결과.png> <전 폴더> <후 폴더> [창 한 변 pt]
//
// 비교판은 바탕 넷(#000·어두운 회색·흰색·사진 흉내, 화면 시험 `cube-mini.spec.ts` DESKS와 같다)마다 한 줄,
// 칸은 웹 전·웹 후·네이티브 전·네이티브 후.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../web/package.json"));
const { webkit } = require("@playwright/test");

const DESKS = {
  "#000": "#000",
  "어두운 회색": "#2a2b30",
  흰색: "#ffffff",
  사진: [
    "radial-gradient(circle at 70% 30%, rgb(255 236 180 / 0.9) 0 6%, transparent 18%)",
    "repeating-linear-gradient(115deg, rgb(0 0 0 / 0.12) 0 3px, transparent 3px 9px)",
    "linear-gradient(#5d8fc4 0%, #b9d3ea 42%, #e7cf97 49%, #6a7f3c 53%, #34461f 75%, #1d2612 100%)",
  ].join(", "),
};

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

const fromApp = (page, detail) =>
  page.evaluate(
    (d) => window.dispatchEvent(new CustomEvent("cubie", { detail: d })),
    detail,
  );

async function shoot(dir, base, side, query = "") {
  const browser = await webkit.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: side, height: side },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
      colorScheme: "dark",
    });
    await ctx.addInitScript(appLike);
    const page = await ctx.newPage();
    await page.goto(`${base}/cube/mini${query}`);
    await page.waitForSelector("[data-cube-canvas][data-cube-ready]", {
      timeout: 60_000,
    });
    await page.waitForSelector("main[data-mini][data-input-ready]", {
      timeout: 60_000,
    });
    await fromApp(page, { type: "focus", focused: true });
    await fromApp(page, { type: "mirror", on: true });
    await page.keyboard.press("Enter");
    await page.waitForSelector('main[data-mini][data-mini-phase="ready"]', {
      timeout: 30_000,
    });
    await page.waitForSelector('[data-cube-canvas][data-cube-mirror="on"]', {
      timeout: 30_000,
    });
    await page.waitForTimeout(800);
    const png = await page.screenshot({ omitBackground: true, type: "png" });
    writeFileSync(path.join(dir, `web-mirror${query ? "-css" : ""}.png`), png);
    console.log(dir);
  } finally {
    await browser.close();
  }
}

async function sheet(out, before, after, side) {
  const read = (dir, name) => {
    const f = path.join(dir, name);
    return existsSync(f) ? readFileSync(f) : null;
  };
  const cols = [
    ["웹 · 전", read(before, "web-mirror.png")],
    ["웹 · 후", read(after, "web-mirror.png")],
    ["네이티브 · 전", read(before, "native-mirror.png")],
    ["네이티브 · 후", read(after, "native-mirror.png")],
  ].filter(([, b]) => b);
  const img = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
  const cell = (desk, buf) =>
    `<div class="c" style="background:${desk}"><img src="${img(buf)}"></div>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#888;font:13px -apple-system,sans-serif;color:#111}
    table{border-collapse:collapse} td,th{padding:4px} th{font-weight:600;text-align:center}
    .c{width:${side}px;height:${side}px} img{width:${side}px;height:${side}px;display:block}
  </style><table><tr><th></th>${cols.map(([t]) => `<th>${t}</th>`).join("")}</tr>
  ${Object.entries(DESKS)
    .map(
      ([name, desk]) =>
        `<tr><th>${name}</th>${cols.map(([, b]) => `<td>${cell(desk, b)}</td>`).join("")}</tr>`,
    )
    .join("")}</table>`;
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({
      deviceScaleFactor: 2,
      viewport: { width: 1400, height: 1000 },
    });
    await page.setContent(html);
    await page.locator("table").screenshot({ path: out });
    console.log(out);
  } finally {
    await browser.close();
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "shoot") {
  await shoot(path.resolve(args[0]), args[1], Number(args[2] ?? 160), args[3]);
} else if (cmd === "sheet") {
  await sheet(
    path.resolve(args[0]),
    path.resolve(args[1]),
    path.resolve(args[2]),
    Number(args[3] ?? 160),
  );
} else {
  console.error(
    "쓰는 법: mirror-compare.mjs shoot <폴더> <주소> [한 변] | sheet <결과.png> <전> <후> [한 변]",
  );
  process.exit(2);
}
