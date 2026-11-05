"use client";

import type { Card } from "@game/mighty-engine";

import { useCardTheme } from "@/game/settings";
import { HwatuCardView } from "@/hwatu/components/HwatuCard";

import { CardArt } from "../card-art/CardArt";
import { type CardKind, cardHeight, HWATU_SHAPE, PLAYING_SHAPE } from "./kind";

/** 트럼프 겉그림 한 장(고른 카드 그림 테마로) */
function PlayingArt({ card, w }: { card: Card | null; w: number }) {
  const theme = useCardTheme();
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-[6.4%] shadow-md"
      style={{ width: w, height: cardHeight(PLAYING_SHAPE, w) }}
    >
      <CardArt card={card} theme={theme} />
    </span>
  );
}

/** 트럼프(마이티·하트, 원카드는 조커 그림만 바꿔 쓴다) */
export const PLAYING_CARD: CardKind<Card> = {
  ...PLAYING_SHAPE,
  renderFace: (card, w) => <PlayingArt card={card} w={w} />,
  renderBack: (w) => <PlayingArt card={null} w={w} />,
};

/** 화투(고스톱·민화투·나이롱뽕) */
export const HWATU_CARD: CardKind = {
  ...HWATU_SHAPE,
  renderFace: (id, w) => <HwatuCardView id={id} width={w} decorative />,
  renderBack: (w) => <HwatuCardView faceDown width={w} decorative />,
};
