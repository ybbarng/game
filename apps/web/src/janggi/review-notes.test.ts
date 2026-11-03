import { createJanggiScenario, type Piece, pointAt } from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { reviewNotes } from "./review-notes";
import { obj } from "./study";

/** 두 궁은 엇갈린 줄에 둔다(빅장이 아니게) */
const KINGS: Record<string, Piece> = { "95": "cK", "24": "hK" };

function notesOf(pieces: Record<string, Piece>, from: string, to: string) {
  const { board } = createJanggiScenario({ pieces: { ...KINGS, ...pieces } });
  return reviewNotes(board, { from: pointAt(from), to: pointAt(to) }, "c");
}

describe("다시 보기 짚기", () => {
  it("잡은 기물과 점수", () => {
    expect(notesOf({ "51": "cR", "41": "hP" }, "51", "41")).toEqual([
      "졸을 잡았다(2점)",
    ]);
  });

  it("공짜로 잡을 수 있던 기물을 두고 다른 수를 두면 짚는다", () => {
    // 내 차(71)가 지키는 기물 없는 한 차(11)를 잡을 수 있었다.
    expect(notesOf({ "71": "cR", "11": "hR" }, "71", "72")).toEqual([
      "공짜로 잡을 수 있던 차(11)를 두고 다른 수를 뒀다",
    ]);
  });

  it("이 수로 내 기물이 새로 잡힐 위험에 놓이면 짚는다", () => {
    // 한 졸(49)은 한 차(19)가 지켜 공짜가 아니다. 내 차가 59로 가면 그 졸이 노린다.
    expect(notesOf({ "79": "cR", "49": "hP", "19": "hR" }, "79", "59")).toEqual(
      ["이 수 뒤 차(59)가 잡힐 위험에 놓였다"],
    );
  });

  it("아무 일 없는 수에는 짚을 것이 없다", () => {
    expect(notesOf({ "71": "cP", "19": "hP" }, "71", "61")).toEqual([]);
  });
});

describe("조사(숫자·괄호 이름)", () => {
  it("자리 숫자는 읽는 소리로 받침을 본다", () => {
    expect(obj("졸 45→46")).toBe("졸 45→46을");
    expect(obj("졸 45→42")).toBe("졸 45→42를");
    expect(obj("차 01→07")).toBe("차 01→07을");
  });

  it("괄호가 붙은 이름은 기물 이름으로 조사를 고른다", () => {
    // 한 상(36)을 내 차(16)가 공짜로 잡을 수 있었다.
    expect(notesOf({ "16": "cR", "36": "hE" }, "16", "17")).toEqual([
      "공짜로 잡을 수 있던 상(36)을 두고 다른 수를 뒀다",
    ]);
  });
});
