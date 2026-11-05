import { randomCubeState } from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { cornerFacelets, EDGE_FACELETS } from "./cubie";
import { toFacelets } from "./facelets";
import { solveBeginner2, solveBeginner3, start2 } from "./methods";
import { type HumanSolve, Solve } from "./solve";
import { nextCrossEdge, whiteUp } from "./taught";

/**
 * 배우는 방식은 살피는 자리마다 조각 하나만 넣는다(2026-11-05 사용자 「'강조한' 것들을 맞추려는 의도를 가지고
 * 진행되기를 바래. 표시랑 다르게 동작하지 말고」). 첫 화면 연출은 살피는 자리마다 조각 하나를 강조하므로,
 * 그 사이에 두 조각이 맞으면 강조와 실제 넣는 조각이 어긋난다.
 *
 * - 흰 십자 엣지 하나를 넣는 수는 토막(큐브 돌리기 → 칸 밑으로 D → F 공식) 끝마다 다른 흰 엣지를 제자리에 두지 않는다.
 * - 결과(합친 뒤)의 살피는 자리 사이마다 새로 맞은 조각이 하나 이하다(3×3 십자·첫 층 코너·둘째 층, 2×2 첫 층).
 *   예전에는 앞 조각의 끝 수와 다음 조각의 첫 수가 합쳐져(`F2 | F'` → `F`) 앞 조각의 끝이 다음 차례로 넘어갔다.
 */

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const FACE_LETTERS = "URFDLB";

type Kind = "white-edge" | "white-corner" | "middle-edge";

/** 맞은 조각 수(기준: 3×3은 센터, 2×2는 풀이 기준 방향). 쥔 방향과 상관없다 */
function solvedCount(s: Solve, kind: Kind): number {
  const nn = s.n * s.n;
  const rel = s.rel();
  const slots: readonly (readonly number[])[] =
    kind === "white-corner" ? cornerFacelets(s.n) : EDGE_FACELETS;
  return slots.filter((slot) => {
    const ok = slot.every((i) => rel[i] === FACE_LETTERS[Math.floor(i / nn)]);
    if (!ok) return false;
    const colors = slot.map((i) => s.f[i]);
    if (kind === "middle-edge")
      return !colors.includes("U") && !colors.includes("D");
    return colors.includes("U");
  }).length;
}

const isRotation = (m: string) => /^[xyz]/.test(m);

/** 단계의 살피는 자리 사이마다 새로 맞은 조각 수 */
function freshPerLook(
  start: Solve,
  solve: HumanSolve,
  stage: string,
  kind: Kind,
): { moves: string; fresh: number }[] {
  const st = solve.stages.find((x) => x.name === stage);
  if (!st) throw new Error(stage);
  const s = start.clone();
  s.apply(solve.moves.slice(0, st.start).join(" "));
  // 단계 끝의 뒤집기(z2)는 빼고 본다(코너는 흰 면 위에서 센다)
  let end = st.end;
  while (end > st.start && isRotation(solve.moves[end - 1] as string)) end--;
  const cuts = [
    st.start,
    ...solve.looks.filter((l) => l > st.start && l < end),
    end,
  ];
  const out: { moves: string; fresh: number }[] = [];
  // 단계 앞의 쥐기(흰 면 위로)는 센 수에 넣지 않는다
  let lead = st.start;
  while (lead < end && isRotation(solve.moves[lead] as string)) lead++;
  s.apply(solve.moves.slice(st.start, lead).join(" "));
  let before = solvedCount(s, kind);
  for (let c = 0; c + 1 < cuts.length; c++) {
    const from = Math.max(cuts[c] as number, lead);
    const to = cuts[c + 1] as number;
    if (to <= from) continue;
    const moves = solve.moves.slice(from, to).join(" ");
    s.apply(moves);
    const now = solvedCount(s, kind);
    out.push({ moves, fresh: now - before });
    before = now;
  }
  return out;
}

describe("배우는 방식: 살피는 자리마다 조각 하나", () => {
  it("흰 십자 섞기 200개: 엣지 하나를 넣는 수는 토막 끝마다 다른 흰 엣지를 제자리에 두지 않는다", () => {
    let rounds = 0;
    for (const seed of SEEDS) {
      const s = new Solve(3, toFacelets(3, randomCubeState(3, seed)));
      whiteUp(s);
      for (let k = 0; k < 4; k++) {
        const next = nextCrossEdge(s);
        if (!next) break;
        const before = solvedCount(s, "white-edge");
        // 토막 경계: 층 수 뒤에 오는 큐브 돌리기 앞
        const moves = next.alg.split(" ");
        for (let i = 0; i < moves.length; i++) {
          const m = moves[i] as string;
          if (i > 0 && isRotation(m) && !isRotation(moves[i - 1] as string)) {
            rounds++;
            expect(
              solvedCount(s, "white-edge"),
              `${seed} ${next.alg} @${i}`,
            ).toBeLessThanOrEqual(before);
          }
          s.apply(m);
        }
        expect(solvedCount(s, "white-edge"), `${seed} ${next.alg}`).toBe(
          before + 1,
        );
      }
    }
    expect(rounds).toBeGreaterThan(0);
  });

  it("3×3 섞기 200개: 십자는 살피는 자리마다 엣지 하나씩, 첫 층 코너·둘째 층은 하나 이하씩 맞는다", () => {
    for (const seed of SEEDS) {
      const state = randomCubeState(3, seed);
      const solve = solveBeginner3(state, { taught: true });
      const start = new Solve(3, toFacelets(3, state));
      for (const [stage, kind] of [
        ["cross", "white-edge"],
        ["corners", "white-corner"],
        ["middle", "middle-edge"],
      ] as const) {
        for (const seg of freshPerLook(start, solve, stage, kind)) {
          const where = `${seed} ${stage} ${seg.moves}`;
          expect(seg.fresh, where).toBeGreaterThanOrEqual(0);
          expect(seg.fresh, where).toBeLessThanOrEqual(1);
          // 십자는 엣지마다 살핀다(빼기 토막만으로 끝나는 차례가 없다)
          if (stage === "cross") expect(seg.fresh, where).toBe(1);
        }
      }
    }
  });

  it("2×2 섞기 200개: 첫 층은 살피는 자리마다 코너가 하나 이하씩 맞는다", () => {
    for (const seed of SEEDS) {
      const state = randomCubeState(2, seed);
      const solve = solveBeginner2(state, { taught: true });
      const segs = freshPerLook(
        start2(state),
        solve,
        "first-layer",
        "white-corner",
      );
      expect(segs.length).toBeGreaterThan(0);
      for (const seg of segs) {
        const where = `${seed} ${seg.moves}`;
        expect(seg.fresh, where).toBeGreaterThanOrEqual(0);
        expect(seg.fresh, where).toBeLessThanOrEqual(1);
      }
    }
  });
});
