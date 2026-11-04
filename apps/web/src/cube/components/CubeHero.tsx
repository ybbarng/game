"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { HERO_BOX, heroPosterSrc } from "../hero/poster";
import type { HeroHandle } from "../hero/run";
import { useCubeSettings } from "../settings";
import { solvedStickers } from "../view/geometry";
import { CubePoster } from "./CubePoster";

/**
 * 큐브 첫 화면 위 그림: 3D 큐브가 섞이고 해법대로 맞춰지기를 되풀이한다(장식, 입력을 받지 않는다).
 * - 3D가 준비되기 전, WebGL이 없을 때, 움직임 줄이기(`prefers-reduced-motion`)일 때는 대기 그림:
 *   3D 첫 장면(맞춘 큐브)을 같은 카메라·같은 크기로 찍어 둔 이미지(`hero/poster.ts`). 색을 직접 고른 사람은
 *   같은 각도로 그린 SVG(`CubePoster`). 3D가 뜨면 그 위로 서서히 겹쳐 나타나고, 다 나타난 뒤에 대기 그림을
 *   치우고 섞기를 시작한다(겹치는 동안 두 그림이 같은 맞춘 큐브라 이어져 보인다).
 * - 화면에 안 보이거나 탭이 숨으면 멈춘다(휴대폰 전지·발열).
 * - 크기·해법은 설정(「첫 화면 큐브」), 색은 설정의 색을 따른다.
 */

/** 3D가 대기 그림 위로 나타나는 시간(ms) */
const FADE_MS = 400;

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
  /** 3D가 다 나타나 대기 그림을 치웠다 */
  const [shown, setShown] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
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
    /** 3D가 다 나타난 뒤에야 섞기를 시작한다 */
    let started = false;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      const h = handleRef.current;
      if (!h || !started) return;
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
        fade = setTimeout(() => {
          started = true;
          setShown(true);
          sync();
        }, FADE_MS);
      })
      .catch(() => {
        // WebGL이 없거나 불러오지 못했다: 대기 그림을 그대로 둔다
      });
    return () => {
      disposed = true;
      clearTimeout(fade);
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      handleRef.current?.dispose();
      handleRef.current = null;
      setReady(false);
      setShown(false);
      setLabel("");
    };
  }, [reduced, n, choice, quality, stickerless]);

  useEffect(() => {
    handleRef.current?.setColors(settings.colors);
  }, [settings.colors]);

  const posterSrc = imageFailed ? null : heroPosterSrc(settings);
  const solved = useMemo(() => solvedStickers(n), [n]);
  const live = ready && !reduced;
  return (
    <div
      ref={wrapRef}
      data-cube-hero
      data-hero-ready={live ? "" : undefined}
      data-hero-shown={live && shown ? "" : undefined}
      className="flex w-full flex-col items-center"
      aria-hidden
    >
      <div
        className="pointer-events-none relative select-none"
        style={{ width: HERO_BOX.width, height: HERO_BOX.height }}
      >
        {!(live && shown) &&
          (posterSrc ? (
            // biome-ignore lint/performance/noImgElement: 정적 내보내기라 next/image 최적화를 쓰지 않는다
            <img
              src={posterSrc}
              alt=""
              width={HERO_BOX.width}
              height={HERO_BOX.height}
              decoding="async"
              draggable={false}
              data-hero-poster="image"
              className="absolute inset-0 h-full w-full"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div data-hero-poster="svg" className="absolute inset-0">
              <CubePoster
                n={n}
                stickers={solved}
                colors={settings.colors}
                width={HERO_BOX.width}
                height={HERO_BOX.height}
                stickerless={stickerless}
                shadow={quality !== "low"}
                className="h-full w-full"
              />
            </div>
          ))}
        {!reduced && (
          <canvas
            // 장면을 치우면 WebGL 문맥도 놓아주므로(view.dispose) 설정이 바뀌면 캔버스를 새로 만든다
            key={`${n}-${choice}-${quality}-${stickerless}`}
            ref={canvasRef}
            className="absolute inset-0 h-full w-full transition-opacity ease-out"
            style={{
              transitionDuration: `${FADE_MS}ms`,
              opacity: live ? 1 : 0,
            }}
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
