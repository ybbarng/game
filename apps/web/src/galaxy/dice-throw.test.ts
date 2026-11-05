import { describe, expect, it } from "vitest";

import { diePose, FACE_OF, restAngles } from "./dice-throw";

/** CSS rotateZ(z) rotateX(x) rotateY(y)를 점 하나에 건다(오른쪽 것부터) */
function rotate(
  p: [number, number, number],
  pose: { x: number; y: number; z: number },
): [number, number, number] {
  const r = (d: number) => (d * Math.PI) / 180;
  let [x, y, z] = p;
  // rotateY
  [x, z] = [
    x * Math.cos(r(pose.y)) + z * Math.sin(r(pose.y)),
    -x * Math.sin(r(pose.y)) + z * Math.cos(r(pose.y)),
  ];
  // rotateX
  [y, z] = [
    y * Math.cos(r(pose.x)) - z * Math.sin(r(pose.x)),
    y * Math.sin(r(pose.x)) + z * Math.cos(r(pose.x)),
  ];
  // rotateZ
  [x, y] = [
    x * Math.cos(r(pose.z)) - y * Math.sin(r(pose.z)),
    x * Math.sin(r(pose.z)) + y * Math.cos(r(pose.z)),
  ];
  return [x, y, z];
}

/** 면이 바라보는 쪽(CSS: 오른쪽 +x, 아래 +y, 보는 쪽 +z) */
const NORMAL: Record<keyof typeof FACE_OF, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, -1, 0],
  bottom: [0, 1, 0],
};

const frontFace = (pose: { x: number; y: number; z: number }) =>
  (Object.keys(NORMAL) as (keyof typeof FACE_OF)[]).find(
    (f) => rotate(NORMAL[f], pose)[2] > 0.99,
  );

describe("주사위 던지기 연출", () => {
  it("멈추면 결과 눈이 보는 쪽을 향하고 바닥에 놓인다(어느 굴림이든)", () => {
    for (let v = 1; v <= 6; v++)
      for (const seed of [0, 1, 1234, 98765])
        for (const which of [0, 1] as const) {
          const pose = diePose(1, v, which, seed);
          expect(pose.lift).toBe(0);
          expect(pose.dx).toBe(0);
          expect(pose.dy).toBe(0);
          const face = frontFace(pose);
          expect(face && FACE_OF[face]).toBe(v);
        }
    expect(restAngles(1)).toEqual({ x: 0, y: 0 });
  });

  it("던져진 뒤 점점 낮게 튕기고, 높이는 바닥 아래로 가지 않는다", () => {
    const peaks: number[] = [];
    let prev = 0;
    let rising = true;
    for (let i = 0; i <= 1000; i++) {
      const { lift } = diePose(i / 1000, 3, 0, 42);
      expect(lift).toBeGreaterThanOrEqual(0);
      if (rising && lift < prev) {
        peaks.push(prev);
        rising = false;
      } else if (!rising && lift > prev) rising = true;
      prev = lift;
    }
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < peaks.length; i++)
      expect(peaks[i]).toBeLessThan(peaks[i - 1] as number);
  });

  it("두 주사위는 다른 모양으로 던져지고, 같은 굴림은 늘 같은 모양이다", () => {
    expect(diePose(0.3, 4, 0, 7)).toEqual(diePose(0.3, 4, 0, 7));
    expect(diePose(0.3, 4, 0, 7)).not.toEqual(diePose(0.3, 4, 1, 7));
  });
});
