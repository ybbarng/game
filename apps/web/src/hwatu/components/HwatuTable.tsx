"use client";

import type { CSSProperties, ReactNode, Ref } from "react";

import { ChatBox } from "@/components/ChatBox";
import {
  type CardFlights,
  FlightLayer,
  FlightScope,
  HWATU_CARD,
} from "@/components/card-fx";
import {
  MissionOverlay,
  type MissionProps,
} from "@/components/tutorial/MissionOverlay";
import type { Rect } from "@/layout/compute-layout";
import { cn } from "@/lib/cn";
import { useChat } from "@/net/chat";

/*
 * 화투 둘러앉은 판(고스톱·민화투·나이롱뽕)이 함께 쓰는 틀(docs/05 4.11): 무대, 위 막대(채팅 단추·채팅 창),
 * 가운데 판, 판 끝 결과 상자, 판 끝 검증 줄. 자리는 `hwatuLayout`이 정하고, 판 안 내용은 게임마다 넣는다
 */

/** 튜토리얼 미션 띠 자리(판 위에 따로 둔다) */
const MISSION_INSET = 64;

/** 사각형 자리를 절대 좌표 스타일로 */
export const at = (r: Rect): CSSProperties => ({
  left: r.x,
  top: r.y,
  width: r.w,
  height: r.h,
});

/** 화면 전체 무대. `stageRef`가 붙은 층의 크기로 배치를 계산한다(`useStageSize`) */
export function HwatuStage({
  game,
  background,
  mission,
  stageRef,
  handlers,
  fx,
  children,
}: {
  /** `data-game` 값 */
  game: string;
  background: string;
  mission?: MissionProps | undefined;
  stageRef: Ref<HTMLDivElement>;
  /** 손패 조작(`useHandControls`)처럼 무대에 붙일 이벤트 */
  handlers?: Record<string, unknown>;
  /** 장면 연출 줄(`useHwatuFlights`). 무대 안에 겉그림을 그리고, 날아오는 카드를 가린다 */
  fx: CardFlights;
  children: ReactNode;
}) {
  const inset = mission ? MISSION_INSET : 0;
  return (
    <main
      data-game={game}
      className={cn(
        "relative h-dvh w-full overflow-hidden text-white",
        background,
      )}
    >
      {mission && <MissionOverlay mission={mission} top={8} />}
      <div
        ref={stageRef}
        className="relative h-dvh w-full"
        style={
          inset > 0
            ? { marginTop: inset, height: `calc(100dvh - ${inset}px)` }
            : undefined
        }
        {...handlers}
      >
        <FlightScope fx={fx}>
          {children}
          {/* 옮겨 가는 카드는 판 위 다른 것 위로(물음 창·결과 상자 아래) */}
          <FlightLayer fx={fx} kind={HWATU_CARD} className="z-[60]" />
        </FlightScope>
      </div>
    </main>
  );
}

/**
 * 위 막대: 나가기 단추, 판 정보, 온라인이면 채팅 단추(하트처럼 눌러 연다). 채팅 창은 막대 바로 아래 오른쪽에 뜬다
 */
export function HwatuHud({
  rect,
  title,
  onExit,
  info,
  online,
  mySeat,
}: {
  rect: Rect;
  /** 나가기 단추 글(「← 민화투」) */
  title: string;
  onExit: () => void;
  info: ReactNode;
  online: boolean;
  mySeat: number;
}) {
  const chatOpen = useChat((s) => s.open);
  const setChatOpen = useChat((s) => s.setOpen);
  const chatUnread = useChat((s) => s.unread);
  return (
    <>
      <header
        className="absolute flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-xl bg-black/30 px-3 text-sm"
        style={at(rect)}
      >
        <button
          type="button"
          onClick={onExit}
          className="shrink-0 text-white/70 hover:text-white"
        >
          {title}
        </button>
        <span className="ml-auto min-w-0 truncate text-right text-white/60 text-xs">
          {info}
        </span>
        {online && (
          <button
            type="button"
            onClick={() => setChatOpen(!chatOpen)}
            className="relative shrink-0 rounded-lg bg-white/10 px-1.5 py-0.5 text-xs hover:bg-white/20"
          >
            채팅
            {chatUnread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] leading-4">
                {chatUnread}
              </span>
            )}
          </button>
        )}
      </header>
      {online && chatOpen && (
        <div
          className="absolute right-3 z-[380] w-[min(92%,22rem)] rounded-2xl border border-white/15 bg-[#0a3622]/95 p-3 shadow-2xl backdrop-blur"
          style={{ top: rect.y + rect.h + 6 }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-sm">채팅</span>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="rounded bg-white/10 px-2 text-xs"
            >
              닫기
            </button>
          </div>
          <ChatBox mySeat={mySeat} />
        </div>
      )}
    </>
  );
}

/**
 * 가운데 판. `children`은 바닥·더미처럼 판 위에 펼치는 것(판이 끝나면 흐려진다), `footer`는 판 아래쪽 글(지난
 * 걸음·상태 줄), `overlay`는 판 위에 띄우는 것(판 끝 결과 상자, 결과 띠)
 */
export function HwatuBoard({
  rect,
  dim,
  children,
  footer,
  overlay,
  label = "판",
}: {
  rect: Rect;
  dim: boolean;
  children: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className="absolute rounded-[2rem] border border-white/10 bg-black/15 shadow-[inset_0_0_48px_rgba(0,0,0,0.35)]"
      style={at(rect)}
    >
      <div
        className={cn(
          "flex h-full items-center gap-3 px-3 pt-2 pb-12 transition-opacity",
          dim && "opacity-25",
        )}
      >
        {children}
      </div>
      {footer && (
        <div className="absolute inset-x-2 bottom-1 flex flex-col items-center text-sm">
          {footer}
        </div>
      )}
      {overlay}
    </section>
  );
}

/**
 * 판 끝 결과 상자: 흐린 판 위에 띄운다(무대 위 `rect`, 보통 `endBoxRect`). 상자가 낮고 넓으면(휴대폰 가로)
 * 결과와 점수표를 옆으로 나란히 놓는다. 판(`HwatuBoard`) 밖, 무대에 바로 놓는다
 */
export function HwatuEndBox({
  rect,
  main,
  side,
}: {
  rect: Rect;
  /** 결과·단추 */
  main: ReactNode;
  /** 점수표·검증 줄 */
  side: ReactNode;
}) {
  const wide = rect.w > rect.h * 1.8;
  // 안쪽 상자를 m-auto로 가운데 둔다. 넘치면 위가 잘리지 않고 굴려 볼 수 있다(items-center는 위를 잘랐다)
  return (
    <div
      className="pop-in absolute z-[200] flex overflow-y-auto rounded-[2rem] bg-black/60 p-2 backdrop-blur-sm"
      style={at(rect)}
    >
      <div
        className={cn(
          "m-auto flex w-full items-center justify-center gap-2",
          wide ? "flex-row" : "flex-col",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col items-center gap-2",
            wide
              ? "flex-1 [&_[role=status]]:text-xl"
              : "[&_[role=status]]:text-2xl",
          )}
        >
          {main}
        </div>
        <div
          className={cn(
            "flex w-full max-w-md flex-col gap-1",
            wide && "min-w-0 flex-1",
          )}
        >
          {side}
        </div>
      </div>
    </div>
  );
}

/** 판 끝 검증 결과 줄. 채팅을 닫아 두어도 결과 곁에 보인다 */
export function HwatuVerifyLines() {
  const messages = useChat((s) => s.messages);
  return (
    <>
      {messages
        .filter((m) => m.seat < 0 && m.name === "검증")
        .map((m) => (
          <p key={m.id} className="text-white/75 text-xs">
            [{m.name}] {m.text}
          </p>
        ))}
    </>
  );
}

/** 온라인 판 위쪽 알림: 암호화방 띠와 연결 끊김 */
export function HwatuOnlineNotes({
  rect,
  children,
  reconnecting,
  hostLeft,
}: {
  rect: Rect;
  children: ReactNode;
  reconnecting: boolean;
  hostLeft: boolean;
}) {
  return (
    <div
      className="absolute z-[230] flex flex-col items-center gap-1"
      style={{ left: rect.x, width: rect.w, top: rect.y + 6 }}
    >
      {children}
      {(reconnecting || hostLeft) && (
        <p
          role="alert"
          className="rounded-xl bg-rose-700/90 px-3 py-1.5 text-center text-sm"
        >
          {hostLeft
            ? "방장이 방을 나갔습니다"
            : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
        </p>
      )}
    </div>
  );
}

export const HWATU_BUTTON = "rounded-xl px-4 py-2 text-sm";
export const HWATU_PRIMARY = cn(
  HWATU_BUTTON,
  "bg-amber-300 font-semibold text-black",
);
export const HWATU_SECONDARY = cn(
  HWATU_BUTTON,
  "bg-white/10 disabled:opacity-40",
);
