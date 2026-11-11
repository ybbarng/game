// 네이티브 화면(native/cubie-native)과 웹 미니 화면의 생김새 비교판(docs/52 5-2).
// 웹은 앱과 같은 엔진 WebKit(배율 2, 앱처럼 투명 바탕)으로 찍고, 네이티브는 `cubie-shot`이 화면 밖에 그린 PNG를 쓴다.
// 둘을 바탕 넷(#000·어두운 회색·흰색·사진 흉내, 화면 시험 `cube-mini.spec.ts` DESKS와 같다) 위에 나란히 얹어 한 장으로 찍는다.
// 앱을 띄우지 않는다.
//
//   (cd native/cubie-native && cargo run --release --bin cubie-shot -- <폴더>)
//   node apps/cubie/scripts/native-compare.mjs <폴더> [사이트 주소, 기본 https://game.byb.kr]
//
// 결과: <폴더>/web-float.png·web-solving.png(웹 투명 바탕), <폴더>/compare.png(비교판)
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

const browser = await webkit.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: SIDE, height: SIDE },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  await ctx.addInitScript(appLike);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/cube/mini`);
  await page.waitForSelector("[data-cube-canvas][data-cube-ready]", {
    timeout: 60_000,
  });
  await page.waitForSelector("main[data-mini][data-input-ready]", {
    timeout: 60_000,
  });
  await fromApp(page, { type: "focus", focused: false });
  await page.waitForTimeout(800);
  const float = await page.screenshot({ omitBackground: true, type: "png" });
  writeFileSync(path.join(dir, "web-float.png"), float);
  // 맞추는 중(섞인 큐브, 거울은 이번 범위 밖이라 끈다)
  await fromApp(page, { type: "focus", focused: true });
  await fromApp(page, { type: "mirror", on: false });
  await page.keyboard.press("Enter");
  await page.waitForSelector('main[data-mini][data-mini-phase="ready"]', {
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
  const solving = await page.screenshot({ omitBackground: true, type: "png" });
  writeFileSync(path.join(dir, "web-solving.png"), solving);

  const img = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
  const native = (name) => readFileSync(path.join(dir, name));
  const cols = [
    ["웹 · 떠 있을 때", float],
    ["네이티브 · 맞춘 큐브", native("native-solved.png")],
    ["웹 · 섞인 큐브", solving],
    ["네이티브 · 섞인 큐브", native("native-scrambled.png")],
    ["네이티브 · 돌리는 중", native("native-turning.png")],
  ];
  const cell = (desk, buf) =>
    `<div class="c" style="background:${desk}"><img src="${img(buf)}"></div>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#888;font:12px -apple-system,sans-serif;color:#111}
    table{border-collapse:collapse} td,th{padding:4px} th{font-weight:600;text-align:center}
    .c{width:${SIDE}px;height:${SIDE}px} img{width:${SIDE}px;height:${SIDE}px;display:block}
  </style><table><tr><th></th>${cols.map(([t]) => `<th>${t}</th>`).join("")}</tr>
  ${Object.entries(DESKS)
    .map(
      ([name, desk]) =>
        `<tr><th>${name}</th>${cols.map(([, b]) => `<td>${cell(desk, b)}</td>`).join("")}</tr>`,
    )
    .join("")}</table>`;
  const sheet = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width: 720, height: 560 },
  });
  await sheet.setContent(html);
  await sheet
    .locator("table")
    .screenshot({ path: path.join(dir, "compare.png") });
  console.log(path.join(dir, "compare.png"));
} finally {
  await browser.close();
}
