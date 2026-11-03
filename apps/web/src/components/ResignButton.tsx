"use client";

import { useState } from "react";

/** 판 게임 단추의 기본 모양(무르기·힌트·쉬기와 같은 회색 단추) */
export const BOARD_BUTTON = "rounded-xl bg-white/10 px-4 py-2";

/**
 * 판 게임의 「기권」 단추. 잘못 누른 손가락으로 판을 잃지 않게 한 번 더 묻는다:
 * 「기권」 → 「정말 기권할까요? [기권하기] [계속 두기]」.
 *
 * 묻는 상태는 안에서 갖는다. `resetKey`(보통 둔 수 개수)가 바뀌면, 곧 수가 오가면 묻기를 닫는다.
 * 새 판 게임도 이 단추를 쓴다(docs/21).
 */
export function ResignButton({
  onResign,
  resetKey,
  className = BOARD_BUTTON,
  keepLabel = "계속 두기",
  onAsk,
}: {
  onResign: () => void;
  /** 수가 오갔는지 알리는 값. 바뀌면 묻기를 닫는다 */
  resetKey: unknown;
  /** 「기권」·「계속 두기」 단추 모양(게임마다 회색 단추 모양이 조금 다르다) */
  className?: string;
  /** 묻기를 닫는 단추 글(두는 게임이 아니면 「계속 하기」 등) */
  keepLabel?: string;
  /** 「기권」을 눌러 묻기 시작할 때(오목은 겨눈 자리를 푼다) */
  onAsk?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  // resetKey가 바뀌면(수가 오가거나 무르면) 묻기를 지운다. 무르기로 같은 수 개수에 돌아와도 다시 뜨지 않는다.
  const [seenKey, setSeenKey] = useState(resetKey);
  if (!Object.is(seenKey, resetKey)) {
    setSeenKey(resetKey);
    setAsking(false);
  }

  if (!asking)
    return (
      <button
        type="button"
        onClick={() => {
          onAsk?.();
          setAsking(true);
        }}
        className={className}
      >
        기권
      </button>
    );
  return (
    <span className="flex w-full items-center justify-center gap-2">
      <span className="text-sm text-white/80">정말 기권할까요?</span>
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onResign();
        }}
        className="rounded-xl bg-rose-600 px-4 py-2 font-semibold"
      >
        기권하기
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className={className}
      >
        {keepLabel}
      </button>
    </span>
  );
}
