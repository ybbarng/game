/*
 * 킹+퀸 대 킹, 킹+룩 대 킹 메이트 거리 표(docs/23 「기본 엔드게임」). 수 배우기 연습에서 흑 킹이
 * 가장 오래 버티는 수를 고르고, 단원의 방법이 정해진 수 안에 메이트하는지 시험이 확인하는 데 쓴다.
 * 메이트된 판에서 거꾸로 한 수씩 넓혀 가며 판마다 「백이 몇 수 만에 메이트하나」를 정확히 채운다
 * (널리 쓰는 엔드게임 표 만드는 법, 거꾸로 두기). 판 수가 적어(64×64×64) 한 번 만드는 데 0.1초 남짓.
 * - 백 차례 판: 흑 차례 판 가운데 n수 만에 메이트되는 판으로 갈 수 있으면 n+1수
 * - 흑 차례 판: 모든 수가 백이 이기는 판으로 가면, 그 가운데 가장 긴 것만큼 진다
 * - 흑 킹이 지켜지지 않은 퀸·룩을 잡을 수 있으면 비긴다(킹 둘만 남는다). 둘 곳이 없는데 체크가 아니면 스테일메이트로 비긴다
 * 칸 번호는 엔진과 같다(y*8+x, a8=0·h1=63).
 */

/** 표가 다루는 백 기물 */
export type KxkPiece = "Q" | "R";

const xy = (i: number) => [i & 7, i >> 3] as const;

const near = (a: number, b: number) => {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 1;
};

/** 킹이 한 칸 갈 수 있는 곳 */
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

const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const QUEEN_DIRS = [...ROOK_DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

const dirsOf = (piece: KxkPiece) => (piece === "Q" ? QUEEN_DIRS : ROOK_DIRS);

/** 기물(p)에서 뻗는 칸들. `stop`에 닿으면 그 칸 앞에서 멈춘다(그 칸은 넣지 않는다) */
function rays(
  piece: KxkPiece,
  p: number,
  stop: (at: number) => boolean,
): number[] {
  const out: number[] = [];
  const [px, py] = xy(p);
  for (const [dx, dy] of dirsOf(piece)) {
    let x = px + dx;
    let y = py + dy;
    while (x >= 0 && x < 8 && y >= 0 && y < 8) {
      const at = y * 8 + x;
      if (stop(at)) break;
      out.push(at);
      x += dx;
      y += dy;
    }
  }
  return out;
}

/** 기물(p)이 이 칸을 노리나. 백 킹(wk)만 길을 막는다(흑 킹은 움직이는 쪽이라 빼고 본다) */
export function kxkAttacks(
  piece: KxkPiece,
  p: number,
  wk: number,
  at: number,
): boolean {
  if (at === p) return false;
  const [px, py] = xy(p);
  const [ax, ay] = xy(at);
  const dx = Math.sign(ax - px);
  const dy = Math.sign(ay - py);
  const straight = px === ax || py === ay;
  const diagonal = Math.abs(ax - px) === Math.abs(ay - py);
  if (!straight && !(piece === "Q" && diagonal)) return false;
  let x = px + dx;
  let y = py + dy;
  while (x !== ax || y !== ay) {
    if (y * 8 + x === wk) return false;
    x += dx;
    y += dy;
  }
  return true;
}

const index = (wk: number, bk: number, p: number) => (wk * 64 + bk) * 64 + p;

/** 판 세 칸이 모두 다르고 킹끼리 붙지 않았나 */
const placeable = (wk: number, bk: number, p: number) =>
  wk !== bk && wk !== p && bk !== p && !near(wk, bk);

/** 흑 킹의 수 하나: 갈 칸과, 그 수가 퀸·룩을 잡는가 */
export interface KxkBlackMove {
  to: number;
  capture: boolean;
}

/** 흑 차례에 흑 킹이 둘 수 있는 수 */
export function kxkBlackMoves(
  piece: KxkPiece,
  wk: number,
  bk: number,
  p: number,
): KxkBlackMove[] {
  const out: KxkBlackMove[] = [];
  for (const to of KING_STEPS[bk] ?? []) {
    if (near(to, wk)) continue;
    if (to === p) {
      out.push({ to, capture: true });
      continue;
    }
    if (kxkAttacks(piece, p, wk, to)) continue;
    out.push({ to, capture: false });
  }
  return out;
}

/** 백 차례에 둘 수 있는 수: 킹이나 기물이 옮긴 뒤의 판 */
export function kxkWhiteMoves(
  piece: KxkPiece,
  wk: number,
  bk: number,
  p: number,
): { from: number; to: number; wk: number; p: number }[] {
  const out: { from: number; to: number; wk: number; p: number }[] = [];
  for (const to of KING_STEPS[wk] ?? [])
    if (to !== p && !near(to, bk)) out.push({ from: wk, to, wk: to, p });
  for (const to of rays(piece, p, (at) => at === wk || at === bk))
    out.push({ from: p, to, wk, p: to });
  return out;
}

export interface KxkTable {
  piece: KxkPiece;
  /** 백 차례 판: 백이 메이트할 때까지 백의 수. 0이면 이기지 못하거나 놓일 수 없는 판 */
  white: Uint8Array;
  /** 흑 차례 판: 메이트까지 남은 백의 수 + 1(지금 메이트된 판은 1). 0이면 흑이 지지 않는다 */
  black: Uint8Array;
}

const tables = new Map<KxkPiece, KxkTable>();

/** 표를 만든다(기물마다 한 번만) */
export function kxkTable(piece: KxkPiece): KxkTable {
  const cached = tables.get(piece);
  if (cached) return cached;
  const size = 64 * 64 * 64;
  const white = new Uint8Array(size);
  const black = new Uint8Array(size);
  // 흑 차례 판마다 아직 백이 이기는지 모르는 흑의 수. -1은 이미 정해졌거나(비김·짐) 놓일 수 없는 판
  const left = new Int8Array(size).fill(-1);
  // 백 차례 판이 놓일 수 있나(흑 킹이 체크를 받고 있으면 백 차례일 수 없다)
  const whiteOk = new Uint8Array(size);
  let queue: number[] = [];
  for (let wk = 0; wk < 64; wk++)
    for (let bk = 0; bk < 64; bk++)
      for (let p = 0; p < 64; p++) {
        if (!placeable(wk, bk, p)) continue;
        const i = index(wk, bk, p);
        const check = kxkAttacks(piece, p, wk, bk);
        if (!check) whiteOk[i] = 1;
        const moves = kxkBlackMoves(piece, wk, bk, p);
        if (moves.some((m) => m.capture)) continue; // 잡으면 비긴다
        if (moves.length === 0) {
          if (check) {
            black[i] = 1;
            queue.push(i);
          }
          continue; // 체크가 아니면 스테일메이트
        }
        left[i] = moves.length;
      }
  // 메이트까지 수가 적은 판부터 거꾸로 넓힌다. 한 겹씩 처리해 처음 닿은 값이 가장 짧은 수가 된다
  while (queue.length > 0) {
    const next: number[] = [];
    for (const i of queue) {
      const n = (black[i] as number) - 1; // 이 흑 차례 판에서 메이트까지 백의 수
      const p = i & 63;
      const bk = (i >> 6) & 63;
      const wk = i >> 12;
      // 이 판으로 오는 백의 수(킹이나 기물을 거꾸로 옮긴다)
      const preds: number[] = [];
      for (const s of KING_STEPS[wk] ?? [])
        if (s !== p && s !== bk && !near(s, bk)) preds.push(index(s, bk, p));
      for (const s of rays(piece, p, (at) => at === wk || at === bk))
        preds.push(index(wk, bk, s));
      for (const j of preds) {
        if (!whiteOk[j] || white[j] !== 0) continue;
        white[j] = n + 1;
        // 이 백 차례 판으로 오는 흑의 수
        const jp = j & 63;
        const jbk = (j >> 6) & 63;
        const jwk = j >> 12;
        for (const s of KING_STEPS[jbk] ?? []) {
          if (s === jwk || s === jp || near(s, jwk)) continue;
          const k = index(jwk, s, jp);
          if ((left[k] as number) <= 0) continue;
          left[k] = (left[k] as number) - 1;
          if (left[k] === 0) {
            black[k] = n + 2;
            next.push(k);
          }
        }
      }
    }
    queue = next;
  }
  const table = { piece, white, black };
  tables.set(piece, table);
  return table;
}

/** 백 차례 판에서 백이 메이트할 때까지 백의 수. 이기지 못하면 null */
export function kxkWhiteDistance(
  piece: KxkPiece,
  wk: number,
  bk: number,
  p: number,
): number | null {
  const d = kxkTable(piece).white[index(wk, bk, p)] ?? 0;
  return d === 0 ? null : d;
}

/** 흑 차례 판에서 메이트까지 남은 백의 수(지금 메이트면 0). 흑이 지지 않으면 null */
export function kxkBlackDistance(
  piece: KxkPiece,
  wk: number,
  bk: number,
  p: number,
): number | null {
  const d = kxkTable(piece).black[index(wk, bk, p)] ?? 0;
  return d === 0 ? null : d - 1;
}

/** 가운데(d4·d5·e4·e5)에서 떨어진 정도. 같은 값이면 가운데 쪽 칸을 고른다 */
const fromCenter = (at: number) => {
  const [x, y] = xy(at);
  return Math.abs(2 * x - 7) + Math.abs(2 * y - 7);
};

/**
 * 흑 킹이 가장 오래 버티는 수. 둘 수가 없으면 null.
 * - 지켜지지 않은 퀸·룩을 잡을 수 있으면 잡는다(비긴다)
 * - 백이 이기지 못하는 판으로 가는 수가 있으면 그 수
 * - 모두 지면 메이트까지 가장 먼 수. 같으면 가운데에 가까운 칸, 그래도 같으면 칸 번호가 작은 쪽(늘 같은 수)
 */
export function kxkDefense(
  piece: KxkPiece,
  wk: number,
  bk: number,
  p: number,
): KxkBlackMove | null {
  const moves = kxkBlackMoves(piece, wk, bk, p);
  const capture = moves.find((m) => m.capture);
  if (capture) return capture;
  let best: KxkBlackMove | null = null;
  let bestScore = -1;
  for (const m of moves) {
    const d = kxkWhiteDistance(piece, wk, m.to, p);
    const score = d === null ? 1000 : d;
    if (
      !best ||
      score > bestScore ||
      (score === bestScore &&
        (fromCenter(m.to) < fromCenter(best.to) ||
          (fromCenter(m.to) === fromCenter(best.to) && m.to < best.to)))
    ) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

/** 흑 차례 판이 스테일메이트인가(체크가 아닌데 둘 곳이 없다) */
export function kxkStalemate(
  piece: KxkPiece,
  wk: number,
  bk: number,
  p: number,
): boolean {
  return (
    !kxkAttacks(piece, p, wk, bk) &&
    kxkBlackMoves(piece, wk, bk, p).length === 0
  );
}

/** 흑 차례 판이 체크메이트인가 */
export function kxkMated(
  piece: KxkPiece,
  wk: number,
  bk: number,
  p: number,
): boolean {
  return (
    kxkAttacks(piece, p, wk, bk) && kxkBlackMoves(piece, wk, bk, p).length === 0
  );
}
