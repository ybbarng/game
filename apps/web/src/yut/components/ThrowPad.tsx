"use client";

import {
  type DragPoint,
  type Gesture,
  gestureFromDrag,
  STEADY_GESTURE,
  tooLow,
} from "@game/yut-engine";
import { useRef, useState } from "react";

import { cn } from "@/lib/cn";

/** 너무 낮게 던졌을 때 알림 */
export const TOO_LOW_NOTICE = "너무 낮게 던졌어요. 다시 던지세요.";

/** 높이 100이 되는 당김 길이(px): 화면 높이의 30%, 적어도 150px */
function reachOf(): number {
  const height = typeof window === "undefined" ? 600 : window.innerHeight;
  return Math.max(150, Math.round(height * 0.3));
}

/** 당긴 만큼 손과 윷이 화면에서 내려가는 길이(px, 끝까지 당기면 이만큼) */
const DROP_PX = 72;
/** 끝까지 당기면 손목이 젖혀지는 각도 */
const WRIST_DEG = 28;

/**
 * 윷가락을 쥔 손. 아래로 당겼다가 위로 튕겨 놓으면 던진다(docs/37 13절, 게이지 없음).
 * 당긴 길이 = 높이, 튕긴 방향 = 방향, 튕긴 빠르기 = 세기. 당길수록 손과 윷이 따라 내려가고 손목이 젖혀진다.
 * 키보드(Enter·Space)는 가운데로 알맞게 던진다
 */
export function ThrowPad({
  onThrow,
  onTooLow,
}: {
  onThrow: (gesture: Gesture) => void;
  onTooLow: () => void;
}) {
  const points = useRef<DragPoint[]>([]);
  const reach = useRef(reachOf());
  const [pull, setPull] = useState(0);
  const [lean, setLean] = useState(0);
  const dragging = pull > 0 || points.current.length > 0;

  const reset = () => {
    points.current = [];
    setPull(0);
    setLean(0);
  };

  const at = (e: React.PointerEvent): DragPoint => ({
    x: e.clientX,
    y: e.clientY,
    t: e.timeStamp,
  });

  return (
    <button
      type="button"
      aria-label="윷 던지기"
      data-throw
      data-pull={Math.round(pull * 100)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        reach.current = reachOf();
        points.current = [at(e)];
      }}
      onPointerMove={(e) => {
        const start = points.current[0];
        if (!start) return;
        const point = at(e);
        points.current.push(point);
        const lowest = Math.max(...points.current.map((p) => p.y));
        setPull(Math.min(1, Math.max(0, (lowest - start.y) / reach.current)));
        // 튕기는 쪽으로 손이 살짝 기운다(가장 낮은 점에서 지금 점까지).
        setLean(Math.max(-1, Math.min(1, (point.x - start.x) / reach.current)));
      }}
      onPointerUp={(e) => {
        if (points.current.length === 0) return;
        points.current.push(at(e));
        const gesture = gestureFromDrag(points.current, reach.current);
        const moved = points.current.some(
          (p) =>
            Math.hypot(
              p.x - (points.current[0] as DragPoint).x,
              p.y - (points.current[0] as DragPoint).y,
            ) > 4,
        );
        reset();
        if (gesture && !tooLow(gesture)) onThrow(gesture);
        else if (moved) onTooLow();
      }}
      onPointerCancel={reset}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        onThrow(STEADY_GESTURE);
      }}
      className={cn(
        "yut-throw-pad relative flex h-36 w-full max-w-xs touch-none select-none items-start justify-center rounded-2xl border border-amber-200/30 bg-black/25 pt-3 outline-none focus-visible:ring-2 focus-visible:ring-amber-300 short-landscape:h-28",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <span
        aria-hidden="true"
        className="relative flex flex-col items-center"
        style={{
          transform: `translate(${lean * 18}px, ${pull * DROP_PX}px) rotate(${lean * 8 - pull * WRIST_DEG}deg)`,
          transformOrigin: "50% 85%",
          transition: dragging ? "none" : "transform 160ms ease-out",
        }}
      >
        <span className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-16 w-3.5 rounded-full border border-amber-950/40 bg-gradient-to-b from-amber-100 to-amber-300 shadow"
              style={{ transform: `rotate(${(i - 1.5) * 4}deg)` }}
            />
          ))}
        </span>
        <Hand />
      </span>
    </button>
  );
}

/** 윷가락 아래를 쥔 주먹 */
function Hand() {
  return (
    <svg
      width="64"
      height="40"
      viewBox="0 0 64 40"
      className="-mt-5 drop-shadow"
      aria-hidden="true"
    >
      <rect x="6" y="4" width="52" height="30" rx="14" fill="#f2c9a0" />
      <path
        d="M18 6 v16 M30 5 v17 M42 6 v16"
        stroke="#c79a72"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="2" y="16" width="18" height="12" rx="6" fill="#e9b98d" />
    </svg>
  );
}
