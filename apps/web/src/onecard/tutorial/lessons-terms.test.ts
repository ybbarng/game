// 원카드 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { ONECARD_LESSONS } from "./lessons";

const TERMS: OrderedTerm[] = [
  {
    term: "흑백 조커·컬러 조커",
    use: /흑백 조커|컬러 조커/,
    define: /조커 2장\(\*\*흑백 조커\*\*/,
  },
  { term: "버린 더미", use: /버린 더미/, define: /\*\*버린 더미\*\*라고/ },
  {
    term: "가져올 더미",
    use: /가져올 더미/,
    define: /\*\*가져올 더미\*\*예요/,
  },
  { term: "먹다", use: /먹/, define: /\*\*먹는다\*\*고/ },
  { term: "손패", use: /손패/, define: /\(\*\*손패\*\*\)/ },
  { term: "공격·받아치기", use: /받아치|받아쳐/, define: /\*\*받아쳐서\*\*/ },
  { term: "헛외침", use: /헛외침/, define: /미리 치면 헛외침/ },
  { term: "잡힘", use: /잡혀|잡기|잡으|잡았/, define: /\(잡힘\)/ },
  { term: "파산", use: /파산/, define: /\*\*파산\*\*해서/ },
];

termOrderSuite("원카드", ONECARD_LESSONS, TERMS);
