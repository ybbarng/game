// 「마지막 층을 공식으로」 첫 단원의 표 둘(docs/47 16-24): 2단계 네 걸음의 모양을 모두 평면도로 늘어놓은 개괄,
// 초보자 해법 마지막 층과 나란히 놓은 견주기. 화면은 TwoLookSheets.tsx가 그린다. 글은 term-places.ts가 단계 글과 함께
// 읽어 용어 순서 시험(course-terms.test.ts)이 본다.
import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { Z_PERM_AUF } from "./lessons-2look";
import { LL_COMPARE } from "./ll-compare";
import type { AlgCase, AlgSet, MaskName, SheetName } from "./types";

export interface CaseGroup {
  title: string;
  /** 무엇을 보고 고르는지 한 문장 */
  look: string;
  set: AlgSet;
  /** 묶음 마스크 대신 쓸 가리기(노란 십자 걸음은 초보자 노란 십자 단원처럼 엣지 블럭의 노랑만) */
  mask?: MaskName;
  cases: { id: string; alg: string; caption: string }[];
}

const pick = (list: AlgCase[], id: string, caption: string, alg?: string) => {
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error(`상황 없음: ${id}`);
  return { id, alg: alg ?? (c.algs[0] as string), caption };
};

export const TWO_LOOK_GROUPS: CaseGroup[] = [
  {
    title: "1. 노란 십자(2단계 OLL 첫 걸음)",
    look: "위를 보는 노란 엣지 블럭이 노란 센터 블럭과 만드는 모양을 봐요.",
    set: "2look-oll",
    mask: "ll-cross",
    cases: [
      pick(TWO_LOOK_OLL, "2look-oll-line", "가로줄(일자)"),
      pick(TWO_LOOK_OLL, "2look-oll-l", "ㄱ자"),
      pick(TWO_LOOK_OLL, "2look-oll-dot", "점"),
    ],
  },
  {
    title: "2. 노란 면(2단계 OLL 둘째 걸음)",
    look: "위를 보는 노란 코너 블럭 수(0·1·2개)와 옆면에 보이는 노란 스티커 자리를 봐요.",
    set: "2look-oll",
    cases: [
      pick(TWO_LOOK_OLL, "2look-oll-27", "위 1개"),
      pick(TWO_LOOK_OLL, "2look-oll-26", "위 1개"),
      pick(TWO_LOOK_OLL, "2look-oll-21", "위 0개"),
      pick(TWO_LOOK_OLL, "2look-oll-22", "위 0개"),
      pick(TWO_LOOK_OLL, "2look-oll-23", "위 2개"),
      pick(TWO_LOOK_OLL, "2look-oll-24", "위 2개"),
      pick(TWO_LOOK_OLL, "2look-oll-25", "위 2개"),
    ],
  },
  {
    title: "3. 코너 자리(2단계 PLL 첫 걸음)",
    look: "옆면 윗줄 양 끝의 코너 블럭 둘이 서로 바르게 이웃한 옆면이 하나 있는지, 하나도 없는지 봐요. 그런 옆면은 그 표시로 윗줄 양 끝 두 스티커가 같은 색이고, 이런 옆면을 「헤드라이트」라고 불러요.",
    set: "2look-pll",
    cases: [
      pick(TWO_LOOK_PLL, "2look-pll-headlights", "헤드라이트 하나"),
      pick(TWO_LOOK_PLL, "2look-pll-diagonal", "헤드라이트 없음"),
    ],
  },
  {
    title: "4. 엣지 자리(2단계 PLL 둘째 걸음)",
    look: "위 층 코너 블럭이 제자리에 든 뒤, 위 층 엣지 블럭 넷이 어떻게 자리를 바꿨는지(셋이 돌았나, 맞은편끼리인가, 이웃끼리 두 쌍인가) 봐요.",
    set: "2look-pll",
    cases: [
      pick(TWO_LOOK_PLL, "2look-pll-ua", "셋이 돌아요(한쪽)"),
      pick(TWO_LOOK_PLL, "2look-pll-ub", "셋이 돌아요(다른 쪽)"),
      pick(TWO_LOOK_PLL, "2look-pll-h", "맞은편끼리"),
      pick(TWO_LOOK_PLL, "2look-pll-z", "이웃끼리 두 쌍", Z_PERM_AUF),
    ],
  },
];

/** 견주기 표: 마지막 층 네 걸음과 잰 숫자(ll-compare.ts) */
export const LL_COMPARE_TABLE = {
  heads: ["초보자 해법", "2단계 OLL·PLL"],
  rows: [
    ["노란 십자", "노란 십자"],
    ["옆면 맞추기", "노란 면"],
    ["코너 자리", "코너 자리"],
    ["코너 방향", "엣지 자리"],
  ],
  numbers: [
    {
      label: "공식을 친 횟수(평균)",
      values: [
        `${LL_COMPARE.beginnerFormulas}번`,
        `${LL_COMPARE.twoLookFormulas}번`,
      ],
    },
    {
      label: "돌린 수(평균)",
      values: [`${LL_COMPARE.beginnerTurns}수`, `${LL_COMPARE.twoLookTurns}수`],
    },
  ],
} as const;

/** 표의 글(용어 순서 시험이 단계 글과 함께 읽는다). 블라인드 글자 표처럼 글이 거의 없는 표는 "" */
export function sheetText(name: SheetName): string {
  if (name === "2look-cases")
    return TWO_LOOK_GROUPS.flatMap((g) => [
      g.title,
      g.look,
      ...g.cases.map((c) => c.caption),
    ]).join("\n");
  if (name === "ll-compare")
    return [
      ...LL_COMPARE_TABLE.heads,
      ...LL_COMPARE_TABLE.rows.flat(),
      ...LL_COMPARE_TABLE.numbers.flatMap((n) => [n.label, ...n.values]),
    ].join("\n");
  return "";
}
