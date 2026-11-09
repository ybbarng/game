import {
  applyMoves,
  parseMoves,
  solvedCube,
  stageMask,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { faceGrid, stickersFromState } from "../bridge";
import { applyMoveToStickers, solvedStickers } from "./geometry";
import {
  BACK_NORMALS,
  cellPoint,
  MIRROR_FADE_MS,
  type MirrorPanel,
  mirrorAlpha,
  mirrorCells,
  mirrorFadeAt,
  mirrorFrame,
  mirrorHitAt,
  mirrorPanels,
  panelCorners,
  polygonGap,
  projectAll,
  rayPanel,
} from "./mirror";
import type { CubeMove } from "./types";

/** 펼친 그림의 면 번호(U R F D L B) */
const FACE = { D: 3, L: 4, B: 5 } as const;

function hull2(points: [number, number][]): [number, number][] {
  // 시험용: 네모·여섯모 꼴의 볼록 껍질(각으로 정렬)
  const cx = points.reduce((a, p) => a + p[0], 0) / points.length;
  const cy = points.reduce((a, p) => a + p[1], 0) / points.length;
  return [...points].sort(
    (a, b) =>
      Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  );
}

function cubeHull(n: number) {
  const h = n / 2;
  const pts: [number, number, number][] = [];
  for (const x of [-h, h])
    for (const y of [-h, h]) for (const z of [-h, h]) pts.push([x, y, z]);
  const proj = projectAll(pts) as [number, number][];
  // 가운데 가까운 두 점(앞-위-오른쪽과 뒤-아래-왼쪽 꼭짓점)은 껍질 안이라 뺀다
  const far = [...proj].sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  return hull2(far.slice(2));
}

function panelHull(n: number, p: MirrorPanel) {
  return hull2(projectAll(panelCorners(n, p)) as [number, number][]);
}

describe("거울 판 배치", () => {
  for (const n of [2, 3, 4, 5, 7])
    it(`${n}×${n}: 판 셋은 기준 각에서 큐브와도, 서로도 겹치지 않는다`, () => {
      const panels = mirrorPanels(n);
      expect(panels.map((p) => p.normal)).toEqual(["-z", "-x", "-y"]);
      const cube = cubeHull(n);
      for (const p of panels) {
        expect(polygonGap(cube, panelHull(n, p))).toBeGreaterThan(0.3);
        // 판은 그 면 바깥에 있고 카메라 쪽을 본다
        const out = { "-z": 2, "-x": 0, "-y": 1 }[p.normal];
        expect(p.center[out]).toBeLessThan(-n / 2);
        expect(p.facing[out]).toBeGreaterThan(0);
      }
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++)
          expect(
            polygonGap(
              panelHull(n, panels[i] as MirrorPanel),
              panelHull(n, panels[j] as MirrorPanel),
            ),
          ).toBeGreaterThan(0);
    });

  it("판은 그 면과 평행하고, 판의 칸 줄은 그 면의 두 세계 축(큐브 테두리 선)과 나란하다", () => {
    const axes = {
      "-z": { right: [1, 0, 0], up: [0, 1, 0], facing: [0, 0, 1] },
      "-x": { right: [0, 0, -1], up: [0, 1, 0], facing: [1, 0, 0] },
      "-y": { right: [1, 0, 0], up: [0, 0, -1], facing: [0, 1, 0] },
    };
    for (const n of [2, 3, 4])
      for (const p of mirrorPanels(n)) {
        const want = axes[p.normal];
        expect(p.right.map((x) => x + 0)).toEqual(want.right);
        expect(p.up.map((x) => x + 0)).toEqual(want.up);
        expect(p.facing.map((x) => x + 0)).toEqual(want.facing);
      }
  });

  it("화면 맞추기: 바라보는 점에서 큐브와 판 모두가 시야 안에 든다", () => {
    const n = 3;
    const panels = mirrorPanels(n);
    const f = mirrorFrame(n, panels, 1);
    expect(f.dist).toBeGreaterThan(n * 2);
    expect(f.dist).toBeLessThan(n * 8);
  });

  it("둘러보면 흐려지다 사라진다", () => {
    expect(mirrorAlpha(32, 26)).toBe(1);
    expect(mirrorAlpha(392, 26)).toBe(1);
    const a = mirrorAlpha(52, 26);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(mirrorAlpha(212, 26)).toBe(0);
    expect(mirrorAlpha(32, -55)).toBe(0);
  });

  it("켜고 끄는 페이드: 시작 시각부터 MIRROR_FADE_MS 동안 고르게, 움직임 줄이기(0ms)는 바로", () => {
    const f = { from: 0, to: 1, start: 1000 };
    expect(mirrorFadeAt(f, 1000)).toBe(0);
    expect(mirrorFadeAt(f, 1000 + MIRROR_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(mirrorFadeAt(f, 1000 + MIRROR_FADE_MS)).toBe(1);
    expect(mirrorFadeAt(f, 99_999)).toBe(1);
    // 나타나던 중에 숨기면 그 자리(0.4)에서 거꾸로 간다
    const back = { from: 0.4, to: 0, start: 0 };
    expect(mirrorFadeAt(back, MIRROR_FADE_MS / 2)).toBeCloseTo(0.2);
    expect(mirrorFadeAt(back, MIRROR_FADE_MS)).toBe(0);
    expect(mirrorFadeAt(f, 1000, 0)).toBe(1);
  });
});

describe("거울상 칸 대응", () => {
  it("맞춘 큐브: 판 셋은 뒤 파랑·왼쪽 주황·아래 노랑", () => {
    for (const n of [2, 3, 4]) {
      const cells = mirrorCells(solvedStickers(n));
      expect(cells).toHaveLength(3 * n * n);
      for (const c of cells)
        expect(c.color).toBe({ "-z": 5, "-x": 4, "-y": 3 }[c.panel]);
    }
  });

  it("모서리가 이어진다: 위-오른쪽-뒤 꼭짓점의 뒷면 칸은 뒤 판의 위-오른쪽, 왼쪽-위-뒤의 왼쪽 칸은 왼쪽 판의 위-오른쪽", () => {
    const n = 3;
    const cells = mirrorCells(solvedStickers(n));
    const back = cells.find((c) => c.panel === "-z" && c.u === 1 && c.v === 1);
    expect(back?.hit).toEqual({ center: [1, 1, -1], normal: "-z" });
    const left = cells.find((c) => c.panel === "-x" && c.u === 1 && c.v === 1);
    expect(left?.hit).toEqual({ center: [-1, 1, -1], normal: "-x" });
    // 아래 판의 위쪽(먼 쪽)은 뒤, 오른쪽은 R
    const down = cells.find((c) => c.panel === "-y" && c.u === 1 && c.v === 1);
    expect(down?.hit).toEqual({ center: [1, -1, -1], normal: "-y" });
  });

  for (const n of [2, 3, 4, 5])
    it(`${n}×${n} 섞인 큐브: 판은 펼친 그림의 뒤·왼쪽 면을 좌우로, 아래 면을 위아래로 뒤집은 모습`, () => {
      const scramble = {
        2: "R U2 F' R' U F2",
        3: "R U F' L2 D B' R2 U' F",
        4: "Rw U2 2F' L Dw B2 r u",
        5: "3Rw 2U' F L' Dw2 B 2R",
      }[n] as string;
      const state = applyMoves(n, solvedCube(n), parseMoves(n, scramble));
      const grid = faceGrid(n, state);
      const cells = mirrorCells(stickersFromState(n, state));
      const h = (n - 1) / 2;
      const at = (face: number, row: number, col: number) =>
        grid[face]?.[row * n + col];
      for (const c of cells) {
        if (c.panel === "-z")
          expect(c.color).toBe(at(FACE.B, h - c.v, h - c.u));
        if (c.panel === "-x")
          expect(c.color).toBe(at(FACE.L, h - c.v, h - c.u));
        if (c.panel === "-y")
          expect(c.color).toBe(at(FACE.D, h + c.v, h + c.u));
      }
    });

  it("가림(마스크)과 표시도 판에 그대로 온다", () => {
    const n = 3;
    const state = solvedCube(n);
    const mask = stageMask(n, "cross");
    const cells = mirrorCells(stickersFromState(n, state, mask));
    const visible = mirrorCells(stickersFromState(n, state));
    expect(cells.some((c) => c.color === null)).toBe(true);
    expect(visible.every((c) => c.color !== null)).toBe(true);
    const marked = solvedStickers(n).map((s) =>
      s.normal === "-z" ? { ...s, mark: "pick" as const } : s,
    );
    const m = mirrorCells(marked);
    expect(m.filter((c) => c.mark === "pick")).toHaveLength(9);
    expect(m.every((c) => (c.panel === "-z") === (c.mark === "pick"))).toBe(
      true,
    );
  });

  it("큐브 전체 돌리기 뒤 판의 면이 바뀐다: x → 뒤 판에 흰색, y → 왼쪽 판에 초록, z → 아래 판에 빨강", () => {
    const n = 3;
    const whole = (axis: "x" | "y" | "z"): CubeMove => ({
      axis,
      from: 1,
      to: n,
      turns: 1,
    });
    const colorOf = (axis: "x" | "y" | "z", panel: string) => {
      const cells = mirrorCells(
        applyMoveToStickers(n, solvedStickers(n), whole(axis)),
      ).filter((c) => c.panel === panel);
      expect(cells).toHaveLength(9);
      return [...new Set(cells.map((c) => c.color))];
    };
    expect(colorOf("x", "-z")).toEqual([0]);
    expect(colorOf("y", "-x")).toEqual([2]);
    expect(colorOf("z", "-y")).toEqual([1]);
  });
});

describe("판 칸 누르기", () => {
  for (const n of [2, 3, 4])
    it(`${n}×${n}: 판 위 칸 가운데를 누르면 그 칸이 비추는 큐브 칸을 고른다`, () => {
      const panels = mirrorPanels(n);
      const cells = mirrorCells(solvedStickers(n));
      for (const c of cells) {
        const p = panels.find((q) => q.normal === c.panel) as MirrorPanel;
        expect(mirrorHitAt(n, p, cellPoint(p, c.u, c.v))).toEqual(c.hit);
      }
    });

  it("판 테두리 밖은 고르지 않는다. 광선은 판 앞에서만 맞는다", () => {
    const n = 3;
    const p = mirrorPanels(n)[0] as MirrorPanel;
    expect(mirrorHitAt(n, p, cellPoint(p, 2.2, 0))).toBeNull();
    const front = cellPoint(p, 0, 0);
    const from = [
      front[0] + p.facing[0] * 5,
      front[1] + p.facing[1] * 5,
      front[2] + p.facing[2] * 5,
    ] as const;
    const toward = [-p.facing[0], -p.facing[1], -p.facing[2]] as const;
    const hit = rayPanel(p, from, toward);
    expect(hit?.t).toBeCloseTo(5);
    expect(rayPanel(p, from, p.facing)).toBeNull();
  });

  it("판 순서는 뒤·왼쪽·아래", () => {
    expect(BACK_NORMALS).toEqual(["-z", "-x", "-y"]);
  });
});
