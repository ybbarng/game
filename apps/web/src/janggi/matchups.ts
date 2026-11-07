import { SETUPS, type Setup } from "@game/janggi-engine";

/*
 * 상대(한) 차림을 보고 초가 무엇을 고를지(16가지 짝, docs/23 「포진과 첫 수 자료」).
 * 한이 먼저 고르고 초가 그것을 본 뒤 고른다. 처음 배우는 사람 기준으로 매긴다.
 * 판에 관한 말(맞상은 두 편 상이 대각선으로 마주 봐 한 번씩 올리면 서로 잡을 수 있음, 양귀마는 가운데 졸·병을 지키는 마가 없음)은
 * matchups.test.ts가 엔진으로 확인한다.
 */

/** 차림이 짜는 포진 */
export type Formation = "귀마" | "원앙마" | "양귀마";

export const FORMATION: Record<Setup, Formation> = {
  NENE: "귀마",
  ENEN: "귀마",
  NEEN: "원앙마",
  ENNE: "양귀마",
};

export type Grade = "best" | "ok" | "avoid";

export const GRADE_NAMES: Record<Grade, string> = {
  best: "권해요",
  ok: "둘 만해요",
  avoid: "피해요",
};

/** 표에 쓰는 짧은 표시 */
export const GRADE_MARKS: Record<Grade, string> = {
  best: "◎",
  ok: "○",
  avoid: "△",
};

export interface Matchup {
  grade: Grade;
  /** 왜 그런지(한두 문장) */
  reason: string;
}

/**
 * 맞상: 두 편이 같은 이름의 귀마(마상마상끼리, 상마상마끼리)를 고른 짝. 두 편 상이 판을 가로질러 대각선으로 마주 본다
 * (나무위키 「장기/용어」, docs/23 「맞상의 짝」). 상차림 이름은 저마다 제 자리에서 왼쪽부터 읽는다
 */
export function isMatsang(cho: Setup, han: Setup): boolean {
  return FORMATION[cho] === "귀마" && FORMATION[han] === "귀마" && cho === han;
}

/** 한이 `han`을 골랐을 때 초가 `cho`를 고르면 */
export function matchup(han: Setup, cho: Setup): Matchup {
  const mine = FORMATION[cho];
  const theirs = FORMATION[han];
  if (mine === "양귀마")
    return {
      grade: "avoid",
      reason:
        "내 가운데 졸(75)을 지키는 마가 없어 한 면포에 노려지기 쉬워요. 이것을 막는 법을 알아야 해서 처음에는 피해요.",
    };
  if (theirs === "귀마") {
    if (mine === "귀마")
      return isMatsang(cho, han)
        ? {
            grade: "avoid",
            reason:
              "이름이 같으면 맞상이에요. 두 편 상이 대각선으로 마주 봐 상끼리 바꾸고 시작하기 쉬워요. 판이 늘어지고 먼저 두는 초의 이득이 줄어든다고 해서 흔히 피해요.",
          }
        : {
            grade: "best",
            reason:
              "한과 다른 이름의 귀마를 고르면 맞상을 피해요. 나중에 고르는 초는 흔히 이렇게 맞상을 피한다고 해요.",
          };
    return {
      grade: "ok",
      reason:
        "원앙마로 귀마를 받기도 해요. 단단하지만 갖추는 데 수가 더 들어 처음에는 귀마가 쉬워요.",
    };
  }
  if (theirs === "원앙마")
    return mine === "귀마"
      ? {
          grade: "best",
          reason:
            "원앙마는 지키기부터 하는 차림이에요. 빨리 갖춰지는 귀마로 먼저 판을 이끌어요. 원앙마는 좌우가 같아 귀마 둘 어느 쪽이든 괜찮아요.",
        }
      : {
          grade: "ok",
          reason: "원앙마끼리는 두 편 모두 지키기부터 해서 판이 느리게 흘러요.",
        };
  // 한 양귀마
  return mine === "귀마"
    ? {
        grade: "best",
        reason:
          "한 가운데 병(45)을 지키는 마가 없어요. 빨리 면포를 놓아 가운데 줄을 노려 보기 좋아요. 양귀마도 좌우가 같아 귀마 둘 어느 쪽이든 괜찮아요.",
      }
    : {
        grade: "ok",
        reason:
          "원앙마로 단단히 받을 수 있지만, 갖추는 사이에 한이 먼저 공격을 준비해요.",
      };
}

/** 그 한 차림에 권하는 초 차림들 */
export function bestAgainst(han: Setup): Setup[] {
  return SETUPS.map((s) => s.value).filter(
    (cho) => matchup(han, cho).grade === "best",
  );
}

export const setupLabel = (setup: Setup) =>
  SETUPS.find((s) => s.value === setup)?.label ?? setup;

/**
 * 반복 문제에 낼 한 차림 `count`개. 넷이 고루 나오게 넷씩 묶어 섞는다.
 * `random`은 0 이상 1 미만(시험은 정해진 값을 넣는다)
 */
export function drillOrder(count: number, random: () => number): Setup[] {
  const order: Setup[] = [];
  while (order.length < count) {
    const bag = SETUPS.map((s) => s.value);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j] as Setup, bag[i] as Setup];
    }
    // 묶음 사이에 같은 차림이 잇달아 나오지 않게 한다.
    if (order.length > 0 && bag[0] === order[order.length - 1])
      bag.push(bag.shift() as Setup);
    order.push(...bag);
  }
  return order.slice(0, count);
}
