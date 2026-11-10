// 무작위 해 보기·마무리의 두 단계 힌트(docs/47 8-1 「힌트」). 정해진 모범 답이 없는 해 보기에서
// 힌트 1은 지금 어느 경우인지 짧은 이름, 힌트 2는 다음 수 하나를 보인다. 수는 단원 글과 같은 경우별 정해진 길
// (`beginner-path.ts`, 2026-11-10)이 지금 상태에서 낸 계획이고, 사용자가 계획대로 치는 동안은 같은 계획을
// 이어 쓴다. 벗어나면 지금 상태에서 다시 계산한다. 화면은 이 파일을 필요할 때 불러온다(배우기 첫 화면에 싣지 않게).
import { TAUGHT_STAGES, type TaughtStage, toFacelets } from "@game/cube-ai";
import { applyMoves, isSolved, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import {
  type PathStageId,
  runStage,
  stepLabel,
  TWIST,
  TWIST_BACK,
} from "./beginner-path";
import { courseById } from "./index";
import { goalMet } from "./judge";
import { BEGINNER_COURSE_ID } from "./taught-kind";
import type { Course, CourseStage } from "./types";

export {
  BEGINNER_FINALE_ID,
  BEGINNER_TAUGHT,
  taughtHintKind,
} from "./taught-kind";

/** 3×3 초보자 과정의 일곱 단계(단계 지도 자료). 차례가 `TAUGHT_STAGES`와 같다 */
export function beginnerStages(): {
  course: Course;
  stages: CourseStage[];
} {
  const course = courseById(BEGINNER_COURSE_ID) as Course;
  return { course, stages: course.stages ?? [] };
}

const keyOf = (s: PuzzleState) => toFacelets(3, s);
const apply = (s: PuzzleState, moves: readonly string[]) =>
  moves.length === 0 ? s : applyMoves(3, s, parseMoves(3, moves.join(" ")));

export interface HintSegment {
  start: number;
  end: number;
  label: string;
}

/** 힌트 계획: 수 목록과 수마다의 상태(열쇠), 경우별 토막 이름 */
export interface HintPlan {
  stage: TaughtStage;
  moves: string[];
  /** keys[k] = k수 둔 뒤 상태(길이 moves + 1) */
  keys: string[];
  segments: HintSegment[];
}

/**
 * 코너 방향 도중 코너 돌리기(또는 그 거꾸로)를 하다 만 자리에서 이어 칠 나머지(짧은 것부터). 한 코너에 공식을
 * 홀수 번 친 자리면 앞-오른쪽 위에 다른 코너가 와 있어, 한 번 더 쳐 짝수 번(두 번)으로 맞춘다
 */
const TRIGGER_REST: string[] = (() => {
  const out: string[] = [];
  for (const formula of [TWIST, TWIST_BACK]) {
    const m = formula.split(" ");
    const rests = [3, 2, 1].map((k) => m.slice(k).join(" "));
    out.push(...rests, formula, ...rests.map((r) => `${r} ${formula}`));
  }
  return out.sort((a, b) => a.split(" ").length - b.split(" ").length);
})();

const TURN = /^([URFDLBxyz])(2|')?$/;
const amountOf = (suffix: string | undefined) =>
  suffix === "2" ? 2 : suffix === "'" ? 3 : 1;
const AMOUNT_TEXT = ["", "", "2", "'"];

/**
 * 토막 안에서 이어진 같은 면 수를 합친다(쥐기의 「D」 뒤 거꾸로 공식의 「D'」 같은 자리 맞추기 수).
 * 토막 경계는 넘지 않는다(경계 너머로 지워지는 수는 `planIndex`가 건너뛴다)
 */
export function mergeTurns(moves: readonly string[]): string[] {
  const out: string[] = [];
  for (const m of moves) {
    const a = TURN.exec(m);
    const b = TURN.exec(out.at(-1) ?? "");
    if (a && b && a[1] === b[1]) {
      const sum = (amountOf(a[2]) + amountOf(b[2])) % 4;
      out.pop();
      if (sum !== 0) out.push(`${a[1]}${AMOUNT_TEXT[sum]}`);
    } else out.push(m);
  }
  return out;
}

const PATH_OF: Record<TaughtStage, PathStageId> = {
  cross: "cross",
  corners: "corners",
  middle: "second",
  eo: "yellow-cross",
  "ll-edges": "edges",
  "ll-corner-place": "corner-place",
  "ll-corner-twist": "corner-twist",
};

const WHITE_UP: readonly TaughtStage[] = ["cross", "corners"];
const HOLDS = ["", "x2", "x", "x'", "z", "z'"];

/** 흰 면을 위(흰 십자·첫 층) 또는 아래(나머지)로 쥐는 큐브 돌리기 */
function holdFor(stage: TaughtStage, state: PuzzleState): string {
  // 윗면·아랫면 센터 스티커 자리
  const at = WHITE_UP.includes(stage) ? 4 : 31;
  const h = HOLDS.find((r) => keyOf(apply(state, r ? [r] : []))[at] === "U");
  if (h === undefined) throw new Error("흰 센터를 찾지 못했다");
  return h;
}

function build(
  stage: TaughtStage,
  state: PuzzleState,
  lead: string[],
): HintPlan {
  const afterLead = apply(state, lead);
  const hold = holdFor(stage, afterLead);
  const held = apply(afterLead, hold ? [hold] : []);
  // 코너 자리는 위 엣지 옆 색이 맞은 데서 한다(옆면 맞추기 목표는 윗면 돌리기 하나를 봐준다)
  const align =
    stage === "ll-corner-place" ? runStage("edges", held).steps : [];
  const aligned = apply(
    held,
    align.flatMap((st) => (st.hold ? st.hold.split(" ") : [])),
  );
  const run = {
    steps: [...align, ...runStage(PATH_OF[stage], aligned).steps],
  };
  const parts: { label: string; moves: string[] }[] = [
    ...(lead.length > 0
      ? [{ label: "하던 코너를 마저 돌려요(공식 끝까지)", moves: lead }]
      : []),
    ...(hold
      ? [
          {
            label: WHITE_UP.includes(stage)
              ? "흰 면을 위로 들어요(흰 십자·첫 층은 흰 면 위에서)"
              : "첫 층 끝: 큐브를 뒤집어 흰 면을 아래로",
            moves: [hold],
          },
        ]
      : []),
    ...run.steps.map((st) => ({
      label: stepLabel(st),
      moves: mergeTurns([st.hold, st.alg].filter(Boolean).join(" ").split(" ")),
    })),
  ].filter((p) => p.moves.length > 0);
  const moves: string[] = [];
  const segments: HintSegment[] = [];
  for (const p of parts) {
    segments.push({
      start: moves.length,
      end: moves.length + p.moves.length,
      label: p.label,
    });
    moves.push(...p.moves);
  }
  const keys = [keyOf(state)];
  let s = state;
  for (const m of moves) {
    s = apply(s, [m]);
    keys.push(keyOf(s));
  }
  return { stage, moves, keys, segments };
}

/**
 * 지금 상태에서 그 단계를 끝내는 힌트 계획. 끝낼 수 없으면(앞 단계가 흐트러짐 등) null.
 * 코너 방향은 아래 두 층이 흐트러진 도중이 많아, 공식을 하다 만 자리면 나머지를 앞에 붙인다.
 */
export function makeHintPlan(
  stage: TaughtStage,
  state: PuzzleState,
): HintPlan | null {
  const leads = stage === "ll-corner-twist" ? ["", ...TRIGGER_REST] : [""];
  // 이어 칠 나머지가 여럿 맞으면 전체가 가장 짧은 계획(하던 공식을 되돌리는 나머지보다 마저 치는 나머지)
  let best: HintPlan | null = null;
  for (const lead of leads) {
    try {
      const plan = build(stage, state, lead ? lead.split(" ") : []);
      const end = apply(state, plan.moves);
      if (stage !== "ll-corner-twist" || isSolved(3, end)) {
        if (!lead) return plan;
        if (!best || plan.moves.length < best.moves.length) best = plan;
      }
    } catch {
      // 이 자리에서는 이 단계로 끝낼 수 없다
    }
  }
  return best;
}

/**
 * 지금 상태가 계획의 몇 수 뒤인가(계획에서 벗어났으면 -1). 같은 상태가 두 번 나오면(토막 경계 너머로 지워지는
 * 「F' F」 등) 뒤쪽을 골라 쓸데없는 수를 건너뛴다
 */
export function planIndex(plan: HintPlan, state: PuzzleState): number {
  const k = plan.keys.lastIndexOf(keyOf(state));
  return k >= 0 && k < plan.moves.length ? k : -1;
}

export interface TaughtHint {
  stage: TaughtStage;
  /** 지금 경우의 짧은 이름 */
  label: string;
  /** 다음 수 하나 */
  move: string;
  /** 계획 안 토막 번호(토막이 바뀌면 화면이 힌트를 접는다) */
  segment: number;
  plan: HintPlan;
}

function hintAt(plan: HintPlan, k: number): TaughtHint {
  const segment = Math.max(
    0,
    plan.segments.findIndex((g) => k >= g.start && k < g.end),
  );
  return {
    stage: plan.stage,
    label: plan.segments[segment]?.label ?? "",
    move: plan.moves[k] as string,
    segment,
    plan,
  };
}

/**
 * 계획을 따라오고 있는가. 반 바퀴(`U2`)를 키 두 번으로 치는 배치에서는 첫 번째 4분의 1 뒤가 계획 밖이라,
 * 그 자리면 같은 계획에서 나머지 4분의 1을 낸다(다시 계산하면 U2 ↔ U2 사이를 맴돌 수 있었다)
 */
function onPlan(plan: HintPlan, state: PuzzleState): TaughtHint | null {
  const k = planIndex(plan, state);
  if (k >= 0) return hintAt(plan, k);
  for (const [j, m] of plan.moves.entries()) {
    const half = /^([URFDLBxyz])2$/.exec(m)?.[1];
    if (!half) continue;
    for (const [did, undo] of [
      [half, `${half}'`],
      [`${half}'`, half],
    ] as const)
      if (keyOf(apply(state, [undo])) === plan.keys[j])
        return { ...hintAt(plan, j), move: did };
  }
  return null;
}

/**
 * 지금 단계의 힌트. 앞 계획(prev)대로 오고 있으면 그 계획을 이어 쓰고, 아니면 지금 상태에서 다시 계산한다.
 * 이미 그 단계가 끝났거나 끝낼 수 없으면 null
 */
export function nextHint(
  stage: TaughtStage,
  state: PuzzleState,
  prev: HintPlan | null,
): TaughtHint | null {
  if (prev && prev.stage === stage) {
    const h = onPlan(prev, state);
    if (h) return h;
  }
  const plan = makeHintPlan(stage, state);
  if (!plan) return null;
  const k = planIndex(plan, state);
  return k >= 0 ? hintAt(plan, k) : null;
}

/**
 * 마무리: 지금 상태가 몇 단계까지 맞았나(0~7, 7이면 다 맞음). 이미 있는 목표 판정을 차례로 보고, 처음 안 맞은
 * 단계가 지금 단계다. 코너 방향 도중에는 아래 두 층이 흐트러지므로, 코너 방향만으로 끝낼 수 있는 상태면 마지막 단계로 본다.
 */
export function finaleReached(state: PuzzleState): number {
  if (isSolved(3, state)) return TAUGHT_STAGES.length;
  const { stages } = beginnerStages();
  const twist = TAUGHT_STAGES.length - 1;
  if (makeHintPlan("ll-corner-twist", state)) return twist;
  const i = stages.findIndex(
    (st) => st.goal !== undefined && !goalMet(3, state, st.goal),
  );
  return i < 0 ? twist : i;
}

/** 마무리의 힌트: 앞 계획대로 오고 있으면 그 단계, 아니면 지금 맞은 데까지 보고 다음 단계 */
export function finaleHint(
  state: PuzzleState,
  prev: HintPlan | null,
): TaughtHint | null {
  if (prev) {
    const h = onPlan(prev, state);
    if (h) return h;
  }
  const reached = finaleReached(state);
  const stage = TAUGHT_STAGES[reached];
  return stage ? nextHint(stage, state, null) : null;
}
