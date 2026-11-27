import { existsSync } from "node:fs";
import { join } from "node:path";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { stickersFromState } from "../bridge";
import { HERO_SIZES } from "../hero/methods";
import { heroPosterSrc, POSTER_SCHEMES, posterFile } from "../hero/poster";
import { COLOR_SCHEMES, DEFAULT_SETTINGS } from "../settings";
import { polygonGap } from "../view/mirror";
import { DEFAULT_COLORS } from "../view/types";
import { CubePoster } from "./CubePoster";
import {
  faceVisible,
  posterCamera,
  posterShapes,
  SCENE_CAMERA,
  SCENE_CUBIE,
  SCENE_CUBIE_RADIUS,
  SCENE_STICKER,
} from "./cube-poster-art";

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

// 3D 장면 코드는 import.meta.glob(?raw)으로 글로만 읽는다(three를 불러오지 않는다). 모듈 그래프에 잡혀
// cube-view.ts가 바뀌면 `vitest --changed`가 이 시험을 돈다
const CUBE_VIEW_SOURCE = Object.values(
  import.meta.glob<string>("../view/cube-view.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0] as string;

const W = 192;
const H = 160;

describe("비스듬한 큐브 그림", () => {
  it("크기마다 보이는 세 면(위·앞·오른쪽)의 스티커 3n²장을 그린다", () => {
    for (let n = 2; n <= 7; n++) {
      const s = posterShapes(n, stickersFromState(n, solvedCube(n)), W, H);
      expect(s.stickers).toHaveLength(3 * n * n);
      expect(new Set(s.stickers.map((t) => t.normal))).toEqual(
        new Set(["+x", "+y", "+z"]),
      );
      expect(s.body.map((b) => b.normal).sort()).toEqual(["+x", "+y", "+z"]);
      const cam = posterCamera(n, W, H);
      expect(faceVisible(cam, n, "-x")).toBe(false);
      expect(faceVisible(cam, n, "-y")).toBe(false);
    }
  });

  it("스티커 색은 상태에서 온다(섞은 상태의 보이는 스티커와 같은 차례·같은 색)", () => {
    const n = 3;
    const state = applyMoves(n, solvedCube(n), parseMoves(n, "R U F' L2 D B"));
    const stickers = stickersFromState(n, state);
    const want = stickers
      .filter(
        (s) => s.normal === "+x" || s.normal === "+y" || s.normal === "+z",
      )
      .map((s) => String(s.color));
    const html = renderToStaticMarkup(
      <CubePoster
        n={n}
        stickers={stickers}
        colors={DEFAULT_COLORS}
        width={W}
        height={H}
      />,
    );
    const got = [...html.matchAll(/data-poster-sticker="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(got).toEqual(want);
    // 섞였으니 한 면 색만 있지 않다
    expect(new Set(got).size).toBeGreaterThan(3);
  });

  it("색 설정을 따른다(같은 상태라도 색이 바뀌면 칠한 색이 바뀐다)", () => {
    const stickers = stickersFromState(2, solvedCube(2));
    const draw = (colors: readonly number[]) =>
      renderToStaticMarkup(
        <CubePoster
          n={2}
          stickers={stickers}
          colors={colors}
          width={W}
          height={H}
        />,
      );
    const fills = (html: string) =>
      [...html.matchAll(/fill="(rgb\([^"]+\))" data-poster-sticker/g)].map(
        (m) => m[1],
      );
    const a = fills(draw(DEFAULT_COLORS));
    const b = fills(draw(COLOR_SCHEMES.highContrast));
    expect(a).toHaveLength(12);
    expect(a).not.toEqual(b);
  });

  it("3D 장면(cube-view.ts)과 같은 카메라·조각 값을 쓴다", () => {
    const src = CUBE_VIEW_SOURCE;
    expect(src).toContain(`const DEFAULT_YAW = ${SCENE_CAMERA.yaw};`);
    expect(src).toContain(`const DEFAULT_PITCH = ${SCENE_CAMERA.pitch};`);
    expect(src).toContain(`PerspectiveCamera(${SCENE_CAMERA.fov},`);
    expect(src).toContain(`const CUBIE = ${SCENE_CUBIE};`);
    expect(src).toContain(`const CUBIE_RADIUS = ${SCENE_CUBIE_RADIUS};`);
    expect(src).toContain(`: ${SCENE_STICKER.size};`);
  });
});

/** SVG 점 목록 "x,y x,y …"의 가운데 */
function centroid(points: string): [number, number] {
  const ps = points.split(" ").map((p) => p.split(",").map(Number));
  const sx = ps.reduce((a, p) => a + (p[0] ?? 0), 0);
  const sy = ps.reduce((a, p) => a + (p[1] ?? 0), 0);
  return [sx / ps.length, sy / ps.length];
}

function pointsOf(points: string): [number, number][] {
  return points
    .split(" ")
    .map((p) => p.split(",").map(Number) as [number, number]);
}

/** SVG 점 목록의 테두리 상자 */
function box(points: string) {
  const ps = points.split(" ").map((p) => p.split(",").map(Number));
  const xs = ps.map((p) => p[0] ?? 0);
  const ys = ps.map((p) => p[1] ?? 0);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

describe("거울 판을 단 큐브 그림(배우기의 작은 그림, docs/47 16-37)", () => {
  const SIDE = 200;

  it("판 셋(뒤·왼쪽·아래)과 판마다 n²칸, 큐브의 보이는 세 면은 그대로 그린다", () => {
    for (let n = 2; n <= 7; n++) {
      const s = posterShapes(
        n,
        stickersFromState(n, solvedCube(n)),
        SIDE,
        SIDE,
        false,
        true,
      );
      expect(s.stickers).toHaveLength(3 * n * n);
      expect(s.mirror?.plates.map((p) => p.normal)).toEqual(["-z", "-x", "-y"]);
      expect(s.mirror?.cells).toHaveLength(3 * n * n);
      // 맞춘 큐브: 판마다 그 면 색 하나(아래 = 노랑 3, 왼쪽 = 주황 4, 뒤 = 파랑 5)
      const colorOf = { "-y": 3, "-x": 4, "-z": 5 } as const;
      for (const c of s.mirror?.cells ?? [])
        expect(c.color).toBe(colorOf[c.normal as keyof typeof colorOf]);
    }
  });

  it("거울을 켜지 않으면 판이 없다", () => {
    const s = posterShapes(3, stickersFromState(3, solvedCube(3)), SIDE, SIDE);
    expect(s.mirror).toBeNull();
  });

  it("큐브와 판이 그림 안에 다 들어오고, 판은 큐브와 겹치지 않는다", () => {
    for (let n = 2; n <= 7; n++) {
      const s = posterShapes(
        n,
        stickersFromState(n, solvedCube(n)),
        SIDE,
        SIDE,
        false,
        true,
      );
      const all = [...s.body, ...(s.mirror?.plates ?? [])].map((b) =>
        box(b.points),
      );
      for (const b of all) {
        expect(b.minX).toBeGreaterThanOrEqual(0);
        expect(b.minY).toBeGreaterThanOrEqual(0);
        expect(b.maxX).toBeLessThanOrEqual(SIDE);
        expect(b.maxY).toBeLessThanOrEqual(SIDE);
      }
      // 판은 큐브 몸통의 어느 면과도 겹치지 않는다. 판 자리는 정사영으로 정해(`mirrorPanels`) 원근으로 그리면
      // 5×5부터 왼쪽 판이 큐브 앞 아래 모서리에 1px 안쪽으로 닿는다(3D 장면도 같다, docs/47 16-37). 2~4만 본다
      if (n <= 4)
        for (const p of s.mirror?.plates ?? [])
          for (const b of s.body)
            expect(
              polygonGap(pointsOf(p.points), pointsOf(b.points)),
            ).toBeGreaterThan(0);
      // 뒤 판은 큐브 오른쪽 위, 왼쪽 판은 왼쪽, 아래 판은 아래(3D 장면과 같은 자리)
      const [cx, cy] = centroid(s.body.map((b) => b.points).join(" "));
      const plate = (nm: string) =>
        centroid(s.mirror?.plates.find((p) => p.normal === nm)?.points ?? "");
      expect(plate("-z")[0]).toBeGreaterThan(cx);
      expect(plate("-z")[1]).toBeLessThan(cy);
      expect(plate("-x")[0]).toBeLessThan(cx);
      expect(plate("-y")[1]).toBeGreaterThan(cy);
    }
  });

  it("판은 거울상이다: 큐브 위-오른쪽-뒤 꼭짓점의 뒷면 칸이 뒤 판의 위-오른쪽에 온다", () => {
    const n = 3;
    const stickers = stickersFromState(n, solvedCube(n));
    const s = posterShapes(n, stickers, SIDE, SIDE, false, true);
    const back = (s.mirror?.cells ?? []).filter((c) => c.normal === "-z");
    const corner = stickers.find(
      (t) => t.normal === "-z" && t.center[0] === 1 && t.center[1] === 1,
    );
    // 같은 판의 위-왼쪽 칸(x -1)·아래-오른쪽 칸(y -1)과 견준다(판은 비스듬히 보여 행이 기울어 있다)
    const cell = (x: number, y: number) => {
      const t = stickers.find(
        (q) => q.normal === "-z" && q.center[0] === x && q.center[1] === y,
      );
      return centroid(back.find((c) => c.id === t?.id)?.points ?? "");
    };
    const [x, y] = cell(1, 1);
    expect(corner).toBeDefined();
    expect(x).toBeGreaterThan(cell(-1, 1)[0]);
    expect(y).toBeLessThan(cell(1, -1)[1]);
  });

  it("판 칸은 3D 장면처럼 조명 없이 0.86배로 칠한다(cube-view.ts MIRROR_TINT)", () => {
    expect(CUBE_VIEW_SOURCE).toContain("const MIRROR_TINT = 0.86;");
    const html = renderToStaticMarkup(
      <CubePoster
        n={2}
        stickers={stickersFromState(2, solvedCube(2))}
        colors={DEFAULT_COLORS}
        width={SIDE}
        height={SIDE}
        mirror
      />,
    );
    const blue = DEFAULT_COLORS[5] ?? 0;
    const ch = (v: number) => Math.round(v * 0.86);
    const want = `rgb(${ch((blue >> 16) & 255)},${ch((blue >> 8) & 255)},${ch(blue & 255)})`;
    const fills = [
      ...html.matchAll(/fill="([^"]+)"[^>]*data-poster-mirror="5"/g),
    ].map((m) => m[1]);
    expect(fills).toHaveLength(4);
    expect(new Set(fills)).toEqual(new Set([want]));
    expect(html).toContain("data-cube-poster-mirror");
  });
});

describe("첫 화면 대기 그림 고르기", () => {
  const base = { ...DEFAULT_SETTINGS, colors: [...DEFAULT_COLORS] };

  it("색 묶음이면 찍은 이미지, 직접 고른 색·스티커 없는 모양이면 SVG(null)", () => {
    expect(heroPosterSrc(3, base)).toBe("/cube/hero/3-standard.webp");
    // 크기는 지금 크기(설정의 첫 화면 연출 크기는 없앴다)
    expect(
      heroPosterSrc(5, {
        ...base,
        colorScheme: "colorblind",
        colors: [...COLOR_SCHEMES.colorblind],
      }),
    ).toBe("/cube/hero/5-colorblind.webp");
    expect(heroPosterSrc(8, base)).toBeNull();
    const custom = [...DEFAULT_COLORS];
    custom[0] = 0x123456;
    expect(
      heroPosterSrc(3, { ...base, colorScheme: "custom", colors: custom }),
    ).toBeNull();
    expect(heroPosterSrc(3, { ...base, stickerless: true })).toBeNull();
    // 이름은 묶음인데 색이 다르면 쓰지 않는다
    expect(heroPosterSrc(3, { ...base, colors: custom })).toBeNull();
  });

  // 그림 파일은 vitest.config.ts forceRerunTriggers(public/cube/hero)로 바뀌면 전부 돈다
  it("크기·색 묶음마다 이미지가 있다", () => {
    const dir = join(__dirname, "../../../public/cube/hero");
    for (const n of HERO_SIZES)
      for (const scheme of POSTER_SCHEMES)
        expect(existsSync(join(dir, posterFile(n, scheme)))).toBe(true);
  });
});
