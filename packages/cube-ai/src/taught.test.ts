import {
  applyMoves,
  formatMove,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { toFacelets } from "./facelets";
import { solveBeginner2, solveBeginner3 } from "./methods";
import { Solve } from "./solve";
import {
  type CrossCase,
  cornersTaught,
  crossTaught,
  nextCrossEdge,
  whiteUp,
} from "./taught";

/**
 * 배우는 방식 흰 십자·첫 층(첫 화면 연출만). 경우마다 레슨과 같은 꼴인지, 늘 끝나는지 본다.
 * 기본 해법과 컴퓨터 계획은 바뀌지 않는다(선택지를 주지 않으면 이 파일의 함수를 부르지 않는다).
 */

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

/** 레슨(learn/lessons-333.ts 「흰 십자」)의 경우별 꼴. 마지막 옆면 돌리기가 모서리를 올린다 */
const UP_MIDDLE = "(U['2]? )?[RFLB]'?( U['2]?)?";
const FORM: Record<CrossCase, RegExp> = {
  "down-white-down": /^(D['2]? )?[RFLB]2$/,
  "top-wrong": /^(U['2]?|[RFLB]2 (D['2]? )?[RFLB]2)$/,
  middle: new RegExp(`^${UP_MIDDLE}$`),
  "down-white-side": new RegExp(`^(D['2]? )?[RFLB]'? ${UP_MIDDLE}$`),
  "top-flipped": new RegExp(`^[RFLB]'? ${UP_MIDDLE}$`),
};

const crossDone = (s: Solve) => {
  const r = s.rel();
  return (
    r[4] === "U" &&
    [1, 3, 5, 7].every((i) => r[i] === "U") &&
    r[10] === "R" &&
    r[19] === "F" &&
    r[37] === "L" &&
    r[46] === "B"
  );
};

const fmt = (s: Solve, from: number, to: number) =>
  s.moves
    .slice(from, to)
    .map((m) => formatMove(3, m))
    .join(" ");

describe("배우는 방식 흰 십자", () => {
  it("모서리마다 레슨의 다섯 경우 중 하나의 꼴로 넣고, 넣은 것을 지키며 늘 십자가 끝난다", () => {
    const seen = new Set<CrossCase>();
    for (const seed of SEEDS) {
      const s = new Solve(3, toFacelets(3, randomCubeState(3, seed)));
      whiteUp(s);
      for (let k = 0; k < 4; k++) {
        const next = nextCrossEdge(s);
        if (!next) break;
        seen.add(next.kind);
        expect(next.alg, `${seed} ${next.kind}`).toMatch(FORM[next.kind]);
        s.apply(next.alg);
      }
      expect(nextCrossEdge(s)).toBeNull();
      expect(crossDone(s)).toBe(true);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  // 레슨의 시연 상황(모범 답의 거꾸로)에서 같은 경우로 보고 같은 수를 낸다
  const LESSON: [CrossCase, string, string][] = [
    ["down-white-down", "F2", "F2"],
    ["down-white-down", "D' F2", "F2 D"],
    ["middle", "F'", "F"],
    ["middle", "U F' U'", "U F U'"],
    ["down-white-side", "F' U' R U", "U' R' U F"],
    ["top-flipped", "F U' R U", "U' R' U F'"],
    ["top-wrong", "U'", "U"],
  ];
  for (const [kind, alg, setup] of LESSON) {
    it(`레슨 상황 ${setup} → ${kind} ${alg}`, () => {
      const start = new Solve(3, SOLVED).apply(setup);
      const next = nextCrossEdge(start);
      expect(next?.kind).toBe(kind);
      // 같은 길이의 다른 손(F' 대신 F 등)도 레슨과 같은 꼴이다
      expect(next?.alg).toMatch(FORM[kind]);
      expect(next?.alg.split(" ").length).toBe(alg.split(" ").length);
    });
  }
});

describe("배우는 방식 첫 층 꼭짓점", () => {
  it("넣을 때마다 y로 칸을 UFR에 두고 D로 밑에 데려와 R' D' R D를 되풀이한다(빼기는 한 번)", () => {
    const insert = /^(y['2]? )?(D['2]? )?R' D' R D( R' D' R D)*$/;
    for (const seed of SEEDS) {
      const s = new Solve(3, toFacelets(3, randomCubeState(3, seed)));
      whiteUp(s);
      crossTaught(s);
      const from = s.moves.length;
      const looksBefore = s.lookList.length;
      cornersTaught(s);
      const cuts = [...s.lookList.slice(looksBefore), s.moves.length];
      expect(cuts[0]).toBe(from);
      for (let i = 0; i + 1 < cuts.length; i++) {
        const seg = fmt(s, cuts[i] as number, cuts[i + 1] as number);
        expect(seg, `${seed}: ${seg}`).toMatch(insert);
      }
      // 흰 면이 위에서 첫 층이 다 맞고 십자도 그대로
      const r = s.rel();
      expect(crossDone(s)).toBe(true);
      for (const i of [0, 2, 6, 8]) expect(r[i]).toBe("U");
    }
  });
});

describe("taught 선택지", () => {
  it("3×3 초보자: 흰 면 위 십자 → 첫 층 → z2 뒤 둘째 층부터 그대로, 다 맞춘다", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const start = randomCubeState(3, seed);
      const solve = solveBeginner3(start, { taught: true });
      const end = applyMoves(3, start, parseMoves(3, solve.moves.join(" ")));
      expect(isSolved(3, end)).toBe(true);
      const corners = solve.stages.find((st) => st.name === "corners");
      expect(solve.moves[(corners?.end ?? 0) - 1]).toBe("z2");
    }
  });

  it("2×2 초보자도 첫 층을 흰 면 위에서 맞추고 다 맞춘다", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const start = randomCubeState(2, seed);
      const solve = solveBeginner2(start, { taught: true });
      const end = applyMoves(2, start, parseMoves(2, solve.moves.join(" ")));
      expect(isSolved(2, end)).toBe(true);
      expect(solve.moves.join(" ")).toContain("R' D' R D");
    }
  });
});
