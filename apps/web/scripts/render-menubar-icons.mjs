/**
 * Cubie 메뉴 막대 티어 아이콘(docs/52 5-26)의 원본 그림을 3D 엠블럼에서 찍는다. 앱에 넣는 그림은 이 원본으로
 * `apps/cubie/scripts/make-menu-tier-icons.swift`가 굽는다.
 * 찍기 고리는 `render-emblem-posters.mjs`와 같은 티어 화면 `?emblemCapture=1`, 브라우저도 같은 시스템 Chrome.
 *
 *   pnpm --filter @game/web dev   # 다른 창에서(포트 3456)
 *   OUT=<폴더> node apps/web/scripts/render-menubar-icons.mjs
 *   swift apps/cubie/scripts/make-menu-tier-icons.swift <폴더>
 *
 * 찍는 것(티어마다, 투명 PNG 144px, 정면, 정지 그림 작은 단계와 같은 맞춤·티어 색 살리기):
 * - `emblem-<티어>.png`: 엠블럼 전체(후광 없이). 틀·날개·볏·왕관 단색 층의 본
 * - `core-<티어>.png`: 같은 카메라로 몸 가운데 큐브만(조각 27개, `ShotJob.part = "core"`). 단색 층에서 큐브 자리를 비운다
 * - `block-<티어>.png`: 같은 카메라로 큐브만, 칸 없는 한 덩이(`ShotJob.cubeCells = 1`). 아이콘의 컬러 층
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

import { BROWSER } from "../e2e/browser.ts";

const BASE = process.env.BASE ?? "http://localhost:3456";
const OUT = process.env.OUT;
if (!OUT) {
  console.error("OUT=<폴더> 가 필요하다");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

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
// render-emblem-posters.mjs SMALL·SMALL_TINT와 같게
const SMALL = { fill: 1.12, halo: 1, exposure: 1.4, outline: 1 };
const SMALL_TINT = {
  silver: { color: "#cfd8e6", amount: 0.25 },
  platinum: { color: "#2fd6c4", amount: 0.55 },
  diamond: { color: "#8ccdff", amount: 0.38 },
  challenger: { color: "#ffd36a", amount: 0.3 },
};
const PX = 144;

async function shot(page, job, tint) {
  return page.evaluate(
    async ([j, t]) => {
      const [[url]] = await window.__emblemCapture.stills([j]);
      if (!t) return url;
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      const w = bmp.width;
      const c = new OffscreenCanvas(w, w);
      const g = c.getContext("2d");
      g.drawImage(bmp, 0, 0);
      g.globalCompositeOperation = "color";
      g.globalAlpha = t.amount;
      g.fillStyle = t.color;
      g.fillRect(0, 0, w, w);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "destination-in";
      g.drawImage(bmp, 0, 0);
      const blob = await c.convertToBlob({ type: "image/png" });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const x of buf) s += String.fromCharCode(x);
      return `data:image/png;base64,${btoa(s)}`;
    },
    [job, tint ?? null],
  );
}

function save(name, url) {
  const file = join(OUT, name);
  writeFileSync(file, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
  console.log(file);
}

const browser = await chromium.launch({
  channel: BROWSER.channel,
  ...BROWSER.launchOptions,
});
try {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${BASE}/cube/tiers?emblemCapture=1`);
  await page.waitForFunction(() => !!window.__emblemCapture, null, {
    timeout: 180_000,
  });
  for (const tier of TIERS) {
    const tint = SMALL_TINT[tier];
    const base = { tier, px: PX, yaws: [0], ...SMALL };
    // 단색 층은 후광을 빼고 찍는다(옅은 얼룩으로 남는다)
    save(`emblem-${tier}.png`, await shot(page, { ...base, halo: 0 }, tint));
    save(`core-${tier}.png`, await shot(page, { ...base, part: "core" }, tint));
    save(
      `block-${tier}.png`,
      await shot(page, { ...base, part: "core", cubeCells: 1 }, tint),
    );
  }
  await context.close();
} finally {
  await browser.close();
}
