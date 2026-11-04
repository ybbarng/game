import { realClock } from "@game/fair-play";

import { stickersFromState } from "../bridge";
import { loadCubeView } from "../view";
import type { Quality } from "../view/types";
import { heroSolveInWorker } from "../worker";
import { HeroLoop } from "./loop";
import { type HeroChoice, type HeroSize, heroRotation } from "./methods";

/**
 * 첫 화면 큐브 연출을 캔버스에 띄운다(3D 장면 + `HeroLoop`). 첫 화면은 이 파일을 늦게 불러와
 * 첫 묶음에 three.js·엔진을 싣지 않는다. WebGL이 없으면 던진다(화면은 펼친 그림을 그대로 둔다).
 */

export interface HeroOptions {
  n: HeroSize;
  choice: HeroChoice;
  colors: readonly number[];
  quality: Quality;
  stickerless: boolean;
  onLabel: (label: string) => void;
}

export interface HeroHandle {
  pause(): void;
  resume(): void;
  setColors(colors: readonly number[]): void;
  dispose(): void;
}

export async function startHero(
  canvas: HTMLCanvasElement,
  o: HeroOptions,
): Promise<HeroHandle> {
  const { CubeView } = await loadCubeView();
  const view = CubeView.create(canvas, {
    n: o.n,
    // 장식이라 가볍게: 보통 품질 이하, 픽셀 비율 1.5까지, 입력은 받지 않는다(페이지 스크롤을 막지 않게)
    quality: o.quality === "low" ? "low" : "medium",
    maxDpr: 1.5,
    colors: o.colors,
    stickerless: o.stickerless,
    interactive: false,
    moveMs: 90,
  });
  let moveMs = 90;
  const loop = new HeroLoop({
    n: o.n,
    methods: heroRotation(o.n, o.choice),
    clock: realClock,
    rng: Math.random,
    solve: heroSolveInWorker,
    onMove: (_move, ms, parsed) => {
      const want = Math.min(200, Math.round(ms * 0.75));
      if (want !== moveMs) {
        moveMs = want;
        view.setOptions({ moveMs });
      }
      for (const m of parsed) view.enqueue(m);
    },
    onLabel: o.onLabel,
    onReset: (state) => view.setStickers(stickersFromState(o.n, state)),
  });
  const ro = new ResizeObserver(() =>
    view.resize(canvas.clientWidth, canvas.clientHeight),
  );
  ro.observe(canvas);
  return {
    pause: () => loop.pause(),
    resume: () => loop.resume(),
    setColors: (colors) => view.setOptions({ colors }),
    dispose: () => {
      loop.stop();
      ro.disconnect();
      view.dispose();
    },
  };
}
