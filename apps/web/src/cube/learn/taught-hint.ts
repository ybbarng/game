// 무작위 해 보기·마무리의 두 단계 힌트(docs/47 8-1 「힌트」). 정해진 모범 답이 없는 해 보기에서
// 힌트 1은 지금 어느 경우인지 짧은 이름, 힌트 2는 다음 수 하나를 보인다. 수는 그 단원의 배우는 방식 해법
// (`@game/cube-ai` `taughtStagePlan`)이 지금 상태에서 낸 계획이고, 사용자가 계획대로 치는 동안은 같은 계획을
// 이어 쓴다. 벗어나면 지금 상태에서 다시 계산한다. 화면은 이 파일을 필요할 때 불러온다(cube-ai를 배우기 첫 화면에 싣지 않게).
import {
  type ColorLetter,
  TAUGHT_STAGES,
  type TaughtCase,
  type TaughtStage,
  taughtStagePlan,
  toFacelets,
} from "@game/cube-ai";
import { applyMoves, isSolved, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

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
 * 꼭짓점 방향 도중 `R' D' R D`를 하다 만 자리에서 이어 칠 나머지(짧은 것부터). 한 꼭짓점에 공식을 홀수 번 친
 * 자리면 앞-오른쪽 위에 다른 꼭짓점이 와 있어, 한 번 더 쳐 짝수 번(2·4번)으로 맞춘다
 */
const TRIGGER_REST = [
  "D",
  "R D",
  "D' R D",
  "R' D' R D",
  "D R' D' R D",
  "R D R' D' R D",
  "D' R D R' D' R D",
];

const TURN = /^([URFDLBxyz])(2|')?$/;
const amountOf = (suffix: string | undefined) =>
  suffix === "2" ? 2 : suffix === "'" ? 3 : 1;
const AMOUNT_TEXT = ["", "", "2", "'"];

/**
 * 토막 안에서 이어진 같은 면 수를 합친다(해법이 둔 「U U'」·「U2 U2」·「U2 U'」 같은 자리 맞추기 수).
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

function build(
  stage: TaughtStage,
  state: PuzzleState,
  lead: string[],
): HintPlan {
  const plan = taughtStagePlan(stage, apply(state, lead));
  const parts: { label: string; moves: string[] }[] = [
    ...(lead.length > 0
      ? [{ label: "하던 꼭짓점을 마저 돌려요(R' D' R D 끝까지)", moves: lead }]
      : []),
    ...plan.segments.map((g) => ({
      label: caseLabel(g.info),
      moves: mergeTurns(plan.moves.slice(g.start, g.end)),
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
 * 꼭짓점 방향은 아래 두 층이 흐트러진 도중이 많아, 공식을 하다 만 자리면 나머지를 앞에 붙인다.
 */
export function makeHintPlan(
  stage: TaughtStage,
  state: PuzzleState,
): HintPlan | null {
  const leads = stage === "ll-corner-twist" ? ["", ...TRIGGER_REST] : [""];
  for (const lead of leads) {
    try {
      const plan = build(stage, state, lead ? lead.split(" ") : []);
      const end = apply(state, plan.moves);
      if (stage !== "ll-corner-twist" || isSolved(3, end)) return plan;
    } catch {
      // 이 자리에서는 이 단계로 끝낼 수 없다
    }
  }
  return null;
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
 * 다음 힌트. 앞 계획(`prev`)대로 오고 있으면 그것을 이어 쓰고, 아니면 지금 상태에서 다시 계산한다.
 * 이미 그 단계가 끝났거나 끝낼 수 없으면 null
 */
export function nextHint(
  stage: TaughtStage,
  state: PuzzleState,
  prev: HintPlan | null,
): TaughtHint | null {
  if (prev && prev.stage === stage) {
    const k = planIndex(prev, state);
    if (k >= 0) return hintAt(prev, k);
  }
  const plan = makeHintPlan(stage, state);
  if (!plan) return null;
  const k = planIndex(plan, state);
  return k >= 0 ? hintAt(plan, k) : null;
}

/**
 * 마무리: 지금 상태가 몇 단계까지 맞았나(0~7, 7이면 다 맞음). 이미 있는 목표 판정을 차례로 보고, 처음 안 맞은
 * 단계가 지금 단계다. 꼭짓점 방향 도중에는 아래 두 층이 흐트러지므로, 꼭짓점 방향만으로 끝낼 수 있는 상태면 마지막 단계로 본다.
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
    const k = planIndex(prev, state);
    if (k >= 0) return hintAt(prev, k);
  }
  const reached = finaleReached(state);
  const stage = TAUGHT_STAGES[reached];
  return stage ? nextHint(stage, state, null) : null;
}

// ── 경우 이름 ──────────────────────────────────────────

const COLOR: Record<ColorLetter, string> = {
  U: "흰",
  R: "빨강",
  F: "초록",
  D: "노랑",
  L: "주황",
  B: "파랑",
};
const colors = (list: ColorLetter[]) => list.map((c) => COLOR[c]).join("-");

const CROSS_CASE: Record<
  Extract<TaughtCase, { kind: "cross" }>["case"],
  string
> = {
  "down-white-down": "아래층·흰색 아래",
  middle: "가운데 줄",
  "down-white-side": "아래층·흰색 옆",
  "top-flipped": "윗층 제자리·뒤집힘",
  "top-wrong": "윗층·엉뚱한 자리",
};

const SIDE: Record<"right" | "down" | "front", string> = {
  right: "오른쪽",
  down: "아래",
  front: "앞",
};

/** 경우 자료 → 「흰-빨강 모서리: 가운데 줄 경우」 같은 짧은 이름 */
export function caseLabel(c: TaughtCase): string {
  switch (c.kind) {
    case "hold":
      return c.white === "up"
        ? "흰 면을 위로 들어요(흰 십자·첫 층은 흰 면 위에서)"
        : "첫 층 끝: 큐브를 뒤집어(z2) 흰 면을 아래로";
    case "cross":
      return `${colors(c.colors)} 모서리: ${CROSS_CASE[c.case]} 경우`;
    case "corner":
      if (c.from === "stuck")
        return `${colors(c.colors)} 꼭짓점이 엉뚱한 칸에 박힘: 한 번 빼기`;
      return c.from === "slot"
        ? `${colors(c.colors)} 꼭짓점: 제 칸에서 흰색이 ${SIDE[c.white]}, ${c.reps}번`
        : `${colors(c.colors)} 꼭짓점: 칸 밑에서 흰색이 ${SIDE[c.white]}, ${c.reps}번`;
    case "middle":
      return c.side === "stuck"
        ? `${colors(c.colors)} 모서리가 칸에 잘못 들어감: 오른쪽 넣기로 빼내기`
        : `${colors(c.colors)} 모서리: ${c.side === "right" ? "오른쪽" : "왼쪽"}으로 넣기`;
    case "eo":
      return c.shape === "dot"
        ? "노란 십자: 점, 아무 방향에서 한 번"
        : c.shape === "ell"
          ? "노란 십자: ㄱ자, 노란 두 칸을 뒤·왼쪽으로"
          : "노란 십자: 가로줄, 가로로 쥐고 한 번";
    case "ll-edges":
      return c.pattern === "adjacent"
        ? "옆면: 이웃한 둘이 맞음, 그 둘을 뒤·오른쪽에 쥐기"
        : "옆면: 마주 본 둘이 맞음, 아무 쪽에서 한 번";
    case "corner-place":
      return c.placed === 1
        ? "꼭짓점 자리: 제자리 하나, 앞-오른쪽 위에 쥐기"
        : "꼭짓점 자리: 제자리 없음, 아무 쪽에서 한 번";
    case "twist":
      return `꼭짓점 방향: 노랑이 ${c.yellow === "right" ? "오른쪽" : "앞"}, ${c.reps}번`;
    case "auf":
      return "윗면을 돌려 옆색 맞추기";
  }
}
