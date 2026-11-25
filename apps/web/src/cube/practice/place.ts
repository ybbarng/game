// 상황 놓기(docs/47 16-24, Cubie·사이트 미니 화면): 공식 연습 자료의 마지막 층 상황 하나를 골라 큐브를 그 모양으로 둔다.
// 시작 모양은 공식 연습 문제와 같다(쥐기 + 상황 만들기, 윗면 돌리기 없음, `caseStart`). 보일 공식은 공식 연습이 고르는 것과
// 같다(내 공식에서 고른 것, 없으면 지금 키 배치로 키가 싼 공식, 그 모양에 맞게 앞에 맞춤을 붙임). 채점·시간·기록은 없다.
// Rust 코어 `practice.rs` `place_case`가 같은 값을 낸다(공통 시험 자료 `practice.json`의 `place`).
import type { PuzzleState } from "@game/puzzle-core";

import type { AlgBook } from "../algs/store";
import type { Keymap } from "../input/keymaps";
import { pickAlg } from "./pick-alg";
import { caseStart, problemOf } from "./problem";
import { stageById } from "./stages";
import type { DrillCase, PracticeStage } from "./types";

/** 상황 놓기에 보일 단계(메뉴 차례): 마지막 층의 2단계 OLL·2단계 PLL과 OLL·PLL 전부 */
export const PLACE_STAGE_IDS = [
  "2look-oll",
  "2look-pll",
  "oll",
  "pll",
] as const;

/** 상황 놓기 메뉴의 단계들. 상황은 단계의 `cases` 차례, 모양 묶음(`group`)이 바뀌는 곳에서 메뉴가 줄을 나눈다 */
export const PLACE_STAGES: PracticeStage[] = PLACE_STAGE_IDS.map(
  (id) => stageById(id) as PracticeStage,
);

export interface PlacedCase {
  stage: PracticeStage;
  case: DrillCase;
  start: PuzzleState;
  /** 보일 공식(맞춤 + 공식) */
  alg: string;
}

/** 상황 하나를 놓는다. 상황 놓기 단계가 아니거나 모르는 상황이면 null */
export function placeCase(
  stageId: string,
  caseId: string,
  keymap: Keymap,
  book: AlgBook = {},
): PlacedCase | null {
  if (!(PLACE_STAGE_IDS as readonly string[]).includes(stageId)) return null;
  const stage = stageById(stageId);
  const c = stage?.cases.find((x) => x.id === caseId);
  if (!stage || !c) return null;
  const alg = problemOf(stage, c, "", pickAlg(c, keymap, book).alg).alg;
  return { stage, case: c, start: caseStart(stage, c), alg };
}
