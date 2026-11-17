/*
 * 킹+룩 둘 대 킹(docs/23 「기본 엔드게임」 사다리 메이트). 수 배우기 연습에서 흑 킹이 버티는 수를 고르고,
 * 단원의 방법이 정해진 수 안에 메이트하는지 시험이 확인하는 데 쓴다.
 * 판 수가 64⁴로 퀸·룩 하나(`kxk.ts`)처럼 메이트 거리 표를 만들기에는 커서, 흑은 짧은 깊이 탐색으로 버틴다.
 * - 지켜지지 않은 룩을 잡을 수 있으면 잡는다(킹+룩 대 킹이 되어 연습은 실패)
 * - 아니면 백이 한 수 안에 메이트할 수 없는 수, 그것도 없으면 두 수 안에 메이트할 수 없는 수를 먼저 고른다
 * - 같으면 가장자리 줄에서 먼 칸, 그다음 가운데에 가까운 칸, 그다음 칸 번호가 작은 칸(늘 같은 수)
 * 칸 번호는 엔진과 같다(y*8+x, a8=0·h1=63). 룩 두 개는 `p`·`q`로 부르고 서로 바꿔도 같은 판이다.
 */

/** 판: 백 킹·흑 킹·백 룩 둘 자리. 잡힌 룩은 -1 */
export interface KrrkBoard {
  wk: number;
  bk: number;
  p: number;
  q: number;
}

const xy = (i: number) => [i & 7, i >> 3] as const;

const near = (a: number, b: number) => {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 1;
};

const KING_STEPS: number[][] = Array.from({ length: 64 }, (_, i) => {
  const [x, y] = xy(i);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) out.push(ny * 8 + nx);
    }
  return out;
});

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** 룩(r)이 이 칸을 노리나. `blockers`의 칸에 닿으면 그 너머는 못 노린다 */
function rookSees(r: number, at: number, blockers: readonly number[]) {
  if (r < 0 || r === at) return false;
  const [rx, ry] = xy(r);
  const [ax, ay] = xy(at);
  if (rx !== ax && ry !== ay) return false;
  const dx = Math.sign(ax - rx);
  const dy = Math.sign(ay - ry);
  let x = rx + dx;
  let y = ry + dy;
  while (x !== ax || y !== ay) {
    if (blockers.includes(y * 8 + x)) return false;
    x += dx;
    y += dy;
  }
  return true;
}

/**
 * 흑 킹이 이 칸에 설 수 없나(백 킹 옆이거나 룩이 노린다). 흑 킹은 움직이는 쪽이라 길을 막지 않는다.
 * `gone`은 흑 킹이 잡아 판에서 없어진 룩 자리
 */
function guarded(b: KrrkBoard, at: number, gone = -1): boolean {
  if (near(at, b.wk)) return true;
  const rooks = [b.p, b.q].filter((r) => r >= 0 && r !== gone);
  return rooks.some((r) =>
    rookSees(
      r,
      at,
      [b.wk, ...rooks.filter((o) => o !== r)].filter((o) => o !== at),
    ),
  );
}

/** 흑 킹이 체크를 받고 있나 */
export function krrkCheck(b: KrrkBoard): boolean {
  return [b.p, b.q].some(
    (r) => r >= 0 && rookSees(r, b.bk, [b.wk, b.p === r ? b.q : b.p]),
  );
}

/** 흑 킹의 수 하나: 갈 칸과, 그 수가 룩을 잡는가 */
export interface KrrkBlackMove {
  to: number;
  capture: boolean;
}

/** 흑 차례에 흑 킹이 둘 수 있는 수 */
export function krrkBlackMoves(b: KrrkBoard): KrrkBlackMove[] {
  const out: KrrkBlackMove[] = [];
  for (const to of KING_STEPS[b.bk] ?? []) {
    if (to === b.wk) continue;
    const capture = to === b.p || to === b.q;
    if (guarded(b, to, capture ? to : -1)) continue;
    out.push({ to, capture });
  }
  return out;
}

/** 백 차례에 둘 수 있는 수(킹이나 룩 하나를 옮긴다) */
export function krrkWhiteMoves(b: KrrkBoard): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const to of KING_STEPS[b.wk] ?? [])
    if (to !== b.p && to !== b.q && !near(to, b.bk))
      out.push({ from: b.wk, to });
  for (const r of [b.p, b.q]) {
    if (r < 0) continue;
    const [rx, ry] = xy(r);
    for (const [dx, dy] of DIRS) {
      let x = rx + dx;
      let y = ry + dy;
      while (x >= 0 && x < 8 && y >= 0 && y < 8) {
        const at = y * 8 + x;
        if (at === b.wk || at === b.bk || at === b.p || at === b.q) break;
        out.push({ from: r, to: at });
        x += dx;
        y += dy;
      }
    }
  }
  return out;
}

/** 백의 수를 둔 판 */
export function krrkWhitePlayed(
  b: KrrkBoard,
  move: { from: number; to: number },
): KrrkBoard {
  if (move.from === b.wk) return { ...b, wk: move.to };
  if (move.from === b.p) return { ...b, p: move.to };
  return { ...b, q: move.to };
}

/** 흑의 수를 둔 판(잡힌 룩은 -1) */
export function krrkBlackPlayed(b: KrrkBoard, to: number): KrrkBoard {
  return {
    ...b,
    bk: to,
    p: b.p === to ? -1 : b.p,
    q: b.q === to ? -1 : b.q,
  };
}

/** 흑 차례 판이 체크메이트인가 */
export function krrkMated(b: KrrkBoard): boolean {
  return krrkCheck(b) && krrkBlackMoves(b).length === 0;
}

/** 흑 차례 판이 스테일메이트인가(체크가 아닌데 둘 곳이 없다) */
export function krrkStalemate(b: KrrkBoard): boolean {
  return !krrkCheck(b) && krrkBlackMoves(b).length === 0;
}

/** 백 차례 판에서 백이 `n`수 안에 메이트할 수 있나(n은 1이나 2) */
function whiteMatesWithin(b: KrrkBoard, n: number): boolean {
  for (const m of krrkWhiteMoves(b)) {
    const a = krrkWhitePlayed(b, m);
    const replies = krrkBlackMoves(a);
    if (replies.length === 0) {
      if (krrkCheck(a)) return true;
      continue;
    }
    if (n <= 1) continue;
    if (replies.some((r) => r.capture)) continue;
    if (replies.every((r) => whiteMatesWithin(krrkBlackPlayed(a, r.to), n - 1)))
      return true;
  }
  return false;
}

/** 가장자리 줄에서 떨어진 정도(0이면 가장자리 줄) */
const fromEdge = (at: number) => {
  const [x, y] = xy(at);
  return Math.min(x, 7 - x, y, 7 - y);
};

/** 가운데(d4·d5·e4·e5)에서 떨어진 정도 */
const fromCenter = (at: number) => {
  const [x, y] = xy(at);
  return Math.abs(2 * x - 7) + Math.abs(2 * y - 7);
};

/**
 * 흑 킹이 버티는 수(흑 차례). 둘 수가 없으면 null. 같은 판이면 늘 같은 수다.
 * 룩을 잡을 수 있으면 잡고, 아니면 백이 한 수·두 수 안에 메이트하지 못하는 수를 먼저, 같으면 가장자리 줄에서 먼 칸
 */
export function krrkDefense(b: KrrkBoard): KrrkBlackMove | null {
  const moves = krrkBlackMoves(b);
  const capture = moves.find((m) => m.capture);
  if (capture) return capture;
  let best: KrrkBlackMove | null = null;
  let bestKey: number[] = [];
  for (const m of moves) {
    const after = krrkBlackPlayed(b, m.to);
    const safe = whiteMatesWithin(after, 1)
      ? 0
      : whiteMatesWithin(after, 2)
        ? 1
        : 2;
    const key = [safe, fromEdge(m.to), -fromCenter(m.to), -m.to];
    if (!best || compare(key, bestKey) > 0) {
      best = m;
      bestKey = key;
    }
  }
  return best;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}
