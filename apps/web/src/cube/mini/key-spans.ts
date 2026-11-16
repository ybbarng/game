// 앱 말풍선에서 수 표기와 키를 가르는 낱말 꼴(docs/47 4-4 「수 표기와 키」). 사이트 `KeyCaps`와 같은 규칙:
// 키는 하나씩 키캡(key), 한 수의 키가 여럿이면 같은 키는 나란히(I I), 다른 키로 넘어가면 차례 화살(2 → R).
// 수가 여럿이면 수 사이에 「 · 」. 키가 없는 수는 「?」. 코어 `cubie-native` `key_spans`가 같은 꼴을 낸다.
import type { KeyChord, Keymap } from "../input/keymaps";
import { keycapLabel, keysForMove } from "../keys/move-keys";
import type { BubbleSpan } from "./app-bridge";

/** 수 하나의 키 낱말(키 없음은 「?」) */
export function moveKeySpans(keys: KeyChord[] | null): BubbleSpan[] {
  if (!keys || keys.length === 0) return [{ text: "?", style: "plain" }];
  const out: BubbleSpan[] = [];
  keys.forEach((k, i) => {
    const label = keycapLabel(k);
    if (i > 0) {
      const same = keycapLabel(keys[i - 1] as KeyChord) === label;
      out.push(
        same ? { text: " ", style: "plain" } : { text: " → ", style: "arrow" },
      );
    }
    out.push({ text: label, style: "key" });
  });
  return out;
}

/** 공식 한 줄의 수마다 키 낱말을 「 · 」로 잇는다 */
export function algKeySpans(
  keymap: Keymap,
  n: number,
  moves: string[],
): BubbleSpan[] {
  const out: BubbleSpan[] = [];
  moves.forEach((m, i) => {
    if (i > 0) out.push({ text: " · ", style: "plain" });
    out.push(...moveKeySpans(keysForMove(keymap, n, m)));
  });
  return out;
}

/** 낱말을 이은 글(꼴을 모르는 앱이 그리는 `text`) */
export function spansText(spans: BubbleSpan[]): string {
  return spans.map((s) => s.text).join("");
}
