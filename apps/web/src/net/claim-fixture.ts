import type { GameKit, KitClaims } from "@/game/kit";

/**
 * 시험용 작은 게임: 판 번호마다 맞는 단추(0~3)가 하나 있다. 방장이 "다음"을 누르면 판이 바뀌고,
 * 누구든 아무 때나 단추를 눌러 청구한다. 맞으면 +1, 틀리면 −1(실시간 청구 1층을 방 전체로 돌려 보는 용도).
 */

export interface ButtonRules {
  players: number;
}

export interface ButtonState {
  board: number;
  scores: number[];
  /** 엔진에 넣은 청구 묶음 수 */
  batches: number;
}

export type ButtonVerdict = "hit" | "miss";

export type ButtonAction =
  | { type: "next" }
  | {
      type: "resolve";
      batch: number;
      hits: { seat: number; verdict: ButtonVerdict }[];
    }
  | { type: "retire" };

export interface ButtonView {
  decision: "next" | null;
  seat: number;
  board: number;
  target: number;
  scores: number[];
}

export type ButtonEvent = { type: "board"; board: number };

export interface ButtonBody {
  button: number;
}

/** 그 판의 맞는 단추. 이웃한 판끼리 늘 다르다 */
export function targetOf(board: number): number {
  return (board * 7 + 3) % 4;
}

function step(
  state: ButtonState,
  seat: number,
  action: ButtonAction,
):
  | { ok: true; state: ButtonState; events: ButtonEvent[] }
  | { ok: false; error: string } {
  if (action.type === "retire") return { ok: true, state, events: [] };
  if (seat !== 0) return { ok: false, error: "방장만 한다" };
  if (action.type === "next") {
    const board = state.board + 1;
    return {
      ok: true,
      state: { ...state, board },
      events: [{ type: "board", board }],
    };
  }
  if (action.batch !== state.batches)
    return { ok: false, error: "묶음 차례가 맞지 않다" };
  const scores = [...state.scores];
  for (const h of action.hits)
    scores[h.seat] = (scores[h.seat] ?? 0) + (h.verdict === "hit" ? 1 : -1);
  return {
    ok: true,
    state: { ...state, scores, batches: state.batches + 1 },
    events: [],
  };
}

export const buttonClaims: KitClaims<
  ButtonView,
  ButtonAction,
  ButtonBody,
  { target: number },
  ButtonVerdict
> = {
  stimulusOf: (view) => view.board,
  board: (view) => ({ target: view.target }),
  isBody: (body): body is ButtonBody =>
    typeof body === "object" &&
    body !== null &&
    Number.isInteger((body as ButtonBody).button) &&
    (body as ButtonBody).button >= 0 &&
    (body as ButtonBody).button < 4,
  judge: (board, claim) =>
    claim.body.button === board.target ? "hit" : "miss",
  action: (resolved) => {
    const hits = resolved.entries.flatMap((e) =>
      e.outcome.status === "judged"
        ? [{ seat: e.claim.seat, verdict: e.outcome.verdict }]
        : [],
    );
    return { type: "resolve", batch: resolved.batch, hits };
  },
  rules: { windowMs: 50, staleBoards: 1, graceMs: 1_000 },
};

export const buttonKit: GameKit<
  ButtonRules,
  ButtonState,
  ButtonView,
  ButtonAction,
  ButtonEvent
> = {
  id: "buttons",
  createMatch: (rules) => ({
    state: {
      board: 0,
      scores: Array.from({ length: rules.players }, () => 0),
      batches: 0,
    },
    events: [],
  }),
  step,
  viewOf: (state, seat) => ({
    decision: seat === 0 ? "next" : null,
    seat,
    board: state.board,
    target: targetOf(state.board),
    scores: [...state.scores],
  }),
  replay(rules, _seed, log) {
    let state = buttonKit.createMatch(rules, 0).state;
    for (const [index, entry] of log.entries()) {
      const r = step(state, entry.seat, entry.action);
      if (!r.ok) return { ok: false, index, error: r.error };
      state = r.state;
    }
    return { ok: true, state };
  },
  pendingSeats: () => [0],
  playerCount: (rules) => rules.players,
  encodeRules: (rules) => `b${rules.players}`,
  decodeRules: (code) => {
    const players = Number(code.slice(1));
    return code.startsWith("b") && players >= 2 && players <= 6
      ? { ok: true, rules: { players } }
      : { ok: false, reason: "규칙이 맞지 않다" };
  },
  startEvents: () => [],
  isOver: () => false,
  retireAction: { type: "retire" },
  stats: {
    roundStarted: () => false,
    roundEnded: () => false,
    gameEnded: () => false,
    roundNumber: (view) => view.board,
    round: () => null,
    game: () => null,
  },
  review: {
    firstExtra: () => undefined,
    prepare: (state) => state,
    cleanup: (state) => state,
    realAction: (action) => action,
    situation: () => ({ voids: [], tally: [] }),
    describe: () => "",
    sortHand: (_state, cards) => [...cards],
    explain: () => ({ situation: [], verdict: null, reasons: [] }),
  },
  claims: buttonClaims,
};
