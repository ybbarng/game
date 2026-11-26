"use client";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";

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

/** 관계도에서 다 맞음까지 남은 횟수(줄 차례) */
function stepsLeft(id: string): number {
  const node = TWIST_FLOW.find((n) => n.id === id) as TwistFlowNode;
  return node.to ? 1 + stepsLeft(node.to) : 0;
}

/**
 * 코너 방향 관계도(docs/47 16-33): 모양마다 정한 쥐기로 공식을 한 번 치면 가는 모양. 다 맞음까지 남은 횟수가 같은
 * 모양끼리 한 줄에 두고 위에서 아래로 흐른다(휴대폰에서도 세로로 읽힌다). 칸마다 가는 모양의 이름을 적는다
 */
export function TwistFlowSheet({ colors }: { colors: readonly number[] }) {
  const max = Math.max(...TWIST_FLOW.map((n) => stepsLeft(n.id)));
  const rows = Array.from({ length: max + 1 }, (_, i) =>
    TWIST_FLOW.filter((n) => stepsLeft(n.id) === max - i),
  );
  const titleOf = (id: string) => TWIST_FLOW.find((n) => n.id === id)?.title;
  return (
    <section
      data-sheet="tf-flow"
      className="flex flex-col items-center gap-1 rounded-xl bg-black/25 p-3 text-sm"
    >
      <h3 className="self-start font-semibold">공식을 한 번 치면 가는 모양</h3>
      {rows.map((row, i) => (
        <div
          key={row.map((n) => n.id).join()}
          className="flex w-full flex-col items-center gap-1"
        >
          {i > 0 && (
            <span aria-hidden className="text-white/60 text-xs">
              ↓ 한 번
            </span>
          )}
          <ol className="flex w-full flex-wrap justify-center gap-2">
            {row.map((n) => (
              <li
                key={n.id}
                data-flow-node={n.id}
                data-flow-to={n.to ?? ""}
                className="flex w-24 flex-col items-center gap-1 rounded-lg bg-white/5 p-1.5"
              >
                <AlgPicture
                  set="2look-oll"
                  n={3}
                  state={applyMoves(3, solvedCube(3), parseMoves(3, n.alg))}
                  colors={colors}
                  mask="oll"
                  className="h-16 w-16"
                />
                <span className="break-keep text-center font-semibold text-xs">
                  {n.title}
                </span>
                {n.to && (
                  <span className="break-keep text-center text-white/70 text-xs">
                    → {titleOf(n.to)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
