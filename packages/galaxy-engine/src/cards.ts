import type { GalaxyBoard } from "./board";
import type { GalaxyStar } from "./sky-types";

/**
 * 우주국 공문 16장(docs/48 2-6). 글은 표의 문장 그대로다.
 * 별 사실 공문(2·3·4·8)은 판 위 별의 실제 값으로 계산하고, 해당 별이 판에 하나도 없으면 더미에서 뺀다.
 */

export type CardKind = "gain" | "pay" | "catchUp" | "move";

export interface NoticeCard {
  id: number;
  title: string;
  text: string;
  kind: CardKind;
  /** 별 사실 공문이면 해당하는 별을 고르는 조건 */
  fact: StarFact | null;
}

export type StarFact =
  | "firstMagnitude"
  | "blue"
  | "far"
  | "near"
  | "red"
  | "yellow";

/** 별 사실의 기준값 */
export const FACT_LIMITS = {
  /** 1등성: 이보다 밝은(등급이 작은) 별 */
  firstMagnitude: 1.5,
  /** 푸른 별: 표면 온도가 이보다 높은 별(K) */
  blue: 10_000,
  /** 붉은 별: 표면 온도가 이보다 낮은 별(K) */
  red: 4_000,
  /** 먼 별: 이보다 먼 별(광년) */
  far: 500,
  /** 이웃 별: 이보다 가까운 별(광년) */
  near: 100,
  /** 노란·주황 별(해와 비슷한 별): 표면 온도가 이 사이인 별(K, 양 끝 포함) */
  yellowMin: 4_000,
  yellowMax: 7_500,
} as const;

export function matchesFact(star: GalaxyStar, fact: StarFact): boolean {
  switch (fact) {
    case "firstMagnitude":
      return star.mag < FACT_LIMITS.firstMagnitude;
    case "blue":
      return star.k > FACT_LIMITS.blue;
    case "red":
      return star.k < FACT_LIMITS.red;
    case "far":
      return star.ly !== null && star.ly > FACT_LIMITS.far;
    case "near":
      return star.ly !== null && star.ly < FACT_LIMITS.near;
    case "yellow":
      return star.k >= FACT_LIMITS.yellowMin && star.k <= FACT_LIMITS.yellowMax;
  }
}

export const CARDS: readonly NoticeCard[] = [
  {
    id: 1,
    title: "관측 협조 감사",
    text: "우주국이 50을 드립니다.",
    kind: "gain",
    fact: null,
  },
  {
    id: 2,
    title: "별빛 측정 수당",
    text: "가진 별 가운데 1.5등급보다 밝은 별(1등성)마다 30을 드립니다.",
    kind: "gain",
    fact: "firstMagnitude",
  },
  {
    id: 3,
    title: "푸른 별 관측 주간",
    text: "표면 온도 1만 K가 넘는 푸른 별을 가진 우주인마다 20씩 받습니다.",
    kind: "gain",
    fact: "blue",
  },
  {
    id: 4,
    title: "먼 별 탐사 지원",
    text: "가진 별 가운데 500광년보다 먼 별마다 40을 드립니다.",
    kind: "gain",
    fact: "far",
  },
  {
    id: 5,
    title: "보급선 도착",
    text: "모든 우주인이 30씩 받습니다.",
    kind: "gain",
    fact: null,
  },
  {
    id: 6,
    title: "정거장 안전 점검",
    text: "정거장 한 단마다 10, 큰 정거장마다 30을 냅니다.",
    kind: "pay",
    fact: null,
  },
  {
    id: 7,
    title: "우주 먼지 청소",
    text: "40을 냅니다.",
    kind: "pay",
    fact: null,
  },
  {
    id: 8,
    title: "붉은 별 장비 교체",
    text: "표면 온도 4,000 K보다 낮은 붉은 별마다 20을 냅니다.",
    kind: "pay",
    fact: "red",
  },
  {
    id: 9,
    title: "동료 우주인 지원",
    text: "자산이 가장 많은 우주인이 가장 적은 우주인에게 100을 보냅니다.",
    kind: "catchUp",
    fact: null,
  },
  {
    id: 10,
    title: "이웃 별 조사",
    text: "가진 별 가운데 100광년보다 가까운 별마다 20을 드립니다.",
    kind: "gain",
    fact: "near",
  },
  {
    id: 11,
    title: "궤도 이탈",
    text: "소행성대로 곧장 가서 걸립니다. 우주국을 지나도 지원금은 없습니다.",
    kind: "move",
    fact: null,
  },
  {
    id: 12,
    title: "별 색 조사",
    text: "가진 별 가운데 표면 온도 4,000~7,500 K인 노란·주황 별(해와 비슷한 별)마다 20을 드립니다.",
    kind: "gain",
    fact: "yellow",
  },
  {
    id: 13,
    title: "관측지 초청",
    text: "관측지로 곧장 갑니다. 이번에는 관측 지원금이 없습니다.",
    kind: "move",
    fact: null,
  },
  {
    id: 14,
    title: "계절 바꾸기",
    text: "다음 계절의 첫 별로 갑니다. 주인이 있으면 이용료를 반만 냅니다.",
    kind: "move",
    fact: null,
  },
  {
    id: 15,
    title: "혜성 꼬리",
    text: "다음 혜성 칸까지 갑니다.",
    kind: "move",
    fact: null,
  },
  {
    id: 16,
    title: "별자리 선 측량",
    text: "같은 별자리 별을 둘 이상 가진 별자리마다 30을 드립니다. 완성한 별자리는 50입니다.",
    kind: "gain",
    fact: null,
  },
];

/** 공문 금액(2-6). 밸런스를 고칠 때는 이 표만 바꾼다 */
export const CARD_AMOUNTS = {
  thanks: 50,
  firstMagnitude: 30,
  blue: 20,
  far: 40,
  supply: 30,
  inspectLevel: 10,
  inspectGrand: 30,
  dust: 40,
  red: 20,
  support: 100,
  yellow: 20,
  near: 20,
  lineSurvey: 30,
  lineSurveyComplete: 50,
} as const;

export function cardById(id: number): NoticeCard {
  const card = CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`없는 공문 ${id}`);
  return card;
}

/** 이 판에서 쓰는 공문(해당 별이 하나도 없는 별 사실 공문은 뺀다) */
export function activeCards(board: GalaxyBoard): number[] {
  const stars = board.squares.flatMap((s) => (s.star ? [s.star.star] : []));
  return CARDS.filter(
    (c) =>
      c.fact === null || stars.some((s) => matchesFact(s, c.fact as StarFact)),
  ).map((c) => c.id);
}

/** 판에서 이 별 사실에 맞는 별 칸 */
export function factSquares(board: GalaxyBoard, fact: StarFact): number[] {
  return board.squares
    .filter((s) => s.star && matchesFact(s.star.star, fact))
    .map((s) => s.index);
}
