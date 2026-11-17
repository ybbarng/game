import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { reductionGeometry } from "@game/cube-reduction";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { scrambledState } from "./scramble-test-util";
import { type YauSideHold, yauReduce } from "./yau";

/**
 * 야우 단원 길(docs/47 16-22): 한 번 넣은 흰 십자 엣지 블럭을 뒤 걸음이 빼지 않는다. 흰 십자 셋 단계가 넣은
 * 흰-초록·흰-빨강·흰-파랑은 끝까지, 마지막 십자 엣지 단계가 넣은 흰-주황은 엣지 짝 끝까지 제자리에 있다.
 * 옆 센터가 아직 섞인 동안의 「제자리」는 흰 십자 엣지끼리의 자리 관계로 본다(흰 면 아래, 흰-초록 앞이면
 * 흰-빨강 왼쪽·흰-파랑 뒤·흰-주황 오른쪽)
 */

const g = reductionGeometry(4);
const WHITE = 0;
const GREEN = 2;
const RED = 1;
const BLUE = 5;
const ORANGE = 4;
const center = (c: Uint8Array, f: number) => c[f * 16 + 5] as number;

/** 큐브 돌리기 24가지로 맞춘 큐브의 면 색 */
const FRAMES: number[][] = ["", "x", "x2", "x'", "z", "z'"].flatMap((a) =>
  ["", "y", "y'", "y2"].map((b) => {
    const c = faceColors(
      4,
      applyMoves(4, solvedCube(4), parseMoves(4, `${a} ${b}`.trim())),
    );
    return [0, 1, 2, 3, 4, 5].map((f) => c[f * 16] as number);
  }),
);

/** 흰 십자 엣지 블럭 가운데 서로 맞는 자리에 든 것(가장 많이 맞는 틀 하나로) */
function placedCross(s: PuzzleState): Set<number> {
  const c = faceColors(4, s);
  const wf = [0, 1, 2, 3, 4, 5].find((f) => center(c, f) === WHITE) as number;
  let best = new Set<number>();
  for (const fc of FRAMES) {
    if (fc[wf] !== WHITE) continue;
    const got = new Set<number>();
    for (const slot of g.slots) {
      const k = slot.faces.indexOf(wf);
      if (k < 0) continue;
      const side = slot.faces[1 - k] as number;
      const ok = slot.pieces.every(
        (pq) =>
          c[pq[k] as number] === WHITE && c[pq[1 - k] as number] === fc[side],
      );
      if (ok) got.add(fc[side] as number);
    }
    if (got.size > best.size) best = got;
  }
  return best;
}

/** 단원 길을 걸음마다 두며 넣은 흰 십자 엣지 블럭이 빠진 첫 걸음(없으면 null) */
function firstLoss(seed: number, hold: YauSideHold): string | null {
  const start = scrambledState("444", seed);
  const { stages } = yauReduce(start, undefined, "taught", hold);
  let s = start;
  const kept = new Set<number>();
  for (const stage of stages) {
    for (const step of stage.steps) {
      s = applyMoves(4, s, parseMoves(4, step));
      const now = placedCross(s);
      const lost = [...kept].filter((x) => !now.has(x));
      if (lost.length > 0)
        return `${stage.id} 「${step}」가 흰 십자 엣지(색 ${lost.join(",")})를 빼냄`;
    }
    if (stage.id === "cross3") for (const x of [GREEN, RED, BLUE]) kept.add(x);
    if (stage.id === "last-cross") kept.add(ORANGE);
    const now = placedCross(s);
    const missing = [...kept].filter((x) => !now.has(x));
    if (missing.length > 0)
      return `${stage.id} 끝에 흰 십자 엣지(색 ${missing.join(",")})가 없음`;
  }
  return null;
}

describe("야우 단원 길은 넣은 흰 십자 엣지 블럭을 빼지 않는다", () => {
  it("흰-주황이 우연히 제자리에 든 섞기(씨앗 1134)도 옆 센터는 흰-주황 자리를 오른쪽에 쥔다", () => {
    expect(firstLoss(1134, "orange")).toBeNull();
    // 계획 표 4·5의 컴퓨터가 쓰는 옛 쥐기(가장 짧은 쥐기)는 흰-빨강을 오른쪽에 두어 R이 빼냈다
    expect(firstLoss(1134, "shortest")).toBe(
      "centers-rest 「R2 2U' R' 2U」가 흰 십자 엣지(색 1)를 빼냄",
    );
  });

  it("대회 섞기 300개(씨앗 1000부터) 모두", () => {
    const bad: string[] = [];
    for (let seed = 1000; seed < 1300; seed++) {
      const why = firstLoss(seed, "orange");
      if (why) bad.push(`${seed}: ${why}`);
    }
    expect(bad).toEqual([]);
  });
});
