// 네이티브 보통 창(기록 창·티어표·설정 창, docs/52 5-8)과 사이트 화면의 비교판.
// 같은 저장소(보기 기록·혼자 맞추기 기록·설정, 아래 `sampleStore`)로 네이티브는 앱의 화면 밖 스크린샷 모드, 사이트는 앱이 예전에
// 띄우던 WebKit(배율 2, 같은 창 크기)으로 찍어 한 장에 나란히 얹는다. 앱 창을 화면에 띄우지 않는다.
//
//   apps/cubie/build.sh
//   node apps/cubie/scripts/window-compare.mjs <폴더> [사이트 주소, 기본 https://game.byb.kr] [앱 실행 파일]
//
// 결과: <폴더>/native-*.png·web-*.png(따로), <폴더>/compare-records.png·compare-records-min.png(가장 작은 320×600)·
// compare-records-scroll.png(판 20개, 스크롤 막대가 내용 폭을 차지하는 꼴로 380·320)·
// compare-tiers.png·compare-settings.png(비교판,
// 티어표는 진열의 내 티어·챌린저 고름·기록 없음 셋, 설정은 기본·「사용자」 겹친 키 묻기·바꾼 뒤 셋). 네이티브만 찍는 메뉴 프로필
// 칸 흔들기는 native-profile-sway-dark·light.png(티어 넷 × 각 여섯).
// 문서 그림은 `cwebp -q 82`로 docs/cubie-native/compare-windows-*.webp에 둔다.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  // 5×5는 꼭대기(챌린저, 5판 평균 48초): 구간 안 자리 막대의 오른쪽 끝 0초 장면(docs/47 14-9)
  const five = [48_000, 47_500, 49_000, 46_000, 50_000].map((ms, i) =>
    record(i + 1, 5, ms),
  );
  five.reverse();
  // 6×6은 맨 아래(아이언, 상한 없음, 5판 평균 100분): 아래 칸 없이 지금 칸이 막대 왼쪽 끝부터인 장면
  const six = [5_900_000, 6_000_000, 6_100_000, 5_800_000, 6_200_000].map(
    (ms, i) => record(i + 1, 6, ms),
  );
  six.reverse();
  // 7×7도 아이언(5판 평균 133분 20초): 위쪽 티어 칸 「7×7 133:20.00」처럼 긴 시간이 칸 안에서 줄을 바꿔 다 보이는지
  const seven = [7_900_000, 8_000_000, 8_100_000, 7_800_000, 8_200_000].map(
    (ms, i) => record(i + 1, 7, ms),
  );
  seven.reverse();
  const mini = {
    version: 1,
    n: 3,
    mirror: true,
    records: { 3: three, 2: two, 5: five, 6: six, 7: seven },
    best5: {},
  };
  // 사이트 혼자 맞추기 기록도 넣어 둔다(앱 티어표·`records=cubie` 사이트 창은 이것을 보지 않아야 한다)
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

/** 판이 많아 기록 목록에 세로 스크롤 막대가 생기는 저장소(3×3 20판). 막대가 내용 폭을 차지할 때 「다시 보기」가 잘리지 않는지 */
function manyStore(base) {
  const mini = JSON.parse(base["cube.mini.v1"]);
  const sol = inverse(SCRAMBLE);
  const three = [];
  for (let i = 0; i < 20; i++) {
    const no = i + 1;
    three.unshift(
      record(no, 3, 19_000 + ((no * 1_733) % 9_000), {
        scramble: SCRAMBLE,
        seed: 2000 + no,
        replay: replayOf(sol, 300),
        ...(no === 6 ? { hints: 1 } : {}),
      }),
    );
  }
  mini.records = { ...mini.records, 3: three };
  return { ...base, "cube.mini.v1": JSON.stringify(mini) };
}

const store = sampleStore();
const storePath = path.join(dir, "store.json");
writeFileSync(storePath, JSON.stringify(store));
const many = manyStore(store);
const manyPath = path.join(dir, "store-many.json");
writeFileSync(manyPath, JSON.stringify(many));
/** 스크롤 막대가 내용 폭을 차지하게(macOS 「스크롤 막대 보기: 항상」·마우스 연결과 같은 꼴). WebKit은 이 꾸밈이 있으면 겹치는 막대 대신 자리를 차지하는 막대를 그린다 */
const LEGACY_SCROLLBAR =
  "::-webkit-scrollbar{width:15px;height:15px;background:#2a2a2a}::-webkit-scrollbar-thumb{background:#8a8a8a;border-radius:8px;border:4px solid #2a2a2a}";

// 네이티브: 화면 밖 스크린샷 모드
execFileSync(APP, [], {
  env: {
    ...process.env,
    CUBIE_WINDOW_SHOT: dir,
    CUBIE_WINDOW_SHOT_STORE: storePath,
    CUBIE_WINDOW_SHOT_STORE_MANY: manyPath,
  },
  stdio: "inherit",
});

const WINDOWS = [
  {
    name: "records",
    path: "/cube/mini?view=records",
    size: { width: 380, height: 600 },
    // 구간 안 자리 막대: 가운데(3×3, 첫 장면), 꼭대기(5×5), 맨 아래(6×6), 5판 전(4×4). 티어 칸 긴 시간: 맨 아래 장면의
    // 6×6·7×7 칸, 휴대폰 너비 320으로 줄인 창(records-narrow)
    shots: [
      "records",
      "records-replay",
      "records-top",
      "records-bottom",
      "records-none",
      "records-narrow",
    ],
  },
  {
    // 가장 작은 기록 창(docs/52 5-8 「창 최소 크기」, `SheetSize.records`): 글이 잘리지 않는지, 안내 문단이 「5판」처럼
    // 숫자와 단위 사이에서 줄을 바꾸지 않는지. 티어표·설정 창은 가장 작은 너비가 처음 너비라 네이티브만 찍는다(native-*-min)
    name: "records-min",
    path: "/cube/mini?view=records",
    size: { width: 320, height: 600 },
    shots: ["records-min", "records-min-replay"],
  },
  {
    // 판이 많아 세로 스크롤 막대가 내용 폭을 차지하는 기록 창(2026-11-20 「다시 보기」가 막대에 가려 잘렸다):
    // 처음 너비 380과 가장 작은 320
    name: "records-scroll",
    path: "/cube/mini?view=records",
    size: { width: 380, height: 600 },
    data: many,
    scrollbar: true,
    shots: ["records-scroll", "records-scroll-min"],
  },
  {
    name: "tiers",
    // 앱이 여는 사이트 티어표와 같이 Cubie 기록으로 센다(docs/52 5-14)
    path: "/cube/tiers?n=3&records=cubie",
    size: { width: 760, height: 820 },
    // 진열(docs/52 5-11): 내 티어, 사다리에서 챌린저를 고른 때, Cubie 기록이 없을 때. 흔들기는 멈춰 정면끼리 견준다
    shots: ["tiers", "tiers-pick", "tiers-none"],
    full: true,
    reducedMotion: "reduce",
  },
  {
    name: "settings",
    path: "/cube/settings",
    size: { width: 760, height: 720 },
    // 「사용자」를 누르고 R에 J를 지정: 겹친 키 묻기 → 바꾸기 뒤(알림·키 없음, 내보내기·가져오기 펼침)
    shots: ["settings", "settings-ask", "settings-custom"],
    full: true,
  },
];

const browser = await webkit.launch();
try {
  for (const w of WINDOWS) {
    const open = async (data, viewport = w.size) => {
      const c = await browser.newContext({
        viewport,
        deviceScaleFactor: 2,
        colorScheme: "dark",
        ...(w.reducedMotion ? { reducedMotion: w.reducedMotion } : {}),
      });
      await c.addInitScript(
        ([d, css]) => {
          for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
          // 막대 꾸밈은 처음 그리기 전에 넣는다(그린 뒤 넣으면 WebKit이 겹치는 막대를 그대로 둔다)
          if (css) {
            document.addEventListener("DOMContentLoaded", () => {
              const s = document.createElement("style");
              s.textContent = css;
              document.head.appendChild(s);
            });
          }
        },
        [data, w.scrollbar ? LEGACY_SCROLLBAR : ""],
      );
      const p = await c.newPage();
      await p.goto(`${BASE}${w.path}`);
      await p.waitForLoadState("networkidle");
      await p.waitForTimeout(500);
      return [c, p];
    };
    let [ctx, page] = await open(w.data ?? store);
    for (const shot of w.shots) {
      if (shot === "tiers-pick") {
        await page.locator("[data-cube-ladder='challenger']").click();
        await page.waitForSelector("[data-cube-tier-picked='challenger']");
        await page.waitForTimeout(800);
      }
      if (shot === "tiers-none") {
        // Cubie 기록이 없는 저장소(네이티브도 같은 저장소에서 cube.mini.v1을 뺀다)
        await ctx.close();
        const { "cube.mini.v1": _, ...rest } = store;
        [ctx, page] = await open(rest);
        await page.waitForTimeout(800);
      }
      if (shot === "settings-ask") {
        await page
          .locator("[data-settings-keymap] button", { hasText: "사용자" })
          .click();
        await page.locator("[data-assign='R']").click();
        await page.keyboard.press("KeyJ");
        await page.waitForSelector("[data-keymap-conflict]");
      }
      if (shot === "settings-custom") {
        await page.locator("[data-conflict-yes]").click();
        await page
          .locator("summary", { hasText: "내보내기·가져오기(JSON)" })
          .click();
        await page.waitForSelector("[data-keymap-message]");
      }
      if (shot === "records-replay" || shot === "records-min-replay") {
        await page.locator("[data-mini-replay-open]").first().click();
        await page.waitForSelector("[data-cube-ready]");
        await page.waitForTimeout(300);
      }
      if (shot === "records-scroll-min") {
        await ctx.close();
        [ctx, page] = await open(w.data ?? store, { ...w.size, width: 320 });
      }
      const bandSize = {
        "records-top": 5,
        "records-bottom": 6,
        "records-none": 4,
        "records-narrow": 6,
      }[shot];
      if (bandSize) {
        // 네이티브는 새 기록 창에서 크기만 고른다(다시 보기 닫힘). records-narrow는 창 너비 320
        await ctx.close();
        [ctx, page] = await open(
          store,
          shot === "records-narrow" ? { ...w.size, width: 320 } : w.size,
        );
        await page.locator(`[data-mini-tier-size='${bandSize}']`).click();
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
    // 같은 폴더의 파일로 건다(장면이 여럿이면 글 안에 그림을 다 넣은 HTML은 WebKit이 몇 장을 그리지 않았다)
    const img = (f) => f;
    const cols = pairs
      .map((s) => {
        const width =
          s === "records-narrow" || s === "records-scroll-min"
            ? 320
            : w.size.width;
        return `<figure><figcaption>네이티브 · ${s}</figcaption><img src="${img(`native-${s}.png`)}" style="width:${width}px"></figure>
<figure><figcaption>사이트(WebKit) · ${s}</figcaption><img src="${img(`web-${s}.png`)}" style="width:${width}px"></figure>`;
      })
      .join("");
    const html = path.join(dir, `compare-${w.name}.html`);
    writeFileSync(
      html,
      `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#3a3a3a;font:13px system-ui;color:#eee}
      main{display:flex;gap:16px;padding:16px;align-items:flex-start;width:max-content}
      figure{margin:0;display:flex;flex-direction:column;gap:6px}
      img{display:block;outline:1px solid #555}
    </style><main>${cols}</main>`,
    );
    await sheet.goto(pathToFileURL(html).href);
    await sheet.waitForLoadState("load");
    await sheet
      .locator("main")
      .screenshot({ path: path.join(dir, `compare-${w.name}.png`) });
    console.log(`비교판: ${path.join(dir, `compare-${w.name}.png`)}`);
  }
} finally {
  await browser.close();
}
