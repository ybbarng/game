// 윷놀이 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { YUT_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "참먹이", use: /참먹이/, define: /\*\*참먹이\*\*에서 나가/ },
  {
    term: "나다",
    use: /난 사람|나요|났어요|나게|나기|날 수/,
    define: /\*\*난다\*\*고/,
  },
  { term: "칸 번호", use: /\d+번 칸/, define: /1번, 2번…이라고/ },
  { term: "배·등", use: /배가|배 하나|등이/, define: /\*\*평평\(배\)\*\*/ },
  { term: "새 말 내기", use: /새 말/, define: /\*\*새 말 내기\*\*라고/ },
  {
    term: "모·뒷모(모서리 칸)",
    use: /뒷모|모서리/,
    define: /모서리 칸 \*\*모\*\*/,
  },
  {
    term: "방",
    use: /(^|[^가-힣])방(에|으로|을|까지|\*|·)/,
    define: /가운데 \*\*방\*\*/,
  },
  { term: "지름길", use: /지름길/, define: /대각선 \*\*지름길\*\*/ },
  { term: "업다", use: /업/, define: /\*\*업는다\*\*고/ },
  { term: "빽도", use: /빽도/, define: /\*\*빽도\*\*, 한 칸/ },
  { term: "도 자리", use: /도 자리/, define: /\(\*\*도 자리\*\*\)/ },
  { term: "방장", use: /방장/, define: /\(\*\*방장\*\*\)/ },
  {
    term: "해시 사슬·약속·고리",
    use: /사슬|약속|고리/,
    define: /\(\*\*해시 사슬\*\*\)/,
  },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 입문/ },
];

termOrderSuite("윷놀이", YUT_LESSONS, TERMS);
