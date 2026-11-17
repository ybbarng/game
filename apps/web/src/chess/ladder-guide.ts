/*
 * 룩 둘 사다리 메이트 단원의 방법(docs/23 「기본 엔드게임」). 단원 글(`ladder-lesson.ts`)과 한 단계씩 맞춘다.
 * 두 룩이 번갈아 체크하며 흑 킹을 한 줄씩 가장자리 줄로 민다. 내 킹은 길을 비킬 때만 쓴다.
 * 시험(`ladder-guide.test.ts`)이 여러 시작 판에서 흑이 **어떤 수로** 받아도 이 방법대로 두면 정해진 수 안에 메이트하고,
 * 스테일메이트·룩 내줌·같은 판 맴돌기가 없는지 본다(흑의 모든 수를 끝까지 따라간다). 고를 칸이 여럿일 때 앞·뒤 둘 다.
 *
 * 낱말(단원 글과 같다). 판을 미는 쪽 가장자리 줄이 v=0이 되게 돌려 본다(`toFrame`). u는 가장자리 줄과 나란한 방향의 자리
 * - 미는 쪽: 흑 킹을 몰아갈 가장자리 줄. 내 킹이 흑 킹보다 그 가장자리 줄에서 두 줄 이상 먼 쪽 가운데 흑 킹에서 가장 가까운 쪽.
 *   한 번 정하면 내 킹이 흑 킹보다 두 줄 이상 먼 동안 바꾸지 않는다(다음 판에 `prev`로 넘긴다)
 * - 흑 킹 줄(v=bv), 바로 뒤 줄(bv+1), 둘째 뒤 줄(bv+2), 앞쪽(v<bv). 「옆으로 n칸」은 u 차이
 * - 지키는 룩: 바로 뒤 줄에 있는 룩
 * 칸 번호는 엔진과 같다(y*8+x, a8=0·h1=63).
 */

import {
  type KrrkBoard,
  krrkBlackMoves,
  krrkCheck,
  krrkMated,
  krrkStalemate,
  krrkWhiteMoves,
  krrkWhitePlayed,
} from "@game/chess-ai";

import {
  FRAMES,
  type Frame,
  fromFrame,
  type Tie,
  toFrame,
} from "./endgame-guide";

/** 단원의 단계(단원 글의 단계와 같은 차례) */
export type LadderRule =
  | "mate"
  | "rescue"
  | "pull"
  | "push"
  | "guard"
  | "tempo"
  | "rest";

export interface LadderMove {
  from: number;
  to: number;
  rule: LadderRule;
  /** 이 수를 고른 미는 쪽. 다음 판에 `prev`로 넘기면 같은 쪽으로 계속 민다 */
  frame: Frame | null;
}

type Move = { from: number; to: number };

const xy = (i: number) => [i & 7, i >> 3] as const;
const kingSteps = (a: number, b: number) => {
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
};

function pick<T>(items: readonly T[], tie: Tie): T | undefined {
  return tie === "first" ? items[0] : items[items.length - 1];
}

/** 값이 가장 큰 후보들 */
function largest<T>(items: readonly T[], score: (t: T) => number): T[] {
  let best = Number.NEGATIVE_INFINITY;
  let out: T[] = [];
  for (const t of items) {
    const s = score(t);
    if (s > best) {
      best = s;
      out = [t];
    } else if (s === best) out.push(t);
  }
  return out;
}

/** 흑 킹이 룩을 잡을 수 있나 */
const loses = (b: KrrkBoard) => krrkBlackMoves(b).some((m) => m.capture);

/** 체크 아닌 수에 붙는 조건(늘 지킬 것): 룩을 잡히지 않고, 체크도 스테일메이트도 만들지 않는다 */
const quiet = (a: KrrkBoard) => !loses(a) && !krrkCheck(a) && !krrkStalemate(a);

/**
 * 미는 쪽(판을 보는 방향, 미는 가장자리 줄이 v=0). 내 킹이 흑 킹보다 그 가장자리 줄에서 두 줄 이상 먼 방향만 본다.
 * `prev`가 아직 그렇다면 그대로, 아니면 흑 킹에서 가장자리 줄까지 줄이 가장 적은 방향
 */
export function ladderFrame(
  b: KrrkBoard,
  tie: Tie = "first",
  prev: Frame | null = null,
): Frame | null {
  const valid = (f: Frame) => toFrame(f, b.wk)[1] >= toFrame(f, b.bk)[1] + 2;
  if (prev !== null && valid(prev)) return prev;
  return (
    pick(
      largest(FRAMES.filter(valid), (f) => -toFrame(f, b.bk)[1]),
      tie,
    ) ?? null
  );
}

/** 이 방향에서 지키는 룩(바로 뒤 줄의 룩) 자리. 없으면 null. 둘 다 바로 뒤 줄이면 `rooks` 차례로 앞의 것 */
function guardOf(
  b: KrrkBoard,
  f: Frame,
  rooks: readonly number[],
): number | null {
  const bv = toFrame(f, b.bk)[1];
  for (const r of rooks) if (toFrame(f, r)[1] === bv + 1) return r;
  return null;
}

/**
 * 「먼 칸」: 흑 킹과 옆으로 `gap`칸 이상 떨어진 칸 가운데 옆으로 가장 먼 칸.
 * 다른 룩과 같은 엇갈리는 줄(같은 u)의 칸은 다른 칸이 없을 때만 고른다(다른 룩이 앞으로 나올 길을 막는다)
 */
function farthest(
  b: KrrkBoard,
  f: Frame,
  moves: readonly Move[],
  tie: Tie,
  gap = 2,
): Move | undefined {
  const [bu] = toFrame(f, b.bk);
  const apart = moves.filter((m) => Math.abs(toFrame(f, m.to)[0] - bu) >= gap);
  const other = (m: Move) => (m.from === b.p ? b.q : b.p);
  const clear = apart.filter((m) => {
    const o = other(m);
    return o < 0 || toFrame(f, o)[0] !== toFrame(f, m.to)[0];
  });
  return pick(
    largest(clear.length > 0 ? clear : apart, (m) =>
      Math.abs(toFrame(f, m.to)[0] - bu),
    ),
    tie,
  );
}

/**
 * 단원의 방법대로 둘 수(백 차례). 위에서부터 차례로 보고 처음 맞는 단계의 수를 둔다. 둘 수가 없으면 null.
 * 메이트·밀기 말고는 룩을 잡히는 수, 체크, 스테일메이트가 되는 수를 뺀다(밀기도 룩을 잡히는 수는 뺀다).
 * 1. 메이트: 메이트가 되는 수
 * 2. 살리기: 흑 킹 바로 옆의 룩을 ① 제 줄을 따라 옆으로 세 칸 이상 먼 칸 ② 둘째 뒤 줄이나 그 뒤의 가장 먼 칸(킹 걸음)
 *    ③ 제 줄을 따라 옆으로 두 칸 이상 먼 칸 ④ 가장 먼 칸으로. 그 룩이 못 가면 다른 룩을 가장 먼 칸으로
 * 3. 빼기: 앞쪽에서 흑 킹과 킹 걸음 두 칸 안에 있는 룩을 ① 바로 뒤 줄 ② 더 뒤 줄 ③ 제 줄의 먼 칸(옆으로 두 칸 이상) ④ 가장 먼 칸으로
 * 4. 밀기: 지키는 룩이 있으면 다른 룩을 흑 킹 줄의 먼 칸(옆으로 두 칸 이상)으로 옮겨 체크
 * 5. 지키기: 지키는 룩이 없으면 룩 하나를 바로 뒤 줄의 먼 칸으로. 둘째 뒤 줄의 룩은 두고 다른 룩부터
 * 6. 쉬기: 지키는 룩이 아닌 룩을 ① 준비된 칸(옆으로 세 칸 이상, 흑 킹 줄까지 곧은 길이 빈, 둘째 뒤 줄이나 그 뒤)
 *    ② 엇갈리는 줄을 따라, 다음 수에 옆으로 가서 ①의 칸에 설 수 있는 줄 ③ 옆으로 두 칸 이상인 준비된 칸으로
 * 7. 그 밖에는 내 킹을 흑 킹에서 가장 먼 칸으로, 안 되면 룩을 가장 먼 칸으로
 */
export function ladderMove(
  b: KrrkBoard,
  tie: Tie = "first",
  prev: Frame | null = null,
): LadderMove | null {
  const moves = krrkWhiteMoves(b);
  const f = ladderFrame(b, tie, prev);
  const as = (m: Move | undefined, rule: LadderRule): LadderMove | null =>
    m ? { from: m.from, to: m.to, rule, frame: f } : null;
  const after = (m: Move) => krrkWhitePlayed(b, m);

  const mate = pick(
    moves.filter((m) => krrkMated(after(m))),
    tie,
  );
  if (mate) return as(mate, "mate");

  const rookMoves = moves.filter((m) => m.from !== b.wk);
  /** 흑 킹에서 킹 걸음 수로 가장 먼 칸 */
  const farAny = (pool: readonly Move[]) =>
    pick(
      largest(pool, (m) => kingSteps(m.to, b.bk)),
      tie,
    );
  // 두 룩을 보는 차례: 칸 번호 차례(뒤 고르기는 거꾸로). 같은 판이면 늘 같은 수
  const rooks = [b.p, b.q]
    .filter((r) => r >= 0)
    .sort((x, y) => (tie === "first" ? x - y : y - x));

  if (f !== null) {
    const [bu, bv] = toFrame(f, b.bk);
    const v = (at: number) => toFrame(f, at)[1];
    const u = (at: number) => toFrame(f, at)[0];
    const quietOf = (r: number) =>
      rookMoves.filter((m) => m.from === r && quiet(after(m)));
    /** 제 줄(가장자리 줄과 나란한 줄)을 따라 가는 수 */
    const along = (pool: readonly Move[]) =>
      pool.filter((m) => v(m.to) === v(m.from));

    // 2. 살리기
    for (const r of rooks) {
      if (kingSteps(r, b.bk) > 1) continue;
      const mine = quietOf(r);
      const run =
        farthest(b, f, along(mine), tie, 3) ??
        farAny(mine.filter((m) => v(m.to) >= bv + 2)) ??
        farthest(b, f, along(mine), tie) ??
        farAny(mine) ??
        farAny(rookMoves.filter((m) => m.from !== r && quiet(after(m))));
      if (run) return as(run, "rescue");
    }

    // 3. 빼기
    const front = rooks.filter((r) => v(r) < bv && kingSteps(r, b.bk) <= 2);
    if (front.length > 0) {
      const mine = front.flatMap(quietOf);
      const run =
        farthest(
          b,
          f,
          mine.filter((m) => v(m.to) === bv + 1),
          tie,
        ) ??
        farthest(
          b,
          f,
          mine.filter((m) => v(m.to) > bv + 1),
          tie,
        ) ??
        farthest(b, f, along(mine), tie) ??
        farAny(mine);
      if (run) return as(run, "pull");
    }

    const guard = guardOf(b, f, rooks);
    if (guard !== null) {
      // 4. 밀기
      const checks = rookMoves.filter(
        (m) => m.from !== guard && v(m.to) === bv && !loses(after(m)),
      );
      const push = farthest(b, f, checks, tie);
      if (push) return as(push, "push");
    } else {
      // 5. 지키기
      const lines = rookMoves.filter(
        (m) => v(m.to) === bv + 1 && quiet(after(m)),
      );
      const line =
        farthest(
          b,
          f,
          lines.filter((m) => v(m.from) !== bv + 2),
          tie,
        ) ?? farthest(b, f, lines, tie);
      if (line) return as(line, "guard");
    }

    // 6. 쉬기
    const spare = rookMoves.filter((m) => m.from !== guard && quiet(after(m)));
    const occupied = (a: KrrkBoard, at: number) =>
      at === a.wk || at === a.bk || at === a.p || at === a.q;
    /** 이 자리(엇갈리는 줄 `cu`, 줄 `cv`)에서 흑 킹 줄까지 곧은 길이 비었나(흑 킹 줄의 칸도 비었다) */
    const straight = (a: KrrkBoard, cu: number, cv: number) => {
      for (let w = Math.min(cv, bv); w <= Math.max(cv, bv); w++)
        if (w !== cv && occupied(a, fromFrame(f, cu, w))) return false;
      return true;
    };
    const ready = (gap: number) =>
      pick(
        largest(
          largest(
            spare.filter(
              (m) =>
                v(m.to) >= bv + 2 &&
                Math.abs(u(m.to) - bu) >= gap &&
                straight(after(m), u(m.to), v(m.to)),
            ),
            (m) => Math.abs(u(m.to) - bu),
          ),
          (m) => -v(m.to),
        ),
        tie,
      );
    /** 이 칸에서 제 줄을 따라 옆으로 가서, 옆으로 세 칸 이상 떨어진 칸에 설 수 있나(가는 길이 비고 곧은 길도 빈 칸) */
    const slides = (a: KrrkBoard, from: number) => {
      const [u0, v0] = toFrame(f, from);
      for (const dir of [-1, 1])
        for (let cu = u0 + dir; cu >= 0 && cu <= 7; cu += dir) {
          if (occupied(a, fromFrame(f, cu, v0))) break;
          if (Math.abs(cu - bu) >= 3 && straight(a, cu, v0)) return true;
        }
      return false;
    };
    const wait =
      ready(3) ??
      pick(
        largest(
          spare.filter(
            (m) =>
              u(m.to) === u(m.from) &&
              v(m.to) !== bv &&
              v(m.to) !== bv + 1 &&
              slides(after(m), m.to),
          ),
          (m) => -Math.abs(v(m.to) - (bv + 2)),
        ),
        tie,
      ) ??
      ready(2);
    if (wait) return as(wait, "tempo");
  }

  // 7. 그 밖에
  const rest =
    farAny(moves.filter((m) => m.from === b.wk && quiet(after(m)))) ??
    farAny(rookMoves.filter((m) => quiet(after(m)))) ??
    farAny(
      rookMoves.filter((m) => !loses(after(m)) && !krrkStalemate(after(m))),
    );
  return as(rest, "rest");
}
