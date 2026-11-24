"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * 공정성 검증 실패 띠(모든 게임이 같은 글). 내 기기의 검증이 실패하면 게임이 끝날 때까지 남는다.
 * `top`을 주면 판 위 그 높이에 띄우고, 없으면 그 자리에 그린다
 */
export function InvalidBanner({
  invalid,
  top,
}: {
  invalid: string | null;
  top?: number;
}) {
  if (!invalid) return null;
  const style: CSSProperties | undefined =
    top === undefined ? undefined : { top };
  return (
    <div
      role="alert"
      data-invalid-banner
      className={cn(
        "mx-auto w-fit max-w-[92%] rounded-xl bg-rose-700/95 px-3 py-1.5 text-center font-semibold text-sm shadow-xl",
        top !== undefined && "absolute inset-x-0 z-[340]",
      )}
      style={style}
    >
      ⚠ 공정성 검증 실패 — 이 게임은 무효예요 ({invalid})
    </div>
  );
}

/** 방장이 나가 게임이 끝났을 때: 알림과 「처음으로」 단추. `floating`이면 판 위에 띄운다 */
export function HostLeftNotice({
  onExit,
  floating = false,
}: {
  onExit: () => void;
  floating?: boolean;
}) {
  return (
    <div
      role="alert"
      data-host-left
      className={cn(
        "mx-auto flex w-fit max-w-[92%] items-center gap-3 rounded-2xl bg-black/85 px-4 py-3 text-sm shadow-2xl",
        floating && "absolute inset-x-0 top-16 z-[350]",
      )}
    >
      방장이 방을 나가 게임이 끝났어요.
      <button
        type="button"
        onClick={onExit}
        className="shrink-0 rounded-lg bg-amber-400 px-3 py-1 font-semibold text-black"
      >
        처음으로
      </button>
    </div>
  );
}

/** 방장과 연결이 끊겨 다시 잇는 중. `floating`이면 판 위에 띄운다 */
export function ReconnectingNotice({
  floating = false,
}: {
  floating?: boolean;
}) {
  return (
    <div
      role="status"
      className={cn(
        "mx-auto flex w-fit max-w-[92%] items-center gap-2 rounded-2xl bg-black/85 px-4 py-3 text-sm shadow-2xl",
        floating && "absolute inset-x-0 top-16 z-[350]",
      )}
    >
      <span className="inline-block size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      방장과 연결이 끊겼어요. 다시 연결하는 중…
    </div>
  );
}

/**
 * 판 게임(BoardTable 알림 자리, 숫자야구·윷놀이·은하) 온라인 알림 묶음: 공정성 검증 실패 띠와 연결 알림.
 * 보일 것이 없으면 아무것도 그리지 않는다(`null`이라 알림 자리도 비운다)
 */
export function BoardOnlineAlerts({
  invalid,
  reconnecting,
  hostLeft,
  onExit,
}: {
  invalid: string | null;
  reconnecting: boolean;
  hostLeft: boolean;
  onExit: () => void;
}) {
  if (!invalid && !reconnecting && !hostLeft) return null;
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <InvalidBanner invalid={invalid} />
      <ConnectionNotices
        reconnecting={reconnecting}
        hostLeft={hostLeft}
        onExit={onExit}
      />
    </div>
  );
}

/** 온라인 판의 연결 알림 한 묶음: 방장이 나갔으면 「처음으로」, 끊겼으면 다시 잇는 중 */
export function ConnectionNotices({
  reconnecting,
  hostLeft,
  onExit,
  floating = false,
}: {
  reconnecting: boolean;
  hostLeft: boolean;
  onExit: () => void;
  floating?: boolean;
}) {
  if (hostLeft) return <HostLeftNotice onExit={onExit} floating={floating} />;
  if (reconnecting) return <ReconnectingNotice floating={floating} />;
  return null;
}
