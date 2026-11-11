import { realClock } from "@game/fair-play/clock";

import { stickersFromState } from "../bridge";
import { loadCubeView } from "../view";
import type { MarkTone, Quality } from "../view/types";
import { heroSolveInWorker } from "../worker";
import type { HeroHighlight } from "./highlight";
import { HeroLoop, heroMoveMs } from "./loop";
import {
  type HeroChoice,
  type HeroSize,
  heroRotation,
  solveForHero,
} from "./methods";

/**
 * 첫 화면 큐브 연출을 캔버스에 띄운다(3D 장면 + `HeroLoop`). 첫 화면은 이 파일을 늦게 불러와
 * 첫 묶음에 three.js·엔진을 싣지 않는다. WebGL이 없으면 던진다(화면은 대기 그림을 그대로 둔다).
 */

export interface HeroOptions {
  n: HeroSize;
  choice: HeroChoice;
  colors: readonly number[];
  quality: Quality;
  stickerless: boolean;
  /** 조각 강조(설정 「첫 화면 큐브」의 강조) */
  highlight: HeroHighlight;
  onLabel: (label: string) => void;
}

export interface HeroHandle {
  pause(): void;
  resume(): void;
  setColors(colors: readonly number[]): void;
  setHighlight(mode: HeroHighlight): void;
  dispose(): void;
}

function nextFrames(count: number): Promise<void> {
  if (typeof requestAnimationFrame === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
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
    // 워커가 늦으면(멈춘 워커, 옛 코드를 받은 워커 등) 섞은 뒤 멈춤 동안 화면 스레드에서 푼다(loop.ts `workerWait`)
    solveHere: solveForHero,
    onMove: (_move, ms, parsed) => {
      // 회전이 걸음 시간 안에 끝나게(다음 수·큐브 돌리기와 화면에서 겹치지 않게)
      const want = heroMoveMs(ms, parsed);
      if (want !== moveMs) {
        moveMs = want;
        view.setOptions({ moveMs });
      }
      for (const m of parsed) view.enqueue(m);
    },
    onLabel: o.onLabel,
    onReset: (state) => view.setStickers(stickersFromState(o.n, state)),
    highlight: o.highlight,
    onMarks: (marks) => {
      if (!marks.length) {
        view.setMarks(null);
        return;
      }
      const tones: (MarkTone | null)[] = new Array(6 * o.n * o.n).fill(null);
      for (const m of marks) for (const id of m.stickers) tones[id] = "glow";
      view.setMarks(tones);
    },
  });
  const ro = new ResizeObserver(() =>
    view.resize(canvas.clientWidth, canvas.clientHeight),
  );
  ro.observe(canvas);
  // 첫 장면(맞춘 큐브)을 다 그린 뒤에 돌려준다. 화면은 그때부터 캔버스를 대기 그림 위로 서서히 띄운다
  view.resize(canvas.clientWidth, canvas.clientHeight);
  await nextFrames(2);
  return {
    pause: () => loop.pause(),
    resume: () => loop.resume(),
    setColors: (colors) => view.setOptions({ colors }),
    setHighlight: (mode) => loop.setHighlight(mode),
    dispose: () => {
      loop.stop();
      ro.disconnect();
      view.dispose();
    },
  };
}
