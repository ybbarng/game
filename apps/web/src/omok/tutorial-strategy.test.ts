// 주형·흑과 백·중반 원칙 단원(docs/20 10절)의 장면과 「이 수면 이긴다·막힌다」를 엔진으로 확인한다.
import {
  type Cell,
  createOmokScenario,
  fivePoints,
  forbiddenReason,
  legalMoves,
  pointAt,
  pointName,
  winningFirstMoves,
  xyOf,
} from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import {
  BLOCK_BUILD_SCENE,
  FOUL_TRAP_SCENE,
  FOUR_THREE_SCENE,
  OMOK_OPENINGS,
  OMOK_TUTORIAL_RULES,
  type OmokScene,
  RACE_SCENE,
  SPLIT_THREE_SCENE,
} from "./tutorial";

const R = "renju" as const;
const boardOf = (scene: OmokScene) =>
  createOmokScenario({ rules: OMOK_TUTORIAL_RULES, ...scene }).board;
const put = (board: readonly Cell[], name: string, stone: 1 | 2) => {
  const next = [...board];
  next[pointAt(name)] = stone;
  return next;
};
const names = (ps: number[]) => ps.map(pointName);
/** 화면 좌표(세로는 아래가 1)로 본 자리 차이 */
const offset = (from: string, to: string) => {
  const [x1, y1] = xyOf(pointAt(from));
  const [x2, y2] = xyOf(pointAt(to));
  return [x2 - x1, y1 - y2] as const;
};

describe("주형(처음 세 수)", () => {
  /**
   * 출처 그림(Nosovsky·Sokolsky 「Renju for Beginners」 4장)의 자리. 흑 첫 돌 (0,0),
   * 직접은 백 (0,1), 간접은 백 (1,1)일 때 흑 셋째 수. 위가 +
   */
  const SOURCE: Record<keyof typeof OMOK_OPENINGS, readonly [number, number]> =
    {
      kansei: [0, 2], // 1D
      sosei: [2, 2], // 3D
      kagetsu: [1, 1], // 4D
      kyugetsu: [1, -1], // 9D
      yusei: [2, -2], // 13D
      chosei: [2, 2], // 1I
      ryusei: [2, -2], // 5I
      hogetsu: [1, -1], // 7I
      suisei: [-2, -2], // 13I
    };

  it.each(Object.entries(OMOK_OPENINGS))(
    "%s: 백은 H8에 붙고(직접 H9·간접 I9), 셋째 수는 출처 그림의 자리이며 둘 수 있다",
    (key, o) => {
      expect(["H9", "I9"]).toContain(o.white);
      expect(offset("H8", o.third)).toEqual(
        SOURCE[key as keyof typeof OMOK_OPENINGS],
      );
      const board = boardOf({ black: ["H8"], white: [o.white] });
      expect(legalMoves(board, 1, R)).toContain(pointAt(o.third));
    },
  );

  it("「첫 돌의 대각선 옆이면서 백 돌과 가로나 세로 한 줄」인 자리는 직접이면 화월, 간접이면 포월뿐이다", () => {
    const rule = (white: string) =>
      ["G7", "G9", "I7", "I9"].filter((p) => {
        if (p === white) return false;
        const [dx, dy] = offset(white, p);
        return dx === 0 || dy === 0;
      });
    // 직접 H9: 화월 I9와 맞은편 G9
    expect(rule("H9")).toEqual(["G9", "I9"]);
    // 간접 I9: 포월 I7과 맞은편(대각선 H8~I9로 뒤집은) G9
    expect(rule("I9")).toEqual(["G9", "I7"]);
    expect(rule("H9")).toContain(OMOK_OPENINGS.kagetsu.third);
    expect(rule("I9")).toContain(OMOK_OPENINGS.hogetsu.third);
  });
});

describe("흑과 백: 금지 자리로 몰기(나는 백)", () => {
  const board = boardOf(FOUL_TRAP_SCENE);

  it("백 K8이면 다섯 자리는 J8 하나이고, J8은 흑에게 3·3이라 백이 두 수 만에 이긴다", () => {
    const after = put(board, "K8", 2);
    expect(names(fivePoints(after, 2, R))).toEqual(["J8"]);
    expect(forbiddenReason(after, pointAt("J8"), 1, R)).toBe("3·3");
    expect(names(winningFirstMoves(board, 2, R, 2))).toContain("K8");
  });

  it("백 J8(실수)이면 다섯 자리 K8을 흑이 막을 수 있다", () => {
    const after = put(board, "J8", 2);
    expect(names(fivePoints(after, 2, R))).toEqual(["K8"]);
    expect(forbiddenReason(after, pointAt("K8"), 1, R)).toBeNull();
  });
});

describe("중반 원칙", () => {
  it("4·3: J8은 사(다섯 자리 K8)와 열린 셋을 함께 만들고, 세 수 안에 이기는 첫 수는 J8뿐이다", () => {
    const board = boardOf(FOUR_THREE_SCENE);
    expect(forbiddenReason(board, pointAt("J8"), 1, R)).toBeNull();
    expect(names(fivePoints(put(board, "J8", 1), 1, R))).toEqual(["K8"]);
    expect(names(winningFirstMoves(board, 1, R, 3))).toEqual(["J8"]);
    expect(winningFirstMoves(board, 1, R, 2)).toEqual([]);
  });

  it("띈 셋: 가운데 I8은 열린 넷(다섯 자리 둘), F8·K8은 다섯 자리 I8 하나뿐인 넷", () => {
    const board = boardOf(SPLIT_THREE_SCENE);
    expect(names(fivePoints(put(board, "I8", 1), 1, R))).toEqual(["F8", "K8"]);
    expect(names(fivePoints(put(board, "F8", 1), 1, R))).toEqual(["I8"]);
    expect(names(fivePoints(put(board, "K8", 1), 1, R))).toEqual(["I8"]);
    expect(fivePoints(put(board, "H9", 1), 1, R)).toEqual([]);
  });

  it("공격이 먼저: 백에게 열린 셋이 있지만, 흑이 세 수 안에 이기는 첫 수는 K7뿐이다", () => {
    const board = boardOf(RACE_SCENE);
    expect(winningFirstMoves(board, 2, R, 2).length).toBeGreaterThan(0);
    expect(winningFirstMoves(board, 1, R, 2)).toEqual([]);
    expect(names(winningFirstMoves(board, 1, R, 3))).toEqual(["K7"]);
  });

  it("막으면서 키우기: 백의 열린 셋을 막으면서 흑 열린 셋도 생기는 자리는 E8뿐이고, E4는 막기만 한다", () => {
    const board = boardOf(BLOCK_BUILD_SCENE);
    expect(winningFirstMoves(board, 2, R, 2).length).toBeGreaterThan(0);
    expect(winningFirstMoves(board, 1, R, 4)).toEqual([]);
    const blocks = (b: readonly Cell[], at: number) => {
      const next = [...b];
      next[at] = 1;
      return winningFirstMoves(next, 2, R, 3).length === 0;
    };
    const builds = (b: readonly Cell[], at: number) => {
      const next = [...b];
      next[at] = 1;
      return winningFirstMoves(next, 1, R, 2).length > 0;
    };
    const good = legalMoves(board, 1, R).filter(
      (at) => builds(board, at) && blocks(board, at),
    );
    expect(names(good)).toEqual(["E8"]);
    expect(blocks(board, pointAt("E4"))).toBe(true);
    expect(builds(board, pointAt("E4"))).toBe(false);
  });
});
