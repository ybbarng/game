/*
 * 기본 엔드게임 단원의 방법(docs/23 「기본 엔드게임」)을 그대로 옮긴 것. 단원 글(`endgame.ts`의 `ENDGAME_STEPS`)과
 * 한 단계씩 맞춘다. 퀸과 룩이 같은 방법을 쓴다(퀸은 줄을 좁힐 때 비스듬히도 갈 수 있다).
 * 단원은 "위에서부터 차례로 보고, 처음 맞는 단계의 수를 둔다"로 쓴다. 시험(`endgame-guide.test.ts`)이
 * 여러 시작 판에서 이 방법대로 두면 흑 킹이 가장 오래 버텨도(@game/chess-ai `kxkDefense`) 단원에 적은 수 안에
 * 메이트가 되고, 스테일메이트가 되지 않는지 본다. 연습 화면의 「힌트」·「수 보기」도 이 방법이 고른 수를 보인다.
 *
 * 낱말(단원 글과 같다)
 * - 막는 줄: 퀸·룩의 가로줄이나 세로줄 가운데, 내 킹과 흑 킹이 서로 반대쪽에 있는 줄
 * - 흑 킹 쪽: 막는 줄 너머 흑 킹이 있는 쪽. 「바로 너머 줄」은 막는 줄과 붙은 흑 킹 쪽 줄, 「바로 이쪽 줄」은 내 킹 쪽 줄
 * - 마주 보기: 두 킹이 같은 줄에서 한 칸 띄우고 선 것
 * 칸 번호는 엔진과 같다(y*8+x, a8=0·h1=63).
 */

import {
  type KxkPiece,
  kxkAttacks,
  kxkMated,
  kxkStalemate,
  kxkWhiteMoves,
} from "@game/chess-ai";

/** 판: 백 킹·흑 킹·백 퀸(또는 룩) 자리 */
export interface KxkBoard {
  wk: number;
  bk: number;
  p: number;
}

/** 단원의 단계(단원 글의 단계와 같은 차례) */
export type GuideRule =
  | "mate"
  | "rescue"
  | "cut"
  | "push"
  | "shrink"
  | "tempo"
  | "walk";

export interface GuideMove {
  from: number;
  to: number;
  rule: GuideRule;
}

/** 같은 값의 후보가 여럿일 때 고르는 법. 단원은 "어느 칸이든 괜찮다"고 쓰고, 시험은 앞·뒤 둘 다 본다 */
export type Tie = "first" | "last";

const xy = (i: number) => [i & 7, i >> 3] as const;
const kingSteps = (a: number, b: number) => {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
};
const near = (a: number, b: number) => kingSteps(a, b) <= 1;

/** 흑 킹이 퀸·룩을 잡을 수 있나(바로 옆인데 내 킹이 지키지 않는다) */
const hanging = (b: KxkBoard) => near(b.p, b.bk) && !near(b.p, b.wk);

/**
 * 판을 보는 방향. 흑 킹 쪽이 v가 작은 쪽이 되게 돌린다.
 * u는 막는 줄을 따라가는 좌표, v는 막는 줄과 엇갈리는 좌표
 */
type Frame = 0 | 1 | 2 | 3;
const FRAMES: readonly Frame[] = [0, 1, 2, 3];
function toFrame(f: Frame, at: number): [number, number] {
  const [x, y] = xy(at);
  if (f === 0) return [x, y];
  if (f === 1) return [x, 7 - y];
  if (f === 2) return [y, x];
  return [y, 7 - x];
}
function fromFrame(f: Frame, u: number, v: number): number {
  if (f === 0) return v * 8 + u;
  if (f === 1) return (7 - v) * 8 + u;
  if (f === 2) return u * 8 + v;
  return u * 8 + (7 - v);
}

function pick<T>(items: readonly T[], tie: Tie): T | undefined {
  return tie === "first" ? items[0] : items[items.length - 1];
}

/** 값이 가장 작은 후보들 */
function smallest<T>(items: readonly T[], score: (t: T) => number): T[] {
  let best = Number.POSITIVE_INFINITY;
  let out: T[] = [];
  for (const t of items) {
    const s = score(t);
    if (s < best) {
      best = s;
      out = [t];
    } else if (s === best) out.push(t);
  }
  return out;
}

type WhiteMove = ReturnType<typeof kxkWhiteMoves>[number];

/** 백의 수를 둔 판 */
export function whitePlayed(
  b: KxkBoard,
  move: { from: number; to: number },
): KxkBoard {
  return move.from === b.wk ? { ...b, wk: move.to } : { ...b, p: move.to };
}

const as = (m: WhiteMove, rule: GuideRule): GuideMove => ({
  from: m.from,
  to: m.to,
  rule,
});

/** 모든 단계에 붙는 조건: 퀸·룩을 흑 킹 옆에 지키지 않은 채 두지 않고, 체크도 스테일메이트도 만들지 않는다 */
function safeAfter(piece: KxkPiece, a: KxkBoard): boolean {
  return (
    !hanging(a) &&
    !kxkAttacks(piece, a.p, a.wk, a.bk) &&
    !kxkStalemate(piece, a.wk, a.bk, a.p)
  );
}

/** 퀸·룩과 같은 가로줄·세로줄인가(내 킹이 그 칸에 서면 막는 줄을 가린다) */
function onPieceLine(p: number, at: number): boolean {
  const [px, py] = xy(p);
  const [x, y] = xy(at);
  return px === x || py === y;
}

/** 막는 줄: 내 킹과 흑 킹이 서로 반대쪽에 있는 퀸·룩의 줄. 둘 다면 흑 킹 쪽이 좁은 줄. 없으면 null */
function cutOf(
  b: KxkBoard,
  tie: Tie = "first",
): { f: Frame; c: number } | null {
  let best: { f: Frame; c: number } | null = null;
  for (const f of FRAMES) {
    const [, rv] = toFrame(f, b.p);
    const [, bv] = toFrame(f, b.bk);
    const [, wv] = toFrame(f, b.wk);
    if (!(bv < rv && wv > rv)) continue;
    if (!best || rv < best.c || (tie === "last" && rv === best.c))
      best = { f, c: rv };
  }
  return best;
}

/**
 * 단원의 방법대로 둘 수(백 차례). 위에서부터 차례로 보고 처음 맞는 단계의 수를 둔다. 둘 수가 없으면 null.
 * 모든 단계에서 「퀸·룩을 흑 킹 옆에 지키지 않은 채 두는 수, 체크(1·4단계 말고), 스테일메이트가 되는 수」는 뺀다.
 * 1. 메이트가 되는 수가 있으면 둔다
 * 2. 퀸·룩이 흑 킹 옆인데 내 킹이 지키지 않으면: 막는 줄을 따라 흑 킹에서 가장 먼 칸으로(살리기)
 * 3. 막는 줄이 없으면: 퀸·룩을 두 킹 사이 줄로, 흑 킹 쪽이 가장 좁아지는 줄(자르기)
 * 4. 흑 킹이 바로 너머 줄에 있고, 내 킹이 바로 이쪽 줄에서 흑 킹과 마주 보면: 퀸·룩을 흑 킹이 있는 줄로 옮겨 체크(밀기).
 *    퀸·룩이 흑 킹과 두 칸 넘게 떨어져 있지 않으면 그 대신 막는 줄을 따라 가장 먼 칸으로(쉬기)
 * 5. 흑 킹이 막는 줄에서 두 줄 넘게 떨어져 있으면: 퀸·룩을 흑 킹 쪽으로 한 줄(좁히기).
 *    퀸은 바로 앞 칸이 안 되면 비스듬히 한 줄 앞 칸도 된다
 * 6. 흑 킹이 바로 너머 줄에 있고, 내 킹이 바로 이쪽 줄에서 마주 보기보다 한 칸 비껴 있으면: 막는 줄을 따라 가장 먼 칸으로(쉬기)
 * 7. 내 킹을 바로 이쪽 줄의 흑 킹 앞 칸(마주 볼 칸) 쪽으로 한 걸음(데려오기). 퀸·룩과 같은 줄 칸으로는 가지 않는다
 * 8. 그래도 둘 수가 없으면: 막는 줄을 따라 가장 먼 칸으로, 그것도 안 되면 퀸·룩을 흑 킹에서 가장 먼 칸으로(쉬기)
 * 막는 줄이 없을 때 3이 안 되면 7처럼 내 킹을 흑 킹 쪽으로 걷고, 그것도 안 되면 8
 */
export function guideMove(
  piece: KxkPiece,
  b: KxkBoard,
  tie: Tie = "first",
): GuideMove | null {
  const moves = kxkWhiteMoves(piece, b.wk, b.bk, b.p);
  const mate = pick(
    moves.filter((m) => {
      const a = whitePlayed(b, m);
      return kxkMated(piece, a.wk, a.bk, a.p);
    }),
    tie,
  );
  if (mate) return as(mate, "mate");

  const pieceMoves = moves.filter((m) => m.from === b.p);
  const cut = cutOf(b, tie);

  /** 막는 줄을 따라 흑 킹에서 가장 먼 칸 */
  const farEnd = (rule: GuideRule): GuideMove | null => {
    if (!cut) return null;
    const [bu] = toFrame(cut.f, b.bk);
    const along = pieceMoves.filter(
      (m) =>
        toFrame(cut.f, m.to)[1] === cut.c &&
        safeAfter(piece, whitePlayed(b, m)),
    );
    const far = pick(
      smallest(along, (m) => -Math.abs(toFrame(cut.f, m.to)[0] - bu)),
      tie,
    );
    return far ? as(far, rule) : null;
  };
  /** 퀸·룩을 흑 킹에서 가장 먼 칸으로 */
  const anySafe = (): GuideMove | null => {
    const hold = pieceMoves.filter((m) => safeAfter(piece, whitePlayed(b, m)));
    const wait = pick(
      smallest(hold, (m) => -kingSteps(m.to, b.bk)),
      tie,
    );
    return wait ? as(wait, "tempo") : null;
  };
  /** 내 킹을 목표 칸 쪽으로 한 걸음: 킹 걸음 수가 가장 적어지는 칸, 같으면 가로·세로 칸 수 합이 적은 칸 */
  const walk = (target: number): GuideMove | null => {
    const [tx, ty] = xy(target);
    const score = (at: number) => {
      const [x, y] = xy(at);
      return kingSteps(at, target) * 16 + Math.abs(x - tx) + Math.abs(y - ty);
    };
    const steps = moves.filter(
      (m) =>
        m.from === b.wk &&
        score(m.to) < score(b.wk) &&
        !onPieceLine(b.p, m.to) &&
        safeAfter(piece, whitePlayed(b, m)),
    );
    const step = pick(
      smallest(steps, (m) => score(m.to)),
      tie,
    );
    return step ? as(step, "walk") : null;
  };

  if (hanging(b)) {
    const run = farEnd("rescue");
    if (run) return run;
  }
  if (!cut) {
    const between = pieceMoves.filter((m) => {
      const a = whitePlayed(b, m);
      return cutOf(a, tie) !== null && safeAfter(piece, a);
    });
    const best = pick(
      smallest(between, (m) => cutOf(whitePlayed(b, m), tie)?.c ?? 99),
      tie,
    );
    if (best) return as(best, "cut");
    return walk(b.bk) ?? anySafe();
  }
  const { f, c } = cut;
  const [bu, bv] = toFrame(f, b.bk);
  const [wu, wv] = toFrame(f, b.wk);
  const [pu] = toFrame(f, b.p);
  if (bv === c - 1 && wv === c + 1 && wu === bu) {
    if (Math.abs(pu - bu) >= 2) {
      const check = pieceMoves.find((m) => m.to === fromFrame(f, pu, c - 1));
      if (check) return as(check, "push");
    }
    const run = farEnd("tempo");
    if (run) return run;
  }
  if (bv <= c - 2) {
    const ahead = [pu, ...(piece === "Q" ? [pu - 1, pu + 1] : [])]
      .filter((u) => u >= 0 && u <= 7)
      .map((u) => pieceMoves.find((m) => m.to === fromFrame(f, u, c - 1)))
      .filter(
        (m): m is WhiteMove =>
          m !== undefined && safeAfter(piece, whitePlayed(b, m)),
      );
    const down =
      ahead.find((m) => toFrame(f, m.to)[0] === pu) ??
      pick(
        smallest(ahead, (m) => -Math.abs(toFrame(f, m.to)[0] - bu)),
        tie,
      );
    if (down) return as(down, "shrink");
  }
  if (bv === c - 1 && wv === c + 1 && Math.abs(wu - bu) === 1) {
    const run = farEnd("tempo");
    if (run) return run;
  }
  return walk(fromFrame(f, bu, c + 1)) ?? farEnd("tempo") ?? anySafe();
}
