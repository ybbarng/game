import { fullDeck } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";
import { groupOf } from "./device";
import { network } from "./device-fixture";
import {
  HWATU_CARDS,
  hwatuDealId,
  hwatuLayout,
  realHwatuAction,
  swapTokens,
} from "./hwatu-table";
import { CARD_CODES, decode, encodedDeck } from "./protocol";

describe("카드 번호표", () => {
  it("마이티 53장 번호는 그대로이고 화투 48장, 원카드 컬러 조커가 차례로 뒤에 붙는다", () => {
    expect(CARD_CODES.slice(0, 53)).toEqual(fullDeck());
    expect(CARD_CODES.slice(53, 101)).toEqual(HWATU_CARDS);
    expect(CARD_CODES[101]).toBe("JC");
    expect(new Set(CARD_CODES).size).toBe(102);
  });

  it("앞 번호는 바뀌지 않는다(지난 기록·판 끝 검증이 이 번호로 잠근 값을 연다)", () => {
    // 번호를 옮기면 같은 카드가 다른 값으로 잠겨 예전 기록을 다시 열 수 없다. 몇 군데를 값으로 적어 둔다.
    const fixed: [number, string][] = [
      [0, "S2"],
      [12, "SA"],
      [13, "D2"],
      [51, "CA"],
      [52, "JK"],
      [53, "01g"],
      [100, "12d"],
      [101, "JC"],
    ];
    for (const [index, card] of fixed) {
      expect(CARD_CODES[index]).toBe(card);
      expect(CARD_CODES.indexOf(card as never)).toBe(index);
    }
  });

  it("화투 카드도 잠그기 전 값으로 바꾸고 되돌린다(r255)", () => {
    const g = groupOf("r255");
    const encoded = encodedDeck(g, HWATU_CARDS);
    expect(encoded.map((v) => decode(g, v))).toEqual([...HWATU_CARDS]);
    expect(() => encodedDeck(g, ["xx" as never])).toThrow();
  });
});

describe("화투 자리 배치와 자리 표", () => {
  it("자리 번호 순서로 손패, 그다음 바닥, 남은 것은 더미", () => {
    const layout = hwatuLayout([7, 7, 7], 6);
    expect(layout.hands[1]).toEqual([7, 8, 9, 10, 11, 12, 13]);
    expect(layout.floor).toEqual([21, 22, 23, 24, 25, 26]);
    expect(layout.deck).toHaveLength(21);
    expect(layout.deck[0]).toBe(27);
    expect(hwatuDealId(2, 1)).toBe(129);
  });

  it("아는 자리 표만 진짜 카드로 바꾸고 모르는 수를 센다", () => {
    const { value, missing } = swapTokens(
      { hand: ["?_3", "?_4", "01g"], drawn: "?_9" },
      new Map([
        [3, "05p"],
        [9, "12d"],
      ]) as never,
    );
    expect(value).toEqual({ hand: ["05p", "?_4", "01g"], drawn: "12d" });
    expect(missing).toBe(1);
  });

  it("기록 속 행동에서 연 자리 칸을 뺀다", () => {
    expect(
      realHwatuAction({ type: "play", card: "01g", fairSlots: [3] }),
    ).toEqual({ type: "play", card: "01g" });
  });
});

describe("화투 48장 섞고 나누기(기기 둘, 메시지)", () => {
  // 48장 섞기·가리기·열기를 메시지로 본다. 기기마다 남의 섞기 증명을 모두 확인해 기기 수의 제곱으로 무거워지므로
  // 두 기기(맞고 배치)로 본다. 기기 셋 이상의 섞기·열기는 device.test.ts가 작은 덱으로 본다
  it("손패는 받는 기기만, 바닥은 모두가 연다. 판 끝에 모두 열면 48장이 한 번씩 있다", async () => {
    const net = network([0, 1]);
    const layout = hwatuLayout([10, 10], 8);
    const owners = new Map<number, number>();
    layout.hands.forEach((slots, seat) => {
      for (const s of slots) owners.set(s, seat);
    });
    for (const s of layout.floor) owners.set(s, -1);
    for (const d of net.devices) {
      d.start(1, [0, 1], HWATU_CARDS);
      d.assign(1, owners);
    }
    await net.settle();
    for (const d of net.devices) {
      expect(d.myCards(1).size).toBe(10);
      for (const s of layout.floor) expect(d.open(1, s)).not.toBeNull();
      // 남의 손패는 열 수 없다.
      for (const [seat, slots] of layout.hands.entries())
        if (seat !== d.id)
          for (const s of slots) expect(d.myCards(1).has(s)).toBe(false);
    }
    // 더미 맨 위를 1번 기기에게만(가져오기)
    const top = layout.deck[0] as number;
    for (const d of net.devices) d.assign(1, new Map([[top, 1]]));
    await net.settle();
    expect(net.devices[1]?.myCards(1).has(top)).toBe(true);
    expect(net.devices[0]?.open(1, top)).toBeNull();
    for (const d of net.devices) d.revealAll(1);
    await net.settle();
    const all = net.devices[0]?.openAll(1);
    expect(new Set(all?.values()).size).toBe(48);
  });
});
