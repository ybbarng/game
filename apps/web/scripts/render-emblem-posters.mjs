/**
 * 3D 엠블럼을 미리 찍은 그림을 만들고 밝기 사다리를 잰다(docs/47 14-7). 3D 모양·재질·빛·바탕색이 바뀌면 다시 찍는다.
 * CI에서는 돌리지 않는다(GPU 없는 브라우저는 그림이 다르게 나온다).
 *
 * 0) 밝기 사다리 `src/cube/tiers/emblem3d/ladder-measure.json`(emblem3d/ladder.ts): 열 티어의 3D 장을 어두운·
 *    밝은 바탕, 정면·돌린 각에서 재서 엠블럼 전체·큐브·장식의 밝기(L*)와 반짝임을 표로 내고 남긴다. 위 티어일수록 크거나
 *    같아야 한다는 규칙을 어기면 그림을 찍지 않고 실패한다(값을 바꿔 순서가 뒤집히면 여기서 잡힌다).
 * 1) 대기 그림 `public/cube/tiers/emblem3d/<티어>-dark.webp`(emblem3d/poster.ts): 티어 화면의 내 티어 3D 칸이 그리는 첫
 *    장(정면) 그대로. 그래서 대기 그림과 3D 첫 장은 같은 카메라·같은 크기·같은 바탕이다(고정 규칙 2-1절).
 * 1-1) HDR 대기 그림 `public/cube/tiers/emblem3d/<보석 티어>-dark-hdr.avif`(`ONLY=hdr`): HDR 화면에서 보석 3D가 쓰는
 *    HDR 길의 첫 장(반짝임이 흰색보다 밝다)을 BT.2020 PQ로. 먼저 HDR 길 생김새가 SDR 길과 같은지 화소로 견주고, 다르면
 *    실패한다. 헤드리스 Chrome의 WebGPU를 쓴다(이 맥 화면이 SDR이어도 찍힌다).
 * 2) 진열 칸 그림 `public/cube/tiers/emblem3d/sprite/<티어>.webp`: 진열 칸 3D가 그리는 장을 좌우 각마다 한 장씩 가로로
 *    이어 붙인 그림. 칸은 이 그림을 넘겨 도는 것처럼 보인다(3D 문맥을 여럿 띄우지 않는다).
 * 3) 정지 그림 `public/cube/tiers/emblem3d/still/<티어>-<s|m|l>.webp`(emblem3d/still.ts): 정면 한 장, 투명 바탕. 작은
 *    단계(s)는 작게 봐도 알아보게 맞춰 찍는다(칸을 더 채움·밝힘·테두리, 티어 색 살리기 `SMALL_TINT`).
 * 4) Cubie 앱에 묶는 PNG `apps/cubie/Resources/Emblems/<티어>.png`(32pt·64px)와 `Emblems/big/<티어>.png`(64pt·128px).
 * 4-1) Cubie 티어표 진열과 메뉴 프로필 칸의 흔들기 그림 `apps/cubie/Resources/Emblems/sway/`(`ONLY=cubie-sway`). 사다리
 *    칸은 2) 진열 칸 그림을 앱이 그대로 묶는다(`apps/cubie/build.sh`).
 * 4-2) Cubie HDR 배율 지도 `apps/cubie/Resources/Emblems/hdr/`(`ONLY=cubie-hdr`, 보석 티어만): 4-1 그림과 같은 각마다
 *    회색 한 장. HDR 화면에서 앱이 색 그림에 곱해 반짝임을 흰색보다 밝게 그린다(docs/52 5-16). 4-1을 다시 찍으면 함께.
 * 5) README 그림 `apps/cubie/docs/tiers.webp`: 열 티어를 아래에서 위로 오르는 사다리로(투명 바탕, GitHub 밝은·어두운 화면 모두).
 *
 * 쓰는 법(apps/web에서):
 *   pnpm build                                        # out/ 이 있어야 한다
 *   E2E_PORT=5892 node scripts/render-emblem-posters.mjs   # ONLY=ladder|posters|hdr|sprites|stills|cubie|cubie-sway|cubie-hdr|readme, TIER=gold
 *   BASE=http://localhost:3456 …                      # 띄워 둔 서버를 쓴다(빌드 없이 잴 때)
 *
 * - 목록은 `poster.ts`·`still.ts`와 같아야 한다(.ts를 그대로 불러올 수 없어 여기 다시 적는다). 어긋나면 단위 시험
 *   `emblem3d/poster.test.ts`가 빠진 파일·남은 파일을 잡는다.
 * - 브라우저는 화면 시험과 같이 시스템 Chrome(`e2e/browser.ts`), 헤드리스. 찍는 고리는 티어 화면의 `?emblemCapture=1`.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

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

/**
 * Cubie 앱 티어표 창 진열의 흔들기 그림(docs/52 5-11). 앱은 3D를 띄우지 않고(GPU로 그리면 드라이버가 약 108MB를 붙인다)
 * 위쪽 큰 칸 3D가 그리는 장을 좌우 각마다 미리 찍어 넘긴다. 사이트 흔들기와 같은 ±0.5 라디안을 `CUBIE_SWAY_FRAMES`장으로
 * 고르게 나누고, 앱은 이웃한 두 장을 겹쳐 사이 각을 메운다. 한 장씩 파일로 둔다(앱이 지금 보이는 장만 풀어 메모리를
 * 아낀다). 메뉴 프로필 칸(32pt)은 정지 그림 작은 단계와 같은 맞춤으로 `CUBIE_MENU_FRAMES`각을 투명 바탕에 찍어 가로로
 * 이어 붙인다. 앱 `TierShowcase.heroFrames`·`menuFrames`와 같아야 한다(앱 시험 `TierShowcaseTests`가 묶은 파일 수를 본다).
 * 장 수·품질은 앱 크기와 맞바꾼 값이다(25장 품질 0.75면 큰 칸만 4.9MB, docs/52 5-11)
 */
const evenYaws = (count) =>
  Array.from(
    { length: count },
    (_, i) => -SPRITE_AMP + (2 * SPRITE_AMP * i) / (count - 1),
  );
const CUBIE_SWAY_FRAMES = 21;
const CUBIE_SWAY_YAWS = evenYaws(CUBIE_SWAY_FRAMES);
const CUBIE_MENU_FRAMES = 13;
const CUBIE_MENU_YAWS = evenYaws(CUBIE_MENU_FRAMES);
const CUBIE_SWAY_QUALITY = Number(process.env.CUBIE_SWAY_QUALITY ?? 0.72);
const CUBIE_MENU_QUALITY = 0.8;
const cubieSwayDir = join(cubieDir, "sway");
/**
 * Cubie HDR 배율 지도(`ONLY=cubie-hdr`, docs/52 5-16): 보석 티어의 흔들기 그림마다 같은 각의 회색 그림 한 장. 값 v는
 * 배율 1 + (HDR_HEADROOM-1)·v/255. HDR 화면이면 앱이 색 그림(4-1)을 선형으로 펴서 이 배율을 곱해 흰색보다 밝게 그린다.
 * 큰 칸은 사이트 HDR 길이 그 각에서 그리는 장 그대로에서 잰 배율(SDR 화면 값으로 찍은 장과 1/3로 줄여 찍은 장의 비),
 * 메뉴 칸은 정지 그림 작은 단계와 같은 맞춤에서 HDR 길과 같은 규칙으로 잰 배율(`ShotJob.boost`)
 */
const cubieHdrDir = join(cubieDir, "hdr");
/** 배율 지도 WebP 품질(회색, 거의 검정이라 작다) */
const CUBIE_HDR_QUALITY = Number(process.env.CUBIE_HDR_QUALITY ?? 0.8);
/** 큰 칸 배율을 잴 때 이 아래 SDR 값(선형, 가장 큰 채널)은 키우지 않는다(키우는 곳은 톤 매핑 전 1.5 넘는 밝은 곳뿐) */
const BOOST_FLOOR = 0.2;

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

/** 저장소 뿌리에서 본 경로(Cubie 쪽 파일도 읽기 쉽게) */
const shown = (file) => relative(join(web, "../.."), file);

function save(file, bytes) {
  writeFileSync(file, bytes);
  console.log(`${shown(file)} ${(bytes.length / 1024).toFixed(1)}KB`);
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

// poster.ts HDR_POSTERS와 같게
const HDR_TIERS = ["emerald", "diamond", "master", "grandmaster", "challenger"];
/** HDR 길(키우기 1배)과 SDR 길의 정면 장 평균 화소 차(0~255) 상한. 넘으면 HDR 길 생김새가 어긋난 것 */
const HDR_PARITY_MAX = 3;
/** HDR 대기 그림의 보통 흰색 밝기(nit, ITU-R BT.2408) */
const SDR_WHITE_NITS = 203;

/** SMPTE ST 2084(PQ): 밝기(nit) → 0~1 신호 */
function pq(nits) {
  const m1 = 2610 / 16384;
  const m2 = (2523 / 4096) * 128;
  const c1 = 3424 / 4096;
  const c2 = (2413 / 4096) * 32;
  const c3 = (2392 / 4096) * 32;
  const p = (Math.max(0, nits) / 10000) ** m1;
  return ((c1 + c2 * p) / (1 + c3 * p)) ** m2;
}
const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
/** 선형 sRGB(BT.709) → 선형 BT.2020 */
const TO_2020 = [
  [0.6274, 0.3293, 0.0433],
  [0.0691, 0.9195, 0.0114],
  [0.0164, 0.088, 0.8956],
];

function pngChunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, body])));
  return Buffer.concat([len, tb, body, crc]);
}

/** 16비트 RGB PNG(값을 바꾸지 않는다. avifenc가 --cicp로 「BT.2020 PQ」라고 표시만 한다) */
function png16rgb(w, h, rgb16) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 16;
  ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 6));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 6);
    raw[row] = 0;
    for (let x = 0; x < w * 3; x++)
      raw.writeUInt16BE(rgb16[y * w * 3 + x], row + 1 + x * 2);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** PNG data URL들을 RGBA 바이트로(브라우저 안에서) */
async function rgbaOf(page, urls) {
  const out = await page.evaluate(async (list) => {
    const res = [];
    for (const u of list) {
      const bmp = await createImageBitmap(await (await fetch(u)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const x = c.getContext("2d");
      x.drawImage(bmp, 0, 0);
      const d = x.getImageData(0, 0, bmp.width, bmp.height).data;
      let s = "";
      for (let i = 0; i < d.length; i += 8192)
        s += String.fromCharCode(...d.subarray(i, i + 8192));
      res.push({ w: bmp.width, h: bmp.height, b64: btoa(s) });
    }
    return res;
  }, urls);
  return out.map((o) => ({ ...o, data: Buffer.from(o.b64, "base64") }));
}

/**
 * HDR 대기 그림(docs/47 14-7 「HDR 길」). 보석 티어마다
 * 1) HDR 길을 키우기 1배(SDR 화면 값만)로 그린 정면 장이 SDR 길 대기 그림과 같은지 본다(평균 화소 차 `HDR_PARITY_MAX`
 *    넘으면 실패, 생김새를 옮기며 어긋난 것을 잡는다).
 * 2) HDR 길 정면 장을 그대로(흰색까지)와 1/`HDR_HEADROOM`로 줄여(흰색보다 밝은 곳까지) 두 번 찍어 합친 선형 값을
 *    BT.2020 PQ 10비트 AVIF로 남긴다(보통 흰색 203 nit). SDR 화면 값 범위는 첫 그림의 값을 그대로 쓴다.
 */
async function hdrPosters(page) {
  const room = await page.evaluate(() => window.__emblemCapture.hdrHeadroom);
  let ok = true;
  for (const tier of HDR_TIERS.filter((t) => TIERS.includes(t))) {
    const job = { tier, size: HERO_SIZE, yaws: [0], pageColor: PAGE.dark };
    const shot = async (extra) =>
      (
        await page.evaluate((j) => window.__emblemCapture.frames(j), {
          ...job,
          ...extra,
        })
      )[0];
    const [sdr, flat, full, third] = await rgbaOf(page, [
      await shot({}),
      await shot({ path: "hdr", headroom: 1 }),
      await shot({ path: "hdr" }),
      await shot({ path: "hdr", view: 1 / room }),
    ]);
    let sum = 0;
    let over = 0;
    const n = sdr.w * sdr.h;
    const out = new Uint16Array(n * 3);
    for (let i = 0; i < n; i++) {
      const lin = [0, 1, 2].map((k) => {
        sum += Math.abs(sdr.data[i * 4 + k] - flat.data[i * 4 + k]);
        const a = full.data[i * 4 + k];
        // 흰색 근처까지는 그대로 찍은 값, 그 위는 줄여 찍은 값을 되돌린 것
        return a < 250
          ? srgbToLinear(a / 255)
          : srgbToLinear(third.data[i * 4 + k] / 255) * room;
      });
      if (Math.max(...lin) > 1.05) over++;
      for (let r = 0; r < 3; r++) {
        const v =
          TO_2020[r][0] * lin[0] +
          TO_2020[r][1] * lin[1] +
          TO_2020[r][2] * lin[2];
        out[i * 3 + r] = Math.round(pq(v * SDR_WHITE_NITS) * 65535);
      }
    }
    const mean = sum / (n * 3);
    console.log(
      `HDR ${LABEL[tier]}: SDR 길과 평균 화소 차 ${mean.toFixed(2)} · 흰색(1.05)보다 밝은 화소 ${((over / n) * 100).toFixed(2)}%`,
    );
    if (mean > HDR_PARITY_MAX) {
      console.error(
        `  HDR 길 생김새가 SDR 길과 다르다(상한 ${HDR_PARITY_MAX})`,
      );
      ok = false;
      continue;
    }
    const dir = mkdtempSync(join(tmpdir(), "emblem-hdr-"));
    try {
      const png = join(dir, "poster.png");
      writeFileSync(png, png16rgb(sdr.w, sdr.h, out));
      const file = join(posterDir, `${tier}-dark-hdr.avif`);
      execFileSync(
        "avifenc",
        [
          "--cicp",
          "9/16/9", // BT.2020 · PQ · BT.2020 비상수 휘도
          "--range",
          "full",
          "--depth",
          "10",
          "--yuv",
          "444",
          "--qcolor",
          "80",
          "--speed",
          "4",
          "--jobs",
          "1",
          "--ignore-icc",
          png,
          file,
        ],
        { stdio: "ignore" },
      );
      console.log(
        `${file.slice(web.length + 1)} ${(readFileSync(file).length / 1024).toFixed(1)}KB`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return ok;
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

/** PNG data URL 여럿 → 각각 WebP 바이트(브라우저 안에서) */
async function webpsOf(page, urls, quality) {
  const list = await page.evaluate(
    async ([us, q]) => {
      const out = [];
      for (const u of us) {
        const bmp = await createImageBitmap(await (await fetch(u)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        c.getContext("2d").drawImage(bmp, 0, 0);
        const blob = await c.convertToBlob({ type: "image/webp", quality: q });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (const x of buf) s += String.fromCharCode(x);
        out.push(btoa(s));
      }
      return out;
    },
    [urls, quality],
  );
  return list.map((b) => Buffer.from(b, "base64"));
}

/** Cubie 흔들기 그림: 큰 칸(280pt·배율 2, 불투명 티어표 바탕) 한 장씩과 메뉴 프로필 칸(32pt, 투명) 띠 */
async function cubieSway(page) {
  let total = 0;
  for (const tier of TIERS) {
    const dir = join(cubieSwayDir, tier);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const urls = await page.evaluate((j) => window.__emblemCapture.frames(j), {
      tier,
      size: HERO_SIZE,
      yaws: CUBIE_SWAY_YAWS,
      pageColor: PAGE.dark,
    });
    const files = await webpsOf(page, urls, CUBIE_SWAY_QUALITY);
    let sum = 0;
    files.forEach((b, i) => {
      writeFileSync(join(dir, `${String(i).padStart(2, "0")}.webp`), b);
      sum += b.length;
    });
    total += sum;
    console.log(`${shown(dir)} ${files.length}장 ${(sum / 1024).toFixed(1)}KB`);
    // 메뉴 프로필 칸: 정지 그림 작은 단계와 같은 맞춤(칸 채움·밝힘·테두리·티어 색)으로 각마다, 가로로 이어 붙인 PNG
    const cubieSmall = CUBIE[0];
    const frames = [];
    for (const yaw of CUBIE_MENU_YAWS)
      frames.push(
        await stillPng(page, { ...cubieSmall, tier, yaws: [yaw], yaw }),
      );
    const strip = await page.evaluate(
      async ([list, quality]) => {
        const imgs = await Promise.all(
          list.map(async (u) =>
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
      [frames, CUBIE_MENU_QUALITY],
    );
    const bytes = Buffer.from(strip, "base64");
    total += bytes.length;
    save(join(cubieSwayDir, `${tier}-menu.webp`), bytes);
  }
  console.log(`Cubie 흔들기 그림 합계 ${(total / 1024 / 1024).toFixed(2)}MB`);
}

/** 그림 여럿(data URL)을 가로로 이어 붙인 WebP 바이트 */
async function stripWebp(page, urls, quality) {
  const b64 = await page.evaluate(
    async ([list, q]) => {
      const imgs = await Promise.all(
        list.map(async (u) => createImageBitmap(await (await fetch(u)).blob())),
      );
      const w = imgs[0].width;
      const c = new OffscreenCanvas(w * imgs.length, w);
      const ctx = c.getContext("2d");
      for (const [i, im] of imgs.entries()) ctx.drawImage(im, i * w, 0);
      const blob = await c.convertToBlob({ type: "image/webp", quality: q });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const x of buf) s += String.fromCharCode(x);
      return btoa(s);
    },
    [urls, quality],
  );
  return Buffer.from(b64, "base64");
}

/**
 * 큰 칸 배율 지도: HDR 길을 키우기 1배(SDR 화면 값)로 찍은 장과 1/HDR_HEADROOM로 줄여 찍은 장에서 화소마다 배율을
 * 되돌린다(가장 큰 채널끼리 선형 값의 비 × HDR_HEADROOM, 1~HDR_HEADROOM). 회색 PNG data URL들
 */
async function gainUrls(page, flat, third, room) {
  return page.evaluate(
    async ([fs, ts, r, floor]) => {
      const lin = (v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const read = async (u) => {
        const bmp = await createImageBitmap(await (await fetch(u)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const x = c.getContext("2d");
        x.drawImage(bmp, 0, 0);
        return x.getImageData(0, 0, bmp.width, bmp.height);
      };
      const out = [];
      for (let k = 0; k < fs.length; k++) {
        const a = await read(fs[k]);
        const b = await read(ts[k]);
        const d = a.data;
        const e = b.data;
        const g = new ImageData(a.width, a.height);
        for (let i = 0; i < d.length; i += 4) {
          let ch = i;
          if (d[i + 1] > d[ch]) ch = i + 1;
          if (d[i + 2] > d[ch]) ch = i + 2;
          const s = lin(d[ch]);
          const boost =
            s < floor ? 1 : Math.min(r, Math.max(1, (lin(e[ch]) * r) / s));
          // 8비트 반올림 잡음(배율 1 근처)은 0으로
          let v = Math.round(((boost - 1) / (r - 1)) * 255);
          if (v < 3) v = 0;
          g.data[i] = v;
          g.data[i + 1] = v;
          g.data[i + 2] = v;
          g.data[i + 3] = 255;
        }
        const c = new OffscreenCanvas(a.width, a.height);
        c.getContext("2d").putImageData(g, 0, 0);
        const blob = await c.convertToBlob({ type: "image/png" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (const x of buf) s += String.fromCharCode(x);
        out.push(`data:image/png;base64,${btoa(s)}`);
      }
      return out;
    },
    [flat, third, room, BOOST_FLOOR],
  );
}

/** Cubie HDR 배율 지도: 보석 티어마다 큰 칸 21장(한 장씩)과 메뉴 프로필 칸 13각 띠 */
async function cubieHdr(page) {
  const room = await page.evaluate(() => window.__emblemCapture.hdrHeadroom);
  let total = 0;
  for (const tier of HDR_TIERS.filter((t) => TIERS.includes(t))) {
    const dir = join(cubieHdrDir, tier);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const job = {
      tier,
      size: HERO_SIZE,
      yaws: CUBIE_SWAY_YAWS,
      pageColor: PAGE.dark,
      path: "hdr",
    };
    const flat = await page.evaluate((j) => window.__emblemCapture.frames(j), {
      ...job,
      headroom: 1,
    });
    const third = await page.evaluate((j) => window.__emblemCapture.frames(j), {
      ...job,
      view: 1 / room,
    });
    const files = await webpsOf(
      page,
      await gainUrls(page, flat, third, room),
      CUBIE_HDR_QUALITY,
    );
    let sum = 0;
    files.forEach((b, i) => {
      writeFileSync(join(dir, `${String(i).padStart(2, "0")}.webp`), b);
      sum += b.length;
    });
    total += sum;
    console.log(`${shown(dir)} ${files.length}장 ${(sum / 1024).toFixed(1)}KB`);
    const frames = [];
    for (const yaw of CUBIE_MENU_YAWS)
      frames.push(
        await stillPng(page, {
          ...CUBIE[0],
          tier,
          yaws: [yaw],
          yaw,
          boost: true,
        }),
      );
    const bytes = await stripWebp(page, frames, CUBIE_HDR_QUALITY);
    total += bytes.length;
    save(join(cubieHdrDir, `${tier}-menu.webp`), bytes);
  }
  console.log(`Cubie HDR 배율 지도 합계 ${(total / 1024).toFixed(1)}KB`);
}

/** 정지 그림 한 장(투명 PNG data URL). 작은 단계는 티어 색을 살린다 */
async function stillPng(page, job) {
  return page.evaluate(
    async ([j, tint]) => {
      const [[url]] = await window.__emblemCapture.stills([
        {
          tier: j.tier,
          px: j.px,
          yaws: [j.yaw ?? 0],
          ...(j.fill ? { fill: j.fill } : {}),
          ...(j.halo !== undefined ? { halo: j.halo } : {}),
          ...(j.exposure ? { exposure: j.exposure } : {}),
          ...(j.outline ? { outline: j.outline } : {}),
          ...(j.boost ? { boost: true } : {}),
        },
      ]);
      if (!j.small || !tint || j.boost) return url;
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
  if (want("hdr") && !(await hdrPosters(page))) {
    failed = true;
    throw new Error(
      "HDR 길 생김새가 SDR 길과 달라 HDR 대기 그림을 찍지 않았다",
    );
  }
  if (want("sprites")) await sprites(page);
  if (want("cubie-sway")) await cubieSway(page);
  if (want("cubie-hdr")) await cubieHdr(page);
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
