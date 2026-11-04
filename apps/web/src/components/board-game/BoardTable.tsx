import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * 판 게임(오목·바둑·장기·체스)의 「마주 앉은 대국」 틀.
 * 판을 가운데 크게 두고, 상대 자리는 판 너머(맞은편), 내 자리는 내 쪽에 둔다.
 *
 * - 세로 화면(휴대폰 세로): 위에서부터 머리줄 · 상대 자리 · 판 · 내 자리 · 상태 · 단추 · 대화.
 *   상대 자리와 내 자리는 판과 같은 너비로 판 위아래 가장자리에 붙는다. 남는 높이는 위아래로 나눠 판을 화면 가운데에 둔다.
 * - 가로 화면(PC·휴대폰 가로): 판이 화면 높이를 꽉 채우고, 오른쪽 기둥 맨 위에 상대 자리(판 위 가장자리와 같은 높이),
 *   맨 아래에 내 자리(판 아래 가장자리와 같은 높이)를 둔다. 단추는 내 자리 바로 위, 상태·대화는 그 사이.
 *
 * 한 DOM 차례로 두 배치를 함께 그린다: 세로에서는 오른쪽 기둥을 `contents`로 풀어 `order`로 줄을 세우고,
 * 가로에서는 기둥이 세로 flex가 되어 DOM 차례대로 쌓인다.
 */
export function BoardTable({
  game,
  aspect = 1,
  reserve = "16.5rem",
  mission = false,
  overlay,
  header,
  alerts,
  opponent,
  board,
  me,
  status,
  actions,
  chat,
}: {
  /** `main`의 `data-game` */
  game: string;
  /** 판의 너비 ÷ 높이(장기 판은 0.9) */
  aspect?: number;
  /** 세로 화면에서 판 말고 다른 줄들이 쓰는 높이. 자리판에 잡은 말 줄이 있으면 늘린다 */
  reserve?: string;
  /** 튜토리얼 미션 띠가 위에 놓이면 그만큼 비운다 */
  mission?: boolean;
  /** 맨 위에 떠 있는 것(미션 띠) */
  overlay?: ReactNode;
  header: ReactNode;
  alerts?: ReactNode;
  opponent: ReactNode;
  /** 판. 감싸는 상자가 너비·비율을 정하고 `relative`라 결과 띠를 함께 넣을 수 있다 */
  board: ReactNode;
  me: ReactNode;
  status: ReactNode;
  actions: ReactNode;
  chat?: ReactNode;
}) {
  const style = {
    "--bt-aspect": aspect,
    "--bt-reserve": reserve,
    "--bt-top": mission ? "4rem" : "0rem",
  } as CSSProperties;
  // 세로·가로 모두에서 판(그리고 세로에서는 자리판) 너비
  const width = cn(
    "w-full",
    "[--bt-w:min(calc(100vw-2rem),40rem,calc((100dvh-var(--bt-reserve)-var(--bt-top))*var(--bt-aspect)))]",
    "landscape:[--bt-w:min(calc((100dvh-1.5rem-var(--bt-top))*var(--bt-aspect)),calc(100vw-22rem))]",
  );
  /** 세로에서 판과 같은 너비로 줄을 맞추는 칸 */
  const row = "w-(--bt-w) landscape:w-full";
  return (
    <main
      data-game={game}
      data-board-table
      style={style}
      className={cn(
        width,
        "relative flex min-h-dvh flex-col items-center gap-2 bg-[#1c1917] px-4 py-3 text-white",
        "landscape:flex-row landscape:items-center landscape:justify-center landscape:gap-6",
        mission && "pt-16",
      )}
    >
      {overlay}
      <div
        className="relative order-5 shrink-0 landscape:order-none"
        style={{ width: "var(--bt-w)", aspectRatio: aspect }}
      >
        {board}
      </div>
      <div className="contents landscape:flex landscape:h-[calc(var(--bt-w)/var(--bt-aspect))] landscape:w-72 landscape:shrink-0 landscape:flex-col landscape:gap-2">
        {/* 세로 화면에서 머리줄부터 단추까지 한 무리로 화면 가운데에 둔다 */}
        <div aria-hidden className="order-1 flex-1 landscape:hidden" />
        <div className={cn(row, "order-2 landscape:order-none")}>{header}</div>
        {alerts && (
          <div className={cn(row, "order-3 landscape:order-none")}>
            {alerts}
          </div>
        )}
        <div className={cn(row, "order-4 landscape:order-none")}>
          {opponent}
        </div>
        <div className={cn(row, "order-7 landscape:order-none")}>{status}</div>
        {chat && (
          <div
            className={cn(
              row,
              "order-9 landscape:order-none landscape:min-h-0 landscape:flex-1 landscape:overflow-y-auto",
            )}
          >
            {chat}
          </div>
        )}
        {!chat && (
          <div
            aria-hidden
            className="hidden landscape:block landscape:flex-1"
          />
        )}
        <div className={cn(row, "order-8 landscape:order-none")}>{actions}</div>
        <div className={cn(row, "order-6 landscape:order-none")}>{me}</div>
        <div aria-hidden className="order-10 flex-1 landscape:hidden" />
      </div>
    </main>
  );
}

/**
 * 판 게임 자리판: 돌·말 표시, 이름(과 컴퓨터 단계), 이긴 판 수 같은 점수, 잡은 것, 대국 시계, 차례 빛.
 * 시계는 실제 대국 시계처럼 자리판 바깥쪽 끝에 크게 둔다
 */
export function BoardSeat({
  who,
  token,
  name,
  detail,
  turn,
  clock,
  score,
  extra,
}: {
  /** 내 자리인가 상대 자리인가(`data-seat`) */
  who: "me" | "opponent";
  /** 돌·말 그림 */
  token: ReactNode;
  name: string;
  /** 이름 아래 작은 줄(잡은 말, 따낸 돌 등) */
  detail?: ReactNode;
  /** 이 자리가 둘 차례인가 */
  turn: boolean;
  clock?: ReactNode;
  /** 이름 옆 작은 점수(예: "1승") */
  score?: ReactNode;
  /** 시계 앞에 더 놓을 것 */
  extra?: ReactNode;
}) {
  return (
    <section
      data-seat={who}
      data-turn={turn || undefined}
      aria-label={who === "me" ? "내 자리" : "상대 자리"}
      className={cn(
        "flex min-h-12 w-full items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-[box-shadow,background-color,border-color] duration-300",
        turn
          ? "border-amber-300 bg-amber-300/15 shadow-[0_0_18px_rgba(253,230,138,0.35)]"
          : "border-white/10 bg-white/5",
      )}
    >
      <span className="shrink-0">{token}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold text-sm">{name}</span>
          {score !== undefined && (
            <span className="shrink-0 text-white/70 text-xs">{score}</span>
          )}
        </div>
        {detail && <div className="text-white/60 text-xs">{detail}</div>}
      </div>
      {extra}
      {clock && <span className="shrink-0">{clock}</span>}
    </section>
  );
}
