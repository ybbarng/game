// 오목 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { OMOK_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "넷·셋", use: /넷|셋/, define: /\*\*넷\*\*, 셋은 \*\*셋\*\*/ },
  {
    term: "자리 이름(H8)",
    use: /[A-O]\d{1,2}/,
    define: /세로줄은 왼쪽부터 A~O/,
  },
  { term: "열린 넷", use: /열린 넷/, define: /\*\*열린 넷\*\*이라고/ },
  { term: "열린 셋", use: /열린 셋/, define: /\(\*\*열린 셋\*\*\)/ },
  { term: "3·3", use: /3·3/, define: /\*\*3·3\*\*이라고/ },
  { term: "렌주", use: /렌주/, define: /\*\*렌주\*\*\(오목 대회/ },
  {
    term: "4·4·장목",
    use: /4·4|장목/,
    define: /4·4\(넷 두 개\), 장목\(여섯 이상\)/,
  },
  {
    term: "직접·간접",
    use: /직접|간접/,
    define: /\*\*직접\*\*, 대각선으로 붙이면 \*\*간접\*\*/,
  },
  { term: "주형", use: /주형/, define: /\*\*주형\*\*이라고/ },
  {
    term: "사",
    use: /(^|[^가-힣])사(와|를|로|가|는|\(| )/,
    define: /\*\*사\*\*\(한 수 더 두면/,
  },
  { term: "4·3", use: /4·3/, define: /\*\*4·3\*\*으로 만들어요/ },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 \*\*입문\*\*/ },
];

termOrderSuite("오목", OMOK_LESSONS, TERMS);
