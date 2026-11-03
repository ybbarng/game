import type { HwatuFairSpec } from "@game/fair-play";
import type { RngState } from "@game/mighty-engine";

import type { ClaimMessage, ClaimRules, ClaimsResolved } from "@/net/claim";

/** 컴퓨터 플레이어. 자기 자리에서 보이는 정보만 받는다(마이티·하트 공통 모양) */
export interface KitBot<View, Action, Event = unknown> {
  readonly name: string;
  decide(view: View, rng: RngState): Action;
  /**
   * 차례와 상관없는 반응(원카드 "원카드!" 외침·잡기). 판이 바뀔 때마다 컴퓨터 자리마다 불리고,
   * 행동과 기다릴 시간을 돌려주면 대국을 돌리는 기기(LocalMatch)가 그 시간 뒤에 넣는다.
   * 걸음마다 늘 불리고(사건을 빠짐없이 듣게), 새 계획을 주면 그 자리에 걸어 둔 앞 계획은 버린다. `events`는 이번 걸음의 사건.
   * `recheck`가 있으면 시간이 됐을 때 `action` 대신 그 순간 화면으로 다시 정한다(null이면 넣지 않는다)
   */
  react?(
    view: View,
    events: readonly Event[],
    rng: RngState,
  ): {
    delayMs: number;
    action: Action;
    recheck?: (view: View) => Action | null;
  } | null;
}

/**
 * 엔진이 재지 않는 시간 창 하나(원카드 본인 시간·잡기 창, 은하 한 바퀴 결정 시간). `key`가 같으면 같은 창이다.
 * 시간이 다 되면 이 자리로 `action`을 넣는다. 넣을 행동을 그때 정해야 하면(컴퓨터가 대신 정하기처럼 계산이 들거나
 * 그때 남은 자리를 보고 고를 때) `action` 대신 `later`를 준다. null이면 넣지 않는다
 */
export type KitTimer<Action, State = unknown> = {
  key: string;
  seat: number;
  ms: number;
} & (
  | { action: Action }
  /** 시간이 다 된 순간의 엔진 상태를 받아 넣을 자리와 행동을 정한다 */
  | { later: (state: State) => { seat: number; action: Action } | null }
);

export type StepOutcome<State, Event> =
  | { ok: true; state: State; events: Event[] }
  | { ok: false; error: string };

export interface KitLoggedAction<Action> {
  seat: number;
  action: Action;
  /** 컴퓨터가 둔 수. 판 끝 검증에서 같은 컴퓨터로 다시 계산해 맞춰 본다 */
  bot?: true;
}

/**
 * 내 기록(통계)으로 무엇을 남기나. 내 자리 화면과 사건만 본다(`StatsRecorder`).
 * 판 기록·게임 기록의 모양은 게임마다 정하고, 지표는 그 게임의 통계 화면이 계산한다
 */
export interface KitStats<View, Event> {
  /** 이 사건들로 새 판이 시작했다 */
  roundStarted(events: readonly Event[]): boolean;
  /** 이 사건들로 판 점수가 매겨졌다 */
  roundEnded(events: readonly Event[]): boolean;
  gameEnded(events: readonly Event[]): boolean;
  roundNumber(view: View): number;
  /** 판 기록. `start`는 판이 시작할 때 화면(보지 못했으면 null), `events`는 그 판 사건 모두 */
  round(start: View | null, end: View, events: readonly Event[]): unknown;
  /** 게임 기록. `events`는 게임이 끝난 걸음의 사건 */
  game(view: View, events: readonly Event[]): unknown;
}

/**
 * 복기(다시 보기)를 위해 기록에서 상태를 다시 만들 때 게임마다 다른 것.
 * 멘탈 포커 판은 시드가 패를 정하지 않으므로 판마다 실제 패(`deals`, 판 번호 → 그 판 패)를 넣어 가며 돌린다
 */
export interface KitReview<State, Extra> {
  /** 첫 판 실제 패로 대국을 만들 때의 시작 조건 */
  firstExtra(deals: ReadonlyMap<number, unknown>): Extra | undefined;
  /** 한 걸음 전에: 다음 판(또는 다시 나누기) 실제 패를 상태에 넣는다 */
  prepare(state: State, deals: ReadonlyMap<number, unknown>): State;
  /** 한 걸음 뒤에: 쓰지 않은 미리 정한 패를 지운다 */
  cleanup(state: State, before: State): State;
  /** 멘탈 포커 판의 기록 속 행동(자리 표)을 그 판 실제 카드로 바꾼다. `deal`은 그 판 패 */
  realAction(action: unknown, deal: unknown): unknown;
  /**
   * 상황판: 그 순간 자리별로 떨어진 무늬(선 무늬를 따르지 못한 적이 있다, 무늬 기호)와
   * 점수 요약(여당·야당 점수 카드, 자리별 받은 점수 등)
   */
  situation(state: State): {
    voids: string[][];
    /** `seat`가 있으면 그 자리 이름을 앞에 붙인다 */
    tally: { label: string; value: string; seat?: number }[];
  };
  /** 행동 한 줄 설명(다시 보기에서 실제 수와 고수 수를 견준다) */
  describe(action: unknown): string;
  /** 상황판·펼친 패에 보일 손패 순서(게임 화면과 같은 정렬) */
  sortHand(state: State, cards: readonly string[]): string[];
  /**
   * 걸음 해설: 이 순간 상황과, 다음 수를 고수의 계산으로 본 판단·근거·평가.
   * 계산이 무거워 화면을 그린 뒤에 부른다. `after`는 그 수를 둔 뒤 상태(턴 결과를 말할 때 쓴다)
   */
  explain(
    state: State,
    next: { seat: number; action: unknown },
    after: State | null,
    seed: number,
    name: (seat: number) => string,
  ): Commentary;
}

/** 평가: 좋은 수·괜찮은 수·아쉬운 수·나쁜 수 */
export type Verdict = "good" | "fine" | "slip" | "bad";

/** 다시 보기 걸음 해설 */
export interface Commentary {
  /** 지금 상황 */
  situation: string[];
  /** 고수의 계산으로 본 평가. 계산하지 않는 결정(버리기·프렌드 등)은 null */
  verdict: Verdict | null;
  /** 판단과 근거 */
  reasons: string[];
}

/**
 * 게임 하나를 돌리는 데 필요한 것. 대국 진행(LocalMatch)과 온라인 방(HostRoom·GuestRoom)은
 * 이것만 알고, 어떤 게임(마이티·하트)인지는 모른다.
 * `Extra`는 그 게임만의 시작 조건(마이티의 정해진 패 등)이다.
 */
export interface GameKit<Rules, State, View, Action, Event, Extra = undefined> {
  readonly id: string;
  createMatch(
    rules: Rules,
    seed: number,
    extra?: Extra,
  ): { state: State; events: Event[] };
  step(state: State, seat: number, action: Action): StepOutcome<State, Event>;
  viewOf(state: State, seat: number): View;
  replay(
    rules: Rules,
    seed: number,
    log: readonly KitLoggedAction<Action>[],
    extra?: Extra,
  ): { ok: true; state: State } | { ok: false; index: number; error: string };
  /** 지금 결정해야 하는 자리들 */
  pendingSeats(state: State): number[];
  playerCount(rules: Rules): number;
  encodeRules(rules: Rules): string;
  decodeRules(
    code: string,
  ): { ok: true; rules: Rules } | { ok: false; reason: string };
  /** 방장이 시작할 때 참가자 첫 화면과 함께 보내는 이벤트(나눠 주기 연출 등) */
  startEvents(view: View): Event[];
  /** 게임이 끝났는가(온라인 판 끝 검증을 시작한다) */
  isOver(view: View): boolean;
  /**
   * 게임을 중간에 끝내는 행동. 멘탈 포커 판에서 끊긴 사람을 더 기다리지 않기로 하면(방장·투표) 방장 자리로 낸다.
   * 참가자는 보낼 수 없어야 한다(`guestMayAct`)
   */
  readonly retireAction: Action;
  /** 내 기록에 남길 것 */
  readonly stats: KitStats<View, Event>;
  /** 복기할 때 기록에서 상태를 다시 만든다 */
  readonly review: KitReview<State, Extra>;
  /** 봇이 둘 수 있는 화면인가. 튜토리얼 장면처럼 낼 카드가 떨어지면 멈춘다 */
  botCanAct?(view: View): boolean;
  /** 온라인 참가자가 보낼 수 있는 행동인가(마이티의 그만두기처럼 혼자 할 때만 쓰는 것을 막는다) */
  guestMayAct?(action: Action): boolean;
  /**
   * 내 할 일(`decision`)이 없을 때도 보낼 수 있는 행동인가(체스 무승부 제안처럼 상대 차례에 하는 것).
   * 없으면 참가자는 내 차례에만 보낸다. 받아들일지는 엔진이 다시 정한다
   */
  offTurn?(view: View, action: Action): boolean;
  /** 실력 단계의 컴퓨터. 온라인 판 끝 검증에서 컴퓨터 수를 다시 계산한다 */
  botFor?(level: number): KitBot<View, Action>;
  /** 봇 행동 다듬기(손패 위치 같은 연출 정보) */
  annotateBotAction?(view: View, action: Action): Action;
  /**
   * 개인 시간(판 게임, docs/24). 대국을 돌리는 기기(LocalMatch)가 수마다 쓴 시간을 행동에 싣고,
   * 시간이 다 되면 `timeout` 행동을 기록에 남긴다. 시계 자체는 엔진 상태에 있다
   */
  timing?: KitTiming<State, Action>;
  /**
   * 여러 개가 함께 열리는 시간 창(원카드 외침 창, docs/42 B안 7번). `timing`은 차례 시계 하나만 재고
   * 수마다 다시 걸어, 수가 오가도 그대로 흘러야 하는 창에는 맞지 않는다. LocalMatch가 걸음마다 이 목록을 보고
   * 새 `key`는 그때부터 재고, 사라진 `key`는 지운다
   */
  timers?(state: State): KitTimer<Action, State>[];
  /**
   * 사람·컴퓨터가 아니라 대국을 돌리는 기기가 바로 넣는 행동(원카드 다시 섞기). 없으면 null.
   * `seed`는 대국 씨앗과 기록 길이로 만든 값이라 같은 기록이면 같은 행동이 나온다
   */
  autoAction?(
    state: State,
    seed: number,
  ): { seat: number; action: Action } | null;
  /**
   * 화투처럼 바닥·더미가 있는 카드 게임의 멘탈 포커(fair-play `HwatuFairSpec`). 있으면 암호화방에서
   * 방장도 더미와 남의 손패를 모르게 진행한다(HostRoom·GuestRoom)
   */
  // biome-ignore lint/suspicious/noExplicitAny: 화면 모양은 게임마다 다르다(손패·결정·판 번호만 쓴다)
  cardTable?: HwatuFairSpec<Rules, State, any, Action, Event>;
  /**
   * 실시간 청구(공정한 동시 판정 1층, docs/43). 있으면 온라인 방이 청구를 모두에게 직접 보내고(`ClaimHub`),
   * 방장이 묶음으로 판정해 발표하며, 참가자가 같은 함수로 다시 계산해 맞춰 본다. 없으면 그 게임은 영향이 없다
   */
  // biome-ignore lint/suspicious/noExplicitAny: 청구 내용·판·판정 모양은 게임마다 다르다
  claims?: KitClaims<View, Action, any, any, any>;
  /**
   * 사람이 보낸 것이 아닌 기록(방장 시계·방장이 넣은 행동: `timing.strip`이 null인 것 등)이 규칙대로인지
   * 판 끝 다시 계산에서 본다. 그런 기록은 「내가 보낸 것」 대조와 컴퓨터 수 대조를 건너뛰므로, 꼬리표만 달면
   * 아무 행동이나 넣을 수 있는 구멍을 막는다. null이면 통과, 글이면 판 끝 검증 실패 까닭
   */
  verifyUnsigned?(input: {
    /** 이 기록을 넣기 직전 상태(다시 계산 중인 상태) */
    before: State;
    seat: number;
    action: Action;
    /** 기록 번호(0부터) */
    index: number;
    context: VerifyContext;
  }): string | null;
}

/**
 * 실시간 청구를 쓰는 게임이 채우는 것(docs/43 4-1 `KitRealtime`의 1층 부분).
 * 판정은 늘 청구가 가리킨 판(`seen`) 기준이다. 벌칙·점수는 `action`이 돌려준 행동으로 엔진이 매긴다
 */
export interface KitClaims<
  View,
  Action,
  Body = unknown,
  Board = unknown,
  Verdict = unknown,
> {
  /** 이 화면의 판 번호. 판이 바뀔 때(원카드: 카드가 열릴 때) 1씩 는다. 모든 자리에서 같아야 한다 */
  stimulusOf(view: View): number;
  /**
   * 지난 판을 판정하려고 남길 최소한의 공개 정보(원카드: 맨 위 카드와 자리별 장 수). 모든 자리의 화면에서 같아야 한다.
   * 각 기기가 판 번호마다 남겨 두고, 받은 청구를 그 판으로 다시 판정한다. JSON으로 견줄 수 있는 값
   */
  board(view: View): Board;
  /** 청구 내용 모양 검사(받은 값은 믿지 않는다) */
  isBody(body: unknown): body is Body;
  /** `seen` 판에서 이 청구가 어떤가(순수 함수, 결과는 JSON으로 견줄 수 있는 값). 원카드: 외침·잡기·헛외침 */
  judge(board: Board, claim: ClaimMessage<Body>): Verdict;
  /**
   * 방장 발표를 엔진 행동으로(방장 자리로 낸다). 기록에 남아 판 끝 검증(`replay`)이 같은 결과를 낸다.
   * 넣을 것이 없으면 null
   */
  action(resolved: ClaimsResolved<Body, Verdict>): Action | null;
  /** 판정 규칙 값(없으면 `CLAIM_RULES`) */
  rules?: Partial<ClaimRules>;
}

/** `verifyUnsigned`에 주는 게임별 추가 재료 */
export interface VerifyContext {
  /** 원카드: 방장이 발표한 청구 판정(원카드가 채운다) */
  claimsResolved?: readonly unknown[];
  /** 대기실이 컴퓨터로 적은 자리 */
  botSeats?: ReadonlySet<number>;
}

export interface KitTiming<State, Action> {
  /** 지금 시계가 가는 자리와 그 사람이 쓸 수 있는 남은 시간(ms). 시간 규칙이 없거나 둘 때가 아니면 null */
  turn(state: State): { seat: number; left: number } | null;
  /** 이 행동에 쓴 시간(ms)을 싣는다. 시간과 상관없는 행동(다음 판·기권 등)은 그대로 */
  stamp(action: Action, spent: number): Action;
  /** 시간을 다 썼을 때 그 자리로 기록에 남기는 행동 */
  timeout(spent: number): Action;
  /**
   * 참가자가 보낸 그대로의 행동으로 되돌린다(판 끝 검증에서 내가 보낸 행동과 맞춰 볼 때).
   * 쓴 시간을 빼고, 방장 시계가 남긴 시간패는 null
   */
  strip(action: Action): Action | null;
  /**
   * 시계가 가는 사람의 차례를 끝내지 않는 행동인가(체스 무승부 제안·거절 등).
   * 그런 행동 뒤에는 생각 시간을 처음부터 다시 재지 않고 이어 잰다. 없으면 모든 행동이 새로 잰다
   */
  keepsTurn?(action: Action): boolean;
}
