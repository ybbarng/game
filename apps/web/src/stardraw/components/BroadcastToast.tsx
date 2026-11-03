"use client";

import { acceptFrom, DRAND_DELAY, roundTimes } from "@game/stardraw-core";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { swipeResult } from "../broadcast-swipe";
import { gateClock } from "../gate-status";
import { buzzOnce } from "../haptics";
import type { LedgerStatus } from "../local-ledger";
import { roundShort } from "../round-label";
import { type Services, serverApi } from "../services";
import { RoomIcon } from "./PlaceIcons";
import { liveDrawRound, liveOver } from "./RoomView";

/**
 * 지금 관측할 회차: 예측(응모)이 마감된 때부터 그 회차 관측(실시간 추첨 연출)이 끝날 때까지. 예측 중이면 null.
 * 「지금 회차」 화면(/stardraw/now)이 답안지와 관측지 가운데 무엇을 보일지와 방송 토스트가 같이 쓴다
 */
export function watchRound(
  services: Services,
  status: LedgerStatus,
): number | null {
  const live = liveDrawRound(services, status);
  if (live !== null) return live;
  if (status.phase === "closing") return status.round;
  // 앞 회차 기록을 기다리거나(nextDrawRound < round), 기록은 있지만 관측 1분 중이다(nextDrawRound = round)
  if (status.phase === "waiting")
    return Math.min(status.nextDrawRound, status.round - 1);
  return null;
}

/**
 * 방송 문구(우주국 방송이라 「~습니다」). 마감 직후부터 관측 안내 전(관측 15초 전, 실시간 관측이 잡히기 전)까지는
 * 마감과 관측 시각을 말한다: 관측까지 5분이 남았는데 「곧 관측이 시작됩니다」는 일렀다(2026-11-03 운영 둘러보기).
 * 그 뒤로는 관측지로 부른다(실시간 관측 중이면 「지금」)
 */
export function broadcastText(
  services: Services,
  status: LedgerStatus,
  round: number,
  live: boolean,
): string {
  const schedule = services.ledger.schedule;
  const name = roundShort(schedule, round);
  const drawAt = roundTimes(schedule, round).closesAt + DRAND_DELAY;
  if (!live && status.now < drawAt)
    return `${name} 예측을 마감했습니다. 관측은 ${gateClock(drawAt)}입니다.`;
  return `${live ? "지금" : "곧"} ${name} 관측이 시작됩니다. 우주인 여러분은 관측지로 이동해 주시기 바랍니다.`;
}

/**
 * 방송할 회차. 지금 관측할 회차(watchRound)이되, 실시간 관측 연출이 이미 끝난 회차는 빼고 null.
 * 연출이 끝난 뒤에도 장부 상태가 다음 회차를 열기 전(관측 1분 중)에는 watchRound가 그 회차를 내놓아, 관측을 다 보고
 * 홈으로 오면 「곧 n회 관측이 시작됩니다」가 잠깐 내려왔다 사라졌다(2026-11-03 지인 제보)
 */
export function broadcastRound(
  services: Services,
  status: LedgerStatus,
): number | null {
  const round = watchRound(services, status);
  if (round === null) return null;
  if (
    serverApi() &&
    liveOver(services, round, services.ledger.record(round), status.now * 1000)
  )
    return null;
  return round;
}

/** 화면이 다 뜬 뒤 방송이 내려오기까지의 쉼(2026-11-02 사용자: 뜨자마자 덮으면 뒤의 화면을 못 본다) */
export const BROADCAST_DELAY_MS = 1500;

/**
 * 우주국 방송(2026-11-02 사용자): 예측(응모)이 마감되면 관측지 밖의 별 따기 화면 위쪽에 우주국 안내가 내려온다.
 * 마감부터 그 회차 관측(추첨 연출)이 끝날 때까지. 화면이 다 뜨고 잠깐 쉰 뒤 내려온다. 누르면 관측지로,
 * 옆이나 위·아래로 밀면 그 회차 동안 사라진다
 */
export function BroadcastToast({
  services,
  status,
  hidden,
  settled,
  screen,
  belowBar = false,
  onGo,
}: {
  services: Services;
  status: LedgerStatus;
  /** 이미 관측지(추첨 화면)에 있으면 띄우지 않는다 */
  hidden: boolean;
  /** 화면이 다 떴는가(우주국 인사·홈 펼치기가 끝났다). 그 뒤 BROADCAST_DELAY_MS를 쉬고 내려온다 */
  settled: boolean;
  /** 지금 화면 이름. 바뀌면 새 화면이 뜰 때까지 다시 기다린다 */
  screen: string;
  /** 넓은 화면의 위쪽 메뉴 줄(약 61px) 아래에 띄운다(메뉴 줄에 가려졌다, 2026-11-02 사용자) */
  belowBar?: boolean;
  onGo: (round: number) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 화면이 바뀌면 다시 쉰다
  useEffect(() => {
    setReady(false);
    if (!settled) return;
    let timer: number | undefined;
    const wait = () => {
      timer = window.setTimeout(() => setReady(true), BROADCAST_DELAY_MS);
    };
    if (document.readyState === "complete") wait();
    else window.addEventListener("load", wait, { once: true });
    return () => {
      window.removeEventListener("load", wait);
      window.clearTimeout(timer);
    };
  }, [settled, screen]);
  const live = liveDrawRound(services, status);
  const round = broadcastRound(services, status);
  const shown =
    ready && !hidden && round !== null && !dismissed.has(round) ? round : null;
  // 내려오는 순간 짧게 톡톡(회차마다 한 번: 화면을 옮겨 다시 내려오거나 문구가 「곧」으로 바뀌어도 다시 울리지 않는다)
  useEffect(() => {
    if (shown !== null) buzzOnce("broadcast", shown);
  }, [shown]);
  if (shown === null || round === null) return null;
  const text = broadcastText(services, status, round, live !== null);
  const dismiss = () => setDismissed((s) => new Set(s).add(round));

  const end = () => {
    const d = drag;
    start.current = null;
    setDrag(null);
    if (!d) return;
    const r = swipeResult(d);
    if (r === "dismiss") dismiss();
    else if (r === "go") onGo(round);
  };
  const dx = drag?.x ?? 0;
  const dy = drag?.y ?? 0;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3",
        belowBar
          ? "pt-[calc(max(env(safe-area-inset-top,0px),var(--sd-band,0px))+76px)]"
          : "pt-[calc(max(env(safe-area-inset-top,0px),var(--sd-band,0px))+12px)]",
      )}
    >
      <button
        type="button"
        data-broadcast={round}
        aria-label={`카노푸스 우주국 방송: ${text} 누르면 관측지로 이동합니다`}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
          setDrag({ x: 0, y: 0 });
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          setDrag({
            x: e.clientX - start.current.x,
            y: e.clientY - start.current.y,
          });
        }}
        onPointerUp={end}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") dismiss();
        }}
        onClick={(e) => {
          // 키보드(Enter·Space)로 누른 때만. 포인터는 위 end가 맡는다
          if (e.detail === 0) onGo(round);
        }}
        style={{
          transform: `translate(${dx}px, ${dy}px)`,
          opacity:
            1 - Math.min(0.7, Math.max(Math.abs(dx) / 200, Math.abs(dy) / 150)),
          transition: drag ? "none" : undefined,
        }}
        className="sd-broadcast pointer-events-auto flex w-full max-w-md touch-none select-none flex-col gap-1 rounded-2xl border border-amber-200/30 bg-slate-950/90 px-4 py-3 text-left shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur"
      >
        <span className="flex items-center gap-2 font-semibold text-amber-200 text-xs tracking-wide">
          <span aria-hidden="true" className="sd-live-dot" data-live="open" />
          카노푸스 우주국
          {/* 누르면 가는 곳(관측지) 표시 */}
          <RoomIcon className="ml-auto size-5 text-amber-200/85" />
        </span>
        <span className="break-keep text-[15px] text-white/90 leading-snug">
          {text}
        </span>
      </button>
    </div>
  );
}

/**
 * 지금 관측 방송 중인 회차(2026-11-02 사용자: 관측 시간에는 홈도 관측지를 보인다). 관측 안내 15초 전부터
 * 연출이 끝날 때까지(서버가 있을 때), 그리고 앞 회차 기록이 나온 뒤 관측 1분(`acceptFrom`)이 끝날 때까지.
 * 마감 뒤 관측을 기다리는 5분은 들지 않는다(홈 회차 카드가 「관측까지」를 센다)
 */
export function onAirRound(
  services: Services,
  status: LedgerStatus,
): number | null {
  const live = liveDrawRound(services, status);
  if (live !== null) return live;
  const prev = status.round - 1;
  if (
    status.phase === "waiting" &&
    prev >= 1 &&
    services.ledger.record(prev) &&
    status.now < acceptFrom(services.ledger.schedule, status.round)
  )
    return prev;
  return null;
}
