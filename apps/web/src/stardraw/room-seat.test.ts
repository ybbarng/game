import { describe, expect, it } from "vitest";

import { roomSeat } from "./room-seat";

describe("회차 방 내 자리", () => {
  it("신분증을 내기 전 혼자면: 관측 중이고, 아무도 없다고 하지 않고 다른 우주인이 없다고 한다", () => {
    const s = roomSeat({ pass: false, hasKey: true, canJoin: true, others: 0 });
    expect(s.joined).toBe(false);
    expect(s.badge).toBe("조용히 관측 중");
    expect(s.note).toBe(
      "우주인들의 이야기는 보이지만, 나는 아직 언덕에 없어요.",
    );
    expect(s.join).toBe("대화에 참여하기");
    expect(s.hill).toBe("아직 다른 우주인은 오지 않았어요.");
  });

  it("신분증을 내기 전 다른 우주인이 있으면: 관측 중, 언덕 문구 없음", () => {
    const s = roomSeat({ pass: false, hasKey: true, canJoin: true, others: 3 });
    expect(s.badge).toBe("조용히 관측 중");
    expect(s.join).toBe("대화에 참여하기");
    expect(s.hill).toBeNull();
  });

  it("등록증이 없으면 참여 단추는 우주인 등록", () => {
    const s = roomSeat({
      pass: false,
      hasKey: false,
      canJoin: true,
      others: 0,
    });
    expect(s.join).toBe("우주인 등록하고 참여하기");
  });

  it("추첨이 시작된 뒤에는 참여 단추가 없고 그 까닭을 말한다", () => {
    const s = roomSeat({
      pass: false,
      hasKey: true,
      canJoin: false,
      others: 2,
    });
    expect(s.join).toBeNull();
    expect(s.note).toBe("추첨이 시작되어 이제는 대화에 참여할 수 없어요.");
  });

  it("신분증을 낸 뒤 혼자면: 대화 참여 중, 다른 우주인이 없다고 한다", () => {
    const s = roomSeat({ pass: true, hasKey: true, canJoin: true, others: 0 });
    expect(s.joined).toBe(true);
    expect(s.badge).toBe("대화 참여 중");
    expect(s.note).toBeNull();
    expect(s.join).toBeNull();
    expect(s.hill).toBe("아직 다른 우주인은 오지 않았어요.");
  });

  it("신분증을 낸 뒤 함께 있으면 언덕 문구 없음", () => {
    const s = roomSeat({ pass: true, hasKey: true, canJoin: false, others: 1 });
    expect(s.badge).toBe("대화 참여 중");
    expect(s.hill).toBeNull();
  });
});
