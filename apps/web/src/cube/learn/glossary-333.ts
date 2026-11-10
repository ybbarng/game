// 3×3 처음 맞추기의 용어 목록(2026-11-10 사용자 「처음 보는 용어는 최대한 풀어서 쓰거나, 먼저 의미를 알려 주고
// 쓰기. 갑자기 새로운 단어를 설명 없이 쓰지 않기」). 용어마다 글에서 찾는 꼴(use)과 뜻을 알리는 문장의 꼴(define)을
// 둔다. 시험(glossary-333.test.ts)이 단원 차례대로 읽어, 뜻을 알리기 전에 쓴 곳이 없는지 본다.

import type { OrderedTerm } from "@/tutorial/term-order";

/** 용어 하나: 글에서 쓴 꼴(use)과 뜻을 알리는 문장의 꼴(define). 모든 학습 자료가 같은 틀(`@/tutorial/term-order`)을 쓴다 */
export type GlossaryTerm = OrderedTerm;

export const GLOSSARY_333: GlossaryTerm[] = [
  { term: "스티커", use: /스티커/, define: /「스티커」/ },
  { term: "조각", use: /조각/, define: /「조각」/ },
  { term: "센터 블럭", use: /센터/, define: /「센터 블럭」/ },
  { term: "윗면", use: /윗면/, define: /「윗면」/ },
  { term: "앞면", use: /앞면/, define: /「앞면」/ },
  { term: "아랫면", use: /아랫면/, define: /「아랫면」/ },
  { term: "오른쪽 면", use: /오른쪽 면/, define: /「오른쪽 면」/ },
  { term: "왼쪽 면", use: /왼쪽 면/, define: /「왼쪽 면」/ },
  { term: "뒷면", use: /뒷면/, define: /「뒷면」/ },
  { term: "엣지 블럭", use: /엣지/, define: /「엣지 블럭」/ },
  { term: "코너 블럭", use: /코너/, define: /「코너 블럭」/ },
  { term: "층", use: /층/, define: /「층」/ },
  {
    term: "위 층·가운데 층·아래 층",
    use: /위 층|가운데 층|아래 층/,
    define: /「위 층」, 「가운데 층」, 「아래 층」/,
  },
  { term: "둘째 층", use: /둘째 층/, define: /세어 둘째 층/ },
  { term: "옆면", use: /옆면/, define: /「옆면」/ },
  {
    term: "색으로 부르는 조각 이름(흰-초록 엣지 블럭)",
    use: /(흰|빨강|초록|파랑|주황|노랑)-(흰|빨강|초록|파랑|주황|노랑)/,
    define: /「흰-초록 엣지 블럭」/,
  },
  { term: "제자리", use: /제자리/, define: /「제자리」/ },
  { term: "방향", use: /방향/, define: /「방향」/ },
  { term: "뒤집힘", use: /뒤집혀|뒤집혔|뒤집힌/, define: /방향이 틀려 뒤집혀/ },
  { term: "돌아감", use: /돌아가 있|돌아간/, define: /「돌아가 있다」/ },
  { term: "흰 십자", use: /흰 십자/, define: /「흰 십자」/ },
  {
    term: "면 글자(U·D·R·L·F·B)",
    use: /(^|[^A-Za-z])[UDRLFB](['2]|(?![A-Za-z]))/,
    define: /U 윗면, D 아랫면/,
  },
  { term: "시계 방향", use: /시계 방향/, define: /시계 방향은 시곗바늘/ },
  { term: "작은따옴표(')", use: /[UDRLFBxyz]'/, define: /작은따옴표 '/ },
  { term: "반 바퀴(2)", use: /[UDRLFBxyz]2/, define: /2가 붙으면 반 바퀴/ },
  { term: "공식", use: /공식/, define: /「공식」/ },
  {
    term: "치다(수를 친다)",
    use: /쳐|치면|칠까요|치고|치며|치는|친 /,
    define: /키를 눌러 수를 쳐요/,
  },
  {
    term: "큐브 돌려 쥐기(x·y·z)",
    use: /(^|[^A-Za-z])[xyz](['2]|(?![A-Za-z]))/,
    define: /x, y, z는 면 하나가 아니라/,
  },
  { term: "거꾸로 치기", use: /거꾸로/, define: /「거꾸로 친다」/ },
  { term: "맞춘 면", use: /맞춘 면/, define: /「맞춘 면」/ },
  { term: "반대 면", use: /반대 면/, define: /「반대 면」/ },
  { term: "안전한 회전", use: /안전한 회전/, define: /「안전한 회전」/ },
  {
    term: "짝 색(흰 엣지의 흰색 아닌 쪽)",
    use: /짝 색/,
    define: /「짝 색」/,
  },
  {
    term: "두 면 사이 자리 이름(아래-앞)",
    use: /(아래|위|앞|뒤)-(앞|오른쪽|왼쪽|뒤)(?! (위|아래))/,
    define: /두 면 이름을 이어 불러요/,
  },
  {
    term: "세 면이 만나는 구석 이름(앞-오른쪽 위)",
    use: /(앞|뒤|오른쪽)-(오른쪽|왼쪽|뒤) (위|아래)/,
    define: /「앞-오른쪽 위」/,
  },
  { term: "첫 층", use: /첫 층/, define: /「첫 층」/ },
  { term: "코너 돌리기", use: /코너 돌리기/, define: /「코너 돌리기」/ },
  { term: "옆 색·위 색", use: /옆 색|위 색/, define: /「옆 색」/ },
  { term: "앞에서 넣기", use: /앞에서 넣기/, define: /「앞에서 넣기」/ },
  {
    term: "오른쪽에서 넣기",
    use: /오른쪽에서 넣기/,
    define: /「오른쪽에서 넣기」/,
  },
  { term: "ㄱ자", use: /ㄱ자/, define: /「ㄱ자」/ },
  { term: "일자", use: /일자/, define: /「일자」/ },
  { term: "노란 십자", use: /노란 십자/, define: /「노란 십자」/ },
  {
    term: "옆면 맞추기 공식",
    use: /옆면 맞추기」 공식|옆면 맞추기 공식/,
    define: /「옆면 맞추기」 공식/,
  },
  {
    term: "코너 자리 공식",
    use: /코너 자리」 공식|코너 자리 공식/,
    define: /「코너 자리」 공식/,
  },
];

// ── 조각 이름(docs/47 1절 「(2026-11-05) 조각 이름」, docs/standing-rules.md 2절) ──────────────
// 조각은 「센터 블럭」·「엣지 블럭」·「코너 블럭」이다. 조각 하나를 홀로 부르거나 색을 모두 대어 부르면 블럭을
// 붙이고(「그 엣지 블럭」, 「흰-초록 엣지 블럭」), 앞에 다른 말이 붙어 묶음·자리를 말하는 꼴은 뺀다(「흰 엣지」,
// 「첫 층 코너」, 「옆 센터」, 「앞-오른쪽 위 코너」). 뒤에 이름이 이어지는 꼴(「코너 방향」, 「엣지 짝」)도 뺀다.

const PIECE = /센터|엣지|코너/g;
const COLOR = "흰|빨강|초록|파랑|주황|노랑";
/** 색을 모두 대어 부르는 이름(「흰-초록」, 「흰-초록-빨강」, 「노랑-초록-주황」) */
const FULL_NAME = new RegExp(`(${COLOR})(-(${COLOR}))+ $`);
/**
 * 뒤에 이어 붙는 이름. 중급 과정의 단계·공식 이름(「엣지 공식」, 「코너 단계」, 「엣지 보내기」, 「엣지: 가로줄」),
 * 그 조각의 칸·스티커(「코너 칸」, 「엣지 스티커」), 블라인드의 「엣지 버퍼」·「엣지 글자」, 큰 큐브의 「센터 막대」, 단계 차례(「센터 → 엣지」)
 */
const JOINED_AFTER =
  /^( 블럭| ?방향| ?자리| ?돌리기| ?짝| 색| 공식| 단계| 보내기| 묶기| 칸| 스티커| 버퍼| 글자| 막대|:| →)/;
/**
 * 앞에 붙어도 되는 말(묶음·자리를 말하는 꼴). 색(「흰 엣지」), 자리(「옆 센터」, 「첫 층 코너」, 「앞-오른쪽 위 코너」,
 * 「위-앞 엣지」), 무엇을 하는 조각인지(「넣을 엣지」, 「돌아간 코너」, 「기준 코너」)
 */
const JOINED_BEFORE = new Set([
  "흰",
  "노란",
  "빨강",
  "초록",
  "파랑",
  "주황",
  "노랑",
  "옆",
  "층",
  "위층",
  "아래층",
  "위",
  "아래",
  "앞",
  "뒤",
  "오른쪽",
  "왼쪽",
  "제자리",
  "넣을",
  "돌아간",
  "남은",
  "다음",
  "빠진",
  "든",
  "기준",
  "이웃",
  "십자",
  "색",
  "면",
  "쪽",
  // 단계 차례(「엣지 → 코너」)와 큰 큐브 단계 이름(「4×4 센터」)
  "→",
  "4×4",
  "5×5",
]);

/** 받침이 ㄴ·ㄹ인 말(「넣을」, 「돌아간」, 「붙은」, 「보는」): 꾸미는 말이 붙은 묶음 */
function adnominal(word: string): boolean {
  const code = (word.at(-1) ?? "").charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return false;
  const tail = code % 28;
  return tail === 4 || tail === 8;
}

/**
 * 글에서 블럭을 붙여야 하는데 뺀 곳(앞뒤 몇 글자). 큰 큐브(`bigCube`)는 엣지 한 줄을 「엣지」, 면마다 모은 센터 블럭
 * 묶음을 「센터」라 부르므로(docs/47 1절 「큰 큐브」, 하나하나는 「날개」·「센터 블럭」) 엣지·센터는 보지 않는다
 */
export function loosePieceWords(
  text: string,
  opts: { bigCube?: boolean } = {},
): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PIECE)) {
    if (opts.bigCube && m[0] !== "코너") continue;
    const at = m.index ?? 0;
    const before = text.slice(0, at);
    const after = text.slice(at + m[0].length);
    const near = text.slice(Math.max(0, at - 12), at + m[0].length + 6);
    if (FULL_NAME.test(before)) {
      if (!/^ 블럭/.test(after)) out.push(near);
      continue;
    }
    if (JOINED_AFTER.test(after)) continue;
    // 「가운데 층의 엣지」는 「가운데 층 엣지」와 같다
    const prev = (before.match(/(\S+) $/)?.[1] ?? "").replace(/(.)의$/, "$1");
    if (
      JOINED_BEFORE.has(prev) ||
      adnominal(prev) ||
      // 「앞-오른쪽」, 「위-앞」처럼 자리를 이어 부른 말, 「흰·초록·빨강 센터」처럼 여럿을 함께 부른 말
      /^[가-힣]+[-·][가-힣·-]+$/.test(prev)
    )
      continue;
    out.push(near);
  }
  return out;
}
