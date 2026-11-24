"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * 되돌릴 수 없는 일(지우기 등)을 한 번 더 묻는 단추. `ResignButton`처럼 두 단계:
 * 「지우기」 → 「정말 지울까요? [지우기] [취소]」.
 */
export function ConfirmButton({
  children,
  question,
  confirmLabel,
  onConfirm,
  className,
  "aria-label": ariaLabel,
  ...data
}: {
  /** 처음 단추 글(「지우기」, 「×」 등) */
  children: ReactNode;
  /** 묻는 글. 예: 「정말 지울까요?」 */
  question: string;
  /** 하겠다고 고르는 단추 글. 예: 「지우기」 */
  confirmLabel: string;
  onConfirm: () => void;
  /** 처음 단추 모양 */
  className?: string;
  "aria-label"?: string;
  [data: `data-${string}`]: string | boolean | undefined;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setAsking(true)}
        className={className}
        {...data}
      >
        {children}
      </button>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="text-white/80">{question}</span>
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        className={cn("rounded-lg bg-rose-600 px-2 py-1 font-semibold")}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="rounded-lg bg-white/10 px-2 py-1"
      >
        취소
      </button>
    </span>
  );
}
