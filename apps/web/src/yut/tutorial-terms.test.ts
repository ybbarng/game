// 윷놀이 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
import { describe, expect, it } from "vitest";

import { lessonPlaces, type OrderedTerm } from "@/tutorial/term-order";
import { termOrderSuite } from "@/tutorial/term-order-suite";

import { YUT_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "참먹이", use: /참먹이/, define: /\*\*참먹이\*\*에서 나가/ },
  {
    term: "나다",
    use: /난 사람|(^|[^끝])나요|났어요|나게|나기|날 수/,
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
  {
    // 2단원 미션이 결과 둘(개·걸)을 쓰므로 거기서 뜻을 알린다. 왜 모이는지(윷·모, 잡기)는 3·4단원
    term: "모은 결과",
    use: /모였|모이면|모인|모아 두|모아 둬|모은 결과/,
    define: /\*\*모은 결과\*\*라고|\*\*모아 두었다가\*\*/,
  },
  { term: "빽도", use: /빽도/, define: /\*\*빽도\*\*, 한 칸/ },
  { term: "도 자리", use: /도 자리/, define: /\(\*\*도 자리\*\*\)/ },
  { term: "멍석", use: /멍석/, define: /둥근 깔개 \*\*멍석\*\*/ },
  { term: "낙", use: /낙/, define: /\*\*낙\*\*이라고/ },
  { term: "방장", use: /방장/, define: /\(\*\*방장\*\*\)/ },
  {
    term: "비밀 값",
    use: /비밀 값|모두의 값|다음 값/,
    define: /\*\*비밀 값\*\*을/,
  },
  { term: "봉인", use: /봉인|봉한/, define: /\*\*봉인\*\*해 .*봉인은 봉투/ },
  { term: "몸짓", use: /몸짓/, define: /\*\*몸짓\*\*\(/ },
  { term: "입문 컴퓨터", use: /입문/, define: /가장 쉬운 단계인 입문/ },
];

termOrderSuite("윷놀이", YUT_LESSONS, TERMS);

describe("윷놀이 튜토리얼 낱말", () => {
  it("공정한 던지기는 기술 말(해시·사슬·고리·커밋·약속) 없이 설명한다", () => {
    const found = lessonPlaces(YUT_LESSONS)
      .filter((p) => /해시|사슬|고리|커밋|약속/.test(p.text))
      .map((p) => p.where);
    expect(found).toEqual([]);
  });
});
