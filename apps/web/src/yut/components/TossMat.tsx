"use client";

import type { LastThrow, YutView } from "@game/yut-engine";
import { type RefObject, useEffect, useRef, useState } from "react";

import { playUiCue } from "@/game/ui-sound";
import { cn } from "@/lib/cn";

import { buzz } from "../haptics";
import { setTossDirector, useYut } from "../store";
import { planFor, type ReplayCue, resultLabel } from "../toss/plan";
import type { TossPlan } from "../toss/sim";
import type { FrameStats, TossScene } from "../toss/toss-scene";
import { YutSticks } from "./parts";

/** 윷이 다 멈춘 뒤 결과 글을 보이고 기다리는 시간(ms). 그 뒤 다음 화면으로 */
export const RESULT_HOLD_MS = 900;

let webgl: boolean | null = null;

/** WebGL을 쓸 수 있는지(한 번만 알아보고, 알아보려고 만든 맥락은 바로 놓는다) */
function webglAvailable(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2") ?? c.getContext("webgl");
    g?.getExtension("WEBGL_lose_context")?.loseContext();
    webgl = !!g;
  } catch {
    webgl = false;
  }
  return webgl;
}

/** 움직임 줄이기를 켰는가(바뀌면 따라간다) */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    const q = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!q) {
      setReduce(false);
      return;
    }
    setReduce(q.matches);
    const on = () => setReduce(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduce;
}

/**
 * 3D 멍석을 띄울 수 있는가: WebGL이 되고 움직임 줄이기가 아니며 `allow`(옛 판이 아님)일 때. 처음 그릴 때는 null.
 * 둘째 값은 문맥을 잃었을 때 2D로 내리는 함수
 */
export function useThreeD(allow = true): [boolean | null, () => void] {
  const reduce = useReducedMotion();
  const [threeD, setThreeD] = useState<boolean | null>(null);
  useEffect(() => {
    setThreeD(allow && !reduce && webglAvailable());
  }, [reduce, allow]);
  return [threeD, () => setThreeD(false)];
}

/**
 * 3D 장면을 늦게 불러 캔버스에 붙이고, 화면에 보일 때만(`visible`, 화면 안, 숨지 않은 탭) 그리게 한다.
 * 붙이자마자 `initial()`의 계획을 멈춘 자리로 보인다
 */
function useTossScene(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  threeD: boolean | null,
  lose: () => void,
  initial: () => TossPlan | null,
  visible: boolean,
): { sceneRef: RefObject<TossScene | null>; ready: boolean } {
  const sceneRef = useRef<TossScene | null>(null);
  const [ready, setReady] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const loseRef = useRef(lose);
  loseRef.current = lose;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!threeD || !canvas) return;
    let disposed = false;
    let io: IntersectionObserver | null = null;
    const lost = (e: Event) => {
      e.preventDefault();
      loseRef.current();
    };
    canvas.addEventListener("webglcontextlost", lost);
    void import("../toss/toss-scene")
      .then(({ createTossScene }) => {
        if (disposed) return;
        const scene = createTossScene(canvas);
        sceneRef.current = scene;
        scene.resize(canvas.clientWidth, canvas.clientHeight);
        scene.showRest(initialRef.current());
        io = new IntersectionObserver(([entry]) =>
          setOnScreen(!!entry?.isIntersecting),
        );
        io.observe(canvas);
        setReady(true);
      })
      .catch(() => loseRef.current());
    const ro = new ResizeObserver(() =>
      sceneRef.current?.resize(canvas.clientWidth, canvas.clientHeight),
    );
    ro.observe(canvas);
    return () => {
      disposed = true;
      io?.disconnect();
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, [threeD, canvasRef]);

  // 화면에 보일 때만 그린다(장면을 막 붙였을 때도 다시 본다)
  // biome-ignore lint/correctness/useExhaustiveDependencies: ready는 sceneRef가 채워졌다는 신호다
  useEffect(() => {
    const active = () =>
      visible && onScreen && !document.hidden && sceneRef.current !== null;
    sceneRef.current?.setActive(active());
    const onVis = () => sceneRef.current?.setActive(active());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [visible, onScreen, ready]);

  return { sceneRef, ready };
}

/** 연출 한 번이 끝났을 때 그리기 시간을 남긴다(화면 시험·성능 재기) */
function recordStats(scene: TossScene): void {
  window.__yutToss = {
    ...scene.stats(),
    plays: (window.__yutToss?.plays ?? 0) + 1,
  };
}

/** 가락이 멍석에 닿는 소리(세기 세 단계) */
function impactSound(_stick: number, strength: number): void {
  playUiCue("yutHit", {
    step: strength > 0.66 ? 3 : strength > 0.33 ? 2 : 1,
  });
}

const isBonus = (thrown: LastThrow | null) =>
  thrown?.value === 4 || thrown?.value === 5;

/** 3D를 못 그리면: 짚 빛 둥근 깔개 위 2D 윷가락 넷 */
function FlatMat({
  thrown,
  tossing,
  animateKey,
}: {
  thrown: LastThrow | null;
  tossing: boolean;
  animateKey: number;
}) {
  return (
    <div
      className="yut-mat-2d absolute inset-[6%] flex items-center justify-center rounded-full"
      data-toss="2d"
    >
      <YutSticks
        sticks={thrown?.sticks ?? null}
        value={thrown?.value ?? null}
        nak={thrown?.nak ?? null}
        throwKey={animateKey}
        tossing={tossing}
      />
    </div>
  );
}

/** 3D 멍석 캔버스와 그 위 결과 글 */
function MatCanvas({
  canvasRef,
  ready,
  state,
  thrown,
  waiting,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ready: boolean;
  state: "playing" | "done" | "idle";
  thrown: LastThrow | null;
  waiting: boolean;
}) {
  const done = state === "done" && thrown !== null;
  const label = done && thrown ? resultLabel(thrown) : "";
  return (
    <div className="absolute inset-0" data-toss={state}>
      <canvas
        ref={canvasRef}
        data-toss-3d={ready ? "ready" : "loading"}
        className="absolute inset-0 h-full w-full"
      />
      <p
        data-throw-result={
          done && thrown ? (thrown.nak ? "nak" : (thrown.value ?? "")) : ""
        }
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-[7%] min-h-8 text-center font-black text-3xl tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]",
          label && "yut-pop",
          isBonus(thrown) ? "text-amber-300" : "text-orange-50",
        )}
      >
        {waiting ? "던지는 중…" : label}
      </p>
    </div>
  );
}

declare global {
  interface Window {
    /** 화면 시험·성능 재기: 마지막 연출의 그리기 시간 */
    __yutToss?: FrameStats & { plays: number };
  }
}

/**
 * 멍석(던지는 장면의 가운데, docs/37 14·15절). WebGL이 되고 움직임 줄이기가 아니면 3D 멍석에서 던진 윷이 날아와
 * 튀고 구르다 하나씩 멈춘다. 결과는 엔진이 이미 정했고, 연출은 그 결과에 맞는 궤적을 고른다(`toss/sim.ts`).
 * 그 밖에는 2D 윷가락 넷으로 결과만 보인다. 3D는 화면에 이것 하나만, 보이지 않으면(`visible` 거짓, 화면 밖, 숨은 탭) 그리지 않는다
 */
export function TossMat({
  view,
  visible,
}: {
  view: YutView;
  /** 던지는 장면이 보이는가(말 옮기는 장면이면 그리지 않는다) */
  visible: boolean;
}) {
  const [threeD, lose] = useThreeD();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const { sceneRef, ready } = useTossScene(
    canvasRef,
    threeD,
    lose,
    () => planFor(viewRef.current, viewRef.current.lastThrow),
    visible,
  );
  /** 연출을 마친(또는 연출 없이 보인) 던지기 번호 */
  const [shown, setShown] = useState<number>(() =>
    view.lastThrow ? view.lastThrow.index : -1,
  );
  const [playing, setPlaying] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tossing = useYut((s) => s.tossing);
  const finishToss = useYut((s) => s.finishToss);

  // 결과가 나온 화면을 store가 보이기 직전에 묻는다: 3D로 굴릴 수 있으면 맡는다
  useEffect(() => {
    if (!ready) return;
    setTossDirector((next) => {
      const scene = sceneRef.current;
      const plan = planFor(next, next.lastThrow);
      if (!scene || !plan || document.hidden || !next.lastThrow) return false;
      const index = next.lastThrow.index;
      const bonus = isBonus(next.lastThrow);
      // 던지는 장면이 보이게 한 뒤(같은 순간) 굴리기 시작한다
      scene.setActive(true);
      setPlaying(true);
      scene.play(plan, {
        onImpact: impactSound,
        onStop: () => buzz("stick"),
        onDone: () => {
          if (bonus) {
            playUiCue("yutBonus");
            buzz("bonus");
          }
          recordStats(scene);
          setShown(index);
          useYut.getState().landToss();
          setPlaying(false);
          // 멈춘 윷과 결과 글을 읽을 틈을 두고 다음 화면(말 옮기는 장면 등)으로 간다
          if (holdTimer.current) clearTimeout(holdTimer.current);
          holdTimer.current = setTimeout(
            () => useYut.getState().finishToss(),
            RESULT_HOLD_MS,
          );
        },
      });
      return true;
    });
    return () => {
      setTossDirector(null);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, [ready, sceneRef]);

  // 연출을 맡지 않은 던지기(2D, 무효, 옛 판)는 바로 결과를 보인다
  const thrown = view.lastThrow;
  useEffect(() => {
    if (!thrown || playing || tossing) return;
    if (thrown.index === shown) return;
    setShown(thrown.index);
    sceneRef.current?.showRest(planFor(viewRef.current, thrown));
  }, [thrown, playing, tossing, shown, sceneRef]);

  // 장면을 떠나 연출이 멈췄으면(탭을 숨겼다 등) 기다리지 않게 끝낸다
  useEffect(() => {
    if (playing && !visible) finishToss();
  }, [playing, visible, finishToss]);

  const waiting = view.phase === "reveal" || view.phase === "open";
  if (threeD === false || threeD === null)
    return (
      <FlatMat
        thrown={thrown}
        tossing={waiting}
        animateKey={thrown ? thrown.index + 1 : 0}
      />
    );
  const done = thrown !== null && shown === thrown.index && !playing;
  return (
    <MatCanvas
      canvasRef={canvasRef}
      ready={ready}
      state={playing ? "playing" : done ? "done" : "idle"}
      thrown={thrown}
      waiting={waiting}
    />
  );
}

/**
 * 다시 보기의 멍석(docs/37 14-7). 대국 화면의 멍석과 같은 3D 장면·같은 궤적(`planFor`)을 쓰되 store 대신 걸음(`cue`)을 따른다.
 * 한 걸음 앞으로 와서 새 던지기가 나왔으면(`cue.animate`) 그 궤적을 굴리고, 다 멈춘 뒤 결과 글을 잠시 보인 다음
 * `onSettled(cue)`를 부른다. 그 밖(뒤로·건너뛰기·연출을 못 할 때)은 멈춘 모습만 보이고 곧바로 부른다.
 * `threeD`는 부모가 `useThreeD`로 정한다(옛 판·WebGL 없음·움직임 줄이기는 2D 윷가락)
 */
export function ReplayMat({
  view,
  cue,
  threeD,
  lose,
  visible,
  onSettled,
}: {
  view: YutView;
  cue: ReplayCue;
  threeD: boolean | null;
  lose: () => void;
  visible: boolean;
  onSettled: (cue: ReplayCue) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cueRef = useRef(cue);
  cueRef.current = cue;
  const viewRef = useRef(view);
  viewRef.current = view;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const { sceneRef, ready } = useTossScene(
    canvasRef,
    threeD,
    lose,
    () => cueRef.current.plan,
    visible,
  );
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const scene = sceneRef.current;
    const settle = () => settledRef.current(cue);
    if (!threeD) {
      settle();
      return;
    }
    if (!ready || !scene) return;
    if (!cue.animate || !cue.plan || document.hidden) {
      scene.showRest(cue.plan);
      setPlaying(false);
      settle();
      return;
    }
    let hold: ReturnType<typeof setTimeout> | null = null;
    let live = true;
    const bonus = isBonus(viewRef.current.lastThrow);
    scene.setActive(true);
    setPlaying(true);
    scene.play(cue.plan, {
      onImpact: impactSound,
      onDone: () => {
        if (!live) return;
        if (bonus) playUiCue("yutBonus");
        recordStats(scene);
        setPlaying(false);
        hold = setTimeout(settle, RESULT_HOLD_MS);
      },
    });
    return () => {
      live = false;
      if (hold) clearTimeout(hold);
    };
  }, [cue, ready, threeD, sceneRef]);

  const thrown = view.lastThrow;
  const waiting = view.phase === "reveal" || view.phase === "open";
  if (threeD === false || threeD === null)
    return <FlatMat thrown={thrown} tossing={waiting} animateKey={0} />;
  return (
    <MatCanvas
      canvasRef={canvasRef}
      ready={ready}
      state={playing ? "playing" : thrown ? "done" : "idle"}
      thrown={thrown}
      waiting={waiting}
    />
  );
}
