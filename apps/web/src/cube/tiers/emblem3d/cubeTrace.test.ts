import { describe, expect, it } from "vitest";

import { traceCube } from "./cubeTrace";
import { GEM_BOX_HALF, smoothstep, traceGem, type Vec3 } from "./gem";
import { GEM_STYLE_LOOK, throughCos } from "./gemStyle";

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
