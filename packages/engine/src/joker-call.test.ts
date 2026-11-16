import { describe, expect, it } from "vitest";

import type { Card } from "./cards";
import { judgeJokerCall, trickJokerCallVerdict } from "./joker-call";
import type { CompletedTrick } from "./state";

// 5마, 주공 1번·프렌드 2번(여당), 0·3·4번 야당.
const ruling = (seat: number) => seat === 1 || seat === 2;

function trick(
  leader: number,
  cards: string[],
  winner: number,
  jokerCalled = true,
): CompletedTrick {
  return {
    leader,
    plays: cards.map((card, i) => ({
      seat: (leader + i) % 5,
      card: card as Card,
    })),
    jokerSuit: null,
    jokerCalled,
    winner,
  };
}

describe("효과적인 조커콜", () => {
  it("상대 편 조커를 끌어내고 그 턴을 우리 편이 먹으면 효과가 있다", () => {
    // 야당 0번이 ♣3 조커콜, 프렌드 2번이 조커를 냈고 야당 3번이 ♣K로 먹었다.
    const t = trick(0, ["C3", "C5", "JK", "CK", "C9"], 3);
    expect(trickJokerCallVerdict(t, ruling)).toBe("effective");
  });

  it("여당이 조커콜해 야당 조커를 끌어내고 먹어도 효과가 있다", () => {
    // 주공 1번 ♣3 조커콜, 프렌드 2번 ♣A, 야당 3번 조커, 4번 ♣9, 0번 ♣5 → 2번이 먹었다.
    const t = trick(1, ["C3", "CA", "JK", "C9", "C5"], 2);
    expect(trickJokerCallVerdict(t, ruling)).toBe("effective");
  });

  it("상대 조커를 끌어냈어도 그 턴을 상대가 먹으면 효과가 없다", () => {
    const t = trick(0, ["C3", "SA", "JK", "C5", "C9"], 1);
    expect(trickJokerCallVerdict(t, ruling)).toBe("lostTrick");
  });

  it("우리 편 조커를 끌어내면 효과가 없다", () => {
    // 야당 0번의 조커콜에 야당 3번이 조커를 냈다.
    const t = trick(0, ["C3", "C5", "C7", "JK", "C9"], 0);
    expect(trickJokerCallVerdict(t, ruling)).toBe("ownJoker");
  });

  it("조커가 나오지 않으면(바닥에 버렸거나 내가 가졌거나 마이티로 막음) 효과가 없다", () => {
    const t = trick(0, ["C3", "C5", "C7", "C8", "C9"], 4);
    expect(trickJokerCallVerdict(t, ruling)).toBe("noJoker");
    // 조커를 가진 2번이 마이티(♠A)로 막고 먹었다.
    const blocked = trick(0, ["C3", "C5", "SA", "C8", "C9"], 2);
    expect(trickJokerCallVerdict(blocked, ruling)).toBe("noJoker");
  });

  it("조커콜 카드를 선으로 냈어도 조커콜을 하지 않았으면 판정하지 않는다", () => {
    const t = trick(0, ["C3", "C5", "JK", "CK", "C9"], 3, false);
    expect(trickJokerCallVerdict(t, ruling)).toBeNull();
  });

  it("편만으로 판정한다: 조커 편이 먼저, 그다음 먹은 편", () => {
    expect(
      judgeJokerCall({ caller: "ruling", joker: null, winner: "ruling" }),
    ).toBe("noJoker");
    expect(
      judgeJokerCall({ caller: "ruling", joker: "ruling", winner: "ruling" }),
    ).toBe("ownJoker");
    expect(
      judgeJokerCall({
        caller: "opposition",
        joker: "ruling",
        winner: "opposition",
      }),
    ).toBe("effective");
  });
});
