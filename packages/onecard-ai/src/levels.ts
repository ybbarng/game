/*
 * 단계 정의(docs/42 13절). 이름은 다른 게임과 같은 입문·중수·고수(docs/10, docs/21).
 * 외침 값의 출발점은 letsuno 컴퓨터(docs/42 3절): 외침 0.6·0.9·1.0, 잡기 0.2·0.5·0.9,
 * 잡기까지 2~4초·1~3초·0.5~2초. 잡기 시간은 규칙의 P·T에 맞춰 비율로 둔다(`catchAt`).
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
  /**
   * 잡기까지 걸리는 시간. 한 장이 된 때부터 잡을 수 있는 시간(본인 시간 P + 잡기 창 T)의 비율 구간.
   * P 안에 누르면 엔진이 적어 두었다가 P 끝에 잡은 것으로 하므로 0부터 쓸 수 있다.
   * 기본 규칙(P 1초·T 3초)에서 letsuno 값과 같다: 입문 2~3.8초, 중수 1~3초, 고수 0.5~2초
   */
  catchAt: readonly [number, number];
  /** 이미 외친 한 장짜리를 잡으려고 누를(헛외침) 확률 */
  falseShout: number;
  /**
   * o2 겨루기: 한 장이 된 내가 누르기까지 반응 시간(ms). 사람 하한(100ms) 아래로 내려가지 않는다.
   * 사람의 보통 반응(250~400ms)을 참고해 고수도 빠른 사람에게는 질 수 있게 둔다
   */
  raceSelfMs: readonly [number, number];
  /** o2 겨루기: 남이 외치지 않고 한 장이 된 것을 보고 누르기까지 반응 시간(ms, 하한 100ms 이상) */
  raceCatchMs: readonly [number, number];
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
      "낼 수 있는 카드를 대충 내고, 공격 카드를 아끼지 않는다. 가끔 헛외침도 한다.",
    shout: {
      shout: 0.6,
      selfMs: [300, 900],
      preMs: [150, 450],
      catch: 0.2,
      catchAt: [0.5, 0.95],
      falseShout: 0.15,
      raceSelfMs: [450, 900],
      raceCatchMs: [700, 1600],
    },
  },
  {
    level: 1,
    name: "중수",
    description:
      "공격 카드는 받아칠 때 쓰려고 아끼고, 7·J·Q·K도 쓸 때를 골라 낸다. 다음 사람 손에 카드가 적으면 막는다.",
    shout: {
      shout: 0.9,
      selfMs: [200, 800],
      preMs: [100, 350],
      catch: 0.5,
      catchAt: [0.25, 0.75],
      falseShout: 0,
      raceSelfMs: [320, 600],
      raceCatchMs: [400, 800],
    },
  },
  {
    level: 2,
    name: "고수",
    description:
      "나온 카드를 세고 남에게 없는 무늬를 기억해, 몇 수 앞을 짐작해 본다.",
    shout: {
      shout: 1,
      selfMs: [100, 500],
      preMs: [80, 250],
      catch: 0.9,
      catchAt: [0.125, 0.5],
      falseShout: 0,
      raceSelfMs: [220, 380],
      raceCatchMs: [260, 420],
    },
  },
];

export function levelInfo(level: number): OnecardLevelInfo {
  const index = Math.max(0, Math.min(2, Math.floor(level)));
  return ONECARD_LEVELS[index] as OnecardLevelInfo;
}
