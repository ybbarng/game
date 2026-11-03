"use client";

import { useState } from "react";
import { BOARD_BUTTON } from "./ResignButton";

/**
 * 판 게임 혼자 하기의 힌트 상태. `showHint`로 고수가 고른 수를 담고,
 * `resetKey`(보통 둔 수 개수)가 바뀌면, 곧 수가 오가면 저절로 지운다.
 * 수를 고르는 함수와 판 위에 그리는 모양은 게임마다 다르니 게임이 맡는다.
 */
export function useHint<T>(resetKey: unknown): {
  hint: T | null;
  showHint: (hint: T) => void;
} {
  const [hint, setHint] = useState<T | null>(null);
  // resetKey가 바뀌면(수가 오가거나 무르면) 힌트를 지운다. 무르기로 같은 수 개수에 돌아와도 다시 뜨지 않는다.
  const [seenKey, setSeenKey] = useState(resetKey);
  if (!Object.is(seenKey, resetKey)) {
    setSeenKey(resetKey);
    setHint(null);
  }
  return { hint, showHint: setHint };
}

/**
 * 판 게임의 「힌트」 단추. 혼자 하기에서, 미션이 아니고, 내 차례일 때만 보인다.
 * 누르면 게임이 고수 수를 골라 `useHint`의 `showHint`에 넘긴다.
 * 새 판 게임도 힌트를 넣을 때 이 단추를 쓴다(docs/21).
 */
export function HintButton({
  online,
  mission,
  myTurn,
  onHint,
}: {
  /** 온라인 대전이면 숨긴다 */
  online: boolean;
  /** 튜토리얼 미션이면 숨긴다 */
  mission: boolean;
  myTurn: boolean;
  onHint: () => void;
}) {
  if (online || mission || !myTurn) return null;
  return (
    <button type="button" onClick={onHint} className={BOARD_BUTTON}>
      힌트
    </button>
  );
}
