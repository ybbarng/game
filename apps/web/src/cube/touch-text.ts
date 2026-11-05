/**
 * 키보드 없는 기기의 글(2026-11-05 점검): 배우기 글은 「R을 쳐 보세요」처럼 키보드로 치는 것을 전제한다.
 * 휴대폰은 큐브를 밀거나 단추·키 그림을 눌러 돌리므로 「돌려 보세요」로 읽히게 바꾼다. 수 표기와 다른 글은 그대로 둔다.
 */
const TOUCH_WORDS: [RegExp, string][] = [
  [/힌트의 키를 눌러요/g, "힌트를 봐요"],
  [/쳐 보세요/g, "돌려 보세요"],
  [/쳐 봐요/g, "돌려 봐요"],
  [/쳐서/g, "돌려서"],
  [/더 쳐 /g, "더 돌려 "],
];

export function touchText(text: string, noKeyboard: boolean): string {
  if (!noKeyboard) return text;
  let out = text;
  for (const [from, to] of TOUCH_WORDS) out = out.replace(from, to);
  return out;
}
