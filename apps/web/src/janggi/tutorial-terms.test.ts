// 장기 튜토리얼(수 배우기 단원 포함)이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { JANGGI_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "기물", use: /기물/, define: /\*\*기물\*\*이라고/ },
  { term: "궁", use: /궁(?!성)/, define: /\*\*궁\*\*은 각 편의 임금/ },
  { term: "외통", use: /외통/, define: /\*\*외통\*\*이라고/ },
  { term: "병·졸", use: /병|졸/, define: /\*\*졸\*\*이라고/ },
  {
    term: "자리 이름(79)",
    use: /(^|[^\d.])\d{2}(?![\d개수점칸줄가지번문])/,
    define: /가로줄 숫자를 먼저/,
  },
  { term: "기보", use: /기보/, define: /\*\*기보\*\*라고/ },
  { term: "포", use: /(?<!차·)포(?!진|·마)/, define: /\*\*포\(包\)\*\*/ },
  { term: "멱", use: /멱/, define: /\*\*멱\*\*이라고/ },
  { term: "궁성", use: /궁성/, define: /\*\*궁성\*\* 안에서만/ },
  { term: "장군", use: /장군/, define: /\*\*장군\*\*이에요/ },
  { term: "빅장", use: /빅장/, define: /\*\*마주 보면 빅장\*\*/ },
  { term: "덤", use: /덤/, define: /\(덤\)/ },
  { term: "찻길", use: /찻길/, define: /\*\*찻길\*\*이라고/ },
  { term: "상차림·차림", use: /차림/, define: /\*\*상차림\*\*\(줄여서/ },
  { term: "포진", use: /포진/, define: /\*\*포진\*\*이라고/ },
  {
    term: "귀·면",
    use: /(^|[^가-힣])귀|면\(|면포|면으로|면을|면에/,
    define: /\*\*귀\*\*는 궁성 윗줄/,
  },
  { term: "귀마·진마", use: /귀마|진마/, define: /\*\*귀마\*\* 차림/ },
  { term: "면포", use: /면포/, define: /\*\*면포\*\*까지/ },
  { term: "원앙마", use: /원앙마/, define: /포진이 \*\*원앙마\*\*/ },
  { term: "양귀마", use: /양귀마/, define: /\*\*양귀마\*\*예요/ },
  { term: "맞상", use: /맞상/, define: /\*\*맞상\*\*이라고/ },
  { term: "쓸다", use: /쓸어|쓸기|옆으로 쓸/, define: /「쓴다」고/ },
  { term: "정석", use: /정석/, define: /\*\*정석\*\*이라고/ },
  { term: "진", use: /(상대|한) 진/, define: /\(\*\*진\*\*\)/ },
  { term: "천궁", use: /천궁/, define: /\(\*\*천궁\*\*/ },
  { term: "변병", use: /변병/, define: /\*\*변병\*\*이라고/ },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 \*\*입문\*\*/ },
];

termOrderSuite("장기", JANGGI_LESSONS, TERMS);
