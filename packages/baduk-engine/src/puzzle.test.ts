import { describe, expect, it } from "vitest";

import { boardHash, type Cell, emptyBoard, pointAt, tryPlace } from "./board";
import {
  bestDefense,
  canCapture,
  canKill,
  canLive,
  captureMoves,
  koRecapturePoint,
  lifeKeyMoves,
  passAliveStones,
  snapbackGain,
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
