"use client";

import {
  BLACK_JOKER,
  COLOR_JOKER,
  type OnecardCard,
} from "@game/onecard-engine";
import { useMemo } from "react";

import { CardArt } from "@/components/card-art/CardArt";
import type { CardTheme } from "@/components/card-art/themes";
import { type CardKind, cardHeight, PLAYING_CARD } from "@/components/card-fx";
import { useCardTheme } from "@/game/settings";
import { cn } from "@/lib/cn";

import { cardName } from "../cards";

/**
 * 원카드 카드 한 장. 그림은 마이티·하트와 같은 `CardArt`를 쓴다.
 * 조커가 둘이라 흑백 조커는 검은 원·흰 별, 컬러 조커는 붉은 원·금빛 별로 가른다
 * (마이티 카드 그림은 조커가 하나라 표기 "JK"로 그리고 색만 바꾼다)
 */
function useJokerTheme(card: OnecardCard | null): CardTheme {
  const theme = useCardTheme();
  return useMemo(() => {
    if (card === BLACK_JOKER)
      return {
        ...theme,
        id: `${theme.id}+bw`,
        joker: { field: theme.paper, disc: "#1c1f24", star: "#e5e7eb" },
      };
    if (card === COLOR_JOKER)
      return {
        ...theme,
        id: `${theme.id}+color`,
        joker: { field: "#fff7ed", disc: "#d42a2a", star: "#f2b705" },
      };
    return theme;
  }, [theme, card]);
}

export function OnecardCardView({
  card,
  width,
  playable = false,
  selected = false,
  dim = false,
  onClick,
  className,
  label,
  style,
  decorative = false,
}: {
  /** null이면 뒷면 */
  card: OnecardCard | null;
  width: number;
  /** 지금 낼 수 있다(손패) */
  playable?: boolean;
  /** 터치로 겨눈 카드 */
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  className?: string | undefined;
  /** 화면 읽기 이름(없으면 카드 이름) */
  label?: string;
  style?: React.CSSProperties | undefined;
  /** 연출용 겉그림: 화면 읽기·화면 시험(`data-card`)에 잡히지 않는다 */
  decorative?: boolean;
}) {
  const theme = useJokerTheme(card);
  const art = card === COLOR_JOKER ? "JK" : card;
  const height = Math.round(cardHeight(PLAYING_CARD, width));
  const name = label ?? (card ? cardName(card) : "뒷면 카드");
  const body = <CardArt card={art} theme={theme} />;
  if (decorative)
    return (
      <span
        aria-hidden
        className={cn("block shrink-0 rounded-[6.4%] shadow-md", className)}
        style={{ width, height, ...style }}
      >
        {body}
      </span>
    );
  if (!onClick)
    return (
      <span
        role="img"
        aria-label={name}
        data-card={card ?? undefined}
        className={cn("block shrink-0 rounded-[6.4%] shadow-md", className)}
        style={{ width, height, ...style }}
      >
        {body}
      </span>
    );
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={selected}
      data-card={card ?? undefined}
      data-playable={playable || undefined}
      onClick={onClick}
      className={cn(
        "block shrink-0 select-none rounded-[6.4%] p-0 shadow-md transition-transform duration-150",
        "focus-visible:outline-3 focus-visible:outline-amber-300",
        playable
          ? "cursor-pointer hover:-translate-y-2 shadow-[0_0_0_2px_#fbbf24]"
          : "cursor-default",
        selected &&
          "-translate-y-3 shadow-[0_0_0_3px_#fbbf24,0_0_16px_4px_rgba(251,191,36,0.6)]",
        dim && "brightness-[0.6] saturate-50",
        className,
      )}
      style={{ width, height, ...style }}
    >
      {body}
    </button>
  );
}

/** 원카드 카드 종류: 트럼프(`PLAYING_CARD`)에 두 조커 그림만 원카드 것으로 */
export const ONECARD_CARD: CardKind<OnecardCard> = {
  ...PLAYING_CARD,
  renderFace: (card, w) => <OnecardCardView card={card} width={w} decorative />,
};
