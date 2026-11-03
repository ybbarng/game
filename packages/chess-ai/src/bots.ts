import {
  type Action,
  applyMove,
  type ChessView,
  inCheck,
  isCheckmate,
  type Move,
  type Position,
  positionKey,
} from "@game/chess-engine";
import { nextFloat, nextInt, type RngState } from "@game/mighty-engine";

import { hashOf, newExpertContext, searchExpert } from "./expert";
import {
  evaluate,
  MATE,
  material,
  negamax,
  newContext,
  orderMoves,
  quiesce,
  type SearchContext,
} from "./search";

/** 컴퓨터 플레이어. 자기 자리 화면만 받는다(`KitBot`과 같은 모양) */
export interface ChessBot {
  readonly name: string;
  decide(view: ChessView, rng: RngState): Action;
}

/** 이 수를 두면 같은 판이 세 번째가 되어 비기는가 */
function repeatsThrice(view: ChessView, next: Position): boolean {
  const key = positionKey(next);
  return view.positions.filter((p) => p === key).length >= 2;
}

/** 무승부 제안을 받는 기준: 이만큼(폰 100) 넘게 지고 있으면 받는다 */
const DRAW_ACCEPT_BEHIND = 300;

/** 수를 고르는 방법만 다르고, 다음 판은 같다 */
function botWith(
  name: string,
  pick: (view: ChessView, rng: RngState) => Move | null,
): ChessBot {
  return {
    name,
    decide(view, rng) {
      if (view.decision?.kind === "continue") return { type: "continue" };
      // 상대가 무승부를 제안하면 기물 값으로 마이너 기물 하나 넘게 지고 있을 때만 받는다.
      // 아니면 그냥 두어 거절한다(두면 제안이 사라진다).
      if (
        view.drawOffer === 1 - view.mySeat &&
        material(view.position.board, view.position.turn) <= -DRAW_ACCEPT_BEHIND
      )
        return { type: "acceptDraw" };
      const move = pick(view, rng);
      if (!move) return { type: "resign" };
      return { type: "move", ...move };
    },
  };
}

/** 입문이 "비슷하게 좋다"고 보는 값 차이(폰 반 개) */
const BEGINNER_SLACK = 50;

/**
 * 입문: 한 수만 보고 기물 값이 가장 좋은 수와 비슷한 수들 가운데 무작위.
 * 공짜 기물은 잡지만(값 차이가 커서), 잡힌 뒤를 생각하지 않아 기물을 자주 내준다. 한 수 메이트는 둔다
 */
export const chessBeginnerBot = botWith("chess-beginner", (view, rng) => {
  const pos = view.position;
  const scored = view.legal.map((move) => {
    const next = applyMove(pos, move);
    if (isCheckmate(next)) return { move, score: MATE };
    return { move, score: material(next.board, pos.turn) };
  });
  const best = Math.max(...scored.map((s) => s.score));
  const near = scored.filter((s) => s.score >= best - BEGINNER_SLACK);
  return near[nextInt(rng, near.length)]?.move ?? null;
});

/** 같은 값끼리는 조금 흔들어 매번 같은 판이 되지 않게 고른다 */
function bestOf(
  scored: { move: Move; score: number }[],
  rng: RngState,
  jitter: number,
): Move | null {
  let best: Move | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const { move, score } of scored) {
    const jittered = score + nextFloat(rng) * jitter;
    if (jittered > bestScore) {
      bestScore = jittered;
      best = move;
    }
  }
  return best;
}

/** 뿌리의 수 하나를 `depth`수 앞까지 읽은 값(둔 편에서 본 값) */
function rootScore(
  view: ChessView,
  move: Move,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchContext,
): number {
  const next = applyMove(view.position, move);
  if (repeatsThrice(view, next)) return 0;
  if (depth <= 1) return -quiesce(next, -beta, -alpha, ctx);
  return -negamax(next, depth - 1, -beta, -alpha, ctx);
}

/** 중수: 두 수 앞(내 수와 상대 답) + 잡기를 끝까지 따져 가장 좋은 수 */
export const chessIntermediateBot = botWith(
  "chess-intermediate",
  (view, rng) => {
    const ctx = newContext();
    const scored = view.legal.map((move) => ({
      move,
      score: rootScore(
        view,
        move,
        2,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        ctx,
      ),
    }));
    return bestOf(scored, rng, 8);
  },
);

/**
 * 고수가 한 수에 보는 판 수 상한. 맥북에서 가장 길게 1초 안쪽이 되게 잡았다(docs/26).
 * 고수 전용 탐색은 판 하나에 드는 셈이 조금 더 크고 상한까지 쓰는 일이 잦아 예전(12만)보다 낮다
 */
export const EXPERT_NODE_BUDGET = 80_000;

/** 예전 고수의 판 수 상한(세기 비교용) */
const LEGACY_NODE_BUDGET = 120_000;

/** 같은 값으로 보는 차이(이 안의 수는 시드로 고른다) */
const EXPERT_JITTER = 10;

/**
 * 고수: 깊이를 하나씩 늘리며 읽는다(반복 심화). 앞 깊이의 가장 좋은 수를 먼저 읽고,
 * 판 수 상한을 넘으면 그 깊이는 버리고 앞 깊이의 결과를 쓴다(기기 속도와 상관없이 늘 같은 수)
 */
export function createChessSearchBot(
  maxDepth = 4,
  budget = LEGACY_NODE_BUDGET,
): ChessBot {
  return botWith(`chess-search-${maxDepth}`, (view, rng) => {
    const pos = view.position;
    if (view.legal.length === 0) return null;
    // 바로 메이트면 더 읽지 않는다.
    const mate = view.legal.find((m) => isCheckmate(applyMove(pos, m)));
    if (mate) return mate;
    const ctx = newContext(budget);
    let best: { move: Move; score: number }[] = [];
    let first: Move | null = null;
    for (let depth = 1; depth <= maxDepth; depth++) {
      const scored: { move: Move; score: number }[] = [];
      let alpha = Number.NEGATIVE_INFINITY;
      for (const move of orderMoves(pos, [...view.legal], first)) {
        // 가장 좋은 값보다 조금 낮은 수까지 정확한 값을 얻도록 창을 연다.
        const score = rootScore(
          view,
          move,
          depth,
          alpha - EXPERT_JITTER,
          Number.POSITIVE_INFINITY,
          ctx,
        );
        if (ctx.aborted) break;
        scored.push({ move, score });
        if (score > alpha) alpha = score;
      }
      if (ctx.aborted) break;
      best = scored;
      const top = Math.max(...scored.map((s) => s.score));
      first = scored.find((s) => s.score === top)?.move ?? null;
      // 메이트를 찾았으면 더 깊이 볼 까닭이 없다.
      if (Math.abs(top) > MATE / 2) break;
    }
    if (best.length === 0) return view.legal[0] ?? null;
    const top = Math.max(...best.map((s) => s.score));
    return bestOf(
      best.filter((s) => s.score >= top - EXPERT_JITTER),
      rng,
      EXPERT_JITTER,
    );
  });
}

/**
 * 고수: 고수 전용 탐색(expert.ts)으로 깊이를 하나씩 늘리며 읽는다(반복 심화).
 * 치환표·PVS·널 무브·줄여 읽기로 같은 판 수 상한 안에서 더 깊이 본다.
 * 판 수 상한을 넘으면 그 깊이는 버리고 앞 깊이의 결과를 쓴다(기기 속도와 상관없이 늘 같은 수).
 * 앞 깊이의 값 순서대로 뿌리의 수를 읽고, 가장 좋은 값과 `EXPERT_JITTER` 안쪽인 수 가운데 시드로 고른다
 */
export function createChessExpertBot(
  budget = EXPERT_NODE_BUDGET,
  maxDepth = 40,
): ChessBot {
  return botWith("chess-expert", (view, rng) => {
    const pos = view.position;
    if (view.legal.length === 0) return null;
    const mate = view.legal.find((m) => isCheckmate(applyMove(pos, m)));
    if (mate) return mate;
    // 게임 기록(지금 판 포함)을 넣어 탐색 안에서 같은 판 되풀이를 알아본다.
    const ctx = newExpertContext(budget, view.positions);
    const enemy = pos.turn === "w" ? "b" : "w";
    let order = orderMoves(pos, [...view.legal]);
    let best: { move: Move; score: number }[] = [];
    for (let depth = 1; depth <= maxDepth; depth++) {
      const scored: { move: Move; score: number }[] = [];
      let alpha = Number.NEGATIVE_INFINITY;
      for (const move of order) {
        const next = applyMove(pos, move);
        let score: number;
        if (repeatsThrice(view, next)) score = 0;
        else {
          const h = hashOf(next);
          const gives = inCheck(next.board, enemy);
          const search = (lo: number, hi: number) =>
            -searchExpert(next, h, depth - 1, -hi, -lo, ctx, 1, gives);
          if (alpha === Number.NEGATIVE_INFINITY)
            score = search(alpha, Number.POSITIVE_INFINITY);
          else {
            // 가장 좋은 값보다 조금 낮은 선을 넘는지만 먼저 보고(영 창), 넘으면 정확한 값을 다시 읽는다.
            const floor = alpha - EXPERT_JITTER;
            score = search(floor, floor + 1);
            if (!ctx.aborted && score > floor)
              score = search(floor, Number.POSITIVE_INFINITY);
          }
        }
        if (ctx.aborted) break;
        scored.push({ move, score });
        if (score > alpha) alpha = score;
      }
      if (ctx.aborted) break;
      best = scored;
      order = [...scored].sort((a, b) => b.score - a.score).map((s) => s.move);
      const top = Math.max(...scored.map((s) => s.score));
      if (Math.abs(top) > MATE / 2) break;
      // 다음 깊이는 보통 지금까지의 몇 배가 든다. 끝내지 못할 깊이에 판 수를 버리지 않는다.
      if (ctx.nodes > budget * EXPERT_STOP_SHARE) break;
    }
    if (best.length === 0) return view.legal[0] ?? null;
    const top = Math.max(...best.map((s) => s.score));
    return bestOf(
      best.filter((s) => s.score >= top - EXPERT_JITTER),
      rng,
      EXPERT_JITTER,
    );
  });
}

/** 한 깊이를 끝냈을 때 판 수 상한의 이만큼을 넘게 썼으면 더 깊이 가지 않는다 */
const EXPERT_STOP_SHARE = 0.4;

/** 예전 고수(깊이 4, 치환표 없음). 세기 비교에 남겨 둔다 */
export const chessExpertBotV1 = createChessSearchBot();

export const chessExpertBot = createChessExpertBot();

/** 실력 단계(0 입문, 1 중수, 2 고수) */
export function chessBotFor(level: number): ChessBot {
  if (level <= 0) return chessBeginnerBot;
  if (level === 1) return chessIntermediateBot;
  return chessExpertBot;
}

/** 다시 보기 해설에 쓰는 값: 이 판을 둘 차례 편에서 본 값 */
export function positionValue(pos: Position, depth = 2): number {
  return depth <= 0
    ? evaluate(pos.board, pos.turn)
    : negamax(
        pos,
        depth,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        newContext(),
      );
}
