// 미니 화면의 상황 놓기(docs/47 16-24): 놓은 상황과 말풍선 줄. 상황·시작 모양·공식은 `practice/place.ts`.
// 말풍선 줄은 코어 `cubie-native/src/place.rs` `place_lines`와 같은 글이다: 「단계 · 상황 이름」, 펼쳤으면 공식 줄과
// 그 키 줄(수 표기는 고정폭 글자, 키는 키캡 상자, docs/47 4-4 「수 표기와 키」).
import type { Keymap } from "../input/keymaps";
import { algTokens } from "../learn/notation";
import type { PlacedCase } from "../practice/place";
import { PRACTICE_N } from "../practice/problem";
import type { BubbleLine } from "./app-bridge";
import { algKeySpans, spansText } from "./key-spans";

/** 놓은 상황 하나와 공식을 펼쳤는지 */
export interface MiniPlaced {
  placed: PlacedCase;
  revealed: boolean;
}

/** 말풍선 제목: 단계 이름 · 상황 이름 */
export function placeTitle(p: PlacedCase): string {
  return `${p.stage.title} · ${p.case.name}`;
}

/** 보일 공식 낱말(괄호를 뺀 것) */
export function placeTokens(p: PlacedCase): string[] {
  return algTokens(p.alg);
}

export function placeBubbleLines(
  m: MiniPlaced,
  keymap: Keymap | null,
): BubbleLine[] {
  const lines: BubbleLine[] = [{ text: placeTitle(m.placed), style: "title" }];
  if (!m.revealed) return lines;
  const tokens = placeTokens(m.placed);
  lines.push({ text: tokens.join(" "), style: "alg" });
  if (keymap) {
    const spans = algKeySpans(keymap, PRACTICE_N, tokens);
    lines.push({ text: spansText(spans), style: "keys", spans });
  }
  return lines;
}
