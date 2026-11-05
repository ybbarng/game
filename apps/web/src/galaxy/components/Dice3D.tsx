"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

import { diePose, FACE_OF } from "../dice-throw";
import { DiceFace } from "./parts";

/**
 * 정육면체는 한 변 `--die`의 두 배(`--die2`)로 그리고 절반으로 줄인다(2026-11-05 사용자 「약간 화질 깨짐(계단 현상)」).
 * Safari는 3D로 돌린 층을 transform의 크기와 상관없이 화면 배율로만 그려, 줄이기 전 크기로 그리면 눈·가장자리를
 * 두 배 촘촘한 그림에서 줄여 보여 덜 깨진다. Chrome은 원래 크기에 맞춰 다시 그려 달라지지 않는다
 */
const BIG = "var(--die2)";

/** 면마다 정육면체 위 자리(가운데에서 반 변만큼 밀어낸다) */
const FACES: [keyof typeof FACE_OF, string][] = [
  ["front", `translateZ(calc(${BIG} / 2))`],
  ["back", `rotateY(180deg) translateZ(calc(${BIG} / 2))`],
  ["right", `rotateY(90deg) translateZ(calc(${BIG} / 2))`],
  ["left", `rotateY(-90deg) translateZ(calc(${BIG} / 2))`],
  ["top", `rotateX(90deg) translateZ(calc(${BIG} / 2))`],
  ["bottom", `rotateX(-90deg) translateZ(calc(${BIG} / 2))`],
];

/**
 * 속 정육면체: 겉면보다 조금 작은(94%) 면 색 정육면체. 면 모서리가 둥글어 모서리마다 생기던 작은 틈으로 뒤가 비치지
 * 않게 메운다. 가운데를 가로지르는 판으로 메우면 판끼리 엇갈린 자리가 앞면 위에 가는 십자 선으로 비쳤다
 */
const CORES = FACES.map(
  ([face, t]) =>
    [face, t.replace(`calc(${BIG} / 2)`, `calc(${BIG} * 0.47)`)] as const,
);

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
      style={
        {
          perspective: "calc(var(--die) * 9)",
          "--die2": "calc(var(--die) * 2)",
        } as CSSProperties
      }
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
        {/* 두 배로 그린 정육면체를 가운데 기준으로 절반으로(z도 함께 줄여 원근이 그대로다) */}
        <span
          className="absolute top-1/2 left-1/2 block"
          style={{
            width: BIG,
            height: BIG,
            margin: `calc(${BIG} / -2) 0 0 calc(${BIG} / -2)`,
            transformStyle: "preserve-3d",
            transform: "scale3d(0.5, 0.5, 0.5)",
          }}
        >
          {CORES.map(([face, t]) => (
            <span
              key={face}
              className="absolute inset-[3%] block bg-[#dfe5ee] [backface-visibility:hidden]"
              style={{ transform: t }}
            />
          ))}
          {FACES.map(([face, transform]) => (
            <span
              key={face}
              className="absolute inset-0 block [backface-visibility:hidden]"
              style={{ transform }}
            >
              <DiceFace
                value={FACE_OF[face]}
                className="block size-full"
                decorative
              />
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
