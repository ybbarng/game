// 메뉴 막대 티어 아이콘 비교판(docs/52 5-26): 고른 시안(F7)의 두 층을 겹친 그림과 앱 그림을 같은 막대 위에 나란히 얹고,
// 화소마다 차이를 잰다. 앱 그림은 화면 밖에서 그린 것이라 메뉴 막대·설치된 앱을 건드리지 않는다.
//
//   apps/cubie/build.sh
//   CUBIE_MENU_ICON_SHOT=<앱 폴더> apps/cubie/Cubie.app/Contents/MacOS/Cubie
//   node apps/cubie/scripts/menu-icon-compare.mjs <앱 폴더> <시안 폴더(f7-*.png)> <출력 폴더>
//
// 시안 폴더는 시안 합치기 스크립트(ROUND=4)가 낸 `f7-<자리>-<1|2>-color.png`·`-tpl.png`가 든 곳이다. 없으면 앱 줄만 얹는다.
// 결과: <출력>/compare-1x.png(배율 1로 찍음, 1x 그림)·compare-2x.png(배율 2, 2x 그림)·diff.json(아이콘마다 가장 큰 채널 차).
// 문서 그림은 `cwebp -lossless`(화소가 뭉개지지 않게)로 docs/cubie-native/compare-menubar-icon-1x.webp·-2x.webp에 둔다.
// 「메뉴 열림」 줄의 둥근 바탕은 맥이 눌린 버튼 뒤에 까는 판을 흉내 낸 것이다(색은 어림).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../web/package.json"));
const { webkit } = require("@playwright/test");

const [appDir, draftDir, outDir] = process.argv
  .slice(2)
  .map((p) => p && path.resolve(p));
if (!appDir || !outDir) {
  console.error(
    "쓰는 법: node menu-icon-compare.mjs <앱 폴더> <시안 폴더> <출력 폴더>",
  );
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

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
const TIER_NAMES = [
  "아이언",
  "브론즈",
  "실버",
  "골드",
  "플래티넘",
  "에메랄드",
  "다이아",
  "마스터",
  "그마",
  "챌린저",
];
/** 막대에 얹을 자리: [앱 자리, 시안 자리, 이름표] */
const ROWS = {
  "골드 2×2~7×7과 기본 아이콘": [
    ["none", "none", "티어 없음"],
    ["warn-none", "warn-none", "경고"],
    ...[2, 3, 4, 5, 6, 7].map((n) => [`gold@${n}`, `gold@${n}`, `${n}×${n}`]),
    ["warn-gold@7", "warn-gold@7", "경고 7"],
  ],
  "열 티어(3×3)": [
    ...TIERS.map((t, i) => [`${t}@3`, t, TIER_NAMES[i]]),
    ["warn-challenger@3", "warn-challenger", "경고"],
  ],
};

const png = (file) =>
  existsSync(file)
    ? `data:image/png;base64,${readFileSync(file).toString("base64")}`
    : null;

function sources(scale) {
  const out = {};
  for (const slots of Object.values(ROWS)) {
    for (const [app, draft] of slots) {
      for (const look of ["light", "dark"]) {
        const key = `${app}|${look}`;
        const plain = draft === "none" || draft === "warn-none";
        out[key] = {
          app: png(path.join(appDir, `menu-${app}-${scale}-${look}.png`)),
          // 시안의 기본 아이콘은 단색 층만, 엠블럼은 컬러 층 위에 막대 색으로 칠한 단색 층
          color:
            draftDir && !plain
              ? png(path.join(draftDir, `f7-${draft}-${scale}-color.png`))
              : null,
          tpl: draftDir
            ? png(path.join(draftDir, `f7-${draft}-${scale}-tpl.png`))
            : null,
        };
      }
    }
  }
  return out;
}

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 16px; background: #f4f4f6; font: 12px/1.3 -apple-system, "Apple SD Gothic Neo", sans-serif; color: #222; width: max-content; }
  h2 { font-size: 14px; margin: 14px 0 6px; } h3 { font-size: 12px; margin: 10px 0 4px; color: #555; font-weight: 600; }
  .bar { display: flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 6px; margin: 2px 0; }
  .bar.light { background: #e8e8ec; } .bar.dark { background: #26262a; }
  .who { width: 140px; font-size: 11px; white-space: nowrap; } .light .who { color: rgba(0,0,0,.7); } .dark .who { color: rgba(255,255,255,.8); }
  .slot { width: 48px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 5px; }
  .open.light .slot { background: rgba(0,0,0,.11); } .open.dark .slot { background: rgba(255,255,255,.2); }
  .slot canvas { width: 18px; height: 18px; }
  .labels { display: flex; padding-left: 148px; } .labels span { width: 48px; text-align: center; font-size: 10px; color: #666; }
  .zoom .slot { width: 84px; height: 80px; } .zoom .bar { height: 82px; } .zoom canvas { width: 72px; height: 72px; image-rendering: pixelated; }
</style><body></body>`;

async function board(scale) {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({
      deviceScaleFactor: scale,
      viewport: { width: 1200, height: 800 },
    });
    await page.setContent(html);
    const diffs = await page.evaluate(
      async ({ rows, src, scale }) => {
        const px = 18 * scale;
        const load = (url) =>
          new Promise((ok, no) => {
            const i = new Image();
            i.onload = () => ok(i);
            i.onerror = no;
            i.src = url;
          });
        const ink = { light: "rgba(0,0,0,0.85)", dark: "#fff" };
        /** 그림을 화소 그대로 담은 캔버스 */
        async function draft(s, look) {
          if (!s.tpl) return null;
          const c = new OffscreenCanvas(px, px);
          const g = c.getContext("2d");
          if (s.color) g.drawImage(await load(s.color), 0, 0);
          const t = new OffscreenCanvas(px, px);
          const tg = t.getContext("2d");
          tg.drawImage(await load(s.tpl), 0, 0);
          tg.globalCompositeOperation = "source-in";
          tg.fillStyle = ink[look];
          tg.fillRect(0, 0, px, px);
          g.drawImage(t, 0, 0);
          return c;
        }
        async function app(s) {
          const c = new OffscreenCanvas(px, px);
          c.getContext("2d").drawImage(await load(s.app), 0, 0);
          return c;
        }
        function put(slot, img) {
          const c = document.createElement("canvas");
          c.width = px;
          c.height = px;
          if (img) c.getContext("2d").drawImage(img, 0, 0);
          slot.append(c);
        }
        const diffs = {};
        const body = document.body;
        const title = document.createElement("h2");
        title.textContent = `${scale}배 화면(${scale === 1 ? "1x" : "2x"} 그림, 실제 크기)`;
        body.append(title);
        const zoomKeys = [];
        for (const [name, slots] of Object.entries(rows)) {
          const h = document.createElement("h3");
          h.textContent = name;
          body.append(h);
          for (const look of ["light", "dark"]) {
            for (const [who, open] of [
              ["시안 F7", false],
              ["앱", false],
              ["앱 · 메뉴 열림", true],
            ]) {
              const bar = document.createElement("div");
              bar.className = `bar ${look}${open ? " open" : ""}`;
              bar.innerHTML = `<span class="who">${who} · ${look === "light" ? "밝은" : "어두운"}</span>`;
              for (const [appKey] of slots) {
                const s = src[`${appKey}|${look}`];
                const slot = document.createElement("div");
                slot.className = "slot";
                const img =
                  who === "시안 F7" ? await draft(s, look) : await app(s);
                put(slot, img);
                bar.append(slot);
                if (who === "앱" && !open) {
                  const d = await draft(s, look);
                  if (d) {
                    const a = img
                      .getContext("2d")
                      .getImageData(0, 0, px, px).data;
                    const b = d
                      .getContext("2d")
                      .getImageData(0, 0, px, px).data;
                    let max = 0;
                    let over = 0;
                    for (let i = 0; i < a.length; i++) {
                      const v = Math.abs(a[i] - b[i]);
                      if (v > max) max = v;
                      if (v > 2) over++;
                    }
                    diffs[`${appKey}|${look}`] = { max, over };
                  }
                }
              }
              body.append(bar);
            }
          }
          const labels = document.createElement("div");
          labels.className = "labels";
          for (const [, , label] of slots) {
            const sp = document.createElement("span");
            sp.textContent = label;
            labels.append(sp);
          }
          body.append(labels);
          for (const [k] of slots)
            if (
              (k.startsWith("gold@") || k === "warn-gold@7") &&
              !zoomKeys.includes(k)
            )
              zoomKeys.push(k);
        }
        const zh = document.createElement("h3");
        zh.textContent = "4배 확대(화소 그대로): 시안 F7 · 앱";
        body.append(zh);
        const zoom = document.createElement("div");
        zoom.className = "zoom";
        for (const look of ["light", "dark"]) {
          for (const who of ["시안 F7", "앱"]) {
            const bar = document.createElement("div");
            bar.className = `bar ${look}`;
            bar.innerHTML = `<span class="who">${who}</span>`;
            for (const k of zoomKeys) {
              const s = src[`${k}|${look}`];
              const slot = document.createElement("div");
              slot.className = "slot";
              put(slot, who === "앱" ? await app(s) : await draft(s, look));
              bar.append(slot);
            }
            zoom.append(bar);
          }
        }
        body.append(zoom);
        return diffs;
      },
      { rows: ROWS, src: sources(scale), scale },
    );
    await page.screenshot({
      path: path.join(outDir, `compare-${scale}x.png`),
      fullPage: true,
    });
    return diffs;
  } finally {
    await browser.close();
  }
}

const diffs = { "1x": await board(1), "2x": await board(2) };
writeFileSync(
  path.join(outDir, "diff.json"),
  `${JSON.stringify(diffs, null, 1)}\n`,
);
for (const [scale, d] of Object.entries(diffs)) {
  const vals = Object.values(d);
  if (!vals.length) continue;
  const max = Math.max(...vals.map((v) => v.max));
  const off = vals.filter((v) => v.over > 0).length;
  console.log(
    `${scale}: 아이콘 ${vals.length}개, 가장 큰 채널 차 ${max}, 2 넘게 다른 화소가 있는 아이콘 ${off}개`,
  );
}
console.log(`만듦: ${outDir}/compare-1x.png, compare-2x.png, diff.json`);
