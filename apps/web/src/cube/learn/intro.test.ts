import { parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import {
  FACE_WORDS,
  INTRO_TRIES,
  ROTATION_WORDS,
  SLICE_WORDS,
  WIDE_WORDS,
} from "./intro";

const one = (n: number, m: string) => {
  const moves = parseMoves(n, m);
  expect(moves).toHaveLength(1);
  return moves[0] as NonNullable<(typeof moves)[0]>;
};

describe("처음 안내의 표기 정의가 엔진과 같다", () => {
  it("면 여섯: 글자가 그 면을 돌린다", () => {
    const axis = { R: "x", L: "x", U: "y", D: "y", F: "z", B: "z" } as const;
    for (const f of FACE_WORDS)
      expect(one(3, f.letter).axis).toBe(axis[f.letter]);
  });

  it("마주 보고 시계 방향: 앞에서 보면 R과 L은 반대로 돈다", () => {
    const r = one(3, "R");
    const l = one(3, "L");
    expect(r.axis).toBe(l.axis);
    expect(r.turns).not.toBe(l.turns);
    expect(one(3, "R'").turns).toBe(3);
    expect(one(3, "R2").turns).toBe(2);
  });

  it.each(ROTATION_WORDS)("$move는 $like와 같은 쪽으로 큐브 전체", (w) => {
    const rot = one(3, w.move);
    const face = one(3, w.like);
    expect(rot.axis).toBe(face.axis);
    expect(rot.turns).toBe(face.turns);
    expect([rot.from, rot.to]).toEqual([1, 3]);
  });

  it.each(SLICE_WORDS)("$move($word)는 $like와 같은 쪽 가운데 층", (w) => {
    const s = one(3, w.move);
    const face = one(3, w.like);
    expect(s.axis).toBe(face.axis);
    expect(s.turns).toBe(face.turns);
    expect([s.from, s.to]).toEqual([2, 2]);
  });

  it.each(WIDE_WORDS)("$n×$n $move는 바깥에서 $from~$to층", (w) => {
    const m = one(w.n, w.move);
    // R 쪽 끝에서 센 층 번호. 엔진은 축의 + 끝에서 센다(R은 + 끝)
    expect(m.axis).toBe("x");
    expect([m.from, m.to]).toEqual([w.from, w.to]);
    expect(m.turns).toBe(one(w.n, "R").turns);
  });

  it("직접 쳐 보는 수는 모두 엔진이 읽는다", () => {
    for (const t of Object.values(INTRO_TRIES))
      expect(parseMoves(t.n, t.alg).length).toBeGreaterThan(0);
  });
});
