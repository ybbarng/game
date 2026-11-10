// 바둑 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { BADUK_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "덤", use: /덤/, define: /\*\*덤\*\* 7.5점/ },
  {
    term: "점 이름(E4)",
    use: /(^|[^A-Z])[A-HJ-T]\d/,
    define: /세로줄 글자와 가로줄 숫자/,
  },
  { term: "한 점(돌 세기)", use: /한 점|두 점/, define: /\*\*한 점\*\*/ },
  { term: "활로", use: /활로/, define: /\*\*활로\*\*\(숨 쉴 곳\)/ },
  { term: "따내기", use: /따내|따낸|따낼/, define: /\*\*따내기\*\*예요/ },
  { term: "단수", use: /단수/, define: /\(\*\*단수\*\*\)/ },
  { term: "뻗다", use: /뻗/, define: /\*\*뻗는다\*\*고/ },
  { term: "무리", use: /무리/, define: /한 무리가 되어/ },
  { term: "자살수", use: /자살수/, define: /\*\*자살수\*\*라고/ },
  { term: "귀", use: /(^|[^가-힣])귀/, define: /\*\*귀\*\*라고/ },
  { term: "패", use: /(^|[^가-힣])패/, define: /\*\*패\*\*라고/ },
  { term: "팻감", use: /팻감/, define: /\*\*팻감\*\*이라고/ },
  {
    term: "쉬기",
    use: /쉬기|쉬면|쉬어|쉰다|쉬었/,
    define: /\*\*쉬기\*\*를 눌러요/,
  },
  { term: "집", use: /(^|[^가-힣])집/, define: /\*\*집\*\*이라고/ },
  { term: "눈", use: /눈/, define: /\*\*눈\*\*이라고/ },
  {
    term: "산 돌·죽은 돌",
    use: /산 돌|죽은 돌|살아|살았|살 수|살려/,
    define: /\*\*산 돌\*\*/,
  },
  { term: "변", use: /(^|[^가-힣])변/, define: /\*\*변\*\*이라고/ },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 \*\*입문\*\*/ },
];

termOrderSuite("바둑", BADUK_LESSONS, TERMS);
