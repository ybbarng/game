// 바둑 수 배우기 단원이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
// 규칙 배우기를 마친 사람이 읽으니, 규칙 배우기 단원을 앞에 이어 읽는다.
import type { OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { BADUK_STUDY_LESSONS } from "./study-lessons";
import { BADUK_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "활로", use: /활로/, define: /\*\*활로\*\*\(숨 쉴 곳\)/ },
  { term: "단수", use: /단수/, define: /\(\*\*단수\*\*\)/ },
  { term: "뻗다", use: /뻗/, define: /\*\*뻗는다\*\*고/ },
  { term: "귀", use: /(^|[^가-힣])귀/, define: /\*\*귀\*\*라고/ },
  { term: "변", use: /(^|[^가-힣])변/, define: /\*\*변\*\*이라고/ },
  { term: "집", use: /(^|[^가-힣])집/, define: /\*\*집\*\*이라고/ },
  { term: "패", use: /(^|[^가-힣])패/, define: /\*\*패\*\*라고/ },
  { term: "팻감", use: /팻감/, define: /\*\*팻감\*\*이라고/ },
  // 규칙 배우기의 「덤을 더 받아요」는 다른 뜻이라 뺀다
  {
    term: "받기",
    use: /받(는다|기|으면|는 사이|은 거|고)/,
    define: /\*\*받는다\*\*고/,
  },
  { term: "패 잇기", use: /패를 이|패 잇기/, define: /\*\*패 잇기\*\*/ },
  {
    term: "패에 걸린 돌",
    use: /패에 걸린/,
    define: /\*\*패에 걸린 돌\*\*이라고/,
  },
  {
    term: "단수를 치다",
    use: /단수를 (치|쳐|친)|단수 치/,
    define: /\*\*단수를 친다\*\*고/,
  },
  { term: "몰다", use: /몰(아|면|지|고|았)|모는/, define: /\*\*몬다\*\*고/ },
  { term: "축", use: /(^|[^가-힣])축(?!머리)/, define: /\*\*축\*\*이라고/ },
  { term: "축머리", use: /축머리/, define: /\*\*축머리\*\*라고/ },
  { term: "장문", use: /장문/, define: /\*\*장문\*\*\(/ },
  { term: "포석", use: /포석/, define: /\*\*포석\*\*이라고/ },
  { term: "화점", use: /화점/, define: /\*\*화점\*\*이라고/ },
  { term: "소목", use: /소목/, define: /\*\*소목\*\*이에요/ },
  { term: "삼삼", use: /삼삼/, define: /\*\*삼삼\*\*이에요/ },
  { term: "굳힘", use: /굳힘|굳히/, define: /\*\*굳힘\*\*이라고/ },
  { term: "벌림", use: /벌림|벌리/, define: /\*\*벌림\*\*이라고/ },
  { term: "이연성", use: /이연성/, define: /\*\*이연성\*\*/ },
  { term: "삼연성", use: /삼연성/, define: /\*\*삼연성\*\*/ },
];

termOrderSuite(
  "바둑 수 배우기",
  [...BADUK_LESSONS, ...BADUK_STUDY_LESSONS],
  TERMS,
);
