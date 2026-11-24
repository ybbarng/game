"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** 판 게임 단추의 기본 모양(무르기·힌트·쉬기와 같은 회색 단추) */
export const BOARD_BUTTON = "rounded-xl bg-white/10 px-4 py-2";

/**
 * 판 게임의 「기권」 단추. 잘못 누른 손가락으로 판을 잃지 않게 한 번 더 묻는다:
 * 「기권」 → 「정말 기권할까요? [기권하기] [계속하기]」.
 *
 * 묻는 상태는 안에서 갖는다. `resetKey`(보통 둔 수 개수)가 바뀌면, 곧 수가 오가면 묻기를 닫는다.
 * 새 게임도 이 단추를 쓴다(docs/21). 묻는 자리가 단추와 떨어져 있어야 하면(원카드: 머리줄 단추, 손패 위 묻기)
 * 묻기만 `ResignConfirm`으로 그린다.
 */
export function ResignButton({
  onResign,
  resetKey,
  className = BOARD_BUTTON,
  onAsk,
}: {
  onResign: () => void;
  /** 수가 오갔는지 알리는 값. 바뀌면 묻기를 닫는다 */
  resetKey: unknown;
  /** 「기권」·「계속하기」 단추 모양(게임마다 회색 단추 모양이 조금 다르다) */
  className?: string;
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
    <ResignConfirm
      onResign={() => {
        setAsking(false);
        onResign();
      }}
      onKeep={() => setAsking(false)}
      keepClassName={className}
    />
  );
}

/** 기권을 한 번 더 묻는 줄: 「정말 기권할까요? [기권하기] [계속하기]」(모든 게임이 같은 글) */
export function ResignConfirm({
  onResign,
  onKeep,
  keepClassName = BOARD_BUTTON,
  className,
}: {
  onResign: () => void;
  onKeep: () => void;
  keepClassName?: string;
  /** 줄 바깥 모양(판 위에 띄울 때 바탕 등) */
  className?: string;
}) {
  return (
    <span
      className={cn("flex w-full items-center justify-center gap-2", className)}
    >
      <span className="text-sm text-white/80">정말 기권할까요?</span>
      <button
        type="button"
        onClick={onResign}
        className="rounded-xl bg-rose-600 px-4 py-2 font-semibold"
      >
        기권하기
      </button>
      <button type="button" onClick={onKeep} className={keepClassName}>
        계속하기
      </button>
    </span>
  );
}
