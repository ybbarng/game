/**
 * 대결 틀(docs/47 9절, docs/46 3절)의 계약. 이 틀은 게임을 모른다.
 * 같은 섞기를 여럿이 각자 풀고 시간으로 겨루는 게임(큐브 맞추기 등)이 `RaceGame`만 넘겨 붙는다.
 */

/** 게임이 대결 틀에 넘기는 것. 모두 순수 함수여야 한다(같은 입력 → 같은 출력) */
export interface RaceGame<Move, State> {
  id: string;
  /** 씨앗 → 섞인 시작 상태. 기기마다 같은 상태가 나와야 한다 */
  startState(seed: string, options: unknown): State;
  /** 둘 수 없는 수면 throw */
  apply(state: State, move: Move): State;
  /**
   * 끝났나. `player`는 그 상태의 주인(사람마다 목표가 다른 게임, 큐브 핸디캡 「목표 다르게」). 모든 기기가 같은 답을
   * 내야 하므로 사람마다 다른 규칙은 판정 설정 지문(`RaceOptions.gameOptions`)에 실어 맞춰 본다
   */
  isSolved(state: State, player?: string): boolean;
  /** 0~1 진행 막대 */
  progress(state: State): number;
  encodeMove(move: Move): string;
  decodeMove(text: string): Move;
  /**
   * 씨앗에서 시작 상태를 만드는 데 시간이 드는 게임(웹 워커에서 섞기 등)은 여기서 미리 만들어 둔다.
   * Promise면 끝날 때까지 기다린 뒤 `startState`를 부른다. 살펴보기 시계는 씨앗을 안 순간부터 이미 흐른다
   * (늦게 만든 기기가 시간을 벌지 못하게). 실패하면 이 기기는 그 판 기권
   */
  prepare?(seed: string, options: unknown): Promise<void> | void;
  /**
   * 시작 상태의 지문(예: 섞기 글). 씨앗을 알리는 `race-seed`에 실어 모두 같은지 맞춰 본다.
   * 기기마다 섞기를 다르게 만들었으면(해법기 판이 다름 등) 다른 사람을 "섞기 어긋남"으로 본다
   */
  startFingerprint?(seed: string, options: unknown): string;
  /** 이 게임이 쓰는 그만두기 까닭(`RaceSession.retire`). 남이 보낸 까닭은 대결 틀 목록과 이것 안에서만 받는다 */
  retireReasons?: readonly string[];
  /**
   * 이 수(`encodeMove` 글)가 수 수로 세는 수인가. 큐브는 큐브 돌리기(x·y·z)를 세지 않는다.
   * 없으면 모두 센다. 의심 표시(수가 적음·고른 간격·첫 수 빠르기)가 이것으로 센다
   */
  isTurn?(move: string): boolean;
}

/** 그럴듯함 검사 기준. 게임이 넘긴다. 결과(순위)는 바꾸지 않고 표시만 한다(docs/46 3-4) */
export interface SuspicionRules {
  /** 몰아친 수를 세는 창(ms). 기본 500 */
  windowMs?: number;
  /** 창 안 수가 이보다 많으면 표시. 없으면 보지 않는다 */
  maxMovesInWindow?: number;
  /** 센 수(`RaceGame.isTurn`)가 이보다 적으면 표시. 없으면 보지 않는다 */
  minMoves?: number;
  /**
   * 수 사이 간격이 지나치게 고르면 표시: 센 수가 `evenMinMoves` 이상이고 간격의 변동 계수(표준편차/평균)가
   * `evenCv`보다 작을 때. 없으면 보지 않는다
   */
  evenCv?: number;
  evenMinMoves?: number;
  /** 풀린 뒤 첫 `fastStartMoves`수(센 수)를 `fastStartMs` 안에 두면 표시. 없으면 보지 않는다 */
  fastStartMoves?: number;
  fastStartMs?: number;
}

export interface RaceOptions {
  /** 살펴보기(ms). 기본 15000. 이 동안 면 돌리기는 거절한다 */
  inspectionMs?: number;
  /** 풀림부터 잰 제한 시간(ms) */
  timeLimitMs: number;
  /** 도착 시각 하한의 고정 여유(ms). 기본 200(docs/46 3-2) */
  capMs?: number;
  /**
   * 하한을 낸 기기가 하나뿐일 때(1:1 등) 하한이 보고보다 이만큼(ms) 넘게 늦으면 가르지 않고 「확인 안 됨」으로 둔다.
   * 기본 1000(docs/47 9-2)
   */
  disputeMs?: number;
  /** 수를 묶어 보내는 간격(ms). 기본 50 */
  batchMs?: number;
  /** 시도를 시작하고 약속을 기다리는 시간(ms). 기본 5000 */
  commitTimeoutMs?: number;
  /** 내 공개값을 보낸 뒤 남의 공개값을 기다리는 시간(ms). 기본 5000 */
  revealTimeoutMs?: number;
  /** 제한 시간이 지난 뒤 늦게 닿는 "맞췄다"와 하한을 더 기다리는 시간(ms). 기본 3000 */
  resultGraceMs?: number;
  suspicion?: SuspicionRules;
  /**
   * 사람마다 출발 늦추기(ms, 풀림부터). 그 사람은 이 시각 전에 수를 둘 수 없다(살펴보기는 그대로).
   * 다른 기기는 보고 시각이 이보다 이르거나, 도착 시각이 이보다 이른 때를 증명하는 수를 받으면 그 사람을 DNF로 본다.
   * 0보다 큰 값이 있으면 판정 설정 지문에 넣는다(없으면 예전 지문 그대로)
   */
  startDelayMs?: Record<string, number>;
  /** `startState`에 그대로 넘긴다 */
  gameOptions?: unknown;
}

export type PlayResult =
  | { ok: true; solved: boolean }
  | {
      ok: false;
      reason:
        | "섞기 전"
        | "살펴보기 중"
        | "출발 전"
        | "끝남"
        | "둘 수 없는 수"
        | "관전";
    };

export interface SuspicionFlags {
  /** 창 안 최대 수 */
  maxMovesInWindow: number;
  /** 위를 초당으로 바꾼 값 */
  peakMovesPerSecond: number;
  burst: boolean;
  fewMoves: boolean;
  /** 수 사이 간격이 지나치게 고름(사람 손이라기엔). 기준이 없으면 false */
  even: boolean;
  /** 풀린 뒤 첫 몇 수가 사람 손 빠르기를 넘음. 기준이 없으면 false */
  fastStart: boolean;
  /** 간격의 변동 계수(센 수가 둘 이하면 null) */
  intervalCv: number | null;
}

export type PlayerStatus = "done" | "dnf" | "forfeit";

/** 한 사람의 판 결과. 모든 기기가 같은 값을 낸다(같은 메시지를 받았다면) */
export interface PlayerResult {
  id: string;
  status: PlayerStatus;
  /** dnf·forfeit의 까닭 */
  reason?: string;
  moves: number;
  /** 본인이 보고한 시간(ms, 풀림 기준) */
  reported?: number;
  /** 인정한 시간 = max(보고, 쓴 하한). 다툼이면 없다 */
  accepted?: number;
  /** 다른 사람마다 본 하한. null이면 끊김 등으로 "확인 약함"이라 쓰지 않은 값 */
  bounds?: Record<string, number | null>;
  /** 쓴 하한(약하지 않은 하한의 가운데 값). 없으면 null */
  usedBound?: number | null;
  /** 증인이 있었는데 쓸 수 있는 하한이 하나도 없어(끊김) 보고 시간을 그대로 쓴 판 */
  weak?: boolean;
  /**
   * 「확인 안 됨: 두 기기 기록이 다름」. 하한을 낸 기기가 하나뿐인데 하한이 보고보다 `disputeMs` 넘게 늦다.
   * 누가 거짓인지(증인이 부풀렸나, 본인이 줄였나) 가릴 수 없어 어느 값도 믿지 않는다: `accepted`가 없고
   * 순위 없음(`unranked`). 두 값(reported·usedBound)을 함께 보인다
   */
  disputed?: boolean;
  /** 맞췄지만 시간을 판정하지 못해 순위에 넣지 않는다(지금은 `disputed`일 때) */
  unranked?: boolean;
  /** 센 수(`RaceGame.isTurn`). 게임이 넘기지 않으면 없다 */
  turns?: number;
  flags?: SuspicionFlags;
}

export interface RaceResult {
  /** 앞선 순서. 맞춘 사람(인정 시간 순) → 맞췄지만 순위 없음(다툼) → 못 맞춘 사람 → 기권 */
  ranking: string[];
  players: Record<string, PlayerResult>;
  /** 남은 사람이 둘 아래라 대결을 열지 못했을 때 */
  cancelled?: string;
  /**
   * 판정 없음(무효): 판에 든 사람이 둘 이하인데 한 사람의 시간이 다툼(`disputed`)이다. 순위·승패를 매기지 않고
   * 경기 누적(먼저 N판·5판 평균)에도 넣지 않는다
   */
  noDecision?: boolean;
}

export type RacePhase =
  | "commit"
  | "reveal"
  | "inspect"
  | "race"
  | "waiting"
  | "finished";

export interface PeerView {
  id: string;
  connected: boolean;
  out: boolean;
  moves: number;
  progress: number;
  status: "playing" | PlayerStatus;
  /** 보고 시간(맞췄다고 알린 뒤) */
  reported?: number;
}

export interface RaceSnapshot {
  phase: RacePhase;
  attempt: number;
  /** 씨앗. 정해진 뒤에만 */
  seed?: string;
  /** 이 기기가 기권 처리되어 보기만 하는 중 */
  spectator: boolean;
  /** 씨앗은 정했고 시작 상태를 만드는 중(`RaceGame.prepare`). phase는 "reveal" */
  preparing?: boolean;
  /** 풀림까지 남은 시간(ms). 살펴보기 중에만 */
  inspectionLeft?: number;
  /** 풀림 뒤 지난 시간(ms) */
  elapsed?: number;
  peers: PeerView[];
  /** 이 기기에서만 본 것(결과 비교에는 넣지 않는다): 수마다 하한보다 이른 시각을 단 수의 수 */
  lateMoves: Record<string, number>;
  result?: RaceResult;
}
