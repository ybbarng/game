/*
 * 초고수(docs/20 3·9절). 고수의 앞수 읽기에 다음을 더했다.
 * 1. 위협 읽기: 사·열린 삼으로 몰아 이기는 길이 있으면 그대로 둔다(threat.ts).
 * 2. 상대에게 그런 길이 있으면 그 길을 끊는 자리 가운데서만 고른다.
 * 3. 점점 깊게 읽기(2수, 3수, … 앞) + 판 해시 기억 + 킬러 수로 같은 시간에 더 깊이 읽는다.
 * 읽는 양은 시간이 아니라 노드 수로 끊는다. 그래서 같은 판·같은 시드면 어느 기기에서나 같은 수를 둔다.
 */
import { nextFloat } from "@game/mighty-engine";
import {
  CELLS,
  type Cell,
  other,
  type Stone,
  type Variant,
  winningLine,
} from "@game/omok-engine";

import {
  allowed,
  anyLegal,
  type OmokBot,
  placeWith,
  ranked,
  WIN,
} from "./common";
import { nearbyEmpties, WEIGHT, WINDOWS, WINDOWS_OF } from "./shape";
import {
  fourPoints,
  hasThreatWin,
  type ThreatBudget,
  threatWin,
} from "./threat";

/** 읽기 양(노드 수). 맥북에서 한 수 가운데 300ms·가장 길게 1.5초 안쪽이 되게 맞췄다 */
export interface MasterLimits {
  /** 사 몰아붙이기 길이(내 수, 마지막 다섯 포함)와 노드 */
  vcfMoves: number;
  vcfNodes: number;
  /** 열린 삼까지 쓰는 몰아붙이기 길이와 노드 */
  vctMoves: number;
  vctNodes: number;
  /** 상대 몰아붙이기를 끊는지 후보마다 확인할 때의 길이(상대 수)와 노드 */
  guardMoves: number;
  guardNodes: number;
  /** 한 수에 위협 읽기 전부가 쓸 수 있는 노드 */
  threatNodes: number;
  /** 앞수 읽기 가장 깊은 수와 노드 */
  maxDepth: number;
  searchNodes: number;
}

export const MASTER_LIMITS: MasterLimits = {
  vcfMoves: 10,
  vcfNodes: 4000,
  vctMoves: 6,
  vctNodes: 4000,
  guardMoves: 8,
  guardNodes: 2000,
  threatNodes: 12000,
  maxDepth: 6,
  searchNodes: 6000,
};

/** 뿌리에서 볼 후보 수 */
const ROOT_WIDTH = 12;
/** 그 아래 걸음(1부터)마다 볼 후보 수. 깊을수록 좁힌다 */
const INNER_WIDTH = [9, 8, 7, 6, 6, 5, 5, 5];
/** 상대 몰아붙이기를 끊는 자리를 앞 순위부터 이만큼 찾으면 그만 본다 */
const GUARD_PICKS = 4;

const MOD = 2 ** 52;

/** 판 해시(Zobrist). 고정한 씨앗으로 만들어 늘 같다 */
const ZOBRIST = (() => {
  const table = new Float64Array(CELLS * 3);
  let s = 0x9e3779b9;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
  // 두 수를 52비트 안 정수로 묶는다(xor 대신 2^52로 나눈 나머지 더하기로 쓴다. 더해도 2^53을 넘지 않는다).
  for (let i = 0; i < table.length; i++)
    table[i] = (next() & 0xfffff) * 4294967296 + next();
  return table;
})();

function zkey(at: number, stone: Stone): number {
  return ZOBRIST[at * 3 + stone] as number;
}

function hashOf(board: readonly Cell[]): number {
  let h = 0;
  for (let at = 0; at < CELLS; at++) {
    const v = board[at];
    if (v === 1 || v === 2) h = (h + zkey(at, v)) % MOD;
  }
  return h;
}

interface Entry {
  depth: number;
  score: number;
  /** 0 정확, 1 아래 한도(이 값 이상), 2 위 한도(이 값 이하) */
  flag: 0 | 1 | 2;
  best: number;
}

class Abort extends Error {}

/** 다섯 칸 창 수(가져온 값을 지역 값으로) */
const WINDOW_COUNT = WINDOWS.length;

/**
 * 앞수 읽기. 다섯 칸 창마다 흑·백 돌 수를 두고 돌을 놓고 뺄 때만 고친다.
 * 모양 점수(`placeGain`·`evaluate`)와 같은 값을 창 수만 보고 빨리 낸다
 */
class Search {
  readonly tt = new Map<number, Entry>();
  readonly killers: number[][] = [];
  readonly history = new Int32Array(CELLS);
  /** 창마다 [흑 수, 백 수] */
  readonly counts = new Int8Array(WINDOW_COUNT * 2);
  nodes = 0;

  constructor(
    readonly board: Cell[],
    readonly variant: Variant,
    readonly limit: number,
  ) {
    for (let at = 0; at < board.length; at++) {
      const v = board[at];
      if (v === 1 || v === 2) this.bump(at, v, 1);
    }
  }

  private bump(at: number, stone: Stone, by: number) {
    for (const id of WINDOWS_OF[at] ?? []) {
      const i = id * 2 + stone - 1;
      this.counts[i] = (this.counts[i] as number) + by;
    }
  }

  place(at: number, stone: Stone) {
    this.board[at] = stone;
    this.bump(at, stone, 1);
  }

  remove(at: number, stone: Stone) {
    this.board[at] = 0;
    this.bump(at, stone, -1);
  }

  /** `placeGain`과 같은 값 */
  gain(at: number, stone: Stone): number {
    let gain = 0;
    const mineOff = stone - 1;
    const theirsOff = 2 - stone;
    for (const id of WINDOWS_OF[at] ?? []) {
      if (this.counts[id * 2 + theirsOff] !== 0) continue;
      const mine = this.counts[id * 2 + mineOff] as number;
      gain += (WEIGHT[mine + 1] ?? 0) - (WEIGHT[mine] ?? 0);
    }
    return gain;
  }

  /** `evaluate`와 같은 값 */
  evaluate(stone: Stone): number {
    let black = 0;
    let white = 0;
    for (let id = 0; id < WINDOW_COUNT; id++) {
      const b = this.counts[id * 2] as number;
      const w = this.counts[id * 2 + 1] as number;
      if (b > 0 && w > 0) continue;
      if (b > 0) black += WEIGHT[b] ?? 0;
      else if (w > 0) white += WEIGHT[w] ?? 0;
    }
    return stone === 1 ? black - white * 0.9 : white - black * 0.9;
  }

  /** `stone`이 두면 바로 이기는 자리(넷이 든 창의 빈칸을 두어 본다) */
  fives(stone: Stone): number[] {
    const found: number[] = [];
    const mineOff = stone - 1;
    const theirsOff = 2 - stone;
    for (let id = 0; id < WINDOW_COUNT; id++) {
      if (
        this.counts[id * 2 + mineOff] !== 4 ||
        this.counts[id * 2 + theirsOff] !== 0
      )
        continue;
      for (const c of WINDOWS[id] ?? []) {
        if (this.board[c] !== 0 || found.includes(c)) continue;
        this.board[c] = stone;
        if (winningLine(this.board, c, this.variant) !== null) found.push(c);
        this.board[c] = 0;
      }
    }
    return found;
  }

  /** `stone` 차례에서 볼 후보. 이길 수·다섯 막기가 있으면 그것만 */
  moves(stone: Stone, ply: number, ttBest: number): number[] {
    const win = this.fives(stone)[0];
    if (win !== undefined) return [win];
    const foe = other(stone);
    const block = this.fives(foe).find((at) =>
      allowed(this.board, at, stone, this.variant),
    );
    if (block !== undefined) return [block];
    const width = INNER_WIDTH[ply] ?? 5;
    const scored = nearbyEmpties(this.board)
      .map((at) => ({
        at,
        score:
          this.gain(at, stone) +
          this.gain(at, foe) +
          ((this.history[at] ?? 0) > 0 ? 1e-3 : 0),
      }))
      .sort((p, q) => q.score - p.score);
    const list: number[] = [];
    for (const m of scored) {
      if (list.length >= width) break;
      if (allowed(this.board, m.at, stone, this.variant)) list.push(m.at);
    }
    const front: number[] = [];
    if (ttBest >= 0 && list.includes(ttBest)) front.push(ttBest);
    for (const k of this.killers[ply] ?? [])
      if (list.includes(k) && !front.includes(k)) front.push(k);
    return [...front, ...list.filter((at) => !front.includes(at))];
  }

  negamax(
    stone: Stone,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    hash: number,
  ): number {
    if (++this.nodes > this.limit) throw new Abort();
    if (depth === 0) return this.evaluate(stone);
    const key = (hash * 2 + stone) % MOD;
    const entry = this.tt.get(key);
    if (entry && entry.depth >= depth) {
      if (entry.flag === 0) return entry.score;
      if (entry.flag === 1 && entry.score >= beta) return entry.score;
      if (entry.flag === 2 && entry.score <= alpha) return entry.score;
    }
    const moves = this.moves(stone, ply, entry?.best ?? -1);
    if (moves.length === 0) return 0;
    const start = alpha;
    let best = -Infinity;
    let bestAt = moves[0] as number;
    let a = alpha;
    for (const at of moves) {
      this.place(at, stone);
      let score: number;
      try {
        score =
          winningLine(this.board, at, this.variant) !== null
            ? WIN + depth
            : -this.negamax(
                other(stone),
                depth - 1,
                -beta,
                -a,
                ply + 1,
                (hash + zkey(at, stone)) % MOD,
              );
      } finally {
        this.remove(at, stone);
      }
      if (score > best) {
        best = score;
        bestAt = at;
      }
      if (best > a) a = best;
      if (a >= beta) {
        const ks = this.killers[ply] ?? [];
        if (!ks.includes(at)) this.killers[ply] = [at, ...ks].slice(0, 2);
        this.history[at] = (this.history[at] ?? 0) + depth * depth;
        break;
      }
    }
    this.tt.set(key, {
      depth,
      score: best,
      flag: best <= start ? 2 : best >= beta ? 1 : 0,
      best: bestAt,
    });
    return best;
  }
}

/** 한 수 동안 위협 읽기가 나눠 쓰는 노드 */
class Pool {
  constructor(public left: number) {}

  /** `limit`(남은 것보다 많으면 남은 만큼)까지 읽고, 쓴 만큼 덜어 낸다. 끝까지 읽었으면 `done` */
  run<T>(limit: number, read: (budget: ThreatBudget) => T) {
    const budget: ThreatBudget = {
      limit: Math.min(limit, this.left),
      nodes: 0,
    };
    const value = read(budget);
    this.left = Math.max(0, this.left - budget.nodes);
    return { value, done: budget.nodes <= budget.limit };
  }
}

/**
 * 상대(`foe`)에게 몰아 이기는 길이 있으면, 내 후보 가운데 그 길을 끊는 자리들. 길이 없으면 null.
 * 내 사(상대가 막아야 하는 수)도 시간을 버는 수로 함께 본다
 */
function guards(
  board: Cell[],
  stone: Stone,
  variant: Variant,
  candidates: readonly number[],
  limits: MasterLimits,
  threes: boolean,
  pool: Pool,
): number[] | null {
  const foe = other(stone);
  const guardLength = threes ? limits.guardMoves : limits.vcfMoves;
  const probe = pool.run(threes ? limits.vctNodes : limits.vcfNodes, (b) =>
    hasThreatWin(board, foe, variant, guardLength, threes, b),
  );
  if (!probe.value) return null;
  const tries = [...candidates];
  for (const f of fourPoints(board, stone, variant))
    if (!tries.includes(f)) tries.push(f);
  const found: number[] = [];
  for (const at of tries) {
    if (found.length >= (threes ? GUARD_PICKS : 2 * GUARD_PICKS)) break;
    if (pool.left <= 0) break;
    if (!allowed(board, at, stone, variant)) continue;
    board[at] = stone;
    const check = pool.run(limits.guardNodes, (b) =>
      hasThreatWin(board, foe, variant, guardLength, threes, b),
    );
    board[at] = 0;
    // 다 읽지 못했으면 끊는지 모르므로 넣지 않는다.
    if (check.done && !check.value) found.push(at);
  }
  return found;
}

export function createOmokMasterBot(
  limits: MasterLimits = MASTER_LIMITS,
): OmokBot {
  return {
    name: "omok-master",
    decide: placeWith((board, stone, variant, rng) => {
      // 1. 내가 사로, 그다음 열린 삼까지 써서 몰아 이기는 길.
      const pool = new Pool(limits.threatNodes);
      const vcf = pool.run(limits.vcfNodes, (b) =>
        threatWin(board, stone, variant, limits.vcfMoves, false, b),
      ).value;
      if (vcf !== null) return vcf;
      const vct = pool.run(limits.vctNodes, (b) =>
        threatWin(board, stone, variant, limits.vctMoves, true, b),
      ).value;
      if (vct !== null) return vct;

      // 2. 상대의 몰아붙이기를 끊는 자리로 후보를 좁힌다.
      let candidates = ranked(board, stone, variant, 1, ROOT_WIDTH).map(
        (m) => m.at,
      );
      for (const threes of [false, true]) {
        const stops = guards(
          board,
          stone,
          variant,
          candidates,
          limits,
          threes,
          pool,
        );
        // 사 몰아붙이기를 끊는 자리 가운데서 열린 삼까지 쓰는 길도 끊는 자리를 다시 고른다.
        if (stops !== null && stops.length > 0) candidates = stops;
      }
      if (candidates.length === 0) return anyLegal(board, stone, variant);
      if (candidates.length === 1) return candidates[0] as number;

      // 3. 점점 깊게 읽는다. 노드가 다하면 마지막으로 끝까지 읽은 깊이의 답을 쓴다.
      const search = new Search(board, variant, limits.searchNodes);
      const hash = hashOf(board);
      let order = candidates;
      let chosen = order[0] as number;
      for (let depth = 2; depth <= limits.maxDepth; depth++) {
        const scored: { at: number; score: number }[] = [];
        let best = -Infinity;
        let bestAt = order[0] as number;
        try {
          for (const at of order) {
            search.place(at, stone);
            let score: number;
            try {
              score =
                winningLine(board, at, variant) !== null
                  ? WIN
                  : -search.negamax(
                      other(stone),
                      depth - 1,
                      -Infinity,
                      -best,
                      1,
                      (hash + zkey(at, stone)) % MOD,
                    );
            } finally {
              search.remove(at, stone);
            }
            // 거의 같은 수끼리는 조금 흔들어 매번 같은 판이 되지 않게 한다.
            const jittered = score + nextFloat(rng) * 0.5;
            scored.push({ at, score: jittered });
            if (jittered > best) {
              best = jittered;
              bestAt = at;
            }
          }
        } catch (e) {
          if (!(e instanceof Abort)) throw e;
          // 이번 깊이에서 이미 본 수가 앞 깊이의 답보다 낫다고 나왔으면 그것을 쓴다.
          if (bestAt !== chosen && scored.length > 1) chosen = bestAt;
          break;
        }
        chosen = bestAt;
        if (best >= WIN / 2) break;
        order = scored.sort((p, q) => q.score - p.score).map((m) => m.at);
      }
      return chosen;
    }),
  };
}

export const omokMasterBot = createOmokMasterBot();
