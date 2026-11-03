import {
  applyMove,
  inCheck,
  parseFen,
  positionKey,
  START_FEN,
  sanToMove,
} from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import {
  evaluateExpert,
  hashOf,
  hashOfKey,
  newExpertContext,
  searchExpert,
} from "./expert";
import { evaluate } from "./search";

function play(fen: string, line: string[]) {
  let pos = parseFen(fen);
  for (const san of line) {
    const move = sanToMove(pos, san);
    if (!move) throw new Error(san);
    pos = applyMove(pos, move);
  }
  return pos;
}

describe("고수 전용 탐색", () => {
  it("판 열쇠는 positionKey 글자에서 만든 것과 같다(앙파상·캐슬링 포함)", () => {
    for (const [fen, line] of [
      [START_FEN, []],
      [START_FEN, ["e4", "d5", "e5", "f5"]], // e6 앙파상을 잡을 수 있다
      [START_FEN, ["e4"]], // 잡을 폰이 없어 앙파상은 열쇠에 넣지 않는다
      ["r3k2r/8/8/8/8/8/8/R3K2R b Kq - 0 1", []],
    ] as const) {
      const pos = play(fen, [...line]);
      expect(hashOfKey(positionKey(pos))).toEqual(hashOf(pos));
    }
    // 다른 판은 다른 열쇠
    expect(hashOf(play(START_FEN, ["e4"]))).not.toEqual(
      hashOf(play(START_FEN, ["d4"])),
    );
  });

  it("지나온 길에 있던 판이 다시 나오면 0점(비김)으로 본다", () => {
    // 백이 퀸 하나 앞서지만, 기록에 같은 판이 있으면 그 판은 비김
    const fen = "4k3/8/8/8/8/8/8/3QK3 w - - 4 10";
    const pos = parseFen(fen);
    const checked = inCheck(pos.board, pos.turn);
    const fresh = newExpertContext(10_000);
    expect(
      searchExpert(pos, hashOf(pos), 1, -Infinity, Infinity, fresh, 1, checked),
    ).toBeGreaterThan(500);
    const back = play(fen, ["Qd2", "Kf8", "Qd1", "Ke8"]);
    const seen = newExpertContext(10_000, [
      positionKey(pos),
      positionKey(play(fen, ["Qd2"])),
      positionKey(play(fen, ["Qd2", "Kf8"])),
      positionKey(play(fen, ["Qd2", "Kf8", "Qd1"])),
    ]);
    expect(
      searchExpert(
        back,
        hashOf(back),
        1,
        -Infinity,
        Infinity,
        seen,
        1,
        checked,
      ),
    ).toBe(0);
  });

  it("평가: 처음 판은 0, 통과한 폰·비숍 쌍은 덤을 받는다", () => {
    expect(evaluateExpert(parseFen(START_FEN).board, "w")).toBe(0);
    // 같은 기물·자리 값이라도 통과한 폰이 있는 쪽이 더 좋게 본다
    const passed = parseFen("4k3/8/8/3P4/8/8/8/4K3 w - - 0 1").board;
    expect(evaluateExpert(passed, "w")).toBeGreaterThan(evaluate(passed, "w"));
    const pair = parseFen("4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1").board;
    expect(
      evaluateExpert(pair, "w") - evaluate(pair, "w"),
    ).toBeGreaterThanOrEqual(30);
  });
});
