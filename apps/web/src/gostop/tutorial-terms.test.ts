// 고스톱 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { GOSTOP_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  {
    term: "광·열끗·띠·피",
    use: /광|열끗|띠|(^|[^가-힣])피/,
    define: /\*\*광\*\*·\*\*열끗\*\*·\*\*띠\*\*·\*\*피\*\*로 나뉘어요/,
  },
  { term: "맞고", use: /맞고/, define: /\*\*맞고\*\*:/ },
  { term: "더미", use: /더미/, define: /\*\*더미\*\*로/ },
  { term: "손패", use: /손패/, define: /\*\*손패\*\*라고/ },
  { term: "먹다", use: /먹/, define: /함께 \*\*먹어요\*\*/ },
  { term: "비광", use: /비광/, define: /\*\*비광\*\*이라고/ },
  { term: "쌍피", use: /쌍피/, define: /\*\*쌍피\*\*는 두 장/ },
  { term: "국진", use: /국진/, define: /\(\*\*국진\*\*\)/ },
  { term: "뻑", use: /뻑/, define: /\*\*뻑\*\*:/ },
  { term: "약", use: /(^|[^가-힣])약/, define: /\*\*약\*\*이라고/ },
  {
    term: "점수가 난다",
    use: /점수가 나|먼저 점수가 나|못 나면/,
    define: /「점수가 난다」/,
  },
  {
    term: "고·스톱",
    use: /(^|[^가-힣])고(를|박|·| 또는|\))|(?<!고)스톱/,
    define: /\*\*스톱\*\*: 지금 점수로/,
  },
  { term: "박", use: /박/, define: /\*\*박\*\*이라고|\*\*고박\*\*이라서/ },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 입문/ },
];

termOrderSuite("고스톱", GOSTOP_LESSONS, TERMS);
