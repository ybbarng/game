// 기본 엔드게임 단원의 그림과 연습 판정을 본다(endgame.ts). 방법이 정해진 수 안에 메이트하는지는
// endgame-guide-*.test.ts(퀸·룩 하나)와 ladder-guide.test.ts(룩 둘)
import { krrkCheck, kxkAttacks } from "@game/chess-ai";
import { squareAt } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import {
  type DrillBoard,
  drillBoard,
  drillGuide,
  ENDGAME_LIMIT,
  ENDGAME_SETS,
  type EndgamePiece,
  endgamePages,
  judgeDrill,
  methodSteps,
} from "./endgame";

const PIECES: readonly EndgamePiece[] = ["Q", "R", "RR"];

/** 그림 판의 흑 킹이 체크인가 */
const inCheck = (piece: EndgamePiece, b: DrillBoard) =>
  piece === "RR"
    ? krrkCheck({ wk: b.wk, bk: b.bk, p: b.p, q: b.q ?? -1 })
    : kxkAttacks(piece, b.p, b.wk, b.bk);

describe.each(PIECES)("%s 단원 그림", (piece) => {
  const pages = endgamePages(piece);

  it("그림 판은 백 차례에 흑 킹이 체크가 아니다", () => {
    for (const page of pages) {
      if (!page.fen) continue;
      const b = drillBoard(piece, page.fen);
      expect([b.wk, b.bk, b.p].every((at) => at >= 0)).toBe(true);
      expect(inCheck(piece, b)).toBe(false);
    }
  });

  it.each(pages.filter((p) => p.shows).map((p) => [p.title, p] as const))(
    "%s: 초록 고리로 보인 수가 방법이 그 판에서 고르는 단계의 수다",
    (_t, page) => {
      const shows = page.shows;
      if (!shows || !page.fen) throw new Error("그림과 수가 있어야 한다");
      const b = drillBoard(piece, page.fen);
      const move = { from: squareAt(shows.from), to: squareAt(shows.to) };
      const guide = drillGuide(piece, b);
      expect(guide?.rule).toBe(shows.rule);
      if (shows.rule === "mate") {
        // 메이트 수는 여럿일 수 있다. 보인 수도 메이트여야 한다
        expect(judgeDrill(piece, b, move, 0)).toEqual({ verdict: "solved" });
      } else expect({ from: guide?.from, to: guide?.to }).toEqual(move);
    },
  );

  it("방법의 단계는 이름이 겹치지 않고, 그림이 보이는 단계는 모두 방법에 있다", () => {
    const steps = methodSteps(piece);
    expect(new Set(steps.map((s) => s.rule)).size).toBe(steps.length);
    for (const page of pages)
      if (page.shows)
        expect(steps.map((s) => s.rule)).toContain(page.shows.rule);
  });

  it("방법의 단계 글은 마침표로 끝난다", () => {
    for (const s of methodSteps(piece)) expect(s.text.endsWith(".")).toBe(true);
  });
});

describe("방법의 단계", () => {
  it("퀸은 「살리기」가 없다(퀸이 흑 킹 옆이면 체크라 흑 킹이 다가와 노릴 수 없다), 룩은 있다", () => {
    expect(methodSteps("Q").map((s) => s.rule)).not.toContain("rescue");
    expect(methodSteps("R").map((s) => s.rule)).toContain("rescue");
  });
});

describe("연습 판정", () => {
  const sq = squareAt;

  it("메이트면 성공", () => {
    const b = drillBoard("R", "4k3/R7/4K3/8/8/8/8/8 w - - 0 1");
    expect(judgeDrill("R", b, { from: sq("a7"), to: sq("a8") }, 3)).toEqual({
      verdict: "solved",
    });
  });

  it("스테일메이트면 실패(퀸 b6으로 a8의 흑 킹이 갈 곳을 다 막음)", () => {
    const b = drillBoard("Q", "k7/8/2K5/8/8/8/8/1Q6 w - - 0 1");
    expect(judgeDrill("Q", b, { from: sq("b1"), to: sq("b6") }, 3)).toEqual({
      verdict: "wrong",
      miss: "stalemate",
    });
  });

  it("흑 킹 옆에 지키지 않은 룩을 두면 실패(잡혀 비긴다)", () => {
    const b = drillBoard("R", "8/8/4k3/8/8/8/8/K6R w - - 0 1");
    expect(judgeDrill("R", b, { from: sq("h1"), to: sq("e5") }, 0)).toEqual({
      verdict: "wrong",
      miss: "lost",
    });
  });

  it("정해진 수째 수가 메이트가 아니면 실패, 그 앞 수까지는 계속", () => {
    const b = drillBoard("R", "8/8/4k3/8/8/8/8/K6R w - - 0 1");
    const quiet = { from: sq("h1"), to: sq("h6") };
    const limit = ENDGAME_LIMIT.R;
    expect(judgeDrill("R", b, quiet, limit - 2)).toEqual({ verdict: "next" });
    expect(judgeDrill("R", b, quiet, limit - 1)).toEqual({
      verdict: "wrong",
      miss: "limit",
    });
  });

  it("룩 둘: 메이트면 성공, 지키지 않은 룩을 흑 킹 옆에 두면 실패, 스테일메이트면 실패", () => {
    const b = drillBoard("RR", "4k3/R7/8/8/8/8/7R/4K3 w - - 0 1");
    expect(judgeDrill("RR", b, { from: sq("h2"), to: sq("h8") }, 3)).toEqual({
      verdict: "solved",
    });
    expect(judgeDrill("RR", b, { from: sq("h2"), to: sq("e2") }, 3)).toEqual({
      verdict: "next",
    });
    const hang = drillBoard("RR", "8/8/8/4k3/8/8/R7/4K2R w - - 0 1");
    expect(judgeDrill("RR", hang, { from: sq("a2"), to: sq("d4") }, 0)).toEqual(
      { verdict: "wrong", miss: "lost" },
    );
    // 흑 킹 a8: b줄과 7번째 가로줄을 막으면 갈 칸이 없는데 체크가 아니다
    const stale = drillBoard("RR", "k7/8/8/8/8/8/7R/1R2K3 w - - 0 1");
    expect(
      judgeDrill("RR", stale, { from: sq("h2"), to: sq("h7") }, 0),
    ).toEqual({ verdict: "wrong", miss: "stalemate" });
  });

  it("정해진 수는 50수 규칙보다 적다", () => {
    for (const piece of PIECES) expect(ENDGAME_LIMIT[piece]).toBeLessThan(50);
  });

  it("연습 id는 겹치지 않는다", () => {
    const ids = ENDGAME_SETS.flatMap((s) => s.drills.map((d) => d.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
