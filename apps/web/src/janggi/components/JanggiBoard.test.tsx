// @vitest-environment jsdom
import { type Cell, indexOf } from "@game/janggi-engine";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JanggiBoard } from "./JanggiBoard";

afterEach(cleanup);

/** 차 하나가 (0,9)에서 (0,6)으로 옮겨 온 판 */
const from = indexOf(0, 9);
const to = indexOf(0, 6);
const board: Cell[] = Array.from({ length: 90 }, () => "");
board[to] = "cR";
board[indexOf(4, 8)] = "cK";
board[indexOf(4, 1)] = "hK";

function show() {
  return render(
    <JanggiBoard
      board={board}
      flipped={false}
      legal={[]}
      selected={null}
      onSelect={() => {}}
      onMove={() => {}}
      lastMove={{ from, to }}
      checkedKing={null}
      labels="hanja"
    />,
  );
}

/*
 * 마지막 수 표시(2026-11-03 회사 직원: 상대가 무엇을 두었는지 표시가 안 돼 헷갈린다). 예전 옅은 노란 원은 나무 판에서
 * 거의 안 보였고 도착 원은 기물에 가려졌다
 */
describe("장기판 마지막 수", () => {
  it("출발 자리에 점선 고리, 도착 기물 둘레에 고리를 기물보다 위에 그린다", () => {
    const { container } = show();
    const start = container.querySelector("[data-last-from]");
    const end = container.querySelector("[data-last-to]");
    expect(start?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(end).not.toBeNull();
    const piece = container.querySelector("[data-piece='cR']");
    expect(
      (piece as Node).compareDocumentPosition(end as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("옮겨 온 기물만 출발 자리에서 미끄러져 온다(판 한 칸 = 1px 단위로 거리)", () => {
    const { container } = show();
    const moved = container.querySelector<SVGGElement>("[data-piece='cR']");
    expect(moved?.getAttribute("class")).toContain("jg-slide");
    expect(moved?.style.getPropertyValue("--jg-dx")).toBe("0px");
    expect(moved?.style.getPropertyValue("--jg-dy")).toBe("3px");
    const still = container.querySelector("[data-piece='cK']");
    expect(still?.getAttribute("class") ?? "").not.toContain("jg-slide");
  });
});

describe("장기판 도움 표시", () => {
  it("잡힐 위험이 있는 기물과 힌트 수에 고리를 그린다", () => {
    const { container } = render(
      <JanggiBoard
        board={board}
        flipped={false}
        legal={[]}
        selected={null}
        onSelect={() => {}}
        onMove={() => {}}
        lastMove={null}
        checkedKing={null}
        labels="hanja"
        danger={[to]}
        hint={{ from: to, to: indexOf(0, 5) }}
      />,
    );
    const danger = container.querySelectorAll("[data-danger]");
    expect(danger).toHaveLength(1);
    expect(danger[0]?.getAttribute("data-danger")).toBe("71");
    expect(container.querySelectorAll("[data-hint]")).toHaveLength(2);
  });
});

/* 배우기 미션은 힌트가 자리 이름(41, 59 등)을 쓰니 판에 칸 번호를 보인다(2026-11-06) */
describe("장기판 칸 번호", () => {
  const numbers = (flipped: boolean, coords: boolean) => {
    const { container } = render(
      <JanggiBoard
        board={board}
        flipped={flipped}
        legal={[]}
        selected={null}
        onSelect={() => {}}
        onMove={() => {}}
        lastMove={null}
        checkedKing={null}
        labels="hanja"
        coords={coords}
      />,
    );
    const texts = (sel: string) =>
      [...container.querySelectorAll(sel)].map((e) => e.textContent);
    return { cols: texts("[data-axis-col]"), rows: texts("[data-axis-row]") };
  };

  it("기본으로는 없고, coords면 세로줄 1~9와 가로줄 1~9·0을 보인다", () => {
    expect(numbers(false, false).cols).toEqual([]);
    cleanup();
    const { cols, rows } = numbers(false, true);
    expect(cols).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(rows).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
  });

  it("뒤집은 판에서는 번호도 거꾸로 놓인다", () => {
    const { cols, rows } = numbers(true, true);
    expect(cols).toEqual(["9", "8", "7", "6", "5", "4", "3", "2", "1"]);
    expect(rows).toEqual(["0", "9", "8", "7", "6", "5", "4", "3", "2", "1"]);
  });
});
