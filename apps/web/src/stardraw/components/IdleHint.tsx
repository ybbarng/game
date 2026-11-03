"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { FX } from "../fx-timing";
import { SKY_STARS, type SkyStar } from "../sky";

/**
 * 손짓 안내(2026-11-03 사용자): 사람이 물건을 밀거나 누르기를 기다리는데 손을 대지 않고 가만히 있으면, 글 없이 손짓만
 * 되풀이해 보인다. 예측서는 밀어 올리는 손짓(위쪽 문구가 「밀어 올려서」라서), 등록증은 누르는 손짓(내밀기는 한 번
 * 누르기로 충분하고, 누름 직후에만 패스키 창을 여는 브라우저가 있어 누르기가 가장 확실하다).
 * 손을 대면(누름·키) 곧바로 사라지고, 손을 뗀 뒤 다시 가만히 있으면 같은 시간 뒤 다시 나온다. 기다림이 끝나면 걷힌다
 */
export type IdleHintKind = "swipe-up" | "tap";

/**
 * 기다리는 동안(`active`) 손을 대지 않고 `delay`가 지났는지. 누르고 있는 동안(끄는 중)에는 세지 않고, 손을 떼면
 * 처음부터 센다. 시간은 window.setTimeout이라 시험은 가짜 시계로 바로 앞·바로 뒤를 본다
 */
export function useIdleHint(active: boolean, delay: number = FX.idleHint) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!active) return;
    let timer: number | undefined;
    const start = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShown(true), delay);
    };
    const touch = () => {
      window.clearTimeout(timer);
      setShown(false);
    };
    const key = () => {
      touch();
      start();
    };
    start();
    window.addEventListener("pointerdown", touch, true);
    window.addEventListener("pointerup", start, true);
    window.addEventListener("pointercancel", start, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", touch, true);
      window.removeEventListener("pointerup", start, true);
      window.removeEventListener("pointercancel", start, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [active, delay]);
  return active && shown;
}

/**
 * 손짓 그림. 부르는 쪽이 밀거나 누를 물건 안(position: relative)에 두면 그 위 가운데에 겹친다.
 * 누름을 가로채지 않는다(pointer-events: none). 움직임 줄이기면 움직이지 않는 손(밀기는 위쪽 화살표와 함께)
 */
export function IdleHint({
  kind,
  shown,
  className,
}: {
  kind: IdleHintKind;
  shown: boolean;
  className?: string;
}) {
  if (!shown) return null;
  const still =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div
      aria-hidden="true"
      data-idle-hint={kind}
      data-idle-hint-still={still || undefined}
      className={cn(
        "pointer-events-none absolute inset-0 z-10 grid place-items-center",
        className,
      )}
    >
      {kind === "swipe-up" ? <Swipe still={still} /> : <Tap still={still} />}
    </div>
  );
}

/**
 * 예측판의 별 누르기 안내(2026-11-03 사용자: 처음 온 사람이 별을 눌러 고르는 줄 잘 몰랐다). 고른 별이 없고 가만히
 * 있으면 아무 별 하나 위에서 누르는 손짓을 보인다. 나올 때마다 다른 별이고, 가장자리 별은 손이 잘리지 않게 고르지 않는다.
 * 별판(SkyBoard)의 overlay로 넘긴다
 */
export function StarPickHint({ active }: { active: boolean }) {
  const shown = useIdleHint(active);
  const [star, setStar] = useState<SkyStar | null>(null);
  useEffect(() => {
    if (shown) setStar(hintStar());
  }, [shown]);
  if (!shown || !star) return null;
  return (
    <div
      aria-hidden="true"
      data-star-hint={star.n}
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
    >
      {/* 손끝(80칸 상자의 36.5, 19 자리)이 별 위에 오게 */}
      <div
        className="absolute size-20"
        style={{
          left: `calc(${star.x * 100}% - 36.5px)`,
          top: `calc(${star.y * 100}% - 19px)`,
        }}
      >
        <IdleHint kind="tap" shown />
      </div>
    </div>
  );
}

const HINT_STARS = SKY_STARS.filter(
  (s) => s.x > 0.15 && s.x < 0.85 && s.y > 0.15 && s.y < 0.85,
);
function hintStar(): SkyStar | null {
  return HINT_STARS[Math.floor(Math.random() * HINT_STARS.length)] ?? null;
}

/** 손끝이 아래에서 위로 쓸어 올라가고 지나간 자리에 꼬리선이 남았다 흐려진다 */
function Swipe({ still }: { still: boolean }) {
  if (still)
    return (
      <div className="sd-hint-ink flex flex-col items-center gap-1">
        <ArrowUp className="size-7" />
        <HandIcon className="size-14" />
      </div>
    );
  return (
    <div
      className="sd-hint-ink sd-hint-swipe relative h-40 w-14"
      style={{ ["--hint-ms" as string]: `${FX.hintSwipe}ms` }}
    >
      <span className="sd-hint-trail absolute" />
      <HandIcon className="sd-hint-swipe-hand absolute bottom-0 left-0 size-14" />
    </div>
  );
}

/** 손끝이 톡 누르면 그 자리에서 동그라미가 퍼진다 */
function Tap({ still }: { still: boolean }) {
  return (
    <div
      className={cn("sd-hint-ink relative size-20", !still && "sd-hint-tap")}
      style={{ ["--hint-ms" as string]: `${FX.hintTap}ms` }}
    >
      {!still && <span className="sd-hint-ring absolute" />}
      <HandIcon
        className={cn(
          "absolute top-3 left-3 size-14",
          !still && "sd-hint-tap-hand",
        )}
      />
    </div>
  );
}

/**
 * 손: 검지를 위로 편 손(손끝은 24칸의 10.5, 3 자리). PlaceIcons와 같은 꼴(24칸, 선 1.5, 글자색)이고
 * 어두운 속을 채워 밝은 등록증 위에서도 보인다
 */
function HandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="rgba(7,11,22,0.55)"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M9 14.5V4.5a1.5 1.5 0 0 1 3 0V11V9.5a1.5 1.5 0 0 1 3 0V11.5V10.5a1.5 1.5 0 0 1 3 0V12.5V12a1.5 1.5 0 0 1 3 0v3c0 4-2.5 7-6.5 7h-1.5c-2 0-3.3-.7-4.5-2l-3.4-3.8a1.5 1.5 0 0 1 2.2-2z" />
    </svg>
  );
}

function ArrowUp({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 20V4M6 10l6-6 6 6" />
    </svg>
  );
}
