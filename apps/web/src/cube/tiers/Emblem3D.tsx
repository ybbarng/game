"use client";

import { useEffect, useRef, useState } from "react";

import { ViewHome } from "@/cube/components/ViewHome";
import { cn } from "@/lib/cn";
import { EmblemStill } from "./EmblemStill";
import { styleOfTier } from "./emblem3d/gemStyle";
import { emblemSize, posterSrc } from "./emblem3d/poster";
import type { DraftTier } from "./emblem3d/scene";
import { FRONT, type Spin } from "./emblem3d/spin";
import type { EmblemStage } from "./emblem3d/stage";
import { canDraw3d, type DrawPath, pathOverride } from "./emblem3d/support";
import { TIER_LABEL } from "./table";

type State = "loading" | "3d" | "svg";

/** 대기 그림이 3D 첫 장 위에서 겹쳐 사라지는 시간(ms) */
export const POSTER_FADE_MS = 200;

/** 미리보기의 「돌린 각」(좌우 0.6 라디안, 비교 그림과 같은 각) */
export const TURNED_VIEW: Spin = { yaw: 0.6, pitch: 0 };

/**
 * 3D 티어 엠블럼 시안 한 칸(docs/47 14-7). 끌면 좌우로 돌고, 놓은 각도에 남으며, 벗어나 있으면 「처음 각도로」 단추가
 * 뜬다. three.js는 이 칸이 뜰 때 늦게 받는다.
 *
 * 3D가 뜨기 전에는 3D 장면을 미리 찍은 대기 그림(`emblem3d/poster.ts`)을 같은 자리·같은 크기로 덮어 두고, 3D 첫 장이
 * 화면에 나간 뒤에 걷는다(고정 규칙 2-1절). 찍어 둔 그림이 없거나 못 받으면 빈 칸에 작은 로딩 표시를 둔다. 로딩
 * 중에는 평면 SVG를 보이지 않는다. 3D를 못 그리거나(WebGL2 없음·무대 실패) 문맥을 잃으면 정지 그림(`EmblemStill`, 3D를
 * 정면에서 찍은 그림)을 보이고, 그 그림도 못 받을 때만 평면 SVG가 남는다.
 *
 * `data-emblem3d-path`: `hdr`(HDR 캔버스) · `bloom`(SDR 번짐) · `plain`(금속) · `svg`(3D 없음·실패) · `loading`.
 */
export function Emblem3D({
  tier,
  size,
  className,
  pageColor,
  view = "front",
  auto = false,
}: {
  tier: DraftTier;
  size: number;
  className?: string;
  /** 바탕색(배경판 가장자리가 녹아든다). 기본은 미리보기 바탕(neutral-900) */
  pageColor?: string | undefined;
  /** 각: 정면·돌린 각(미리보기 단추) */
  view?: "front" | "turned";
  /** 자동 회전(미리보기 단추) */
  auto?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<EmblemStage | null>(null);
  const [state, setState] = useState<State>("loading");
  const [path, setPath] = useState<DrawPath | null>(null);
  const [shown, setShown] = useState(false);
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
  const appliedView = useRef<"front" | "turned">("front");

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
    // 티어·바탕·시안을 바꾸면 새 무대가 셰이더를 짓는 동안 대기 그림으로 둔다. 앞 무대의 「처음 각도로」 단추·길
    // 표시가 남지 않게 한다. 새 무대는 정면에서 시작한다(대기 그림이 정면이다)
    setState("loading");
    setPath(null);
    setShown(false);
    appliedView.current = "front";
    let live = true;
    let made: EmblemStage | null = null;
    let force: DrawPath | null = null;
    try {
      force = pathOverride(window.location.search);
    } catch {
      force = null;
    }
    // 무대마다 제 칸을 따로 둔다: 앞 무대가 늦게 지어져도 새 무대의 캔버스를 건드리지 않고, 정리할 때 칸째 지운다
    // (티어·시안을 빨리 바꾸면 늦게 끝난 앞 무대가 새 무대 캔버스를 지우거나 제 캔버스를 남겼다)
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

  // 각·자동 회전 단추(무대가 뜬 뒤, 바뀐 것만)
  useEffect(() => {
    const s = stage.current;
    if (!s || state !== "3d" || appliedView.current === view) return;
    appliedView.current = view;
    s.setView(view === "turned" ? TURNED_VIEW : FRONT);
  }, [view, state]);
  useEffect(() => {
    if (state === "3d") stage.current?.setAuto(auto);
  }, [auto, state]);

  // 로딩 중에는 대기 그림, 대기 그림이 없으면 작은 로딩 표시. 정지 그림은 3D를 못 그리거나 문맥을 잃었을 때만
  // (고정 규칙 2-1절, 2026-11-13 사용자 「평면이 떴다가 입체가 뜨는 게 버그처럼 보인다」)
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
      aria-label={`${TIER_LABEL[tier]} 엠블럼 3D 시안`}
      className={cn(
        "relative flex select-none items-center justify-center overflow-hidden rounded-2xl bg-neutral-900",
        className,
      )}
      style={{ width: size, height: size, background: pageColor }}
    >
      {/* 캔버스는 무대가 이 칸에 직접 넣는다(React가 자식을 다루지 않는 칸) */}
      <div ref={box} className="absolute inset-0" />
      {!(state === "3d" && gone) && usePoster && (
        // 3D 장면을 미리 찍은 대기 그림: 캔버스와 같은 자리·같은 크기(캔버스 위에 덮어 두었다가 첫 장 뒤에 걷는다)
        // biome-ignore lint/performance/noImgElement: 미리 찍은 그림을 캔버스와 같은 화소 크기로 그대로 보인다
        <img
          data-emblem3d-poster
          src={poster}
          alt=""
          width={size}
          height={size}
          draggable={false}
          onError={() => setPosterBroken(true)}
          className="pointer-events-none absolute inset-0 block rounded-2xl"
          style={{
            width: size,
            height: size,
            opacity: covered ? 1 : 0,
            transition: `opacity ${POSTER_FADE_MS}ms ease-out`,
          }}
        />
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
      <ViewHome viewRef={stage} ready={state === "3d"} />
    </div>
  );
}

/**
 * 찍은 그림 칸: 3D를 각도마다 한 장씩 찍은 PNG. 앞으로 작은 엠블럼(기록 창·티어 줄·Cubie 메뉴)에 3D 대신 쓴다.
 * 정면 한 장을 크기별로, 각도를 조금씩 바꾼 여섯 장을 늘어놓고, 그 여섯 장을 차례로 돌리는 칸 하나(메뉴가 열린 동안
 * 반짝임을 돌리는 모습)를 둔다. 동작 줄이기면 돌리지 않는다.
 */
export function EmblemShots({ tier }: { tier: DraftTier }) {
  const [front, setFront] = useState<string | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!canDraw3d()) {
      setFailed(true);
      return;
    }
    let live = true;
    import("./emblem3d/stage")
      .then(async ({ captureShots, SPARKLE_YAWS }) => {
        // 두 배 화면용: 64px로 보일 그림은 128px로 찍는다. 렌더러 하나로 함께 찍는다(맥락마다 셰이더를 다시 짓는다)
        const [[f] = [], list = []] = await captureShots([
          { tier, px: 128, yaws: [0] },
          { tier, px: 96, yaws: SPARKLE_YAWS },
        ]);
        if (!live) return;
        setFront(f ?? null);
        setFrames(list);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [tier]);

  useEffect(() => {
    if (frames.length < 2) return;
    let reduce = false;
    try {
      reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = false;
    }
    if (reduce) return;
    // 왕복(0→5→0)으로 돌린다
    const order = [
      ...frames.keys(),
      ...[...frames.keys()].reverse().slice(1, -1),
    ];
    let k = 0;
    const id = window.setInterval(() => {
      k = (k + 1) % order.length;
      setI(order[k] ?? 0);
    }, 140);
    return () => window.clearInterval(id);
  }, [frames]);

  if (failed)
    return (
      <p data-emblem3d-shots={tier} className="text-white/50 text-xs">
        3D를 그릴 수 없어 찍지 못했다.
      </p>
    );
  if (!front)
    return (
      <p data-emblem3d-shots={tier} className="text-white/50 text-xs">
        찍는 중
      </p>
    );
  const img = (src: string, px: number, key?: string) => (
    // biome-ignore lint/performance/noImgElement: 찍은 data URL을 그대로 보인다
    <img
      key={key}
      src={src}
      alt=""
      width={px}
      height={px}
      draggable={false}
      className="block"
    />
  );
  return (
    <div
      data-emblem3d-shots={tier}
      data-emblem3d-shot-count={1 + frames.length}
      className="flex flex-wrap items-end gap-3"
    >
      <figure className="flex flex-col items-center gap-1">
        {img(front, 64)}
        <figcaption className="text-white/50 text-xs">64px</figcaption>
      </figure>
      <figure className="flex flex-col items-center gap-1">
        {img(front, 32)}
        <figcaption className="text-white/50 text-xs">32px</figcaption>
      </figure>
      <figure className="flex flex-col items-center gap-1">
        {img(front, 20)}
        <figcaption className="text-white/50 text-xs">20px</figcaption>
      </figure>
      <figure className="flex flex-col items-center gap-1">
        <div className="flex gap-1">
          {frames.map((f, k) => img(f, 48, String(k)))}
        </div>
        <figcaption className="text-white/50 text-xs">
          각도를 조금씩 바꾼 여섯 장
        </figcaption>
      </figure>
      {frames[i] && (
        <figure className="flex flex-col items-center gap-1">
          {img(frames[i], 48)}
          <figcaption className="text-white/50 text-xs">돌리기</figcaption>
        </figure>
      )}
    </div>
  );
}

/**
 * 열 티어 격자: 티어마다 비스듬한 한 장을 찍은 그림으로 보이고(살아 있는 3D는 무거워 하나만 띄운다), 누르거나 마우스를
 * 올리면 그 티어를 고른다. 렌더러 하나로 차례로 찍는다.
 */
export function EmblemGrid({
  tiers,
  selected,
  onSelect,
}: {
  tiers: readonly DraftTier[];
  selected: DraftTier;
  onSelect: (t: DraftTier) => void;
}) {
  // 티어마다 누르면 열리는 큰 칸의 대기 그림(기본 시안, 정면)을 줄여 보인다. 예전에는 따로 찍은 비스듬한 그림(바탕
  // 없음·다른 각도)이 SVG 다음에 떠서 두 번 바뀌었고, 누르면 또 다른 모습이 떠 이질적이었다(2026-11-13 사용자
  // 「로드되는 동안 이전 이미지랑 이질적이니까」). 3D를 짓지 않아 가볍다
  const shots = tiers.map((t) => {
    return posterSrc(t, emblemSize(t), undefined);
  });
  const hover = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (hover.current !== null) window.clearTimeout(hover.current);
    },
    [],
  );

  return (
    <div
      data-emblem3d-grid
      data-emblem3d-grid-ready=""
      className="flex flex-wrap justify-center gap-2"
    >
      {tiers.map((t, i) => (
        <button
          key={t}
          type="button"
          data-emblem3d-pick={t}
          aria-pressed={t === selected}
          onClick={() => onSelect(t)}
          onMouseEnter={() => {
            if (hover.current !== null) window.clearTimeout(hover.current);
            hover.current = window.setTimeout(() => onSelect(t), 140);
          }}
          onMouseLeave={() => {
            if (hover.current !== null) window.clearTimeout(hover.current);
            hover.current = null;
          }}
          className={cn(
            "flex w-24 flex-col items-center gap-1 rounded-xl p-1 ring-1 ring-transparent",
            t === selected ? "bg-white/10 ring-white/30" : "hover:bg-white/5",
          )}
        >
          {shots[i] ? (
            // biome-ignore lint/performance/noImgElement: 미리 찍은 대기 그림을 그대로 줄여 보인다
            <img
              src={shots[i] as string}
              alt=""
              width={88}
              height={88}
              draggable={false}
              className="block rounded-lg"
            />
          ) : (
            <span className="flex size-[88px] items-center justify-center">
              <EmblemStill tier={t} size={64} />
            </span>
          )}
          <span className="text-white/80 text-xs">{TIER_LABEL[t]}</span>
        </button>
      ))}
    </div>
  );
}
