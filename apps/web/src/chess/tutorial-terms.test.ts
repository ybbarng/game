// 체스 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { CHESS_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "기물", use: /기물/, define: /\*\*기물\*\*이라고/ },
  { term: "킹", use: /킹/, define: /\*\*킹\*\*은 각 편의 왕/ },
  { term: "폰", use: /폰/, define: /작은 기물 8개는 \*\*폰\*\*/ },
  { term: "체크메이트", use: /체크메이트/, define: /\(\*\*체크메이트\*\*\)/ },
  {
    term: "칸 이름(e4)",
    use: /(^|[^A-Za-z])[a-h][1-8]/,
    define: /세로줄은 왼쪽부터 a~h/,
  },
  { term: "룩", use: /룩/, define: /\*\*룩\*\*은 가로·세로/ },
  { term: "비숍", use: /비숍/, define: /\*\*비숍\*\*은 대각선/ },
  { term: "퀸", use: /퀸/, define: /\*\*퀸\*\*은 룩과 비숍/ },
  { term: "나이트", use: /나이트/, define: /\*\*나이트\*\*는 두 칸/ },
  { term: "승급", use: /승급/, define: /\(승급\)/ },
  { term: "체크", use: /체크(?!메이트)/, define: /\*\*체크\*\*예요/ },
  {
    term: "스테일메이트",
    use: /스테일메이트/,
    define: /\(\*\*스테일메이트\*\*\)/,
  },
  { term: "캐슬링", use: /캐슬링/, define: /\*\*캐슬링\*\*이라고/ },
  {
    term: "앙파상",
    use: /앙파상/,
    define: /제목: 앙파상|title: "앙파상|지나간 칸으로 가며 잡을 수/,
  },
  { term: "오프닝", use: /오프닝/, define: /\*\*오프닝\*\*이라고/ },
  {
    term: "기물 글자(Nf3)",
    use: /[KQRBN][a-h][1-8]/,
    define: /나이트는 N이에요/,
  },
  { term: "상자", use: /상자/, define: /\*\*상자\*\*라고/ },
  { term: "끝내기", use: /끝내기/, define: /\*\*끝내기\*\*라고/ },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 \*\*입문\*\*/ },
];

termOrderSuite("체스", CHESS_LESSONS, TERMS);
