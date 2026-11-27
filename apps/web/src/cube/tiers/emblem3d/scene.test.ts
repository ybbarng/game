// @vitest-environment jsdom
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildEmblemScene } from "./scene";

// jsdom에는 2D 그리기가 없다. 장면은 그리기 판이 없으면 그라데이션 그림을 비워 둔다(조각 수와 상관없음)
HTMLCanvasElement.prototype.getContext = () => null;

const meshes = (g: THREE.Object3D) =>
  g.children.filter((o) => (o as THREE.Mesh).isMesh) as THREE.Mesh[];

describe("엠블럼 장면의 큐브 조각 수(docs/52 5-26 메뉴 막대 아이콘)", () => {
  it("옵션을 주지 않으면 제품 그대로: 금속은 조각 27개와 틈을 메우는 속 하나, 보석은 조각 27개", () => {
    const gold = buildEmblemScene(THREE, "gold", {
      backdrop: false,
      pageColor: "#0b0d12",
    });
    expect(meshes(gold.core)).toHaveLength(28);
    const positions = meshes(gold.core)
      .slice(0, 27)
      .map((m) => m.position.toArray().join(","));
    expect(new Set(positions).size).toBe(27);
    const diamond = buildEmblemScene(THREE, "diamond", {
      backdrop: false,
      pageColor: "#0b0d12",
    });
    expect(meshes(diamond.core)).toHaveLength(27);
    gold.dispose();
    diamond.dispose();
  });

  it("cubeCells 1이면 3×3 큐브 바깥 크기의 한 덩이 하나만 둔다(방향은 같은 등각)", () => {
    for (const tier of ["gold", "diamond"] as const) {
      const base = buildEmblemScene(THREE, tier, {
        backdrop: false,
        pageColor: "#0b0d12",
      });
      const one = buildEmblemScene(THREE, tier, {
        backdrop: false,
        pageColor: "#0b0d12",
        cubeCells: 1,
      });
      const [block] = meshes(one.core);
      expect(meshes(one.core)).toHaveLength(1);
      if (!block) throw new Error("한 덩이가 없다");
      expect(block.position.toArray()).toEqual([0, 0, 0]);
      expect(one.core.rotation.toArray()).toEqual(base.core.rotation.toArray());
      // 한 덩이 한 변 = 조각 27개를 모은 3×3 큐브 바깥 한 변
      const edge = (g: THREE.Object3D) =>
        new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).x;
      const whole = new THREE.Group();
      for (const m of meshes(base.core).slice(0, 27)) whole.add(m.clone());
      const lone = new THREE.Group().add(block.clone());
      expect(edge(lone)).toBeCloseTo(edge(whole), 2);
      base.dispose();
      one.dispose();
    }
  });
});
