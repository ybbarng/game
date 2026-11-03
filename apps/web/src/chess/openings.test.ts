// @vitest-environment node
import {
  applyMove,
  moveToSan,
  parseFen,
  START_FEN,
  sanToMove,
} from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { allPaths } from "@/study/line";

import { learnerSide } from "./components/ChessLineScreen";
import { CHESS_OPENINGS } from "./openings";

describe("체스 오프닝 수순", () => {
  it("id가 겹치지 않고 모두 line-으로 시작하며 출처가 있다", () => {
    const ids = CHESS_OPENINGS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const line of CHESS_OPENINGS) {
      expect(line.id.startsWith("line-")).toBe(true);
      expect(line.source).toMatch(/^https:\/\//);
    }
  });

  it.each(CHESS_OPENINGS.map((l) => [l.name, l] as const))(
    "%s: 본줄기와 모든 갈래가 처음 판에서 규칙대로 두어지고, 기보 글자가 엔진과 같다",
    (_name, line) => {
      for (const path of allPaths(line)) {
        let pos = parseFen(line.start ?? START_FEN);
        for (const node of path) {
          const move = sanToMove(pos, node.move);
          if (!move)
            throw new Error(`${line.name}: 둘 수 없는 수 ${node.move}`);
          // 체크 표시(+)까지 엔진이 만든 기보와 같아야 화면에 보이는 글자가 맞다.
          expect(moveToSan(pos, move)).toBe(node.move);
          pos = applyMove(pos, move);
        }
      }
    },
  );

  it("배우는 편이 둔 수에는 모두 설명이 있다", () => {
    for (const line of CHESS_OPENINGS)
      for (const path of allPaths(line))
        path.forEach((node, ply) => {
          // 처음 두 수(e4·d4와 그 맞수)는 앞 단원에서 익혔으니 설명을 건너뛰어도 된다.
          if (ply % 2 !== line.learner || ply < 2) return;
          expect(
            node.note,
            `${line.name} ${ply + 1}번째 수 ${node.move}`,
          ).toBeTruthy();
        });
  });
});

describe("체스 수순의 배우는 편", () => {
  const base = CHESS_OPENINGS[0];
  if (!base) throw new Error("수순 없음");
  it("처음 판에서는 learner 0이 백, 1이 흑", () => {
    expect(learnerSide({ ...base, learner: 0 })).toBe("w");
    expect(learnerSide({ ...base, learner: 1 })).toBe("b");
  });
  it("흑 차례로 시작하는 판이면 learner 0이 흑이다", () => {
    const start = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    expect(learnerSide({ ...base, start, learner: 0 })).toBe("b");
    expect(learnerSide({ ...base, start, learner: 1 })).toBe("w");
  });
});
