// @vitest-environment jsdom
import { type Cell, squareAt } from "@game/chess-engine";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChessBoard } from "./ChessBoard";

afterEach(cleanup);

/** 백 폰이 e2에서 e4로 옮겨 온 판 */
const from = squareAt("e2");
const to = squareAt("e4");
const board: Cell[] = Array.from({ length: 64 }, () => "");
board[to] = "wP";
board[squareAt("e1")] = "wK";
board[squareAt("e8")] = "bK";

/* 마지막 수의 움직임(2026-11-03 사용자: 장기처럼 판 게임 모두 검토). 칸 색칠은 원래 있었고 기물이 순간 이동했다 */
describe("체스판 마지막 수", () => {
  it("옮겨 온 기물만 출발 칸에서 미끄러져 온다(칸 한 개 = 1px 단위로 거리)", () => {
    const { container } = render(
      <ChessBoard
        board={board}
        flipped={false}
        legal={[]}
        selected={null}
        onSelect={() => {}}
        onMove={() => {}}
        lastMove={{ from, to }}
        checkedKing={null}
        coordinates={false}
      />,
    );
    const moved = container.querySelector<SVGElement>("[data-piece='wP']");
    expect(moved?.getAttribute("class")).toContain("jg-slide");
    expect(moved?.style.getPropertyValue("--jg-dx")).toBe("0px");
    expect(moved?.style.getPropertyValue("--jg-dy")).toBe("2px");
    const still = container.querySelector("[data-piece='wK']");
    expect(still?.getAttribute("class") ?? "").not.toContain("jg-slide");
  });
});
