"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import type { HeroHandle } from "../hero/run";
import { useCubeSettings } from "../settings";
import { CubeNet } from "./CubeNet";

/**
 * 큐브 첫 화면 위 그림: 3D 큐브가 섞이고 해법대로 맞춰지기를 되풀이한다(장식, 입력을 받지 않는다).
 * - 3D가 준비되기 전, WebGL이 없을 때, 움직임 줄이기(`prefers-reduced-motion`)일 때는 섞인 펼친 그림.
 *   두 그림은 같은 자리 크기라 바뀌어도 화면이 튀지 않는다.
 * - 화면에 안 보이거나 탭이 숨으면 멈춘다(휴대폰 전지·발열).
 * - 크기·해법은 설정(「첫 화면 큐브」), 색은 설정의 색을 따른다.
 */

// 펼친 그림용 섞인 모양(면마다 칸 색 번호)
const HERO_FACES = [
  [0, 0, 2, 0, 0, 0, 5, 0, 0],
  [1, 1, 1, 3, 1, 1, 1, 1, 4],
  [2, 2, 0, 2, 2, 2, 2, 1, 2],
  [3, 3, 3, 3, 3, 4, 3, 3, 3],
  [4, 4, 4, 4, 4, 4, 5, 4, 4],
  [5, 2, 5, 5, 5, 5, 5, 5, 5],
];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function CubeHero() {
  const settings = useCubeSettings();
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<HeroHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [label, setLabel] = useState("");
  const colorsRef = useRef(settings.colors);
  colorsRef.current = settings.colors;

  const { heroSize: n, heroMethod: choice, quality, stickerless } = settings;
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (reduced || !canvas || !wrap) return;
    let disposed = false;
    let inView = false;
    const sync = () => {
      const h = handleRef.current;
      if (!h) return;
      if (inView && !document.hidden) h.resume();
      else h.pause();
    };
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            inView = entries.some((e) => e.isIntersecting);
            sync();
          });
    if (io) io.observe(wrap);
    else inView = true;
    document.addEventListener("visibilitychange", sync);

    void import("../hero/run")
      .then(({ startHero }) =>
        startHero(canvas, {
          n,
          choice,
          colors: colorsRef.current,
          quality,
          stickerless,
          onLabel: (l) => {
            if (!disposed) setLabel(l);
          },
        }),
      )
      .then((h) => {
        if (disposed) {
          h.dispose();
          return;
        }
        handleRef.current = h;
        setReady(true);
        sync();
      })
      .catch(() => {
        // WebGL이 없거나 불러오지 못했다: 펼친 그림을 그대로 둔다
      });
    return () => {
      disposed = true;
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      handleRef.current?.dispose();
      handleRef.current = null;
      setReady(false);
      setLabel("");
    };
  }, [reduced, n, choice, quality, stickerless]);

  useEffect(() => {
    handleRef.current?.setColors(settings.colors);
  }, [settings.colors]);

  const live = ready && !reduced;
  return (
    <div
      ref={wrapRef}
      data-cube-hero
      data-hero-ready={live ? "" : undefined}
      className="flex w-full flex-col items-center"
      aria-hidden
    >
      <div className="pointer-events-none relative h-40 w-48 select-none">
        {!live && (
          <div className="absolute inset-0 flex items-center justify-center">
            <CubeNet
              n={3}
              faces={HERO_FACES}
              colors={settings.colors}
              hidden="black"
              className="h-24 w-auto"
            />
          </div>
        )}
        {!reduced && (
          <canvas
            // 장면을 치우면 WebGL 문맥도 놓아주므로(view.dispose) 설정이 바뀌면 캔버스를 새로 만든다
            key={`${n}-${choice}-${quality}-${stickerless}`}
            ref={canvasRef}
            className={cn(
              "absolute inset-0 h-full w-full transition-opacity duration-500",
              live ? "opacity-100" : "opacity-0",
            )}
          />
        )}
      </div>
      <p
        data-hero-label={label}
        className="h-5 text-center text-white/60 text-xs tabular-nums"
      >
        {live ? label : ""}
      </p>
    </div>
  );
}
