// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { exampleState } from "./example-play";
import { LINES, openingPieces } from "./opening-lessons";
import { useJanggi } from "./store";

describe("배우기 예시 이어 두기(연습 대국)", () => {
  it("하던 게임 저장(이어하기)을 덮어쓰거나 지우지 않는다", () => {
    const saved = JSON.stringify({ version: 1, log: [], marker: "하던 게임" });
    localStorage.setItem("janggi-save", saved);
    const state = exampleState({
      pieces: openingPieces("NENE", "NENE"),
      moves: LINES.greedyRook,
    });
    useJanggi.getState().startPractice(state, 1);
    expect(useJanggi.getState().practice).toBe(true);
    expect(useJanggi.getState().level).toBe(1);
    // 예시가 한 수로 끝나 내(초) 차례다. 한 수 두어 본다.
    const view = useJanggi.getState().view;
    const move = view?.legal[0];
    expect(move).toBeDefined();
    if (move) useJanggi.getState().submit({ type: "move", ...move });
    expect(localStorage.getItem("janggi-save")).toBe(saved);
    expect(useJanggi.getState().canUndo()).toBe(false);
    useJanggi.getState().leave();
    expect(localStorage.getItem("janggi-save")).toBe(saved);
  });
});
