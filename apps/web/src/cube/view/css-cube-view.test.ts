// @vitest-environment jsdom
import { parseMoves } from "@game/cube-engine";
import { afterEach, describe, expect, it } from "vitest";

import { CssCubeView } from "./css-cube-view";
import { applyMoveToStickers, solvedStickers } from "./geometry";
import type { Sticker } from "./types";

/** 칸 자리(조각 중심·면) → 색 */
const byPlace = (stickers: readonly Sticker[]) =>
  new Map(
    stickers.map((s) => [
      `${s.center.map((v) => v + 0).join(",")}|${s.normal}`,
      s.color,
    ]),
  );

const settle = () => new Promise<void>((r) => queueMicrotask(r));

let host: HTMLDivElement;
afterEach(() => host?.remove());

function make(n: number, mirror = false): CssCubeView {
  host = document.createElement("div");
  document.body.appendChild(host);
  return CssCubeView.create(host, { n, mirror });
}

describe("CSS 3D 큐브 장면(그리기 없이 상태만)", () => {
  it("2×2~7×7: 수를 넣으면 조각 행렬로 계산한 칸이 스티커 계산(applyMoveToStickers)과 같다", async () => {
    const algs: Record<number, string> = {
      2: "R U' F2 R2 U",
      3: "R U R' F2 D' L B2 M x",
      4: "Rw U2 r' F Dw2 l",
      5: "3Rw U 2L' F2 Bw",
      6: "3Rw' U 3Fw2 2D L'",
      7: "3Uw R2 4Lw' F 2B",
    };
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const view = make(n);
      let want: Sticker[] = solvedStickers(n);
      for (const m of parseMoves(n, algs[n] as string)) {
        view.enqueue(m);
        want = applyMoveToStickers(n, want, m);
      }
      await settle();
      expect(view.idle).toBe(true);
      expect(byPlace(view.stickers())).toEqual(byPlace(want));
      view.dispose();
      host.remove();
    }
  });

  it("칠한 상태에서 다시 시작하고, 칸 수와 상자 수가 크기에 맞다", async () => {
    const view = make(3, true);
    const start = applyMoveToStickers(3, solvedStickers(3), {
      axis: "x",
      from: 1,
      to: 1,
      turns: 1,
    });
    view.enqueue({ axis: "y", from: 1, to: 1, turns: 2 });
    await settle();
    view.setStickers(start);
    expect(byPlace(view.stickers())).toEqual(byPlace(start));
    expect(host.dataset.cubeRender).toBe("css");
    // 무대·뿌리·돌림·큐브 넷 + 조각 26개 + 겉면 54와 그 스티커 54(속면은 두지 않는다),
    // 판 셋마다(판·유리·누름·가림·조각 상자 다섯 + 조각 26 + 겉면 54)
    expect(host.querySelectorAll("div")).toHaveLength(
      4 + 26 + 54 * 2 + 3 * (5 + 26 + 54),
    );
    view.dispose();
    expect(host.children).toHaveLength(0);
  });

  it("누르는 곳: 거울이 보이면 큐브와 판 셋, 숨기면 큐브만", () => {
    const view = make(3, true);
    view.resize(200, 200);
    expect(view.hitRects()).toHaveLength(4);
    expect(host.dataset.cubeMirror).toBe("on");
    view.setMirror(false);
    expect(view.hitRects()).toHaveLength(1);
    expect(host.dataset.cubeMirror).toBe("off");
    const [cube] = view.hitRects();
    expect(cube?.x).toBeGreaterThanOrEqual(0);
    expect((cube?.x ?? 0) + (cube?.w ?? 0)).toBeLessThanOrEqual(200);
    view.dispose();
  });
});
