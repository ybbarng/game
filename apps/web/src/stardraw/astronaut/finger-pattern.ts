import { sha256, taggedHash, utf8 } from "@game/stardraw-core";

import { serialOf } from "./identity";

/**
 * 지문 도장(docs/36 11-64). 우주인 등록 신청서에 지문 단추로 서명하면 서명 칸에 찍히고, 등록증 뒷면에도 작게 들어가는 붉은 인주 무늬.
 * 공개 열쇠 하나에서 결정적으로 정한다: 같은 패스키면 어느 기기에서든 같은 무늬다. 실제 지문과는 아무 관계가 없다
 * (패스키의 지문 인증은 기기 안에서 끝나고 사이트는 지문을 받지 않는다). 그래서 일부러 진짜 지문처럼 보이지 않게
 * 가운데에 별 하나, 골 사이에 별 점 몇 개를 둔다.
 *
 * 씨앗 s = taggedHash("stardraw/fingermark/v2", 등록번호 40비트). 등록번호는 공개 열쇠에서 나오고(`serialOf`) 앞면에 이미 보인다.
 * 등록증 공유본(/stardraw/card, docs/36 11-66)이 열쇠 없이 같은 도장을 그리도록 v1(공개 열쇠 65바이트)에서 바꿨다.
 * 이름·얼굴은 등록증 씨앗의 다른 바이트에서 뽑으니 도장과 상관없이 정해진다.
 * 값마다 sha256(s ‖ 이름)에서 뽑는다(이름이 곧 구분 문자열이라 값을 더해도 다른 값이 그대로다).
 *
 * 좌표는 그림 판(FM_W × FM_H) 기준이고, 기울기를 빼고 정한다(그릴 때 판 가운데를 축으로 통째로 돌린다).
 */
export const FINGERMARK_TAG = "stardraw/fingermark/v2";

/** 그림 판(세로로 긴 손가락 끝) */
export const FM_W = 100;
export const FM_H = 120;
/** 지문 윤곽(타원)의 가운데와 반지름 */
export const PAD = { cx: 50, cy: 60, rx: 38, ry: 50 } as const;
/** 기울기 상한(도) */
export const MAX_TILT = 15;

export type FingerKind = "whorl" | "loop-left" | "loop-right" | "arch";
export const FINGER_KINDS: readonly FingerKind[] = [
  "whorl",
  "loop-left",
  "loop-right",
  "arch",
];

export type Pt = { x: number; y: number };

/** 끊긴 골(break)·갈라진 골(fork). ridge는 골 번호, at은 그 골의 몇째 점인지(0~1) */
export interface Minutia {
  kind: "break" | "fork";
  ridge: number;
  at: number;
}

/** 골 사이의 별 점 */
export interface InkStar {
  x: number;
  y: number;
  r: number;
  /** 돌린 각(도) */
  rot: number;
}

export interface FingerMarkDef {
  kind: FingerKind;
  /** 소용돌이·고리의 가운데, 활은 꼭대기 바로 아래(가운데 별 자리) */
  core: Pt;
  /** 도장 기울기(도, 양수면 시계 방향) */
  tilt: number;
  /** 골 수 */
  ridges: number;
  /** 골 간격(판 단위) */
  gap: number;
  /** 소용돌이: 바퀴마다 가운데가 밀리는 방향(도). 고리: 다리가 눕는 각(도). 활: 쓰지 않음(0) */
  sweep: number;
  /** 소용돌이: 세로/가로 비율. 고리: 쓰지 않음(1). 활: 솟은 높이 */
  shape: number;
  minutiae: Minutia[];
  /** 별 사슬로 그리는 골(점선, 골 번호). 진짜 지문으로 보이지 않게 하는 꾸밈 */
  chains: number[];
  stars: InkStar[];
  ink: {
    /** 가장자리 진하기(가운데가 1) */
    edge: number;
    /** 진하게 눌린 쪽(도, 0이면 오른쪽) */
    press: number;
    /** 반대쪽이 옅어지는 정도 */
    fade: number;
    /** 인주 결 노이즈 씨앗 */
    noise: number;
  };
}

const u32 = (h: Uint8Array, i: number) =>
  (((h[i] ?? 0) << 24) >>> 0) +
  ((h[i + 1] ?? 0) << 16) +
  ((h[i + 2] ?? 0) << 8) +
  (h[i + 3] ?? 0);

/** 씨앗에서 이름별로 [0, 1) 값을 뽑는다 */
function roller(seed: Uint8Array) {
  const frac = (label: string) => u32(sha256(seed, utf8(label)), 0) / 2 ** 32;
  return {
    frac,
    num: (label: string, lo: number, hi: number) =>
      lo + (hi - lo) * frac(label),
    int: (label: string, n: number) => Math.floor(frac(label) * n),
  };
}

const kindOf = (f: number): FingerKind =>
  // 실제 지문 비율(고리가 가장 흔하고 활이 드물다)을 대강 따른다
  f < 0.34
    ? "whorl"
    : f < 0.64
      ? "loop-left"
      : f < 0.94
        ? "loop-right"
        : "arch";

/** 지문 윤곽 안인가(f는 반지름 비율, 1이면 윤곽 그 자리) */
export function insidePad(p: Pt, f = 1): boolean {
  const dx = (p.x - PAD.cx) / PAD.rx;
  const dy = (p.y - PAD.cy) / PAD.ry;
  return dx * dx + dy * dy < f * f;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 골 곡선들(점 목록). 기울기는 넣지 않은 판 좌표 */
export function ridgeLines(
  d: Pick<
    FingerMarkDef,
    "kind" | "core" | "ridges" | "gap" | "sweep" | "shape"
  >,
): Pt[][] {
  const { core, gap } = d;
  const out: Pt[][] = [];
  if (d.kind === "whorl") {
    // 바퀴마다 가운데가 조금씩 밀리는 타원: 소용돌이처럼 보인다
    const dir = (d.sweep * Math.PI) / 180;
    for (let k = 1; k <= d.ridges; k++) {
      const rx = (k - 0.35) * gap;
      const ry = rx * d.shape;
      const c = {
        x: core.x + Math.cos(dir) * 0.55 * (k - 1),
        y: core.y + Math.sin(dir) * 0.55 * (k - 1),
      };
      const n = Math.max(24, Math.round((Math.PI * (rx + ry)) / 2.2));
      const pts: Pt[] = [];
      for (let i = 0; i <= n; i++) {
        const t = (2 * Math.PI * i) / n;
        pts.push({ x: c.x + rx * Math.cos(t), y: c.y + ry * Math.sin(t) });
      }
      out.push(pts);
    }
    return out;
  }
  if (d.kind === "arch") {
    // 가로로 흐르다 가운데에서 솟는 골. 가운데 줄일수록 많이 솟는다
    const top = Math.floor((-10 - core.y) / gap);
    for (let j = 0; j < d.ridges; j++) {
      const k = top + j;
      const lift = d.shape * Math.exp(-((((k - 0.5) * gap) / 40) ** 2));
      const pts: Pt[] = [];
      for (let x = -12; x <= FM_W + 12; x += 2.5) {
        const b = Math.exp(-(((x - core.x) / 24) ** 2));
        pts.push({ x, y: core.y + (k - 0.5) * gap + lift * (1 - b) });
      }
      out.push(pts);
    }
    return out;
  }
  // 고리: 가운데를 감싸고 돌아 나가는 머리핀 모양. 다리가 한쪽 아래로 눕는다
  const a = (d.sweep * Math.PI) / 180;
  const rot = (p: Pt): Pt => ({
    x: core.x + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: core.y + p.x * Math.sin(a) + p.y * Math.cos(a),
  });
  const leg = 110;
  const step = 2.2;
  for (let k = 1; k <= d.ridges; k++) {
    const r = (k - 0.5) * gap;
    const pts: Pt[] = [];
    for (let y = leg; y > 0; y -= step) pts.push(rot({ x: -r, y }));
    const n = Math.max(8, Math.round((Math.PI * r) / step));
    for (let i = 0; i <= n; i++) {
      const t = Math.PI + (Math.PI * i) / n;
      pts.push(rot({ x: r * Math.cos(t), y: r * Math.sin(t) }));
    }
    for (let y = step; y <= leg; y += step) pts.push(rot({ x: r, y }));
    out.push(pts);
  }
  return out;
}

const pointAt = (line: Pt[], at: number): Pt =>
  line[Math.min(line.length - 1, Math.round(at * (line.length - 1)))] as Pt;

function nearest(line: Pt[], p: Pt): Pt {
  let best = line[0] as Pt;
  let bd = Infinity;
  for (const q of line) {
    const dd = dist(p, q);
    if (dd < bd) {
      bd = dd;
      best = q;
    }
  }
  return best;
}

/** 공개 열쇠(65바이트 원시 P-256) → 지문 도장 정의 */
export function fingermarkOf(pub: Uint8Array): FingerMarkDef {
  return fingermarkOfSerial(serialOf(pub));
}

/** 등록번호 40비트(5바이트) → 지문 도장 정의. 공유본은 열쇠 없이 이것으로 같은 도장을 그린다 */
export function fingermarkOfSerial(serial: Uint8Array): FingerMarkDef {
  return fingermarkFromHash(taggedHash(FINGERMARK_TAG, serial));
}

export function fingermarkFromHash(seed: Uint8Array): FingerMarkDef {
  const r = roller(seed);
  const kind = kindOf(r.frac("kind"));
  const gap = r.num("gap", 7.2, 8.8);
  const arch = kind === "arch";
  const core = {
    x: PAD.cx + r.num("core/x", -7, 7),
    y: arch ? PAD.cy + r.num("core/y", 2, 12) : PAD.cy + r.num("core/y", -6, 8),
  };
  const side = r.frac("tilt/side") < 0.5 ? -1 : 1;
  const tilt = side * r.num("tilt", 3, 13);
  let ridges: number;
  let sweep = 0;
  let shape = 1;
  if (kind === "whorl") {
    ridges = Math.ceil(64 / gap);
    sweep = r.num("sweep", 0, 360);
    shape = r.num("shape", 1.12, 1.3);
  } else if (arch) {
    ridges = Math.ceil((FM_H + 24) / gap) + 1;
    shape = r.num("shape", 13, 19);
  } else {
    ridges = Math.ceil(78 / gap);
    // 왼쪽 고리는 다리가 왼쪽 아래로, 오른쪽 고리는 오른쪽 아래로
    sweep = (kind === "loop-left" ? 1 : -1) * r.num("sweep", 24, 40);
  }
  const lines = ridgeLines({ kind, core, ridges, gap, sweep, shape });

  /** 고를 수 있는 자리: 윤곽 안쪽(f)이고 가운데 별에서 떨어진 골 위의 점(마지막 골은 이웃이 없어 뺀다) */
  const spots = (f: number, clear: number) => {
    const out: { ridge: number; i: number; p: Pt }[] = [];
    for (let k = 0; k < lines.length - 1; k++) {
      const line = lines[k] as Pt[];
      line.forEach((p, i) => {
        if (insidePad(p, f) && dist(p, core) > gap * clear)
          out.push({ ridge: k, i, p });
      });
    }
    return out;
  };

  // 끊긴 골·갈라진 골: 윤곽 안쪽, 가운데 별에서 떨어지고 서로 떨어진 자리만
  const minutiae: Minutia[] = [];
  const taken: Pt[] = [];
  const want = 2 + r.int("minutiae", 3);
  const mSpots = spots(0.72, 1.6);
  for (let i = 0; i < want && mSpots.length > 0; i++) {
    const mk: Minutia["kind"] =
      i === 0
        ? "break"
        : i === 1
          ? "fork"
          : r.frac(`minutia/${i}/kind`) < 0.5
            ? "break"
            : "fork";
    for (let t = 0; t < 80; t++) {
      const s = mSpots[r.int(`minutia/${i}/${t}`, mSpots.length)];
      if (!s || !taken.every((q) => dist(s.p, q) > gap * 2)) continue;
      const len = (lines[s.ridge] as Pt[]).length;
      minutiae.push({
        kind: mk,
        ridge: s.ridge,
        at: Math.round((s.i / (len - 1)) * 1000) / 1000,
      });
      taken.push(s.p);
      break;
    }
  }

  // 별 사슬: 윤곽 안에 넉넉히 보이고, 갈라진 골(가지가 나가거나 닿는 골)이 아닌 골 한두 줄
  const chains: number[] = [];
  const wantChains = 1 + r.int("chains", 2);
  const busy = new Set(
    minutiae
      .filter((m) => m.kind === "fork")
      .flatMap((m) => [m.ridge, m.ridge + 1]),
  );
  const seen = (k: number) =>
    (lines[k] as Pt[]).filter(
      (p) => insidePad(p, 0.85) && dist(p, core) > gap * CORE_CLEAR,
    ).length;
  const fits = (k: number) => !busy.has(k) && seen(k) >= 10;
  for (let i = 0; i < wantChains; i++) {
    for (let t = 0; t < 40; t++) {
      const k = r.int(`chain/${i}/${t}`, lines.length);
      if (fits(k) && chains.every((c) => Math.abs(c - k) > 2)) {
        chains.push(k);
        break;
      }
    }
  }
  // 하나도 못 골랐으면(갈라진 골이 몰린 소용돌이 등) 가장 많이 보이는 골을 둔다. 가지가 사슬에서 나가도 괜찮다
  if (chains.length === 0) {
    let best = 0;
    for (let k = 1; k < lines.length; k++) if (seen(k) > seen(best)) best = k;
    chains.push(best);
  }

  // 골 사이의 별 점
  const stars: InkStar[] = [];
  const wantStars = 5 + r.int("stars", 4);
  const sSpots = spots(0.85, 1.4);
  for (let i = 0; i < wantStars && sSpots.length > 0; i++) {
    for (let t = 0; t < 80; t++) {
      const s = sSpots[r.int(`star/${i}/${t}`, sSpots.length)];
      if (!s) continue;
      const p = s.p;
      const q = nearest(lines[s.ridge + 1] as Pt[], p);
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      if (
        dist(p, q) > gap * 0.7 &&
        insidePad(m, 0.8) &&
        dist(m, core) > gap * 1.8 &&
        stars.every((s) => dist(m, s) > gap * 1.6) &&
        taken.every((s) => dist(m, s) > gap)
      ) {
        stars.push({
          x: Math.round(m.x * 10) / 10,
          y: Math.round(m.y * 10) / 10,
          r: Math.round(r.num(`star/${i}/r`, 2.2, 3.1) * 10) / 10,
          rot: Math.round(r.num(`star/${i}/rot`, 0, 45)),
        });
        break;
      }
    }
  }

  return {
    kind,
    core,
    tilt,
    ridges,
    gap,
    sweep,
    shape,
    minutiae,
    chains,
    stars,
    ink: {
      edge: r.num("ink/edge", 0.32, 0.55),
      press: Math.round(r.num("ink/press", 0, 360)),
      fade: r.num("ink/fade", 0.18, 0.38),
      noise: 1 + r.int("ink/noise", 999),
    },
  };
}

/** 가운데 별 둘레로 골을 비우는 반지름(골 간격의 배수) */
export const CORE_CLEAR = 1.25;

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/** 점 목록 → SVG path(끊긴 자리는 건너뛴다) */
function pathOf(pts: Pt[]): string {
  let d = "";
  let open = false;
  for (const p of pts) {
    if (Number.isNaN(p.x)) {
      open = false;
      continue;
    }
    d += `${open ? "L" : "M"}${fmt(p.x)} ${fmt(p.y)}`;
    open = true;
  }
  return d;
}

/**
 * 그릴 선: 골마다 path 하나(끊긴 골은 그 자리를 비운다, 별 사슬 골은 `chain`)와 갈라진 골의 가지.
 * 판 밖으로 멀리 나간 점은 버린다(윤곽으로 자르니 보이지 않는다).
 */
export function fingerStrokes(d: FingerMarkDef): {
  ridges: { d: string; chain: boolean }[];
  forks: string[];
} {
  const lines = ridgeLines(d);
  const cuts = new Map<number, Pt[]>();
  const forks: string[] = [];
  for (const m of d.minutiae) {
    const line = lines[m.ridge] as Pt[];
    const p = pointAt(line, m.at);
    if (m.kind === "break") {
      cuts.set(m.ridge, [...(cuts.get(m.ridge) ?? []), p]);
      continue;
    }
    // 갈라진 골: 그 자리에서 이웃 골 쪽으로 가지를 하나 낸다
    const i = Math.round(m.at * (line.length - 1));
    const a = line[Math.max(0, i - 1)] as Pt;
    const b = line[Math.min(line.length - 1, i + 1)] as Pt;
    const len = dist(a, b) || 1;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    const q = nearest(lines[m.ridge + 1] as Pt[], {
      x: p.x + tx * d.gap * 1.6,
      y: p.y + ty * d.gap * 1.6,
    });
    const c = { x: p.x + tx * d.gap * 0.9, y: p.y + ty * d.gap * 0.9 };
    forks.push(
      `M${fmt(p.x)} ${fmt(p.y)}Q${fmt(c.x)} ${fmt(c.y)} ${fmt(q.x)} ${fmt(q.y)}`,
    );
  }
  const hole = d.gap * 0.45;
  const ridges = lines.map((line, k) => {
    const cut = cuts.get(k) ?? [];
    const pts = line.map((p) =>
      !insidePad(p, 1.15) ||
      dist(p, d.core) < d.gap * CORE_CLEAR ||
      cut.some((c) => dist(p, c) < hole)
        ? { x: Number.NaN, y: Number.NaN }
        : p,
    );
    return { d: pathOf(pts), chain: d.chains.includes(k) };
  });
  return { ridges: ridges.filter((s) => s.d !== ""), forks };
}
