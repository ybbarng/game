import { describe, expect, it } from "vitest";

import {
  areaScore,
  boardHash,
  type Cell,
  emptyBoard,
  pointAt,
  tryPlace,
} from "./board";
import {
  bestDefense,
  canCapture,
  canKill,
  canLive,
  captureMoves,
  endgameReader,
  endgameSize,
  koRecapturePoint,
  ladderDefense,
  ladderMoves,
  lifeKeyMoves,
  passAliveStones,
  snapbackGain,
  solveEndgame,
} from "./puzzle";

const SIZE = 9;
const p = (name: string) => pointAt(name, SIZE);

function board(black: string[], white: string[]): Cell[] {
  const b = emptyBoard(SIZE);
  for (const n of black) b[p(n)] = 1;
  for (const n of white) b[p(n)] = 2;
  return b;
}

describe("벤슨 방법(쉬어도 사는 무리)", () => {
  it("떨어진 두 눈이 있는 귀 무리는 산다", () => {
    const b = board(["B9", "A8", "B8", "C8", "D8", "D9"], []);
    expect(passAliveStones(b, 1).has(p("B9"))).toBe(true);
  });

  it("한 눈뿐인 무리는 살았다고 보지 않는다", () => {
    const b = board(["B9", "A8", "B8"], []);
    expect(passAliveStones(b, 1).has(p("B9"))).toBe(false);
  });
});

describe("잡기 읽기", () => {
  it("활로 하나인 돌은 한 수에 따낸다", () => {
    const b = board(["C5", "D6", "E5"], ["D5"]);
    expect(captureMoves(b, 1, p("D5"), 1)).toEqual([p("D4")]);
  });

  it("쉬어도 활로가 남으면 정한 수 안에 따낼 수 없다", () => {
    const b = board([], ["E5"]);
    expect(canCapture(b, 1, p("E5"), 3)).toBe(false);
  });
});

describe("사활 읽기", () => {
  // 귀의 곧은 세 집(A9·A8·A7)을 백이 둘러쌌다. 가운데(A8)가 급소다.
  const b = board(
    ["C9", "C8", "C7", "C6", "A5", "B5"],
    ["B9", "B8", "B7", "A6", "B6"],
  );
  const problem = { target: p("B9"), area: [p("A9"), p("A8"), p("A7")] };

  it("백이 먼저 두면 급소를 차지해 산다", () => {
    expect(canLive(b, problem, 2, 8)).toBe(true);
  });

  it("흑이 먼저 급소에 두면 끝내 따낸다. 급소는 하나뿐이다", () => {
    expect(lifeKeyMoves(b, problem, 1, 8)).toEqual([p("A8")]);
    expect(canKill(b, problem, 1, 8)).toBe(true);
  });
});

describe("환격(되따내기)", () => {
  // 귀의 백 두 점(A8·A9). B9에 한 점을 내주면 백이 B8로 따내고, 흑이 B9에 다시 두어 세 점을 되따낸다.
  const b = board(["A7", "B7", "C8"], ["A8", "A9", "C9", "D9"]);

  it("한 점을 내주는 자리는 되따내는 돌 수를, 아닌 자리는 0을 낸다", () => {
    expect(snapbackGain(b, 1, p("A8"), p("B9"))).toBe(3);
    expect(snapbackGain(b, 1, p("A8"), p("B8"))).toBe(0);
  });

  it("두 수 안에 따내는 첫 수는 내주는 자리 하나뿐이다", () => {
    expect(captureMoves(b, 1, p("A8"), 2)).toEqual([p("B9")]);
  });
});

describe("패", () => {
  // 흑이 A7에 두어 백 A6을 따내면 백 A8이 단수다. 백은 A6에 바로 되따낼 수 없다.
  const b = board(["A5", "B6", "B8"], ["A6", "B7", "A8"]);

  it("패를 따내는 수는 되따낼 자리를 알려 준다", () => {
    expect(koRecapturePoint(b, p("A7"), 1)).toBe(p("A6"));
    expect(koRecapturePoint(b, p("A9"), 1)).toBeNull();
  });

  it("받는 쪽은 같은 판 모양이 되는 되따내기를 두지 않는다", () => {
    const taken = tryPlace(b, p("A7"), 1);
    if (!taken.ok) throw new Error("둘 수 없다");
    // 판 기록이 없으면 되따내기가 가장 오래 버티는 수다
    expect(bestDefense(taken.board, 1, p("A8"), 1)).toBe(p("A6"));
    const history = [boardHash(b), boardHash(taken.board)];
    expect(bestDefense(taken.board, 1, p("A8"), 1, history)).not.toBe(p("A6"));
  });

  it("되따낼 수 없으니 패를 따내는 수 하나로 두 수 안에 잡는다", () => {
    expect(captureMoves(b, 1, p("A8"), 2)).toEqual([p("A7")]);
  });
});

describe("축 읽기", () => {
  // 백 C7을 흑 B6·B7·D7이 둘렀다. C8에서 단수를 치면 판 끝까지 가는 긴 축, C6에서 치면 백이 C8로 뻗어 빠져나간다
  const b = board(["B6", "B7", "D7"], ["C7"]);

  it("축이 되는 쪽 단수는 백이 가장 오래 버틸 때 흑이 둘 수를 알려 준다", () => {
    expect(ladderMoves(b, 1, p("C7"), p("C8"))).toBe(12);
  });

  it("다른 쪽 단수와 단수가 아닌 수는 축이 아니다", () => {
    expect(ladderMoves(b, 1, p("C7"), p("C6"))).toBeNull();
    expect(ladderMoves(b, 1, p("C7"), p("E5"))).toBeNull();
  });

  it("축이 가는 길에 백 돌(축머리)이 있으면 축이 깨지고, 받는 쪽은 빠져나가는 수를 고른다", () => {
    const broken = board(["B6", "B7", "D7"], ["C7", "G3"]);
    expect(ladderMoves(broken, 1, p("C7"), p("C8"))).toBeNull();
    const atari = tryPlace(broken, p("C8"), 1);
    if (!atari.ok) throw new Error("둘 수 없다");
    const d = ladderDefense(atari.board, 1, p("C7"));
    expect(d).toBe(p("C6"));
  });
});

describe("끝내기 읽기", () => {
  // 흑 D줄, 백 F줄. 그 사이 E줄은 백 돌인데 E5만 비었다. E5는 흑·백 모두에 닿는 빈 점 하나다
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const b = board(
    rows.map((r) => `D${r}`),
    [
      ...rows.map((r) => `F${r}`),
      ...rows.filter((r) => r !== 5).map((r) => `E${r}`),
    ],
  );
  const base = areaScore(b);

  it("둘 곳이 없으면 쉬고, 판 위 그대로 센 점수 차를 돌려준다", () => {
    expect(solveEndgame(b, [], 1)).toEqual({
      score: base.black - base.white,
      best: [null],
    });
  });

  it("빈 점 하나는 흑이 두면 흑 점수가 1, 백이 두면 백 점수가 1 늘어 2점짜리다", () => {
    expect(solveEndgame(b, [p("E5")], 1)).toEqual({
      score: base.black + 1 - base.white,
      best: [p("E5")],
    });
    expect(solveEndgame(b, [p("E5")], 2).score).toBe(
      base.black - base.white - 1,
    );
    expect(endgameSize(b, [p("E5")])).toBe(2);
  });

  it("빈 점에 두어 백을 단수로 몰면, 백은 자기 집 쪽 활로로 이어 받고 받지 않으면 흑이 따낸다", () => {
    // 백 E9 한 점이 흑 D9 옆에 떨어졌다. 활로는 E8(누구 것도 아닌 빈 점)과 F9(백 집)
    const cut = board(
      rows.map((r) => `D${r}`),
      [...rows.filter((r) => r !== 8).map((r) => `E${r}`), "F8"],
    );
    expect(solveEndgame(cut, [p("E8")], 1).best).toEqual([p("E8")]);
    const atari = tryPlace(cut, p("E8"), 1);
    if (!atari.ok) throw new Error("둘 수 없다");
    // F9는 정한 자리가 아니지만, 단수인 백 E9의 활로이자 백 집이라 백이 이을 수 있다
    expect(solveEndgame(atari.board, [p("E8")], 2).best).toEqual([p("F9")]);
    expect(endgameSize(cut, [p("E8")])).toBe(2);
    // 백이 받지 않고 쉬면, 흑은 F9에 두어 백 E9를 따낼 수 있다
    expect(solveEndgame(atari.board, [p("E8")], 1).best).toContain(p("F9"));
  });

  it("읽기 도구: 첫 수마다의 결과와 가장 좋은 수가 solveEndgame과 같고, 수순은 차례마다 solveEndgame의 첫 가장 좋은 수를 둔다", () => {
    // 빈 점 하나(E5, 2점)와 선수 곳(E8: 흑이 두면 백 E9가 단수, 백은 F9에 이어 받는다)이 함께 남은 판
    const two = board(
      rows.map((r) => `D${r}`),
      [...rows.filter((r) => r !== 8 && r !== 5).map((r) => `E${r}`), "F8"],
    );
    const area = [p("E5"), p("E8")];
    const reader = endgameReader(two, area);
    const root = reader.choose(two, 1);
    const solved = solveEndgame(two, area, 1);
    expect({ score: root.score, best: root.best }).toEqual(solved);
    // 첫 수마다의 결과는 그 수를 둔 판에서 백부터 읽은 점수 차다
    for (const { at, score } of root.choices) {
      if (at === null) continue;
      const placed = tryPlace(two, at, 1);
      if (!placed.ok) throw new Error("둘 수 없다");
      expect(score).toBe(solveEndgame(placed.board, area, 2).score);
    }
    // 수순은 차례마다 solveEndgame이 고르는 첫 수와 같고, 끝난 판의 점수 차도 같다
    const line = reader.line(two, 1);
    expect(line.moves.length).toBeGreaterThanOrEqual(2);
    let now = two;
    let turn: 1 | 2 = 1;
    for (const m of line.moves) {
      expect(solveEndgame(now, area, turn).best[0]).toBe(m);
      const placed = tryPlace(now, m, turn);
      if (!placed.ok) throw new Error("둘 수 없다");
      now = placed.board;
      turn = turn === 1 ? 2 : 1;
    }
    // 둘 다 쉬어 끝났다
    expect(solveEndgame(now, area, turn).best[0]).toBeNull();
    expect(line.score).toBe(solved.score);
  });
});
