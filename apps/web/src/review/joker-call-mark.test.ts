import type { MatchState } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { mightyKit } from "@/game/mighty-kit";

import fixture from "../../e2e/mighty-review-archive.json";
import type { GameArchive } from "./archive";
import { jokerCallVerdicts } from "./joker-call-mark";
import { replayArchive } from "./replay";

/** 판이 끝난 순간의 상태들(판마다 하나) */
function roundEnds(archive: GameArchive): MatchState[] {
  const states = replayArchive(mightyKit, archive).states as MatchState[];
  return states.filter(
    (s, i) => s.round.result !== null && states[i - 1]?.round.result === null,
  );
}

describe("복기: 턴 표의 조커콜 효과", () => {
  it("화면 시험 기록 파일: 1판 첫 턴 조커콜은 같은 편 조커라 효과 없음, 2판 셋째 턴 조커콜은 효과 있음", () => {
    // 혼자 하기 씨앗 137, 컴퓨터끼리 두 판(e2e/mighty-review-archive.json). 화면 시험이 이 두 칸을 본다.
    const [first, second] = roundEnds(fixture.games[0] as GameArchive).map(
      (end) =>
        jokerCallVerdicts(
          end.round.tricks,
          end.round.declarer as number,
          end.round.friend,
        ),
    );
    expect(first?.map((v, i) => [i, v]).filter(([, v]) => v !== null)).toEqual([
      [0, "ownJoker"],
    ]);
    expect(second?.map((v, i) => [i, v]).filter(([, v]) => v !== null)).toEqual(
      [[2, "effective"]],
    );
  });

  it("편은 판이 끝난 뒤의 주공·프렌드로 본다", () => {
    // 0번이 ♣3 조커콜, 2번이 조커, 3번이 먹음. 주공 1번 혼자(노프렌드)면 2번은 0번과 같은 야당이다.
    const trick = {
      leader: 0,
      plays: ["C3", "C5", "JK", "CK", "C9"].map((card, seat) => ({
        seat,
        card: card as never,
      })),
      jokerSuit: null,
      jokerCalled: true,
      winner: 3,
    };
    expect(jokerCallVerdicts([trick], 1, 2)).toEqual(["effective"]);
    expect(jokerCallVerdicts([trick], 1, null)).toEqual(["ownJoker"]);
    expect(jokerCallVerdicts([{ ...trick, jokerCalled: false }], 1, 2)).toEqual(
      [null],
    );
  });
});
