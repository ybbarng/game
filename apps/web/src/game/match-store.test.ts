// @vitest-environment jsdom

import { STANDARD_RULES as BADUK } from "@game/baduk-engine";
import { STANDARD_RULES as CHESS } from "@game/chess-engine";
import { STANDARD_RULES as JANGGI } from "@game/janggi-engine";
import { STANDARD_RULES as OMOK } from "@game/omok-engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { badukKit } from "@/baduk/kit";
import { useBaduk } from "@/baduk/store";
import { chessKit } from "@/chess/kit";
import { useChess } from "@/chess/store";
import { janggiKit } from "@/janggi/kit";
import { useJanggi } from "@/janggi/store";
import { omokKit } from "@/omok/kit";
import { useOmok } from "@/omok/store";

import { savedMatchSlot } from "./match-store";

beforeEach(() => localStorage.clear());

describe("저장 칸(savedMatchSlot)", () => {
  const saved = { version: 1, rules: {}, seed: 7, humanSeat: 0, log: [] };

  it("저장한 것을 그대로 읽고, 지우면 없다", () => {
    const slot = savedMatchSlot<typeof saved>("test-save");
    slot.save(saved);
    expect(slot.load()).toEqual(saved);
    slot.clear();
    expect(slot.load()).toBeNull();
  });

  it("판 번호가 다르거나 기록이 없거나 깨진 저장본은 읽지 않는다", () => {
    const slot = savedMatchSlot("test-save");
    localStorage.setItem("test-save", JSON.stringify({ ...saved, version: 2 }));
    expect(slot.load()).toBeNull();
    localStorage.setItem("test-save", JSON.stringify({ version: 1 }));
    expect(slot.load()).toBeNull();
    localStorage.setItem("test-save", "{깨짐");
    expect(slot.load()).toBeNull();
  });

  it("게임만의 검사를 넘기면 그것으로 거른다", () => {
    const slot = savedMatchSlot("test-save", (v) => "secrets" in Object(v));
    slot.save(saved);
    expect(slot.load()).toBeNull();
    slot.save({ ...saved, secrets: {} });
    expect(slot.load()).toEqual({ ...saved, secrets: {} });
  });
});

// 판 게임 넷의 저장소는 같은 공장으로 만든다. 같은 동작을 넷 모두에서 본다.
const BOARD = [
  {
    name: "오목",
    saveKey: "omok-save",
    store: useOmok,
    state: () => omokKit.createMatch(OMOK, 5).state,
    start: (seed: number) =>
      useOmok
        .getState()
        .newGame({ rules: OMOK, level: 0, pick: "white", seed }),
    /** 고른 편(백)을 쥔 자리 */
    seatOf: (seed: number) =>
      1 - omokKit.createMatch(OMOK, seed).state.blackSeat,
  },
  {
    name: "장기",
    saveKey: "janggi-save",
    store: useJanggi,
    state: () => janggiKit.createMatch(JANGGI, 5).state,
    start: (seed: number) =>
      useJanggi
        .getState()
        .newGame({ rules: JANGGI, level: 0, pick: "han", seed }),
    seatOf: (seed: number) =>
      1 - janggiKit.createMatch(JANGGI, seed).state.choSeat,
  },
  {
    name: "체스",
    saveKey: "chess-save",
    store: useChess,
    state: () => chessKit.createMatch(CHESS, 5).state,
    start: (seed: number) =>
      useChess
        .getState()
        .newGame({ rules: CHESS, level: 0, pick: "black", seed }),
    seatOf: (seed: number) =>
      1 - chessKit.createMatch(CHESS, seed).state.whiteSeat,
  },
  {
    name: "바둑",
    saveKey: "baduk-save",
    store: useBaduk,
    state: () => badukKit.createMatch(BADUK, 5).state,
    start: (seed: number) =>
      useBaduk
        .getState()
        .newGame({ rules: BADUK, level: 0, pick: "white", seed }),
    seatOf: (seed: number) =>
      1 - badukKit.createMatch(BADUK, seed).state.blackSeat,
  },
] as const;

describe.each(BOARD)(
  "$name 저장소",
  ({ saveKey, store, state, start, seatOf }) => {
    afterEach(() => store.getState().leave());

    it("새 게임은 고른 편을 쥔 자리에 앉고 이어하기 저장본을 남긴다", () => {
      // 고른 편이 0번 자리인 씨앗과 1번 자리인 씨앗을 하나씩 둔다(늘 한 자리에 앉히는 실수를 잡게)
      const seeds = [0, 1].map((seat) => {
        const seed = Array.from({ length: 50 }, (_, i) => i + 1).find(
          (s) => seatOf(s) === seat,
        );
        if (seed === undefined) throw new Error(`${seat}번 자리 씨앗이 없음`);
        return seed;
      });
      for (const [seat, seed] of seeds.entries()) {
        start(seed);
        expect(store.getState().local?.seat).toBe(seat);
      }
      expect(JSON.parse(localStorage.getItem(saveKey) ?? "null")).toMatchObject(
        {
          seed: seeds[1],
          level: 0,
        },
      );
    });

    it("연습 대국은 넘긴 단계로 두고 저장·무르기를 하지 않는다", () => {
      const kept = JSON.stringify({ version: 1, log: [], marker: "하던 게임" });
      localStorage.setItem(saveKey, kept);
      store.getState().startPractice(state() as never, { level: 2 });
      expect(store.getState().practice).toBe(true);
      expect(store.getState().level).toBe(2);
      expect(store.getState().canUndo()).toBe(false);
      store.getState().leave();
      expect(localStorage.getItem(saveKey)).toBe(kept);
    });

    it("연습 대국 단계를 넘기지 않으면 입문(0)", () => {
      store.getState().startPractice(state() as never);
      expect(store.getState().level).toBe(0);
    });
  },
);
