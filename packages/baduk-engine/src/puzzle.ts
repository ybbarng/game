import {
  areaOwners,
  areaScore,
  type Board,
  boardHash,
  type Cell,
  groupOf,
  neighbors,
  other,
  type Stone,
  sizeOf,
  tryPlace,
} from "./board";

/*
 * 바둑 문제(수 배우기, docs/23)를 풀고 검증하는 도우미. 작은 장면에서 "정답이 하나뿐인지"를 엔진으로 본다.
 *
 * 1. 잡기(따내기·축·장문): 노리는 돌 무리를 `n`수 안에 따낼 수 있나.
 *    받는 쪽 후보는 그 무리 활로로 뻗기, 무리에 붙은 상대 돌 따내기·단수 치기, 쉬기로 좁힌다(돌 주위 싸움만 본다).
 *    공격하는 쪽은 첫 수는 판 전체를, 그다음은 무리 활로와 그 둘레만 본다.
 * 2. 사활(두 눈 만들기·눈 빼앗기): 둘러싸인 무리가 정해진 빈 자리 안에서만 두어 "두 눈으로 산 모양"이 되나.
 *    산 모양은 벤슨(Benson) 방법으로 가린다: 상대가 몇 수를 두어도 잡히지 않는 무리(쉬어도 사는 무리).
 * 3. 환격·패: 잡기 문제의 첫 수 모양을 가린다(`snapbackGain`, `koRecapturePoint`).
 *
 * 패(같은 판 되풀이)는 읽는 길 위에서 같은 판이 다시 나오면 둘 수 없는 것으로 본다.
 */

/** 무리의 활로 수 */
export function libertyCount(board: Board, at: number): number {
  return groupOf(board, at).liberties.length;
}

/** 돌을 놓아 본다. 둘 수 없으면 null */
function place(board: Board, at: number, stone: Stone, path: Set<string>) {
  const tried = tryPlace(board, at, stone);
  if (!tried.ok) return null;
  const key = boardHash(tried.board);
  if (path.has(key)) return null;
  return { board: tried.board, key, captured: tried.captured };
}

/** 이 무리에 붙은 상대 무리들의 대표 자리와 활로 */
function adjacentEnemies(board: Board, at: number) {
  const size = sizeOf(board);
  const { stones } = groupOf(board, at);
  const color = board[at] as Stone;
  const seen = new Set<number>();
  const out: { liberties: number[] }[] = [];
  for (const s of stones)
    for (const n of neighbors(s, size)) {
      if (board[n] !== other(color) || seen.has(n)) continue;
      const g = groupOf(board, n);
      for (const x of g.stones) seen.add(x);
      out.push({ liberties: g.liberties });
    }
  return out;
}

/** 받는 쪽 후보: 활로로 뻗기, 붙은 상대 무리 따내기·단수 치기 */
function defenseCandidates(board: Board, target: number): number[] {
  const set = new Set(groupOf(board, target).liberties);
  for (const e of adjacentEnemies(board, target))
    if (e.liberties.length <= 2) for (const l of e.liberties) set.add(l);
  return [...set];
}

/** 공격하는 쪽 후보: 무리 활로와 활로 둘레 빈 자리 */
function attackCandidates(board: Board, target: number): number[] {
  const size = sizeOf(board);
  const libs = groupOf(board, target).liberties;
  const set = new Set(libs);
  if (libs.length >= 2)
    for (const l of libs)
      for (const n of neighbors(l, size)) if (board[n] === 0) set.add(n);
  return [...set];
}

/**
 * `attacker`가 둘 차례에, 노리는 무리(`target` 자리의 돌)를 `n`수 안에 따낼 수 있나.
 * 받는 쪽은 무엇을 두든(후보 안에서, 쉬기 포함) 막지 못해야 한다
 */
export function canCapture(
  board: Board,
  attacker: Stone,
  target: number,
  n: number,
  path: Set<string> = new Set([boardHash(board)]),
  memo: Map<string, boolean> = new Map(),
): boolean {
  if (board[target] !== other(attacker)) return true;
  if (n <= 0) return false;
  // 한 수에 활로는 하나만 줄일 수 있다. 받는 쪽이 쉬기만 해도 활로가 남는다.
  if (libertyCount(board, target) > n) return false;
  const key = `${boardHash(board)}:${n}`;
  const known = memo.get(key);
  if (known !== undefined) return known;
  let result = false;
  for (const at of attackCandidates(board, target)) {
    if (capturesAfter(board, attacker, target, at, n, path, memo)) {
      result = true;
      break;
    }
  }
  memo.set(key, result);
  return result;
}

/** `attacker`가 `at`에 두면 남은 `n`수(이 수 포함) 안에 따내나 */
function capturesAfter(
  board: Board,
  attacker: Stone,
  target: number,
  at: number,
  n: number,
  path: Set<string>,
  memo: Map<string, boolean>,
): boolean {
  const next = place(board, at, attacker, path);
  if (!next) return false;
  if (next.board[target] !== other(attacker)) return true;
  if (n <= 1) return false;
  const defender = other(attacker);
  path.add(next.key);
  try {
    // 쉬기
    if (!canCapture(next.board, attacker, target, n - 1, path, memo))
      return false;
    for (const d of defenseCandidates(next.board, target)) {
      const reply = place(next.board, d, defender, path);
      if (!reply) continue;
      path.add(reply.key);
      const ok = canCapture(reply.board, attacker, target, n - 1, path, memo);
      path.delete(reply.key);
      if (!ok) return false;
    }
    return true;
  } finally {
    path.delete(next.key);
  }
}

/** `attacker`가 `at`에 두면, 이 수를 포함해 `n`수 안에 노리는 무리를 따내나 */
export function capturesWithin(
  board: Board,
  attacker: Stone,
  target: number,
  at: number,
  n: number,
): boolean {
  return capturesAfter(
    board,
    attacker,
    target,
    at,
    n,
    new Set([boardHash(board)]),
    new Map(),
  );
}

/** 첫 수로 판 어디든 두어, 노리는 무리를 `n`수 안에 따내는 수들 */
export function captureMoves(
  board: Board,
  attacker: Stone,
  target: number,
  n: number,
): number[] {
  const path = new Set([boardHash(board)]);
  const memo = new Map<string, boolean>();
  const out: number[] = [];
  for (let at = 0; at < board.length; at++) {
    if (board[at] !== 0) continue;
    if (capturesAfter(board, attacker, target, at, n, path, memo)) out.push(at);
  }
  return out;
}

/** 이 판에서 `n`수 안에 따내려면 몇 수가 드나(못 따내면 null). 받는 쪽 응수를 고를 때 쓴다 */
export function movesToCapture(
  board: Board,
  attacker: Stone,
  target: number,
  n: number,
  history: Iterable<string> = [],
): number | null {
  for (let k = 0; k <= n; k++)
    if (
      canCapture(
        board,
        attacker,
        target,
        k,
        new Set([...history, boardHash(board)]),
      )
    )
      return k;
  return null;
}

/**
 * 받는 쪽(노리는 무리 편)의 응수: 공격하는 쪽이 따내는 데 가장 오래 걸리게 하는 후보.
 * `history`는 이번 판에 나왔던 판 지문(`BadukState.positions`)이다. 같은 판 모양이 되는 수(패 되따내기)는 두지 않는다.
 * 같은 판은 늘 같은 수(후보 차례대로 첫 것)
 */
export function bestDefense(
  board: Board,
  attacker: Stone,
  target: number,
  n: number,
  history: readonly string[] = [],
): number | null {
  const defender = other(attacker);
  const seen = new Set(history);
  let best: number | null = null;
  let bestCost = -1;
  for (const d of defenseCandidates(board, target)) {
    const tried = tryPlace(board, d, defender);
    if (!tried.ok || tried.board[target] !== defender) continue;
    const key = boardHash(tried.board);
    if (seen.has(key)) continue;
    const cost =
      movesToCapture(tried.board, attacker, target, n, [...seen, key]) ?? n + 1;
    if (cost > bestCost) {
      bestCost = cost;
      best = d;
    }
  }
  return best;
}

/**
 * 축 읽기(긴 축·축머리 문제): `attacker`가 `at`에 두어 단수를 치고, 그 뒤로도 **단수만** 쳐서 노리는 무리를 따내면
 * 공격하는 쪽이 둘 수(이 수 포함, 받는 쪽이 가장 오래 버틸 때). 축으로 못 잡으면 null.
 * 받는 쪽은 `defenseCandidates`(활로로 뻗기, 붙은 공격 돌 따내기·단수 치기)와 쉬기를 모두 둬 본다.
 * 공격하는 쪽을 단수로만 좁혔으니, 수가 나오면 정말 잡히고(받는 쪽은 어떻게 해도 못 빠져나간다),
 * null이면 "축으로는" 안 잡힌다(장문 같은 다른 길은 `captureMoves`로 따로 본다).
 * 공격 후보가 늘 둘 이하라 판 끝까지 가는 긴 축도 금방 읽는다. 같은 판 모양 금지를 지킨다
 */
export function ladderMoves(
  board: Board,
  attacker: Stone,
  target: number,
  at: number,
  path: Set<string> = new Set([boardHash(board)]),
  memo: Map<string, number | null> = new Map(),
): number | null {
  const next = place(board, at, attacker, path);
  if (!next) return null;
  if (next.board[target] !== other(attacker)) return 1;
  if (libertyCount(next.board, target) !== 1) return null;
  const known = memo.get(next.key);
  if (known !== undefined) return known;
  const defender = other(attacker);
  path.add(next.key);
  // 받는 쪽이 둔 판마다 공격하는 쪽이 가장 빨리 잡는 수. 하나라도 못 잡으면 null
  let worst = 0;
  const replies: Board[] = [next.board];
  for (const d of defenseCandidates(next.board, target)) {
    const reply = place(next.board, d, defender, path);
    if (reply) replies.push(reply.board);
  }
  let result: number | null = null;
  try {
    for (const after of replies) {
      if (after[target] !== defender) continue;
      const key = boardHash(after);
      path.add(key);
      let best: number | null = null;
      for (const l of groupOf(after, target).liberties) {
        const n = ladderMoves(after, attacker, target, l, path, memo);
        if (n !== null && (best === null || n < best)) best = n;
      }
      path.delete(key);
      if (best === null) {
        worst = -1;
        break;
      }
      worst = Math.max(worst, best);
    }
    result = worst < 0 ? null : worst + 1;
  } finally {
    path.delete(next.key);
  }
  memo.set(next.key, result);
  return result;
}

/**
 * 축에서 받는 쪽의 응수: 공격하는 쪽이 축으로 잡는 데 가장 오래 걸리게 하는 후보(못 잡게 하는 수가 있으면 그것).
 * `history`는 이번 판에 나왔던 판 지문이다. 같은 판은 늘 같은 수(후보 차례대로 첫 것). 둘 수가 없으면 null
 */
export function ladderDefense(
  board: Board,
  attacker: Stone,
  target: number,
  history: readonly string[] = [],
): number | null {
  const defender = other(attacker);
  const seen = new Set(history);
  let best: number | null = null;
  let bestCost = -1;
  for (const d of defenseCandidates(board, target)) {
    const tried = tryPlace(board, d, defender);
    if (!tried.ok || tried.board[target] !== defender) continue;
    const key = boardHash(tried.board);
    if (seen.has(key)) continue;
    let cost: number | null = null;
    for (const l of groupOf(tried.board, target).liberties) {
      const n = ladderMoves(
        tried.board,
        attacker,
        target,
        l,
        new Set([...seen, key]),
      );
      if (n !== null && (cost === null || n < cost)) cost = n;
    }
    const value = cost ?? Number.POSITIVE_INFINITY;
    if (value > bestCost) {
      bestCost = value;
      best = d;
    }
  }
  return best;
}

/**
 * 패 따내기인가: `stone`이 `at`에 두어 상대 돌 하나를 따내고, 놓은 돌이 혼자이며 그 따낸 자리 하나만 활로라
 * 상대가 바로 그 자리에 두면 되따낼 수 있는 모양이면 그 자리(되따낼 자리). 아니면 null.
 * 되따내면 판이 두기 전과 같아지므로 같은 판 모양 금지에 걸려 상대는 바로 되따낼 수 없다
 */
export function koRecapturePoint(
  board: Board,
  at: number,
  stone: Stone,
): number | null {
  const tried = tryPlace(board, at, stone);
  if (!tried.ok || tried.captured.length !== 1) return null;
  const mine = groupOf(tried.board, at);
  const taken = tried.captured[0] as number;
  if (mine.stones.length !== 1 || mine.liberties.length !== 1) return null;
  if (mine.liberties[0] !== taken) return null;
  const back = tryPlace(tried.board, taken, other(stone));
  if (!back.ok || back.captured.length !== 1) return null;
  return taken;
}

/**
 * 환격(되따내기): `attacker`가 `at`에 한 점을 내주면(아무것도 따내지 않고 활로 하나뿐인 돌),
 * 상대가 그 돌을 따낸 뒤 같은 자리에 다시 두어 노리는 무리를 되따낸다. 그때 되따내는 돌 수. 그런 모양이 아니면 0
 */
export function snapbackGain(
  board: Board,
  attacker: Stone,
  target: number,
  at: number,
): number {
  const thrown = tryPlace(board, at, attacker);
  if (!thrown.ok || thrown.captured.length > 0) return 0;
  const mine = groupOf(thrown.board, at);
  if (mine.stones.length !== 1 || mine.liberties.length !== 1) return 0;
  const taken = tryPlace(
    thrown.board,
    mine.liberties[0] as number,
    other(attacker),
  );
  if (!taken.ok || !taken.captured.includes(at)) return 0;
  const back = tryPlace(taken.board, at, attacker);
  if (!back.ok || back.board[target] !== 0) return 0;
  return back.captured.length;
}

/**
 * 벤슨 방법: `color` 무리 가운데 상대가 몇 수를 두어도(그 편이 쉬기만 해도) 잡히지 않는 돌 자리.
 * 무리마다 "그 무리 활로로만 이뤄진 빈 영역(눈)"이 둘 이상이면 산 것이다
 */
export function passAliveStones(board: Board, color: Stone): Set<number> {
  const size = sizeOf(board);
  // 무리
  const chainOf = new Map<number, number>();
  const chains: number[][] = [];
  for (let at = 0; at < board.length; at++) {
    if (board[at] !== color || chainOf.has(at)) continue;
    const { stones } = groupOf(board, at);
    for (const s of stones) chainOf.set(s, chains.length);
    chains.push(stones);
  }
  // 영역: `color`가 아닌 자리가 이어진 덩어리
  const regionOf = new Map<number, number>();
  const regions: number[][] = [];
  for (let at = 0; at < board.length; at++) {
    if (board[at] === color || regionOf.has(at)) continue;
    const stack = [at];
    const region: number[] = [];
    regionOf.set(at, regions.length);
    while (stack.length > 0) {
      const p = stack.pop() as number;
      region.push(p);
      for (const n of neighbors(p, size))
        if (board[n] !== color && !regionOf.has(n)) {
          regionOf.set(n, regions.length);
          stack.push(n);
        }
    }
    regions.push(region);
  }
  const liberties = chains.map(
    (stones) => new Set(groupOf(board, stones[0] as number).liberties),
  );
  /** 영역이 무리에게 "눈"인가: 영역의 빈 자리가 모두 그 무리 활로 */
  const vital = (r: number, c: number) =>
    (regions[r] as number[]).every(
      (p) => board[p] !== 0 || (liberties[c] as Set<number>).has(p),
    );
  /** 영역을 둘러싼 무리들 */
  const bordering = (r: number) => {
    const set = new Set<number>();
    for (const p of regions[r] as number[])
      for (const n of neighbors(p, size)) {
        const c = chainOf.get(n);
        if (c !== undefined) set.add(c);
      }
    return set;
  };
  let alive = new Set(chains.map((_, i) => i));
  let healthy = new Set(regions.map((_, i) => i));
  for (;;) {
    // 영역을 둘러싼 무리가 모두 살아 있어야 그 영역이 쓸모 있다
    healthy = new Set(
      [...healthy].filter((r) => [...bordering(r)].every((c) => alive.has(c))),
    );
    const next = new Set(
      [...alive].filter((c) => {
        let eyes = 0;
        for (const r of healthy) if (bordering(r).has(c) && vital(r, c)) eyes++;
        return eyes >= 2;
      }),
    );
    if (next.size === alive.size) break;
    alive = next;
  }
  const out = new Set<number>();
  for (const c of alive) for (const s of chains[c] as number[]) out.add(s);
  return out;
}

/** 사활을 읽는 판 둘레: 이 빈 자리들 안에서만 둔다 */
export interface LifeProblem {
  /** 살리거나 잡을 무리의 돌 하나 */
  target: number;
  /** 두어 볼 빈 자리 */
  area: readonly number[];
}

/**
 * 사는 쪽(`target` 편)이 `toPlay` 차례에 시작해, 정한 자리 안에서 두어 `depth`수(두 편 합) 안에 산 모양이 되나.
 * 잡는 쪽은 무엇을 두든(정한 자리 안, 쉬기 포함) 막지 못해야 한다. 따내면 잡은 것이다
 */
export function canLive(
  board: Board,
  problem: LifeProblem,
  toPlay: Stone,
  depth: number,
  path: Set<string> = new Set([boardHash(board)]),
  memo: Map<string, boolean> = new Map(),
): boolean {
  const owner = board[problem.target];
  if (!owner) return false;
  if (passAliveStones(board, owner).has(problem.target)) return true;
  if (depth <= 0) return false;
  const key = `${boardHash(board)}:${toPlay}:${depth}`;
  const known = memo.get(key);
  if (known !== undefined) return known;
  let result: boolean;
  if (toPlay === owner) {
    // 사는 쪽: 한 수라도 살면 산다. 쉬기는 살 길이 아니다(산 모양이 아니면 그대로다)
    result = false;
    for (const at of problem.area) {
      const next = place(board, at, toPlay, path);
      if (!next) continue;
      path.add(next.key);
      const ok = canLive(
        next.board,
        problem,
        other(toPlay),
        depth - 1,
        path,
        memo,
      );
      path.delete(next.key);
      if (ok) {
        result = true;
        break;
      }
    }
  } else {
    // 잡는 쪽: 모든 수(쉬기 포함)에 사는 쪽이 살아야 산다
    result = canLive(board, problem, other(toPlay), depth - 1, path, memo);
    if (result)
      for (const at of problem.area) {
        const next = place(board, at, toPlay, path);
        if (!next) continue;
        path.add(next.key);
        const ok =
          next.board[problem.target] === owner &&
          canLive(next.board, problem, other(toPlay), depth - 1, path, memo);
        path.delete(next.key);
        if (!ok) {
          result = false;
          break;
        }
      }
  }
  memo.set(key, result);
  return result;
}

/**
 * 잡는 쪽(`target` 상대 편)이 정한 자리 안에서 두어 `depth`수(두 편 합) 안에 그 무리를 따내나.
 * 사는 쪽은 무엇을 두든(정한 자리 안, 쉬기 포함) 막지 못해야 한다. 빅(세키)처럼 따낼 수 없으면 잡은 것이 아니다
 */
export function canKill(
  board: Board,
  problem: LifeProblem,
  toPlay: Stone,
  depth: number,
  path: Set<string> = new Set([boardHash(board)]),
  memo: Map<string, boolean> = new Map(),
): boolean {
  const owner = board[problem.target];
  if (!owner) return true;
  if (depth <= 0) return false;
  if (passAliveStones(board, owner).has(problem.target)) return false;
  const key = `${boardHash(board)}:${toPlay}:${depth}`;
  const known = memo.get(key);
  if (known !== undefined) return known;
  const killer = other(owner);
  /** 이 수(null이면 쉬기) 뒤 결과 */
  const after = (at: number | null): boolean | null => {
    if (at === null)
      return canKill(board, problem, other(toPlay), depth - 1, path, memo);
    const next = place(board, at, toPlay, path);
    if (!next) return null;
    if (next.board[problem.target] !== owner) return true;
    path.add(next.key);
    const ok = canKill(
      next.board,
      problem,
      other(toPlay),
      depth - 1,
      path,
      memo,
    );
    path.delete(next.key);
    return ok;
  };
  const moves: (number | null)[] = [...problem.area, null];
  let result: boolean;
  if (toPlay === killer) {
    result = false;
    for (const at of moves)
      if (after(at) === true) {
        result = true;
        break;
      }
  } else {
    result = true;
    for (const at of moves)
      if (after(at) === false) {
        result = false;
        break;
      }
  }
  memo.set(key, result);
  return result;
}

/**
 * 사활 문제의 첫 수 가운데 정답들.
 * `toPlay`가 사는 쪽이면 두어서 산 모양을 만들 수 있게 되는 수,
 * 잡는 쪽이면 두어서 상대를 끝내 따낼 수 있게 되는 수
 */
export function lifeKeyMoves(
  board: Board,
  problem: LifeProblem,
  toPlay: Stone,
  depth: number,
): number[] {
  const owner = board[problem.target] as Cell;
  const out: number[] = [];
  for (const at of problem.area) {
    const path = new Set([boardHash(board)]);
    const next = place(board, at, toPlay, path);
    if (!next) continue;
    path.add(next.key);
    const good =
      toPlay === owner
        ? canLive(next.board, problem, other(toPlay), depth - 1, path)
        : next.board[problem.target] !== owner ||
          canKill(next.board, problem, other(toPlay), depth - 1, path);
    if (good) out.push(at);
  }
  return out;
}

/**
 * 사활 문제의 첫 수 가운데 틀린 수가 정말 반대 결과가 되는가(빅이나 애매한 결과가 없는가).
 * 사는 쪽 문제면 정답 말고는 모두 잡히고, 잡는 쪽 문제면 정답 말고는 모두 산다
 */
export function lifeWrongMovesFail(
  board: Board,
  problem: LifeProblem,
  toPlay: Stone,
  depth: number,
  answers: readonly number[],
): boolean {
  const owner = board[problem.target] as Stone;
  for (const at of problem.area) {
    if (answers.includes(at)) continue;
    const path = new Set([boardHash(board)]);
    const next = place(board, at, toPlay, path);
    if (!next) continue;
    path.add(next.key);
    const fails =
      toPlay === owner
        ? next.board[problem.target] !== owner ||
          canKill(next.board, problem, other(toPlay), depth - 1, path)
        : canLive(next.board, problem, other(toPlay), depth - 1, path);
    if (!fails) return false;
  }
  return true;
}

/** 끝내기 읽기 결과: 두 편이 가장 좋게 둘 때 끝난 판의 점수 차(흑 − 백, 덤 빼고)와, 그 점수 차를 내는 첫 수들(null은 쉬기) */
export interface EndgameResult {
  score: number;
  best: (number | null)[];
}

/**
 * 끝내기 읽기(수 배우기 끝내기, docs/23): `toPlay`가 둘 차례에, 정한 빈 자리(`area`) 안에서만 두거나 쉰다.
 * 두 편이 잇달아 쉬면 판 위 그대로 센다(`areaScore`, 돌 수 + 집 수). 흑은 점수 차를 크게, 백은 작게 둔다.
 * 판 나머지는 이미 다 막혔다고 보고 두지 않는다(그래서 정한 자리가 적으면 끝까지 읽는다).
 * 다만 정한 자리에 붙은 무리가 단수가 되면 두 가지를 더 둔다. 그 활로가 자기 집(`areaOwners`가 그 편 것으로 센 빈 점)이면 그 편은 거기에 이어 받을 수 있다.
 * 자기 집을 자기 돌로 채우는 것은 점수(돌 수 + 집 수)를 바꾸지 않으니 셈이 어긋나지 않는다.
 * 또 그 무리가 상대 무리면 마지막 활로에 두어 따낼 수 있다(받지 않은 선수를 벌하는 수).
 * 정한 자리에 붙지 않은 무리는 보지 않는다(끝내기 한 곳만 셀 때 다른 곳이 섞이지 않게)
 * 읽는 길 위에서 같은 판 모양이 다시 나오는 수(패 되따내기)는 두지 않는다.
 * `passed`는 바로 앞 수가 쉬기였는지(이번에도 쉬면 끝난다)
 */
export function solveEndgame(
  board: Board,
  area: readonly number[],
  toPlay: Stone,
  passed = false,
): EndgameResult {
  const reader = endgameReader(board, area);
  const { score, best } = reader.choose(board, toPlay, passed);
  return { score, best };
}

/** 끝내기 읽기에서 한 판의 수 하나(null은 쉬기)와 그 뒤 두 편이 가장 좋게 둘 때 끝난 판의 점수 차 */
export interface EndgameChoice {
  at: number | null;
  score: number;
}

/**
 * 끝내기 읽기 도구(`solveEndgame`과 같은 읽기). 읽은 판을 기억해 두어, 같은 장면에서 첫 수마다의 결과(`choose`)와
 * 두 편이 끝까지 가장 좋게 둔 수순(`line`)을 여러 번 물어도 다시 읽지 않는다.
 * 읽는 길의 같은 판 금지는 `start`부터 센다(`line`은 둔 수의 판을 길에 더한다)
 */
export function endgameReader(start: Board, area: readonly number[]) {
  const memo = new Map<string, number>();
  const path = new Set([boardHash(start)]);
  const board = start;
  /** 이 편이 둘 수 있는 자리: 정한 자리, 단수인 자기 무리의 활로 가운데 자기 집, 단수인 상대 무리를 따내는 자리 */
  const size = sizeOf(board);
  const touching = new Set(area.flatMap((a) => [...neighbors(a, size)]));
  const movesFor = (b: Board, turn: Stone): number[] => {
    const owners = areaOwners(b);
    const extra = new Set<number>();
    for (let p = 0; p < b.length; p++) {
      if (!b[p] || !(touching.has(p) || area.includes(p))) continue;
      const libs = groupOf(b, p).liberties;
      if (libs.length !== 1) continue;
      const lib = libs[0] as number;
      if (b[p] !== turn) extra.add(lib);
      else if (owners[lib] === turn) extra.add(lib);
    }
    return [...area, ...[...extra].filter((p) => !area.includes(p))];
  };
  const scoreOf = (b: Board) => {
    const s = areaScore(b);
    return s.black - s.white;
  };
  const value = (b: Board, turn: Stone, afterPass: boolean): number => {
    const key = `${boardHash(b)}:${turn}:${afterPass ? 1 : 0}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const better = (a: number, c: number) =>
      turn === 1 ? Math.max(a, c) : Math.min(a, c);
    let result = afterPass ? scoreOf(b) : value(b, other(turn), true);
    for (const at of movesFor(b, turn)) {
      const next = place(b, at, turn, path);
      if (!next) continue;
      path.add(next.key);
      result = better(result, value(next.board, other(turn), false));
      path.delete(next.key);
    }
    memo.set(key, result);
    return result;
  };
  /** `b`에서 `toPlay`가 둘 수마다의 결과와, 가장 좋은 점수 차와 그 수들(자리 차례, 쉬기는 끝) */
  const choose = (b: Board, toPlay: Stone, passed = false) => {
    const choices: EndgameChoice[] = [];
    for (const at of [...movesFor(b, toPlay), null]) {
      if (at === null) {
        choices.push({
          at,
          score: passed ? scoreOf(b) : value(b, other(toPlay), true),
        });
        continue;
      }
      const next = place(b, at, toPlay, path);
      if (!next) continue;
      path.add(next.key);
      choices.push({ at, score: value(next.board, other(toPlay), false) });
      path.delete(next.key);
    }
    let score: number | null = null;
    let best: (number | null)[] = [];
    for (const { at, score: v } of choices) {
      if (score === null || (toPlay === 1 ? v > score : v < score)) {
        score = v;
        best = [at];
      } else if (v === score) best.push(at);
    }
    return { score: score ?? scoreOf(b), best, choices };
  };
  /**
   * `b`에서 `toPlay`부터 두 편이 끝까지 가장 좋게 둔 수순(쉬기는 빼고)과 끝난 판의 점수 차.
   * 늘 가장 좋은 수 가운데 첫 것(`best[0]`)을 둔다. 문제 화면이 받는 수를 고르는 것과 같다
   */
  const line = (b: Board, toPlay: Stone, passed = false) => {
    const moves: number[] = [];
    const added: string[] = [];
    let now = b;
    let turn = toPlay;
    let passes = passed ? 1 : 0;
    while (passes < 2) {
      const move = choose(now, turn, passes > 0).best[0] ?? null;
      if (move === null) passes++;
      else {
        const next = place(now, move, turn, path);
        if (!next) throw new Error("끝내기 수순을 둘 수 없다");
        path.add(next.key);
        added.push(next.key);
        now = next.board;
        moves.push(move);
        passes = 0;
      }
      turn = other(turn);
    }
    for (const key of added) path.delete(key);
    return { moves, score: scoreOf(now) };
  };
  return { choose, line };
}

/**
 * 끝내기 한 곳의 크기: 그 자리들 안에서만 둘 때, 흑이 먼저 둔 결과와 백이 먼저 둔 결과의 점수 차(흑 − 백) 차이.
 * 「이 끝내기는 n점짜리」의 n이다(먼저 두는 편이 n점을 더 얻는다)
 */
export function endgameSize(board: Board, area: readonly number[]): number {
  return (
    solveEndgame(board, area, 1).score - solveEndgame(board, area, 2).score
  );
}
