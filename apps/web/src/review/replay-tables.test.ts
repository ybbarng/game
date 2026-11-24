import { describe, expect, it } from "vitest";

import { GAMES } from "@/games/registry";

import { CARD_REPLAY_GAMES } from "./replay-table";
import { replayTableFor } from "./replay-tables";

describe("카드 다시 보기 목록", () => {
  it("이름 목록(CARD_REPLAY_GAMES)은 표가 있는 게임과 같다(복기 화면이 표 묶음을 부르지 않고 갈래를 고른다)", () => {
    const withTable = GAMES.map((g) => g.id).filter(
      (id) => replayTableFor(id) !== null,
    );
    expect([...CARD_REPLAY_GAMES].sort()).toEqual([...withTable].sort());
  });
});
