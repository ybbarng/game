// 2×2 오르테가: ① 흰 면 하나(옆색은 안 봄) ② 윗면 노랑(OLL 7) ③ 위아래 층을 한꺼번에 자리 맞추기(PBL).
// 2×2에는 모서리와 가운데가 없어 꼭짓점만 본다. 공식은 3×3 표기 그대로 돌리면 된다.
import type { AlgCase } from "./types";

export const ORTEGA_OLL: AlgCase[] = [
  {
    id: "ortega-oll-sune",
    set: "ortega-oll",
    name: "수네",
    algs: ["R U R' U R U2 R'"],
    note: "노란 칸 하나가 위, 왼쪽 앞에",
  },
  {
    id: "ortega-oll-antisune",
    set: "ortega-oll",
    name: "안티수네",
    algs: ["R U2 R' U' R U' R'"],
    note: "노란 칸 하나가 위, 오른쪽 뒤에",
  },
  {
    id: "ortega-oll-h",
    set: "ortega-oll",
    name: "H(앞뒤 노랑)",
    algs: ["R2 U2 R U2 R2"],
    note: "노란 칸이 앞면에 둘, 뒷면에 둘",
  },
  {
    id: "ortega-oll-pi",
    set: "ortega-oll",
    name: "파이",
    algs: ["F R U R' U' R U R' U' F'"],
    note: "왼쪽 옆면에 노랑 둘, 오른쪽은 앞·뒤에 하나씩",
  },
  {
    id: "ortega-oll-u",
    set: "ortega-oll",
    name: "헤드라이트(U)",
    algs: ["F R U R' U' F'"],
    note: "윗면 노랑 둘이 오른쪽에, 왼쪽 옆면에 노랑 둘",
  },
  {
    id: "ortega-oll-t",
    set: "ortega-oll",
    name: "T",
    algs: ["R U R' U' R' F R F'"],
    note: "윗면 노랑 둘이 오른쪽에, 왼쪽은 앞·뒤를 봄",
  },
  {
    id: "ortega-oll-l",
    set: "ortega-oll",
    name: "나비넥타이(L)",
    algs: ["F R' F' R U R U' R'"],
    note: "윗면 노랑 둘이 대각선",
  },
];

/** PBL 묶음: 위층·아래층이 각각 맞음(solved) / 이웃 둘 바꿈(adjacent) / 대각 둘 바꿈(diagonal) */
export const ORTEGA_PBL: AlgCase[] = [
  {
    id: "ortega-pbl-adj-top",
    set: "ortega-pbl",
    name: "위만 이웃 바꾸기",
    group: "adjacent/solved",
    algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"],
    note: "3×3의 T퍼뮤와 같아요. 헤드라이트를 왼쪽에",
  },
  {
    id: "ortega-pbl-diag-top",
    set: "ortega-pbl",
    name: "위만 대각 바꾸기",
    group: "diagonal/solved",
    algs: ["F R U' R' U' R U R' F' R U R' U' R' F R F'"],
    note: "3×3의 Y퍼뮤와 같아요.",
  },
  {
    id: "ortega-pbl-adj-adj",
    set: "ortega-pbl",
    name: "위아래 모두 이웃 바꾸기",
    group: "adjacent/adjacent",
    algs: ["R2 U' B2 U2 R2 U' R2"],
    note: "두 층의 헤드라이트를 모두 앞에 둬요.",
  },
  {
    id: "ortega-pbl-diag-diag",
    set: "ortega-pbl",
    name: "위아래 모두 대각 바꾸기",
    group: "diagonal/diagonal",
    algs: ["R2 F2 R2"],
  },
  {
    id: "ortega-pbl-adj-diag",
    set: "ortega-pbl",
    name: "위 이웃·아래 대각",
    group: "adjacent/diagonal",
    algs: ["R U' R F2 R' U R'"],
    note: "위층 헤드라이트를 앞에. 아래만 바꿀 때는 큐브를 뒤집어(x2) 위 공식을 써요.",
  },
];
