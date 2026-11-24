/*
 * 기본 엔드게임 「킹과 폰으로 퀸 만들기」 단원의 방법(docs/23 「기본 엔드게임」 킹과 폰). 단원 글(`pawn-lesson.ts`)과
 * 한 단계씩 맞춘다. 판은 백 킹·흑 킹·백 폰 셋이고, 폰이 흑 킹에게 잡히지 않고 끝줄에서 퀸이 되면 성공이다.
 * 단원은 "위에서부터 차례로 보고, 처음 맞는 단계의 수를 둔다"로 쓴다.
 * 시험(`pawn-guide.test.ts`)이 쓰는 범위의 판(b~g폰. 흑 킹이 폰의 사각형 밖이거나, 폰이 4번째 가로줄 이상이고
 * 내 킹이 이기는 칸에 있는 판) 모두에서 이 방법대로 두면 흑이 어떻게 받아도 퀸이 되는지 본다.
 *
 * 낱말(단원 글과 같다)
 * - 폰의 사각형: 폰 칸과 승급 칸을 한 변으로 하는 정사각형. 백 차례에 흑 킹이 그 밖이면 폰만 밀어도 따라잡지 못한다
 * - 이기는 칸: 내 킹이 서면 흑이 어떻게 받아도 이기는 칸(`keySquares`). 「이기는 칸이나 그보다 앞」은 `inKeyZone`
 * - 앞: 백 폰이 나아가는 쪽(8번째 가로줄 쪽)
 * - 마주 보기: 두 킹이 같은 세로줄에서 한 칸 띄우고 선 것(흑 킹이 앞쪽)
 * 칸 번호는 엔진과 같다(y*8+x, a8=0·h1=63). 백 폰은 y가 줄어드는 쪽(앞)으로 간다.
 *
 * 방법을 만든 길(2026-11-24): 처음에는 「킹이 폰 앞에 서면」 같은 경험칙을 쌓았지만 낮은 폰에서 새 구멍이 계속 났다.
 * 이기는 칸(핵심 칸) 이론으로 다시 짜고, 승패표로 범위 안 판을 모두 따라가며 실패한 판의 이기는 수를 보고 고쳤다.
 * 단계를 하나씩 빼 보아 없어도 되는 것(폰이 잡히려 할 때 지키기, 흑 킹이 뒤에 있을 때 폰 밀기, 폰 앞 칸 지키기)은 뺐다.
 * 폰이 2·3번째 가로줄이고 사각형 안이면 맞서기 싸움이 길어 이 방법으로 닫히지 않아 범위에서 뺐다(「킹과 폰」 문제 묶음이 맡는다).
 */

import { kpkBlackMoves, kxkStalemate } from "@game/chess-ai";

import type { KxkBoard, Tie } from "./endgame-guide";

/** 단원의 단계(단원 글의 단계와 같은 차례) */
export type PawnRule =
  | "queen"
  | "run"
  | "together"
  | "unstale"
  | "forward"
  | "wait"
  | "aside"
  | "beside"
  | "approach";

export interface PawnMove {
  from: number;
  to: number;
  rule: PawnRule;
}

const xy = (i: number) => [i & 7, i >> 3] as const;
const kingSteps = (a: number, b: number) => {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
};
const near = (a: number, b: number) => kingSteps(a, b) <= 1;

/** 내 킹이 갈 수 있는 칸(흑 킹 바로 옆·폰 칸은 못 간다) */
function kingMoves(b: KxkBoard): number[] {
  const out: number[] = [];
  const [x, y] = xy(b.wk);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx > 7 || ny < 0 || ny > 7) continue;
      const to = ny * 8 + nx;
      if (to === b.p || near(to, b.bk)) continue;
      out.push(to);
    }
  return out;
}

/** 폰이 갈 수 있는 칸(한 칸, 2번째 가로줄이면 두 칸도) */
function pawnMoves(b: KxkBoard): number[] {
  const one = b.p - 8;
  if (one < 0 || one === b.wk || one === b.bk) return [];
  const out = [one];
  const two = b.p - 16;
  if (b.p >> 3 === 6 && two !== b.wk && two !== b.bk) out.push(two);
  return out;
}

/** 백 차례에 둘 수 있는 수 */
export function pawnWhiteMoves(b: KxkBoard): { from: number; to: number }[] {
  return [
    ...kingMoves(b).map((to) => ({ from: b.wk, to })),
    ...pawnMoves(b).map((to) => ({ from: b.p, to })),
  ];
}

/** 백의 수를 둔 판 */
export function pawnPlayed(
  b: KxkBoard,
  m: { from: number; to: number },
): KxkBoard {
  return m.from === b.wk ? { ...b, wk: m.to } : { ...b, p: m.to };
}

/** 이 칸의 폰을 흑 킹이 잡을 수 있나(흑 킹 바로 옆인데 내 킹이 지키지 않는다) */
const loose = (b: KxkBoard, at: number) => near(at, b.bk) && !near(at, b.wk);

/** 흑 차례 판이 스테일메이트인가(폰이 체크하지 않는데 흑 킹이 갈 칸이 없다) */
export function pawnStalemate(b: KxkBoard): boolean {
  const check =
    b.bk >> 3 === (b.p >> 3) - 1 && Math.abs((b.bk & 7) - (b.p & 7)) === 1;
  return !check && kpkBlackMoves(b.wk, b.bk, b.p).length === 0;
}

/** 폰이 끝줄로 가 퀸이 되는 수가 무사한가(흑 킹이 퀸을 잡을 수 없고 스테일메이트도 아니다) */
export function safeQueen(b: KxkBoard, to: number): boolean {
  return to < 8 && !loose(b, to) && !kxkStalemate("Q", b.wk, b.bk, to);
}

/**
 * 폰의 사각형: 백 차례에 흑 킹이 사각형 밖이라 폰만 밀어도 따라잡지 못하나.
 * 사각형은 폰 칸부터 승급 칸까지를 한 변으로 한다. 2번째 가로줄 폰은 처음에 두 칸 가니 3번째 가로줄에서 센다
 */
export function outsideSquare(b: KxkBoard): boolean {
  const [px, py] = xy(b.p);
  const steps = py === 6 ? 5 : py;
  return kingSteps(b.bk, px) > steps;
}

/**
 * 폰의 이기는 칸(가장자리 a·h폰 말고). 폰이 2~4번째 가로줄이면 두 줄 앞 가로줄의 세 칸,
 * 5·6번째 가로줄이면 한 줄 앞과 두 줄 앞의 여섯 칸, 7번째 가로줄이면 폰 옆 줄의 7·8번째 가로줄 네 칸
 */
export function keySquares(p: number): number[] {
  const [px, py] = xy(p);
  const rank = 8 - py;
  const rows =
    rank <= 4 ? [py - 2] : rank <= 6 ? [py - 1, py - 2] : [py, py - 1];
  const out: number[] = [];
  for (const y of rows)
    for (let x = px - 1; x <= px + 1; x++) {
      if (x < 0 || x > 7 || y < 0) continue;
      if (rank === 7 && x === px) continue;
      if (y === py && x === px) continue;
      out.push(y * 8 + x);
    }
  return out;
}

/**
 * 내 킹이 이기는 칸이나 그보다 앞(폰 줄과 바로 옆 줄)에 있나. 7번째 가로줄 폰은 이기는 칸만 본다
 */
export function inKeyZone(p: number, wk: number): boolean {
  const [px, py] = xy(p);
  const [x, y] = xy(wk);
  const rank = 8 - py;
  if (rank === 7) return keySquares(p).includes(wk);
  const top = rank <= 4 ? py - 2 : py - 1;
  return Math.abs(x - px) <= 1 && y <= top;
}

function pick<T>(items: readonly T[], tie: Tie): T | undefined {
  return tie === "first" ? items[0] : items.at(-1);
}

/** 점수가 가장 작은 후보들 */
function lowest<T>(items: readonly T[], score: (t: T) => number): T[] {
  let min = Infinity;
  let out: T[] = [];
  for (const it of items) {
    const s = score(it);
    if (s < min) {
      min = s;
      out = [it];
    } else if (s === min) out.push(it);
  }
  return out;
}

/** 방법이 이 판에서 둘 수(백 차례). 둘 수가 없으면 null */
export function pawnGuide(b: KxkBoard, tie: Tie = "first"): PawnMove | null {
  const [px, py] = xy(b.p);
  const [wx, wy] = xy(b.wk);
  const [bx, by] = xy(b.bk);
  const pushes = pawnMoves(b);
  const one = pushes[0];
  /** 폰을 한 칸 밀어도 잡히지 않고 스테일메이트도 아니다 */
  const safePush =
    one !== undefined &&
    one >= 8 &&
    !loose({ ...b, p: one }, one) &&
    !pawnStalemate({ ...b, p: one });
  const pawn = (to: number, rule: PawnRule): PawnMove => ({
    from: b.p,
    to,
    rule,
  });
  const king = (list: number[], rule: PawnRule): PawnMove | null => {
    const to = pick(list, tie);
    return to === undefined ? null : { from: b.wk, to, rule };
  };
  // 늘 지킬 것: 폰을 잡히게 두지 않고, 스테일메이트를 만들지 않는다
  const kings = kingMoves(b).filter(
    (to) => !pawnStalemate({ ...b, wk: to }) && !loose({ ...b, wk: to }, b.p),
  );

  // 1. 퀸 되기
  if (one !== undefined && one < 8 && safeQueen(b, one))
    return pawn(one, "queen");
  // 2. 달리기: 흑 킹이 폰의 사각형 밖이고 폰 앞길에 내 킹이 없다
  if (
    one !== undefined &&
    one >= 8 &&
    !(wx === px && wy < py) &&
    outsideSquare(b)
  )
    return pawn(pushes.at(-1) as number, "run");
  // 3~7은 내 킹이 이기는 칸이나 그보다 앞에 있을 때만 본다
  if (inKeyZone(b.p, b.wk)) {
    // 3. 함께 나아가기: 폰을 밀어도 내 킹이 새 자리 폰의 이기는 칸이나 그 앞에 남으면 민다
    if (one !== undefined && one >= 8 && safePush && inKeyZone(one, b.wk))
      return pawn(one, "together");
    // 4. 스테일메이트 피하기: 폰을 밀면 스테일메이트라면 내 킹을 폰 바로 앞 칸으로
    if (
      one !== undefined &&
      one >= 8 &&
      kings.includes(one) &&
      !loose({ ...b, p: one }, one) &&
      pawnStalemate({ ...b, p: one })
    )
      return { from: b.wk, to: one, rule: "unstale" };
    // 5. 킹 앞으로: 폰이 한 칸 나아간 자리의 이기는 칸으로. 흑 킹과 마주 보는 칸 → 흑 킹과 세로줄이 먼 칸 → 앞 칸
    const next = one !== undefined && one >= 8 ? keySquares(one) : [];
    const into = kings.filter((to) => next.includes(to));
    const facing = into.filter((to) => (to & 7) === bx && by === (to >> 3) - 2);
    const move = king(
      facing.length > 0
        ? facing
        : lowest(into, (to) => -Math.abs((to & 7) - bx) * 8 + (to >> 3)),
      "forward",
    );
    if (move) return move;
    // 6. 쉬기: 흑 킹과 마주 보면(내 차례라 불리하다) 폰을 한 칸 밀어 차례를 넘긴다
    if (bx === wx && by === wy - 2 && safePush && one !== b.wk)
      return pawn(one as number, "wait");
    // 7. 옆으로: 이기는 칸 안에서 흑 킹과 세로줄이 먼 칸 → 앞 칸 → 가장자리 쪽 칸
    const aside = king(
      lowest(
        kings.filter((to) => inKeyZone(b.p, to)),
        (to) =>
          -Math.abs((to & 7) - bx) * 64 +
          (to >> 3) * 8 -
          Math.abs(2 * (to & 7) - 7),
      ),
      "aside",
    );
    if (aside) return aside;
  }
  // 8. 옆에서 밀기: 내 킹이 폰 바로 옆에 있으면 폰을 민다. 밀어서 체크가 되면 밀지 않는다
  const check = (to: number) =>
    by === (to >> 3) - 1 && Math.abs(bx - (to & 7)) === 1;
  if (wy === py && Math.abs(wx - px) === 1 && safePush && !check(one as number))
    return pawn(one as number, "beside");
  // 9. 다가가기: 폰 두 칸 앞 칸 쪽으로 한 걸음(걸음 수가 같으면 앞 칸)
  const target = Math.max(0, py - 2) * 8 + px;
  return king(
    lowest(kings, (to) => kingSteps(to, target) * 16 + (to >> 3)),
    "approach",
  );
}
