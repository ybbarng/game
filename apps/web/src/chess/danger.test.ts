// @vitest-environment node
import { parseFen, squareName } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { hangingPieces } from "./danger";

const names = (fen: string, side: "w" | "b" = "w") =>
  hangingPieces(parseFen(fen), side).map(squareName);

describe("잡힐 기물 표시", () => {
  it("처음 판에는 잡힐 기물이 없다", () => {
    expect(
      names("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    ).toEqual([]);
  });

  it("지키는 기물이 없는데 노려지면 표시한다(공짜로 잡힌다)", () => {
    // 백 나이트 e5를 흑 퀸 e7이 노리고, 지키는 백 기물이 없다
    expect(names("4k3/4q3/8/4N3/8/8/8/K7 w - - 0 1")).toEqual(["e5"]);
  });

  it("지켜져 있고 더 비싼 기물만 노리면 표시하지 않는다", () => {
    // 백 나이트 e5를 폰 d4가 지키고 흑 퀸이 노린다(퀸이 잡으면 손해)
    expect(names("4k3/4q3/8/4N3/3P4/8/8/K7 w - - 0 1")).toEqual([]);
  });

  it("지켜져 있어도 더 싼 기물이 노리면 표시한다(폰이 나이트를 노린다)", () => {
    expect(names("4k3/8/3p4/4N3/3P4/8/8/K7 w - - 0 1")).toEqual(["e5"]);
  });

  it("킹은 표시하지 않는다(체크 표시가 따로 있다)", () => {
    expect(names("4k3/4r3/8/8/8/8/8/4K3 w - - 0 1")).toEqual([]);
  });

  it("흑 편도 같은 기준으로 본다", () => {
    expect(names("4k3/8/8/3b4/8/8/8/K2R4 b - - 0 1", "b")).toEqual(["d5"]);
  });
});

describe("잡힐 기물 표시(튜토리얼 체크 장면)", () => {
  it("흑 룩 e5가 지키는 이 없는 백 룩 a5를 노린다", () => {
    expect(names("4k3/8/8/R3r3/8/8/8/4K3 w - - 0 1")).toEqual(["a5"]);
  });
});
