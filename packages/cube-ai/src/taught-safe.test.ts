import {
  type CubeMove,
  formatMove,
  isRotation,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { cornerFacelets, EDGE_FACELETS } from "./cubie";
import { toFacelets } from "./facelets";
import { BEGINNER3_TAUGHT_STEPS, solveBeginner2 } from "./methods";
import { Solve } from "./solve";

// ---------- 맞춘 면은 돌리지 않는다(docs/47 0절 2026-11-05) ----------

const WHITE = "U";
const YELLOW = "D";
const EDGE_SLOTS = EDGE_FACELETS.map((x) => [...x] as number[]);
const CORNER_SLOTS = cornerFacelets(3);

/**
 * 단계 끝까지 맞아야 할 조각(실제 색으로 고름). 맞춘 면은 흰 면이고 그 면은 돌리지 않는다.
 * 안전한 층은 그 반대쪽(노란 센터 쪽)이다
 */
const GOALS = {
  cross: (c: string) => c.length === 2 && c.includes(WHITE),
  corners: (c: string) => c.includes(WHITE),
  middle: (c: string) => !c.includes(YELLOW),
} as const;
type GoalStage = keyof typeof GOALS;

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"];
const centerFace = (s: Solve, color: string) =>
  FACE_ORDER[[0, 1, 2, 3, 4, 5].findIndex((k) => s.f[k * 9 + 4] === color)];
const sideOf = (i: number) => FACE_ORDER[Math.floor(i / 9)];

/** 조각 자리마다 {색 열쇠, 맞았나, 안전한 층(노란 센터 쪽)인가} */
function pieces(s: Solve) {
  const safe = centerFace(s, YELLOW);
  const rel = s.rel();
  const slots = [...EDGE_SLOTS, ...CORNER_SLOTS];
  return slots.map((slot) => ({
    key: slot
      .map((i) => s.f[i])
      .sort()
      .join(""),
    solved: slot.every((i) => rel[i] === sideOf(i)),
    safe: slot.some((i) => sideOf(i) === safe),
  }));
}

describe("맞춘 면은 돌리지 않는다(십자·첫 층 코너·둘째 층)", () => {
  it("섞기 300개: 맞춘 면을 돌리는 수가 없고, 넣은 조각은 그대로이며, 조각마다 안전한 층을 거쳐 들어간다", () => {
    const first = BEGINNER3_TAUGHT_STEPS[0] as (s: Solve) => void;
    for (let seed = 1; seed <= 300; seed++) {
      const start = toFacelets(3, randomCubeState(3, seed));
      const s = new Solve(3, start);
      first(s);
      const replay = new Solve(3, start);
      for (const st of s.stageList) {
        const stage = st.name as GoalStage;
        const wanted = (p: { key: string }) => GOALS[stage](p.key);
        const visitedSafe = new Set(
          pieces(replay)
            .filter((p) => wanted(p) && p.safe)
            .map((p) => p.key),
        );
        const before = new Set(
          pieces(replay)
            .filter((p) => wanted(p) && p.solved)
            .map((p) => p.key),
        );
        const keep = new Set(before);
        const cuts = new Set([...s.lookList, st.end]);
        for (let k = st.start; k < st.end; k++) {
          const m = s.moves[k] as CubeMove;
          if (!isRotation(3, m)) {
            // 맞춘 면(흰 센터 쪽) 층을 돌리는 수가 없다
            const name = formatMove(3, m);
            expect(name[0], `${seed} ${stage} ${name}`).not.toBe(
              centerFace(replay, WHITE),
            );
          }
          replay.applyMove(m);
          const now = pieces(replay).filter(wanted);
          for (const p of now) if (p.safe) visitedSafe.add(p.key);
          if (cuts.has(k + 1)) {
            // 살피는 자리마다(조각 하나를 넣은 뒤) 앞서 맞춘 조각이 그대로다
            const solved = now.filter((p) => p.solved).map((p) => p.key);
            for (const key of keep)
              expect(solved.includes(key), `${seed} ${stage} @${k + 1}`).toBe(
                true,
              );
            // 새로 맞은 조각 가운데 넣으려던 것은 안전한 층을 거쳐 왔다(다른 것은 함께 맞았을 수 있다)
            const fresh = solved.filter((key) => !keep.has(key));
            if (fresh.length > 0)
              expect(
                fresh.some((key) => visitedSafe.has(key)),
                `${seed} ${stage} ${fresh}`,
              ).toBe(true);
            for (const key of fresh) keep.add(key);
          }
        }
        const end = pieces(replay).filter(wanted);
        expect(
          end.every((p) => p.solved),
          `${seed} ${stage}`,
        ).toBe(true);
      }
      expect(replay.f.join("")).toBe(s.f.join(""));
    }
  });

  it("2×2 첫 층도 흰 면을 돌리지 않는다", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const solve = solveBeginner2(randomCubeState(2, seed), { taught: true });
      const st = solve.stages.find((x) => x.name === "first-layer");
      const inner = solve.moves.slice((st?.start ?? 0) + 1, (st?.end ?? 0) - 1);
      expect(solve.moves[st?.start ?? 0]).toBe("z2");
      expect(solve.moves[(st?.end ?? 0) - 1]).toBe("z2");
      for (const m of inner) expect(m[0], `${seed} ${m}`).not.toBe("U");
    }
  });
});
