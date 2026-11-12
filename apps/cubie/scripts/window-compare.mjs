// 네이티브 보통 창(기록 창·티어표·설정 창, docs/52 5-7)과 사이트 화면의 비교판.
// 같은 저장소(보기 기록·혼자 맞추기 기록·설정, 아래 `sampleStore`)로 네이티브는 앱의 화면 밖 스크린샷 모드, 사이트는 앱이 예전에
// 띄우던 WebKit(배율 2, 같은 창 크기)으로 찍어 한 장에 나란히 얹는다. 앱 창을 화면에 띄우지 않는다.
//
//   apps/cubie/build.sh
//   node apps/cubie/scripts/window-compare.mjs <폴더> [사이트 주소, 기본 https://game.byb.kr] [앱 실행 파일]
//
// 결과: <폴더>/native-*.png·web-*.png(따로), <폴더>/compare-records.png·compare-tiers.png·compare-settings.png(비교판).
// 문서 그림은 `cwebp -q 82`로 docs/cubie-native/compare-windows-*.webp에 둔다.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../web/package.json"));
const { webkit } = require("@playwright/test");

const dir = path.resolve(process.argv[2] ?? ".");
const BASE = process.argv[3] ?? "https://game.byb.kr";
const APP =
  process.argv[4] ?? path.join(here, "../Cubie.app/Contents/MacOS/Cubie");
mkdirSync(dir, { recursive: true });

/** 3×3 섞기와 그것을 거꾸로 푼 다시 보기 글(수 사이 0.3~0.7초) */
const SCRAMBLE = "R U R' U' F2 D L2 B' U2 R D' F";
function inverse(moves) {
  return moves
    .split(" ")
    .reverse()
    .map((m) => (m.endsWith("2") ? m : m.endsWith("'") ? m[0] : `${m}'`));
}
function replayOf(moves, step) {
  let t = 0;
  return moves
    .map((m, i) => {
      if (i > 0) t += step + ((i * 137) % 400);
      return `${m}@${t}`;
    })
    .join(" ");
}

/** 보기 기록 한 판(사이트 `MiniRecord` 꼴). 시각은 고정이라 두 화면의 「때」 칸이 같다 */
function record(no, n, ms, extra = {}) {
  return {
    no,
    at: Date.UTC(2026, 10, 12, 1, 0) + no * 97_000,
    n,
    mode: "solo",
    ms,
    penalty: 0,
    moves: 40 + ((no * 7) % 30),
    ...extra,
  };
}

function sampleStore() {
  const sol = inverse(SCRAMBLE);
  const three = [];
  const times = [
    21_340,
    19_870,
    25_010,
    null,
    18_220,
    23_400,
    20_990,
    22_150,
    30_480,
    19_020,
    24_660,
    21_870,
  ];
  times.forEach((ms, i) => {
    const no = i + 1;
    const extra = {};
    if (ms !== null && no % 3 !== 0) {
      extra.scramble = SCRAMBLE;
      extra.seed = 1000 + no;
      extra.replay = replayOf(sol, 300);
    }
    if (no === 4) extra.hints = 2;
    if (no === 7) extra.keyOrigin = "synthetic";
    if (no === 9) extra.inputs = ["key", "swipe"];
    three.unshift(record(no, 3, ms, extra));
  });
  const two = [8_100, 7_420, 9_030, 6_880, 7_990].map((ms, i) =>
    record(i + 1, 2, ms),
  );
  two.reverse();
  const mini = {
    version: 1,
    n: 3,
    mirror: true,
    records: { 3: three, 2: two },
    best5: {},
  };
  // 사이트 티어표의 「내 티어」는 혼자 맞추기 기록으로 센다
  const solo = [17_200, 16_430, 18_900, 15_880, 16_990].map((ms, i) =>
    record(i + 1, 3, ms),
  );
  solo.reverse();
  return {
    "cube.mini.v1": JSON.stringify(mini),
    "cube.records.v1": JSON.stringify({ "solo-3": solo }),
    "cube.settings.v1": JSON.stringify({
      colorScheme: "standard",
      moveMs: 90,
      sound: true,
      stickerless: false,
      scrambleShow: "auto",
    }),
    "cube.keymap.v1": JSON.stringify({
      version: 1,
      preset: "twoHand",
      bindings: [],
      mouseRotate: false,
    }),
  };
}

const store = sampleStore();
const storePath = path.join(dir, "store.json");
writeFileSync(storePath, JSON.stringify(store));

// 네이티브: 화면 밖 스크린샷 모드
execFileSync(APP, [], {
  env: {
    ...process.env,
    CUBIE_WINDOW_SHOT: dir,
    CUBIE_WINDOW_SHOT_STORE: storePath,
  },
  stdio: "inherit",
});

const WINDOWS = [
  {
    name: "records",
    path: "/cube/mini?view=records",
    size: { width: 380, height: 600 },
    shots: ["records", "records-replay"],
  },
  {
    name: "tiers",
    path: "/cube/tiers?n=3",
    size: { width: 760, height: 760 },
    shots: ["tiers"],
    full: true,
  },
  {
    name: "settings",
    path: "/cube/settings",
    size: { width: 760, height: 720 },
    shots: ["settings"],
    full: true,
  },
];

const browser = await webkit.launch();
try {
  for (const w of WINDOWS) {
    const ctx = await browser.newContext({
      viewport: w.size,
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    await ctx.addInitScript((d) => {
      for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
    }, store);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${w.path}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    for (const shot of w.shots) {
      if (shot === "records-replay") {
        await page.locator("[data-mini-replay-open]").first().click();
        await page.waitForSelector("[data-cube-ready]");
        await page.waitForTimeout(300);
      }
      await page.screenshot({
        path: path.join(dir, `web-${shot}.png`),
        fullPage: !!w.full,
      });
    }
    await ctx.close();
  }

  // 비교판: 왼쪽 네이티브, 오른쪽 사이트(WebKit)
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  for (const w of WINDOWS) {
    const pairs = w.shots.filter(
      (s) =>
        existsSync(path.join(dir, `native-${s}.png`)) &&
        existsSync(path.join(dir, `web-${s}.png`)),
    );
    if (pairs.length === 0) continue;
    const img = (f) =>
      `data:image/png;base64,${readFileSync(path.join(dir, f)).toString("base64")}`;
    const cols = pairs
      .map(
        (
          s,
        ) => `<figure><figcaption>네이티브 · ${s}</figcaption><img src="${img(`native-${s}.png`)}" style="width:${w.size.width}px"></figure>
<figure><figcaption>사이트(WebKit) · ${s}</figcaption><img src="${img(`web-${s}.png`)}" style="width:${w.size.width}px"></figure>`,
      )
      .join("");
    await sheet.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#3a3a3a;font:13px system-ui;color:#eee}
      main{display:flex;gap:16px;padding:16px;align-items:flex-start;width:max-content}
      figure{margin:0;display:flex;flex-direction:column;gap:6px}
      img{display:block;outline:1px solid #555}
    </style><main>${cols}</main>`);
    await sheet.waitForLoadState("load");
    await sheet
      .locator("main")
      .screenshot({ path: path.join(dir, `compare-${w.name}.png`) });
    console.log(`비교판: ${path.join(dir, `compare-${w.name}.png`)}`);
  }
} finally {
  await browser.close();
}
