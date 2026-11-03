import { nextFloat, nextInt } from "@game/mighty-engine";
import {
  type Cell,
  other,
  type Stone,
  stopsOf,
  type Variant,
  winningFirstMoves,
  winningLine,
} from "@game/omok-engine";

import {
  anyLegal,
  forced,
  type OmokBot,
  placeWith,
  ranked,
  WIN,
} from "./common";
import { evaluate } from "./shape";

export type { OmokBot } from "./common";

/**
 * 입문: 이기는 수와 다섯 막기는 본다. 그 밖에는 막는 값을 반만 쳐서 위쪽 여섯 자리 중 무작위.
 * 열린 삼을 자주 놓쳐 처음 두는 사람도 이길 수 있다
 */
export const omokBeginnerBot: OmokBot = {
  name: "omok-beginner",
  decide: placeWith((board, stone, variant, rng) => {
    const list = ranked(board, stone, variant, 0.5, 6);
    return (
      list[nextInt(rng, list.length)]?.at ?? anyLegal(board, stone, variant)
    );
  }),
};

/** 중수: 공격과 막기를 같은 값으로 보고 가장 좋은 자리. 같은 점수면 무작위 */
export const omokIntermediateBot: OmokBot = {
  name: "omok-intermediate",
  decide: placeWith((board, stone, variant, rng) => {
    const list = ranked(board, stone, variant, 1, 12);
    const best = list[0];
    if (!best) return anyLegal(board, stone, variant);
    const ties = list.filter((m) => m.score === best.score);
    return ties[nextInt(rng, ties.length)]?.at ?? best.at;
  }),
};

/** 앞수 읽기에서 한 걸음마다 볼 후보 수 */
const WIDTH = 9;

/** `stone` 차례에서 볼 후보: 이길 수가 있으면 그것만, 상대 다섯을 막아야 하면 그곳만 */
function searchMoves(board: Cell[], stone: Stone, variant: Variant): number[] {
  const must = forced(board, stone, variant);
  if (must !== null) return [must];
  return ranked(board, stone, variant, 1, WIDTH).map((m) => m.at);
}

function negamax(
  board: Cell[],
  stone: Stone,
  variant: Variant,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (depth === 0) return evaluate(board, stone);
  const moves = searchMoves(board, stone, variant);
  if (moves.length === 0) return 0;
  let best = -Infinity;
  let a = alpha;
  for (const at of moves) {
    board[at] = stone;
    const score =
      winningLine(board, at, variant) !== null
        ? WIN + depth
        : -negamax(board, other(stone), variant, depth - 1, -beta, -a);
    board[at] = 0;
    if (score > best) best = score;
    if (best > a) a = best;
    if (a >= beta) break;
  }
  return best;
}

/** 사로 몰아붙이기를 읽는 길이(내 수, 마지막 다섯 포함) */
const VCF_MOVES = 4;

/**
 * 상대가 사로 몰아 이기는 길이 있으면, 그 길을 끊는 자리들(판의 모든 빈칸을 본다, 엔진 `stopsOf`).
 * 길이 없으면 null, 끊을 자리가 없으면 빈 배열(어차피 진다)
 */
function stopsAgainstFours(
  board: Cell[],
  stone: Stone,
  variant: Variant,
): number[] | null {
  return stopsOf(board, other(stone), variant, VCF_MOVES);
}

/**
 * 앞수 읽기 봇. 모양 점수로 후보를 추려 `depth`수 앞까지 읽는다(알파베타). 같은 값이면 앞 순위.
 * `readFours`면 먼저 사로 몰아 이기는 길이 있는지 보고 그대로 두며, 상대에게 그런 길이 있으면 끊는 자리 가운데서 고른다
 * (고수는 읽지 않는다. 초고수의 바탕)
 */
export function createOmokSearchBot(depth = 4, readFours = false): OmokBot {
  return {
    name: readFours ? `omok-fours-${depth}` : `omok-search-${depth}`,
    decide: placeWith((board, stone, variant, rng) => {
      let moves = searchMoves(board, stone, variant);
      if (readFours) {
        const win = winningFirstMoves(board, stone, variant, VCF_MOVES)[0];
        if (win !== undefined) return win;
        const stops = stopsAgainstFours(board, stone, variant);
        if (stops && stops.length > 0) {
          // 모양 점수 순서를 지키며 끊는 자리만 남긴다(점수 밖의 끊는 자리는 뒤에 붙인다).
          const set = new Set(stops);
          const ordered = ranked(board, stone, variant, 1)
            .map((m) => m.at)
            .filter((at) => set.has(at));
          moves = [
            ...ordered,
            ...stops.filter((at) => !ordered.includes(at)),
          ].slice(0, WIDTH);
        }
      }
      let bestAt = moves[0] ?? anyLegal(board, stone, variant);
      let best = -Infinity;
      for (const at of moves) {
        board[at] = stone;
        const score =
          winningLine(board, at, variant) !== null
            ? WIN
            : -negamax(
                board,
                other(stone),
                variant,
                depth - 1,
                -Infinity,
                -best,
              );
        board[at] = 0;
        // 거의 같은 수끼리는 조금 흔들어 매번 같은 판이 되지 않게 한다.
        const jitter = nextFloat(rng) * 0.5;
        if (score + jitter > best) {
          best = score + jitter;
          bestAt = at;
        }
      }
      return bestAt;
    }),
  };
}

export const omokExpertBot = createOmokSearchBot(4);

export { omokMasterBot } from "./master";

import { omokMasterBot } from "./master";

/** 실력 단계(0 입문, 1 중수, 2 고수, 3 초고수) */
export function omokBotFor(level: number): OmokBot {
  if (level <= 0) return omokBeginnerBot;
  if (level === 1) return omokIntermediateBot;
  if (level === 2) return omokExpertBot;
  return omokMasterBot;
}
