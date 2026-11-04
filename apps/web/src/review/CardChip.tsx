import type { Card } from "@game/mighty-engine";
import { SuitText } from "@/components/SuitText";
import { cardLabel } from "@/game/terms";
import { cn } from "@/lib/cn";

/**
 * 복기 표의 작은 카드 글자(빨강·검정 무늬). 마이티·하트 카드가 기본이고, 다른 카드(원카드 컬러 조커 등)는
 * `label`(보일 글자)과 `red`(빨간 글자)를 넘긴다
 */
export function CardChip({
  card,
  dim = false,
  strong = false,
  label,
  red,
}: {
  card: string;
  dim?: boolean;
  strong?: boolean;
  /** 보일 글자. 없으면 마이티 카드 이름(`cardLabel`) */
  label?: string;
  /** 빨간 글자로. 없으면 ♥·♦면 빨강 */
  red?: boolean;
}) {
  const isRed = red ?? (card.startsWith("H") || card.startsWith("D"));
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded bg-white px-1 font-semibold text-[11px] leading-5 tabular-nums",
        isRed ? "text-red-600" : "text-black",
        dim && "opacity-40",
        strong && "ring-2 ring-amber-300",
      )}
    >
      <SuitText text={label ?? cardLabel(card as Card)} />
    </span>
  );
}
