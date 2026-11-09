// 큐브 티어 엠블럼의 HDR 반짝임 그림(cube/tiers/TierEmblem.tsx). 다이아몬드·마스터·그랜드마스터·챌린저마다
//   hdr-<티어>-glint.avif   반짝임 점(엠블럼 SVG와 같은 자리, emblemArt.ts glintsFor) + 윗면 바깥 두 변의 금속 빛
//   hdr-<티어>-band0~2.avif 빛 띠 세 자리(왼쪽·가운데·오른쪽). CSS가 차례로 켰다 꺼 지나가는 것처럼 보인다
// 를 만든다. 그림은 엠블럼 viewBox(64×64)를 그대로 덮는다.
//
//   node apps/web/scripts/build-cube-tier-hdr.mjs
//
// 방식은 하늘의 별 따기 HDR 별빛(build-stardraw-hdr-glow.mjs, docs/36 HDR 별빛)과 같다.
// - AVIF, BT.2020 색역 + PQ 전송 함수(CICP 9/16/9), 10비트, 알파. Chrome(macOS)과 Safari 26이 HDR로 보여 준다.
// - 모든 화소의 색을 NITS(보통 흰색 203 nit의 약 5배)의 물든 흰빛으로 두고 모양은 알파로만 만든다. 가장자리를 낮은 nit로
//   두면 아래 SVG를 가려 회색 테두리가 된다.
// - img에 transform을 걸지 않으려고 띠의 자리를 그림 세 장에 굽는다(Safari가 transform 걸린 HDR 그림을 SDR로 그린 적이 있다).
// 모양 값은 emblemArt.ts에서 바로 불러온다(Node 형 지우기, Node 22.18+).
//
// 도구: libavif의 avifenc(Homebrew 공식 포뮬러 `libavif`). 16비트 PNG는 이 스크립트가 직접 쓴다(의존성 없음).
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

import {
  BAND_FRAMES,
  BAND_HALF,
  BAND_SLANT,
  CENTER,
  CUBE_R,
  coreScale,
  cubeHex,
  EMBLEM_BOX,
  glintsFor,
  HDR_TIERS,
  HDR_TINT,
} from "../src/cube/tiers/emblemArt.ts";

/** 그림 한 변(px). 엠블럼 64px을 3배 화면에서, 128px을 1.5배 화면에서 그대로 */
const SIZE = 192;
/** 화소 밝기(nit). 203이 보통 흰색 */
const NITS = 1000;
/** 띠는 반짝임보다 옅게(알파 상한) */
const BAND_A = 0.55;

const OUT_DIR = fileURLToPath(
  new URL("../public/cube/tiers/", import.meta.url),
);

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

/** 선형 sRGB(BT.709 원색) → 선형 BT.2020(ITU-R BT.2087) */
function toBt2020([r, g, b]) {
  return [
    0.6274 * r + 0.3293 * g + 0.0433 * b,
    0.0691 * r + 0.9195 * g + 0.0114 * b,
    0.0164 * r + 0.088 * g + 0.8956 * b,
  ];
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 볼록 다각형 안쪽까지의 거리(안쪽이면 양수, viewBox 단위) */
function insideDist(poly, x, y) {
  const side = (px, py, i) => {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    return (
      ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) /
      Math.hypot(bx - ax, by - ay)
    );
  };
  // 감는 방향과 상관없이 가운데가 양수가 되게
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const sign = Math.sign(side(cx, cy, 0));
  let d = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, sign * side(x, y, i));
  return d;
}

/** 선분까지의 거리 */
function segDist(x, y, [ax, ay], [bx, by]) {
  const ex = bx - ax;
  const ey = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)),
  );
  return Math.hypot(x - (ax + ex * t), y - (ay + ey * t));
}

/** 네 갈래 반짝임 하나의 알파 */
function glintAlpha(g, x, y) {
  const dx = x - g.x;
  const dy = y - g.y;
  const r = Math.hypot(dx, dy);
  const core = 1 - smoothstep(g.r * 0.08, g.r * 0.2, r);
  const glow = 0.45 * Math.exp(-((r / (g.r * 0.35)) ** 2));
  const ray = (along, perp) =>
    along > g.r
      ? 0
      : (1 - along / g.r) ** 1.6 * Math.exp(-((perp / (g.r * 0.07)) ** 2));
  const rays = Math.max(ray(Math.abs(dx), dy), ray(Math.abs(dy), dx));
  return 1 - (1 - core) * (1 - glow) * (1 - rays);
}

function glintLayer(tier) {
  const [T, UR, , , , UL] = cubeHex(tier);
  const glints = glintsFor(tier);
  return (x, y) => {
    let keep = 1;
    for (const g of glints) keep *= 1 - glintAlpha(g, x, y);
    // 윗면 바깥 두 변: 금속 모서리가 빛을 받는다(가는 선, 위 꼭짓점 쪽이 밝다)
    const edge = Math.min(segDist(x, y, UL, T), segDist(x, y, T, UR));
    const nearTop = 1 - Math.min(1, Math.hypot(x - T[0], y - T[1]) / 20);
    keep *= 1 - 0.7 * nearTop * Math.exp(-((edge / 0.55) ** 2));
    return 1 - keep;
  };
}

function bandLayer(tier, frame) {
  const hex = cubeHex(tier);
  const rc = CUBE_R * coreScale(tier);
  const cx = CENTER[0] + frame * rc;
  const half = BAND_HALF * rc;
  const k = Math.hypot(1, BAND_SLANT);
  return (x, y) => {
    const inside = smoothstep(-0.2, 0.6, insideDist(hex, x, y));
    if (inside <= 0) return 0;
    const lineX = cx - (y - CENTER[1]) * BAND_SLANT;
    const perp = (x - lineX) / k;
    return BAND_A * inside * Math.exp(-((perp / half) ** 2));
  };
}

function rgba16(alphaAt, tint) {
  const stride = 1 + SIZE * 8;
  const raw = Buffer.alloc(stride * SIZE);
  const lin = toBt2020(tint);
  const top = Math.max(...lin);
  const signal = lin.map((v) => Math.round(pq((NITS * v) / top) * 65535));
  const s = EMBLEM_BOX / SIZE;
  for (let py = 0; py < SIZE; py++) {
    raw[py * stride] = 0; // 줄 필터 없음
    for (let px = 0; px < SIZE; px++) {
      // 화소 가운데를 viewBox 좌표로, 4점 평균으로 가장자리를 매끄럽게
      let a = 0;
      for (const [ox, oy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ])
        a += alphaAt((px + ox) * s, (py + oy) * s);
      a /= 4;
      const o = py * stride + 1 + px * 8;
      for (let ch = 0; ch < 3; ch++) raw.writeUInt16BE(signal[ch], o + ch * 2);
      raw.writeUInt16BE(Math.round(Math.min(1, a) * 65535), o + 6);
    }
  }
  return raw;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png16(raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 16; // 비트 깊이
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function build(alphaAt, tint, name, dir) {
  const png = join(dir, `${name}.png`);
  const out = join(OUT_DIR, name);
  writeFileSync(png, png16(rgba16(alphaAt, tint)));
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
      "90",
      "--qalpha",
      "90",
      "--speed",
      "0",
      "--jobs",
      "1",
      "--ignore-icc",
      png,
      out,
    ],
    { stdio: "ignore" },
  );
  console.log(`썼다: ${out} (${statSync(out).size} B)`);
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), "cube-tier-hdr-"));
  try {
    for (const tier of HDR_TIERS) {
      build(glintLayer(tier), HDR_TINT[tier], `hdr-${tier}-glint.avif`, dir);
      for (const [i, frame] of BAND_FRAMES.entries())
        build(
          bandLayer(tier, frame),
          HDR_TINT[tier],
          `hdr-${tier}-band${i}.avif`,
          dir,
        );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
