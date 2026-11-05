import {
  activeSeats,
  assetsOf,
  BOARD_SIZE,
  type GalaxyState,
  type GalaxyView,
  isComplete,
  NUMBERS,
  rentOf,
  STAR_SQUARES,
  starAt,
  turnLimitOf,
} from "@game/galaxy-engine";

/**
 * 컴퓨터가 판을 셈하는 도움 함수. 모두 화면(`GalaxyView`)에 보이는 값만 쓴다.
 * 별을 사면 자산은 그대로(값이 자산에 들어간다)이고 별빛만 묶인다. 정거장은 짓는 순간 자산이 한 단 값의 절반만큼 줄어
 * 든다(내릴 때 돌려받는 값만 자산, docs/48 2-10). 그래서 컴퓨터는 「앞으로 받을 이용료」와
 * 「짓느라 줄어든 자산」, 「빚 정리에 몰리지 않을 남길 돈」을 견준다.
 */

/** 셈에 쓰는 판 조각(엔진 함수가 받는 모양) */
export type Board = Pick<
  GalaxyState,
  | "board"
  | "owners"
  | "levels"
  | "mortgaged"
  | "cash"
  | "season"
  | "meteor"
  | "moon"
>;

/** 화면으로 수를 따져 보는 상태. 남의 재료와 입찰은 모르므로 비워 둔다(입찰 단계에서는 쓰지 않는다) */
export function asState(view: GalaxyView): GalaxyState {
  const {
    mySeat: _seat,
    decision: _decision,
    botKey: _key,
    auction: _auction,
    ...rest
  } = view;
  return { ...rest, auction: null, keys: view.cash.map(() => "") };
}

/** 남은 돌림(이번 돌림 포함). 차례 수가 없는 긴 판은 25돌림으로 어림한다 */
export function remainingRounds(view: Pick<GalaxyView, "rules" | "round">) {
  const limit = turnLimitOf(view.rules);
  return limit === null ? 25 : Math.max(1, limit - view.round + 1);
}

/** 이 사람에게서 볼 때 남은 상대 차례 수 */
export function opponentTurns(
  view: Pick<GalaxyView, "rules" | "round" | "out">,
  seat: number,
): number {
  const others = activeSeats(view).filter((s) => s !== seat).length;
  return remainingRounds(view) * others;
}

/**
 * 제철·유성우의 밤·달을 빼고 본 판(계절과 달은 판 내내 돌아 모든 별에 한 번씩 온다).
 * 앞일 셈(사기·짓기 값)은 이 판으로, 바로 앞 위험(다음 굴림의 이용료)은 달이 있는 지금 판으로 본다
 */
export function seasonless(b: Board): Board {
  return { ...b, season: null, meteor: false, moon: null };
}

/** 이 사람이 이 칸을 가진 판(1단, 별빛은 그대로) */
export function withOwner(b: Board, square: number, seat: number): Board {
  const owners = [...b.owners];
  const levels = [...b.levels];
  const mortgaged = [...b.mortgaged];
  owners[square] = seat;
  if ((levels[square] ?? 0) < 1) levels[square] = 1;
  mortgaged[square] = false;
  return { ...b, owners, levels, mortgaged };
}

/** 이 사람의 별에서 앞으로 받을 이용료 기댓값(칸마다 밟힘 × 이용료 × 남은 상대 차례) */
export function expectedIncome(
  b: Board,
  seat: number,
  rate: readonly number[],
  turns: number,
): number {
  let total = 0;
  for (const sq of STAR_SQUARES) {
    if (b.owners[sq] !== seat || b.mortgaged[sq]) continue;
    total += rentOf(b, sq) * (rate[sq] ?? 0) * turns;
  }
  return total;
}

/**
 * 완성한 별자리의 「올릴 수 있음」 값: 아직 1단인 별을 2단으로 올리면 늘어날 이용료의 절반만큼.
 * 별자리 완성을 막거나 모으는 값을 셈에 넣는다
 */
export function buildPotential(
  b: Board,
  seat: number,
  rate: readonly number[],
  turns: number,
): number {
  let total = 0;
  b.board.groups.forEach((group, g) => {
    if (!isComplete(b, seat, g)) return;
    if (group.squares.some((sq) => b.mortgaged[sq])) return;
    for (const sq of group.squares) {
      if ((b.levels[sq] ?? 1) !== 1) continue;
      const star = starAt(b.board, sq);
      if (!star) continue;
      const gain =
        (star.value * (NUMBERS.rent.level2 - NUMBERS.rent.complete)) / 1000;
      total += 0.5 * gain * (rate[sq] ?? 0) * turns;
    }
  });
  return total;
}

/** 기대 자산: 자산 + 앞으로 받을 이용료 + 올릴 수 있음 값(고수의 평가) */
export function worth(
  b: Board,
  seat: number,
  rate: readonly number[],
  turns: number,
): number {
  const plain = seasonless(b);
  return (
    assetsOf(plain, seat) +
    expectedIncome(plain, seat, rate, turns) +
    buildPotential(plain, seat, rate, turns)
  );
}

/** 이 칸을 공짜로 얻으면 늘어나는 기대 자산(별 값 포함). 이만큼까지 내도 본전이다 */
export function worthGain(
  b: Board,
  seat: number,
  square: number,
  rate: readonly number[],
  turns: number,
): number {
  return (
    worth(withOwner(b, square, seat), seat, rate, turns) -
    worth(b, seat, rate, turns)
  );
}

/** 남이 가진 별 가운데 지금 이용료가 가장 큰 값(제철 포함) */
export function maxOpponentRent(b: Board, seat: number): number {
  let max = 0;
  for (const sq of STAR_SQUARES) {
    const owner = b.owners[sq] ?? -1;
    if (owner < 0 || owner === seat) continue;
    max = Math.max(max, rentOf(b, sq));
  }
  return max;
}

/** 다음 굴림(2~12칸 앞)에 멈출 수 있는 남의 별 가운데 가장 큰 이용료 */
export function rentAhead(b: Board, seat: number, position: number): number {
  let max = 0;
  for (let k = 2; k <= 12; k++) {
    const sq = (position + k) % BOARD_SIZE;
    const owner = b.owners[sq] ?? -1;
    if (owner < 0 || owner === seat) continue;
    max = Math.max(max, rentOf(b, sq));
  }
  return max;
}

/** 10 단위로 내림(0 아래는 0) */
export function floor10(value: number): number {
  return value <= 0 ? 0 : Math.floor(value / 10) * 10;
}

/** 10 단위로 올림 */
export function ceil10(value: number): number {
  return value <= 0 ? 0 : Math.ceil(value / 10) * 10;
}
