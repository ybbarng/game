import { parseMoves } from "@game/cube-engine";

/**
 * 예쁜 패턴 모음(`/cube/patterns`). 맞춘 큐브에서 공식을 하면 그 모양이 된다.
 *
 * 공식은 널리 알려진 것만 넣고, 모두 엔진으로 해 본 결과를 확인했다.
 * `check`가 "property"인 것은 `data.test.ts`가 이름대로의 성질(체커보드면 칸이 엇갈린다 등)을 시험하고,
 * "eye"인 것은 모양을 말로 쓰기 어려워 펼친 그림 스냅숏과 스크린샷을 눈으로 보고 넣었다.
 */

export type PatternLevel = "easy" | "normal" | "hard";

export const LEVEL_LABEL: Record<PatternLevel, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
};

export interface Pattern {
  id: string;
  size: number;
  /** 쉬운 한국어 이름 */
  name: string;
  /** 널리 쓰는 영어 이름(있을 때만) */
  en?: string;
  alg: string;
  /** 모양 설명 한 줄 */
  look: string;
  /** 다른 공식(같은 모양) */
  alt?: string;
  check: "property" | "eye";
}

export const PATTERNS: readonly Pattern[] = [
  // ---------- 3×3 ----------
  {
    id: "3-checkerboard",
    size: 3,
    name: "체커보드",
    en: "Checkerboard",
    alg: "R2 L2 U2 D2 F2 B2",
    look: "모든 면이 맞은편 색과 한 칸씩 엇갈려요.",
    alt: "M2 E2 S2",
    check: "property",
  },
  {
    id: "3-six-spots",
    size: 3,
    name: "여섯 점",
    en: "Six Spots",
    alg: "U D' R L' F B' U D'",
    look: "면마다 가운데 한 칸만 다른 색이에요.",
    check: "property",
  },
  {
    id: "3-four-spots",
    size: 3,
    name: "네 점",
    en: "Four Spots",
    alg: "F2 B2 U D' R2 L2 U D'",
    look: "옆 네 면에만 점이 찍혀요. 위·아래는 그대로예요.",
    check: "property",
  },
  {
    id: "3-pillars",
    size: 3,
    name: "기둥",
    en: "Pillars",
    alg: "L2 R2 B2 F2",
    look: "옆면에 세로 기둥이 서고, 위·아래는 체커보드가 돼요.",
    check: "property",
  },
  {
    id: "3-cross",
    size: 3,
    name: "십자",
    en: "Cross",
    alg: "U F B' L2 U2 L2 F' B U2 L2 U",
    look: "면마다 십자가 서고 네 귀퉁이만 맞은편 색이에요.",
    check: "property",
  },
  {
    id: "3-stripes",
    size: 3,
    name: "세 줄 무늬",
    alg: "F U F R L2 B D' R D2 L D' B R2 L F U F",
    look: "옆 네 면이 세 가지 색 세로 줄무늬가 돼요.",
    check: "property",
  },
  {
    id: "3-zigzag",
    size: 3,
    name: "지그재그",
    en: "Zigzag",
    alg: "R L F B R L F B R L F B",
    look: "옆면을 따라 두 색이 지그재그로 엇갈려요.",
    check: "eye",
  },
  {
    id: "3-wire",
    size: 3,
    name: "철사",
    en: "Wire",
    alg: "R L F B R L F B R L F B R2 B2 L2 R2 B2 L2",
    look: "옆면 위·아래 줄을 따라 가는 철사가 감겨요. 가운데 줄은 그대로예요.",
    check: "eye",
  },
  {
    id: "3-tetris",
    size: 3,
    name: "테트리스",
    en: "Tetris",
    alg: "L R F B U' D' L' R'",
    look: "테트리스 블록 같은 꺾인 모양이 면마다 생겨요.",
    check: "eye",
  },
  {
    id: "3-python",
    size: 3,
    name: "비단뱀",
    en: "Python",
    alg: "F2 R' B' U R' L F' L F' B D' R B L2",
    look: "한 줄로 이어진 뱀이 큐브를 감아요.",
    check: "eye",
  },
  {
    id: "3-anaconda",
    size: 3,
    name: "아나콘다",
    en: "Anaconda",
    alg: "L U B' U' R L' B R' F B' D R D' F'",
    look: "비단뱀보다 굵은 뱀이 큐브를 휘감아요.",
    check: "eye",
  },
  {
    id: "3-spiral",
    size: 3,
    name: "회오리",
    en: "Spiral",
    alg: "L' B' D U R U' R' D2 R2 D L D' L' R' F U",
    look: "면마다 다른 색 줄이 소용돌이처럼 돌아 들어가요.",
    check: "eye",
  },
  {
    id: "3-cube-in-cube",
    size: 3,
    name: "큐브 속 큐브",
    en: "Cube in a Cube",
    alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    look: "한 귀퉁이에 작은 2×2 큐브가 박혀 있는 것처럼 보여요.",
    check: "property",
  },
  {
    id: "3-cube-in-cube-in-cube",
    size: 3,
    name: "큐브 속 큐브 속 큐브",
    en: "Cube in a Cube in a Cube",
    alg: "U' L' U' F' R2 B' R F U B2 U B' L U' F U R F'",
    look: "큐브 속 큐브 안에 더 작은 큐브가 또 들어 있어요.",
    check: "property",
  },
  {
    id: "3-superflip",
    size: 3,
    name: "슈퍼플립",
    en: "Superflip",
    alg: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
    look: "모든 조각이 제자리인데 모서리 열두 개만 다 뒤집혀 있어요. 맞추기 가장 먼 상태 중 하나예요(20수).",
    check: "property",
  },
  // ---------- 2×2 ----------
  {
    id: "2-side-stripes",
    size: 2,
    name: "옆면 두 줄",
    alg: "R2 F2 R2",
    look: "옆 네 면이 맞은편 색과 반반씩 세로로 나뉘어요.",
    check: "property",
  },
  {
    id: "2-halves",
    size: 2,
    name: "모든 면 두 줄",
    alg: "R U2 R2",
    look: "여섯 면이 모두 두 색으로 반씩 나뉘어요.",
    check: "property",
  },
  {
    id: "2-top-checker",
    size: 2,
    name: "위아래 체커보드",
    alg: "R2 U2 F2",
    look: "위·아래 면은 체커보드, 옆면은 두 줄이 돼요.",
    check: "property",
  },
  {
    id: "2-cube-in-cube",
    size: 2,
    name: "큐브 속 큐브",
    en: "Cube in a Cube",
    alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    look: "3×3과 같은 공식이에요. 한 귀퉁이 조각만 다른 색으로 보여요.",
    check: "property",
  },
  // ---------- 4×4 ----------
  {
    id: "4-frame",
    size: 4,
    name: "액자",
    alg: "R2 L2 U2 D2 F2 B2",
    look: "3×3 체커보드 공식이에요. 테두리 가운데만 맞은편 색이라 액자처럼 보여요.",
    check: "property",
  },
  {
    id: "4-six-spots",
    size: 4,
    name: "여섯 점",
    en: "Six Spots",
    alg: "U D' R L' F B' U D'",
    look: "3×3과 같은 공식이에요. 면마다 가운데 2×2가 다른 색이에요.",
    check: "property",
  },
  {
    id: "4-cube-in-cube",
    size: 4,
    name: "큐브 속 큐브",
    en: "Cube in a Cube",
    alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    look: "3×3과 같은 공식이에요. 귀퉁이에 3×3 큐브가 박혀 보여요.",
    check: "property",
  },
  // ---------- 5×5 ----------
  {
    id: "5-checkerboard",
    size: 5,
    name: "체커보드",
    en: "Checkerboard",
    alg: "R2 3R2 L2 U2 3U2 D2 F2 3F2 B2",
    look: "한 층 건너 하나씩 반 바퀴 돌려 모든 칸이 엇갈려요.",
    check: "property",
  },
  {
    id: "5-frame",
    size: 5,
    name: "액자",
    alg: "R2 L2 U2 D2 F2 B2",
    look: "3×3 체커보드 공식이에요. 테두리 가운데만 맞은편 색이에요.",
    check: "property",
  },
  {
    id: "5-six-spots",
    size: 5,
    name: "여섯 점",
    en: "Six Spots",
    alg: "U D' R L' F B' U D'",
    look: "3×3과 같은 공식이에요. 면마다 가운데 3×3이 다른 색이에요.",
    check: "property",
  },
  {
    id: "5-cube-in-cube",
    size: 5,
    name: "큐브 속 큐브",
    en: "Cube in a Cube",
    alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    look: "3×3과 같은 공식이에요. 귀퉁이에 4×4 큐브가 박혀 보여요.",
    check: "property",
  },
  {
    id: "5-cube-in-cube-in-cube",
    size: 5,
    name: "큐브 속 큐브 속 큐브",
    en: "Cube in a Cube in a Cube",
    alg: "U' L' U' F' R2 B' R F U B2 U B' L U' F U R F'",
    look: "3×3과 같은 공식이에요. 큐브 세 개가 겹쳐 보여요.",
    check: "property",
  },
];

/**
 * 패턴에서 패턴으로: `from`을 만든 큐브에 `next`의 공식을 이어 하면 `result`가 된다(`data.test.ts`가 확인).
 */
export interface PatternLink {
  from: string;
  next: string;
  result: string;
}

export const PATTERN_LINKS: readonly PatternLink[] = [
  {
    from: "3-checkerboard",
    next: "3-six-spots",
    result: "면마다 귀퉁이·모서리·가운데가 세 가지 색으로 엇갈리는 체커보드",
  },
  {
    from: "3-six-spots",
    next: "3-six-spots",
    result: "점 색이 한 번 더 바뀐 여섯 점",
  },
];

export const PATTERN_SIZES = [3, 2, 4, 5] as const;

export function patternById(id: string): Pattern | undefined {
  return PATTERNS.find((p) => p.id === id);
}

/** 큐브 돌리기(x y z)를 뺀 수 개수 */
export function moveCount(n: number, alg: string): number {
  return parseMoves(n, alg).filter((m) => !(m.from === 1 && m.to === n)).length;
}

/** 수 개수로 정하는 어려움: 8수까지 쉬움, 14수까지 보통 */
export function levelOf(count: number): PatternLevel {
  return count <= 8 ? "easy" : count <= 14 ? "normal" : "hard";
}
