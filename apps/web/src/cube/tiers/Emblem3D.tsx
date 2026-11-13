"use client";

import { useEffect, useRef, useState } from "react";

import { ViewHome } from "@/cube/components/ViewHome";
import { cn } from "@/lib/cn";
import { EmblemStill } from "./EmblemStill";
import { styleOfTier } from "./emblem3d/gemStyle";
import { posterSrc } from "./emblem3d/poster";
import type { DraftTier } from "./emblem3d/scene";
import type { EmblemStage } from "./emblem3d/stage";
import { canDraw3d, type DrawPath, pathOverride } from "./emblem3d/support";
import { TIER_LABEL } from "./table";

type State = "loading" | "3d" | "svg";

/** 대기 그림이 3D 첫 장 위에서 겹쳐 사라지는 시간(ms) */
export const POSTER_FADE_MS = 200;

/** 동작 줄이기 설정인지 */
export function prefersReducedMotion(): boolean {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 3D 티어 엠블럼 한 칸(docs/47 14-7). 끌면 좌우로 돌고, three.js는 이 칸이 뜰 때 늦게 받는다.
 *
 * - `sway`(티어 화면 진열): 정면 둘레를 좌우로 천천히 흔들어 반짝임이 면을 따라 지나간다. 끌면 멈췄다가 놓은 뒤 잠시
 *   그 각에 두고 다시 천천히 흔든다. 동작 줄이기 설정이면 흔들지 않고, 그때는 끌어 돌린 각에 남기고 벗어나 있으면
 *   「처음 각도로」 단추가 뜬다(고정 규칙 2-1절). 흔드는 동안은 각이 늘 바뀌므로 그 단추를 두지 않는다.
 * - 3D가 뜨기 전에는 3D 장면을 미리 찍은 대기 그림(`emblem3d/poster.ts`)을 같은 자리·같은 크기로 덮어 두고, 3D 첫 장이 화면에 나간 뒤에 걷는다. 찍어 둔 그림이 없으면 빈 칸에 작은 로딩 표시를
 *   둔다. 로딩 중에는 평면 SVG를 보이지 않는다. 3D를 못 그리거나(WebGL2 없음·무대 실패) 문맥을 잃으면 정지
 *   그림(`EmblemStill`, 3D를 정면에서 찍은 그림)을 보이고, 그 그림도 못 받을 때만 평면 SVG가 남는다.
 * - 화면 밖이면 그리지 않는다(무대의 IntersectionObserver, 흔들기 시계도 멈춘다).
 *
 * `data-emblem3d-path`: `hdr`(HDR 캔버스) · `bloom`(SDR 번짐) · `plain`(금속) · `svg`(3D 없음·실패) · `loading`.
 */
export function Emblem3D({
  tier,
  size,
  className,
  pageColor,
  sway = false,
  label,
}: {
  tier: DraftTier;
  size: number;
  className?: string;
  /** 바탕색(배경판 가장자리가 녹아든다). 기본은 티어 화면 바탕(neutral-900) */
  pageColor?: string | undefined;
  /** 진열 흔들기 */
  sway?: boolean;
  /** 읽어 주는 이름(없으면 「<티어> 엠블럼」) */
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<EmblemStage | null>(null);
  const [state, setState] = useState<State>("loading");
  const [path, setPath] = useState<DrawPath | null>(null);
  const [shown, setShown] = useState(false);
  const [reduce, setReduce] = useState(true);
  useEffect(() => setReduce(prefersReducedMotion()), []);
  const swaying = sway && !reduce;
  // 3D 첫 장 뒤 대기 그림을 겹쳐 사라지게 한 다음 걷는다(남은 작은 차이가 한 번에 튀지 않게)
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!shown) {
      setGone(false);
      return;
    }
    const id = window.setTimeout(() => setGone(true), POSTER_FADE_MS + 30);
    return () => window.clearTimeout(id);
  }, [shown]);
  const [posterBroken, setPosterBroken] = useState(false);
  const poster = posterSrc(tier, size, pageColor);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 대기 그림 주소가 바뀌면 다시 불러 본다
  useEffect(() => {
    setPosterBroken(false);
  }, [poster]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (!canDraw3d()) {
      setState("svg");
      return;
    }
    // 티어·크기를 바꾸면 새 무대가 셰이더를 짓는 동안 대기 그림으로 둔다. 새 무대는 정면에서 시작한다(대기 그림이 정면)
    setState("loading");
    setPath(null);
    setShown(false);
    let live = true;
    let made: EmblemStage | null = null;
    let force: DrawPath | null = null;
    try {
      force = pathOverride(window.location.search);
    } catch {
      force = null;
    }
    // 무대마다 제 칸을 따로 둔다: 앞 무대가 늦게 지어져도 새 무대의 캔버스를 건드리지 않고, 정리할 때 칸째 지운다
    const host = document.createElement("div");
    host.className = "absolute inset-0";
    host.dataset.emblem3dStage = "";
    el.append(host);
    // 화면 시험이 대기 그림을 재는 동안 3D를 붙잡아 둔다(`window.__emblem3dHold`, 제품에서는 없다)
    const hold = (window as { __emblem3dHold?: Promise<void> }).__emblem3dHold;
    Promise.all([import("./emblem3d/stage"), hold])
      .then(([{ EmblemStage }]) => {
        if (!live) return null;
        return EmblemStage.create(host, { tier, size, force, pageColor });
      })
      .then((s) => {
        if (!s) return;
        made = s;
        if (!live) {
          s.dispose();
          return;
        }
        stage.current = s;
        // 문맥을 잃으면(GPU 재시작·탭이 오래 숨음 등) 빈 캔버스 대신 정지 그림으로
        s.canvas.addEventListener("webglcontextlost", () => {
          if (live) setState("svg");
        });
        setPath(s.path);
        setState("3d");
        s.firstFrame.then(() => {
          if (live) setShown(true);
        });
      })
      .catch(() => {
        host.remove();
        if (live) setState("svg");
      });
    return () => {
      live = false;
      made?.dispose();
      stage.current = null;
      host.remove();
    };
  }, [tier, size, pageColor]);

  // 흔들기는 첫 장이 나가고 대기 그림을 걷은 뒤에 시작한다(대기 그림과 다른 각으로 겹쳐 사라지지 않게)
  useEffect(() => {
    if (state === "3d" && gone) stage.current?.setSway(swaying);
  }, [swaying, state, gone]);

  const failed = state === "svg";
  const covered = !failed && !(state === "3d" && shown);
  const usePoster = !failed && poster !== null && !posterBroken;

  return (
    <div
      data-emblem3d={tier}
      data-emblem3d-path={state === "3d" ? (path ?? "loading") : state}
      data-emblem3d-shown={state === "3d" && shown ? "" : undefined}
      data-emblem3d-style={styleOfTier(tier) ?? undefined}
      role="img"
      aria-label={label ?? `${TIER_LABEL[tier]} 엠블럼`}
      className={cn(
        "relative flex select-none items-center justify-center overflow-hidden rounded-2xl",
        className,
      )}
      style={{ width: size, height: size, background: pageColor }}
    >
      {/* 캔버스는 무대가 이 칸에 직접 넣는다(React가 자식을 다루지 않는 칸) */}
      <div ref={box} className="absolute inset-0" />
      {!(state === "3d" && gone) && usePoster && (
        <div
          data-emblem3d-poster
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: covered ? 1 : 0,
            transition: `opacity ${POSTER_FADE_MS}ms ease-out`,
          }}
        >
          {/* 3D 장면을 미리 찍은 대기 그림: 캔버스와 같은 자리·같은 크기 */}
          {/* biome-ignore lint/performance/noImgElement: 미리 찍은 그림을 캔버스와 같은 화소 크기로 그대로 보인다 */}
          <img
            src={poster ?? undefined}
            alt=""
            width={size}
            height={size}
            draggable={false}
            onError={() => setPosterBroken(true)}
            className="block rounded-2xl"
            style={{ width: size, height: size }}
          />
        </div>
      )}
      {covered && !usePoster && (
        <span
          data-emblem3d-loading
          aria-hidden
          className="absolute size-6 animate-spin rounded-full border-2 border-white/15 border-t-white/60"
        />
      )}
      {failed && (
        <span
          data-emblem3d-fallback
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: pageColor ?? undefined }}
        >
          <EmblemStill tier={tier} size={Math.round(size * 0.72)} />
        </span>
      )}
      {!swaying && <ViewHome viewRef={stage} ready={state === "3d"} />}
    </div>
  );
}
