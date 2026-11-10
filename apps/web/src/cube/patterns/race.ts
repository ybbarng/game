import { sha256Hex } from "@game/baseball-engine";
import {
  isSolved,
  type ShapeMatcher,
  shapeMatcher,
  solvedPieceRatio,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import {
  levelOf,
  moveCount,
  PATTERNS,
  type Pattern,
  type PatternLevel,
  patternById,
} from "./data";
import { patternState } from "./shape";

/**
 * 모양 만들기(docs/47 9-10): 판마다 목표 모양 하나를 정하고 먼저 그 모양을 만든 사람이 이긴다.
 * 모양 자료는 「패턴 만들기」(`data.ts`)를 그대로 쓰고, 어려움은 공식 수로 매긴다(`levelOf`).
 * 판정은 `@game/cube-engine` `shapeMatcher`(통째로 돌린 방향·쥐는 법은 무시).
 */

/** 어디서 시작하나: 맞춘 큐브(기본) 또는 섞인 큐브(어려움) */
export type ShapeStart = "solved" | "scrambled";

export const SHAPE_STARTS: readonly ShapeStart[] = ["solved", "scrambled"];

export const SHAPE_START_LABELS: Record<ShapeStart, string> = {
  solved: "맞춘 큐브에서",
  scrambled: "섞인 큐브에서",
};

/** 모양 고르기: 어려움 하나 또는 섞어서 */
export type ShapePick = PatternLevel | "mix";

export const SHAPE_PICKS: readonly ShapePick[] = [
  "easy",
  "normal",
  "hard",
  "mix",
];

export const SHAPE_PICK_LABELS: Record<ShapePick, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
  mix: "섞어서",
};

/** 방 설정의 모양 규칙(방장이 정해 방 상태로 알린다) */
export interface ShapeRule {
  start: ShapeStart;
  pick: ShapePick;
  /** 판마다 모양 차례를 정하는 열쇠(경기마다 방장이 새로 만든다, 모든 기기가 같은 차례를 계산한다) */
  key: string;
  /**
   * 「만드는 법」 허용. 없으면 켬(이 칸이 생기기 전의 방과 같다). 화면 도움이라 판정에는 끼지 않는다(친구끼리 믿는 모드)
   */
  formula?: boolean;
}

/** 이 규칙에서 「만드는 법」를 열 수 있나(없으면 켬) */
export function shapeFormulaOn(rule: Pick<ShapeRule, "formula">): boolean {
  return rule.formula !== false;
}

export const SHAPE_KEY_MAX = 32;

/** 그 크기에서 고를 수 있는 모양(어려움 차례, 같은 어려움은 자료 차례) */
export function shapesFor(n: number, pick: ShapePick = "mix"): Pattern[] {
  return PATTERNS.filter(
    (p) => p.size === n && (pick === "mix" || shapeLevel(p) === pick),
  );
}

export function shapeLevel(p: Pattern): PatternLevel {
  return levelOf(moveCount(p.size, p.alg));
}

/** 그 크기에서 고를 수 있는 어려움(모양이 하나라도 있는 것만, 「섞어서」는 둘 이상일 때) */
export function shapePicks(n: number): ShapePick[] {
  const levels = new Set(shapesFor(n).map(shapeLevel));
  const out: ShapePick[] = SHAPE_PICKS.filter(
    (k) => k !== "mix" && levels.has(k),
  );
  if (levels.size > 1) out.push("mix");
  return out;
}

/** 모양 만들기를 할 수 있는 크기인가 */
export function shapeSupports(n: number): boolean {
  return shapesFor(n).length > 0;
}

/** 손님이 받은 규칙이 고를 수 있는 값인가 */
export function shapeRuleOk(rule: unknown, n: number): rule is ShapeRule {
  if (typeof rule !== "object" || rule === null) return false;
  const r = rule as Partial<ShapeRule>;
  return (
    SHAPE_STARTS.includes(r.start as ShapeStart) &&
    shapePicks(n).includes(r.pick as ShapePick) &&
    typeof r.key === "string" &&
    r.key.length > 0 &&
    r.key.length <= SHAPE_KEY_MAX &&
    (r.formula === undefined || typeof r.formula === "boolean")
  );
}

/**
 * 그 판의 목표 모양. 열쇠로 모양 차례를 섞고 판 번호 차례로 하나씩 꺼낸다: 모든 기기가 같은 모양을 얻고(방 상태의
 * 열쇠·판 번호만 쓴다, 판 도중에 들어온 사람도 같다), 점수제 여러 판에서는 모양이 다 돌기 전까지 겹치지 않는다
 */
export function shapeFor(rule: ShapeRule, n: number, round: number): Pattern {
  const list = shapesFor(n, rule.pick);
  if (list.length === 0) throw new RangeError(`${n}×${n} 모양이 없다`);
  const order = list
    .map((p) => ({ p, h: sha256Hex(`cube-shape|${rule.key}|${p.id}`) }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0))
    .map((x) => x.p);
  const k = (((round - 1) % order.length) + order.length) % order.length;
  return order[k] as Pattern;
}

/** 목표 하나의 판정과 진행(대결 틀·혼자 하기가 함께 쓴다) */
export interface ShapeGoal {
  pattern: Pattern;
  target: PuzzleState;
  matcher: ShapeMatcher;
  /** 맞춘 큐브가 목표와 같은 칸 비율(진행 0으로 둔다) */
  base: number;
}

const goals = new Map<string, ShapeGoal>();

export function shapeGoal(id: string): ShapeGoal {
  const hit = goals.get(id);
  if (hit) return hit;
  const pattern = patternById(id);
  if (!pattern) throw new RangeError(`모르는 모양: ${id}`);
  const n = pattern.size;
  const target = patternState(n, pattern.alg);
  const matcher = shapeMatcher(n, target);
  const made: ShapeGoal = {
    pattern,
    target,
    matcher,
    base: matcher.closeness(patternState(n, "")),
  };
  goals.set(id, made);
  return made;
}

/**
 * 목표까지의 진행(0~1). 맞춘 큐브를 0, 목표를 1로 두고 같은 칸 비율로 잰다. 섞인 큐브에서 시작하면 앞 절반은 맞추기
 * (맞은 조각 비율의 절반), 뒤 절반이 모양이다. 목표와 같으면 1
 */
export function shapeProgress(
  goal: ShapeGoal,
  state: PuzzleState,
  start: ShapeStart,
): number {
  if (goal.matcher.matches(state)) return 1;
  const n = goal.pattern.size;
  const c = goal.matcher.closeness(state);
  const rel = Math.max(0, Math.min(0.99, (c - goal.base) / (1 - goal.base)));
  if (start === "solved") return rel;
  const solving = isSolved(n, state) ? 0.5 : 0.5 * solvedPieceRatio(n, state);
  return rel > 0 ? Math.max(solving, 0.5 + 0.5 * rel) : solving;
}

/** 진행 글(상대 자리·칩을 끈 때) */
export function shapeStageText(
  goal: ShapeGoal,
  state: PuzzleState,
  start: ShapeStart,
): string {
  if (goal.matcher.matches(state)) return "완성";
  return `목표 ${Math.round(shapeProgress(goal, state, start) * 100)}%`;
}
