/**
 * 3D 엠블럼을 미리 찍은 그림을 만들고 밝기 사다리를 잰다(docs/47 14-7). 3D 모양·재질·빛·바탕색이 바뀌면 다시 찍는다.
 * CI에서는 돌리지 않는다(GPU 없는 브라우저는 그림이 다르게 나온다).
 *
 * 0) 밝기 사다리 `src/cube/tiers/emblem3d/ladder-measure.json`(emblem3d/ladder.ts): 열 티어의 3D 장을 어두운·
 *    밝은 바탕, 정면·돌린 각에서 재서 엠블럼 전체·큐브·장식의 밝기(L*)와 반짝임을 표로 내고 남긴다. 위 티어일수록 크거나
 *    같아야 한다는 규칙을 어기면 그림을 찍지 않고 실패한다(값을 바꿔 순서가 뒤집히면 여기서 잡힌다).
 * 1) 대기 그림 `public/cube/tiers/emblem3d/<티어>-dark.webp`(emblem3d/poster.ts): 티어 화면의 내 티어 3D 칸이 그리는 첫
 *    장(정면) 그대로. 그래서 대기 그림과 3D 첫 장은 같은 카메라·같은 크기·같은 바탕이다(고정 규칙 2-1절).
 * 2) 진열 칸 그림 `public/cube/tiers/emblem3d/sprite/<티어>.webp`: 진열 칸 3D가 그리는 장을 좌우 각마다 한 장씩 가로로
 *    이어 붙인 그림. 칸은 이 그림을 넘겨 도는 것처럼 보인다(3D 문맥을 여럿 띄우지 않는다).
 * 3) 정지 그림 `public/cube/tiers/emblem3d/still/<티어>-<s|m|l>.webp`(emblem3d/still.ts): 정면 한 장, 투명 바탕. 작은
 *    단계(s)는 작게 봐도 알아보게 맞춰 찍는다(칸을 더 채움·밝힘·테두리, 티어 색 살리기 `SMALL_TINT`).
 * 4) Cubie 앱에 묶는 PNG `apps/cubie/Resources/Emblems/<티어>.png`(32pt·64px)와 `Emblems/big/<티어>.png`(64pt·128px).
 * 5) README 그림 `apps/cubie/docs/tiers.webp`: 열 티어를 아래에서 위로 오르는 사다리로(투명 바탕, GitHub 밝은·어두운 화면 모두).
 *
 * 쓰는 법(apps/web에서):
 *   pnpm build                                        # out/ 이 있어야 한다
 *   E2E_PORT=5892 node scripts/render-emblem-posters.mjs   # ONLY=ladder|posters|sprites|stills|cubie|readme, TIER=gold
 *   BASE=http://localhost:3456 …                      # 띄워 둔 서버를 쓴다(빌드 없이 잴 때)
 *
 * - 목록은 `poster.ts`·`still.ts`와 같아야 한다(.ts를 그대로 불러올 수 없어 여기 다시 적는다). 어긋나면 단위 시험
 *   `emblem3d/poster.test.ts`가 빠진 파일·남은 파일을 잡는다.
 * - 브라우저는 화면 시험과 같이 시스템 Chrome(`e2e/browser.ts`), 헤드리스. 찍는 고리는 티어 화면의 `?emblemCapture=1`.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { BROWSER } from "../e2e/browser.ts";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const posterDir = join(web, "public/cube/tiers/emblem3d");
const stillDir = join(posterDir, "still");
const spriteDir = join(posterDir, "sprite");
const cubieDir = join(web, "../cubie/Resources/Emblems");
const readmeFile = join(web, "../cubie/docs/tiers.webp");
const ladderFile = join(web, "src/cube/tiers/emblem3d/ladder-measure.json");
const PORT = Number(process.env.E2E_PORT ?? 5892);
const QUALITY = 0.9;
const ONLY = process.env.ONLY ?? "";
const TIER = process.env.TIER ?? "";

// table.ts TIER_IDS와 같게
const ALL_TIERS = [
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
const TIERS = ALL_TIERS.filter((t) => !TIER || t === TIER);
const LABEL = {
  iron: "아이언",
  bronze: "브론즈",
  silver: "실버",
  gold: "골드",
  platinum: "플래티넘",
  emerald: "에메랄드",
  diamond: "다이아몬드",
  master: "마스터",
  grandmaster: "그랜드마스터",
  challenger: "챌린저",
};
// poster.ts HERO_SIZE·POSTER_PAGE와 같게
const HERO_SIZE = 280;
const PAGE = { dark: "#171717", light: "#f5f5f5" };
// poster.ts LADDER_SIZE·SPRITE_YAWS와 같게
const LADDER_SIZE = 112;
const SPRITE_FRAMES = 17;
const SPRITE_AMP = 0.5;
const SPRITE_YAWS = Array.from(
  { length: SPRITE_FRAMES },
  (_, i) => -SPRITE_AMP + (2 * SPRITE_AMP * i) / (SPRITE_FRAMES - 1),
);
// ladder.ts MEASURE_*와 같게
const MEASURE_TIERS = ALL_TIERS;
const MEASURE_SIZE = 300;
const MEASURE_YAWS = [0, 0.6];
// still.ts STILL_CSS와 같게(파일은 두 배 화소). 작은 단계는 칸을 더 채우고 조금 밝히고 얇은 어두운 테두리를 두른다
const SMALL = JSON.parse(
  process.env.SMALL ?? '{"fill":1.12,"halo":1,"exposure":1.4,"outline":1}',
);
/**
 * 작은 단계만 티어 색을 살린다(2026-11-13 HQ 지시: 18·28·32px에서 다이아몬드가 흰 회색이라 실버·플래티넘과 갈리지
 * 않았다). 몸 색을 이 색 쪽으로 이만큼 물들인다(밝기는 그대로, 색 기운만). 비우면 예전처럼 찍는다(`SMALL_TINT={}`)
 */
const SMALL_TINT = JSON.parse(
  process.env.SMALL_TINT ??
    JSON.stringify({
      silver: { color: "#cfd8e6", amount: 0.25 },
      platinum: { color: "#2fd6c4", amount: 0.55 },
      diamond: { color: "#8ccdff", amount: 0.38 },
      challenger: { color: "#ffd36a", amount: 0.3 },
    }),
);
const STILLS = [
  { step: "s", px: 64, ...SMALL, small: true },
  { step: "m", px: 128 },
  { step: "l", px: 256 },
];
// Cubie: 32pt(64px)는 작은 단계 맞춤, 64pt(128px)는 보통
const CUBIE = [
  { dir: cubieDir, px: 64, ...SMALL, small: true },
  { dir: join(cubieDir, "big"), px: 128 },
];

const want = (k) => !ONLY || ONLY === k;

let server = null;
let base = process.env.BASE ?? "";
if (!base) {
  if (
    !existsSync(join(web, "out/cube/tiers.html")) &&
    !existsSync(join(web, "out/cube/tiers/index.html"))
  ) {
    console.error("out/ 에 /cube/tiers 가 없다. 먼저 pnpm build");
    process.exit(1);
  }
  // pnpm을 거치지 않고 serve를 바로 띄운다(pnpm 아래 자식은 server.kill()로 꺼지지 않는다)
  server = spawn(
    join(web, "node_modules/.bin/serve"),
    ["out", "-l", String(PORT), "--no-port-switching"],
    { cwd: web, stdio: "ignore" },
  );
  base = `http://localhost:${PORT}`;
}

async function waitServer() {
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`${base}/cube/tiers`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("서버가 뜨지 않았다");
}

/** PNG(바이트 또는 data URL) → WebP(바이트), 브라우저 안에서 */
async function toWebp(page, png) {
  const b64 = await page.evaluate(
    async ([src, quality]) => {
      const bin = Uint8Array.from(atob(src), (c) => c.charCodeAt(0));
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
  return Buffer.from(b64, "base64");
}

const fromDataUrl = (url) =>
  Buffer.from(url.slice(url.indexOf(",") + 1), "base64");

function save(file, bytes) {
  writeFileSync(file, bytes);
  console.log(
    `${file.slice(web.length + 1)} ${(bytes.length / 1024).toFixed(1)}KB`,
  );
}

/** 티어 화면을 찍기 고리와 함께 연다 */
async function capturePage(browser) {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${base}/cube/tiers?emblemCapture=1`);
  await page.waitForFunction(() => !!window.__emblemCapture, null, {
    timeout: 90_000,
  });
  return { context, page };
}

const PARTS = { body: "전체", core: "큐브", deco: "장식" };

/** 밝기 사다리를 재고 표를 낸다. 규칙을 어기면 false */
async function ladder(page) {
  const tiers = {};
  for (const tier of MEASURE_TIERS) {
    tiers[tier] = {};
    for (const bg of ["dark", "light"])
      for (const yaw of MEASURE_YAWS)
        tiers[tier][`${bg}-${yaw}`] = await page.evaluate(
          (j) => window.__emblemCapture.measure(j),
          { tier, size: MEASURE_SIZE, yaw, pageColor: PAGE[bg] },
        );
  }
  const print = await page.evaluate(() => window.__emblemCapture.print);
  const m = { print, tiers };
  // 표: 티어마다 영역별 네 조건 평균과 조건마다 값
  const avg = (t, part, k) => {
    const all = Object.values(tiers[t]).map((p) => p[part][k]);
    return all.reduce((s, x) => s + x, 0) / all.length;
  };
  console.log("\n밝기 사다리(L* 평균 / 반짝임 %, 네 조건 평균)");
  console.log(
    [
      "티어",
      ...Object.values(PARTS).flatMap((p) => [`${p} L*`, `${p} 반짝%`]),
    ].join("\t"),
  );
  for (const t of MEASURE_TIERS)
    console.log(
      [
        LABEL[t],
        ...Object.keys(PARTS).flatMap((p) => [
          avg(t, p, "meanL").toFixed(1),
          (avg(t, p, "sparkle") * 100).toFixed(2),
        ]),
      ].join("\t"),
    );
  console.log("\n조건마다(전체 L* · 장식 L* · 큐브 L*)");
  for (const t of MEASURE_TIERS)
    console.log(
      [
        LABEL[t],
        ...Object.entries(tiers[t]).map(
          ([k, v]) =>
            `${k} ${v.body.meanL.toFixed(1)}·${v.deco.meanL.toFixed(1)}·${v.core.meanL.toFixed(1)}`,
        ),
      ].join("\t"),
    );
  const bad = await page.evaluate(
    (x) => window.__emblemCapture.violations(x),
    m,
  );
  if (bad.length) {
    console.error(`\n사다리 규칙을 어김:\n${bad.join("\n")}`);
    if (process.env.LADDER_SAVE_ANYWAY !== "1") return false;
  }
  writeFileSync(ladderFile, `${JSON.stringify(m, null, 1)}\n`);
  console.log(`\n${ladderFile.slice(web.length + 1)} 남김`);
  return bad.length === 0;
}

async function posters(page) {
  mkdirSync(posterDir, { recursive: true });
  for (const tier of TIERS) {
    const [url] = await page.evaluate((j) => window.__emblemCapture.frames(j), {
      tier,
      size: HERO_SIZE,
      yaws: [0],
      pageColor: PAGE.dark,
    });
    save(
      join(posterDir, `${tier}-dark.webp`),
      await toWebp(page, fromDataUrl(url)),
    );
  }
}

/** 각도별 장을 가로로 이어 붙인 진열 칸 그림 */
async function sprites(page) {
  mkdirSync(spriteDir, { recursive: true });
  for (const tier of TIERS) {
    const b64 = await page.evaluate(
      async ([job, quality]) => {
        const urls = await window.__emblemCapture.frames(job);
        const imgs = await Promise.all(
          urls.map(async (u) =>
            createImageBitmap(await (await fetch(u)).blob()),
          ),
        );
        const w = imgs[0].width;
        const c = new OffscreenCanvas(w * imgs.length, w);
        const ctx = c.getContext("2d");
        for (const [i, im] of imgs.entries()) ctx.drawImage(im, i * w, 0);
        const blob = await c.convertToBlob({ type: "image/webp", quality });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (const x of buf) s += String.fromCharCode(x);
        return btoa(s);
      },
      [
        { tier, size: LADDER_SIZE, yaws: SPRITE_YAWS, pageColor: PAGE.dark },
        0.82,
      ],
    );
    save(join(spriteDir, `${tier}.webp`), Buffer.from(b64, "base64"));
  }
}

/** 정지 그림 한 장(투명 PNG data URL). 작은 단계는 티어 색을 살린다 */
async function stillPng(page, job) {
  return page.evaluate(
    async ([j, tint]) => {
      const [[url]] = await window.__emblemCapture.stills([
        {
          tier: j.tier,
          px: j.px,
          yaws: [0],
          ...(j.fill ? { fill: j.fill } : {}),
          ...(j.halo !== undefined ? { halo: j.halo } : {}),
          ...(j.exposure ? { exposure: j.exposure } : {}),
          ...(j.outline ? { outline: j.outline } : {}),
        },
      ]);
      if (!j.small || !tint) return url;
      // 몸 색을 티어 색 쪽으로 물들인다: 「color」 섞기(밝기는 그대로, 색상·채도만 티어 색)를 몸 모양 안에서만
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      const w = bmp.width;
      const out = new OffscreenCanvas(w, w);
      const o = out.getContext("2d");
      o.drawImage(bmp, 0, 0);
      const tinted = new OffscreenCanvas(w, w);
      const t = tinted.getContext("2d");
      t.drawImage(bmp, 0, 0);
      t.globalCompositeOperation = "color";
      t.globalAlpha = tint.amount;
      t.fillStyle = tint.color;
      t.fillRect(0, 0, w, w);
      t.globalAlpha = 1;
      t.globalCompositeOperation = "destination-in";
      t.drawImage(bmp, 0, 0);
      o.globalCompositeOperation = "copy";
      o.drawImage(tinted, 0, 0);
      const blob = await out.convertToBlob({ type: "image/png" });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const x of buf) s += String.fromCharCode(x);
      return `data:image/png;base64,${btoa(s)}`;
    },
    [job, job.small ? (SMALL_TINT[job.tier] ?? null) : null],
  );
}

async function stills(page, jobs) {
  for (const job of jobs) {
    const png = fromDataUrl(await stillPng(page, job));
    save(job.file, job.webp ? await toWebp(page, png) : png);
  }
}

/** README 사다리 그림: 열 티어를 왼쪽 아래에서 오른쪽 위로, 이름 아래에. 투명 바탕 */
async function readme(page) {
  const urls = [];
  for (const tier of ALL_TIERS)
    urls.push(await stillPng(page, { tier, px: 256 }));
  const b64 = await page.evaluate(
    async ([list, labels]) => {
      const imgs = await Promise.all(
        list.map(async (u) => createImageBitmap(await (await fetch(u)).blob())),
      );
      // 2배 화소: 칸 한 변 132 → 264, 위 티어일수록 조금 크고 높이 놓는다
      const S = 2;
      const W = 1120 * S;
      const H = 300 * S;
      const c = new OffscreenCanvas(W, H);
      const ctx = c.getContext("2d");
      const n = imgs.length;
      // 양옆 여백: 위 티어일수록 커져 마지막 칸 날개가 그림 밖으로 나가지 않게
      const side = 36 * S;
      const gap = (W - side * 2) / n;
      imgs.forEach((im, i) => {
        const size = (84 + i * 5) * S;
        const cx = side + gap * (i + 0.5);
        const bottom = H - 34 * S - i * 12 * S;
        ctx.drawImage(im, cx - size / 2, bottom - size, size, size);
        ctx.font = `600 ${15 * S}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#8b949e";
        ctx.fillText(labels[i], cx, bottom + 20 * S);
      });
      const blob = await c.convertToBlob({ type: "image/webp", quality: 0.9 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const x of buf) s += String.fromCharCode(x);
      return btoa(s);
    },
    [urls, ALL_TIERS.map((t) => LABEL[t])],
  );
  save(readmeFile, Buffer.from(b64, "base64"));
}

let browser;
let failed = false;
try {
  await waitServer();
  browser = await chromium.launch({
    channel: BROWSER.channel,
    ...BROWSER.launchOptions,
  });
  const { context, page } = await capturePage(browser);
  if (want("ladder") && !TIER) {
    if (!(await ladder(page))) {
      failed = true;
      throw new Error("밝기 사다리 규칙을 어겨 그림을 찍지 않았다");
    }
  }
  if (want("posters")) await posters(page);
  if (want("sprites")) await sprites(page);
  const jobs = [];
  if (want("stills")) {
    mkdirSync(stillDir, { recursive: true });
    for (const tier of TIERS)
      for (const s of STILLS)
        jobs.push({
          ...s,
          tier,
          webp: true,
          file: join(stillDir, `${tier}-${s.step}.webp`),
        });
  }
  if (want("cubie"))
    for (const c of CUBIE) {
      mkdirSync(c.dir, { recursive: true });
      for (const tier of TIERS)
        jobs.push({
          ...c,
          tier,
          webp: false,
          file: join(c.dir, `${tier}.png`),
        });
    }
  if (jobs.length) await stills(page, jobs);
  if (want("readme") && !TIER) await readme(page);
  await context.close();
} catch (e) {
  console.error(e.message);
  failed = true;
} finally {
  await browser?.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
