/*
 * 대국·다시 보기 해설 글의 말투(docs/standing-rules.md 3절). 해설 한 줄은 둘 중 하나다.
 * - 문장: 해요체로 쓰고 마침표(또는 물음표·느낌표)로 끝낸다. 판정은 수 배우기와 같은 `toneProblems`.
 * - 꼬리표: 사실을 「·」로 이은 이름표 줄(「3판 12수째, 민준(흑) 차례 · 따낸 돌 흑 2 · 백 1」, 「다른 후보: ♠K 돈 +20」,
 *   사건 기록 「민준: 헛외침」). 마침표를 찍지 않는다. 대신 조각 하나라도 서술어로 끝나면(「~다」·「~요」)
 *   마침표 없는 문장이라 걸리고, 「~라면」·「~보면」·「~으면」 같은 이어 주는 말이 있으면 문장 조각이라 걸린다.
 * 평가 이름(「좋은 수」)과 행동 한 줄(`review.describe`, 「♠A 내기」)은 단추·칩이라 보지 않는다.
 */
import type { Commentary } from "@/game/kit";
import { toneProblems } from "@/study/tone";

/** 끝에 붙은 괄호 풀이를 뗀다: 「쉬었다(둘이 이어 쉬면…)」 → 「쉬었다」 */
function stripTrailingParens(text: string): string {
  let t = text.trim();
  while (/\([^()]*\)$/.test(t)) t = t.replace(/\([^()]*\)$/, "").trim();
  return t;
}

/** 해설 한 줄이 어긋났으면 그 까닭들 */
export function lineProblems(line: string): string[] {
  const text = line.trim();
  if (text === "") return [];
  if (/[.!?]$/.test(text)) return toneProblems([text]);
  const out: string[] = [];
  for (const piece of text.split(/\s·\s/)) {
    const body = stripTrailingParens(piece);
    // 「묶음마다」의 「마다」는 토씨라 서술어가 아니다
    if (/(다|요|죠)$/.test(body) && !/마다$/.test(body))
      out.push(`마침표 없는 문장: ${text}`);
    else if (/(라면|보면|으면|하면)\s/.test(body))
      out.push(`꼬리표 속 문장 조각: ${text}`);
  }
  return out;
}

/** 해설 줄 여럿에서 어긋난 것을 모은다 */
export function commentaryProblems(lines: readonly string[]): string[] {
  return lines.flatMap(lineProblems);
}

/** 해설 하나의 모든 줄: 상황과 판단·근거 */
export const commentaryLines = (c: Commentary) => [
  ...c.situation,
  ...c.reasons,
];
