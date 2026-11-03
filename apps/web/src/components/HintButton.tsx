"use client";

import { useCallback, useRef, useState } from "react";
import { BOARD_BUTTON } from "./ResignButton";

/**
 * 판 게임 혼자 하기의 힌트 상태. `showHint`로 고수가 고른 수를 담고,
 * `resetKey`(보통 둔 수 개수)가 바뀌면, 곧 수가 오가면 저절로 지운다.
 * 수를 고르는 함수와 판 위에 그리는 모양은 게임마다 다르니 게임이 맡는다.
 * 고수 계산은 워커에서 하므로(`adviseWith`) `ask`로 맡기면, 세는 동안 `thinking`이고
 * 답이 오기 전에 수가 오가면(무르기 포함) 그 답은 버린다.
 */
export function useHint<T>(resetKey: unknown): {
  hint: T | null;
  showHint: (hint: T) => void;
  thinking: boolean;
  ask: <A>(think: () => Promise<A>, use: (answer: A) => void) => void;
} {
  const [hint, setHint] = useState<T | null>(null);
  const [thinking, setThinking] = useState(false);
  // resetKey가 바뀌면(수가 오가거나 무르면) 힌트를 지운다. 무르기로 같은 수 개수에 돌아와도 다시 뜨지 않는다.
  // 판이 바뀐 횟수. 늦게 온 답이 지난 판의 것인지 가린다.
  // 그리는 중 resetKey가 바뀐 그 자리에서 올려, 수가 오간 직후 늦은 힌트가 지난 판에 뜰 틈을 없앤다.
  const epoch = useRef(0);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (!Object.is(seenKey, resetKey)) {
    epoch.current++;
    setSeenKey(resetKey);
    setHint(null);
    setThinking(false);
  }
  const ask = useCallback(
    <A,>(think: () => Promise<A>, use: (answer: A) => void) => {
      const at = epoch.current;
      setThinking(true);
      think().then(
        (answer) => {
          if (epoch.current !== at) return;
          setThinking(false);
          use(answer);
        },
        (err: unknown) => {
          if (epoch.current === at) setThinking(false);
          console.error("힌트 계산 실패", err);
        },
      );
    },
    [],
  );
  return { hint, showHint: setHint, thinking, ask };
}

/**
 * 판 게임의 「힌트」 단추. 혼자 하기에서, 미션이 아니고, 내 차례일 때만 보인다.
 * 누르면 게임이 고수 수를 골라 `useHint`의 `showHint`에 넘긴다. 세는 동안(`thinking`)은 「생각 중…」.
 * 새 판 게임도 힌트를 넣을 때 이 단추를 쓴다(docs/21).
 */
export function HintButton({
  online,
  mission,
  myTurn,
  thinking = false,
  onHint,
}: {
  /** 온라인 대전이면 숨긴다 */
  online: boolean;
  /** 튜토리얼 미션이면 숨긴다 */
  mission: boolean;
  myTurn: boolean;
  /** 고수가 세는 중(`useHint().thinking`) */
  thinking?: boolean;
  onHint: () => void;
}) {
  if (online || mission || !myTurn) return null;
  return (
    <button
      type="button"
      onClick={onHint}
      disabled={thinking}
      className={BOARD_BUTTON}
    >
      {thinking ? "생각 중…" : "힌트"}
    </button>
  );
}
