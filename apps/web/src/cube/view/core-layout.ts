// 큐브의 기초 분해 모델(2×2·4×4·5×5)에서 떼어 놓은 조각의 자리. 3D 도형(core-model-sizes.ts)과 3D를 못 그릴 때의
// SVG(components/ExplodedCube.tsx)가 같은 값을 쓴다. three.js를 담지 않는다(SVG는 페이지 묶음에 실린다). docs/47 16-36.

export type V3 = readonly [number, number, number];
export type FaceAxis = "+x" | "+y" | "+z" | "-x" | "-y" | "-z";

export const MODEL_SIZES = [2, 3, 4, 5] as const;
export type ModelSize = (typeof MODEL_SIZES)[number];

export const AXIS_VEC: Record<FaceAxis, V3> = {
  "+x": [1, 0, 0],
  "-x": [-1, 0, 0],
  "+y": [0, 1, 0],
  "-y": [0, -1, 0],
  "+z": [0, 0, 1],
  "-z": [0, 0, -1],
};
export const FACE_AXES = Object.keys(AXIS_VEC) as FaceAxis[];

export const scale3 = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];

/** 떼어 놓은 조각: 맞춘 자리(몸통 가운데, 조각 한 칸 = 1, 큐브 가운데가 원점)와 떼어 놓는 거리, 바깥 면(스티커) */
export interface Placed {
  name: string;
  at: V3;
  offset: V3;
  faces: FaceAxis[];
}

/** 크기별 몸통이 보이는 조각(숨은 조각은 빠진다). 조각이 많을수록 사이를 넉넉히 */
export const LAYOUT: Record<2 | 4 | 5, Placed[]> = {
  2: [
    {
      name: "corner",
      at: [0.5, 0.5, 0.5],
      offset: [0.9, 0.9, 0.9],
      faces: ["+x", "+y", "+z"],
    },
  ],
  4: [
    {
      name: "center",
      at: [0.5, 1.5, 0.5],
      offset: [0, 0.75, 0],
      faces: ["+y"],
    },
    {
      name: "wing-right",
      at: [0.5, 1.5, 1.5],
      offset: [0.6, 0.85, 0.85],
      faces: ["+y", "+z"],
    },
    {
      name: "wing-left",
      at: [-0.5, 1.5, 1.5],
      offset: [-0.6, 0.85, 0.85],
      faces: ["+y", "+z"],
    },
    {
      name: "corner",
      at: [1.5, 1.5, 1.5],
      offset: [1.1, 1.1, 1.1],
      faces: ["+x", "+y", "+z"],
    },
  ],
  // 조각 사이를 조각 하나의 2/3쯤 띄운다(맞춘 자리 × 1.65)
  5: [
    ...FACE_AXES.map(
      (a): Placed => ({
        name: `fixed${a}`,
        at: scale3(AXIS_VEC[a], 2),
        offset: scale3(AXIS_VEC[a], 1.3),
        faces: [a],
      }),
    ),
    { name: "cross", at: [1, 2, 0], offset: [0.65, 1.3, 0], faces: ["+y"] },
    { name: "x", at: [1, 2, 1], offset: [0.65, 1.3, 0.65], faces: ["+y"] },
    {
      name: "mid-edge",
      at: [0, 2, 2],
      offset: [0, 1.3, 1.3],
      faces: ["+y", "+z"],
    },
    {
      name: "wing",
      at: [1, 2, 2],
      offset: [0.65, 1.3, 1.3],
      faces: ["+y", "+z"],
    },
    {
      name: "corner",
      at: [2, 2, 2],
      offset: [1.3, 1.3, 1.3],
      faces: ["+x", "+y", "+z"],
    },
  ],
};

/** 2×2 숨은 조각을 떼어 놓는 거리: 센터 블럭은 축을 따라, 엣지 블럭(위-앞)은 두 축으로 */
export const HIDDEN_222 = { center: 0.85, edge: 0.8 } as const;
/** 5×5 고정 센터 블럭을 떼어 놓는 거리(축 방향) */
export const FIXED_555 = 1.3;

export function placedOf(n: 2 | 4 | 5, name: string): Placed {
  const p = LAYOUT[n].find((x) => x.name === name);
  if (!p) throw new Error(`없는 조각: ${n} ${name}`);
  return p;
}
