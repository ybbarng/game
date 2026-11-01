"use client";

import { type Clock, realClock } from "@mighty/fair-play";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import {
  HDR_GLOW_DIAG_SRC,
  HDR_GLOW_SRC,
  HDR_GLOWS_ON,
  type HdrGlow,
  useHdrScreen,
} from "../hdr-glow";
import { SKY_STARS, starOf } from "../sky";
import { drawSky, FAINT_STARS, HIT, type SkyState, starAt } from "../sky-draw";
import { type SkyEffects, startSkyEffects } from "../sky-effects";
import { StarInfo } from "./parts";

/**
 * 네모 하늘 하나(응모·영수증·추첨이 같이 쓴다). 크기·누르기·강조만 다르다.
 * 반짝임·유성은 움직임 줄이기 설정이 아니고 응모 하늘일 때만 돈다(영수증은 고요하게, 추첨은 하늘의 빛을 끈다).
 * 탭이 안 보이면 멈춘다.
 * `hdr`의 별은 HDR 화면에서만 흰색보다 밝은 빛 그림을 위에 겹친다(hdr-glow.ts).
 * `info`면 별을 눌러 그 별 설명(응모 화면과 같은 StarInfo)을 하늘 위에 띄운다. 페이지가 밀리지 않게 하늘 안에 겹치고,
 * 누른 별을 가리지 않게 별이 아래쪽이면 위에, 위쪽이면 아래에 둔다. 같은 별·빈 하늘·바깥을 누르면 닫히고 다른 별이면 바뀐다.
 */
export function SkyBoard({
  state,
  onPick,
  info = false,
  label,
  className,
  clock = realClock,
  hdr = [],
  overlay,
}: {
  state: SkyState;
  /** 응모: 별을 누르면 그 번호 */
  onPick?: ((n: number) => void) | undefined;
  /** 별을 누르면 그 별 설명을 띄운다(연출 중에는 false로 막는다). onPick이 있으면 쓰지 않는다 */
  info?: boolean | undefined;
  label: string;
  className?: string | undefined;
  clock?: Clock | undefined;
  /** HDR 화면에서 빛 그림을 겹칠 별 */
  hdr?: readonly HdrGlow[] | undefined;
  /** 하늘 위에 겹칠 그림(당첨 축하의 별자리·별똥별). 누르기를 막지 않는다 */
  overlay?: ReactNode;
}) {
  const hdrScreen = useHdrScreen();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** 설명을 띄운 별 */
  const [shown, setShown] = useState<number | null>(null);
  const showing = info && !onPick ? shown : null;
  // 연출이 시작되어 누르기를 막으면 띄운 설명도 닫는다
  useEffect(() => {
    if (!info) setShown(null);
  }, [info]);
  // 바깥을 누르거나 Esc면 닫는다
  useEffect(() => {
    if (showing === null) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setShown(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShown(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showing]);
  const view: SkyState =
    showing === null ? state : { ...state, focus: showing };
  const stateRef = useRef(view);
  stateRef.current = view;
  const effectsRef = useRef<SkyEffects | null>(null);
  const prevPicked = useRef<readonly number[]>(state.picked);
  /** 움직임이 없을 때(영수증, 움직임 줄이기) 상태가 바뀌면 다시 그린다 */
  const repaintRef = useRef<(() => void) | null>(null);

  // 새로 고른 별, 새로 나온 당첨 번호는 곧바로 반짝인다
  useEffect(() => {
    const before = new Set(prevPicked.current);
    for (const n of state.picked)
      if (!before.has(n)) effectsRef.current?.flash("star", n);
    prevPicked.current = state.picked;
  }, [state.picked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    let width = 0;
    let raf = 0;
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mode = stateRef.current.mode;
    // 영수증도 움직인다: 내 별 6개끼리 무작위로, 여러 개가 겹쳐 반짝인다
    const animate = !reduce && (mode === "pick" || mode === "receipt");

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(width * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const paint = () => {
      if (!width) return;
      try {
        drawSky(g, {
          width,
          state: stateRef.current,
          now: clock.now(),
          twinkles: effectsRef.current?.twinkles() ?? [],
          meteor: effectsRef.current?.meteor() ?? null,
          still: !animate,
        });
      } catch (err) {
        // 한 장면에서 오류가 나도 다음 장면은 그린다
        console.error(err);
      }
    };
    const frame = () => {
      paint();
      raf = document.hidden ? 0 : requestAnimationFrame(frame);
    };
    const start = () => {
      if (!animate || effectsRef.current) return;
      effectsRef.current =
        mode === "receipt"
          ? startSkyEffects({
              clock,
              stars: 0,
              faints: 0,
              pool: stateRef.current.picked,
              starMeanMs: 450,
              starDuration: [700, 1500],
              meteors: false,
            })
          : startSkyEffects({
              clock,
              stars: SKY_STARS.length,
              faints: FAINT_STARS.length,
            });
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      effectsRef.current?.stop();
      effectsRef.current = null;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
      paint();
    };

    resize();
    paint();
    const observer = new ResizeObserver(() => {
      resize();
      paint();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    repaintRef.current = paint;
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      repaintRef.current = null;
    };
  }, [clock]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 상태가 바뀔 때마다 다시 그린다
  useEffect(() => {
    repaintRef.current?.();
  }, [view]);

  // 켜진 별의 움직임(state.motion)이 있으면 그동안 매 프레임 다시 그린다(서서히 켜짐·반짝임·흐려짐)
  const moving = !!state.motion;
  useEffect(() => {
    if (!moving) return;
    if (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let raf = 0;
    const loop = () => {
      repaintRef.current?.();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [moving]);

  return (
    <div ref={wrapRef} className={cn("relative w-full max-w-full", className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        data-sky={state.mode}
        className={cn(
          "block aspect-square w-full max-w-full rounded-xl border border-white/10 bg-[#070d19]",
          (onPick || info) && "cursor-pointer touch-manipulation",
        )}
        onClick={(e) => {
          if (!onPick && !info) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (onPick) {
            const n = starAt(x, y, rect.width);
            if (n !== null) onPick(n);
            return;
          }
          // 작은 하늘(영수증)도 응모 하늘만큼 누르기 쉽게 누르는 범위를 응모 하늘의 기준 크기 아래로 줄이지 않는다
          const n = starAt(x, y, rect.width, HIT);
          setShown((prev) => (n === null || n === prev ? null : n));
        }}
      />
      {HDR_GLOWS_ON && hdrScreen && hdr.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
          aria-hidden="true"
          data-hdr-glows={hdr.length}
        >
          {hdr.map((g) => (
            <HdrGlowSprite key={`${g.kind}-${g.n}-${g.delay ?? 0}`} glow={g} />
          ))}
        </div>
      )}
      {overlay}
      {showing !== null && (
        // 설명 칸은 누르기를 통과시킨다: 그 아래 별을 눌러도 바뀌고, 빈 곳을 누르면 닫힌다
        <StarInfo
          n={showing}
          className={cn(
            "pointer-events-none absolute inset-x-2 z-10 border-white/15 bg-[#0b1322]/90 shadow-black/40 shadow-lg backdrop-blur-sm",
            starOf(showing).y > 0.5 ? "top-2" : "bottom-2",
          )}
        />
      )}
    </div>
  );
}

/**
 * 빛 그림 크기(판 너비에 대한 %). 그림 가운데 원판이 캔버스의 켜진 별 가운데(작은 점 + 흰빛 번짐)와 같은 크기가 되게 맞췄다
 * (작은 HDR 핵만 밝으면 넓이까지 합쳐 느끼는 눈에는 오히려 SDR보다 어둡게 보인다. scripts/build-stardraw-hdr-glow.mjs)
 */
const GLOW_SIZE = 18;

/**
 * 빛 그림 하나. Safari 26.0은 position·transform이 걸린 img의 HDR을 SDR로 그린 적이 있어(WebKit 301398)
 * img에는 위치를 걸지 않고 감싸는 칸을 백분율 여백으로 별 가운데에 놓는다(판은 정사각형이라 여백 %도 너비 기준이다).
 */
function HdrGlowSprite({ glow }: { glow: HdrGlow }) {
  const s = starOf(glow.n);
  const size = GLOW_SIZE;
  return (
    <span
      className="absolute block"
      style={{
        left: `${s.x * 100}%`,
        top: `${s.y * 100}%`,
        width: `${size}%`,
        marginLeft: `${-size / 2}%`,
        marginTop: `${-size / 2}%`,
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: 정적 내보내기의 작은 HDR 그림이라 next/image가 필요 없다 */}
      <img
        src={glow.diag ? HDR_GLOW_DIAG_SRC : HDR_GLOW_SRC}
        alt=""
        draggable={false}
        decoding="async"
        data-hdr-glow={glow.kind}
        data-hdr-star={glow.n}
        className={`sd-hdr sd-hdr-${glow.kind} block h-auto w-full`}
        style={glow.delay ? { animationDelay: `${glow.delay}ms` } : undefined}
      />
    </span>
  );
}
