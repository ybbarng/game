/*
 * 게임마다 다시 보기 해설 말투 시험(docs/standing-rules.md 3절). 키트를 컴퓨터끼리 실제로 두게 하면서
 * 걸음마다 `review.explain`·`review.stepNotes`가 낸 글을 모아 `review/tone.ts`로 본다.
 * 해설이 여러 갈래(고수와 같은 수·다른 수·하나뿐인 수 등)를 지나도록 낮은 단계 컴퓨터로 여러 판을 둔다.
 */
import { expect, it } from "vitest";

import type { GameKit } from "@/game/kit";

import { commentaryLines, commentaryProblems } from "./tone";

// biome-ignore lint/suspicious/noExplicitAny: 게임마다 형이 달라 틀은 모양만 본다
type AnyKit = GameKit<any, any, any, any, any, any>;

export interface ToneRun {
  /** 규칙과 씨앗 하나가 한 대국 */
  rules: unknown;
  seed: number;
  /** 둘 컴퓨터 단계(자리마다 다르게 줄 수 있다) */
  level: number | ((seat: number) => number);
  /** 최대 걸음 수(게임이 먼저 끝나면 거기서 멈춘다) */
  steps: number;
  /** 해설을 n걸음마다 한 번 계산한다(무거운 계산을 줄인다). 기본 1 */
  every?: number;
}

const name = (seat: number) =>
  ["민준", "나", "컴퓨터 1", "컴퓨터 2", "서연"][seat] ?? `자리 ${seat}`;

/** 대국 하나를 두면서 해설 글과 사건 글을 모은다 */
export function collectCommentary(kit: AnyKit, run: ToneRun): string[] {
  const lines: string[] = [];
  let state = kit.createMatch(run.rules, run.seed).state;
  const every = run.every ?? 1;
  for (let i = 0; i < run.steps; i++) {
    let next: { seat: number; action: unknown } | null =
      kit.autoAction?.(state, run.seed + i) ?? null;
    if (!next) {
      const seat = kit.pendingSeats(state)[0];
      if (seat === undefined) {
        // 차례가 없으면 열린 시간 창(원카드 외침 창 등)을 닫는다
        const timer = kit.timers?.(state)[0];
        if (!timer) break;
        next =
          "action" in timer
            ? { seat: timer.seat, action: timer.action }
            : timer.later(state);
        if (!next) break;
      } else {
        const view = kit.viewOf(state, seat) as { decision?: unknown };
        if (!view.decision) break;
        const level =
          typeof run.level === "function" ? run.level(seat) : run.level;
        const bot = kit.botFor?.(level);
        if (!bot) throw new Error("컴퓨터가 없는 게임");
        next = {
          seat,
          action: bot.decide(view, { seed: run.seed * 7919 + i }),
        };
      }
    }
    const result = kit.step(state, next.seat, next.action);
    if (!result.ok) throw new Error(`${i}걸음: ${result.error}`);
    if (i % every === 0)
      lines.push(
        ...commentaryLines(
          kit.review.explain(state, next, result.state, i, name),
        ),
      );
    lines.push(...(kit.review.stepNotes?.(result.events, name) ?? []));
    state = result.state;
    if (kit.isOver(kit.viewOf(state, 0))) break;
  }
  return lines;
}

/**
 * 시험 하나: 대국들을 두며 모은 해설 글에 말투가 어긋난 줄이 없다.
 * `minLines`보다 적게 모이면 시험이 아무것도 보지 못한 것이라 실패한다
 */
export function commentaryToneSuite(
  kit: AnyKit,
  runs: readonly ToneRun[],
  minLines = 20,
) {
  it("다시 보기 해설은 해요체 문장(마침표)이거나 마침표 없는 꼬리표다", () => {
    const lines = runs.flatMap((run) => collectCommentary(kit, run));
    expect(lines.length).toBeGreaterThanOrEqual(minLines);
    expect([...new Set(commentaryProblems(lines))]).toEqual([]);
  });
}
