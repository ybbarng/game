"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HERO_BOX, heroPosterSrc } from "../hero/poster";
import type { HeroHandle } from "../hero/run";
import { useCubeSettings } from "../settings";
import { useReducedMotion } from "../use-reduced-motion";
import { solvedStickers } from "../view/geometry";
import { CubePoster } from "./CubePoster";

/**
 * 큐브 첫 화면 위 그림: 3D 큐브가 섞이고 해법대로 맞춰지기를 되풀이한다(장식, 입력을 받지 않는다).
 * - 3D가 준비되기 전, WebGL이 없을 때, 움직임 줄이기(`prefers-reduced-motion`)일 때는 대기 그림:
 *   3D 첫 장면(맞춘 큐브)을 같은 카메라·같은 크기로 찍어 둔 이미지(`hero/poster.ts`). 색을 직접 고른 사람은
 *   같은 각도로 그린 SVG(`CubePoster`). 3D가 뜨면 그 위로 서서히 겹쳐 나타나고, 다 나타난 뒤에 대기 그림을
 *   치우고 섞기를 시작한다(겹치는 동안 두 그림이 같은 맞춘 큐브라 이어져 보인다).
 *   이미지는 다 받아진 뒤에만 보인다. 받는 중이거나 못 받으면(오프라인 등) SVG가 그 자리에 있어 깨진 이미지
 *   표시가 보이지 않는다.
 * - 화면에 안 보이거나 탭이 숨으면 멈춘다(휴대폰 전지·발열).
 * - 창을 최소화했다 돌아오는 등으로 WebGL 문맥을 잃으면 연출을 치우고 대기 그림을 다시 보인 뒤, 화면이 보일 때
 *   새 캔버스로 다시 띄운다(맞춘 큐브부터).
 * - 크기·해법·강조는 설정(「첫 화면 큐브」), 색은 설정의 색을 따른다.
 */

/** 3D가 대기 그림 위로 나타나는 시간(ms) */
const FADE_MS = 400;
/** WebGL 문맥을 잃었을 때 다시 띄우는 횟수 상한(계속 잃는 기기에서는 대기 그림을 그대로 둔다) */
const MAX_RESTARTS = 3;

export function CubeHero() {
  const settings = useCubeSettings();
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<HeroHandle | null>(null);
  const [ready, setReady] = useState(false);
  /** 3D가 다 나타나 대기 그림을 치웠다 */
  const [shown, setShown] = useState(false);
  /** 다 받아진 대기 이미지 주소와 못 받은 주소. 다 받기 전·못 받으면 SVG를 보인다(깨진 이미지 표시를 막는다) */
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  /** WebGL 문맥을 잃고 다시 띄운 횟수(캔버스를 새로 만든다) */
  const [generation, setGeneration] = useState(0);
  const [label, setLabel] = useState("");
  const colorsRef = useRef(settings.colors);
  colorsRef.current = settings.colors;
  const highlightRef = useRef(settings.heroHighlight);
  highlightRef.current = settings.heroHighlight;

  const { heroSize: n, heroMethod: choice, quality, stickerless } = settings;
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (reduced || !canvas || !wrap) return;
    let disposed = false;
    let inView = false;
    /** 3D가 다 나타난 뒤에야 섞기를 시작한다 */
    let started = false;
    /** WebGL 문맥을 잃었다: 화면이 보이면 새 캔버스로 다시 띄운다 */
    let lost = false;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      if (lost) {
        if (!document.hidden && generation < MAX_RESTARTS)
          setGeneration((g) => g + 1);
        return;
      }
      const h = handleRef.current;
      if (!h || !started) return;
      if (inView && !document.hidden) h.resume();
      else h.pause();
    };
    /**
     * 창을 최소화했다 돌아오거나 GPU가 바뀌면 브라우저가 WebGL 문맥을 버릴 수 있다. 그러면 큐브는 사라진 채
     * 꼬리표만 넘어가므로 연출을 치우고 대기 그림을 다시 보인 뒤, 화면이 보일 때 새로 띄운다
     */
    const onLost = (e: Event) => {
      e.preventDefault();
      if (disposed || lost) return;
      lost = true;
      clearTimeout(fade);
      const h = handleRef.current;
      handleRef.current = null;
      try {
        h?.dispose();
      } catch {
        // 이미 잃은 문맥을 놓아주다 던져도 그대로 둔다
      }
      setReady(false);
      setShown(false);
      setLabel("");
      sync();
    };
    canvas.addEventListener("webglcontextlost", onLost);
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
          highlight: highlightRef.current,
          onLabel: (l) => {
            if (!disposed) setLabel(l);
          },
        }),
      )
      .then((h) => {
        if (disposed || lost) {
          h.dispose();
          return;
        }
        handleRef.current = h;
        // 불러오는 동안 강조를 바꿨을 수 있다
        h.setHighlight(highlightRef.current);
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
      canvas.removeEventListener("webglcontextlost", onLost);
      handleRef.current?.dispose();
      handleRef.current = null;
      setReady(false);
      setShown(false);
      setLabel("");
    };
  }, [reduced, n, choice, quality, stickerless, generation]);

  useEffect(() => {
    handleRef.current?.setColors(settings.colors);
  }, [settings.colors]);

  // 강조는 큐브를 새로 띄우지 않고 바꾼다
  useEffect(() => {
    handleRef.current?.setHighlight(settings.heroHighlight);
  }, [settings.heroHighlight]);

  const src = heroPosterSrc(settings);
  const posterSrc = src !== null && src !== failedSrc ? src : null;
  const imageReady = posterSrc !== null && loadedSrc === posterSrc;
  /**
   * 이미지가 다 받아졌는지 붙는 순간에 본다. 정적 HTML의 이미지는 화면 코드가 붙기 전에 받아지거나 실패할 수
   * 있어(그러면 onLoad·onError를 놓친다) `complete`로 다시 본다
   */
  const posterRef = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete) return;
    const at = img.getAttribute("src");
    if (img.naturalWidth > 0) setLoadedSrc(at);
    else setFailedSrc(at);
  }, []);
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
        {!(live && shown) && !imageReady && (
          // 찍은 이미지가 없거나, 아직 받는 중이거나, 못 받았을 때: 같은 각도로 그린 SVG
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
        )}
        {!(live && shown) && posterSrc && (
          // 다 받기 전에는 투명하게 둔다: 받는 중이거나 실패한 이미지(깨진 이미지 표시)가 보이지 않게
          // biome-ignore lint/performance/noImgElement: 정적 내보내기라 next/image 최적화를 쓰지 않는다
          <img
            key={posterSrc}
            ref={posterRef}
            src={posterSrc}
            alt=""
            width={HERO_BOX.width}
            height={HERO_BOX.height}
            decoding="async"
            draggable={false}
            data-hero-poster="image"
            data-hero-poster-ready={imageReady ? "" : undefined}
            className="absolute inset-0 h-full w-full"
            style={{ opacity: imageReady ? 1 : 0 }}
            onLoad={() => setLoadedSrc(posterSrc)}
            onError={() => setFailedSrc(posterSrc)}
          />
        )}
        {!reduced && (
          <canvas
            // 장면을 치우면 WebGL 문맥도 놓아주므로(view.dispose) 설정이 바뀌거나 문맥을 잃으면 캔버스를 새로 만든다
            key={`${n}-${choice}-${quality}-${stickerless}-${generation}`}
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
