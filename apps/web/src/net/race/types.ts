/**
 * 경주 틀(docs/47 9절, docs/46 3절)의 계약. 이 틀은 게임을 모른다.
 * 같은 섞기를 여럿이 각자 풀고 시간으로 겨루는 게임(큐브 맞추기 등)이 `RaceGame`만 넘겨 붙는다.
 */

/** 게임이 경주 틀에 넘기는 것. 모두 순수 함수여야 한다(같은 입력 → 같은 출력) */
export interface RaceGame<Move, State> {
  id: string;
  /** 씨앗 → 섞인 시작 상태. 기기마다 같은 상태가 나와야 한다 */
  startState(seed: string, options: unknown): State;
  /** 둘 수 없는 수면 throw */
  apply(state: State, move: Move): State;
  isSolved(state: State): boolean;
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
}

/** 그럴듯함 검사 기준. 게임이 넘긴다. 결과(순위)는 바꾸지 않고 표시만 한다(docs/46 3-4) */
export interface SuspicionRules {
  /** 몰아친 수를 세는 창(ms). 기본 500 */
  windowMs?: number;
  /** 창 안 수가 이보다 많으면 표시. 없으면 보지 않는다 */
  maxMovesInWindow?: number;
  /** 전체 수 수가 이보다 적으면 표시. 없으면 보지 않는다 */
  minMoves?: number;
}

export interface RaceOptions {
  /** 살펴보기(ms). 기본 15000. 이 동안 면 돌리기는 거절한다 */
  inspectionMs?: number;
  /** 풀림부터 잰 제한 시간(ms) */
  timeLimitMs: number;
  /** 도착 시각 하한의 고정 여유(ms). 기본 200(docs/46 3-2) */
  capMs?: number;
  /** 수를 묶어 보내는 간격(ms). 기본 50 */
  batchMs?: number;
  /** 시도를 시작하고 약속을 기다리는 시간(ms). 기본 5000 */
  commitTimeoutMs?: number;
  /** 내 공개값을 보낸 뒤 남의 공개값을 기다리는 시간(ms). 기본 5000 */
  revealTimeoutMs?: number;
  /** 제한 시간이 지난 뒤 늦게 닿는 "맞췄다"와 하한을 더 기다리는 시간(ms). 기본 3000 */
  resultGraceMs?: number;
  suspicion?: SuspicionRules;
  /** `startState`에 그대로 넘긴다 */
  gameOptions?: unknown;
}

export type PlayResult =
  | { ok: true; solved: boolean }
  | {
      ok: false;
      reason: "섞기 전" | "살펴보기 중" | "끝남" | "둘 수 없는 수" | "관전";
    };

export interface SuspicionFlags {
  /** 창 안 최대 수 */
  maxMovesInWindow: number;
  /** 위를 초당으로 바꾼 값 */
  peakMovesPerSecond: number;
  burst: boolean;
  fewMoves: boolean;
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
  /** 인정한 시간 = max(보고, 쓴 하한) */
  accepted?: number;
  /** 다른 사람마다 본 하한. null이면 끊김 등으로 "확인 약함"이라 쓰지 않은 값 */
  bounds?: Record<string, number | null>;
  /** 쓴 하한(약하지 않은 하한의 가운데 값). 없으면 null */
  usedBound?: number | null;
  /** 쓸 수 있는 하한이 하나도 없어 보고 시간을 그대로 쓴 판 */
  weak?: boolean;
  flags?: SuspicionFlags;
}

export interface RaceResult {
  /** 앞선 순서. 맞춘 사람(인정 시간 순) → 못 맞춘 사람 → 기권 */
  ranking: string[];
  players: Record<string, PlayerResult>;
  /** 남은 사람이 둘 아래라 경주를 열지 못했을 때 */
  cancelled?: string;
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
