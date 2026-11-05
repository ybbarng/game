import type { ReactNode } from "react";

import { CardChip } from "@/review/CardChip";

/**
 * 다시 보기에서 펼친 다른 사람 손패. 손패 뒷면은 자리 판 뒤에 작게 깔려 앞면으로 바꿔도 안 보여서,
 * 자리 판 바로 아래에 카드 칩으로 늘어놓는다. 마이티·하트 카드가 아니면(원카드·화투) `renderCard`로
 * 한 장씩 그린다
 */
export function OpenHand({
  cards,
  rect,
  renderCard,
}: {
  cards: readonly string[];
  rect: { x: number; y: number; w: number; h: number };
  /** 카드 한 장 그리기. 없으면 마이티 카드 칩(`CardChip`) */
  renderCard?: (card: string) => ReactNode;
}) {
  if (cards.length === 0) return null;
  return (
    <div
      data-open-hand
      className="pointer-events-none absolute z-[120] flex flex-wrap justify-center gap-0.5 rounded-lg bg-black/55 p-1"
      style={{ left: rect.x, top: rect.y + rect.h + 4, width: rect.w }}
    >
      {cards.map((card) =>
        renderCard ? (
          <span key={card} className="inline-flex">
            {renderCard(card)}
          </span>
        ) : (
          <CardChip key={card} card={card} />
        ),
      )}
    </div>
  );
}
