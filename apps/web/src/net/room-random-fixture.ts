/**
 * 일반방(멘탈 포커 아님) 시험의 난수원. 방장·참가자 비밀 값(게임마다)을 씨앗으로 정해 공동 시드와 판이 실행마다 같다.
 *
 * 비밀 값이 진짜 난수면 판의 패·주사위가 실행마다 달라져 운에 따라 흐름(모두 포기, 첫 판 0점)과 시간이 달라진다.
 * 특정 판이 필요한 시험은 그 판이 나는 씨앗을 상수로 두고, 판 수를 늘리거나 되풀이해 운을 덮지 않는다
 * (docs/13 8절 「시험」, 멘탈 포커 방은 `fair-room-fixture.ts`). 제품 코드는 부르지 않는다
 * (`scripts/fair-test-random.test.mjs`가 본다).
 */

import type { SeededTestRandom } from "@game/fair-play";
import { seededTestRandom } from "@game/fair-play/test-random";

export interface RoomRandom {
  /** 방장 방(`HostRoomOptions.testRandom`)에 넘긴다 */
  readonly host: SeededTestRandom;
  /** i번째 참가자 방(`GuestRoomOptions.testRandom`)에 넘긴다. 새로고침한 참가자도 같은 i를 쓴다 */
  guest(i: number): SeededTestRandom;
}

/** 씨앗 하나로 방장·참가자 난수원을 나눈다. 같은 씨앗이면 같은 판이다 */
export function roomRandom(seed: string): RoomRandom {
  const random = seededTestRandom(seed);
  return {
    host: random.child("host"),
    guest: (i) => random.child(`guest${i}`),
  };
}
