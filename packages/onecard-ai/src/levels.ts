/*
 * 단계 정의(docs/42 13절). 이름은 다른 게임과 같은 입문·중수·고수(docs/10, docs/21).
 * 외침 값의 출발점은 letsuno 컴퓨터(docs/42 3절): 외침 0.6·0.9·1.0, 잡기 0.2·0.5·0.9,
 * 잡기까지 2~4초·1~3초·0.5~2초.
 */

/** 0 입문, 1 중수, 2 고수 */
export type OnecardLevel = 0 | 1 | 2;

export interface ShoutProfile {
  /** 외칠 일이 생겼을 때(미리 외침·본인 외침) 외칠 확률 */
  shout: number;
  /** 본인 외침까지 걸리는 시간(ms). 본인 시간 P 안으로 줄인다 */
  selfMs: readonly [number, number];
  /** 미리 외침(두 장인 내 차례)까지 걸리는 시간(ms). 카드를 내기 전에 닿아야 한다 */
  preMs: readonly [number, number];
  /** 외치지 않은 한 장짜리를 알아채고 잡을 확률 */
  catch: number;
  /** 잡기까지 걸리는 시간(ms) */
  catchMs: readonly [number, number];
  /** 이미 외친 한 장짜리를 잡으려고 누를(헛외침) 확률 */
  falseShout: number;
}

export interface OnecardLevelInfo {
  level: OnecardLevel;
  name: string;
  description: string;
  shout: ShoutProfile;
}

export const ONECARD_LEVELS: readonly OnecardLevelInfo[] = [
  {
    level: 0,
    name: "입문",
    description:
      "낼 수 있는 카드를 대충 내고, 공격 카드를 아끼지 않는다. 가끔 헛외침도 한다",
    shout: {
      shout: 0.6,
      selfMs: [300, 900],
      preMs: [150, 450],
      catch: 0.2,
      catchMs: [2000, 4000],
      falseShout: 0.15,
    },
  },
  {
    level: 1,
    name: "중수",
    description:
      "공격·특수 카드를 받아치기용으로 아끼고, 다음 사람이 적으면 막는다",
    shout: {
      shout: 0.9,
      selfMs: [200, 800],
      preMs: [100, 350],
      catch: 0.5,
      catchMs: [1000, 3000],
      falseShout: 0,
    },
  },
  {
    level: 2,
    name: "고수",
    description:
      "나온 카드를 세고 남의 없는 무늬를 기억해, 몇 수 앞을 짐작해 본다",
    shout: {
      shout: 1,
      selfMs: [100, 500],
      preMs: [80, 250],
      catch: 0.9,
      catchMs: [500, 2000],
      falseShout: 0,
    },
  },
];

export function levelInfo(level: number): OnecardLevelInfo {
  const index = Math.max(0, Math.min(2, Math.floor(level)));
  return ONECARD_LEVELS[index] as OnecardLevelInfo;
}
