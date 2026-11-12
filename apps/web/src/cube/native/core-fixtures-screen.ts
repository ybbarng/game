/**
 * Rust 코어 공통 시험 자료: 화면 상태(docs/52 5-7). 큐브 창이 칠하는 값을 사이트 코드로 만든다.
 * - 가리기(`mask.json`): 가리기 이름 × 크기 → 스티커마다 보임(v)·까맣게(h)·회색(g), 그리고 공식 연습 단계마다
 *   첫 상황의 시작 모양에서 자리마다 칠할 값(사이트 미니 `stickersFromState(…, board.mask)`가 색을 지우는 칸).
 * - 단축키 표 칸 색(`keypaint.json`): 칸마다 면 돌리기·큐브 돌리기 칠하기와 배색마다 칸 바탕·선·사선 색.
 * 꼴과 다시 쓰는 법은 `core-fixtures.ts` 머리말과 같다. 화면은 이 파일을 부르지 않는다(시험 전용).
 */
import {
  faceColors,
  MAX_SIZE,
  MIN_SIZE,
  maskAtSlots,
  type StickerVisibility,
} from "@game/cube-engine";

import type { Keymap } from "../input/keymaps";
import {
  calmLine,
  calmTint,
  HOME_ORIENT,
  keyPaint,
  stripedColor,
  stripeImage,
} from "../keys/key-colors";
import {
  ARROWS,
  KEYBOARD_ROWS,
  keyLayers,
  MODIFIER_LABEL,
} from "../keys/layout";
import { maskFor } from "../learn/judge";
import type { MaskName } from "../learn/types";
import { caseStart, PRACTICE_N } from "../practice/problem";
import { PRACTICE_STAGES } from "../practice/stages";
import { COLOR_SCHEMES } from "../settings";
import { fixtureJson } from "./core-fixtures";
import { forCubie, KEYMAPS } from "./core-fixtures-keytable";

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

// ── 단축키 표(F1) 칸 색 ─────────────────────────────────

/** 칸 하나의 칠하기: [code, "f"(면 돌리기)·"s"(큐브 돌리기·가운데 층), 면 번호, 반대(1/0), 넓게·큐브 돌리기(1/0)] */
function paintCells(keymap: Keymap, n: number): unknown[] {
  const out: unknown[] = [];
  for (const row of KEYBOARD_ROWS)
    for (const { code } of row) {
      if (code === "Gap" || code === ARROWS || code in MODIFIER_LABEL) continue;
      // 사이트 `KeyboardMap` 「모두」: 그냥 칠 때 동작이 쓸 수 있을 때만 칠한다
      const a = keyLayers(keymap, n, code).plain;
      if (!a?.usable) continue;
      const p = keyPaint(n, HOME_ORIENT, a.action);
      if (!p) continue;
      out.push(
        p.kind === "face"
          ? [code, "f", p.color, p.prime ? 1 : 0, p.wide ? 1 : 0]
          : [code, "s", p.color, p.prime ? 1 : 0, p.whole ? 1 : 0],
      );
    }
  return out;
}

export function buildKeyPaint(): string {
  const cases: unknown[] = [];
  for (const [preset, make] of Object.entries(KEYMAPS))
    for (let n = MIN_SIZE; n <= MAX_SIZE; n++)
      cases.push({
        kind: "cells",
        preset,
        n,
        cells: paintCells(forCubie(make()), n),
      });
  // 배색 × 면 × 반대 → 칸 바탕·선·사선 색과 사선을 넣는지(사이트 `useKeyLook`)
  for (const [scheme, colors] of Object.entries(COLOR_SCHEMES))
    colors.forEach((rgb, color) => {
      for (const prime of [false, true])
        cases.push({
          kind: "tone",
          scheme,
          color,
          prime: prime ? 1 : 0,
          tint: calmTint(rgb, prime),
          line: calmLine(rgb),
          stripe: Number.parseInt(
            stripeImage(rgb, prime).match(/#([0-9a-f]{6})/)?.[1] ?? "",
            16,
          ),
          striped: stripedColor(scheme, color) ? 1 : 0,
        });
    });
  return fixtureJson(
    {
      what: "단축키 표(F1) 칸 색. cells: 키 배치 × 크기 → 칸마다 [code, f(면 돌리기)·s(큐브 돌리기·가운데 층), 면 번호, 반대, 넓게·큐브 돌리기], 처음 방향. tone: 배색 × 면 × 반대 → 칸 바탕(tint)·선(line)·사선(stripe) 색(24비트 수)과 사선을 넣는지",
    },
    cases,
  );
}
