/*
 * 킹+폰 대 킹(백 폰 하나) 승패표. 킹과 폰 끝내기 문제(docs/26 6절)가 "이기는 수가 하나뿐"인지 확인하고,
 * 초고수가 이 끝내기를 정확히 두는 데 쓴다(2026-11-03 웹에서 chess-ai로 옮겼다).
 * 판마다 이기나(백이 폰을 퀸으로 무사히 바꾼다) 비기나를 끝에서부터 거꾸로 채운다(널리 쓰는 KPK 표 만드는 법).
 * - 백 차례: 폰이 끝줄에 닿고 흑 킹이 그 칸을 잡을 수 없으면(멀거나 백 킹이 지키면) 이긴다.
 *   다음 판 가운데 하나라도 이기면 이긴다. 모두 비기면 비긴다
 * - 흑 차례: 폰을 잡을 수 있으면 비긴다. 둘 수가 없으면 체크일 때 짐(메이트), 아니면 비김(스테일메이트).
 *   다음 판 가운데 하나라도 비기면 비긴다. 모두 이기면(백이) 이긴다
 * - 끝까지 정해지지 않은 판은 비긴다
 * 칸 번호는 엔진과 같다(y*8+x, a8=0·h1=63). 백 폰은 y가 줄어드는 쪽으로 간다.
 */

const UNKNOWN = 0;
const WIN = 1;
const DRAW = 2;
const INVALID = 3;

type Side = 0 | 1;

const xy = (i: number) => [i % 8, i >> 3] as const;
const near = (a: number, b: number) => {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 1;
};

/** 킹이 한 칸 갈 수 있는 곳 */
const KING_STEPS: number[][] = Array.from({ length: 64 }, (_, i) => {
  const [x, y] = xy(i);
  const out: number[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) out.push(ny * 8 + nx);
    }
  return out;
});

/** 백 폰(p)이 이 칸을 노리나 */
function pawnAttacks(p: number, at: number): boolean {
  const [px, py] = xy(p);
  const [ax, ay] = xy(at);
  return ay === py - 1 && Math.abs(ax - px) === 1;
}

const index = (stm: Side, wk: number, bk: number, p: number) =>
  ((stm * 64 + wk) * 64 + bk) * 64 + p;

/** 백 차례에 둘 수 있는 수: [옮긴 뒤 wk, p] 또는 "promote"(무사히 승급) */
function whiteMoves(wk: number, bk: number, p: number) {
  const out: { wk: number; p: number }[] = [];
  let promotes = false;
  for (const to of KING_STEPS[wk] ?? [])
    if (to !== p && !near(to, bk)) out.push({ wk: to, p });
  const one = p - 8;
  if (one !== wk && one !== bk) {
    if (one < 8) {
      // 승급 칸을 흑 킹이 잡을 수 없으면 이긴다(멀거나, 백 킹이 지킨다)
      if (!near(one, bk) || near(one, wk)) promotes = true;
    } else {
      out.push({ wk, p: one });
      const two = p - 16;
      if (p >> 3 === 6 && two !== wk && two !== bk) out.push({ wk, p: two });
    }
  }
  return { out, promotes };
}

let table: Uint8Array | null = null;

/** 승패표를 만든다(한 번만, 약 0.3초) */
export function kpkTable(): Uint8Array {
  if (table) return table;
  const t = new Uint8Array(2 * 64 * 64 * 64);
  // 놓일 수 없는 판 표시
  for (let stm = 0 as Side; stm <= 1; stm = (stm + 1) as Side)
    for (let wk = 0; wk < 64; wk++)
      for (let bk = 0; bk < 64; bk++)
        for (let p = 0; p < 64; p++) {
          const py = p >> 3;
          const bad =
            py === 0 ||
            py === 7 ||
            wk === bk ||
            wk === p ||
            bk === p ||
            near(wk, bk) ||
            // 백 차례인데 흑 킹이 체크를 받고 있을 수는 없다
            (stm === 0 && pawnAttacks(p, bk));
          if (bad) t[index(stm, wk, bk, p)] = INVALID;
        }
  let changed = true;
  while (changed) {
    changed = false;
    for (let wk = 0; wk < 64; wk++)
      for (let bk = 0; bk < 64; bk++)
        for (let p = 8; p < 56; p++) {
          // 백 차례
          const wi = index(0, wk, bk, p);
          if (t[wi] === UNKNOWN) {
            const { out, promotes } = whiteMoves(wk, bk, p);
            let result = promotes ? WIN : DRAW;
            if (!promotes)
              for (const m of out) {
                const r = t[index(1, m.wk, bk, m.p)];
                if (r === WIN) {
                  result = WIN;
                  break;
                }
                if (r === UNKNOWN) result = UNKNOWN;
              }
            if (result !== UNKNOWN) {
              t[wi] = result;
              changed = true;
            }
          }
          // 흑 차례
          const bi = index(1, wk, bk, p);
          if (t[bi] === UNKNOWN) {
            let result: number = WIN;
            let moves = 0;
            for (const to of KING_STEPS[bk] ?? []) {
              if (near(to, wk) || pawnAttacks(p, to)) continue;
              moves++;
              if (to === p) {
                result = DRAW;
                break;
              }
              const r = t[index(0, wk, to, p)];
              if (r === DRAW) {
                result = DRAW;
                break;
              }
              if (r === UNKNOWN) result = UNKNOWN;
            }
            if (moves === 0) result = pawnAttacks(p, bk) ? WIN : DRAW;
            if (result !== UNKNOWN) {
              t[bi] = result;
              changed = true;
            }
          }
        }
  }
  // 정해지지 않은 판은 비긴다
  for (let i = 0; i < t.length; i++) if (t[i] === UNKNOWN) t[i] = DRAW;
  table = t;
  return t;
}

/** 백 차례(stm 0)나 흑 차례(1)에 이 판이 백의 승리인가 */
export function kpkWins(stm: Side, wk: number, bk: number, p: number): boolean {
  return kpkTable()[index(stm, wk, bk, p)] === WIN;
}

/** 백 차례에 이기는 수들(옮긴 칸 쌍). 승급 수는 to가 끝줄 칸 */
export function kpkWinningMoves(
  wk: number,
  bk: number,
  p: number,
): { from: number; to: number }[] {
  const { out, promotes } = whiteMoves(wk, bk, p);
  const wins: { from: number; to: number }[] = [];
  if (promotes) wins.push({ from: p, to: p - 8 });
  for (const m of out)
    if (kpkWins(1, m.wk, bk, m.p))
      wins.push(m.wk !== wk ? { from: wk, to: m.wk } : { from: p, to: m.p });
  return wins;
}
