import { solveBeginner3 } from "@game/cube-ai";
import { faceColors, randomCubeState } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { nextStep, piecePlace, play, stepMoves } from "./beginner-path";

/**
 * 첫 화면 초보자 시연(`@game/cube-ai` `taught.ts`, Cubie 홈 시연은 코어 `taught.rs`)의 흰 십자는 3×3 처음 맞추기 강의
 * 경우별 정해진 길(`beginner-path.ts` 흰 십자)과 같다(docs/47 16-34). 시연이 고른 엣지 블럭을 강의 길로 넣으면
 * 걸음마다 같은 수가 나와야 한다. 첫 층 이후는 시연이 따로 정한 지름길이라 견주지 않는다(2026-11-05).
 */

type Face = "U" | "R" | "F" | "D" | "L" | "B";
const FACES: readonly Face[] = ["U", "R", "F", "D", "L", "B"];
/** 옆 색(맞춘 큐브의 면 글자) 차례: 강의 길이 엣지를 고르는 차례와 같다(초록·빨강·파랑·주황) */
const SIDES: readonly Face[] = ["F", "R", "B", "L"];

const centerFace = (s: PuzzleState, color: Face) => {
  const col = faceColors(3, s);
  return FACES[
    [0, 1, 2, 3, 4, 5].findIndex((k) => col[k * 9 + 4] === FACES.indexOf(color))
  ] as Face;
};

/** 흰-`side` 엣지 블럭이 제자리·바른 방향 */
const edgeOk = (s: PuzzleState, side: Face) => {
  const [w, c] = piecePlace(s, ["U", side]);
  return w === centerFace(s, "U") && c === centerFace(s, side);
};

/** 강의 길로 흰-`side` 엣지 블럭을 넣는 걸음들(강은 「어느 것부터 해도 돼요」라 그 블럭을 고르게 한다) */
function lessonSteps(s: PuzzleState, side: Face): string[] {
  const out: string[] = [];
  let t = s;
  while (!edgeOk(t, side)) {
    const todo = SIDES.filter((x) => !edgeOk(t, x));
    const st = nextStep("cross", t, () => todo.indexOf(side));
    if (!st) throw new Error("십자가 이미 다 됐다");
    out.push(stepMoves(st));
    t = play(t, stepMoves(st));
    if (out.length > 2)
      throw new Error(`${side} 엣지가 두 걸음 안에 들지 않는다`);
  }
  return out;
}

const isRotation = (m: string) => /^[xyz]/.test(m);

describe("첫 화면 초보자 시연의 흰 십자는 강의 길과 같다", () => {
  it("섞기 100개: 살피는 자리마다 엣지 블럭 하나, 그 수가 강의 길의 걸음을 이은 것과 같다", () => {
    let twoSteps = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const start = randomCubeState(3, seed);
      const solve = solveBeginner3(start, { taught: true });
      const st = solve.stages.find((x) => x.name === "cross");
      if (!st) throw new Error(`${seed}: 십자 단계 없음`);
      const cuts = [
        st.start,
        ...solve.looks.filter((l) => l > st.start && l < st.end),
        st.end,
      ];
      let t = play(start, solve.moves.slice(0, st.start).join(" "));
      for (let i = 0; i + 1 < cuts.length; i++) {
        const seg = solve.moves.slice(cuts[i], cuts[i + 1]);
        const moves = seg.join(" ");
        const after = play(t, moves);
        // 흰 면을 위로 드는 쥐기 토막
        if (seg.every(isRotation)) {
          t = after;
          continue;
        }
        const fresh = SIDES.filter((x) => !edgeOk(t, x) && edgeOk(after, x));
        expect(fresh, `${seed} ${moves}`).toHaveLength(1);
        const steps = lessonSteps(t, fresh[0] as Face);
        if (steps.length === 2) twoSteps++;
        expect(moves, `${seed}`).toBe(steps.join(" "));
        t = after;
      }
      expect(
        SIDES.filter((x) => edgeOk(t, x)),
        `${seed}`,
      ).toEqual(SIDES);
    }
    // 가운데 층·위 층에서 내린 뒤 올리는 엣지 블럭도 나온다
    expect(twoSteps).toBeGreaterThan(0);
  });
});
