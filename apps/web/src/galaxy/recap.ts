import {
  BANK,
  completeBonusOf,
  type GalaxyBoard,
  type GameEvent,
  isComplete,
  mortgageValue,
  NUMBERS,
  requestById,
  STAR_SQUARES,
  sellValue,
  starAssetOf,
  starAt,
} from "@game/galaxy-engine";

import { money } from "./format";

/**
 * 판 돌아보기(2026-11-05 사용자 「내가 잘 플레이한건지 모르겠음」). 판 끝 결과 화면에서
 * ① 1등(내가 1등이면 2등)과의 차이가 어디서 났는지 항목별로, ② 놓친 기회 한두 개를 사실로 보인다.
 * 사건 기록(모든 별빛 이동이 `pay` 사건으로 남는다)과 끝난 판의 상태만으로 계산하는 순수 함수다.
 * 문구는 짧게 사실만(훈계·감탄 없이)
 */

/** 끝난 판에서 필요한 것(엔진 화면 GalaxyView가 그대로 맞는다) */
export interface RecapState {
  board: GalaxyBoard;
  owners: readonly number[];
  levels: readonly number[];
  mortgaged: readonly boolean[];
  cash: readonly number[];
}

/** 한 사람의 판 돌아보기 항목(별빛) */
export interface RecapLine {
  /** 판 동안 받은 이용료 */
  rentIn: number;
  /** 판 동안 낸 이용료 */
  rentOut: number;
  /** 우주국 지원금 + 관측 지원금 */
  grants: number;
  /** 관측 의뢰를 이뤄 받은 별빛 */
  request: number;
  /** 별자리 완성 보너스(끝날 때 자산에 더한 것) */
  completeBonus: number;
  /** 끝날 때 남은 별빛 */
  cash: number;
  /** 끝날 때 가진 별 값(맡긴 별은 절반) */
  stars: number;
  /** 끝날 때 지은 정거장 값(내릴 때 돌려받는 값) */
  stations: number;
}

export const RECAP_ITEMS: readonly {
  key: keyof RecapLine;
  label: string;
  /** 판 동안 오간 것(flow), 끝날 때 자산(hold) */
  kind: "flow" | "hold";
  /** 낸 쪽이라 적을수록 좋은 항목 */
  cost?: boolean;
}[] = [
  { key: "rentIn", label: "받은 이용료", kind: "flow" },
  { key: "rentOut", label: "낸 이용료", kind: "flow", cost: true },
  { key: "grants", label: "지원금", kind: "flow" },
  { key: "request", label: "관측 의뢰", kind: "flow" },
  { key: "cash", label: "남은 별빛", kind: "hold" },
  { key: "stars", label: "별", kind: "hold" },
  { key: "stations", label: "정거장 값", kind: "hold" },
  { key: "completeBonus", label: "별자리 완성 보너스", kind: "hold" },
];

export function recapLine(
  events: readonly GameEvent[],
  state: RecapState,
  seat: number,
): RecapLine {
  let rentIn = 0;
  let rentOut = 0;
  let grants = 0;
  let request = 0;
  for (const e of events) {
    if (e.type !== "pay") continue;
    if (e.reason === "rent") {
      if (e.to === seat) rentIn += e.amount;
      if (e.from === seat) rentOut += e.amount;
    } else if (
      (e.reason === "salary" || e.reason === "observatory") &&
      e.to === seat &&
      e.from === BANK
    )
      grants += e.amount;
    else if (e.reason === "request" && e.to === seat) request += e.amount;
  }
  let stars = 0;
  let stations = 0;
  for (const sq of STAR_SQUARES) {
    if (state.owners[sq] !== seat) continue;
    const star = starAt(state.board, sq);
    if (!star) continue;
    stars += state.mortgaged[sq]
      ? mortgageValue(state.board, sq)
      : starAssetOf(state.board, sq);
    stations +=
      Math.max(0, (state.levels[sq] ?? 1) - 1) * sellValue(state.board, sq);
  }
  // 완성 덤은 별자리마다 그 별자리 값(g5)
  const completeBonus = state.board.groups.reduce(
    (total, _, g) =>
      isComplete({ board: state.board, owners: [...state.owners] }, seat, g)
        ? total + completeBonusOf(state.board, g)
        : total,
    0,
  );
  return {
    rentIn,
    rentOut,
    grants,
    request,
    completeBonus,
    cash: state.cash[seat] ?? 0,
    stars,
    stations,
  };
}

export interface Recap {
  /** 견준 사람(1등, 내가 1등이면 2등). 혼자 남은 판 등 견줄 사람이 없으면 null */
  rival: number | null;
  me: RecapLine;
  them: RecapLine | null;
  /** 놓친 기회(사실 문장, 많아야 셋) */
  missed: string[];
}

/**
 * 판 돌아보기. `order`는 순위 차례 자리(1등부터, 엔진 standings 차례). 기권·운항 중단 판도 같은 셈이다
 */
export function recapOf(
  events: readonly GameEvent[],
  state: RecapState,
  me: number,
  order: readonly number[],
): Recap {
  const rival = order.find((s) => s !== me) ?? null;
  const mine = recapLine(events, state, me);
  const them = rival === null ? null : recapLine(events, state, rival);
  return {
    rival,
    me: mine,
    them,
    missed: missedChances(events, state, me, them),
  };
}

/** 판 끝에 이만큼 넘게 남긴 별빛을 「쓰지 않은 별빛」으로 짚는다 */
const LEFTOVER_CASH = 300;

function missedChances(
  events: readonly GameEvent[],
  state: RecapState,
  me: number,
  them: RecapLine | null,
): string[] {
  const out: string[] = [];
  // 이루지 못한 관측 의뢰
  for (const e of events)
    if (e.type === "requestRevealed" && e.seat === me && !e.done)
      out.push(
        `관측 의뢰 「${requestById(e.card).title}」 못 이룸 · 이뤘으면 ${money(NUMBERS.requestBonus)} 더`,
      );
  // 하나만 더 있으면 완성인 별자리(다른 사람이 마지막 별을 가졌어도 사실은 같다)
  const near = state.board.groups.filter((g) => {
    const owned = g.squares.filter((sq) => state.owners[sq] === me).length;
    return g.squares.length >= 2 && owned === g.squares.length - 1;
  });
  if (near.length > 0) {
    const size = near[0]?.squares.length ?? 3;
    const names = near.map((g) => g.ko).join("·");
    const label =
      near.every((g) => g.squares.length === size) && size > 1
        ? `${size - 1}/${size}에서 멈춘 별자리 ${near.length}개(${names})`
        : `하나 모자라 완성하지 못한 별자리 ${near.length}개(${names})`;
    out.push(
      `${label} · 하나만 완성했어도 자산 ${money(Math.min(...near.map((g) => completeBonusOf(state.board, state.board.groups.indexOf(g)))))} 더, 이용료 2배`,
    );
  }
  // 끝날 때 쓰지 않은 별빛: 1등보다 많이 남겼을 때만(정거장·별로 바꾸지 않은 별빛)
  const cash = state.cash[me] ?? 0;
  if (cash >= LEFTOVER_CASH && them && cash > them.cash)
    out.push(`끝날 때 쓰지 않은 별빛 ${money(cash)}`);
  return out.slice(0, 3);
}
