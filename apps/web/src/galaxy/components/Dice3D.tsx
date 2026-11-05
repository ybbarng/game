"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

import { diePose, FACE_OF } from "../dice-throw";
import { DiceFace } from "./parts";

/** 면마다 정육면체 위 자리(가운데에서 반 변만큼 밀어낸다) */
const FACES: [keyof typeof FACE_OF, string][] = [
  ["front", "translateZ(calc(var(--die) / 2))"],
  ["back", "rotateY(180deg) translateZ(calc(var(--die) / 2))"],
  ["right", "rotateY(90deg) translateZ(calc(var(--die) / 2))"],
  ["left", "rotateY(-90deg) translateZ(calc(var(--die) / 2))"],
  ["top", "rotateX(90deg) translateZ(calc(var(--die) / 2))"],
  ["bottom", "rotateX(-90deg) translateZ(calc(var(--die) / 2))"],
];

/**
 * 주사위 하나(CSS 3D 정육면체)와 바닥 그림자. `p`는 구르는 몫(1이면 멈춤, `dice-throw.ts`).
 * 높이 뜰수록 조금 커지고 그림자는 작고 옅어진다. 움직임 줄이기면 p = 1로만 그린다
 */
export function Die3D({
  value,
  p,
  which,
  seed,
  dim = false,
}: {
  value: number;
  p: number;
  which: 0 | 1;
  seed: number;
  dim?: boolean;
}) {
  const pose = diePose(p, value, which, seed);
  const d = "var(--die)";
  const shadow = Math.max(0.25, 1 - pose.lift * 0.45);
  return (
    <span
      className={cn("relative block size-[var(--die)]", dim && "opacity-70")}
      style={{ perspective: "calc(var(--die) * 9)" } as CSSProperties}
      data-die3d={value}
      role="img"
      aria-label={`주사위 ${value}`}
    >
      {/* 바닥 그림자: 주사위가 닿을 자리에 남고, 뜰수록 작고 옅다 */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 block rounded-[50%] bg-black/55 blur-[2px]"
        style={{
          width: `calc(${d} * ${0.95 * shadow})`,
          height: `calc(${d} * ${0.32 * shadow})`,
          top: `calc(${d} * ${0.86 + pose.dy})`,
          transform: `translateX(calc(-50% + ${d} * ${pose.dx}))`,
          opacity: 0.35 + 0.5 * shadow,
        }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 block"
        style={{
          transformStyle: "preserve-3d",
          transform: `translate(calc(${d} * ${pose.dx}), calc(${d} * ${pose.dy - pose.lift})) scale(${1 + pose.lift * 0.12}) rotateZ(${pose.z}deg) rotateX(${pose.x}deg) rotateY(${pose.y}deg)`,
        }}
      >
        {FACES.map(([face, transform]) => (
          <span
            key={face}
            className="absolute inset-0 block [backface-visibility:hidden]"
            style={{ transform }}
          >
            <DiceFace value={FACE_OF[face]} className="size-full" decorative />
          </span>
        ))}
      </span>
    </span>
  );
}
