"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

/** 「큐브의 수학」 카드들이 함께 쓰는 작은 조각 */

export function Quiz({
  id,
  question,
  choices,
  answer,
  why,
  onSolved,
}: {
  id: string;
  question: string;
  choices: readonly string[];
  answer: number;
  why: string;
  onSolved?: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div
      className="flex flex-col gap-2 rounded-xl bg-black/25 p-3"
      data-math-quiz={id}
      data-solved={picked === answer ? "" : undefined}
    >
      <p className="break-keep font-semibold text-sm">{question}</p>
      <div className="flex flex-col gap-1.5">
        {choices.map((c, i) => (
          <button
            key={c}
            type="button"
            data-choice={i}
            onClick={() => {
              setPicked(i);
              if (i === answer) onSolved?.();
            }}
            className={cn(
              "rounded-lg px-3 py-2 text-left text-sm",
              picked === i
                ? i === answer
                  ? "bg-emerald-500/30"
                  : "bg-red-500/30"
                : "bg-white/5 hover:bg-white/10",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      {picked !== null && (
        <p role="status" className="break-keep text-white/80 text-xs">
          {picked === answer ? "맞아요! " : "다시 골라 보세요. "}
          {picked === answer && why}
        </p>
      )}
    </div>
  );
}

/**
 * 표기 읽는 법. 표기가 처음 나오는 「뽑아서 다시 끼우면」 카드에서는 펼쳐 두고, 뒤 카드에서는 접어 둔다
 * (카드 차례 단추로 바로 넘어온 사람도 찾아 읽을 수 있게).
 */
export function Notation({ open = false }: { open?: boolean }) {
  return (
    <details
      open={open}
      className="rounded-xl bg-black/25 p-3 text-sm text-white/85"
      data-math-notation
    >
      <summary className="cursor-pointer font-semibold">
        표기 읽는 법(R, U', UFR …)
      </summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 break-keep pl-5">
        <li>
          면 이름은 영어 머리글자예요. U 위 · D 아래 · F 앞 · B 뒤 · R 오른쪽 ·
          L 왼쪽.
        </li>
        <li>
          <b className="font-mono">R</b>은 오른쪽 면을, 그 면을 마주 볼 때 시계
          방향으로 90° 돌려요. <b className="font-mono">R'</b>은 반대 방향으로
          90°, <b className="font-mono">R2</b>는 반 바퀴(180°)예요.{" "}
          <b className="font-mono">M</b>은 L과 R 사이의 가운데 층을 L과 같은
          방향으로 돌려요.
        </li>
        <li>
          한 번 돌리는 것을 한 「수」라고 세요. 정해진 일을 하도록 수를 이어
          놓은 묶음을 「공식」이라고 해요.
        </li>
        <li>
          조각은 닿은 면의 글자를 이어 불러요. <b className="font-mono">UFR</b>
          은 위-앞-오른쪽 코너 블럭, <b className="font-mono">UF</b>는 위-앞
          엣지 블럭이에요.
        </li>
      </ul>
    </details>
  );
}

export function Big({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "break-all text-center font-bold font-mono text-2xl sm:text-3xl",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Source({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 break-keep border-white/10 border-t pt-2 text-[11px] text-white/45">
      {children}
    </p>
  );
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="break-keep text-sm text-white/85">{children}</p>;
}

/** 계기 하나: 이름, 값, 규칙을 지키는지 */
export function Meter({
  label,
  value,
  rule,
  ok,
  attr,
}: {
  label: string;
  value: React.ReactNode;
  rule: string;
  ok: boolean;
  attr?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border px-2 py-1.5",
        ok
          ? "border-emerald-400/40 bg-emerald-400/10"
          : "border-red-400/60 bg-red-500/15",
      )}
      data-meter={attr}
      data-ok={ok ? "" : undefined}
    >
      <span className="break-keep text-[11px] text-white/60">{label}</span>
      <span className="break-keep font-bold font-mono text-lg">{value}</span>
      <span className="break-keep text-[11px] text-white/70">
        {ok ? "✓" : "✗"} {rule}
      </span>
    </div>
  );
}

export function Pill({
  active,
  onClick,
  children,
  attr,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  attr?: Record<string, string>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...attr}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm",
        active ? "bg-sky-500 font-semibold text-black" : "bg-white/10",
      )}
    >
      {children}
    </button>
  );
}
