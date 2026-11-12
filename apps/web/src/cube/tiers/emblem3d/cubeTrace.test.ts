import { describe, expect, it } from "vitest";

import { traceCube } from "./cubeTrace";
import { GEM_BOX_HALF, smoothstep, traceGem, type Vec3 } from "./gem";
import { type FacetCut, GEM_STYLE_LOOK, throughCos } from "./gemStyle";

/**
 * 「조각마다 진한 안쪽 사각형」을 재는 잣대(docs/47 14-7 일곱째 시안). 등각 정면(눈 방향 몸통 대각선)에서 맨 앞 위
 * 조각(큐브 자리 1,1,1)의 윗면 점마다 두 가지를 셈한다.
 * - 짙기: 나가는 빛이 유리 안을 지난 길이의 평균(나가는 몫으로 가중). 길수록 녹색이 짙다.
 * - 밝기: 나가는 빛이 뒤 배경(1)을 읽는지 어두운 방(0.12)을 읽는지(셰이더 `gemSee`와 같은 섞기, 유리 시안의 꿰뚫어
 *   보기 각).
 * 면 가운데(반 변의 25% 안)와 둘레 띠(70~95%) 평균을 견준다.
 */

const VIEW: Vec3 = [-1, -1, -1];
const VN = Math.sqrt(3);
const TOP: Vec3 = [0, 1, 0];
const CELL: Vec3 = [1, 1, 1];
const IOR = 1.52;
const look = GEM_STYLE_LOOK.f;
const ABSORB = -Math.log(look.left[1]) / 0.92;
const [LO, HI] = throughCos(look);
const ROOM = 0.12;

function seen(dir: Vec3): number {
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  const c = (dir[0] * VIEW[0] + dir[1] * VIEW[1] + dir[2] * VIEW[2]) / l / VN;
  const w = c > 1e-3 ? smoothstep(LO, HI, c) : 0;
  return w + (1 - w) * ROOM;
}

type Model = "piece" | "whole" | "grid";

/** 윗면 위 점(면 반 변 기준 u, v)의 짙기(평균 길이)와 밝기 */
function sample(model: Model, u: number, v: number) {
  const local: Vec3 = [u * GEM_BOX_HALF, GEM_BOX_HALF, v * GEM_BOX_HALF];
  let w = 0;
  let len = 0;
  let b = 0;
  const take = (dir: Vec3, weight: number, path: number) => {
    w += weight;
    len += weight * path;
    b += weight * seen(dir);
  };
  if (model === "piece") {
    const r = traceGem("box", local, VIEW, TOP, IOR, ABSORB);
    for (const e of r.exits) take(e.dir, e.weight, e.path);
  } else {
    const p: Vec3 = [
      CELL[0] + local[0],
      CELL[1] + local[1],
      CELL[2] + local[2],
    ];
    const r = traceCube(model, p, VIEW, TOP, IOR, ABSORB, CELL);
    for (const e of r.exits) take(e.dir, e.weight, e.path);
    take(r.leftDir, r.left, r.path);
  }
  return { len: len / w, bright: b };
}

/** 가운데와 둘레 띠의 짙기·밝기, 차이(큰 쪽 대비) */
function rings(model: Model) {
  const acc = {
    c: { len: 0, bright: 0, n: 0 },
    o: { len: 0, bright: 0, n: 0 },
  };
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const u = -0.95 + (1.9 * i) / 40;
      const v = -0.95 + (1.9 * j) / 40;
      const r = Math.max(Math.abs(u), Math.abs(v));
      const ring = r < 0.25 ? acc.c : r > 0.7 ? acc.o : null;
      if (!ring) continue;
      const s = sample(model, u, v);
      ring.len += s.len;
      ring.bright += s.bright;
      ring.n++;
    }
  const diff = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b);
  const c = { len: acc.c.len / acc.c.n, bright: acc.c.bright / acc.c.n };
  const o = { len: acc.o.len / acc.o.n, bright: acc.o.bright / acc.o.n };
  return {
    center: c,
    border: o,
    len: diff(c.len, o.len),
    bright: diff(c.bright, o.bright),
  };
}

/**
 * 큐브 전체에 걸친 안쪽 경계(여덟째 시안, 사용자 「한 덩이 유리도 가운데 녹색 사각형이 이상하게 생기는데?」). 정면에서
 * 큐브 윗면 전체(조각 아홉 칸)를 8×8 덩어리로 나눠, 덩어리마다 나가는 빛 가운데 뒤 배경을 읽는 몫(배경판·방 경계가
 * 영역을 가른다)의 평균을 구하고, 덩어리 사이 가장 큰 차를 본다. 가는 틈 자국은 덩어리 평균에 묻힌다.
 */
function regionSpread(
  mode: "whole" | "pass",
  ior: number,
  cut?: FacetCut,
  byCell = false,
): number {
  const N = 8;
  const S = 5;
  const vals: number[] = [];
  /** 조각 단위로 모을 때(깎은 면 무늬는 조각마다 되풀이되므로 조각 평균끼리 견준다) */
  const cells = new Map<string, { s: number; n: number }>();
  const top = mode === "whole" ? 1.495 : 1 + GEM_BOX_HALF;
  for (let bi = 0; bi < N; bi++)
    for (let bj = 0; bj < N; bj++) {
      let s = 0;
      let n = 0;
      for (let i = 0; i < S; i++)
        for (let j = 0; j < S; j++) {
          const x = -top + ((bi + (i + 0.5) / S) / N) * 2 * top;
          const z = -top + ((bj + (j + 0.5) / S) / N) * 2 * top;
          const cell: Vec3 = [Math.round(x), 1, Math.round(z)];
          // 틈 위 점은 건너뛴다(겉면에 보이는 틈 자국)
          if (
            mode === "pass" &&
            (Math.abs(x - cell[0]) > GEM_BOX_HALF ||
              Math.abs(z - cell[2]) > GEM_BOX_HALF)
          )
            continue;
          const r = traceCube(
            mode,
            [x, top, z],
            VIEW,
            TOP,
            ior,
            0,
            cell,
            undefined,
            undefined,
            cut,
          );
          let through = 0;
          let all = 0;
          const take = (dir: Vec3, w: number) => {
            all += w;
            through += (w * (seen(dir) - ROOM)) / (1 - ROOM);
          };
          for (const e of r.exits) take(e.dir, e.weight);
          take(r.leftDir, r.left);
          s += through / all;
          n++;
          const key = `${cell[0]},${cell[2]}`;
          const c = cells.get(key) ?? { s: 0, n: 0 };
          c.s += through / all;
          c.n++;
          cells.set(key, c);
        }
      if (n) vals.push(s / n);
    }
  const list = byCell ? [...cells.values()].map((c) => c.s / c.n) : vals;
  return Math.max(...list) - Math.min(...list);
}

// 2026-11-12 잰 값: h 0.97, 유리 굴절률의 m 0.93, l·m(굴절률 1.12) 0.007
describe("큐브 전체의 안쪽 경계(docs/47 14-7 여덟째 시안)", () => {
  it("유리 굴절률(1.52)이면 옆면 전반사가 영역을 갈라 큰 경계가 생긴다(h, 틈만 통과하는 m도 같다)", () => {
    expect(regionSpread("whole", 1.52)).toBeGreaterThan(0.5);
    expect(regionSpread("pass", 1.52)).toBeGreaterThan(0.5);
  });

  it("l·m: 안의 빛길 굴절률을 1.12로 낮추면 영역이 갈리지 않는다(덩어리 사이 차 0.05 안)", () => {
    for (const s of ["l", "m", "m2"] as const) {
      const look = GEM_STYLE_LOOK[s];
      expect(look.traceIor).toBeLessThan(Math.SQRT2);
      expect(look.tint).toBeDefined();
      expect(look.glow).toBe(0);
    }
    expect(
      regionSpread("whole", GEM_STYLE_LOOK.l.traceIor as number),
    ).toBeLessThan(0.05);
    expect(
      regionSpread("pass", GEM_STYLE_LOOK.m.traceIor as number),
    ).toBeLessThan(0.05);
  });

  it("m·m2: 조각마다 평균 내면 조각끼리 차가 없다(큐브 전체의 안쪽 경계 없음). m2의 깎은 면 무늬는 조각마다 되풀이될 뿐이다", () => {
    // 2026-11-12 잰 값: m 0.007, m2 0.098(가장자리 조각의 깎은 면이 큐브 모서리 쪽으로 빛을 내보내는 몫), 유리 굴절률 0.3 넘음
    for (const [s, max] of [
      ["m", 0.05],
      ["m2", 0.15],
    ] as const) {
      const look = GEM_STYLE_LOOK[s];
      expect(look.trace).toBe("pass");
      expect(
        regionSpread("pass", look.traceIor as number, look.cut, true),
      ).toBeLessThan(max);
    }
    // 유리 굴절률이면 조각 평균끼리도 크게 갈린다(안쪽 큐브 경계)
    expect(regionSpread("pass", 1.52, undefined, true)).toBeGreaterThan(0.3);
  });
});

// 2026-11-12 잰 값(41×41 점): 조각 하나 밝기 차 13%(가운데 0.78·둘레 0.68), 한 덩이 0.8%, 격자 28%(가운데 0.41·
// 둘레 0.57). 짙기(지난 길이) 차는 셋 다 1% 아래
describe("조각마다 진한 안쪽 사각형(docs/47 14-7 일곱째 시안)", () => {
  it("조각 하나 안에서만 따라가면(시안 f까지) 가운데가 둘레보다 10% 넘게 밝다: 옆으로 나간 빛이 이웃 유리 대신 방을 읽는다", () => {
    const r = rings("piece");
    expect(r.center.bright).toBeGreaterThan(r.border.bright);
    expect(r.bright).toBeGreaterThan(0.1);
  });

  it("h 한 덩이 유리: 조각마다 안쪽 사각형이 없다(가운데·둘레 밝기 차 5%·짙기 차 2% 안)", () => {
    const r = rings("whole");
    expect(r.bright).toBeLessThan(0.05);
    expect(r.len).toBeLessThan(0.02);
  });

  it("i 이웃까지 추적: 틈의 공기 면에서 임계각을 넘는 빛이 전반사해 조각 무늬가 남는다(가운데가 둘레보다 어둡다). 공기 틈을 둔 유리 조각 모음의 물리 그대로", () => {
    const r = rings("grid");
    expect(r.center.bright).toBeLessThan(r.border.bright);
    expect(r.len).toBeLessThan(0.02);
  });

  it("되튐 횟수를 늘려도 결과가 같다(셰이더의 횟수가 모자라 생긴 무늬가 아니다)", () => {
    const mean = (mode: "whole" | "grid", bounces: number) => {
      let s = 0;
      for (let i = 0; i <= 8; i++) {
        const u = -0.9 + (1.8 * i) / 8;
        const p: Vec3 = [
          CELL[0] + u * GEM_BOX_HALF,
          CELL[1] + GEM_BOX_HALF,
          CELL[2],
        ];
        const r = traceCube(
          mode,
          p,
          VIEW,
          TOP,
          IOR,
          ABSORB,
          CELL,
          undefined,
          bounces,
        );
        s += r.left * seen(r.leftDir);
        for (const e of r.exits) s += e.weight * seen(e.dir);
      }
      return s / 9;
    };
    expect(mean("whole", 30)).toBeCloseTo(mean("whole", 6), 2);
    expect(mean("grid", 30)).toBeCloseTo(mean("grid", 9), 2);
  });
});
