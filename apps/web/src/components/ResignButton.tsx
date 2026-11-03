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
}: {
  onResign: () => void;
  /** 수가 오갔는지 알리는 값. 바뀌면 묻기를 닫는다 */
  resetKey: unknown;
  /** 「기권」·「계속 두기」 단추 모양(게임마다 회색 단추 모양이 조금 다르다) */
  className?: string;
  /** 묻기를 닫는 단추 글(두는 게임이 아니면 「계속 하기」 등) */
  keepLabel?: string;
}) {
  // 물었을 때의 resetKey를 적어 두고, 지금 값과 같을 때만 묻는 중으로 본다(수가 오가면 저절로 닫힌다).
  const [askedAt, setAskedAt] = useState<{ key: unknown } | null>(null);
  const asking = askedAt !== null && Object.is(askedAt.key, resetKey);

  if (!asking)
    return (
      <button
        type="button"
        onClick={() => setAskedAt({ key: resetKey })}
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
          setAskedAt(null);
          onResign();
        }}
        className="rounded-xl bg-rose-600 px-4 py-2 font-semibold"
      >
        기권하기
      </button>
      <button
        type="button"
        onClick={() => setAskedAt(null)}
        className={className}
      >
        {keepLabel}
      </button>
    </span>
  );
}
