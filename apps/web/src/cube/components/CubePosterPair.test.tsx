import { faceColors, stageMask } from "@game/cube-engine";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../settings";
import { scrambledState } from "../timer/scrambled";
import { CubePosterPair } from "./CubePosterPair";

/** 그린 칸마다 (자리 번호, 칠한 색 번호 또는 "hidden", 가림 표시) */
function cells(html: string) {
  return [
    ...html.matchAll(
      /data-poster-sticker="([^"]+)" data-sticker="(\d+)"( data-sticker-hidden="")?/g,
    ),
  ].map((m) => ({
    color: m[1] as string,
    slot: Number(m[2]),
    hidden: !!m[3],
  }));
}

describe("비스듬한 큐브 그림 둘", () => {
  it("앞쪽·뒤쪽 그림을 합치면 모든 칸이 한 번씩, 원래 상태의 자리 번호와 색으로 나온다", () => {
    for (const n of [2, 3, 4, 5]) {
      const state = scrambledState(
        n,
        n === 2 ? "R U F' R2 U'" : "R U R' U' F2 D L' B Rw",
      );
      const colors = faceColors(n, state);
      const got = cells(
        renderToStaticMarkup(
          <CubePosterPair
            n={n}
            state={state}
            settings={DEFAULT_SETTINGS}
            onSticker={() => {}}
          />,
        ),
      );
      expect(got).toHaveLength(6 * n * n);
      expect(new Set(got.map((c) => c.slot)).size).toBe(6 * n * n);
      for (const c of got) expect(Number(c.color)).toBe(colors[c.slot]);
    }
  });

  it("모두 가린 마스크(가리고 맞추기)면 모든 칸이 가림이고 색이 없다", () => {
    const n = 3;
    const state = scrambledState(n, "R U R' F2");
    const html = renderToStaticMarkup(
      <CubePosterPair
        n={n}
        state={state}
        mask={stageMask(n, "all-hidden")}
        settings={{ ...DEFAULT_SETTINGS, hidden: "black" }}
      />,
    );
    const got = cells(html);
    expect(got).toHaveLength(54);
    expect(got.every((c) => c.hidden && c.color === "hidden")).toBe(true);
    // 까만 칸(#111에 면 밝기를 곱한 색)만 있다
    const fills = [
      ...html.matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)" data-poster-sticker/g),
    ];
    expect(fills).toHaveLength(54);
    for (const f of fills)
      for (const v of f.slice(1)) expect(Number(v)).toBeLessThan(30);
  });

  it("누를 수 있을 때만 칸에 누르기 표시가 붙는다", () => {
    const state = scrambledState(2, "R U");
    const still = renderToStaticMarkup(
      <CubePosterPair n={2} state={state} settings={DEFAULT_SETTINGS} />,
    );
    expect(still).not.toContain("data-sticker-cell");
    const press = renderToStaticMarkup(
      <CubePosterPair
        n={2}
        state={state}
        settings={DEFAULT_SETTINGS}
        onSticker={() => {}}
      />,
    );
    expect([...press.matchAll(/data-sticker-cell=/g)]).toHaveLength(24);
  });
});
