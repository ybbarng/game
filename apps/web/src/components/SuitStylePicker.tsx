"use client";

import { useSettings } from "@/game/settings";
import { SUIT_STYLES } from "@/game/suit-style";
import { Chips } from "./options/Chip";
import { SuitText } from "./SuitText";

/** 미리 보기 문구: 헷갈리기 쉬운 ♠·♣, ♥·◆가 모두 들어 있다 */
const SAMPLE = "♠13 · ♣A · ♥Q · ◆K";

/** 무늬 표기 고르기. 옵션 화면과 게임 중 설정 메뉴(마이티·하트)가 함께 쓴다 */
export function SuitStylePicker({ detail = false }: { detail?: boolean }) {
  const style = useSettings((s) => s.suitStyle);
  const setStyle = useSettings((s) => s.setSuitStyle);
  const current = SUIT_STYLES.find((o) => o.value === style);
  return (
    <div className="flex flex-col gap-1.5">
      <Chips options={SUIT_STYLES} value={style} onChange={setStyle} />
      <p className="rounded-lg bg-black/30 px-2 py-1 text-sm" data-suit-sample>
        <SuitText text={SAMPLE} />
      </p>
      {detail && current && (
        <p className="text-xs opacity-60">
          <SuitText text={current.description} style={current.value} />
        </p>
      )}
    </div>
  );
}
