// 4×4·5×5 축소법에서 쓰는 공식. 표기: Rw = 바깥 두 층, 2R = 바깥에서 둘째 층 하나만, Uw = 위 두 층.
import type { AlgCase } from "./types";

export const PARITY_4X4: AlgCase[] = [
  {
    id: "parity-4x4-oll",
    set: "parity-4x4",
    name: "OLL 패리티(모서리 하나 뒤집기)",
    algs: [
      "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'",
      "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2",
    ],
    note: "노란 십자를 만들 때 모서리 하나만 뒤집혀 있으면(3×3에서는 없는 모양) 그 모서리를 앞에 두고 한다. 대표 공식은 아래 두 층만 지키고, 둘째 공식은 그 모서리만 뒤집는다.",
  },
  {
    id: "parity-4x4-pll",
    set: "parity-4x4",
    name: "PLL 패리티(맞은편 모서리 맞바꾸기)",
    algs: ["2R2 U2 2R2 Uw2 2R2 Uw2 U2"],
    note: "윗층 자리를 맞출 때 모서리 둘만 바뀐 모양(3×3에서는 없는 모양)이면 바꿀 둘을 앞·뒤에 두고 한다.",
  },
];

export const EDGES_5X5: AlgCase[] = [
  {
    id: "edges-5x5-flip",
    set: "edges-5x5",
    name: "마지막 모서리 날개 뒤집기",
    algs: ["2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2"],
    note: "마지막 모서리의 가운데 조각은 맞는데 양쪽 날개가 서로 바뀌어 있으면, 그 모서리를 위-앞에 두고 한다.",
  },
  {
    id: "edges-5x5-pair",
    set: "edges-5x5",
    name: "마지막 두 모서리 묶기",
    algs: ["Dw R U R' F R' F' R Dw'"],
    note: "묶이지 않은 모서리 둘을 앞-왼쪽·앞-오른쪽에 두고, 맞출 날개끼리 한 줄이 되게 Dw로 맞춘 뒤 다른 모서리를 바꿔 넣고 되돌린다.",
  },
];
