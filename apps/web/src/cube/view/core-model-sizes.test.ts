import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { HIDDEN_222, LAYOUT, type V3 } from "./core-layout";
import {
  buildSizedCoreModel,
  dimpledCubie,
  GROOVE_444,
  SHELL_222,
  SHELL_444,
  SHELL_555,
} from "./core-model-sizes";

/** 도형 꼭짓점(맞춘 자리로 되돌림: 떼어 놓은 거리를 뺀다) */
function points(
  g: THREE.BufferGeometry,
  offset: V3 = [0, 0, 0],
): THREE.Vector3[] {
  const p = g.attributes.position as THREE.BufferAttribute;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++)
    out.push(
      new THREE.Vector3(
        p.getX(i) - offset[0],
        p.getY(i) - offset[1],
        p.getZ(i) - offset[2],
      ),
    );
  return out;
}

const keys = (ps: THREE.Vector3[]) =>
  new Set(
    ps.map((v) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`),
  );
const mirrorX = (ps: THREE.Vector3[]) =>
  ps.map((v) => new THREE.Vector3(-v.x, v.y, v.z));
const offsetOf = (n: 2 | 4 | 5, name: string): V3 => {
  const p = LAYOUT[n].find((x) => x.name === name);
  if (!p) throw new Error(name);
  return p.offset;
};

describe("크기별 분해 모델: 그리기 횟수", () => {
  it.each([
    // 검은 플라스틱 + 쇠(있으면) + 스티커 면 색
    { n: 2, calls: 5, faces: [0, 1, 2] },
    { n: 3, calls: 8, faces: [0, 1, 2, 3, 4, 5] },
    { n: 4, calls: 4, faces: [0, 1, 2] },
    { n: 5, calls: 8, faces: [0, 1, 2, 3, 4, 5] },
  ] as const)(
    "$n×$n: 재질별로 합쳐 한 장에 $calls번",
    ({ n, calls, faces }) => {
      const m = buildSizedCoreModel(n);
      expect([...m.stickers.keys()].sort()).toEqual(faces);
      expect(1 + (m.metal ? 1 : 0) + m.stickers.size).toBe(calls);
      expect(m.body.index).toBeNull();
    },
  );

  it("4×4 세베스테니 꼴에는 나사·스프링이 없다(쇠 없음)", () => {
    expect(buildSizedCoreModel(4).metal).toBeNull();
  });
});

describe("떼어 놓은 조각", () => {
  it.each([2, 4, 5] as const)(
    "%s: 조각끼리(심 포함) 0.1 넘게 떨어져 있다",
    (n) => {
      const { parts } = buildSizedCoreModel(n, true);
      const list = [...parts].map(([name, g]) => {
        g.computeBoundingBox();
        return { name, box: g.boundingBox as THREE.Box3, ps: points(g) };
      });
      const close: string[] = [];
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i] as (typeof list)[number];
          const b = list[j] as (typeof list)[number];
          // 상자 범위가 0.1 안으로 닿는 짝만 꼭짓점끼리 잰다(대각선으로 뻗은 목은 상자가 크다)
          if (!a.box.clone().expandByScalar(0.1).intersectsBox(b.box)) continue;
          let min = Number.POSITIVE_INFINITY;
          for (const p of a.ps)
            if (b.box.distanceToPoint(p) < 0.1)
              for (const q of b.ps) min = Math.min(min, p.distanceToSquared(q));
          if (Math.sqrt(min) <= 0.1) close.push(`${a.name}·${b.name}`);
        }
      expect(close).toEqual([]);
    },
  );
});

describe("2×2: 3×3 짜임을 코너 블럭이 덮은 꼴", () => {
  const { parts } = buildSizedCoreModel(2, true);

  it("심·숨은 센터 블럭·숨은 엣지 블럭은 모두 맞춘 큐브에서 속 구(코너 블럭이 덮는 구) 안에 있다", () => {
    const hidden: [string, V3][] = [
      ["core", [0, 0, 0]],
      ["edge", [0, HIDDEN_222.edge, HIDDEN_222.edge]],
      ...(["+x", "+y", "+z", "-x", "-y", "-z"] as const).map(
        (a): [string, V3] => {
          const i = "xyz".indexOf(a[1] as string);
          const v: [number, number, number] = [0, 0, 0];
          v[i] = (a[0] === "+" ? 1 : -1) * HIDDEN_222.center;
          return [`center${a}`, v];
        },
      ),
    ];
    for (const [name, off] of hidden) {
      const g = parts.get(name);
      if (!g) throw new Error(name);
      const far = Math.max(...points(g, off).map((v) => v.length()));
      expect(far, name).toBeLessThanOrEqual(SHELL_222.sphere + 1e-6);
    }
  });

  it("코너 블럭 몸통은 안쪽이 속 구 바깥 면으로 오목하다(가장 안쪽 점들이 그 구면 위)", () => {
    const ps = points(dimpledCubie([0.5, 0.5, 0.5], SHELL_222.sphere));
    const near = Math.min(...ps.map((v) => v.length()));
    expect(near).toBeCloseTo(SHELL_222.sphere, 6);
    // 오목한 면은 점 하나가 아니라 넓은 면: 구면 위 점이 많다
    expect(
      ps.filter((v) => Math.abs(v.length() - SHELL_222.sphere) < 1e-6).length,
    ).toBeGreaterThan(100);
  });

  it("센터 블럭 머리가 엣지 블럭 혀를, 엣지 블럭 혀가 코너 블럭 혀를 덮는다", () => {
    expect(SHELL_222.edgeLip[1]).toBeLessThanOrEqual(SHELL_222.centerCap[0]);
    expect(SHELL_222.cornerLip[1]).toBeLessThanOrEqual(SHELL_222.edgeLip[0]);
    expect(SHELL_222.centerCap[1]).toBe(SHELL_222.sphere);
  });
});

describe("4×4: 세베스테니 특허 꼴", () => {
  const { parts } = buildSizedCoreModel(4, true);
  const part = (name: string) => {
    const g = parts.get(name);
    if (!g) throw new Error(name);
    return points(g, offsetOf(4, name));
  };

  it("센터 블럭 캠은 홈 바닥(공)과 길잡이 사이에 들고, 홈 가장자리를 넘어 길잡이 밑으로 걸린다", () => {
    const cam = part("center").filter((v) => v.length() < SHELL_444.guide[0]);
    expect(cam.length).toBeGreaterThan(0);
    for (const v of cam) {
      expect(v.length()).toBeGreaterThanOrEqual(SHELL_444.ball - 1e-6);
      expect(v.length()).toBeLessThanOrEqual(SHELL_444.guide[0]);
    }
    expect(Math.max(...cam.map((v) => v.x / v.y))).toBeGreaterThan(GROOVE_444);
  });

  it("날개의 다리는 모두 위·앞 센터 블럭 몸통 밑(y·z가 1 아래)에 있다", () => {
    for (const name of ["wing-right", "wing-left"]) {
      const legs = part(name).filter((v) => v.y < 1.01 || v.z < 1.01);
      expect(legs.length, name).toBeGreaterThan(0);
      for (const v of legs) {
        expect(v.y, name).toBeLessThanOrEqual(1.0 + 1e-6);
        expect(v.z, name).toBeLessThanOrEqual(1.0 + 1e-6);
      }
    }
  });

  it("왼쪽 날개는 오른쪽 날개를 거울에 비친 꼴이고, 한 날개는 제 거울상과 다르다(그래서 뒤집히지 않는다)", () => {
    // 맞춘 자리 기준: 오른쪽 날개는 x 0~1, 왼쪽 날개는 x -1~0
    const right = part("wing-right");
    const left = part("wing-left");
    expect(keys(mirrorX(right))).toEqual(keys(left));
    // 오른쪽 날개를 제 가운데(x 0.5)에서 거울에 비치면 다른 꼴
    const self = right.map((v) => new THREE.Vector3(1 - v.x, v.y, v.z));
    expect(keys(self)).not.toEqual(keys(right));
  });

  it("코너 블럭 캠은 날개 받침의 낮춘 끝 위에 얹힌다", () => {
    expect(SHELL_444.cornerCam[0]).toBeGreaterThanOrEqual(SHELL_444.wingRecess);
    expect(SHELL_444.wingRecess).toBeLessThan(SHELL_444.wingCam[1]);
    expect(SHELL_444.dovetail[1]).toBeLessThan(SHELL_444.wingCam[0]);
  });
});

describe("5×5: Eastsheen 꼴(조각이 조각을 잡는 사슬)", () => {
  it("고정 센터 블럭 접시 → 둘레 센터 블럭 발 → 가운데 엣지 블럭 발·날개 발 → 코너 블럭 발 차례로 안쪽", () => {
    const S = SHELL_555;
    expect(S.centerFoot[1]).toBeLessThanOrEqual(S.dish[0]);
    expect(S.edgeFoot[1]).toBeLessThanOrEqual(S.centerFoot[0]);
    expect(S.wingFoot[1]).toBeLessThanOrEqual(S.centerFoot[0]);
    expect(S.cornerFoot[1]).toBeLessThanOrEqual(S.wingFoot[0]);
  });

  it("코너 블럭 발은 맞춘 큐브에서 날개 발보다 안쪽 구면에 있다", () => {
    const { parts } = buildSizedCoreModel(5, true);
    const near = (name: string) => {
      const g = parts.get(name);
      if (!g) throw new Error(name);
      return Math.min(...points(g, offsetOf(5, name)).map((v) => v.length()));
    };
    expect(near("corner")).toBeCloseTo(SHELL_555.cornerFoot[0], 3);
    expect(near("wing")).toBeCloseTo(SHELL_555.wingFoot[0], 3);
    expect(near("mid-edge")).toBeCloseTo(SHELL_555.edgeFoot[0], 3);
  });
});
