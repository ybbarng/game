import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { stickersFromState } from "../bridge";
import { HERO_SIZES } from "../hero/methods";
import { heroPosterSrc, POSTER_SCHEMES, posterFile } from "../hero/poster";
import { COLOR_SCHEMES, DEFAULT_SETTINGS } from "../settings";
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
    const src = readFileSync(join(__dirname, "../view/cube-view.ts"), "utf8");
    expect(src).toContain(`const DEFAULT_YAW = ${SCENE_CAMERA.yaw};`);
    expect(src).toContain(`const DEFAULT_PITCH = ${SCENE_CAMERA.pitch};`);
    expect(src).toContain(`PerspectiveCamera(${SCENE_CAMERA.fov},`);
    expect(src).toContain(`const CUBIE = ${SCENE_CUBIE};`);
    expect(src).toContain(`const CUBIE_RADIUS = ${SCENE_CUBIE_RADIUS};`);
    expect(src).toContain(`: ${SCENE_STICKER.size};`);
  });
});

describe("첫 화면 대기 그림 고르기", () => {
  const base = { ...DEFAULT_SETTINGS, colors: [...DEFAULT_COLORS] };

  it("색 묶음이면 찍은 이미지, 직접 고른 색·스티커 없는 모양이면 SVG(null)", () => {
    expect(heroPosterSrc(base)).toBe("/cube/hero/3-standard.webp");
    expect(
      heroPosterSrc({
        ...base,
        heroSize: 5,
        colorScheme: "colorblind",
        colors: [...COLOR_SCHEMES.colorblind],
      }),
    ).toBe("/cube/hero/5-colorblind.webp");
    const custom = [...DEFAULT_COLORS];
    custom[0] = 0x123456;
    expect(
      heroPosterSrc({ ...base, colorScheme: "custom", colors: custom }),
    ).toBeNull();
    expect(heroPosterSrc({ ...base, stickerless: true })).toBeNull();
    // 이름은 묶음인데 색이 다르면 쓰지 않는다
    expect(heroPosterSrc({ ...base, colors: custom })).toBeNull();
  });

  it("크기·색 묶음마다 이미지가 있다", () => {
    const dir = join(__dirname, "../../../public/cube/hero");
    for (const n of HERO_SIZES)
      for (const scheme of POSTER_SCHEMES)
        expect(existsSync(join(dir, posterFile(n, scheme)))).toBe(true);
  });
});
