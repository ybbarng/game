"use client";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";

import { BEGINNER_CASE_SHEETS } from "../learn/beginner-cases";
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
