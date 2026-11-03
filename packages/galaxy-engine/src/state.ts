import type { PlayerClock } from "@game/mighty-engine";

import type { GalaxyBoard } from "./board";
import type { GalaxyRules } from "./rules";

/**
 * 게임의 흐름(docs/48 2-4).
 * commit 자리마다 사슬 약속 → (짧은 판은 reveal로 시작 별 나누기) → turn 차례인 사람이 굴리기·관리
 * → reveal 모든 자리가 고리 공개(눈이 정해져 움직이고 멈춘 칸의 일을 한다)
 * → buy 사기·넘기기 → bid·bidReveal 봉인 입찰 → trade 거래 답 → debt 빚 정리 → turn … → gameOver
 */
export type Phase =
  | "commit"
  | "reveal"
  | "turn"
  | "buy"
  | "bid"
  | "bidReveal"
  | "trade"
  | "debt"
  | "gameOver";

/** 공개 한 번이 정할 것: 시작 별 나누기, 굴리기, 소행성대에서 굴리기, 혜성 굴리기 */
export type RevealPurpose = "deal" | "roll" | "jailRoll" | "comet";

/** 자리마다 해시 사슬(윷놀이와 같은 틀, docs/37 5절) */
export interface ChainState {
  /** 약속(x_0). 아직 내지 않았으면 null */
  commit: string | null;
  /** 마지막으로 확인된 고리(처음에는 약속) */
  last: string | null;
  /** 공개한 고리 수 */
  used: number;
}

/** 지금 차례 */
export interface TurnInfo {
  seat: number;
  /** 이번 차례에 나온 같은 눈 수(세 번째면 소행성대) */
  doubles: number;
  /** 이번 차례에 굴린 수(혜성 굴림 포함) */
  rolls: number;
  /** 이번 차례에 거래를 제안했다(한 차례에 한 번) */
  offered: boolean;
  /**
   * 지금 할 일. roll 굴리기, jailRoll 소행성대에서 굴리기(또는 50 내기), comet 혜성에서 한 번 더 굴리기,
   * end 차례 마치기
   */
  next: "roll" | "jailRoll" | "comet" | "end";
  /** 멈춘 칸의 일을 마치면 한 번 더 굴린다(같은 눈) */
  again: boolean;
}

/** 돈이 옮겨진 까닭 */
export type PayReason =
  | "salary"
  | "rent"
  | "buy"
  | "bid"
  | "build"
  | "sell"
  | "mortgage"
  | "unmortgage"
  | "fine"
  | "card"
  | "observatory"
  | "trade"
  | "bankrupt";

/** 우주국(돈이 사라지거나 생기는 곳) */
export const BANK = -1;

/** 봉인 입찰에서 공개한 값 */
export interface BidReveal {
  value: number;
  salt: string;
  /** 0이 아닌데 규칙에 맞지 않는 값(10 단위가 아님, 가진 별빛보다 많음)이면 false, 내지 않은 것으로 센다 */
  valid: boolean;
}

/** 진행 중인 봉인 입찰 */
export interface Auction {
  /** 입찰 번호(약속 해시에 들어간다) */
  index: number;
  square: number;
  /** 사지 않고 넘긴 사람(같은 값이면 이 사람 다음부터 앞선다) */
  passer: number;
  /** 자리마다 약속. 판에서 빠진 자리는 내지 않는다(null 그대로) */
  commits: (string | null)[];
  reveals: (BidReveal | null)[];
}

/** 끝난 봉인 입찰 */
export interface AuctionResult {
  index: number;
  square: number;
  /** 자리마다 낸 값(내지 않음·잘못된 값은 0, 판에서 빠진 자리는 null) */
  bids: (number | null)[];
  winner: number | null;
  price: number;
}

/** 거래 한쪽이 내놓는 것 */
export interface TradeSide {
  /** 별 칸 번호 */
  stars: number[];
  cash: number;
}

/** 거래 제안(2-8): 제안한 사람이 `give`를 주고 상대에게서 `get`을 받는다 */
export interface TradeOffer {
  from: number;
  to: number;
  give: TradeSide;
  get: TradeSide;
}

/** 갚아야 하는 빚 */
export interface Debt {
  seat: number;
  /** 받을 사람(우주국이면 BANK) */
  to: number;
  amount: number;
  reason: PayReason;
}

/** 판 끝 자리 하나 */
export interface Standing {
  seat: number;
  /** 1부터. 자산·별빛이 같으면 같은 순위 */
  rank: number;
  assets: number;
  cash: number;
  /** 운항 중단으로 빠졌다 */
  out: boolean;
}

/** 게임 결과 */
export interface GameResult {
  kind: /** 정한 차례 수를 마쳤다 */
    | "turns"
    /** 시간 상한에 닿아 그 돌림을 마쳤다 */
    | "timeUp"
    /** 운항 중단(기본·짧은 판은 첫 운항 중단의 차례가 끝날 때) */
    | "bankrupt"
    /** 긴 판에서 한 사람만 남았다 */
    | "lastStanding"
    /** 기권 */
    | "resign"
    /** 개인 시간을 다 썼다 */
    | "time"
    /** 약속·공개를 기다리던 사람 하나를 더 기다리지 않고 끝냈다 */
    | "forfeit";
  /** 기권·시간패·공개 안 함·운항 중단한 자리(없으면 null) */
  seat: number | null;
  /** 순위 차례 */
  standings: Standing[];
}

export interface LastRoll {
  seat: number;
  index: number;
  dice: [number, number];
  purpose: RevealPurpose;
}

export interface GalaxyState {
  rules: GalaxyRules;
  /** 하늘에서 만든 판(바뀌지 않는다) */
  board: GalaxyBoard;
  /** 한 판뿐이다(내 기록·복기 공통 틀이 판 번호를 쓴다) */
  roundNumber: number;
  phase: Phase;
  /** 지금 돌림(모두 한 차례씩, 1부터) */
  round: number;
  /** 지금 계절 변(0~3). 제철 하늘을 끄면 null */
  season: number | null;
  /** 첫 차례 자리(돌림은 이 자리에서 시작한다) */
  starter: number;
  turn: TurnInfo;
  /** 자리마다 우주선이 있는 칸 */
  positions: number[];
  /** 자리마다 별빛 */
  cash: number[];
  /** 운항 중단으로 빠진 자리 */
  out: boolean[];
  /** 소행성대에 걸린 자리 */
  jailed: boolean[];
  /** 칸마다 별 주인(없으면 -1) */
  owners: number[];
  /** 칸마다 정거장 단(0 주인 없음, 1~3단, 4 큰 정거장) */
  levels: number[];
  /** 칸마다 우주국에 맡겼나 */
  mortgaged: boolean[];
  /** 이번 더미에 남은 공문(번호, 다 쓰면 다시 채운다) */
  deck: number[];
  /** 지금까지 한 공개 수(굴림 해시 번호) */
  revealCount: number;
  /** 사슬 세대(다 쓰면 다시 약속한다) */
  generation: number;
  chains: ChainState[];
  /** 이번 공개에 낸 고리(공개 전 null) */
  reveals: (string | null)[];
  /** 지금 기다리는 공개가 정할 것(공개를 기다리지 않으면 null) */
  revealFor: RevealPurpose | null;
  lastRoll: LastRoll | null;
  auction: Auction | null;
  /** 지금까지 연 봉인 입찰 수 */
  auctionCount: number;
  lastAuction: AuctionResult | null;
  trade: TradeOffer | null;
  debt: Debt | null;
  /** 이 차례가 끝나면 판이 끝난다(기본·짧은 판의 운항 중단) */
  endAfterTurn: boolean;
  /** 시간 상한에 닿았다(이 돌림을 마치면 끝) */
  timeUp: boolean;
  /** 우주국으로 사라진 별빛 합 */
  bankIn: number;
  /** 우주국이 준 별빛 합 */
  bankOut: number;
  result: GameResult | null;
  /** 끊긴 사람을 기다리지 않기로 해 중간에 끝났다 */
  retired?: boolean;
  /** 자리마다 개인 시간. 시간 규칙이 없으면 null */
  clocks: PlayerClock[] | null;
  /** 자리마다 재료(시드에서 만든다). 화면에는 그 자리 것만 보인다(`botKey`) */
  keys: string[];
}

export type Action =
  /** 사슬 약속(x_0, 16진수 64자) */
  | { type: "commit"; hash: string }
  /** 이번 공개에 내 사슬 다음 고리를 낸다 */
  | { type: "reveal"; link: string }
  /** 차례인 사람이 굴린다(굴리기·소행성대에서 굴리기·혜성). `spent`는 결정에 쓴 시간(ms) */
  | { type: "roll"; spent?: number }
  /** 소행성대에서 50을 내고 바로 나간다(그다음 굴린다) */
  | { type: "payFine"; spent?: number }
  /** 멈춘 별을 산다 */
  | { type: "buy"; spent?: number }
  /** 사지 않고 넘긴다 → 봉인 입찰 */
  | { type: "pass"; spent?: number }
  /** 봉인 입찰 약속(`bidCommitment`) */
  | { type: "bid"; hash: string }
  /** 봉인 입찰 공개(값 0은 내지 않음) */
  | { type: "bidReveal"; value: number; salt: string }
  /** 거래 제안(굴리기 전 한 번) */
  | {
      type: "offer";
      to: number;
      give: TradeSide;
      get: TradeSide;
      spent?: number;
    }
  | { type: "acceptTrade"; spent?: number }
  | { type: "rejectTrade"; spent?: number }
  /** 정거장 한 단 올리기 */
  | { type: "build"; square: number; spent?: number }
  /** 정거장 한 단 내리기(한 단 값의 절반을 돌려받는다) */
  | { type: "sell"; square: number; spent?: number }
  /** 별 맡기기(별 값의 절반을 받는다) */
  | { type: "mortgage"; square: number; spent?: number }
  /** 맡긴 별 되찾기(별 값의 55%) */
  | { type: "unmortgage"; square: number; spent?: number }
  /** 차례를 마친다 */
  | { type: "end"; spent?: number }
  /** 시간 상한에 닿았다(엔진 밖 시계가 낸다, 이 돌림을 마치면 끝) */
  | { type: "timeUp" }
  /** 결정할 사람이 개인 시간을 다 썼다(방장 시계가 낸다) */
  | { type: "timeout"; spent: number }
  | { type: "resign" }
  /** 게임을 중간에 끝낸다(끊긴 사람을 더 기다리지 않을 때) */
  | { type: "retire" };

export type GameEvent =
  | { type: "gameStarted"; turn: number }
  | { type: "committed"; seat: number }
  | { type: "recommit"; generation: number }
  | { type: "rolled"; seat: number; purpose: RevealPurpose }
  | { type: "revealed"; seat: number }
  /** 짧은 판 시작 별(자리 차례) */
  | { type: "dealt"; stars: number[][] }
  | {
      type: "dice";
      seat: number;
      index: number;
      dice: [number, number];
      doubles: boolean;
      purpose: RevealPurpose;
    }
  | {
      type: "moved";
      seat: number;
      from: number;
      to: number;
      /** 지나간 칸(마지막이 도착 칸). 곧장 가는 공문은 도착 칸만 */
      path: number[];
      /** 앞으로 갔나(뒤로 가는 공문은 false) */
      forward: boolean;
      via: "dice" | "card" | "comet";
    }
  | {
      type: "pay";
      from: number;
      to: number;
      amount: number;
      reason: PayReason;
      /** 관련된 칸(이용료·사기·짓기 등) */
      square?: number;
      /** 관련된 공문 */
      card?: number;
    }
  | { type: "landed"; seat: number; square: number }
  | { type: "card"; seat: number; card: number; squares: number[] }
  | { type: "jailed"; seat: number; by: "card" | "doubles" }
  | { type: "freed"; seat: number; by: "fine" | "doubles" | "wait" }
  | { type: "bought"; seat: number; square: number; price: number }
  | { type: "auctionStarted"; index: number; square: number; passer: number }
  | { type: "bidCommitted"; seat: number }
  | { type: "bidRevealed"; seat: number }
  | { type: "auctionEnded"; result: AuctionResult }
  | { type: "tradeOffered"; offer: TradeOffer }
  | { type: "tradeAccepted"; offer: TradeOffer }
  | { type: "tradeRejected"; offer: TradeOffer }
  | { type: "built"; seat: number; square: number; level: number }
  | { type: "sold"; seat: number; square: number; level: number }
  | { type: "mortgaged"; seat: number; square: number }
  | { type: "unmortgaged"; seat: number; square: number }
  /** 별자리 잇기: 이 사람이 이 별자리 별을 `owned`개 가졌다(2개 이상일 때, 완성이면 owned = size) */
  | { type: "linked"; seat: number; group: number; owned: number; size: number }
  | { type: "debt"; debt: Debt }
  | { type: "bankrupt"; seat: number; to: number }
  | { type: "seasonChanged"; season: number }
  | { type: "turnStarted"; seat: number; round: number }
  | { type: "timeUp" }
  /** `result`가 null이면 순위 없이 중간에 끝냈다 */
  | { type: "gameEnded"; result: GameResult | null; retired?: boolean };

export type Decision =
  | { kind: "commit" }
  | { kind: "reveal"; purpose: RevealPurpose }
  | {
      kind: "roll";
      purpose: "roll" | "jailRoll" | "comet";
      canPayFine: boolean;
      canOffer: boolean;
    }
  | { kind: "end" }
  | { kind: "buy"; square: number; price: number; canAfford: boolean }
  | { kind: "bid"; index: number; square: number; max: number }
  | { kind: "bidReveal"; index: number }
  | { kind: "trade"; offer: TradeOffer }
  | { kind: "debt"; debt: Debt };

/** 화면에 보이는 입찰: 끝나기 전에는 남의 값을 보이지 않는다 */
export interface AuctionView {
  index: number;
  square: number;
  passer: number;
  committed: boolean[];
  revealed: boolean[];
  /**
   * 이 자리가 낸 약속(해시, 아직 안 냈으면 null). 해시라 값이 드러나지 않는다. 내 기기·대신 두는 컴퓨터가
   * 공개할 값과 소금이 이 약속과 맞는지 보려고 둔다(온라인에서 끊긴 사이 방장이 대신 낸 봉투인지 등)
   */
  myCommit: string | null;
}

/** 한 자리에서 본 화면. 남의 재료(`keys`)와 아직 끝나지 않은 입찰 값은 뺀다 */
export interface GalaxyView extends Omit<GalaxyState, "keys" | "auction"> {
  auction: AuctionView | null;
  mySeat: number;
  /** 지금 내가 할 일. 없으면 null */
  decision: Decision | null;
  botKey: string;
}
