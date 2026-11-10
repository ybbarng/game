// 3×3 처음 맞추기의 용어 목록(2026-11-10 사용자 「처음 보는 용어는 최대한 풀어서 쓰거나, 먼저 의미를 알려 주고
// 쓰기. 갑자기 새로운 단어를 설명 없이 쓰지 않기」). 용어마다 글에서 찾는 꼴(use)과 뜻을 알리는 문장의 꼴(define)을
// 둔다. 시험(glossary-333.test.ts)이 단원 차례대로 읽어, 뜻을 알리기 전에 쓴 곳이 없는지 본다.

export interface GlossaryTerm {
  term: string;
  /** 글에서 이 용어를 쓴 곳 */
  use: RegExp;
  /** 뜻을 알리는 문장(이 꼴이 처음 나온 단계가 뜻을 알린 곳) */
  define: RegExp;
}

export const GLOSSARY_333: GlossaryTerm[] = [
  { term: "스티커", use: /스티커/, define: /「스티커」/ },
  { term: "조각", use: /조각/, define: /「조각」/ },
  { term: "센터", use: /센터/, define: /「센터」/ },
  { term: "윗면", use: /윗면/, define: /「윗면」/ },
  { term: "앞면", use: /앞면/, define: /「앞면」/ },
  { term: "아랫면", use: /아랫면/, define: /「아랫면」/ },
  { term: "오른쪽 면", use: /오른쪽 면/, define: /「오른쪽 면」/ },
  { term: "왼쪽 면", use: /왼쪽 면/, define: /「왼쪽 면」/ },
  { term: "뒷면", use: /뒷면/, define: /「뒷면」/ },
  { term: "엣지", use: /엣지/, define: /「엣지」/ },
  { term: "코너", use: /코너/, define: /「코너」/ },
  { term: "층", use: /층/, define: /「층」/ },
  {
    term: "위 층·가운데 층·아래 층",
    use: /위 층|가운데 층|아래 층/,
    define: /「위 층」, 「가운데 층」, 「아래 층」/,
  },
  { term: "둘째 층", use: /둘째 층/, define: /세어 둘째 층/ },
  { term: "옆면", use: /옆면/, define: /「옆면」/ },
  {
    term: "색으로 부르는 조각 이름(흰-초록 엣지)",
    use: /(흰|빨강|초록|파랑|주황|노랑)-(흰|빨강|초록|파랑|주황|노랑)/,
    define: /「흰-초록 엣지」/,
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
