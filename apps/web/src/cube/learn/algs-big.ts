// 4×4·5×5 축소법에서 쓰는 공식. 표기: Rw = 바깥 두 층, 2R = 바깥에서 둘째 층 하나만, Uw = 위 두 층.
import type { AlgCase } from "./types";

export const PARITY_4X4: AlgCase[] = [
  {
    id: "parity-4x4-oll",
    set: "parity-4x4",
    name: "OLL 패리티(엣지 하나 뒤집기)",
    algs: [
      "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'",
      "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2",
    ],
    note: "노란 십자를 만들 때 엣지 하나만 뒤집혀 있으면(3×3에서는 없는 모양) 그 엣지를 앞에 두고 해요. 대표 공식은 아래 두 층만 지키고, 둘째 공식은 그 엣지만 뒤집어요.",
  },
  {
    id: "parity-4x4-pll",
    set: "parity-4x4",
    name: "PLL 패리티(맞은편 엣지 맞바꾸기)",
    algs: ["2R2 U2 2R2 Uw2 2R2 Uw2 U2"],
    note: "위 층 자리를 맞출 때 엣지 둘만 바뀐 모양(3×3에서는 없는 모양)이면 바꿀 둘을 앞·뒤에 두고 해요.",
  },
];

export const EDGES_5X5: AlgCase[] = [
  {
    id: "edges-5x5-flip",
    set: "edges-5x5",
    name: "마지막 엣지 날개 뒤집기",
    algs: ["2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2"],
    note: "마지막 엣지의 가운데 엣지 블럭은 맞는데 양쪽 날개가 서로 바뀌어 있으면, 그 엣지를 위-앞에 두고 해요.",
  },
  {
    id: "edges-5x5-pair",
    set: "edges-5x5",
    name: "마지막 두 엣지 묶기",
    algs: ["Dw R U R' F R' F' R Dw'"],
    note: "묶이지 않은 엣지 둘을 앞-왼쪽·앞-오른쪽에 두고, Dw로 앞-왼쪽 아래 날개를 앞-오른쪽 아래로 데려와 엣지 뒤집기(R U R' F R' F' R)로 올린 뒤 되돌려요.",
  },
];
