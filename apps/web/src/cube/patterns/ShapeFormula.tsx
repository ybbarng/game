"use client";

import { cn } from "@/lib/cn";
import { MoveChip, useMoveKeys } from "../components/MoveChip";
import { algTokens } from "../learn/notation";
import type { ShapeStart } from "./race";

/**
 * 모양 만들기의 「공식 보기」(혼자 하기·대결이 함께 쓴다, docs/47 9-10). 누르면 목표 모양의 공식(`data.ts`)이
 * 지금 키 배치의 키와 함께 보인다(휴대폰은 표기만). 섞인 큐브에서 시작하면 맞춘 뒤에 칠 공식이라고 알린다.
 * 컴퓨터는 늘 공식을 안다: 공식을 모르는 사람도 겨룰 수 있게 둔 화면 도움이고 판정에는 끼지 않는다
 */
export function ShapeFormula({
  n,
  alg,
  start,
  open,
  onToggle,
  className,
}: {
  n: number;
  alg: string;
  start: ShapeStart;
  open: boolean;
  onToggle: (open: boolean) => void;
  className?: string;
}) {
  const { keysOf } = useMoveKeys(n);
  return (
    <div
      data-cube-shape-formula={open ? "open" : "closed"}
      className={cn("flex min-w-0 flex-col items-start gap-1", className)}
    >
      <button
        type="button"
        data-cube-shape-formula-toggle
        aria-expanded={open}
        onClick={(e) => {
          onToggle(!open);
          // 단추에 남은 초점이 큐브 키를 가로채지 않게
          e.currentTarget.blur();
        }}
        className={`rounded-lg px-2.5 py-1 font-semibold text-xs ${
          open
            ? "bg-violet-300/25 text-violet-50"
            : "bg-violet-300 text-black hover:bg-violet-200"
        }`}
      >
        {open ? "공식 숨기기" : "공식 보기"}
      </button>
      {open && (
        <>
          <p data-cube-shape-alg={alg} className="flex flex-wrap gap-1 text-xs">
            {algTokens(alg).map((t, i) => (
              <MoveChip
                // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                key={`${i}-${t}`}
                notation={t}
                keysOf={keysOf}
                className="rounded bg-white/10 px-1 py-0.5 font-semibold"
              />
            ))}
          </p>
          {start === "scrambled" && (
            <span
              data-cube-shape-formula-note
              className="break-keep text-violet-100/70 text-xs"
            >
              먼저 다 맞춘 뒤에 치는 공식이에요.
            </span>
          )}
        </>
      )}
    </div>
  );
}
