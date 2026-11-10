// 하트 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { HEARTS_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "턴", use: /턴/, define: /한 바퀴를 \*\*턴\*\*/ },
  { term: "먹다", use: /먹/, define: /모두 \*\*먹어요\*\*/ },
  { term: "점수 카드", use: /점수 카드/, define: /\*\*점수 카드\*\*라고/ },
  {
    term: "선",
    use: /선이 |선 무늬|선일 때|다음 턴의 선/,
    define: /\*\*선\*\*이라고/,
  },
  { term: "버리다", use: /버리|버릴|버린/, define: /\*\*버린다\*\*고/ },
  {
    term: "무늬 이름 턴(다이아몬드 턴)",
    use: /(다이아몬드|스페이드|하트|클로버) 턴/,
    define: /\*\*다이아몬드 턴\*\*/,
  },
  { term: "하트 깨기", use: /깨지|깨기|깨졌/, define: /\*\*하트가 깨졌다\*\*/ },
  { term: "문 슛", use: /문 슛|문을/, define: /\*\*문 슛\*\*이라고/ },
];

termOrderSuite("하트", HEARTS_LESSONS, TERMS);
