// 해법 지도(3×3, 시안 2026-11-25): 큐브를 맞추는 여러 길을 한 그래프로. 맨 위는 다 섞인 상태, 맨 아래는 다 맞은 상태.
// - 지점: 맞은 조각이 무엇인지로 정한 상태. 여러 해법이 같은 상태를 지나면 지점 하나로 합친다
//   (초보자·2단계·CFOP는 「아래 두 층」에서, ZZ·페트루스는 「노란 십자」에서 만난다).
// - 길: 지점과 지점 사이의 걸음. 이름, 가르치는 단원 id(없으면 빈 목록), 배우는 공식(공식 모음 상황 id 또는 단원 공식 그대로).
// - 해법: 지나는 길의 차례.
// 공식 수는 자료에서 센다(공식 모음 algs-*.ts·공식 연습 단계 practice/*의 상황 수, 초보자는 단원 공식 상수). 직관으로 하는
// 걸음(십자·블록 등)은 공식 없음(빈 목록). 평균 수는 단원 규칙이나 컴퓨터 해법으로 잰 값만 둔다(solve-map.test.ts가 다시 잰다).
import {
  B,
  cubeGroups,
  cubeTopology,
  D,
  F,
  L,
  pieceFaces,
  R,
  type StickerVisibility,
  solvedCube,
  stickerFace,
  U,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { F2L_CASES } from "./algs-f2l";
import { OLL_CASES } from "./algs-oll";
import { PLL_CASES } from "./algs-pll";
import {
  CORNER_CYCLE,
  EDGE_SWAP,
  FROM_RIGHT,
  play,
  RIGHT,
  TWIST,
  YELLOW_CROSS,
} from "./beginner-path";
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
  | "petrus-eo"
  | "corners-first"
  | "4-scrambled"
  | "4-centers"
  | "4-ud-centers"
  | "4-cross3"
  | "4-yau-centers";

export interface MapNode {
  id: MapNodeId;
  title: string;
  /** 그림 칸 자리(줄은 위에서 아래, 칸은 왼쪽에서 오른쪽. 반 칸도 된다). 4×4 지점은 3×3 다 섞임 위(음수 줄) */
  row: number;
  col: number;
  /** 그림에서 큐브를 쥐는 돌리기(맞은 조각이 잘 보이게) */
  view: string;
  /** 큐브 크기(없으면 3) */
  size?: 3 | 4;
}

/**
 * 해법마다 가로 칸(왼쪽 초보자 → 오른쪽 고급, 2026-11-25 사용자 「왼쪽이 초보자용, 오른쪽이 고급」).
 * 차례는 사이트 과정의 선행 차례(courses.ts REQUIRES: 초보자 → 2단계 → CFOP → 루·ZZ → 페트루스)를 따르고, 같은
 * 줄기의 갈래(코너 방향 먼저)는 바로 옆에, 사이트에 단원이 없는 갈래·코너 먼저는 그 뒤, 4×4는 오른쪽 끝에 둔다.
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
  "444-reduction": 8,
  "444-yau": 9,
};

export const MAP_NODES: readonly MapNode[] = [
  // 4×4: 센터·엣지를 묶으면 3×3처럼 맞춘다(축소법은 다 섞인 3×3, 야우는 흰 십자가 맞은 3×3에 닿는다).
  // 3×3 다 섞임 위(음수 줄) 오른쪽 끝에 따로 둔다
  {
    id: "4-scrambled",
    title: "4×4 다 섞임",
    row: -4,
    col: 8,
    view: "",
    size: 4,
  },
  { id: "4-centers", title: "4×4 센터", row: -3, col: 8, view: "", size: 4 },
  {
    id: "4-ud-centers",
    title: "흰·노랑 센터",
    row: -3,
    col: 9,
    view: "",
    size: 4,
  },
  { id: "4-cross3", title: "흰 십자 셋", row: -2, col: 9, view: "", size: 4 },
  {
    id: "4-yau-centers",
    title: "옆 센터",
    row: -1,
    col: 9,
    view: "",
    size: 4,
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
  { id: "petrus-eo", title: "엣지 방향", row: 3, col: 6, view: "z2 y2" },
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
}

const ids = (xs: readonly { id: string }[]) => xs.map((c) => c.id);
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

export const MAP_EDGES: readonly MapEdge[] = [
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
    to: "petrus-eo",
    title: "엣지 방향",
    lessons: ["petrus-intro"],
    formulas: [],
  },
  {
    id: "petrus-f2l",
    from: "petrus-eo",
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
  // 4×4(공식 수는 단원 공식을 셀 기준이 아직 없어 비운다)
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
    to: "scrambled",
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
    id: "yau-edges",
    from: "4-yau-centers",
    to: "cross",
    title: "엣지 묶기",
    lessons: ["yau-edges"],
    formulas: null,
  },
];

/**
 * 준비 칸(지도 맨 위, 상태 지점이 아님): 큐브 상태를 바꾸지 않는 지식 단원. 3×3 처음 맞추기 과정 앞부분
 * (lessons-333.ts 차례)의 큐브와 만나기·조각의 움직임·표기. 안전한 회전은 흰 십자 걸음에 둔다
 */
export const MAP_PREP: readonly string[] = [
  "333-start",
  "333-piece-moves",
  "333-notation",
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
  | "444-reduction"
  | "444-yau";

export interface MapMethod {
  id: MapMethodId;
  title: string;
  /** 기본으로 접어 두는 해법(사이트에 단원이 없거나 다른 크기). 켜고 끌 수 있다 */
  extra?: boolean;
  /** 길을 누르면 이 과정의 단원을 먼저 연다(길에 단원이 여럿일 때) */
  course?: string;
  /** 지나는 길(다 섞임 → 다 맞음 차례) */
  edges: readonly string[];
}

const BEGINNER_LOWER = ["cross", "first-corners", "second-layer"];
const TWO_LOOK_LL = [
  "two-look-face",
  "two-look-corners",
  "two-look-edges",
] as const;

export const MAP_METHODS: readonly MapMethod[] = [
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
  {
    id: "444-reduction",
    title: "4×4 축소법",
    extra: true,
    course: "444-reduction",
    edges: [
      "444-centers",
      "444-edges",
      ...BEGINNER_LOWER,
      "beginner-yellow-cross",
      "beginner-edges",
      "beginner-corner-place",
      "beginner-corner-twist",
    ],
  },
  {
    id: "444-yau",
    title: "4×4 야우",
    extra: true,
    course: "444-yau",
    edges: [
      "yau-ud-centers",
      "yau-cross3",
      "yau-side-centers",
      "yau-edges",
      "f2l-pair-1",
      "f2l-pair-2",
      "f2l-pair-3",
      "f2l-pair-4",
      "oll",
      "pll",
    ],
  },
];

/** 해법이 4×4 지점을 지나나 */
export const isBigMethod = (m: MapMethod) =>
  methodNodes(m).some((id) => (nodeById(id).size ?? 3) === 4);

/**
 * 해법마다 잰 평균 수(큐브 전체 돌리기 x·y·z는 빼고 U2·M도 한 수, ll-compare.ts turnCount). 대회 섞기(cube-scramble
 * "333") 씨앗 1~seeds를 맞춘 평균의 반올림(solve-map-measure.ts measureMap). 초보자·2단계·ZZ는 단원 규칙
 * (beginner-path.ts·ll-compare.ts·zz-path.ts), CFOP·루는 컴퓨터 해법(@game/cube-ai solveCfop·solveRoux, 탐색이라
 * 사람보다 짧다). 코너 방향 먼저 하는 초보자와 페트루스는 끝까지 맞추는 규칙·해법이 없어 비운다. 루 컴퓨터 해법은
 * CMLL을 한 번에 풀어 위 코너 방향·자리 두 길을 `cmll` 하나로 잰다. solve-map.test.ts가 다시 잰다
 */
export const MAP_MEASURE: {
  seeds: number;
  turns: Partial<Record<MapMethodId, number>>;
  steps: Partial<Record<MapMethodId, Record<string, number>>>;
} = {
  seeds: 30,
  turns: { beginner: 127, "two-look": 114, cfop: 55, roux: 54, zz: 84 },
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

const LOOKS: Record<MapNodeId, Look> = {
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
  "petrus-eo": {
    solved: [...petrus223, ...centers.filter((p) => !touches(p, YELLOW, L))],
    oriented: { pieces: notIn(petrus223, edges), colors: EO_COLORS },
  },
  "corners-first": { solved: [...corners, ...centers] },
  // 4×4 지점은 LOOKS4
  "4-scrambled": { solved: [] },
  "4-centers": { solved: [] },
  "4-ud-centers": { solved: [] },
  "4-cross3": { solved: [] },
  "4-yau-centers": { solved: [] },
};

// 4×4: 센터 블럭은 면마다 넷, 엣지는 날개 둘. 야우 흰 십자 셋은 흰-주황 엣지를 남긴다(옆 센터 뒤 마지막 십자 엣지)
const T4 = cubeTopology(4);
const kind4 = (p: number) => T4.pieces[p]?.kind as string;
const all4 = T4.pieces.map((_, p) => p);
const centers4 = all4.filter(
  (p) => kind4(p) === "innerCenter" || kind4(p) === "center",
);
const touches4 = (p: number, ...faces: number[]) =>
  faces.some((f) => pieceFaces(4, p).includes(f));
const udCenters4 = centers4.filter((p) => touches4(p, WHITE, YELLOW));
const cross3 = all4.filter(
  (p) =>
    (kind4(p) === "wing" || kind4(p) === "edge") &&
    touches4(p, WHITE) &&
    !touches4(p, L),
);
const LOOKS4: Partial<Record<MapNodeId, number[]>> = {
  "4-scrambled": [],
  "4-centers": centers4,
  "4-ud-centers": udCenters4,
  "4-cross3": [...udCenters4, ...cross3],
  "4-yau-centers": [...centers4, ...cross3],
};

/** 지점 그림의 큐브 크기 */
export const nodeSize = (id: MapNodeId): 3 | 4 => nodeById(id).size ?? 3;

/** 지점 그림의 가리기(스티커 정체마다) */
export function nodeMask(id: MapNodeId): StickerVisibility[] {
  if (nodeSize(id) === 4) {
    const out = new Array<StickerVisibility>(T4.stickerCount).fill("hidden");
    for (const p of LOOKS4[id] ?? [])
      for (const s of T4.pieces[p]?.stickers ?? []) out[s] = "visible";
    return out;
  }
  const look = LOOKS[id];
  const out = new Array<StickerVisibility>(TOPO.stickerCount).fill("hidden");
  const stickers = (p: number) => TOPO.pieces[p]?.stickers ?? [];
  for (const p of look.placed ?? [])
    for (const s of stickers(p)) out[s] = "gray";
  if (look.oriented)
    for (const p of look.oriented.pieces) {
      // 기준 색 가운데 앞의 것이 붙은 칸 하나(엣지 방향은 위·아래 색, 없으면 앞·뒤 색)
      const ss = stickers(p);
      for (const c of look.oriented.colors) {
        const s = ss.find((x) => stickerFace(N, x) === c);
        if (s !== undefined) {
          out[s] = "visible";
          break;
        }
      }
    }
  for (const p of look.solved) for (const s of stickers(p)) out[s] = "visible";
  return out;
}

/** 지점의 다 맞은 조각(시험이 판정과 견준다) */
export const nodeSolvedPieces = (id: MapNodeId): readonly number[] =>
  LOOKS[id].solved;

/** 지점 그림의 큐브(맞춘 큐브를 그 지점의 쥐는 돌리기로 쥔 것) */
export function nodeState(id: MapNodeId): PuzzleState {
  // 4×4 지점은 흰 면 위 그대로 본다(쥐는 돌리기 없음)
  if (nodeSize(id) === 4) return solvedCube(4);
  return play(solvedCube(N), nodeById(id).view);
}
