// @vitest-environment node
import { describe, it } from "vitest";
import { wholeRoundsCase, wholeTitle } from "./fair-room-whole-case";

describe("멘탈 포커 온라인 대전", () => {
  // 6마는 규칙(죽이기·다시 나누기)을 보는 시험이라 참가자 하나로 둔다(나머지는 방장 기기가 두는 컴퓨터). 섞기 증명을
  // 내고 서로 확인하는 기기 수가 시간을 정한다(참가자 셋이면 확인 12번, 하나면 2번). 참가자 여럿이 서로 확인하는
  // 것은 5마 시험(참가자 새로고침의 셋, 부정의 둘)이 본다. 판이 바뀌어도 이어 가는지는 2마 두 판(fair-room.test.ts)
  it(wholeTitle("6마", 1), () => wholeRoundsCase("standard6", 1, 1));
});
