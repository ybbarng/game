"use client";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { useId, useLayoutEffect, useRef, useState } from "react";

import {
  BEGINNER_CASE_SHEETS,
  TWIST_FLOW,
  type TwistFlowNode,
} from "../learn/beginner-cases";
import { AlgPicture } from "./AlgPicture";
import { MoveText } from "./MoveChip";

/**
 * 3×3 처음 맞추기 단계 첫머리의 「모든 경우」 그림(docs/47 16-32). 경우마다 그림·모양·할 일을 한 칸에 둔다.
 * 흰 십자·첫 층·둘째 층은 비스듬한 큐브, 마지막 층은 윗면 평면도다(전개도는 쓰지 않는다, docs/standing-rules.md 2-1절).
 */
export function BeginnerCasesSheet({
  name,
  colors,
}: {
  name: keyof typeof BEGINNER_CASE_SHEETS;
  colors: readonly number[];
}) {
  const sheet = BEGINNER_CASE_SHEETS[name];
  return (
    <section
      data-sheet={name}
      className="flex flex-col gap-2 rounded-xl bg-black/25 p-3 text-sm"
    >
      <h3 className="font-semibold">{sheet.title}</h3>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sheet.cases.map((c, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: 같은 경우 이름이 둘일 수 있다(둘째 층 빼기)
            key={`${c.id}-${i}`}
            data-sheet-case={c.id}
            className="flex flex-col items-center gap-1 rounded-lg bg-white/5 p-2"
          >
            <AlgPicture
              set={sheet.set}
              n={3}
              state={applyMoves(3, solvedCube(3), parseMoves(3, c.alg))}
              colors={colors}
              {...(sheet.mask ? { mask: sheet.mask } : {})}
              className="h-20 w-20"
            />
            <span className="break-keep text-center font-semibold text-xs">
              {c.caption}
            </span>
            {c.action && (
              <span className="break-keep text-center text-white/75 text-xs wrap-anywhere">
                <MoveText text={c.action} n={3} keys={false} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

interface FlowLine {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 마디 칸들의 자리를 재서 화살표를 긋는다(같은 마디로 모이는 화살표는 끝을 조금씩 벌린다) */
function measureLines(box: HTMLElement): FlowLine[] {
  const base = box.getBoundingClientRect();
  const rectOf = (id: string) =>
    box.querySelector(`[data-flow-node="${id}"]`)?.getBoundingClientRect();
  const incoming = (id: string) =>
    TWIST_FLOW.filter((n) => n.to === id).map((n) => n.id);
  const out: FlowLine[] = [];
  for (const n of TWIST_FLOW) {
    if (!n.to) continue;
    const a = rectOf(n.id);
    const b = rectOf(n.to);
    if (!a || !b) continue;
    const sib = incoming(n.to);
    const spread = (sib.indexOf(n.id) - (sib.length - 1) / 2) * 10;
    out.push({
      from: n.id,
      to: n.to,
      x1: a.left + a.width / 2 - base.left,
      y1: a.bottom - base.top + 1,
      x2: b.left + b.width / 2 - base.left + spread,
      y2: b.top - base.top - 2,
    });
  }
  return out;
}

function FlowNode({
  node,
  colors,
}: {
  node: TwistFlowNode;
  colors: readonly number[];
}) {
  return (
    <li
      data-flow-node={node.id}
      data-flow-to={node.to ?? ""}
      style={
        node.col === undefined
          ? { gridRow: node.row + 1, gridColumn: "1 / -1" }
          : { gridRow: node.row + 1, gridColumn: node.col + 1 }
      }
      className="flex w-full max-w-[5.5rem] flex-col items-center gap-0.5 justify-self-center rounded-lg bg-white/5 p-1"
    >
      <AlgPicture
        set="2look-oll"
        n={3}
        state={applyMoves(3, solvedCube(3), parseMoves(3, node.alg))}
        colors={colors}
        mask="oll"
        className="h-14 w-14"
      />
      <span
        data-flow-front
        className="text-[0.625rem] text-white/60 leading-none"
      >
        ▲ 앞
      </span>
      <span className="break-keep text-center font-semibold text-[0.6875rem] leading-tight wrap-anywhere">
        {node.title}
      </span>
    </li>
  );
}

/**
 * 코너 방향 관계도(docs/47 16-33, 2026-11-26 사용자 요청): 마디는 위에서 본 노란 면 모양(쥘 모습대로, 아래가 앞)이고,
 * 화살표는 그 마디에서 공식을 한 번 친 결과 마디로 잇는다. 위에서 아래로 「하나도 없음 → 둘·하나 → 기본형 → 다 맞음」이
 * 한눈에 보인다. 화살표는 마디 자리를 재서 긋고, 크기가 바뀌면 다시 잰다(휴대폰 폭에서도 화살표가 보이게)
 */
export function TwistFlowSheet({ colors }: { colors: readonly number[] }) {
  const box = useRef<HTMLOListElement>(null);
  const [lines, setLines] = useState<FlowLine[]>([]);
  const marker = `tf-flow-arrow-${useId().replace(/[^\w-]/g, "")}`;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setLines(measureLines(el));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <section
      data-sheet="tf-flow"
      className="flex flex-col gap-2 rounded-xl bg-black/25 p-3 text-sm"
    >
      <h3 className="font-semibold">
        그림처럼 쥐고 공식을 한 번 치면 가는 모양
      </h3>
      <div className="relative">
        <ol ref={box} className="relative grid grid-cols-4 gap-x-1 gap-y-7">
          {TWIST_FLOW.map((n) => (
            <FlowNode key={n.id} node={n} colors={colors} />
          ))}
        </ol>
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-amber-300"
        >
          <defs>
            <marker
              id={marker}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {lines.map((l) => (
            <line
              key={l.from}
              data-flow-edge={`${l.from}-${l.to}`}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="currentColor"
              strokeWidth={1.75}
              markerEnd={`url(#${marker})`}
            />
          ))}
        </svg>
      </div>
    </section>
  );
}
