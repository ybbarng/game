// 은하 한 바퀴 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts). 낱말은 docs/48을 따른다.
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { GALAXY_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "우주인", use: /우주인/, define: /\*\*우주인\*\*이라고/ },
  { term: "정거장", use: /정거장/, define: /그 별에 \*\*정거장\*\*이 서고/ },
  { term: "이용료", use: /이용료/, define: /정거장 \*\*이용료\*\*/ },
  { term: "별빛(✦)", use: /별빛|✦/, define: /\*\*별빛\*\*\(✦\)/ },
  { term: "자산", use: /자산/, define: /\*\*자산\*\*\(별빛/ },
  {
    term: "기본 판·짧은 판",
    use: /기본 판|짧은 판/,
    define: /\(\*\*기본 판\*\*\)/,
  },
  { term: "더블", use: /더블/, define: /\*\*더블\*\*\(주사위 두 개가/ },
  { term: "우주국", use: /우주국/, define: /\*\*카노푸스 우주국\*\*/ },
  {
    term: "정거장 단(1단·2단)",
    use: /\d단(?!원)|단 값|큰 정거장/,
    define: /\*\*정거장 1단\*\*/,
  },
  {
    term: "별자리 완성",
    use: /완성/,
    define: /\*\*별자리 완성\*\*|별자리 완성은 3·4단원/,
  },
  { term: "공문", use: /공문/, define: /\*\*공문\*\* 칸에 멈추면/ },
  {
    term: "등급·광년",
    use: /등급|광년/,
    define: /\*\*등급\*\*\(숫자가 작을수록/,
  },
  {
    term: "봉투 입찰",
    use: /봉투 입찰|봉투에/,
    define: /봉투 입찰\(6단원\)|\*\*몰래 한 번\*\*/,
  },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 입문/ },
];

termOrderSuite("은하 한 바퀴", GALAXY_LESSONS, TERMS);
