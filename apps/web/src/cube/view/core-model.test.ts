import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  buildCoreModel,
  CENTER_AT,
  CORNER_AT,
  EDGE_AT,
  HALF,
  SHELL,
} from "./core-model";

/** 도형의 꼭짓점 중 `inRegion`인 것에서 `from`까지 가장 가까운 거리 */
function nearest(
  g: THREE.BufferGeometry,
  inRegion: (v: THREE.Vector3) => boolean,
  from: THREE.Vector3,
): number {
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (inRegion(v)) min = Math.min(min, v.distanceTo(from));
  }
  return min;
}

/** 떼어 놓은 조각이 맞춘 큐브에 있을 때의 큐브 가운데(조각 자리에서 `dir` 반대로 `assembled`만큼) */
const centerFor = (at: THREE.Vector3, assembled: number) =>
  at.clone().sub(at.clone().normalize().multiplyScalar(assembled));

describe("분해한 큐브의 속 도형", () => {
  const model = buildCoreModel();

  it("재질별로 합쳐 그리기는 여덟 번: 검은 플라스틱 하나, 쇠 하나, 면 색 여섯", () => {
    expect([...model.stickers.keys()].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(model.body.index).toBeNull();
    expect(model.metal.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("센터 받침이 엣지 발을, 엣지 발이 코너 발을 덮고, 모두 센터 블럭 몸통 안쪽 면보다 안에 있다", () => {
    expect(SHELL.centerSkirt[1]).toBeLessThan(1 - HALF);
    expect(SHELL.edgeFoot[1]).toBeLessThan(SHELL.centerSkirt[0]);
    expect(SHELL.cornerFoot[1]).toBeLessThan(SHELL.edgeFoot[0]);
  });

  it("엣지 블럭 다리는 가운데로 뻗고, 가장 안쪽 면이 맞춘 큐브 가운데에서 엣지 발 반지름에 놓인다", () => {
    const at = new THREE.Vector3(0, EDGE_AT, EDGE_AT);
    const region = (v: THREE.Vector3) =>
      Math.abs(v.x) < 0.6 && v.y > 1.3 && v.z > 1.3;
    expect(nearest(model.body, region, centerFor(at, Math.SQRT2))).toBeCloseTo(
      SHELL.edgeFoot[0],
      3,
    );
  });

  it("코너 블럭 다리는 가운데로 뻗고, 가장 안쪽 면이 맞춘 큐브 가운데에서 코너 발 반지름에 놓인다", () => {
    const at = new THREE.Vector3(CORNER_AT, CORNER_AT, CORNER_AT);
    const region = (v: THREE.Vector3) => v.x > 1.2 && v.y > 1.2 && v.z > 1.2;
    expect(
      nearest(model.body, region, centerFor(at, Math.sqrt(3))),
    ).toBeCloseTo(SHELL.cornerFoot[0], 3);
  });

  it("센터 블럭의 통은 가운데로 뻗어 나사 머리 바로 앞까지 온다", () => {
    const region = (v: THREE.Vector3) =>
      v.y > 1.6 && Math.abs(v.x) < 0.2 && Math.abs(v.z) < 0.2;
    // 위 센터 블럭(+y)에서 가장 아래 점(높이): 통 끝(맞춘 큐브 가운데에서 0.2). 축 아래 먼 점에서 재면 높이 차와 같다
    const far = 100;
    expect(
      nearest(model.body, region, new THREE.Vector3(0, -far, 0)) - far,
    ).toBeCloseTo(CENTER_AT - 0.8, 3);
  });
});
