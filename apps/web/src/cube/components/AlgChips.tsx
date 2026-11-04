"use client";

import { cn } from "@/lib/cn";
import { algTokens } from "../learn";
import { MoveChip, type MoveKeysOf } from "./MoveChip";

/** 공식 한 줄을 수 칩(표기 + 사용자 키캡)으로. `keysOf`가 null이면(휴대폰) 표기만 */
export function AlgChips({
  alg,
  keysOf,
  className,
}: {
  alg: string;
  keysOf: MoveKeysOf | null;
  className?: string;
}) {
  return (
    <span
      data-alg-chips={alg}
      className={cn("flex flex-wrap items-center gap-1", className)}
    >
      {algTokens(alg).map((tok, i) => (
        <MoveChip
          // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
          key={i}
          notation={tok}
          keysOf={keysOf}
          className="rounded bg-white/10 px-1"
        />
      ))}
    </span>
  );
}
