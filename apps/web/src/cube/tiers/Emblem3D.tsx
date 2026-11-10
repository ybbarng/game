"use client";

import { useEffect, useRef, useState } from "react";

import { ViewHome } from "@/cube/components/ViewHome";
import { cn } from "@/lib/cn";

import type { DraftTier } from "./emblem3d/scene";
import type { EmblemStage } from "./emblem3d/stage";
import { canDraw3d, type DrawPath, pathOverride } from "./emblem3d/support";
import { TierEmblem } from "./TierEmblem";
import { TIER_LABEL } from "./table";

type State = "loading" | "3d" | "svg";

/**
 * 3D 티어 엠블럼 시안 한 칸(docs/47 14-7). 끌면 좌우로 돌고, 놓은 각도에 남으며, 벗어나 있으면 「처음 각도로」 단추가
 * 뜬다. three.js는 이 칸이 뜰 때 늦게 받는다. 3D를 못 그리면 지금 SVG 엠블럼을 보인다(받는 동안에도 SVG).
 *
 * `data-emblem3d-path`: `hdr`(HDR 캔버스) · `bloom`(SDR 번짐) · `plain`(금속) · `svg`(3D 없음) · `loading`.
 */
export function Emblem3D({
  tier,
  size,
  className,
}: {
  tier: DraftTier;
  size: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<EmblemStage | null>(null);
  const [state, setState] = useState<State>("loading");
  const [path, setPath] = useState<DrawPath | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (!canDraw3d()) {
      setState("svg");
      return;
    }
    let live = true;
    let made: EmblemStage | null = null;
    let force: DrawPath | null = null;
    try {
      force = pathOverride(window.location.search);
    } catch {
      force = null;
    }
    import("./emblem3d/stage")
      .then(({ EmblemStage }) => EmblemStage.create(el, { tier, size, force }))
      .then((s) => {
        made = s;
        if (!live) {
          s.dispose();
          return;
        }
        stage.current = s;
        setPath(s.path);
        setState("3d");
      })
      .catch(() => {
        for (const c of el.querySelectorAll("canvas")) c.remove();
        if (live) setState("svg");
      });
    return () => {
      live = false;
      made?.dispose();
      stage.current = null;
      for (const c of el.querySelectorAll("canvas")) c.remove();
    };
  }, [tier, size]);

  return (
    <div
      data-emblem3d={tier}
      data-emblem3d-path={state === "3d" ? (path ?? "loading") : state}
      role="img"
      aria-label={`${TIER_LABEL[tier]} 엠블럼 3D 시안`}
      className={cn(
        "relative flex select-none items-center justify-center overflow-hidden rounded-2xl bg-neutral-900",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* 캔버스는 무대가 이 칸에 직접 넣는다(React가 자식을 다루지 않는 칸) */}
      <div ref={box} data-emblem3d-stage className="absolute inset-0" />
      {state !== "3d" && (
        <TierEmblem tier={tier} size={Math.round(size * 0.72)} />
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
      .then(async ({ captureEmblemShots, SPARKLE_YAWS }) => {
        // 두 배 화면용: 64px로 보일 그림은 128px로 찍는다
        const [f] = await captureEmblemShots(tier, 128, [0]);
        const list = await captureEmblemShots(tier, 96, SPARKLE_YAWS);
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
