// 나이롱뽕 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { NYRONGPPONG_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "벌점", use: /벌점/, define: /\*\*합이 벌점\*\*/ },
  { term: "선", use: /(^|[^가-힣])선(이|은|\)|에)/, define: /\(\*\*선\*\*\)/ },
  { term: "더미", use: /더미/, define: /\*\*더미\*\*라고/ },
  { term: "약", use: /(^|[^가-힣])약/, define: /\*\*약\*\*이에요/ },
  { term: "뽕", use: /(?<!나이롱)뽕/, define: /\*\*뽕!\*\*을 부를 수/ },
  { term: "바가지", use: /바가지/, define: /\*\*바가지\*\*예요/ },
  { term: "박", use: /(^|[^가-힣])박/, define: /\*\*박\*\*이라고/ },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 입문/ },
];

termOrderSuite("나이롱뽕", NYRONGPPONG_LESSONS, TERMS);
