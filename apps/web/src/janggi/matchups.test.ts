// @vitest-environment node
import {
  applyMove,
  type Board,
  type Cell,
  pointAt,
  pointName,
  pseudoTargets,
  SETUPS,
  type Setup,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import {
  bestAgainst,
  drillOrder,
  FORMATION,
  isMatsang,
  matchup,
} from "./matchups";
import { openingPieces } from "./opening-lessons";

const ALL = SETUPS.map((s) => s.value);

function boardOf(cho: Setup, han: Setup): Board {
  const board = new Array<Cell>(90).fill("");
  for (const [name, piece] of Object.entries(openingPieces(cho, han)))
    board[pointAt(name)] = piece;
  return board;
}

/** 그 편 상이 선 세로줄 */
const elephantColumns = (board: Board, piece: "cE" | "hE") =>
  board.flatMap((c, at) => (c === piece ? [pointName(at)[1]] : [])).sort();

/** 이 자리를 지키는 그 편 마 */
function horseGuards(board: Board, name: string, horse: "cN" | "hN") {
  const at = pointAt(name);
  const probe = [...board];
  probe[at] = horse === "cN" ? "hP" : "cP";
  return probe.flatMap((cell, from) =>
    cell === horse && pseudoTargets(probe, from).includes(at)
      ? [pointName(from)]
      : [],
  );
}

describe("16가지 짝", () => {
  it("모든 짝에 등급과 마침표로 끝나는 까닭이 있고, 한 차림마다 권하는 것이 있다", () => {
    for (const han of ALL) {
      for (const cho of ALL) {
        const m = matchup(han, cho);
        expect(m.reason.endsWith(".")).toBe(true);
      }
      expect(bestAgainst(han).length).toBeGreaterThan(0);
    }
  });

  it("맞상은 두 편 상이 같은 세로줄에 서는 귀마 짝이고 피한다, 엇상은 권한다", () => {
    for (const han of ALL)
      for (const cho of ALL) {
        if (FORMATION[cho] !== "귀마" || FORMATION[han] !== "귀마") continue;
        const board = boardOf(cho, han);
        const same =
          elephantColumns(board, "cE").join() ===
          elephantColumns(board, "hE").join();
        expect(isMatsang(cho, han), `${cho}/${han}`).toBe(same);
        expect(matchup(han, cho).grade).toBe(same ? "avoid" : "best");
      }
  });

  it("한이 원앙마·양귀마면 귀마 둘을 모두 권한다(두 차림은 좌우가 같다)", () => {
    for (const han of ["NEEN", "ENNE"] as const) {
      expect(bestAgainst(han).sort()).toEqual(["ENEN", "NENE"]);
      expect(han.split("").reverse().join("")).toBe(han);
    }
  });

  it("양귀마는 두 마를 귀에 들이면 가운데 졸·병을 지키는 마가 없다(초 75, 한 45)", () => {
    let board = boardOf("ENNE", "ENNE");
    for (const text of ["03-84", "07-86", "13-34", "17-36"]) {
      const [f = "", t = ""] = text.split("-");
      board = applyMove(board, { from: pointAt(f), to: pointAt(t) });
    }
    expect(horseGuards(board, "75", "cN")).toEqual([]);
    expect(horseGuards(board, "45", "hN")).toEqual([]);
    for (const han of ALL) expect(matchup(han, "ENNE").grade).toBe("avoid");
  });
});

describe("반복 문제 순서", () => {
  it("넷이 고루 나오고 같은 차림이 잇달아 나오지 않는다", () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let k = 0; k < 20; k++) {
      const order = drillOrder(10, random);
      expect(order).toHaveLength(10);
      for (const s of ALL)
        expect(order.filter((o) => o === s).length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < order.length; i++)
        expect(order[i]).not.toBe(order[i - 1]);
    }
  });
});
