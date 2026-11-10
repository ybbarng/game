// 민화투 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { MINHWATU_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  {
    term: "광·열끗·띠·피",
    use: /광|열끗|띠|(^|[^가-힣])피/,
    define: /광은 光 글자가 적힌 카드/,
  },
  { term: "손패", use: /손패/, define: /\(\*\*손패\*\*\)/ },
  { term: "바닥", use: /바닥/, define: /\(\*\*바닥\*\*\)/ },
  { term: "더미", use: /더미/, define: /\(\*\*더미\*\*\)/ },
  { term: "먹다", use: /먹/, define: /\*\*먹는다\*\*고/ },
  { term: "본", use: /(^|[^가-힣])본/, define: /\(\*\*본\*\*\)/ },
  { term: "약", use: /(^|[^가-힣])약/, define: /\*\*약\*\*이라고/ },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 입문/ },
];

termOrderSuite("민화투", MINHWATU_LESSONS, TERMS);
