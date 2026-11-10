// 숫자야구 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { BASEBALL_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  {
    term: "스트라이크(S)·볼(B)",
    use: /스트라이크|볼|\dS|\dB/,
    define: /스트라이크\(S\)\*\*, 숫자는 있는데/,
  },
  { term: "아웃", use: /아웃/, define: /하나도 없으면 \*\*아웃\*\*/ },
  { term: "후보", use: /후보/, define: /\*\*모두 맞는 수\*\*가 남은 후보/ },
  { term: "선공·후공", use: /선공|후공/, define: /\(\*\*선공\*\*\)/ },
  { term: "공정 규칙", use: /공정 규칙/, define: /\*\*공정 규칙\*\*이라고/ },
  { term: "방장", use: /방장/, define: /\(\*\*방장\*\*\)/ },
  { term: "약속", use: /약속/, define: /약속은 내 수를 나중에/ },
];

termOrderSuite("숫자야구", BASEBALL_LESSONS, TERMS);
