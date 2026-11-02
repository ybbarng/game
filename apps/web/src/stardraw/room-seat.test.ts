import { describe, expect, it } from "vitest";

import { roomSeat } from "./room-seat";

const base = {
  pass: false,
  hasKey: true,
  canJoin: true,
  others: 0,
  over: false,
  heard: true,
};

describe("관측지 내 자리 · 관측 전과 관측 중", () => {
  it("신분증을 내기 전 혼자면: 관측 중이고, 아무도 없다고 하지 않고 다른 우주인이 없다고 한다", () => {
    const s = roomSeat(base);
    expect(s.joined).toBe(false);
    expect(s.badge).toBe("숨어서 관측 중");
    expect(s.note).toBe("언덕 아래 어둠 속에서 조용히 관측하고 있어요.");
    expect(s.join).toBe("언덕에 오르기");
    expect(s.hill).toBe("아직 언덕에 다른 우주인이 오지 않았어요.");
  });

  it("신분증을 내기 전 다른 우주인이 있으면: 관측 중, 언덕 문구 없음", () => {
    const s = roomSeat({ ...base, others: 3 });
    expect(s.badge).toBe("숨어서 관측 중");
    expect(s.join).toBe("언덕에 오르기");
    expect(s.hill).toBeNull();
  });

  it("등록증이 없으면 참여 단추는 우주인 등록", () => {
    const s = roomSeat({ ...base, hasKey: false });
    expect(s.join).toBe("우주인 등록하고 언덕에 오르기");
  });

  it("추첨이 시작된 뒤에는 참여 단추가 없고 그 까닭을 말한다", () => {
    const s = roomSeat({ ...base, canJoin: false, others: 2 });
    expect(s.join).toBeNull();
    expect(s.badge).toBe("숨어서 관측 중");
    expect(s.note).toBe("관측이 시작되어 이제는 언덕에 오를 수 없어요.");
  });

  it("추첨 뒤에 와서 언덕 소식을 받지 못했으면 언덕이 비었다고 하지 않는다", () => {
    const s = roomSeat({ ...base, canJoin: false, heard: false });
    expect(s.hill).toBeNull();
  });

  it("신분증을 낸 뒤 혼자면: 대화 참여 중, 다른 우주인이 없다고 한다", () => {
    const s = roomSeat({ ...base, pass: true });
    expect(s.joined).toBe(true);
    expect(s.badge).toBe("언덕에서 관측 중");
    expect(s.note).toBeNull();
    expect(s.join).toBeNull();
    expect(s.hill).toBe("아직 언덕에 다른 우주인이 오지 않았어요.");
  });

  it("신분증을 낸 뒤 함께 있으면 언덕 문구 없음", () => {
    const s = roomSeat({ ...base, pass: true, canJoin: false, others: 1 });
    expect(s.badge).toBe("언덕에서 관측 중");
    expect(s.hill).toBeNull();
  });
});

describe("관측지 내 자리 · 관측이 끝난 뒤", () => {
  const over = { ...base, canJoin: false, over: true };

  it("언덕에 있던 사람은 「관측 중」 표시 없이 그대로 이야기한다", () => {
    const s = roomSeat({ ...over, pass: true, others: 2 });
    expect(s.joined).toBe(true);
    expect(s.badge).toBeNull();
    expect(s.note).toBeNull();
  });

  it("오르지 못한 사람에게는 관측이 끝났다는 까닭 한 줄만", () => {
    const s = roomSeat({ ...over, others: 2 });
    expect(s.joined).toBe(false);
    expect(s.badge).toBeNull();
    expect(s.join).toBeNull();
    expect(s.note).toBe("관측이 끝나 이제는 언덕에 오를 수 없어요.");
  });
});
