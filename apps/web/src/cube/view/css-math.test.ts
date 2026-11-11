import { describe, expect, it } from "vitest";

import {
  apply,
  cameraFor,
  cubeDist,
  faceRotation,
  mirrorFlatten,
  perspectivePx,
  project,
  rootMatrix,
  rotation,
  snap,
  toCss,
  translation,
} from "./css-math";
import { normalVec, type Vec3 } from "./geometry";
import { mirrorCells, mirrorPanels } from "./mirror";
import type { Normal } from "./types";

const close = (a: readonly number[], b: readonly number[]) =>
  a.forEach((v, i) => {
    expect(v).toBeCloseTo(b[i] as number, 6);
  });

describe("CSS 3D 큐브 계산", () => {
  it("세계 회전을 CSS 좌표로 바꾸면 x·z 축은 각이 뒤집히고 y는 같다(cssRotate와 같은 약속)", () => {
    const a = 0.7;
    close(toCss(rotation("x", a), 1), rotation("x", -a));
    close(toCss(rotation("y", a), 1), rotation("y", a));
    close(toCss(rotation("z", a), 1), rotation("z", -a));
  });

  it("면 회전은 앞(+z)을 그 면 쪽으로 돌린다", () => {
    for (const n of ["+x", "-x", "+y", "-y", "+z", "-z"] as Normal[])
      close(apply(faceRotation(n), [0, 0, 1]), normalVec(n));
  });

  it("격자 맞추기: 회전 칸은 정수, 옮김은 0.5 단위", () => {
    const m = snap(
      rotation("y", Math.PI / 2 + 1e-9).map((v, i) =>
        i === 12 ? 0.4999 : i === 13 ? -1.0001 : v,
      ),
    );
    expect(m).toEqual([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.5, -1, 0, 1]);
  });

  it("장면 뿌리 행렬을 지난 CSS 점의 화면 자리가 카메라 투영(project)과 같다", () => {
    const w = 200;
    const h = 160;
    const cam = cameraFor(3, w / h, 32, 26, null, 0);
    const P = perspectivePx(h);
    const unit = 20;
    const m = rootMatrix(cam, P, P / cam.dist, unit);
    for (const p of [
      [1.5, 1.5, 1.5],
      [-1.5, 0.5, 1.5],
      [0, -1.5, -1.5],
    ] as Vec3[]) {
      // 자식 상자는 세계 좌표를 CSS(y 아래)로, 한 칸 = unit px
      const css = apply(m, [p[0] * unit, -p[1] * unit, p[2] * unit]);
      const s = project(cam, w, h, p);
      expect(s).not.toBeNull();
      expect(w / 2 + (P * css[0]) / (P - css[2])).toBeCloseTo(s?.x ?? 0, 6);
      expect(h / 2 + (P * css[1]) / (P - css[2])).toBeCloseTo(s?.y ?? 0, 6);
    }
  });

  it("큐브만 담는 카메라는 큐브 꼭짓점을 모두 창 안에 둔다(2×2~7×7, 가로·세로 창)", () => {
    for (const n of [2, 3, 5, 7])
      for (const [w, h] of [
        [96, 96],
        [200, 120],
        [120, 200],
      ] as [number, number][]) {
        const cam = cameraFor(n, w / h, 32, 26, null, 0);
        expect(cam.dist).toBeCloseTo(cubeDist(n, w / h), 9);
        const e = n / 2;
        for (const x of [-e, e])
          for (const y of [-e, e])
            for (const z of [-e, e]) {
              const s = project(cam, w, h, [x, y, z]);
              expect(s?.x).toBeGreaterThanOrEqual(0);
              expect(s?.x).toBeLessThanOrEqual(w);
              expect(s?.y).toBeGreaterThanOrEqual(0);
              expect(s?.y).toBeLessThanOrEqual(h);
            }
      }
  });

  it("거울 판 누르기: 뒷면 칸은 판 위에서 mirrorCells와 같은 자리, 그 면 칸이 가장 앞(깊이가 가장 큼)", () => {
    const n = 3;
    for (const p of mirrorPanels(n)) {
      const f = mirrorFlatten(p, 0.6);
      const out = p.facing.map((v) => -v) as unknown as Vec3;
      // 그 면의 칸 하나(조각 중심 + 바깥 0.485)
      const center: Vec3 = [
        out[0] + p.right[0],
        out[1] + p.right[1],
        out[2] + p.right[2],
      ];
      const sticker: Vec3 = [
        center[0] + out[0] * 0.485,
        center[1] + out[1] * 0.485,
        center[2] + out[2] * 0.485,
      ];
      const at = apply(f, sticker);
      const cell = mirrorCells([
        {
          center,
          normal: (["-x", "-y", "-z"] as Normal[]).find((nn) =>
            normalVec(nn).every((v, i) => v === out[i]),
          ) as Normal,
          color: 0,
        },
      ])[0];
      expect(at[0]).toBeCloseTo((cell?.u ?? 0) * 0.6, 9);
      expect(at[1]).toBeCloseTo((cell?.v ?? 0) * 0.6, 9);
      // 맞은편 면 칸보다 앞
      const front = apply(f, [-sticker[0], -sticker[1], -sticker[2]]);
      expect(at[2]).toBeGreaterThan(front[2]);
    }
  });

  it("toCss는 옮김을 px로 늘리고 y를 뒤집는다", () => {
    expect(toCss(translation(1, 2, 3), 10).slice(12, 15)).toEqual([
      10, -20, 30,
    ]);
  });
});
