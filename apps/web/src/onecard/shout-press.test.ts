import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { HOLD_MS, ShoutPress } from "./shout-press";

function setup() {
  const clock = new ManualClock();
  const confirmed: number[] = [];
  const press = new ShoutPress(clock, (seen) => confirmed.push(seen));
  return { clock, confirmed, press };
}

describe("더미 치기(원카드!) 누르기", () => {
  it("150ms 누르고 있으면 확정하고, 누르기 시작한 순간의 판 번호를 보낸다", () => {
    const { clock, confirmed, press } = setup();
    press.press(1, 7);
    clock.advance(HOLD_MS - 1);
    expect(confirmed).toEqual([]);
    clock.advance(1);
    expect(confirmed).toEqual([7]);
    // 그 뒤 손을 떼도 다시 보내지 않는다.
    press.release(1);
    clock.advance(HOLD_MS);
    expect(confirmed).toEqual([7]);
  });

  it("확정 전에 떼면(스침) 보내지 않는다", () => {
    const { clock, confirmed, press } = setup();
    press.press(1, 3);
    clock.advance(HOLD_MS - 10);
    press.release(1);
    clock.advance(HOLD_MS);
    expect(confirmed).toEqual([]);
    expect(press.holding).toBe(false);
  });

  it("손가락 둘이 함께 닿으면(손바닥) 무시하고, 모두 뗄 때까지 새 누름을 받지 않는다", () => {
    const { clock, confirmed, press } = setup();
    press.press(1, 3);
    press.press(2, 3);
    clock.advance(HOLD_MS * 2);
    expect(confirmed).toEqual([]);
    press.release(2);
    press.press(3, 4);
    clock.advance(HOLD_MS);
    expect(confirmed).toEqual([]);
    press.release(1);
    press.release(3);
    press.press(4, 5);
    clock.advance(HOLD_MS);
    expect(confirmed).toEqual([5]);
  });

  it("키보드(스페이스)는 바로 확정한다", () => {
    const { confirmed, press } = setup();
    press.key(9);
    expect(confirmed).toEqual([9]);
  });
});
