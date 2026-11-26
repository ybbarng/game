// 해법 지도(3×3, 시안 2026-11-25): 큐브를 맞추는 여러 길을 한 그래프로. 맨 위는 다 섞인 상태, 맨 아래는 다 맞은 상태.
// - 지점: 맞은 조각이 무엇인지로 정한 상태. 여러 해법이 같은 상태를 지나면 지점 하나로 합친다
//   (초보자·2단계·CFOP는 「아래 두 층」에서, ZZ·페트루스는 「노란 십자」에서 만난다).
// - 길: 지점과 지점 사이의 걸음. 이름, 가르치는 단원 id(없으면 빈 목록), 배우는 공식(공식 모음 상황 id 또는 단원 공식 그대로).
// - 해법: 지나는 길의 차례.
// 공식 수는 자료에서 센다(공식 모음 algs-*.ts·공식 연습 단계 practice/*의 상황 수, 초보자는 단원 공식 상수). 직관으로 하는
// 걸음(십자·블록 등)은 공식 없음(빈 목록). 평균 수는 단원 규칙이나 컴퓨터 해법으로 잰 값만 둔다(solve-map.test.ts가 다시 잰다).
import {
  applyMove,
  B,
  cubeGroups,
  cubeTopology,
  D,
  F,
  L,
  parseMoves,
  pieceFaces,
  R,
  type StickerVisibility,
  solvedCube,
  stickerFace,
  U,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { EDGES_5X5, PARITY_4X4 } from "./algs-big";
import { F2L_CASES } from "./algs-f2l";
import { OLL_CASES } from "./algs-oll";
import { ORTEGA_OLL, ORTEGA_PBL } from "./algs-ortega";
import { PLL_CASES } from "./algs-pll";
import {
  CORNER_CYCLE,
  EDGE_SWAP,
  FROM_RIGHT,
  RIGHT,
  TWIST,
  YELLOW_CROSS,
} from "./beginner-path";
import { TOP_FACE, TOP_SWAP } from "./beginner-path-222";
import { ZZ_PAIR_CASES } from "./zz-path";

export type MapNodeId =
  | "scrambled"
  | "cross"
  | "first-layer"
  | "pair-1"
  | "pair-2"
  | "pair-3"
  | "f2l"
  | "yellow-cross"
  | "yellow-edges"
  | "ll-corners-placed"
  | "ll-corners-oriented"
  | "oll"
  | "pll-corners"
  | "solved"
  | "eoline"
  | "zz-left"
  | "roux-fb"
  | "roux-sb"
  | "roux-co"
  | "cmll"
  | "lse-eo"
  | "lse-ulur"
  | "petrus-222"
  | "petrus-223"
  | "corners-first"
  // 2×2
  | "2-scrambled"
  | "2-first-layer"
  | "2-top-face"
  | "2-corners-placed"
  | "2-first-face"
  | "2-both-faces"
  | "2-solved"
  // 4×4(끝은 「3×3처럼」: 누르면 3×3 지도로)
  | "4-scrambled"
  | "4-centers"
  | "4-paired"
  | "4-ud-centers"
  | "4-cross3"
  | "4-yau-centers"
  | "4-yau-cross"
  | "4-yau-paired"
  // 4×4 뒤(3×3 맞추기 → 다 맞음, bigTail이 만든다)
  | "4-solved"
  // 5×5
  | "5-scrambled"
  | "5-centers"
  | "5-paired"
  | "5-solved";

export type CubeSize = 2 | 3 | 4 | 5;
/** 지도 크기 탭 차례 */
export const MAP_SIZES: readonly CubeSize[] = [2, 3, 4, 5];

export interface MapNode {
  id: MapNodeId;
  title: string;
  /** 그림 칸 자리(줄은 위에서 아래, 칸은 왼쪽에서 오른쪽. 반 칸도 된다). 크기마다 따로 0부터 */
  row: number;
  col: number;
  /** 그림에서 큐브를 쥐는 돌리기(맞은 조각이 잘 보이게) */
  view: string;
  /** 큐브 크기(없으면 3). 지도는 크기마다 따로다(2026-11-25 사용자 「크기가 다르면 섞일 수가 있나?」) */
  size?: CubeSize;
  /** 「3×3처럼」: 누르면 3×3 지도로(이 크기에서 왔다는 표시와 함께) */
  jump?: { n: 3; from: 4 | 5 };
  /** 그림은 이 3×3 지점과 같은 조각을 그 크기 큐브에서 맞춘 모습 */
  as333?: MapNodeId;
  /**
   * 엣지 짝 지점: 쥐기 전에 맞춘 큐브에 한 바깥 층 돌리기(센터는 그대로, 엣지는 짝인 채 자리만 옮겨진다)와
   * 그 뒤 두 날개 모두 제 색으로 보일 엣지 자리 둘(면 둘씩, 그림에서 보이는 위·앞·오른쪽 면에 걸친 자리).
   * 나머지 엣지는 회색이라 「짝은 맞았지만 제자리는 아님」이 보인다(2026-11-26 사용자)
   */
  paired?: { turns: string; show: readonly (readonly [number, number])[] };
}

/**
 * 큰 큐브 엣지 짝 그림: 바깥 층만 돌려 UR·UF 자리에 다른 엣지가 오게 한다. 두 엣지의 칸이 모두 옆 센터와 다른
 * 색이라(같은 색이면 센터 줄처럼 보인다) 짝으로 또렷하다
 */
const PAIRED_BIG = {
  turns: "F R F'",
  show: [
    [U, R],
    [U, F],
  ],
} as const;
/** 야우 엣지 짝 그림: 흰 십자(위 엣지)는 그대로 두고 FR·FL 자리에 아래 층 엣지가 오게 한다 */
const PAIRED_YAU = {
  turns: "R' D R F' D' F",
  show: [
    [F, R],
    [F, L],
  ],
} as const;

/**
 * 해법마다 가로 칸(왼쪽 초보자 → 오른쪽 고급, 2026-11-25 사용자 「왼쪽이 초보자용, 오른쪽이 고급」). 크기마다 따로다.
 * 3×3 차례는 사이트 과정의 선행 차례(courses.ts REQUIRES: 초보자 → 2단계 → CFOP → 루·ZZ → 페트루스)를 따르고, 같은
 * 줄기의 갈래(코너 방향 먼저)는 바로 옆에, 사이트에 단원이 없는 갈래·코너 먼저는 그 뒤에 둔다. 2×2는 처음 맞추기 →
 * 3×3을 아는 사람의 2×2 → 오르테가, 4×4는 축소법 → 야우(REQUIRES 차례).
 * 지점은 그 지점을 지나는 해법 가운데 가장 왼쪽 칸에 둔다(초보자 길이 왼쪽에 곧게 내려온다). solve-map.test.ts가 본다
 */
export const MAP_LANES: Readonly<Record<string, number>> = {
  beginner: 0,
  "beginner-twist-first": 1,
  "two-look": 2,
  cfop: 3,
  roux: 4,
  zz: 5,
  petrus: 6,
  "zz-coll": 7,
  "zz-zbll": 7,
  "cfop-1lll": 7,
  "corners-first": 7,
  "222-beginner": 0,
  "222-from333": 1,
  ortega: 2,
  "444-reduction": 0,
  "444-yau": 1,
  "555-reduction": 0,
};

const BASE_NODES: readonly MapNode[] = [
  // 2×2
  { id: "2-scrambled", title: "다 섞임", row: 0, col: 0, view: "", size: 2 },
  { id: "2-first-layer", title: "첫 층", row: 1, col: 0, view: "", size: 2 },
  { id: "2-top-face", title: "윗면", row: 2, col: 0, view: "z2", size: 2 },
  {
    id: "2-corners-placed",
    title: "코너 자리",
    row: 2,
    col: 1,
    view: "z2",
    size: 2,
  },
  { id: "2-solved", title: "다 맞음", row: 3, col: 0, view: "", size: 2 },
  { id: "2-first-face", title: "흰 면", row: 1, col: 2, view: "", size: 2 },
  {
    id: "2-both-faces",
    title: "흰·노란 면",
    row: 2,
    col: 2,
    view: "",
    size: 2,
  },
  // 4×4: 센터·엣지를 묶으면 3×3처럼(누르면 3×3 지도로)
  { id: "4-scrambled", title: "다 섞임", row: 0, col: 0, view: "", size: 4 },
  { id: "4-centers", title: "센터", row: 1, col: 0, view: "", size: 4 },
  {
    id: "4-paired",
    title: "3×3처럼",
    row: 2,
    col: 0,
    view: "",
    size: 4,
    jump: { n: 3, from: 4 },
    paired: PAIRED_BIG,
  },
  {
    id: "4-ud-centers",
    title: "흰·노랑 센터",
    row: 1,
    col: 1,
    view: "",
    size: 4,
  },
  { id: "4-cross3", title: "흰 십자 셋", row: 2, col: 1, view: "", size: 4 },
  { id: "4-yau-centers", title: "옆 센터", row: 3, col: 1, view: "", size: 4 },
  { id: "4-yau-cross", title: "흰 십자", row: 4, col: 1, view: "", size: 4 },
  {
    id: "4-yau-paired",
    title: "3×3처럼",
    row: 5,
    col: 1,
    view: "",
    size: 4,
    jump: { n: 3, from: 4 },
    paired: PAIRED_YAU,
  },
  // 5×5
  { id: "5-scrambled", title: "다 섞임", row: 0, col: 0, view: "", size: 5 },
  { id: "5-centers", title: "센터", row: 1, col: 0, view: "", size: 5 },
  {
    id: "5-paired",
    title: "3×3처럼",
    row: 2,
    col: 0,
    view: "",
    size: 5,
    jump: { n: 3, from: 5 },
    paired: PAIRED_BIG,
  },
  // 초보자 줄기(왼쪽 끝)
  { id: "scrambled", title: "다 섞임", row: 0, col: 0, view: "" },
  { id: "cross", title: "흰 십자", row: 1, col: 0, view: "" },
  { id: "first-layer", title: "첫 층", row: 2, col: 0, view: "" },
  { id: "f2l", title: "아래 두 층", row: 5, col: 0, view: "z2" },
  { id: "yellow-cross", title: "노란 십자", row: 6, col: 0, view: "z2" },
  { id: "yellow-edges", title: "위 엣지", row: 7, col: 0, view: "z2" },
  { id: "ll-corners-placed", title: "코너 자리", row: 8, col: 0, view: "z2" },
  { id: "solved", title: "다 맞음", row: 9.5, col: 0, view: "" },
  // 초보자(코너 방향 먼저)
  {
    id: "ll-corners-oriented",
    title: "코너 방향",
    row: 8,
    col: 1,
    view: "z2",
  },
  // 2단계 OLL·PLL
  { id: "oll", title: "노란 면", row: 7, col: 2, view: "z2" },
  { id: "pll-corners", title: "위 코너", row: 8, col: 2, view: "z2" },
  // CFOP
  { id: "pair-1", title: "짝 하나", row: 2, col: 3, view: "z2" },
  { id: "pair-2", title: "짝 둘", row: 3, col: 3, view: "z2" },
  { id: "pair-3", title: "짝 셋", row: 4, col: 3, view: "z2" },
  // 루
  { id: "roux-fb", title: "첫 블록", row: 1, col: 4, view: "z2 y2" },
  { id: "roux-sb", title: "두 블록", row: 2, col: 4, view: "z2 y2" },
  { id: "roux-co", title: "위 코너 방향", row: 3, col: 4, view: "z2 y2" },
  { id: "cmll", title: "위 코너", row: 4, col: 4, view: "z2 y2" },
  { id: "lse-eo", title: "엣지 방향", row: 5, col: 4, view: "z2 y2" },
  { id: "lse-ulur", title: "왼쪽·오른쪽 엣지", row: 6, col: 4, view: "z2 y2" },
  // ZZ
  { id: "eoline", title: "EO라인", row: 1, col: 5, view: "z2 y2" },
  { id: "zz-left", title: "왼쪽 블록", row: 3, col: 5, view: "z2 y2" },
  // 페트루스
  { id: "petrus-222", title: "2×2×2", row: 1, col: 6, view: "z2 y2" },
  { id: "petrus-223", title: "2×2×3", row: 2, col: 6, view: "z2 y2" },
  // 페트루스 엣지 방향은 ZZ 「왼쪽 블록」과 같은 상태(아래 왼쪽 2×2×3 + 엣지 방향)라 그 지점으로 합친다
  // 코너 먼저
  { id: "corners-first", title: "코너 여덟", row: 4, col: 7, view: "" },
];

export interface MapEdge {
  id: string;
  from: MapNodeId;
  to: MapNodeId;
  title: string;
  /** 이 걸음을 가르치는 단원 id(여럿이면 해법마다 다른 과정에 있다). 없으면 빈 목록 */
  lessons: readonly string[];
  /**
   * 이 걸음에 쓰는 공식(공식 모음 상황 id, 초보자는 단원 공식 그대로). 빈 목록은 공식 없음(직관),
   * null은 저장소에 셀 자료가 없음(COLL·ZBLL처럼 사이트에 없는 공식 모음, 4×4 센터·엣지)
   */
  formulas: readonly string[] | null;
  /** 큰 큐브의 「3×3처럼」 묶음 칸: 누르면 단원 대신 3×3 지도로(이 크기에서 왔다는 표시와 함께) */
  jump?: { n: 3; from: 4 | 5 };
}

const ids = (xs: readonly { id: string }[]) => xs.map((c) => c.id);
/** 지점·길 표를 다 만들기 전에 길을 찾는다(큰 큐브 뒤 묶음을 만들 때) */
const edgeOf = (id: string) => BASE_EDGES.find((e) => e.id === id);
const group = (xs: readonly { id: string; group?: string }[], g: string) =>
  ids(xs.filter((c) => c.group === g));

/** 2단계 OLL·PLL 네 걸음의 공식(algs-2look.ts 묶음) */
const TWO_LOOK = {
  ollEdges: group(TWO_LOOK_OLL, "edges"),
  ollCorners: group(TWO_LOOK_OLL, "corners"),
  pllCorners: group(TWO_LOOK_PLL, "corners"),
  pllEdges: group(TWO_LOOK_PLL, "edges"),
};
const F2L_ALL = ids(F2L_CASES);
const ZZ_PAIR = ZZ_PAIR_CASES.map((c) => `zz-pair-${c.white}-${c.edge}`);
/** 코너 셋 돌리기(Aa퍼뮤)와 대각 바꾸기(Y퍼뮤): 루 CMLL 둘째 걸음(lessons-roux.ts), 코너 방향 먼저 하는 초보자 */
const A_PERM = "pll-aa";
const Y_PERM = "pll-y";

const LOWER_BEGINNER = ["333-white-cross", "333-first-corners-up"];

const BASE_EDGES: readonly MapEdge[] = [
  // 초보자 아래 두 층·CFOP 십자
  {
    id: "cross",
    from: "scrambled",
    to: "cross",
    title: "십자",
    lessons: ["333-safe-turns", "333-white-cross", "cfop-cross"],
    formulas: [],
  },
  {
    id: "first-corners",
    from: "cross",
    to: "first-layer",
    title: "첫 층 코너",
    lessons: [LOWER_BEGINNER[1] as string],
    formulas: [TWIST],
  },
  {
    id: "second-layer",
    from: "first-layer",
    to: "f2l",
    title: "둘째 층 엣지",
    lessons: ["333-second-layer"],
    formulas: [RIGHT, FROM_RIGHT],
  },
  // CFOP F2L 짝 넷
  ...(["pair-1", "pair-2", "pair-3", "f2l"] as const).map((to, i) => ({
    id: `f2l-pair-${i + 1}`,
    from: (i === 0 ? "cross" : `pair-${i}`) as MapNodeId,
    to,
    title: `F2L 짝 ${i + 1}`,
    lessons: ["cfop-f2l-pair"],
    formulas: F2L_ALL,
  })),
  // 초보자 마지막 층
  {
    id: "beginner-yellow-cross",
    from: "f2l",
    to: "yellow-cross",
    title: "노란 십자",
    lessons: ["333-ll-cross"],
    formulas: [YELLOW_CROSS],
  },
  {
    id: "beginner-edges",
    from: "yellow-cross",
    to: "yellow-edges",
    title: "옆면 맞추기",
    lessons: ["333-ll-edges"],
    formulas: [EDGE_SWAP],
  },
  {
    id: "beginner-corner-place",
    from: "yellow-edges",
    to: "ll-corners-placed",
    title: "코너 자리",
    lessons: ["333-ll-corner-place"],
    formulas: [CORNER_CYCLE],
  },
  {
    id: "beginner-corner-twist",
    from: "ll-corners-placed",
    to: "solved",
    title: "코너 방향",
    lessons: ["333-ll-corner-twist"],
    formulas: [TWIST],
  },
  // 초보자, 코너 방향 먼저(docs/47 0절 2026-11-04, 8-2 「다른 방식」): 단원 없음
  {
    id: "twist-first",
    from: "yellow-edges",
    to: "ll-corners-oriented",
    title: "코너 방향",
    lessons: [],
    formulas: [TWIST],
  },
  {
    id: "twist-first-place",
    from: "ll-corners-oriented",
    to: "solved",
    title: "코너 자리(A퍼뮤)",
    lessons: [],
    formulas: [A_PERM],
  },
  // 2단계 OLL·PLL(ZZ·페트루스 마지막 층도 같은 공식, zz-path.ts runZzLl)
  {
    id: "two-look-cross",
    from: "f2l",
    to: "yellow-cross",
    title: "노란 십자",
    lessons: ["cfop-2look-oll"],
    formulas: TWO_LOOK.ollEdges,
  },
  {
    id: "two-look-face",
    from: "yellow-cross",
    to: "oll",
    title: "노란 면",
    lessons: ["cfop-2look-oll", "zz-ll"],
    formulas: TWO_LOOK.ollCorners,
  },
  {
    id: "two-look-corners",
    from: "oll",
    to: "pll-corners",
    title: "코너 자리",
    lessons: ["cfop-2look-pll", "zz-ll"],
    formulas: TWO_LOOK.pllCorners,
  },
  {
    id: "two-look-edges",
    from: "pll-corners",
    to: "solved",
    title: "엣지 자리",
    lessons: ["cfop-2look-pll", "zz-ll"],
    formulas: TWO_LOOK.pllEdges,
  },
  // CFOP 전체 공식
  {
    id: "oll",
    from: "f2l",
    to: "oll",
    title: "OLL",
    lessons: ["cfop-full"],
    formulas: ids(OLL_CASES),
  },
  {
    id: "pll",
    from: "oll",
    to: "solved",
    title: "PLL",
    lessons: ["cfop-full"],
    formulas: ids(PLL_CASES),
  },
  // 루
  {
    id: "roux-fb",
    from: "scrambled",
    to: "roux-fb",
    title: "첫 블록",
    lessons: ["roux-fb"],
    formulas: [],
  },
  {
    id: "roux-sb",
    from: "roux-fb",
    to: "roux-sb",
    title: "둘째 블록",
    lessons: ["roux-sb"],
    formulas: [],
  },
  {
    id: "roux-co",
    from: "roux-sb",
    to: "roux-co",
    title: "CMLL 방향",
    lessons: ["roux-cmll"],
    formulas: TWO_LOOK.ollCorners,
  },
  {
    id: "roux-cp",
    from: "roux-co",
    to: "cmll",
    title: "CMLL 자리",
    lessons: ["roux-cmll"],
    formulas: [A_PERM, Y_PERM],
  },
  {
    id: "lse-eo",
    from: "cmll",
    to: "lse-eo",
    title: "LSE 엣지 방향",
    lessons: ["roux-lse"],
    formulas: [],
  },
  {
    id: "lse-ulur",
    from: "lse-eo",
    to: "lse-ulur",
    title: "LSE 왼쪽·오른쪽",
    lessons: ["roux-lse"],
    formulas: [],
  },
  {
    id: "lse-ep",
    from: "lse-ulur",
    to: "solved",
    title: "LSE 가운데 줄",
    lessons: ["roux-lse"],
    formulas: [],
  },
  // ZZ
  {
    id: "eoline",
    from: "scrambled",
    to: "eoline",
    title: "EO라인",
    lessons: ["zz-eo", "zz-eoline"],
    formulas: [],
  },
  {
    id: "zz-left",
    from: "eoline",
    to: "zz-left",
    title: "왼쪽 블록",
    lessons: ["zz-f2l"],
    formulas: ZZ_PAIR,
  },
  {
    id: "zz-right",
    from: "zz-left",
    to: "yellow-cross",
    title: "오른쪽 블록",
    lessons: ["zz-f2l"],
    formulas: ZZ_PAIR,
  },
  // 페트루스(소개 단원 하나. F2L 마무리는 단원 없음)
  {
    id: "petrus-222",
    from: "scrambled",
    to: "petrus-222",
    title: "2×2×2",
    lessons: ["petrus-intro"],
    formulas: [],
  },
  {
    id: "petrus-223",
    from: "petrus-222",
    to: "petrus-223",
    title: "2×2×3",
    lessons: ["petrus-intro"],
    formulas: [],
  },
  {
    id: "petrus-eo",
    from: "petrus-223",
    to: "zz-left",
    title: "엣지 방향",
    lessons: ["petrus-intro"],
    formulas: [],
  },
  {
    id: "petrus-f2l",
    from: "zz-left",
    to: "yellow-cross",
    title: "F2L 마무리",
    lessons: [],
    formulas: [],
  },
  // 사이트에 단원이 없는 마지막 층 갈래와 코너 먼저 해법(공식 모음 자료가 없어 공식 수는 비운다)
  {
    id: "coll",
    from: "yellow-cross",
    to: "pll-corners",
    title: "COLL",
    lessons: [],
    formulas: null,
  },
  {
    id: "zbll",
    from: "yellow-cross",
    to: "solved",
    title: "ZBLL",
    lessons: [],
    formulas: null,
  },
  {
    id: "1lll",
    from: "f2l",
    to: "solved",
    title: "1LLL",
    lessons: [],
    formulas: null,
  },
  {
    id: "cf-corners",
    from: "scrambled",
    to: "corners-first",
    title: "코너 여덟",
    lessons: [],
    formulas: null,
  },
  {
    id: "cf-edges",
    from: "corners-first",
    to: "solved",
    title: "엣지 열둘",
    lessons: [],
    formulas: null,
  },
  // 2×2(2×2 처음 맞추기·3×3을 아는 사람의 2×2·오르테가)
  {
    id: "222-first-layer",
    from: "2-scrambled",
    to: "2-first-layer",
    title: "첫 층",
    lessons: ["222-first-layer-up", "222-from333-first-layer-up"],
    formulas: [TWIST],
  },
  {
    id: "222-top-face",
    from: "2-first-layer",
    to: "2-top-face",
    title: "윗면",
    lessons: ["222-top-face"],
    formulas: [TOP_FACE],
  },
  {
    id: "222-top-layer",
    from: "2-top-face",
    to: "2-solved",
    title: "위 층 자리",
    lessons: ["222-top-layer"],
    formulas: [TOP_SWAP],
  },
  {
    id: "222-corner-place",
    from: "2-first-layer",
    to: "2-corners-placed",
    title: "코너 자리",
    lessons: ["222-from333-corner-place"],
    formulas: [CORNER_CYCLE],
  },
  {
    id: "222-corner-twist",
    from: "2-corners-placed",
    to: "2-solved",
    title: "코너 방향",
    lessons: ["222-from333-corner-twist"],
    formulas: [TWIST],
  },
  {
    id: "ortega-face",
    from: "2-scrambled",
    to: "2-first-face",
    title: "첫 면",
    lessons: ["222-ortega"],
    formulas: [],
  },
  {
    id: "ortega-oll",
    from: "2-first-face",
    to: "2-both-faces",
    title: "반대 면(OLL)",
    lessons: ["222-ortega"],
    formulas: ids(ORTEGA_OLL),
  },
  {
    id: "ortega-pbl",
    from: "2-both-faces",
    to: "2-solved",
    title: "두 층 자리(PBL)",
    lessons: ["222-ortega"],
    formulas: ids(ORTEGA_PBL),
  },
  // 4×4·5×5 앞부분(센터·엣지. 공식 수는 단원 공식을 셀 기준이 아직 없어 비운다)
  {
    id: "444-centers",
    from: "4-scrambled",
    to: "4-centers",
    title: "센터",
    lessons: ["444-centers"],
    formulas: null,
  },
  {
    id: "444-edges",
    from: "4-centers",
    to: "4-paired",
    title: "엣지 짝",
    lessons: ["444-edges"],
    formulas: null,
  },
  {
    id: "yau-ud-centers",
    from: "4-scrambled",
    to: "4-ud-centers",
    title: "흰·노랑 센터",
    lessons: ["yau-ud-centers"],
    formulas: null,
  },
  {
    id: "yau-cross3",
    from: "4-ud-centers",
    to: "4-cross3",
    title: "흰 십자 셋",
    lessons: ["yau-cross3"],
    formulas: null,
  },
  {
    id: "yau-side-centers",
    from: "4-cross3",
    to: "4-yau-centers",
    title: "옆 센터",
    lessons: ["yau-side-centers"],
    formulas: null,
  },
  {
    id: "yau-last-cross",
    from: "4-yau-centers",
    to: "4-yau-cross",
    title: "마지막 십자 엣지",
    lessons: ["yau-edges"],
    formulas: null,
  },
  {
    id: "yau-edges",
    from: "4-yau-cross",
    to: "4-yau-paired",
    title: "엣지 여덟",
    lessons: ["yau-edges"],
    formulas: null,
  },
  {
    id: "555-centers",
    from: "5-scrambled",
    to: "5-centers",
    title: "센터",
    lessons: ["555-centers"],
    formulas: null,
  },
  {
    id: "555-edges",
    from: "5-centers",
    to: "5-paired",
    title: "엣지 셋 묶기",
    lessons: ["555-edges", "555-last-two-edges"],
    formulas: ids(EDGES_5X5),
  },
];

export type MapMethodId =
  | "beginner"
  | "beginner-twist-first"
  | "two-look"
  | "cfop"
  | "roux"
  | "zz"
  | "petrus"
  | "zz-coll"
  | "zz-zbll"
  | "cfop-1lll"
  | "corners-first"
  | "222-beginner"
  | "222-from333"
  | "ortega"
  | "444-reduction"
  | "444-yau"
  | "555-reduction";

export interface MapMethod {
  id: MapMethodId;
  title: string;
  /** 기본으로 접어 두는 해법(사이트에 단원이 없거나 다른 크기). 켜고 끌 수 있다 */
  extra?: boolean;
  /** 길을 누르면 이 과정의 단원을 먼저 연다(길에 단원이 여럿일 때) */
  course?: string;
  /** 지나는 길(다 섞임 → 다 맞음 차례) */
  edges: readonly string[];
  /** 큐브 크기(없으면 3) */
  size?: CubeSize;
}

const BEGINNER_LOWER = ["cross", "first-corners", "second-layer"];
const TWO_LOOK_LL = [
  "two-look-face",
  "two-look-corners",
  "two-look-edges",
] as const;

/** 3×3 해법 */
const MAP_METHODS_3: readonly MapMethod[] = [
  {
    id: "beginner",
    title: "초보자",
    course: "333-beginner",
    edges: [
      ...BEGINNER_LOWER,
      "beginner-yellow-cross",
      "beginner-edges",
      "beginner-corner-place",
      "beginner-corner-twist",
    ],
  },
  {
    id: "beginner-twist-first",
    title: "초보자(코너 방향 먼저)",
    course: "333-beginner",
    edges: [
      ...BEGINNER_LOWER,
      "beginner-yellow-cross",
      "beginner-edges",
      "twist-first",
      "twist-first-place",
    ],
  },
  {
    id: "two-look",
    title: "2단계 OLL·PLL",
    course: "333-2look",
    edges: [...BEGINNER_LOWER, "two-look-cross", ...TWO_LOOK_LL],
  },
  {
    id: "cfop",
    title: "CFOP",
    course: "cfop",
    edges: [
      "cross",
      "f2l-pair-1",
      "f2l-pair-2",
      "f2l-pair-3",
      "f2l-pair-4",
      "oll",
      "pll",
    ],
  },
  {
    id: "roux",
    title: "루",
    course: "roux",
    edges: [
      "roux-fb",
      "roux-sb",
      "roux-co",
      "roux-cp",
      "lse-eo",
      "lse-ulur",
      "lse-ep",
    ],
  },
  {
    id: "zz",
    title: "ZZ",
    course: "zz",
    edges: ["eoline", "zz-left", "zz-right", ...TWO_LOOK_LL],
  },
  {
    id: "petrus",
    title: "페트루스",
    course: "petrus",
    edges: [
      "petrus-222",
      "petrus-223",
      "petrus-eo",
      "petrus-f2l",
      ...TWO_LOOK_LL,
    ],
  },
  {
    id: "zz-coll",
    title: "ZZ(COLL·EPLL)",
    extra: true,
    course: "zz",
    edges: ["eoline", "zz-left", "zz-right", "coll", "two-look-edges"],
  },
  {
    id: "zz-zbll",
    title: "ZZ(ZBLL)",
    extra: true,
    course: "zz",
    edges: ["eoline", "zz-left", "zz-right", "zbll"],
  },
  {
    id: "cfop-1lll",
    title: "CFOP(1LLL)",
    extra: true,
    course: "cfop",
    edges: [
      "cross",
      "f2l-pair-1",
      "f2l-pair-2",
      "f2l-pair-3",
      "f2l-pair-4",
      "1lll",
    ],
  },
  {
    id: "corners-first",
    title: "코너 먼저",
    extra: true,
    edges: ["cf-corners", "cf-edges"],
  },
];

// ── 2×2 ─────────────────────────────────────────────

const SMALL_METHODS: MapMethod[] = [
  {
    id: "222-beginner",
    title: "처음 맞추기",
    size: 2,
    course: "222-beginner",
    edges: ["222-first-layer", "222-top-face", "222-top-layer"],
  },
  {
    id: "222-from333",
    title: "3×3을 아는 사람",
    size: 2,
    course: "222-from333",
    edges: ["222-first-layer", "222-corner-place", "222-corner-twist"],
  },
  {
    id: "ortega",
    title: "오르테가",
    size: 2,
    course: "222-beginner",
    edges: ["ortega-face", "ortega-oll", "ortega-pbl"],
  },
];

// ── 4×4·5×5: 앞부분 → 「3×3처럼」 → 「3×3 맞추기」 한 칸(패리티 고리 둘) → 다 맞음 ─────────

/**
 * 3×3 지도 「4×4에서 옴」에서 패리티가 눈에 띄는 자리(우회 역을 붙일 3×3 지점). OLL 패리티는 마지막 층 방향 걸음
 * 앞, PLL 패리티는 마지막 층 자리 걸음 앞에서 보인다. 초보자는 축소법 풀이(big-solve.ts solveReduced)·단원
 * (lessons-big.ts 「3×3처럼 풀기와 패리티」)대로 노란 십자 앞(아래 두 층)과 옆면 맞추기 뒤 코너 자리 앞(위 엣지),
 * 2단계·CFOP는 OLL 앞과 PLL 앞이다. 고리 이름·공식은 PARITY_LOOPS 하나에서 온다
 */
export const PARITY_AT: Readonly<
  Partial<Record<MapMethodId, { oll: MapNodeId; pll: MapNodeId }>>
> = {
  beginner: { oll: "f2l", pll: "yellow-edges" },
  "beginner-twist-first": { oll: "f2l", pll: "yellow-edges" },
  "two-look": { oll: "f2l", pll: "oll" },
  cfop: { oll: "f2l", pll: "oll" },
};

/**
 * 큰 큐브 「3×3 맞추기」를 펼쳤을 때 고를 수 있는 3×3 해법(패리티 자리가 정해진 것, 첫째가 기본). 루·ZZ·페트루스는
 * 패리티가 보이는 자리를 아직 정하지 않았다
 */
export const FINISH_METHODS = Object.keys(PARITY_AT) as MapMethodId[];

/** 패리티 공식(공식 모음 algs-big.ts PARITY_4X4) */
export const PARITY_FORMULAS = {
  oll: PARITY_4X4.filter((c) => c.id === "parity-4x4-oll").map((c) => c.id),
  pll: PARITY_4X4.filter((c) => c.id === "parity-4x4-pll").map((c) => c.id),
} as const;

interface BigHead {
  id: MapMethodId;
  title: string;
  size: 4 | 5;
  course: string;
  /** 앞부분 길(다 섞임 → 3×3처럼) */
  head: string[];
  /** 「3×3 맞추기」 칸이 가르치는 단원(진행 기록으로 끝냄을 본다) */
  tailLessons: string[];
}

const BIG_HEADS: BigHead[] = [
  {
    id: "444-reduction",
    title: "축소법",
    size: 4,
    course: "444-reduction",
    head: ["444-centers", "444-edges"],
    tailLessons: ["444-as-333"],
  },
  {
    id: "444-yau",
    title: "야우",
    size: 4,
    course: "444-yau",
    head: [
      "yau-ud-centers",
      "yau-cross3",
      "yau-side-centers",
      "yau-last-cross",
      "yau-edges",
    ],
    tailLessons: ["yau-finish"],
  },
  {
    id: "555-reduction",
    title: "축소법",
    size: 5,
    course: "555-reduction",
    head: ["555-centers", "555-edges"],
    tailLessons: [],
  },
];

export interface ParityLoop {
  kind: "oll" | "pll";
  /** 한국에서 부르는 이름(2026-11-25 사용자: 「토끼이빨」·「바보토끼이빨」) */
  name: string;
  /**
   * 덧붙는 짧은 줄: 널리 쓰는 이름과 「어디서 눈에 띄나」(처리할 때를 정하지 않는다. 마지막에 처리하는 사람도
   * 바로 고치는 사람도 있다)
   */
  sub: string;
  /** 공식 모음 상황 id */
  formulas: readonly string[];
}

/**
 * 크기마다 「3×3 맞추기」 칸 옆의 패리티 고리. 4×4만 둘이다(5×5는 홀수라 엣지 짝 걸음 안에서 다룬다, 5×5 「마지막 두
 * 엣지」 단원). 4×4 지도의 고리와 3×3 지도 「4×4에서 옴」의 우회 역이 모두 이 표 하나를 읽는다
 */
export const PARITY_LOOPS: Readonly<Record<CubeSize, readonly ParityLoop[]>> = {
  2: [],
  3: [],
  4: [
    {
      kind: "oll",
      name: "토끼이빨",
      sub: "OLL 패리티 · OLL에서 보임",
      formulas: PARITY_FORMULAS.oll,
    },
    {
      kind: "pll",
      name: "바보토끼이빨",
      sub: "PLL 패리티 · PLL에서 보임",
      formulas: PARITY_FORMULAS.pll,
    },
  ],
  5: [],
};

/**
 * 큰 큐브 뒤: 앞부분 끝 「3×3처럼」 → 「3×3 맞추기」 한 칸 → 다 맞음. 3×3은 해법별로 쪼개지 않고, 누르면 3×3
 * 지도로 건너간다(`jump`). 공식 수는 고르는 3×3 해법마다 달라 비운다. 패리티는 이 칸 옆 고리(PARITY_LOOPS)
 */
function bigTail(h: BigHead): { nodes: MapNode[]; edges: MapEdge[] } {
  const n = h.size;
  const start = (edgeOf(h.head.at(-1) as string) as MapEdge).to;
  // 같은 크기의 해법들이 함께 지나니 그 크기 과정의 「3×3처럼」 단원을 모두 단다(누르면 해법 과정 것)
  const tailLessons = [
    ...new Set(
      BIG_HEADS.filter((x) => x.size === n).flatMap((x) => x.tailLessons),
    ),
  ];
  // 줄: 앞부분 다음(4×4는 야우 앞부분이 다섯 줄)
  const row = n === 4 ? 6.5 : 3.5;
  return {
    nodes: [
      {
        id: `${n}-solved` as MapNodeId,
        title: "다 맞음",
        row,
        col: 0,
        view: "",
        size: n,
        as333: "solved",
      },
    ],
    edges: [
      {
        id: `${h.id}:333`,
        from: start,
        to: `${n}-solved` as MapNodeId,
        title: "3×3 맞추기",
        lessons: tailLessons,
        formulas: null,
        jump: { n: 3, from: n },
      },
    ],
  };
}

const TAILS = BIG_HEADS.map((h) => ({ h, ...bigTail(h) }));

const BIG_METHODS: MapMethod[] = TAILS.map(({ h, edges }) => ({
  id: h.id,
  title: h.title,
  size: h.size,
  course: h.course,
  edges: [...h.head, ...edges.map((e) => e.id)],
}));

export const MAP_METHODS: readonly MapMethod[] = [
  ...MAP_METHODS_3,
  ...SMALL_METHODS,
  ...BIG_METHODS,
];

/** 지점·길 전체(큰 큐브 뒤 묶음은 위에서 만든 것, 같은 id는 하나만) */
const uniq = <T extends { id: string }>(xs: T[]) =>
  // 처음 것을 남긴다(가장 쉬운 해법이 만든 지점의 칸)
  xs.filter((x, i) => xs.findIndex((y) => y.id === x.id) === i);
export const MAP_NODES: readonly MapNode[] = uniq([
  ...BASE_NODES,
  ...TAILS.flatMap((t) => t.nodes),
]);
export const MAP_EDGES: readonly MapEdge[] = uniq([
  ...BASE_EDGES,
  ...TAILS.flatMap((t) => t.edges),
]);

/** 해법의 크기 */
export const methodSize = (m: MapMethod): CubeSize => m.size ?? 3;

/**
 * 해법마다 잰 평균 수(큐브 전체 돌리기 x·y·z는 빼고 U2·M도 한 수, ll-compare.ts turnCount). 대회 섞기(cube-scramble
 * "333") 씨앗 1~seeds를 맞춘 평균의 반올림(solve-map-measure.ts measureMap). 초보자·2단계·ZZ는 단원 규칙
 * (beginner-path.ts·ll-compare.ts·zz-path.ts), CFOP·루는 컴퓨터 해법(@game/cube-ai solveCfop·solveRoux, 탐색이라
 * 사람보다 짧다). 코너 방향 먼저 하는 초보자와 페트루스는 끝까지 맞추는 규칙·해법이 없어 비운다. 루 컴퓨터 해법은
 * CMLL을 한 번에 풀어 위 코너 방향·자리 두 길을 `cmll` 하나로 잰다. 2×2는 단원 규칙(beginner-path-222.ts, 오르테가는
 * 규칙이 없어 비움), 4×4·5×5는 앞부분 단원 규칙(big-path.ts·big-edges-555.ts·yau-solve.ts)과 3×3처럼 축소법 풀이
 * (big-solve.ts solveReduced, 초보자 마무리)로 잰다. CFOP 마무리는 큰 큐브 CFOP 풀이가 없어 뒤 묶음을 비운다.
 * solve-map-measure.test.ts가 다시 잰다
 */
export const MAP_MEASURE: {
  seeds: number;
  turns: Partial<Record<MapMethodId, number>>;
  steps: Partial<Record<MapMethodId, Record<string, number>>>;
  parity: {
    oll: { rate: number; turns: number };
    pll: { rate: number; turns: number };
  };
} = {
  parity: { oll: { rate: 63, turns: 17 }, pll: { rate: 40, turns: 7 } },
  seeds: 30,
  turns: {
    beginner: 127,
    "two-look": 114,
    cfop: 55,
    roux: 54,
    zz: 84,
    "222-beginner": 50,
    "222-from333": 57,
    "444-reduction": 366,
    "444-yau": 314,
    "555-reduction": 667,
  },
  steps: {
    beginner: {
      cross: 15,
      "first-corners": 30,
      "second-layer": 35,
      "beginner-yellow-cross": 6,
      "beginner-edges": 9,
      "beginner-corner-place": 9,
      "beginner-corner-twist": 23,
    },
    "two-look": {
      cross: 15,
      "first-corners": 30,
      "second-layer": 35,
      "two-look-cross": 6,
      "two-look-face": 8,
      "two-look-corners": 14,
      "two-look-edges": 8,
    },
    cfop: {
      cross: 6,
      "f2l-pair-1": 5,
      "f2l-pair-2": 5,
      "f2l-pair-3": 6,
      "f2l-pair-4": 7,
      oll: 10,
      pll: 15,
    },
    roux: {
      "roux-fb": 8,
      "roux-sb": 13,
      cmll: 18,
      "lse-eo": 6,
      "lse-ulur": 5,
      "lse-ep": 4,
    },
    zz: {
      eoline: 12,
      "zz-left": 23,
      "zz-right": 21,
      "two-look-face": 8,
      "two-look-corners": 13,
      "two-look-edges": 7,
    },
    "222-beginner": {
      "222-first-layer": 25,
      "222-top-face": 15,
      "222-top-layer": 10,
    },
    "222-from333": {
      "222-first-layer": 25,
      "222-corner-place": 9,
      "222-corner-twist": 23,
    },
    "444-reduction": {
      "444-centers": 59,
      "444-edges": 155,
      "444-reduction:333": 139,
    },
    "444-yau": {
      "yau-ud-centers": 27,
      "yau-cross3": 17,
      "yau-side-centers": 27,
      "yau-last-cross": 18,
      "yau-edges": 89,
      "444-yau:333": 123,
    },
    "555-reduction": {
      "555-centers": 188,
      "555-edges": 350,
      "555-reduction:333": 129,
    },
  },
};

/** 길 하나의 잰 평균 수(해법 안에서). 없으면 undefined */
export const measuredStep = (m: MapMethodId, edge: string) =>
  MAP_MEASURE.steps[m]?.[edge];

/**
 * 길을 누르면 열 단원: 해법 과정에 든 첫 단원, 없으면 길의 첫 단원. `courseOf`는 단원 id → 과정 id
 * (지도 자료가 과정 목록 전체를 부르지 않게 화면이 넘긴다)
 */
export function lessonFor(
  edge: MapEdge,
  m: MapMethod | undefined,
  courseOf: (lessonId: string) => string | undefined,
): string | undefined {
  return (
    edge.lessons.find((l) => m?.course && courseOf(l) === m.course) ??
    edge.lessons[0]
  );
}

export const nodeById = (id: MapNodeId): MapNode =>
  MAP_NODES.find((n) => n.id === id) as MapNode;
export const edgeById = (id: string): MapEdge | undefined =>
  MAP_EDGES.find((e) => e.id === id);

/** 해법이 지나는 지점(다 섞임부터) */
export function methodNodes(m: MapMethod): MapNodeId[] {
  const first = edgeById(m.edges[0] as string);
  return [
    ...(first ? [first.from] : []),
    ...m.edges.map((id) => edgeById(id)?.to as MapNodeId),
  ];
}

/**
 * 해법 하나에서 길마다 새로 배우는 공식 수(앞 길에서 배운 공식은 다시 세지 않는다). 셀 자료가 없는 길은 null
 */
export function newFormulas(m: MapMethod): Map<string, number | null> {
  const seen = new Set<string>();
  const out = new Map<string, number | null>();
  for (const id of m.edges) {
    const e = edgeById(id);
    if (!e) continue;
    if (!e.formulas) {
      out.set(id, null);
      continue;
    }
    let k = 0;
    for (const f of e.formulas)
      if (!seen.has(f)) {
        seen.add(f);
        k++;
      }
    out.set(id, k);
  }
  return out;
}

/** 해법 하나에서 배우는 공식 수(같은 공식은 한 번). 셀 자료가 없는 길이 하나라도 있으면 null */
export function methodFormulaCount(m: MapMethod): number | null {
  // `?? []`로 쓰면 null(셀 자료 없음)까지 빈 목록이 된다
  const lists = m.edges.map((id) => {
    const e = edgeById(id);
    return e ? e.formulas : [];
  });
  if (lists.some((x) => x === null)) return null;
  return new Set(lists.flatMap((x) => x ?? [])).size;
}

// ── 지점 그림: 맞은 조각만 색, 방향만 맞은 조각은 그 방향의 칸만, 자리만 맞은 조각은 회색, 나머지는 까맣게 ──

const N = 3;
const TOPO = cubeTopology(N);
const G = cubeGroups(N, U);
const WHITE = U;
const YELLOW = D;
const kind = (p: number) => TOPO.pieces[p]?.kind as string;
const touches = (p: number, ...faces: number[]) =>
  faces.some((f) => pieceFaces(N, p).includes(f));
const allPieces = TOPO.pieces.map((_, p) => p);
const edges = allPieces.filter((p) => kind(p) === "edge");
const corners = allPieces.filter((p) => kind(p) === "corner");

/** 루·ZZ 블록(흰 면 아래로 쥐었을 때 왼쪽은 빨강 면, 오른쪽은 주황 면): 그 면에 닿고 노랑에 닿지 않는 조각 */
const sideBlock = (side: number) =>
  allPieces.filter(
    (p) => kind(p) !== "center" && touches(p, side) && !touches(p, YELLOW),
  );
/** F2L 짝(맞춘 상태 기준 흰 코너 + 그 위 가운데 층 엣지). 흰 면 아래 그림의 앞-오른쪽·앞-왼쪽·뒤-오른쪽 차례 */
const pairPieces = (k: number) => {
  // 흰 면 위 기준 앞-왼쪽, 앞-오른쪽, 뒤-왼쪽 → z2 뒤 앞-오른쪽, 앞-왼쪽, 뒤-오른쪽
  const order = [
    [F, L],
    [F, R],
    [L, B],
  ];
  return order.slice(0, k).flatMap(([a, b]) => {
    const pair = G.f2lPairs.find(
      (x) => touches(x.corner, a as number) && touches(x.corner, b as number),
    );
    return pair ? [pair.corner, ...pair.edges] : [];
  });
};

interface Look {
  /** 다 맞은 조각 */
  solved: number[];
  /** 방향만 맞은 조각과 그 기준 색(그 색 칸만 보인다) */
  oriented?: { pieces: number[]; colors: number[] };
  /** 자리만 맞은 조각(회색) */
  placed?: number[];
  /** 맞지 않았지만 제 색으로 보이는 조각(엣지 짝 그림의 짝 둘) */
  shown?: number[];
}

const centers = G.centers as number[];
const crossP = [...G.cross, ...centers];
const firstLayer = [...crossP, ...G.firstLayerCorners];
const f2l = G.f2l as number[];
const llEdges = G.lastLayerEdges as number[];
const llCorners = G.lastLayerCorners as number[];
const UD = [WHITE, YELLOW];
/** ZZ·페트루스 엣지 방향의 기준 칸: 위·아래 색, 없으면 앞·뒤 색(흰 면 위에서 앞·뒤는 초록·파랑) */
const EO_COLORS = [WHITE, YELLOW, F, B];
const line = edges.filter((p) => touches(p, WHITE) && touches(p, F, B));
const red = sideBlock(R);
const orange = sideBlock(L);
/** 페트루스(흰 면 아래, z2 뒤 왼쪽-뒤-아래): 흰-빨강-파랑 코너와 그 엣지 셋 */
const petrus222 = allPieces.filter(
  (p) =>
    kind(p) !== "center" &&
    !touches(p, YELLOW, L, F) &&
    pieceFaces(N, p).length > 1,
);
/** 2×2×3: 노랑·주황에 닿지 않는 조각 */
const petrus223 = allPieces.filter(
  (p) => kind(p) !== "center" && !touches(p, YELLOW, L),
);
const notIn = (xs: number[], all: number[]) =>
  all.filter((p) => !xs.includes(p));

/** 3×3 지점의 모습. 다른 크기는 lookBig·lookAs333 */
const LOOKS: Partial<Record<MapNodeId, Look>> = {
  scrambled: { solved: [] },
  cross: { solved: crossP },
  "first-layer": { solved: firstLayer },
  "pair-1": { solved: [...crossP, ...pairPieces(1)] },
  "pair-2": { solved: [...crossP, ...pairPieces(2)] },
  "pair-3": { solved: [...crossP, ...pairPieces(3)] },
  f2l: { solved: f2l },
  "yellow-cross": {
    solved: f2l,
    oriented: { pieces: llEdges, colors: [YELLOW] },
  },
  "yellow-edges": { solved: [...f2l, ...llEdges] },
  "ll-corners-placed": { solved: [...f2l, ...llEdges], placed: llCorners },
  "ll-corners-oriented": {
    solved: [...f2l, ...llEdges],
    oriented: { pieces: llCorners, colors: [YELLOW] },
  },
  oll: {
    solved: f2l,
    oriented: { pieces: [...llEdges, ...llCorners], colors: [YELLOW] },
  },
  "pll-corners": {
    solved: [...f2l, ...llCorners],
    oriented: { pieces: llEdges, colors: [YELLOW] },
  },
  solved: { solved: allPieces },
  eoline: {
    solved: [...line, ...centers],
    oriented: { pieces: notIn(line, edges), colors: EO_COLORS },
  },
  "zz-left": {
    solved: [...line, ...red, ...centers],
    oriented: { pieces: notIn([...line, ...red], edges), colors: EO_COLORS },
  },
  "roux-fb": { solved: [...red, ...centers] },
  "roux-sb": { solved: [...red, ...orange, ...centers] },
  "roux-co": {
    solved: [...red, ...orange, ...centers],
    oriented: { pieces: llCorners, colors: [YELLOW] },
  },
  cmll: { solved: [...red, ...orange, ...llCorners, ...centers] },
  "lse-eo": {
    solved: [...red, ...orange, ...llCorners, ...centers],
    oriented: { pieces: notIn([...red, ...orange], edges), colors: UD },
  },
  "lse-ulur": {
    solved: [
      ...red,
      ...orange,
      ...llCorners,
      ...centers,
      ...llEdges.filter((p) => touches(p, R, L)),
    ],
    oriented: {
      pieces: notIn(
        [...red, ...orange, ...llEdges.filter((p) => touches(p, R, L))],
        edges,
      ),
      colors: UD,
    },
  },
  "petrus-222": {
    solved: [...petrus222, ...centers.filter((p) => !touches(p, YELLOW, L, F))],
  },
  "petrus-223": {
    solved: [...petrus223, ...centers.filter((p) => !touches(p, YELLOW, L))],
  },
  "corners-first": { solved: [...corners, ...centers] },
};

// ── 다른 크기 ─────────────────────────────────────────

/** 크기 n의 조각 묶음(센터 블럭은 한 면에 여럿, 엣지는 날개 여럿) */
function partsOf(n: number) {
  const topo = cubeTopology(n);
  const all = topo.pieces.map((_, p) => p);
  const k = (p: number) => topo.pieces[p]?.kind as string;
  const on = (p: number, ...faces: number[]) =>
    faces.some((f) => pieceFaces(n, p).includes(f));
  const isCenter = (p: number) => k(p) === "center" || k(p) === "innerCenter";
  const isEdge = (p: number) => k(p) === "edge" || k(p) === "wing";
  const centersN = all.filter(isCenter);
  const edgesN = all.filter(isEdge);
  const cornersN = all.filter((p) => k(p) === "corner");
  return { topo, all, on, centersN, edgesN, cornersN };
}

/** 3×3 지점의 모습을 크기 n 큐브로: 같은 면에 닿은 조각(날개는 그 엣지, 센터 블럭은 그 면 센터)을 같이 맞춘다 */
function lookAs333(n: number, id333: MapNodeId): Look {
  const base = LOOKS[id333] as Look;
  const key = (faces: number[]) => [...faces].sort((a, b) => a - b).join(",");
  const mode = new Map<string, "solved" | "oriented" | "placed">();
  for (const p of base.placed ?? []) mode.set(key(pieceFaces(3, p)), "placed");
  for (const p of base.oriented?.pieces ?? [])
    mode.set(key(pieceFaces(3, p)), "oriented");
  for (const p of base.solved) mode.set(key(pieceFaces(3, p)), "solved");
  const { all } = partsOf(n);
  const pick = (m: string) =>
    all.filter((p) => mode.get(key(pieceFaces(n, p))) === m);
  return {
    solved: pick("solved"),
    ...(base.oriented
      ? { oriented: { pieces: pick("oriented"), colors: base.oriented.colors } }
      : {}),
    ...(base.placed ? { placed: pick("placed") } : {}),
  };
}

/** 2×2·4×4·5×5 앞부분 지점(3×3 지도에 없는 상태) */
function lookBig(n: number, id: MapNodeId): Look {
  const { on, centersN, edgesN, cornersN } = partsOf(n);
  const white = cornersN.filter((p) => on(p, WHITE));
  const yellow = cornersN.filter((p) => on(p, YELLOW));
  const ud = centersN.filter((p) => on(p, WHITE, YELLOW));
  const cross = edgesN.filter((p) => on(p, WHITE));
  // 야우 흰 십자 셋은 흰-주황 엣지를 남긴다(옆 센터 뒤 마지막 십자 엣지)
  const cross3 = cross.filter((p) => !on(p, L));
  switch (id) {
    case "2-first-layer":
      return { solved: white };
    case "2-top-face":
      return { solved: white, oriented: { pieces: yellow, colors: [YELLOW] } };
    case "2-corners-placed":
      return { solved: white, placed: yellow };
    case "2-first-face":
      return { solved: [], oriented: { pieces: white, colors: [WHITE] } };
    case "2-both-faces":
      return {
        solved: [],
        oriented: { pieces: cornersN, colors: [WHITE, YELLOW] },
      };
    case "2-solved":
      return { solved: cornersN };
    case "4-centers":
    case "5-centers":
      return { solved: centersN };
    // 엣지를 묶었지만 제자리는 아니다(회색, 바깥 층을 돌려 옮겨 둔 짝 둘만 제 색)
    case "4-paired":
    case "5-paired":
      return { solved: centersN, placed: edgesN, shown: pairedShown(n, id) };
    case "4-ud-centers":
      return { solved: ud };
    case "4-cross3":
      return { solved: [...ud, ...cross3] };
    case "4-yau-centers":
      return { solved: [...centersN, ...cross3] };
    case "4-yau-cross":
      return { solved: [...centersN, ...cross] };
    case "4-yau-paired":
      return {
        solved: [...centersN, ...cross],
        placed: edgesN.filter((p) => !cross.includes(p)),
        shown: pairedShown(n, id),
      };
    default:
      return { solved: [] };
  }
}

/** 맞춘 큐브에 돌리기를 한 상태 */
const turned = (n: number, moves: string) => {
  let s = solvedCube(n);
  for (const m of parseMoves(n, moves)) s = applyMove(n, s, m);
  return s;
};

/** 조각이 지금 놓인 자리의 면들(스티커 정체 → 지금 칸의 면) */
export function pieceFacesNow(
  n: number,
  state: PuzzleState,
  piece: number,
): number[] {
  const nn = n * n;
  const slotOf = new Map<number, number>();
  state.perm.forEach((sticker, slot) => {
    slotOf.set(sticker as number, slot);
  });
  return (cubeTopology(n).pieces[piece]?.stickers ?? []).map((s) =>
    Math.floor((slotOf.get(s) as number) / nn),
  );
}

/** 엣지 짝 지점에서 제 색으로 보일 엣지 조각(돌리기 뒤 `show` 자리에 온 날개·가운데 엣지 블럭 모두) */
function pairedShown(n: number, id: MapNodeId): number[] {
  const paired = nodeById(id).paired;
  if (!paired) return [];
  const { edgesN } = partsOf(n);
  const s = turned(n, paired.turns);
  const key = (fs: readonly number[]) =>
    [...fs].sort((a, b) => a - b).join(",");
  const want = new Set(paired.show.map(key));
  return edgesN.filter((p) => want.has(key(pieceFacesNow(n, s, p))));
}

/** 지점 그림의 큐브 크기 */
export const nodeSize = (id: MapNodeId): CubeSize => nodeById(id).size ?? 3;

/** 지점의 모습(크기 n 조각 번호로) */
function lookOf(id: MapNodeId): Look {
  const node = nodeById(id);
  const n = node.size ?? 3;
  if (node.as333) return lookAs333(n, node.as333);
  if (n === 3) return LOOKS[id] as Look;
  return lookBig(n, id);
}

/** 3×3 지점을 큰 큐브로 그릴 때의 크기(큰 큐브 「3×3 맞추기」를 펼친 그림). 3×3 지점이 아니면 무시 */
const drawSize = (id: MapNodeId, as?: CubeSize) =>
  as && as !== 3 && nodeSize(id) === 3 ? as : nodeSize(id);

/** 지점 그림의 가리기(스티커 정체마다). `as`: 3×3 지점을 그 크기 큐브에서 같은 조각을 맞춘 모습으로 */
export function nodeMask(id: MapNodeId, as?: CubeSize): StickerVisibility[] {
  const n = drawSize(id, as);
  const look = n !== nodeSize(id) ? lookAs333(n, id) : lookOf(id);
  const topo = cubeTopology(n);
  const out = new Array<StickerVisibility>(topo.stickerCount).fill("hidden");
  const stickers = (p: number) => topo.pieces[p]?.stickers ?? [];
  for (const p of look.placed ?? [])
    for (const s of stickers(p)) out[s] = "gray";
  for (const p of look.shown ?? [])
    for (const s of stickers(p)) out[s] = "visible";
  if (look.oriented)
    for (const p of look.oriented.pieces) {
      // 기준 색 가운데 앞의 것이 붙은 칸 하나(엣지 방향은 위·아래 색, 없으면 앞·뒤 색)
      const ss = stickers(p);
      for (const c of look.oriented.colors) {
        const s = ss.find((x) => stickerFace(n, x) === c);
        if (s !== undefined) {
          out[s] = "visible";
          break;
        }
      }
    }
  for (const p of look.solved) for (const s of stickers(p)) out[s] = "visible";
  // 홀수 크기의 면 정가운데 센터 블럭은 움직이지 않아 늘 맞은 조각이다(다 섞임에서도 칠한다, 2026-11-26 사용자).
  // 4×4·2×2는 고정 센터가 없다
  topo.pieces.forEach((p, i) => {
    if (p.kind === "center") for (const s of stickers(i)) out[s] = "visible";
  });
  return out;
}

/** 지점의 다 맞은 조각(시험이 판정과 견준다) */
export const nodeSolvedPieces = (id: MapNodeId): readonly number[] =>
  lookOf(id).solved;

/** 지점 그림의 큐브(맞춘 큐브를 그 지점의 쥐는 돌리기로 쥔 것, 엣지 짝 지점은 그 전에 바깥 층 돌리기) */
export function nodeState(id: MapNodeId, as?: CubeSize): PuzzleState {
  const n = drawSize(id, as);
  const node = nodeById(id);
  return turned(n, `${node.paired?.turns ?? ""} ${node.view}`.trim());
}
