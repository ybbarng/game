import {
  createJanggiScenario,
  type Piece,
  pointAt,
  pointName,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { piecesInDanger } from "./danger";

/** 두 궁은 엇갈린 줄에 둔다(빅장이 아니게) */
const KINGS: Record<string, Piece> = { "95": "cK", "24": "hK" };

function dangerOf(pieces: Record<string, Piece>, kings = KINGS) {
  const { board } = createJanggiScenario({ pieces: { ...kings, ...pieces } });
  return piecesInDanger(board, "c").map(pointName);
}

describe("잡힐 위험 표시", () => {
  it("지키는 기물이 없는데 상대가 노리면 위험이다", () => {
    expect(dangerOf({ "51": "cR", "11": "hR" })).toEqual(["51"]);
  });

  it("같은 값 기물이 노려도 내가 다시 잡을 수 있으면 위험이 아니다", () => {
    expect(dangerOf({ "51": "cR", "11": "hR", "71": "cR" })).toEqual([]);
  });

  it("지켜져 있어도 더 작은 기물이 노리면 위험이다", () => {
    expect(dangerOf({ "51": "cR", "41": "hP", "71": "cR" })).toEqual(["51"]);
  });

  // 되받아 잡기는 잡으러 온 상대 기물이 그 칸에 선 판으로 따진다(포는 포를 못 잡는다).
  it("상대 포가 잡으러 오면 내 포로는 되받지 못해 공짜다", () => {
    expect(
      dangerOf({ "51": "cP", "91": "cC", "71": "cP", "11": "hC", "31": "hP" }),
    ).toEqual(["51"]);
  });

  it("내 포가 지키는 포를 상대 차가 잡으면 차를 되받아 잡으니 위험이 아니다", () => {
    expect(
      dangerOf({ "51": "cC", "11": "hR", "71": "cP", "81": "cC" }),
    ).toEqual([]);
  });

  it("잡으면 상대 자기 궁이 드러나는 수는 노림으로 치지 않는다", () => {
    // 한 차(16)가 내 졸(36)을 잡으러 내려가면 한 궁(14)이 내 차(19)에 드러난다.
    // 내 차(19)는 한 차가 노리지만 다른 내 차(99)가 지킨다.
    expect(
      dangerOf(
        { "16": "hR", "36": "cP", "19": "cR", "99": "cR" },
        { "95": "cK", "14": "hK" },
      ),
    ).toEqual([]);
  });

  it("상대 궁은 지켜진 기물을 잡을 수 없으니 위험으로 치지 않는다", () => {
    // 한 궁(24) 옆 25의 내 졸을 같은 줄의 내 차(55)가 지킨다.
    expect(dangerOf({ "25": "cP", "55": "cR" })).toEqual([]);
    expect(dangerOf({ "25": "cP" })).toEqual(["25"]);
  });

  it("궁은 장군 표시가 따로 있어 넣지 않는다", () => {
    expect(dangerOf({ "15": "hR" }).includes(pointName(pointAt("95")))).toBe(
      false,
    );
  });
});
