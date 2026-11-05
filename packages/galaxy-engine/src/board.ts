import { NUMBERS, round10 } from "./rules";
import type { GalaxyConstellation, GalaxySky, GalaxyStar } from "./sky-types";

/**
 * 판: 32칸 한 바퀴(docs/48 2-1). 모퉁이 넷(0 우주국, 8 소행성대, 16 관측지, 24 혜성),
 * 변마다 가운데 공문 하나(4·12·20·28), 나머지 24칸이 별이다.
 * 어느 별자리를 어느 칸에 둘지는 하늘(`GalaxySky`)이 정하고, 값은 하늘에서 계산한다(5-9).
 */

export const BOARD_SIZE = 32;
export const BASE = 0;
export const ASTEROID = 8;
export const OBSERVATORY = 16;
export const COMET = 24;
export const NOTICES = [4, 12, 20, 28] as const;
export const STAR_COUNT = 24;

export type SquareKind =
  | "base"
  | "asteroid"
  | "observatory"
  | "comet"
  | "notice"
  | "star";

/** 칸의 별 하나 */
export interface BoardStar {
  /** 칸 번호 */
  square: number;
  star: GalaxyStar;
  /** 별자리 번호(`groups` 안 번호) */
  group: number;
  /** 별 값(사는 값) */
  value: number;
  /** 판 위에 놓인 그 별자리 별 가운데 가장 밝은 별(+20). 별자리 전체에서 가장 밝은 별과 다를 수 있다(페가수스는 판에 없는 에니프) */
  brightest: boolean;
}

export interface BoardSquare {
  index: number;
  kind: SquareKind;
  /** 변 번호(0~3, 우주국 다음 변부터). 모퉁이는 null */
  side: number | null;
  /** 별 칸이면 별 */
  star: BoardStar | null;
}

/** 판 위 별자리 하나 */
export interface BoardGroup {
  id: string;
  ko: string;
  season: GalaxyConstellation["season"];
  /** 이 별자리 별이 있는 칸(판 차례) */
  squares: number[];
  /**
   * 제 변(0~3): 이 별자리 별 대부분이 서는 변. 제철 하늘은 이 변의 계절에 이 별자리 이용료를 올린다(g4부터
   * 변이 아니라 별자리로 정한다, docs/48 15-3). 반쯤 섞은 판에서는 별 하나가 맞은편 변에 있어도 제 변은 하나다
   */
  home: number;
  /** 합친 밝기(등급) */
  magnitude: number;
  /** 밝기 순위(0이 가장 밝음) */
  rank: number;
  /** 별자리 기본 값(가장 밝은 별은 +20) */
  base: number;
  /** 정거장 한 단 값 */
  levelCost: number;
}

export interface GalaxyBoard {
  skyId: string;
  skyKo: string;
  squares: BoardSquare[];
  groups: BoardGroup[];
  /** 판 위 별 값 합 */
  total: number;
}

/** 이 칸의 변 번호(모퉁이는 null) */
export function sideOf(square: number): number | null {
  return square % 8 === 0 ? null : Math.floor(square / 8);
}

/** 별 칸 번호 24개(판 차례) */
export const STAR_SQUARES: readonly number[] = Array.from(
  { length: BOARD_SIZE },
  (_, i) => i,
).filter((i) => i % 8 !== 0 && i % 8 !== 4);

function kindOf(square: number): SquareKind {
  if (square === BASE) return "base";
  if (square === ASTEROID) return "asteroid";
  if (square === OBSERVATORY) return "observatory";
  if (square === COMET) return "comet";
  if (square % 8 === 4) return "notice";
  return "star";
}

/** 별 여럿의 합친 밝기(등급). 빛의 양을 더해 다시 등급으로 */
export function combinedMagnitude(mags: readonly number[]): number {
  let flux = 0;
  for (const m of mags) flux += 10 ** (-0.4 * m);
  return -2.5 * Math.log10(flux);
}

/** 별자리 n개 가운데 밝기 순위 r의 기본 값(5-9 식, 10 단위) */
export function baseValue(rank: number, count: number): number {
  if (count <= 1) return NUMBERS.valueMax;
  const span = NUMBERS.valueMax - NUMBERS.valueMin;
  // 60 + 140 × (n − 1 − r) / (n − 1)을 정수로 계산해 10 단위로 반올림한다.
  const numerator = NUMBERS.valueMin * (count - 1) + span * (count - 1 - rank);
  const denominator = count - 1;
  return Math.floor((numerator + 5 * denominator) / (10 * denominator)) * 10;
}

/**
 * 별 칸 배치(docs/48 15-3).
 * - split(반쯤 섞기, g4 기본): 별자리마다 별 둘(가장 밝은 별 포함)은 제 변에 붙여 두고, 가장 어두운 하나를
 *   맞은편 변 가운데(공문 양옆)에 둔다. 변 = [A 둘, 맞은편 C 하나, 공문, 맞은편 D 하나, B 둘].
 *   별자리 8 × 별 3 하늘만 이렇게 하고, 다른 모양(12 × 2)은 grouped로 둔다
 * - grouped: 별자리 별을 판 차례대로 붙여 둔다(g3까지의 판)
 * - spread(완전히 섞기, bench 견주기용): 별 칸 차례 k = 별 번호 × 별자리 수 + 별자리 번호
 */
export type BoardLayout = "split" | "grouped" | "spread";

/** 배치의 별 칸 차례대로 [별자리 번호, 별자리 안 별 번호]. `dimmest[g]`는 별자리 g의 가장 어두운 별 번호 */
export function layoutOrder(
  groups: number,
  size: number,
  layout: BoardLayout,
  dimmest: readonly number[] = [],
): [number, number][] {
  const order: [number, number][] = [];
  const kind =
    layout === "split" && (groups !== 8 || size !== 3) ? "grouped" : layout;
  if (kind === "grouped") {
    for (let g = 0; g < groups; g++)
      for (let i = 0; i < size; i++) order.push([g, i]);
    return order;
  }
  if (kind === "spread") {
    for (let i = 0; i < size; i++)
      for (let g = 0; g < groups; g++) order.push([g, i]);
    return order;
  }
  const kept = (g: number) =>
    [0, 1, 2].filter((i) => i !== (dimmest[g] ?? 2)) as [number, number];
  const moved = (g: number) => dimmest[g] ?? 2;
  for (let s = 0; s < 4; s++) {
    const a = 2 * s;
    const b = a + 1;
    const o = 2 * ((s + 2) % 4);
    const [a0, a1] = kept(a);
    const [b0, b1] = kept(b);
    order.push(
      [a, a0],
      [a, a1],
      [o, moved(o)],
      [o + 1, moved(o + 1)],
      [b, b0],
      [b, b1],
    );
  }
  return order;
}

/**
 * 하늘에서 판을 만든다. `constellations`에서 하늘이 적은 별자리를 찾아 배치(`layout`)대로 별 칸에 놓는다.
 * 별자리마다 별 수가 같아야 하고 모두 합쳐 24개여야 한다(8 × 3 또는 12 × 2)
 */
export function buildBoard(
  sky: GalaxySky,
  constellations: readonly GalaxyConstellation[],
  layout: BoardLayout = "split",
): GalaxyBoard {
  const chosen = sky.constellations.map((id) => {
    const found = constellations.find((c) => c.id === id);
    if (!found) throw new Error(`하늘 ${sky.id}의 별자리 ${id} 자료가 없다`);
    return found;
  });
  const size = chosen[0]?.stars.length ?? 0;
  if (size < 2 || chosen.some((c) => c.stars.length !== size))
    throw new Error(`하늘 ${sky.id}의 별자리마다 별 수가 같아야 한다`);
  if (size * chosen.length !== STAR_COUNT)
    throw new Error(`하늘 ${sky.id}의 별은 모두 24개여야 한다`);
  const ids = new Set(chosen.flatMap((c) => c.stars.map((s) => s.id)));
  if (ids.size !== STAR_COUNT)
    throw new Error(`하늘 ${sky.id}에 겹치는 별이 있다`);

  const magnitudes = chosen.map((c) =>
    combinedMagnitude(c.stars.map((s) => s.mag)),
  );
  // 밝은 차례(등급이 작은 차례). 같으면 판 차례가 앞인 쪽이 앞.
  const order = chosen
    .map((_, i) => i)
    .sort(
      (a, b) => (magnitudes[a] as number) - (magnitudes[b] as number) || a - b,
    );
  const ranks: number[] = [];
  order.forEach((groupIndex, rank) => {
    ranks[groupIndex] = rank;
  });

  const squares: BoardSquare[] = Array.from({ length: BOARD_SIZE }, (_, i) => ({
    index: i,
    kind: kindOf(i),
    side: sideOf(i),
    star: null,
  }));
  const dimmest = chosen.map((c) => {
    let at = 0;
    c.stars.forEach((s, i) => {
      if (s.mag > (c.stars[at] as GalaxyStar).mag) at = i;
    });
    return at;
  });
  const slots = layoutOrder(chosen.length, size, layout, dimmest);
  const slotOf = new Map<string, number>();
  slots.forEach(([g, i], k) => {
    slotOf.set(`${g}:${i}`, STAR_SQUARES[k] as number);
  });
  const groups: BoardGroup[] = [];
  let total = 0;
  chosen.forEach((c, g) => {
    const rank = ranks[g] as number;
    const base = baseValue(rank, chosen.length);
    let brightestIndex = 0;
    c.stars.forEach((s, i) => {
      if (s.mag < (c.stars[brightestIndex] as GalaxyStar).mag)
        brightestIndex = i;
    });
    const groupSquares: number[] = [];
    c.stars.forEach((s, i) => {
      const square = slotOf.get(`${g}:${i}`) as number;
      const brightest = i === brightestIndex;
      const value = base + (brightest ? NUMBERS.brightestBonus : 0);
      total += value;
      (squares[square] as BoardSquare).star = {
        square,
        star: s,
        group: g,
        value,
        brightest,
      };
      groupSquares.push(square);
    });
    groupSquares.sort((x, y) => x - y);
    groups.push({
      id: c.id,
      ko: c.ko,
      season: c.season,
      squares: groupSquares,
      home: homeSide(groupSquares),
      magnitude: magnitudes[g] as number,
      rank,
      base,
      levelCost: round10(base, NUMBERS.levelCost),
    });
  });
  return { skyId: sky.id, skyKo: sky.ko, squares, groups, total };
}

/** 별자리 칸들의 제 변: 가장 많은 별이 선 변(같으면 앞 칸의 변) */
function homeSide(squares: readonly number[]): number {
  const count = [0, 0, 0, 0];
  for (const sq of squares) {
    const side = sideOf(sq);
    if (side !== null) count[side] = (count[side] ?? 0) + 1;
  }
  let best = sideOf(squares[0] ?? 1) ?? 0;
  count.forEach((n, side) => {
    if (n > (count[best] ?? 0)) best = side;
  });
  return best;
}

/** 이 칸의 별(별 칸이 아니면 null) */
export function starAt(board: GalaxyBoard, square: number): BoardStar | null {
  return board.squares[square]?.star ?? null;
}

/** 이 칸이 속한 별자리(별 칸이 아니면 null) */
export function groupAt(board: GalaxyBoard, square: number): BoardGroup | null {
  const star = starAt(board, square);
  return star ? (board.groups[star.group] ?? null) : null;
}

/** 이 변의 첫 별 칸 */
export function firstStarOfSide(side: number): number {
  return (((side % 4) + 4) % 4) * 8 + 1;
}
