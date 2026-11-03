import { type GalaxyBoard, SKIES } from "@game/galaxy-engine";

/**
 * 판 가운데 하늘 그림(docs/48 5-4, 7-1). 9 × 9 판의 가운데 7 × 7이 하늘이고(칸 하나 = 100), 별자리 여덟을
 * 실제 별자리 선(d3-celestial, 자료 `lines`·`extra`)으로 그린다. 별자리마다 3 × 3 자리 가운데 바깥 여덟 칸에
 * 하나씩 두고(그 별자리 칸이 있는 변 쪽), 가운데 칸에는 주사위와 계절 이름이 뜬다.
 * 좌표는 별자리마다 따로 맞춘다(실제 하늘의 서로 먼 거리는 줄인다). 동쪽이 왼쪽(올려다본 하늘).
 */

export interface SkyPoint {
  x: number;
  y: number;
}

export interface GroupArt {
  group: number;
  /** 그림 자리의 가운데(하늘 좌표 0~700) */
  center: SkyPoint;
  /** 이름을 둘 자리 */
  label: SkyPoint;
  /** 별자리 선 토막(차례로 이으면 그림이 된다) */
  segments: [SkyPoint, SkyPoint][];
  /** 선 위의 다른 별(흐린 점) */
  extra: (SkyPoint & { mag: number })[];
  /** 판 위 별 칸 → 그 별의 자리 */
  stars: Map<number, SkyPoint>;
}

/** 하늘 한 변(px 아닌 하늘 좌표) */
export const SKY_SIZE = 700;
/** 별자리 하나가 차지하는 네모 */
const BOX = 196;
const SLOT = SKY_SIZE / 3;

/**
 * 별자리 순서(판 차례)대로 놓을 자리(3 × 3 가운데 바깥 여덟). 판은 오른쪽 아래 우주국에서 시작해
 * 아래 변 → 왼쪽 → 위 → 오른쪽으로 돌므로 같은 방향으로 놓는다
 */
const RING: readonly [number, number][] = [
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
];

/** 이 변의 이름 자리를 판 바깥쪽으로 둔다(가운데 주사위와 겹치지 않게) */
function ringSlot(index: number, count: number): [number, number] {
  if (count === RING.length) return RING[index] as [number, number];
  // 별자리 수가 다르면(황도 12궁 등) 링을 고르게 나눠 가장 가까운 자리
  const at = Math.floor((index * RING.length) / count);
  return RING[at] as [number, number];
}

const cache = new Map<string, GroupArt[]>();

/** 판의 별자리 그림 자리(같은 판이면 같은 값) */
export function skyArt(board: GalaxyBoard): GroupArt[] {
  const hit = cache.get(board.skyId);
  if (hit) return hit;
  const sky = SKIES.get(board.skyId);
  const art = board.groups.map((group, g): GroupArt => {
    const data = sky?.board.find((c) => c.id === group.id);
    const lines = data?.lines ?? [];
    const raw: [number, number][] = [
      ...lines.flat(),
      ...(data?.stars.map((s) => [s.ra, s.dec] as [number, number]) ?? []),
    ];
    const ra0 = raw[0]?.[0] ?? 0;
    // 적경이 0도를 넘나드는 별자리(페가수스·안드로메다)를 한쪽으로 펴서 잰다
    const unwrap = (ra: number) => {
      let d = ra - ra0;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      return d;
    };
    const decs = raw.map((p) => p[1]);
    const dec0 = decs.length ? (Math.min(...decs) + Math.max(...decs)) / 2 : 0;
    const cos = Math.cos((dec0 * Math.PI) / 180);
    const flat = (ra: number, dec: number): [number, number] => [
      -unwrap(ra) * cos,
      -dec,
    ];
    const pts = raw.map(([ra, dec]) => flat(ra, dec));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const scale = BOX / span;
    const [col, row] = ringSlot(g, board.groups.length);
    const center = { x: SLOT * (col + 0.5), y: SLOT * (row + 0.5) };
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const place = (ra: number, dec: number): SkyPoint => {
      const [x, y] = flat(ra, dec);
      return {
        x: center.x + (x - midX) * scale,
        y: center.y + (y - midY) * scale,
      };
    };
    const segments: [SkyPoint, SkyPoint][] = [];
    for (const line of lines)
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1] as [number, number];
        const b = line[i] as [number, number];
        segments.push([place(a[0], a[1]), place(b[0], b[1])]);
      }
    const stars = new Map<number, SkyPoint>();
    group.squares.forEach((sq) => {
      const star = board.squares[sq]?.star?.star;
      if (star) stars.set(sq, place(star.ra, star.dec));
    });
    const bottom = row === 2;
    return {
      group: g,
      center,
      label: {
        x: center.x,
        y: bottom ? center.y + BOX / 2 + 4 : center.y - BOX / 2 - 2,
      },
      segments,
      extra: (data?.extra ?? []).map((e) => ({
        ...place(e.ra, e.dec),
        mag: e.mag,
      })),
      stars,
    };
  });
  cache.set(board.skyId, art);
  return art;
}

/** 판의 9 × 9 자리(열, 행). 0은 오른쪽 아래, 아래 변을 왼쪽으로 → 왼쪽 변 위로 → 위 변 오른쪽으로 → 오른쪽 변 아래로 */
export function cellOf(square: number): { col: number; row: number } {
  const i = ((square % 32) + 32) % 32;
  if (i <= 8) return { col: 8 - i, row: 8 };
  if (i <= 16) return { col: 0, row: 8 - (i - 8) };
  if (i <= 24) return { col: i - 16, row: 0 };
  return { col: 8, row: i - 24 };
}

/** 칸 가운데(판 좌표, 칸 하나 = 1) */
export function squareCenter(square: number): { x: number; y: number } {
  const { col, row } = cellOf(square);
  return { x: col + 0.5, y: row + 0.5 };
}
