/**
 * Rust 코어 공통 시험 자료: 화면 상태(docs/52 5-7). 큐브 창이 칠하는 값을 사이트 코드로 만든다.
 * - 가리기(`mask.json`): 가리기 이름 × 크기 → 스티커마다 보임(v)·까맣게(h)·회색(g), 그리고 공식 연습 단계마다
 *   첫 상황의 시작 모양에서 자리마다 칠할 값(사이트 미니 `stickersFromState(…, board.mask)`가 색을 지우는 칸).
 * 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다. 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import {
  faceColors,
  MAX_SIZE,
  MIN_SIZE,
  maskAtSlots,
  type StickerVisibility,
} from "@game/cube-engine";

import { maskFor } from "../learn/judge";
import type { MaskName } from "../learn/types";
import { caseStart, PRACTICE_N } from "../practice/problem";
import { PRACTICE_STAGES } from "../practice/stages";
import { fixtureJson } from "./core-fixtures";

/** 코어가 옮긴 가리기 이름(공식 연습 단계가 쓰는 것 전부 + 같은 틀의 이름) */
export const CORE_MASKS: readonly MaskName[] = [
  "none",
  "centers",
  "corners",
  "first-layer",
  "cross",
  "f2l",
  "oll",
  "pll",
  "eo-edges",
  "ll-cross",
  "ll-edges",
];

const LETTER: Record<StickerVisibility, string> = {
  visible: "v",
  hidden: "h",
  gray: "g",
};
const letters = (m: readonly StickerVisibility[]) =>
  m.map((v) => LETTER[v]).join("");

export function buildMask(): string {
  const cases: unknown[] = [];
  for (const name of CORE_MASKS)
    for (let n = MIN_SIZE; n <= MAX_SIZE; n++) {
      const m = maskFor(n, name);
      if (!m) throw new Error(`가리기 ${name}이 없다`);
      cases.push({ kind: "mask", name, n, mask: letters(m) });
    }
  for (const stage of PRACTICE_STAGES) {
    const c = stage.cases[0];
    if (!c) continue;
    const start = caseStart(stage, c);
    const m = maskFor(PRACTICE_N, stage.mask);
    cases.push({
      kind: "stage",
      stage: stage.id,
      mask: stage.mask,
      case: c.id,
      colors: Array.from(faceColors(PRACTICE_N, start)).join(""),
      // 가리지 않는 단계("all")는 빈 글
      slots: m ? letters(maskAtSlots(start, m)) : "",
    });
  }
  return fixtureJson(
    {
      what: "가리기 이름 × 크기 → 스티커마다 v(보임)·h(까맣게)·g(회색). 공식 연습 단계마다 첫 상황의 시작 모양(색)과 자리마다 칠할 값(빈 글은 가리지 않음)",
    },
    cases,
  );
}
