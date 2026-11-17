// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OMOK_PUZZLE_SETS } from "../puzzles";
import { OmokPuzzleScreen } from "./OmokPuzzleScreen";

const cues = vi.hoisted(() => [] as string[]);
vi.mock("@/game/ui-sound", () => ({
  playUiCue: (cue: string) => cues.push(cue),
}));

afterEach(() => {
  cleanup();
  cues.length = 0;
});

describe("오목 문제 화면", () => {
  it("돌을 두면 장기·체스 기물 소리가 아니라 돌 소리를 낸다", () => {
    const first = OMOK_PUZZLE_SETS[0]?.puzzles[0];
    if (!first) throw new Error("문제가 없다");
    render(
      <OmokPuzzleScreen puzzleId={first.id} onExit={() => {}} onOpen={() => {}} />,
    );
    // 힌트가 정답 자리를 겨누고, 판에서 Enter를 누르면 그 자리에 둔다.
    fireEvent.click(screen.getByRole("button", { name: "힌트" }));
    fireEvent.keyDown(screen.getByRole("img", { name: "오목 판, 내 차례" }), {
      key: "Enter",
    });
    expect(cues[0]).toBe("stone");
  });
});
