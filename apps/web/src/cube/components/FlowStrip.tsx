"use client";

import type { CubeMove } from "@game/cube-engine";
import { realClock } from "@game/fair-play";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import {
  comboLevel,
  comboNow,
  EMPTY_FLOW,
  FLOW_SPEED_WINDOW,
  type FlowItem,
  type FlowStrip as FlowStripState,
  flowSpeed,
  pushFlow,
} from "../flow/strip";
import { keyTone, type Orient } from "../keys/key-colors";
import { hexColor } from "../settings";

/**
 * 수 흐름 띠(docs/51 1-1). 내가 둔 수가 하나씩 크게 떴다가 작아지며 오른쪽 끝에서 왼쪽으로 흘러간다.
 * 칠하기는 키 그림과 같다(`keys/key-colors.ts`의 옅은 색조: 바탕 20%·테두리 60%·아래 띠만 면 색 그대로, 반대 방향은
 * 더 옅게 + 끊긴 띠). 큐브 전체 돌리기는 회색으로 작게. 움직임은 CSS만 쓰고(globals.css `cube-flow-*`), 움직임 줄이기면
 * 글자만 더한다. 끝에 지금 빠르기(초당 수)를 작게 보인다.
 */

/** 수가 바꾸는 면(색을 고르는 기준): 바깥층이 닿은 쪽, 가운데 층은 M→L, E→D, S→F를 따른다 */
export function moveFace(n: number, m: CubeMove): number {
  const plus = { x: 1, y: 0, z: 2 }[m.axis];
  const minus = { x: 4, y: 3, z: 5 }[m.axis];
  if (m.from === 1) return plus;
  if (m.to === n) return minus;
  const near = m.from - 1;
  const far = n - m.to;
  if (near < far) return plus;
  if (far < near) return minus;
  return m.axis === "z" ? plus : minus;
}

export type FlowSize = "large" | "small";

/**
 * 띠 상태와 더하기·비우기. `orient`는 수를 둔 때 들고 있는 방향(키 그림과 같은 기준).
 * 더하기는 앞뒤 띠를 돌려준다(콤보 단계 소리가 단계를 넘은 순간을 본다). 빠르게 이어 쳐도 앞 수를 놓치지 않게
 * 마지막 띠를 ref로도 들고 있는다
 */
export function useFlowStrip(n: number) {
  const [strip, setStrip] = useState<FlowStripState>(EMPTY_FLOW);
  const latest = useRef<FlowStripState>(EMPTY_FLOW);
  return {
    strip,
    push: (m: CubeMove, orient: Orient) => {
      const before = latest.current;
      const after = pushFlow(
        before,
        n,
        m,
        orient[moveFace(n, m)] ?? null,
        realClock.now(),
      );
      latest.current = after;
      setStrip(after);
      return { before, after };
    },
    clear: () => {
      latest.current = EMPTY_FLOW;
      setStrip(EMPTY_FLOW);
    },
  };
}

export function FlowStripView({
  strip,
  size,
  colors,
  combo: showCombo = false,
  className = "",
}: {
  strip: FlowStripState;
  size: FlowSize;
  colors: readonly number[];
  /** 흐름 콤보(docs/51 2-1)를 띠 끝에 보인다(혼자 맞추기) */
  combo?: boolean;
  className?: string;
}) {
  // 빠르기는 수가 없어도 줄어들어야 하니, 최근 수가 남아 있는 동안만 0.25초마다 다시 그린다
  const [, tick] = useState(0);
  const lastAt = strip.times.at(-1);
  useEffect(() => {
    if (lastAt === undefined) return;
    const id = window.setInterval(() => {
      tick((t) => t + 1);
      if (realClock.now() - lastAt > FLOW_SPEED_WINDOW)
        window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [lastAt]);
  const now = realClock.now();
  const tps = flowSpeed(strip, now);
  const large = size === "large";
  const combo = showCombo ? comboNow(strip, now) : 0;
  const level = comboLevel(combo);
  return (
    <div
      data-cube-flow={size}
      data-combo-level={showCombo ? level : undefined}
      aria-hidden
      className={`pointer-events-none flex w-full max-w-xl items-center gap-2 ${
        large ? "h-9" : "h-7"
      } ${showCombo ? "cube-combo-track" : ""} ${className}`}
    >
      <div
        className="cube-flow-track flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden"
        data-cube-flow-moves={strip.items.map((i) => i.text).join(" ")}
      >
        {strip.items.map((item) => (
          <Chip key={item.id} item={item} large={large} colors={colors} />
        ))}
      </div>
      {showCombo && (
        <span
          data-cube-combo={level > 0 ? combo : undefined}
          className={`w-16 shrink-0 whitespace-nowrap text-right font-semibold tabular-nums transition-colors duration-500 ${
            large ? "text-xs" : "text-[10px]"
          } ${
            level === 0
              ? "text-transparent"
              : level >= 3
                ? "text-amber-200"
                : level === 2
                  ? "text-sky-100"
                  : "text-sky-200/80"
          }`}
        >
          {/* 숫자가 바뀔 때마다 톡 튀고, 단계가 오를 때는 빛이 한 번 번진다(2026-11-05 사용자 「콤보 n 문구가 바뀔
              때마다 강조되는 애니메이션」) */}
          {level > 0 && (
            <span
              key={level}
              data-cube-combo-level-up=""
              className="cube-combo-level inline-block rounded px-0.5"
            >
              콤보{" "}
              <span key={combo} className="cube-combo-tick inline-block">
                {combo}
              </span>
            </span>
          )}
        </span>
      )}
      <span
        data-cube-tps
        className={`w-14 shrink-0 text-right font-mono text-white/45 tabular-nums ${
          large ? "text-xs" : "text-[10px]"
        }`}
      >
        {tps === null ? "" : `${tps.toFixed(1)}/초`}
      </span>
    </div>
  );
}

function Chip({
  item,
  large,
  colors,
}: {
  item: FlowItem;
  large: boolean;
  colors: readonly number[];
}) {
  const box = large
    ? "h-7 min-w-7 px-1.5 text-sm"
    : "h-5 min-w-5 px-1 text-[11px]";
  if (item.rotation || item.color === null)
    return (
      <span className="cube-flow-pop shrink-0">
        <span
          key={item.rev}
          data-flow-rotation
          className={`${item.rev > 0 ? "cube-flow-bump" : ""} inline-flex items-center rounded px-1 font-mono text-white/40 ${
            large ? "h-6 text-[11px]" : "h-4 text-[10px]"
          }`}
        >
          {item.text}
        </span>
      </span>
    );
  const rgb = colors[item.color] ?? 0;
  // 엔진의 turns는 + 쪽(R·U·F)에서 본 방향이라 L·D·B는 거꾸로다. 표기 글의 ′로 본다
  const prime = item.text.endsWith("′");
  const tone = keyTone(rgb, prime);
  const bar = hexColor(rgb);
  const style: CSSProperties = {
    backgroundColor: hexColor(tone.fill),
    borderColor: hexColor(tone.border),
  };
  return (
    <span className="cube-flow-pop shrink-0">
      <span
        key={item.rev}
        data-flow-move={item.text}
        style={style}
        className={`${item.rev > 0 ? "cube-flow-bump" : ""} relative inline-flex items-center justify-center rounded-md border font-mono font-semibold text-white/90 ${box}`}
      >
        {item.text}
        <span
          className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full"
          style={
            prime
              ? {
                  backgroundImage: `repeating-linear-gradient(90deg, ${bar} 0 4px, transparent 4px 7px)`,
                }
              : { backgroundColor: bar }
          }
        />
      </span>
    </span>
  );
}
