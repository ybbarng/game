"use client";

import { type LastThrow, throwName, type YutView } from "@game/yut-engine";
import { useEffect, useRef, useState } from "react";

import { playUiCue } from "@/game/ui-sound";
import { cn } from "@/lib/cn";

import { buzz } from "../haptics";
import { setTossDirector, useYut } from "../store";
import { planToss, seatAngle, type TossPlan } from "../toss/sim";
import type { FrameStats, TossScene } from "../toss/toss-scene";
import { YutSticks } from "./parts";

/** 윷이 다 멈춘 뒤 결과 글을 보이고 기다리는 시간(ms). 그 뒤 다음 화면으로 */
const RESULT_HOLD_MS = 900;

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

/** 던진 사람 자리에서 날아오는 궤적 계획(무효거나 몸짓이 없는 옛 판이면 null) */
export function planFor(
  view: Pick<YutView, "rules" | "mySeat">,
  thrown: LastThrow | null,
): TossPlan | null {
  if (!thrown?.gesture || !thrown.sticks || thrown.nak === "unopened")
    return null;
  const players = view.rules.players;
  return planToss({
    index: thrown.index,
    gesture: thrown.gesture,
    sticks: thrown.sticks,
    nak: thrown.nak ?? null,
    angle: seatAngle(thrown.seat - view.mySeat, players),
  });
}

/** 결과 글: 도·개·걸, 「윷! 한 번 더」, 낙, 무효 */
export function resultLabel(thrown: LastThrow): string {
  if (thrown.nak === "unopened") return "무효";
  if (thrown.nak) return "낙";
  const v = thrown.value;
  if (v === null) return "";
  return `${throwName(v)}${v === 4 || v === 5 ? "! 한 번 더" : ""}`;
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
  const reduce = useReducedMotion();
  const [threeD, setThreeD] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TossScene | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [onScreen, setOnScreen] = useState(true);
  /** 연출을 마친(또는 연출 없이 보인) 던지기 번호 */
  const [shown, setShown] = useState<number>(() =>
    view.lastThrow ? view.lastThrow.index : -1,
  );
  const [playing, setPlaying] = useState(false);
  /** 3D 장면을 불러 붙였다 */
  const [ready, setReady] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tossing = useYut((s) => s.tossing);
  const finishToss = useYut((s) => s.finishToss);

  useEffect(() => {
    setThreeD(!reduce && webglAvailable());
  }, [reduce]);

  // 3D 장면을 불러 붙인다
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!threeD || !canvas) return;
    let disposed = false;
    let io: IntersectionObserver | null = null;
    const lost = (e: Event) => {
      e.preventDefault();
      setThreeD(false);
    };
    canvas.addEventListener("webglcontextlost", lost);
    void import("../toss/toss-scene")
      .then(({ createTossScene }) => {
        if (disposed) return;
        const scene = createTossScene(canvas);
        sceneRef.current = scene;
        scene.resize(canvas.clientWidth, canvas.clientHeight);
        scene.showRest(planFor(viewRef.current, viewRef.current.lastThrow));
        io = new IntersectionObserver(([entry]) =>
          setOnScreen(!!entry?.isIntersecting),
        );
        io.observe(canvas);
        setReady(true);
      })
      .catch(() => setThreeD(false));
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
  }, [threeD]);

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

  // 결과가 나온 화면을 store가 보이기 직전에 묻는다: 3D로 굴릴 수 있으면 맡는다
  useEffect(() => {
    if (!ready) return;
    setTossDirector((next) => {
      const scene = sceneRef.current;
      const plan = planFor(next, next.lastThrow);
      if (!scene || !plan || document.hidden || !next.lastThrow) return false;
      const index = next.lastThrow.index;
      const bonus = next.lastThrow.value === 4 || next.lastThrow.value === 5;
      // 던지는 장면이 보이게 한 뒤(같은 순간) 굴리기 시작한다
      scene.setActive(true);
      setPlaying(true);
      scene.play(plan, {
        onImpact: (_stick, strength) =>
          playUiCue("yutHit", {
            step: strength > 0.66 ? 3 : strength > 0.33 ? 2 : 1,
          }),
        onStop: () => buzz("stick"),
        onDone: () => {
          if (bonus) {
            playUiCue("yutBonus");
            buzz("bonus");
          }
          const stats = scene.stats();
          window.__yutToss = {
            ...stats,
            plays: (window.__yutToss?.plays ?? 0) + 1,
          };
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
  }, [ready]);

  // 연출을 맡지 않은 던지기(2D, 무효, 옛 판)는 바로 결과를 보인다
  const thrown = view.lastThrow;
  useEffect(() => {
    if (!thrown || playing || tossing) return;
    if (thrown.index === shown) return;
    setShown(thrown.index);
    sceneRef.current?.showRest(planFor(viewRef.current, thrown));
  }, [thrown, playing, tossing, shown]);

  // 장면을 떠나 연출이 멈췄으면(탭을 숨겼다 등) 기다리지 않게 끝낸다
  useEffect(() => {
    if (playing && !visible) finishToss();
  }, [playing, visible, finishToss]);

  const waiting = view.phase === "reveal" || view.phase === "open";
  const done = thrown !== null && shown === thrown.index && !playing;
  const label = done && thrown ? resultLabel(thrown) : "";
  const bonus = thrown?.value === 4 || thrown?.value === 5;

  if (threeD === false || threeD === null)
    return (
      <div
        className="yut-mat-2d absolute inset-[6%] flex items-center justify-center rounded-full"
        data-toss="2d"
      >
        <YutSticks
          sticks={thrown?.sticks ?? null}
          value={thrown?.value ?? null}
          nak={thrown?.nak ?? null}
          throwKey={thrown ? thrown.index + 1 : 0}
          tossing={waiting}
        />
      </div>
    );

  return (
    <div
      className="absolute inset-0"
      data-toss={playing ? "playing" : done ? "done" : "idle"}
    >
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
          bonus ? "text-amber-300" : "text-orange-50",
        )}
      >
        {waiting ? "던지는 중…" : label}
      </p>
    </div>
  );
}
