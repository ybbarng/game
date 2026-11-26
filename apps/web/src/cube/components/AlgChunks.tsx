"use client";

import type { AlgChunk } from "../learn/types";
import { MoveText } from "./MoveChip";

/**
 * 공식의 짜임(docs/47 16-31): 덩어리마다 수와 그 덩어리가 조각을 어떻게 옮기는지를 나란히 보인다. 공식을 가르치는
 * 쪽(시연·따라 하기)에서 공식 아래에 둔다. 해 보기 쪽은 공식을 숨기므로 두지 않는다.
 */
export function AlgChunks({
  chunks,
  n,
  keys,
}: {
  chunks: readonly AlgChunk[];
  n: number;
  /** 수 옆에 내 키캡을 붙인다(시연 「보기」 상태에서는 끈다) */
  keys: boolean;
}) {
  return (
    <ol
      data-alg-chunks
      className="flex flex-col gap-1.5 rounded-xl bg-black/25 p-3 text-sm"
    >
      {chunks.map((c, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: 같은 덩어리가 되풀이될 수 있다
          key={i}
          data-alg-chunk={c.moves}
          className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3"
        >
          <span className="shrink-0 font-mono">
            <span className="mr-1.5 text-sky-300 text-xs">{i + 1}</span>
            <MoveText text={c.moves} n={n} keys={keys} />
          </span>
          <span className="break-keep text-white/80 wrap-anywhere">
            {c.says}
          </span>
        </li>
      ))}
    </ol>
  );
}
