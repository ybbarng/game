import type { OnecardCard, Suit } from "./cards";
import type { OnecardRules } from "./rules";

/**
 * play: 차례인 사람이 내거나 먹는다
 * reshuffle: 먹다가 더미가 바닥나 버린 더미를 다시 섞어 주기를 기다린다(`reshuffle` 행동)
 * over: 판 끝
 */
export type Phase = "play" | "reshuffle" | "over";

/**
 * 외치지 않고 한 장이 된 사람의 창(docs/42 B안 4·5번).
 * self: 본인 시간 P. 본인이 외치면 안전하다. 남의 외침은 헛외침도 잡기도 아니고 `heldBy`에 처음 사람만 적어 둔다
 * catch: 잡기 창 T. 남이 외치면 잡힌다
 * 시간은 엔진이 재지 않는다. 바깥(방장 `LocalMatch`)이 `shoutWindows`로 창을 보고 시간이 다 되면 `timeout`을 넣는다
 */
export interface ShoutWindow {
  /** 판 안에서 창마다 새 번호(바깥 시계가 창을 구별한다) */
  id: number;
  seat: number;
  kind: "self" | "catch";
  /** 본인 시간 안에 외친 남(처음 처리된 사람). P가 끝날 때 본인이 안 외쳤으면 이 사람이 잡은 것이 된다 */
  heldBy: number | null;
}

export type DrawReason =
  /** 낼 카드가 없거나 내기 싫어 한 장 */
  | "draw"
  /** 쌓인 공격 */
  | "attack"
  /** 외치지 않아 잡힘 */
  | "caught"
  /** 헛외침 */
  | "falseShout"
  /** 남이 외쳐 한 장씩(본인 외침 보상) */
  | "reward";

/** 먹을 카드가 남은 일. 더미가 바닥나면 다시 섞은 뒤 이어서 먹는다 */
export interface DrawTask {
  seat: number;
  left: number;
  reason: DrawReason;
}

/** 지난 판 번호에서 판정에 쓸 것만 남긴 기록(늦은 외침을 그 판으로 가린다) */
export interface SeenMark {
  turnNo: number;
  /** 그 판이 시작될 때(차례 행동 직후) 외치지 않은 채 창이 열려 있던 자리 */
  exposed: number[];
}

export interface OnecardResult {
  /** 자리별 등수(1부터). 남은 손패 장 수가 같으면 같은 등수 */
  ranks: number[];
  /** 자리별 점수 = 남은 손패 장 수(낮을수록 좋다). 파산은 파산할 때의 장 수 */
  scores: number[];
  /** 좋은 순서로 늘어놓은 자리 */
  order: number[];
  /** 판이 끝날 때 손패(모두 공개) */
  hands: OnecardCard[][];
}

export interface OnecardState {
  rules: OnecardRules;
  /** 받아들인 행동 수(기록 길이). 외침·창 시간 끝도 센다 */
  version: number;
  /**
   * 판 번호. 판 모양이 바뀌는 차례 행동(내기·먹기·다시 섞기·그만두기)에만 오른다(판 시작은 0).
   * 외침의 `seen`이 가리키는 값이고, 화면은 `viewOf().turnNo`를 그대로 보낸다. 외침·창 시간 끝은 올리지 않는다
   */
  turnNo: number;
  phase: Phase;
  /** 지금 차례 */
  turn: number;
  /** 1: 자리 번호가 커지는 쪽, -1: 반대 */
  direction: 1 | -1;
  /** 남은 더미. 앞이 맨 위 */
  deck: OnecardCard[];
  /** 버린 더미. 끝이 맨 위 */
  pile: OnecardCard[];
  hands: OnecardCard[][];
  /** 지금 맞출 무늬(7로 바꾼 무늬 포함). null이면 아무 카드나(조커 뒤) */
  suit: Suit | null;
  /** 쌓인 공격 장 수. 0이면 공격 없음 */
  attack: number;
  /** 자기 차례에 두 장일 때 미리 외쳤다(다음 낸 카드로 한 장이 되면 외친 것) */
  preCalled: boolean[];
  /** 한 장이고 외쳤다(안전) */
  called: boolean[];
  windows: ShoutWindow[];
  nextWindowId: number;
  /** 먹을 일. 앞부터 처리한다 */
  queue: DrawTask[];
  /** 먹을 일이 끝나면 차례를 넘긴다(차례인 사람이 먹었을 때) */
  endTurnAfterQueue: boolean;
  /** 다 낸 자리(먼저 낸 순서) */
  finished: number[];
  /** 파산한 자리(파산한 순서) */
  bankrupt: number[];
  /** 파산할 때의 손패 장 수(점수). 파산하지 않았으면 0 */
  bankruptCounts: number[];
  /** 최근 판 번호의 판정 재료(`STALE_SEEN` + 1개) */
  recent: SeenMark[];
  result: OnecardResult | null;
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
}

export type Action =
  /** 카드 내기. 7이면 바꿀 무늬 `suit`가 꼭 있어야 하고, 다른 카드에는 없어야 한다 */
  | { type: "play"; card: OnecardCard; suit?: Suit }
  /** 먹기. 공격이 쌓였으면 그만큼, 아니면 한 장. 먹으면 차례가 끝난다 */
  | { type: "draw" }
  /**
   * "원카드!"(가운데 더미 치기). 누구나 언제든 보낸다. `seen`: 누른 순간 화면의 판 번호(`turnNo`).
   * 뜻은 엔진이 가린다(`judgeShout`): 미리 외침·본인 외침·잡기·헛외침
   */
  | { type: "shout"; seen: number }
  /**
   * 창 시간이 다 됐다(바깥 시계가 넣는다). `target`: 창 주인.
   * `id`: 시계를 건 창 번호(`shoutWindows`의 `id`). 지금 열린 창과 다르면 받지 않는다
   * (지우지 못한 옛 시계가 같은 자리의 새 창을 닫지 않게). 없으면 자리·종류로만 찾는다(옛 기록 호환)
   */
  | {
      type: "timeout";
      kind: "selfWindow" | "catchWindow";
      target: number;
      id?: number;
    }
  /** 다시 섞은 더미 순서(앞이 맨 위). `reshuffleRequest`가 준 카드를 섞은 것이어야 한다 */
  | { type: "reshuffle"; order: OnecardCard[] }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

/** 외침 판정 결과(`judgeShout`) */
export type ShoutVerdict =
  /**
   * 자기 차례에 두 장 → 미리 외침.
   * 규칙 `shoutBoth`(기본 켬)면 같은 누름이 남도 잡는다: `alsoCaught`는 잡기 창 안이라 잡힌 사람,
   * `alsoHeld`는 본인 시간 P 안이라 적어만 둔 사람(hold와 같다). 해당하는 사람이 없으면 필드가 없다
   */
  | { kind: "pre"; alsoCaught?: number[]; alsoHeld?: number[] }
  /** 한 장인데 아직 안 외침, 본인 시간 안 → 안전 */
  | { kind: "self" }
  /** 본인 시간이 지나 잡기 창일 때 본인이 외침 → 받지 않는다(벌칙 없음) */
  | { kind: "lateSelf" }
  /** 남이 본인 시간 안에 외침 → 아무 일 없음. P가 끝날 때 본인이 안 외쳤으면 잡기가 된다 */
  | { kind: "hold"; targets: number[] }
  /** 잡기 창 안 → 잡힌 사람이 먹는다. `held`: 같은 판에 본인 시간 안이던 사람(hold와 같이 적어 둔다) */
  | { kind: "catch"; targets: number[]; held: number[] }
  /** 본 판에서는 잡을 수 있었지만 그사이 창이 닫혔다 → 벌칙 없음 */
  | { kind: "late" }
  /** 너무 옛 판을 보고 누름 → 벌칙 없이 버린다 */
  | { kind: "stale" }
  /** 그 밖 → 누른 사람이 먹는다 */
  | { kind: "false" };

/** 사건. 모든 자리에 똑같이 가므로 숨길 정보(먹은 카드, 누가 외치지 않았나)는 넣지 않는다 */
export type GameEvent =
  | { type: "dealt"; first: number; top: OnecardCard }
  /** 첫 카드가 특수 카드라 더미 밑으로 보내고 다시 폈다 */
  | { type: "flipAgain"; card: OnecardCard }
  | {
      type: "played";
      seat: number;
      card: OnecardCard;
      suit: Suit | null;
      attack: number;
    }
  | { type: "drew"; seat: number; count: number; reason: DrawReason }
  | { type: "reshuffleNeeded"; count: number }
  | { type: "reshuffled"; count: number }
  /** 소리·말풍선용. 뜻(`verdict`)은 다른 사건으로 드러나는 것만 담는다 */
  | { type: "shouted"; seat: number }
  | { type: "caught"; seat: number; target: number }
  | { type: "falseShout"; seat: number }
  | { type: "finished"; seat: number; place: number }
  | { type: "bankrupt"; seat: number }
  | { type: "ended"; result: OnecardResult; retired?: boolean };

/** 한 자리에서 본 화면. 남의 손패·더미 순서·누가 외쳤나·창은 숨긴다(docs/42 B안 6번) */
export interface OnecardView {
  rules: OnecardRules;
  mySeat: number;
  /** 기록 길이 */
  version: number;
  /** 지금 판 번호. 외칠 때 `seen`으로 보낸다 */
  turnNo: number;
  phase: Phase;
  turn: number;
  direction: 1 | -1;
  hand: OnecardCard[];
  handCounts: number[];
  deckCount: number;
  /** 버린 더미(모두 본 카드). 끝이 맨 위 */
  pile: OnecardCard[];
  suit: Suit | null;
  attack: number;
  finished: number[];
  bankrupt: number[];
  /** 내가 지금 할 수 있는 차례 행동(내기·먹기). 외침은 늘 할 수 있어 넣지 않는다 */
  moves: Action[];
  result: OnecardResult | null;
  retired?: boolean;
}

export interface LoggedAction {
  seat: number;
  action: Action;
}
