import { botSkillText, fitTargetMs, readBotSkill } from "@game/cube-ai";
import type { CubeMove } from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import { RaceSession } from "@/net/race/race-session";
import type {
  PlayResult,
  RaceOptions,
  RaceResult,
  SuspicionRules,
} from "@/net/race/types";
import { randomId, type Transport } from "@/net/transport";
import {
  type ShapeRule,
  shapeFor,
  shapePicks,
  shapeRuleOk,
  shapeSupports,
} from "../patterns/race";
import {
  attachBot,
  type BotHandle,
  botSupports,
  botVerifiable,
  type PlanFn,
} from "./bot-racer";
import {
  type ActiveHandicap,
  activeHandicap,
  averagesOk,
  type Baseline,
  cleanAverages,
  type Handicap,
  handicapOk,
  hasHandicap,
  scoreByAverage,
} from "./handicap";
import { RaceHub } from "./hub";
import { findMarksOf } from "./item-find";
import {
  type drawItem,
  FIND_MS,
  GRAY_MS,
  hitText,
  type ItemKind,
  itemUseText,
  parseItemText,
  rewindMoves,
  SCREEN_HIT_MS,
  SWAP_MS,
  trackOf,
} from "./items";
import {
  hasHp,
  hasItems,
  type ItemsOutcome,
  judgeParty,
  PARTY_KO,
  PARTY_MODES,
  PARTY_OVER,
  type PartyMode,
  type PartyOutcome,
} from "./party";
import {
  type CubeAct,
  type CubeRaceGame,
  createCubeRaceGame,
  type RaceShape,
  type Scrambler,
} from "./race-game";
import {
  decidedRounds,
  type MatchFormat,
  type MatchRules,
  matchOver,
  type PartySummary,
  POINTS_ROUNDS,
  type RoundSummary,
  SCORING_LABELS,
  type Scoring,
} from "./standings";

/**
 * 큐브 대결 방(docs/47 9절). 대기실·판 시작·판 결과 모으기를 맡고, 한 판의 공정한 진행은 대결 틀(`RaceSession`)이 한다.
 *
 * - 방장이 방 상태(설정·참가자·지금 판)를 정해 모두에게 알린다(`cube-room`). 판정에는 끼지 않는다.
 * - 손님은 들어오면 이름을 알린다(`cube-hello`). 판 도중에 온 사람은 다음 판부터 든다.
 * - 컴퓨터는 방장 기기가 돌린다. 대결 틀에는 방장 기기가 맡은 참가자 하나로 보인다(`RaceHub`).
 * - 판 결과는 각 기기가 자기 대결 틀에서 얻는다(같은 메시지를 받았으면 같은 값). 종합 순위도 각자 계산한다.
 * - 진짜 연결이 없으면(컴퓨터와 대결) 방장 혼자 + 컴퓨터로 같은 길을 쓴다.
 */

export interface RoomSettings {
  n: number;
  format: MatchFormat;
  /** 먼저 N판 이기기의 N */
  target: number;
  /**
   * 점수제 판 수(3·5·7)와 점수. 옛 판 방장은 보내지 않는다(점수제를 모른다). 점수제일 때만 판정 설정 지문에 넣는다
   * (`raceOptionsFor`)
   */
  rounds?: number;
  scoring?: Scoring;
  /** 살펴보기 15초(false면 없음) */
  inspection: boolean;
  /** 제한 시간(초) */
  timeLimitSec: number;
  /**
   * 실력 차 균형(docs/51 4절: 출발 늦추기·목표·평균 대비·도움). 옛 판 방장은 보내지 않는다. 쓸 때만 판정 설정 지문에
   * 넣는다(`raceOptionsFor`)
   */
  handicap?: Handicap;
  /**
   * 파티 모드(docs/51 3-2·3-3, docs/47 9-6·9-7). `"hp"` 체력바, `"items"` 아이템전, `"hp-items"` 둘 다.
   * 옛 판 방장은 보내지 않는다(일반 대결). 5판 평균(시간 평균)·핸디캡 「평균 대비」와는 함께 쓰지 않는다
   */
  party?: PartyMode;
  /**
   * 모양 만들기(docs/47 9-10): 판마다 목표 모양(`shapeFor`)을 먼저 만든 사람이 이긴다. 옛 판 방장은 보내지 않는다.
   * 파티 모드·핸디캡 「목표 다르게」·「평균 대비」와는 함께 쓰지 않는다. 쓸 때만 판정 설정 지문에 넣는다(`raceOptionsFor`)
   */
  shape?: ShapeRule;
}

export type { PartyMode, ShapeRule };

/** 대결 틀의 다툼 폭(기본값과 같다). 체력 판정이 중간 지점 시각을 같은 규칙으로 본다 */
const DISPUTE_MS = 1_000;

/**
 * 크기별 기본 제한 시간(초). 가장 느린 컴퓨터(입문)도 시간 안에 맞추게 넉넉히 둔다(가장 긴 판의 1.5배 넘게).
 * 입문 계획 길이(2026-11-05 bench `balance.strength.ts`, docs/47 10-1 표): 2×2 평균 45초, 3×3 2분, 4×4 5분, 5×5 9분.
 * 그래서 2×2 3분, 3×3 5분, 4×4 10분, 5×5 15분
 */
export const TIME_LIMIT_SEC: Record<number, number> = {
  2: 180,
  3: 300,
  4: 600,
  5: 900,
};

export const DEFAULT_SETTINGS: RoomSettings = {
  n: 3,
  format: "single",
  target: 3,
  rounds: 5,
  scoring: "wins",
  inspection: true,
  timeLimitSec: TIME_LIMIT_SEC[3] as number,
};

export const MAX_PLAYERS = 8;
export const NAME_MAX = 12;

export interface RoomPlayer {
  id: string;
  name: string;
  /** 이 참가자를 맡은 기기(연결 아이디) */
  device: string;
  /**
   * 컴퓨터 단계 글(`@game/cube-ai` `botSkillText`: 「2:club」, 「내 실력에 맞춤」은 「2:fit:45000」). 앞 숫자는 계획 표
   * 버전이라 다른 버전 기기는 계획을 맞춰 보지 않는다. 버전 없는 옛 값(「beginner」 등)은 옛 계획으로 맞춰 본다
   */
  bot?: string;
  /**
   * 그 사람 기기가 알린 크기별 내 평균(ms, 키 "2"~"5", 혼자 맞추기 기록, `recentAverage`). 「평균 대비」와 출발 늦추기
   * 추천에 쓴다. 각 기기의 기록이라 확인할 수 없다(친구끼리 믿는 모드)
   */
  avgs?: Record<string, number>;
}

export type RoomStatus = "lobby" | "racing" | "between" | "over";

export interface RoomState {
  v: number;
  host: string;
  settings: RoomSettings;
  players: RoomPlayer[];
  /** 지금(또는 마지막) 판 번호. 대기실이면 0 */
  round: number;
  race?: { id: string; players: string[] };
  status: RoomStatus;
}

export interface RoundRecord extends RoundSummary {
  race: string;
  round: number;
  players: string[];
  seed: string;
  scramble: string;
  /** 사람마다 둔 수(표기)와 시각 */
  logs: Record<string, readonly { m: string; t: number }[]>;
  /** 섞인 시작 상태(다시 보기) */
  start: PuzzleState;
  /** 이 판의 핸디캡(판을 열 때 고정, 없으면 없음) */
  handicap?: ActiveHandicap;
  /** 「평균 대비」의 기준(사람마다) */
  baseline?: Record<string, Baseline>;
  /** 아이템전 판: 사람마다 받은·쓴·맞은 아이템 */
  items?: ItemsSummary;
  /** 모양 만들기 판의 목표 */
  shape?: RaceShape;
  /**
   * 이 기기가 계획을 맞춰 보지 못해 순위·승자·점수에서 뺀 컴퓨터(모르는 계획 표 버전 등, docs/47 10-2). 기기마다 다를 수 있다
   */
  unverified?: string[];
}

/** 아이템전 판 기록(결과 상자) */
export interface ItemsSummary {
  /** 받은 아이템(가진 것만, 방패는 켜진 것, 차례대로) */
  got: Record<string, ItemKind[]>;
  used: Record<string, ItemKind[]>;
  /** 맞은 방해(방패가 막은 것 빼고) */
  hit: Record<string, ItemKind[]>;
  /** 방패가 막은 방해 수 */
  blocked: Record<string, number>;
  /** 아이템 규칙을 어겨 빠진 까닭 */
  out: Record<string, string>;
}

/** 이 기기 화면에 지금 그릴 아이템 효과(`CubeRoom.itemScreen`). 판정이 아니라 보이기만 한다 */
export interface ItemScreen {
  fog: boolean;
  swap: boolean;
  gray: boolean;
  /** 한 면 가리기: 맞은 순간 그 면(자리 0 위·1 오른쪽·2 앞)에 있던 스티커 정체 */
  blind: { face: 0 | 1 | 2; stickers: readonly number[] } | null;
  /** 찾아 주기: 빛낼 스티커 정체(조각·넣을 곳) */
  find: { found: readonly number[]; slot: readonly number[] } | null;
  /** 힌트 한 수를 쓴 뒤 아직 수를 두지 않았다 */
  hint: boolean;
  /** 맞은 쪽 표시(최근 것부터, 이어지는 동안) */
  notices: { key: string; item: ItemKind; by: string; blocked: boolean }[];
}

/** 컴퓨터가 아이템을 받은 뒤 쓰기까지(ms). 사람처럼 잠깐 뒤에 쓴다(결정적: 이 기기가 그 아이템을 확실히 안 때부터) */
export const BOT_USE_MS = 800;
/** 맞은 쪽 표시가 떠 있는 시간(ms) */
const NOTICE_MS = 1_600;
/** 다른 사람 자리의 「맞은 방해」가 떠 있는 시간: 화면 방해는 그 방해가 이어지는 동안 */
const PEER_HIT_MS: Partial<Record<ItemKind, number>> = {
  fog: SCREEN_HIT_MS,
  blind: SCREEN_HIT_MS,
  swap: SWAP_MS,
  gray: GRAY_MS,
};

export type { PartySummary };

type RoomMessage =
  | { type: "cube-hello"; name: string; avgs?: Record<string, number> }
  | { type: "cube-room"; state: RoomState }
  | { type: "cube-chat"; id: string; name: string; text: string };

export interface CubeRoomInit {
  /** 없으면 혼자(컴퓨터와 대결) */
  transport?: Transport;
  clock: Clock;
  isHost: boolean;
  /** 손님: 초대 링크에 실린 방장 연결 아이디. 있으면 이 아이디가 보낸 방 상태만 받는다(옛 링크면 없다) */
  hostId?: string;
  name: string;
  /** 이 기기의 크기별 내 평균(ms, 키 "2"~"5"). 방에 알리고, 판정 설정 지문에서 내 칸을 이 값으로 맞춰 본다 */
  avgs?: Record<string, number>;
  scrambler: Scrambler;
  settings?: Partial<RoomSettings>;
  /** 시험: 정해진 공개값·컴퓨터 계획 */
  random?: () => string;
  /** 시험: 판 아이디 꼬리(대결 씨앗에 들어간다). 공개값과 함께 정하면 섞기가 늘 같다(`vs-seed.ts`) */
  raceTag?: () => string;
  botPlan?: PlanFn;
  /** 시험만: 아이템 뽑기(모든 기기에 같은 것을 넣는다). 제품은 `drawItem` */
  drawItem?: typeof drawItem;
  onChat?: (m: {
    id: string;
    name: string;
    text: string;
    mine: boolean;
  }) => void;
}

/**
 * 그럴듯함 표시 기준(docs/46 3-4, docs/47 9-2). 결과는 바꾸지 않고 표시만 한다. 사람을 의심하지 않게 넉넉히 잡는다.
 * - 몰아친 수: 0.5초 안 20수 넘게(초당 40수. 키보드 기록자의 짧은 몰아치기도 초당 20수 안팎)
 * - 수가 지나치게 적음(3×3): 큐브 돌리기를 뺀 수가 30수 안쪽(사람 빠른 방법은 50~60수, 2단계 해법은 20수 남짓)
 * - 고른 간격: 센 수 30수 이상에서 수 사이 간격의 변동 계수가 0.2 아래. 사람은 공식 안 빠른 손놀림(0.1초 안팎)과
 *   다음 모양을 살피는 멈춤(0.3~1초)이 섞여 변동 계수가 보통 0.6을 넘는다. 일정한 간격으로 흘리는 프로그램은 0.05 안쪽
 * - 첫 수 빠르기: 풀린 뒤 첫 12수를 0.6초 안에(풀림에 반응하는 시간을 넣고도 초당 20수). 살펴보기 동안 몰래 풀어
 *   두었다가 풀리자마자 흘려보내는 것을 본다. 사람은 첫 수까지 반응 시간이 있고 십자도 초당 10수 안팎
 */
/** 경기 규칙(종합 순위·경기 끝 판단에 쓴다) */
export function matchRules(s: RoomSettings): MatchRules {
  return {
    format: s.format,
    target: s.target,
    rounds: s.rounds ?? 5,
    scoring: s.scoring ?? "wins",
  };
}

/**
 * 한 판의 대결 틀 설정. 점수제면 판 수·점수를 `gameOptions`에 실어 판정 설정 지문(`race-seed`의 `rules`)으로
 * 모든 기기가 같은 경기 규칙을 받았는지 판마다 맞춰 본다(다르면 「섞기 어긋남」, docs/47 9-3).
 * 다른 방식은 예전과 같은 지문이라 옛 판 화면과 함께 할 수 있다
 */
export function raceOptionsFor(
  s: RoomSettings,
  handicap?: ActiveHandicap,
  /** 모양 만들기 판의 목표(`shapeOfRound`) */
  shape?: RaceShape,
): RaceOptions {
  const options: RaceOptions = {
    inspectionMs: s.inspection ? 15_000 : 0,
    timeLimitMs: s.timeLimitSec * 1000,
    suspicion: suspicionFor(s.n, !!shape),
  };
  const game: Record<string, unknown> = {};
  // 모양 만들기: 목표와 시작을 지문에 넣는다(방장이 기기마다 다른 목표를 보내면 「섞기 어긋남」). 쓰지 않으면 예전 지문 그대로
  if (shape) game.shape = { id: shape.id, start: shape.start };
  // 파티 모드: 이정표(아이템전이면 쓰기·맞은 섞기도) 시각을 대결 틀이 증인 하한으로 확인한다(중간 지점).
  // 쓰지 않으면 예전 지문 그대로
  if (s.party) {
    options.checkpoints = true;
    game.party = s.party;
  }
  if (s.format === "points") {
    const r = matchRules(s);
    Object.assign(game, {
      match: "points",
      rounds: r.rounds,
      scoring: r.scoring,
    });
  }
  // 핸디캡: 출발 늦추기는 대결 틀이 막고 확인한다(`startDelayMs`, 지문에도 대결 틀이 넣는다). 목표와 평균은 게임 설정 지문에.
  // 쓰지 않으면 예전 지문 그대로(옛 판 화면과 함께 간다)
  if (handicap) {
    const delays = Object.entries(handicap.delaySec);
    if (delays.length > 0)
      options.startDelayMs = Object.fromEntries(
        delays.map(([id, sec]) => [id, sec * 1000]),
      );
    const goals = Object.keys(handicap.goal).length > 0;
    // 도움(docs/47 9-8)은 각 기기 화면에서만 그려 확인할 수 없지만, 서로 같은 설정을 받았는지는 지문으로 맞춰 본다
    if (goals || handicap.avg || handicap.help)
      game.handicap = {
        ...(goals ? { goal: handicap.goal } : {}),
        ...(handicap.avg ? { avg: handicap.avg } : {}),
        ...(handicap.help ? { help: handicap.help } : {}),
      };
  }
  if (Object.keys(game).length > 0) options.gameOptions = game;
  return options;
}

/** 모양 만들기는 공식 몇 수로 끝날 수 있어 「수가 지나치게 적음」을 보지 않는다 */
function suspicionFor(n: number, shape = false): SuspicionRules {
  const common: SuspicionRules = {
    windowMs: 500,
    maxMovesInWindow: 20,
    evenCv: 0.2,
    evenMinMoves: 30,
    fastStartMoves: 12,
    fastStartMs: 600,
  };
  return n === 3 && !shape ? { ...common, minMoves: 30 } : common;
}

/** 그 판의 목표 모양(모양 만들기가 아니면 없다). 방 상태의 규칙·크기·판 번호로만 정해 모든 기기가 같다 */
export function shapeOfRound(
  s: RoomSettings,
  round: number,
): RaceShape | undefined {
  const rule = s.shape;
  if (!rule || !shapeSupports(s.n)) return undefined;
  return { id: shapeFor(rule, s.n, round).id, start: rule.start };
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

export class CubeRoom {
  readonly me: string;
  readonly isHost: boolean;
  state: RoomState | null = null;
  rounds: RoundRecord[] = [];
  /** 방장이 나갔다(손님) */
  hostLeft = false;
  private readonly init: CubeRoomInit;
  private readonly hub: RaceHub;
  private readonly connected = new Set<string>();
  /**
   * 방장 연결 아이디. 방장은 나, 손님은 초대 링크에 실린 아이디(`CubeRoomInit.hostId`)로 처음부터 정한다.
   * 링크에 없으면(옛 링크) 처음 받은 방 상태의 방장으로 고정한다. 그 뒤로는 이 방장이 보낸 방 상태만 받는다
   */
  private hostId?: string;
  private current?: {
    race: string;
    round: number;
    /** 이 판의 참가자 → 맡은 기기. 판을 열 때 고정한다(판 도중 방 상태가 바뀌어도 그대로) */
    owners: Map<string, string>;
    game: CubeRaceGame;
    sessions: Map<string, RaceSession<CubeAct, PuzzleState>>;
    off: (() => void)[];
    /** 이 기기 컴퓨터가 계획을 세운 시도 번호 */
    planned: Map<string, number>;
    /** 이 판의 핸디캡(판을 열 때 고정) */
    handicap: ActiveHandicap;
    /** 파티 모드(판을 열 때 고정) */
    mode: PartyMode | undefined;
    /** 이 기기 컴퓨터(아이템전에서 맞은 섞기를 되돌리고 잠깐 멈춘다) */
    bots: Map<string, BotHandle>;
    /** 아이템전: 이 기기가 처음 본 시각(이 기기 시계, 화면 효과·컴퓨터 쓰기 시각) */
    seen: Map<string, number>;
    /** 찾아 주기: 쓴 순간의 빛낼 조각(쓰기 차례 → 조각) */
    finds: Map<number, { found: number[]; slot: number[] } | null>;
    /** 한 면 가리기: 맞은 순간의 가린 스티커 */
    blinds: Map<string, number[]>;
    /** 체력바 판: 참가자마다 시간이 흘러야 풀리는 판정을 다시 볼 예약 */
    recheck: Map<string, () => void>;
    /** 이 기기가 계획을 맞춰 보지 못하는 컴퓨터(판을 열 때 고정, `botVerifiable`). 순위·판정에서 뺀다 */
    unverified: string[];
  };
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(init: CubeRoomInit) {
    this.init = init;
    this.isHost = init.isHost;
    this.me = init.transport?.selfId ?? "me";
    this.hub = new RaceHub({
      ...(init.transport ? { transport: init.transport } : {}),
      clock: init.clock,
      // 대결 메시지는 판을 열 때 고정한 표로만 누구 것인지 정한다
      owner: (p) => this.current?.owners.get(p),
      participantsOf: (d) =>
        [...(this.current?.owners ?? [])]
          .filter(([, device]) => device === d)
          .map(([id]) => id),
    });
    if (!init.isHost && init.hostId) this.hostId = init.hostId;
    if (init.isHost) {
      this.hostId = this.me;
      this.state = {
        v: 1,
        host: this.me,
        settings: { ...DEFAULT_SETTINGS, ...init.settings },
        players: [
          {
            id: this.me,
            name: cleanName(init.name),
            device: this.me,
            ...(init.avgs ? { avgs: init.avgs } : {}),
          },
        ],
        round: 0,
        status: "lobby",
      };
    }
    const t = init.transport;
    if (t) {
      t.onMessage((raw, from) => {
        if (!this.disposed) this.onMessage(raw, from);
      });
      t.onPeerJoin((id) => {
        if (this.disposed) return;
        this.connected.add(id);
        if (this.isHost) this.publish();
        else this.hello();
        this.emit();
      });
      t.onPeerLeave((id) => {
        if (this.disposed) return;
        this.connected.delete(id);
        if (!this.isHost && id === this.state?.host) this.hostLeft = true;
        if (this.isHost && this.state?.status !== "racing") this.dropDevice(id);
        this.emit();
      });
      if (!this.isHost) this.hello();
    }
  }

  // ---- 모두 ----

  /** 지금 판의 내 대결(내가 든 판일 때) */
  session(): RaceSession<CubeAct, PuzzleState> | undefined {
    return this.current?.sessions.get(this.me);
  }

  /** 지금 판의 아무 대결(보기만 하는 손님은 없다) */
  anySession(): RaceSession<CubeAct, PuzzleState> | undefined {
    const c = this.current;
    return c
      ? (c.sessions.get(this.me) ?? [...c.sessions.values()][0])
      : undefined;
  }

  /** 지금(또는 마지막) 판에서 이 기기가 계획을 맞춰 보지 못해 순위에서 빼는 컴퓨터 */
  unverifiedBots(): readonly string[] {
    return this.current?.unverified ?? [];
  }

  /** 이 기기 컴퓨터가 지금 시도의 계획을 다 세웠나(화면 시험이 시계를 감기 전에 기다린다) */
  botPlanned(id: string): boolean {
    const c = this.current;
    const at = c?.planned.get(id);
    return at !== undefined && at === c?.sessions.get(id)?.snapshot().attempt;
  }

  /** 이 기기가 자기 판 결과로 본 경기 끝(방장이 알린 상태를 믿지 않는다) */
  matchOver(): boolean {
    const s = this.state;
    return s ? matchOver(matchRules(s.settings), this.rounds) : false;
  }

  game(): CubeRaceGame | undefined {
    return this.current?.game;
  }

  /** 지금 판의 핸디캡(판을 열 때 고정한 것) */
  handicap(): ActiveHandicap | undefined {
    return this.current?.handicap;
  }

  /** 그 사람의 지금 크기 평균(ms). 내 것은 이 기기가 알린 값, 남의 것은 방 상태에 실린 값 */
  averageOf(id: string): number | null {
    const s = this.state;
    if (!s) return null;
    const key = String(s.settings.n);
    if (id === this.me) return this.init.avgs?.[key] ?? null;
    return (
      s.players.find((p) => p.id === id && p.bot === undefined)?.avgs?.[key] ??
      null
    );
  }

  /**
   * 파티 판(체력바·아이템전)의 지금 판정(이 기기가 받은 만큼, 확실한 데까지). 판이 끝났으면 판 끝의 것. 파티 판이 아니면 없다
   */
  party(): PartyOutcome | undefined {
    const c = this.current;
    if (!c?.mode) return undefined;
    const session = c.sessions.get(this.me) ?? [...c.sessions.values()][0];
    if (!session) return undefined;
    return this.partyOf(
      session,
      [...c.owners.keys()],
      !!session.snapshot().result,
    );
  }

  /** 지금 판의 파티 모드(판을 열 때 고정) */
  partyMode(): PartyMode | undefined {
    return this.current?.mode;
  }

  play(move: CubeMove): PlayResult {
    return this.session()?.play(move) ?? { ok: false, reason: "관전" };
  }

  /**
   * 내가 가진 아이템을 쓴다(아이템전). 판정이 확실히 내 것으로 본 아이템만, 앞서 쓴 것이 판정되기 전에는 쓰지 않는다.
   * 쓴 아이템, 못 쓰면 null
   */
  spendItem(): ItemKind | null {
    const c = this.current;
    const session = this.session();
    if (!c || !session || !hasItems(c.mode)) return null;
    const item = this.heldItem(this.me, session);
    if (!item) return null;
    const r = session.play(
      parseItemText(c.game.n, itemUseText(item)) as CubeAct,
    );
    if (!r.ok) return null;
    if (item === "find")
      c.finds.set(
        trackOf(session.stateOf(this.me) as PuzzleState).uses.length,
        findMarksOf(session.stateOf(this.me) as PuzzleState),
      );
    this.emit();
    return item;
  }

  /** 지금 쓸 수 있는 내(이 기기 참가자) 아이템: 판정이 확실히 본 것이고, 앞서 쓴 것이 아직 판정되지 않았으면 없다 */
  heldItem(
    id: string,
    session:
      | RaceSession<CubeAct, PuzzleState>
      | undefined = this.current?.sessions.get(id),
  ): ItemKind | null {
    const c = this.current;
    if (!c || !session || !hasItems(c.mode)) return null;
    const snap = session.snapshot();
    if (snap.phase !== "race") return null;
    const items = this.partyOf(session, [...c.owners.keys()], false).items;
    const item = items?.slot[id] ?? null;
    if (!item || !items) return null;
    const judged = items.uses.filter((u) => u.p === id).length;
    const mine = trackOf(session.stateOf(id) as PuzzleState).uses.length;
    return mine === judged ? item : null;
  }

  /**
   * 이 기기 화면에 지금 그릴 아이템 효과(아이템전, 나만). 맞은 순간이 아니라 이 기기가 그 일을 확실히 안 순간부터 잰다
   * (판정이 확실해지는 데 걸리는 만큼 늦게 시작한다). 화면 방해는 받는 쪽이 스스로 그려야 해서 못 막는다(친선용)
   */
  itemScreen(): ItemScreen | null {
    const c = this.current;
    const session = this.session();
    if (!c || !session || !hasItems(c.mode)) return null;
    const outcome = this.party();
    const items = outcome?.items;
    if (!items) return null;
    this.noteSeen(c, items, this.me);
    const now = this.init.clock.now();
    const live = (key: string, ms: number) => {
      const at = c.seen.get(key);
      return at !== undefined && now - at < ms;
    };
    const done = !!session.snapshot().result;
    const screen: ItemScreen = {
      fog: false,
      swap: false,
      gray: false,
      blind: null,
      find: null,
      hint: false,
      notices: [],
    };
    for (const h of items.hits) {
      if (h.to !== this.me) continue;
      const key = `hit|${h.by}|${h.k}`;
      if (live(key, NOTICE_MS))
        screen.notices.unshift({
          key,
          item: h.item,
          by: h.by,
          blocked: h.blocked,
        });
      if (h.blocked || done) continue;
      if (h.item === "fog" && live(key, SCREEN_HIT_MS)) screen.fog = true;
      if (h.item === "swap" && live(key, SWAP_MS)) screen.swap = true;
      if (h.item === "gray" && live(key, GRAY_MS)) screen.gray = true;
      if (h.item === "blind" && live(key, SCREEN_HIT_MS))
        screen.blind = {
          face: h.face ?? 0,
          stickers: c.blinds.get(key) ?? [],
        };
    }
    const track = trackOf(session.stateOf(this.me) as PuzzleState);
    const log = session.moveLog(this.me);
    // 힌트·찾아 주기: 내가 쓴 차례(상태의 쓰기 기록)로 본다. 판정을 기다리지 않는다(내 화면에만 보이는 도움)
    track.uses.forEach((item, i) => {
      const k = i + 1;
      const key = `use|${k}`;
      if (!c.seen.has(key)) c.seen.set(key, now);
      if (done) return;
      if (item === "find" && live(key, FIND_MS))
        screen.find = c.finds.get(k) ?? null;
    });
    // 힌트 한 수: 쓴 뒤 아직 수를 두지 않았으면(맞은 섞기를 넣은 것은 내 수가 아니라 넘긴다)
    const mine = log.filter((x) => !x.m.startsWith("!hit|"));
    screen.hint = !done && mine.at(-1)?.m === itemUseText("hint");
    return screen;
  }

  /**
   * 다른 사람 자리에 붙일 「맞은 방해」(최근 것부터). 이 기기가 그 판정을 확실히 안 때부터, 화면 방해면 그 방해가
   * 이어지는 동안(흑백 화면 4초 등), 아니면 맞은 쪽 표시와 같은 1.6초. 보이기만 하고 판정에는 쓰지 않는다
   */
  peerNotices(): Record<
    string,
    { key: string; item: ItemKind; by: string; blocked: boolean }[]
  > {
    const c = this.current;
    if (!c || !hasItems(c.mode)) return {};
    const items = this.party()?.items;
    if (!items) return {};
    const now = this.init.clock.now();
    const out: Record<
      string,
      { key: string; item: ItemKind; by: string; blocked: boolean }[]
    > = {};
    for (const h of items.hits) {
      if (h.to === this.me) continue;
      const key = `peer|${h.by}|${h.k}`;
      const at = c.seen.get(key) ?? now;
      if (!c.seen.has(key)) c.seen.set(key, now);
      const ms = h.blocked
        ? NOTICE_MS
        : Math.max(NOTICE_MS, PEER_HIT_MS[h.item] ?? 0);
      if (now - at >= ms) continue;
      const list = out[h.to] ?? [];
      list.unshift({ key, item: h.item, by: h.by, blocked: h.blocked });
      out[h.to] = list;
    }
    return out;
  }

  isConnected(device: string): boolean {
    return device === this.me || this.connected.has(device);
  }

  /** 보이는 이름. 같은 이름이 앞에 있으면 「이름 (2)」처럼 차례를 붙인다(남의 이름을 흉내 내도 구분되게) */
  playerName(id: string): string {
    const players = this.state?.players ?? [];
    const at = players.findIndex((p) => p.id === id);
    const me = players[at];
    if (!me) return "나간 사람";
    const same = players.slice(0, at).filter((p) => p.name === me.name).length;
    return same === 0 ? me.name : `${me.name} (${same + 1})`;
  }

  chat(text: string): void {
    const clean = text.trim().slice(0, 80);
    if (!clean) return;
    const name = this.playerName(this.me);
    const id = randomId(8);
    this.init.transport?.send({ type: "cube-chat", id, name, text: clean });
    this.init.onChat?.({ id, name, text: clean, mine: true });
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispose(): void {
    this.disposed = true;
    this.endRace();
    this.hub.close();
    this.listeners.clear();
  }

  // ---- 방장 ----

  setSettings(patch: Partial<RoomSettings>): void {
    const s = this.state;
    if (!this.isHost || !s || s.status === "racing") return;
    const sizeChanged = patch.n !== undefined && patch.n !== s.settings.n;
    s.settings = { ...s.settings, ...patch };
    if (s.settings.party === undefined) delete s.settings.party;
    if (s.settings.shape === undefined) delete s.settings.shape;
    // 모양 만들기는 그 크기에 모양이 있을 때만, 파티 모드·목표 다르게·평균 대비와는 함께 쓰지 않는다
    // 크기를 바꿔 고른 어려움이 없으면 그 크기에서 고를 수 있는 첫 어려움으로
    const sh: ShapeRule | undefined = s.settings.shape;
    if (sh && !shapeRuleOk({ ...sh }, s.settings.n)) {
      const pick = shapePicks(s.settings.n)[0];
      const next = pick ? { ...sh, pick } : undefined;
      if (next && shapeRuleOk(next, s.settings.n)) s.settings.shape = next;
      else delete s.settings.shape;
    }
    if (s.settings.shape) {
      delete s.settings.party;
      const h = s.settings.handicap;
      if (h?.goal || h?.score) {
        const rest = { ...h };
        delete rest.goal;
        delete rest.score;
        s.settings.handicap = rest;
      }
    }
    // 체력바는 시간 평균(5판 평균)과 함께 쓰지 않는다: 한 판으로 돌린다
    if (s.settings.party && s.settings.format === "ao5")
      s.settings.format = "single";
    // 목표는 크기마다 다르다: 크기를 바꾸면 비운다
    const h = s.settings.handicap;
    if (sizeChanged && h?.goal) {
      const rest = { ...h };
      delete rest.goal;
      s.settings.handicap = rest;
    }
    // 컴퓨터가 없는 크기면 컴퓨터를 뺀다
    if (!botSupports(s.settings.n))
      s.players = s.players.filter((p) => p.bot === undefined);
    // 「내 실력에 맞춤」은 크기마다 내 평균이 다르다: 새 크기의 내 평균으로 다시 맞춘다
    if (sizeChanged)
      for (const p of s.players)
        if (readBotSkill(p.bot)?.kind === "fit")
          p.bot = this.fitText(s.settings.n);
    this.resetMatch();
  }

  /** 이 기기의 그 크기 내 평균(ms, 혼자 맞추기 최근 평균). 없으면 null */
  myAverage(n: number): number | null {
    return this.init.avgs?.[String(n)] ?? null;
  }

  /** 「내 실력에 맞춤」 글: 이 기기(방장)의 그 크기 내 평균(없으면 초보 목표)을 목표 시간 숫자로만 보낸다 */
  fitText(n: number): string {
    return botSkillText({
      kind: "fit",
      targetMs: fitTargetMs(n, this.myAverage(n)),
    });
  }

  /**
   * 컴퓨터 하나 더하기. `bot`은 단계 글(`levelText`, 「내 실력에 맞춤」은 `"fit"`이면 방장 평균으로 만든다).
   * 새 방장은 지금 버전 글만 만든다(옛 값·모르는 글은 받지 않는다)
   */
  addBot(bot: string): void {
    const s = this.state;
    if (!this.isHost || !s || s.status === "racing") return;
    if (s.players.length >= MAX_PLAYERS || !botSupports(s.settings.n)) return;
    const text = bot === "fit" ? this.fitText(s.settings.n) : bot;
    const skill = readBotSkill(text);
    if (!skill || skill.kind === "legacy") return;
    let k = 1;
    while (s.players.some((p) => p.id === `bot${k}`)) k++;
    s.players.push({
      id: `bot${k}`,
      name: `컴퓨터 ${k}`,
      device: this.me,
      bot: text,
    });
    this.publish();
  }

  /** 빈자리를 모두 컴퓨터로 채운다 */
  fillWithBots(level: string): void {
    const s = this.state;
    if (!s) return;
    while (s.players.length < MAX_PLAYERS && botSupports(s.settings.n)) {
      const before = s.players.length;
      this.addBot(level);
      if (s.players.length === before) break;
    }
  }

  removePlayer(id: string): void {
    const s = this.state;
    if (!this.isHost || !s || s.status === "racing" || id === this.me) return;
    s.players = s.players.filter((p) => p.id !== id);
    this.publish();
  }

  /** 다음 판을 연다(2명 이상) */
  startRound(): boolean {
    const s = this.state;
    if (!this.isHost || !s || s.status === "racing" || s.status === "over")
      return false;
    if (s.players.length < 2) return false;
    s.round += 1;
    s.race = {
      id: `${s.round}-${this.init.raceTag?.() ?? randomId(8)}`,
      players: s.players.map((p) => p.id),
    };
    s.status = "racing";
    this.publish();
    return true;
  }

  /** 핸디캡을 바꾼다(새 경기가 된다). 고를 수 없는 값은 받지 않는다 */
  setHandicap(handicap: Handicap): void {
    const s = this.state;
    if (!s || !handicapOk(handicap, s.settings.n)) return;
    this.setSettings({ handicap });
  }

  /** 규칙(일반·파티 체력바)을 바꾼다(새 경기가 된다) */
  setParty(party: PartyMode | null): void {
    const s = this.state;
    if (!this.isHost || !s || s.status === "racing") return;
    if (party) {
      delete s.settings.shape;
      this.setSettings({ party });
      return;
    }
    delete s.settings.party;
    this.setSettings({});
  }

  /** 규칙 「모양 만들기」를 켜거나 끈다(새 경기가 된다). 열쇠가 없으면 새로 만든다 */
  setShape(rule: Omit<ShapeRule, "key"> & { key?: string }, on = true): void {
    const s = this.state;
    if (!this.isHost || !s || s.status === "racing") return;
    if (!on) {
      delete s.settings.shape;
      this.setSettings({});
      return;
    }
    const shape = { ...rule, key: rule.key ?? randomId(8) };
    if (!shapeRuleOk(shape, s.settings.n)) return;
    this.setSettings({ shape });
  }

  /** 새 경기(판 기록을 비운다) */
  newMatch(): void {
    if (!this.isHost || this.state?.status === "racing") return;
    this.resetMatch();
  }

  // ---- 안쪽 ----

  private resetMatch(): void {
    const s = this.state;
    if (!s) return;
    s.round = 0;
    delete s.race;
    s.status = "lobby";
    this.rounds = [];
    this.publish();
  }

  private hello(): void {
    this.init.transport?.send({
      type: "cube-hello",
      name: cleanName(this.init.name),
      ...(this.init.avgs ? { avgs: this.init.avgs } : {}),
    } satisfies RoomMessage);
  }

  private dropDevice(device: string): void {
    const s = this.state;
    if (!s) return;
    const before = s.players.length;
    s.players = s.players.filter((p) => p.device !== device);
    if (s.players.length !== before) this.publish();
  }

  private publish(): void {
    const s = this.state;
    if (!s) return;
    s.v += 1;
    this.init.transport?.send({
      type: "cube-room",
      state: s,
    } satisfies RoomMessage);
    this.applyState();
    this.emit();
  }

  private onMessage(raw: unknown, from: string): void {
    if (typeof raw !== "object" || raw === null) return;
    const msg = raw as RoomMessage;
    if (msg.type === "cube-hello" && this.isHost) {
      const s = this.state;
      if (!s || typeof msg.name !== "string") return;
      // 컴퓨터 아이디 모양(`bot숫자`)의 사람을 표에 넣으면 정직한 손님이 방 상태를 모두 버려 방이 멈춘다
      if (BOT_ID.test(from)) return;
      this.connected.add(from);
      const name = cleanName(msg.name) || "손님";
      const avgs = cleanAverages(msg.avgs);
      const known = s.players.find((p) => p.id === from);
      if (known) {
        known.name = name;
        if (avgs) known.avgs = avgs;
        else delete known.avgs;
      } else if (s.players.length < MAX_PLAYERS)
        s.players.push({
          id: from,
          name,
          device: from,
          ...(avgs ? { avgs } : {}),
        });
      this.publish();
      return;
    }
    if (msg.type === "cube-room" && !this.isHost) {
      const next = msg.state;
      // 방 상태(참가자 표·판 번호·진행)는 고정한 방장에게서 온 것만. 그물이라 손님끼리도 직접 보낼 수 있다
      if (this.hostId !== undefined && from !== this.hostId) return;
      if (!isRoomState(next) || next.host !== from) return;
      if (this.state && next.v <= this.state.v) return;
      this.hostId = from;
      if (next.round === 0) this.rounds = [];
      this.state = next;
      this.connected.add(from);
      this.hostLeft = false;
      this.applyState();
      this.emit();
      return;
    }
    if (msg.type === "cube-chat") {
      if (typeof msg.text !== "string") return;
      // 이름은 메시지에 적힌 것을 쓰지 않고 보낸 기기의 참가자 이름으로(남의 이름 흉내 막기)
      const sender = this.state?.players.find(
        (p) => p.device === from && p.bot === undefined,
      );
      if (!sender) return;
      this.init.onChat?.({
        id: String(msg.id).slice(0, 32),
        name: this.playerName(sender.id),
        text: msg.text.slice(0, 80),
        mine: false,
      });
    }
  }

  /** 방 상태에 맞춰 판을 열거나 닫는다 */
  private applyState(): void {
    const s = this.state;
    if (!s) return;
    const race = s.race;
    if (!race || s.round === 0) {
      this.endRace();
      return;
    }
    if (this.current?.race === race.id) return;
    if (this.rounds.some((r) => r.race === race.id)) return;
    if (s.status !== "racing") return;
    this.endRace();
    const owners = new Map<string, string>();
    for (const p of s.players)
      if (race.players.includes(p.id)) owners.set(p.id, p.device);
    if (race.players.some((id) => !owners.has(id))) return;
    const local = s.players.filter(
      (p) => race.players.includes(p.id) && p.device === this.me,
    );
    const bots = new Set(
      s.players.filter((p) => p.bot !== undefined).map((p) => p.id),
    );
    // 하한은 기기 하나에 하나: 컴퓨터는 증인이 아니고, 같은 기기 안 참가자끼리는 서로의 증인이 아니다(game-85 ②)
    const witness = (observer: string, of: string) =>
      !bots.has(observer) && owners.get(observer) !== owners.get(of);
    // 핸디캡은 사람에게만. 평균은 내 칸만 이 기기가 알린 값으로 넣어 지문을 만든다: 방장이 내 평균을 바꿔 적었으면
    // 지문이 달라 드러난다(남의 평균은 확인할 수 없다). 「평균 대비」는 시간 순위라 체력바와 함께 쓰지 않는다
    const humans = race.players.filter((id) => !bots.has(id));
    const mode = s.settings.party;
    const handicap = activeHandicap(s.settings.handicap, humans, {
      ao5: s.settings.format === "ao5" || !!mode,
      averageOf: (id) => this.averageOf(id),
    });
    const shape = shapeOfRound(s.settings, s.round);
    // 계획을 맞춰 보지 못하는 컴퓨터(고친 방장이 모르는 버전 글을 붙였거나 버전이 다른 기기): 아무 시각에나 끝냈다고 해도
    // 가려낼 수 없으므로 이 기기에서는 순위·승자·점수·파티 판정에서 뺀다(9-2 「직접 확인한 만큼만 따른다」)
    const unverified = s.players
      .filter(
        (p) =>
          p.bot !== undefined &&
          race.players.includes(p.id) &&
          !botVerifiable(p.bot, !!shape),
      )
      .map((p) => p.id);
    const game = createCubeRaceGame(
      s.settings.n,
      this.init.scrambler,
      undefined,
      handicap.goal,
      mode ?? false,
      shape,
    );
    const botHandles = new Map<string, BotHandle>();
    const options = raceOptionsFor(s.settings, handicap, shape);
    const sessions = new Map<string, RaceSession<CubeAct, PuzzleState>>();
    const off: (() => void)[] = [];
    const round = s.round;
    const planned = new Map<string, number>();
    for (const p of local) {
      const session = new RaceSession({
        game,
        transport: this.hub.local(p.id),
        clock: this.init.clock,
        race: race.id,
        players: race.players,
        options,
        witness,
        ...(this.init.random ? { random: this.init.random } : {}),
      });
      sessions.set(p.id, session);
      if (p.bot) {
        const handle = attachBot({
          session,
          id: p.id,
          level: p.bot,
          n: s.settings.n,
          clock: this.init.clock,
          ...(shape ? { shape: shape.id } : {}),
          ...(this.init.botPlan ? { plan: this.init.botPlan } : {}),
          onPlanned: (attempt) => {
            planned.set(p.id, attempt);
            this.emit();
          },
        });
        botHandles.set(p.id, handle);
        off.push(handle.detach);
      }
      off.push(
        session.onChange((snap) => {
          if (snap.result)
            this.finishRound(race.id, round, race.players, snap.result);
          else {
            if (mode) this.partyStep(p.id, session, race.players);
            this.emit();
          }
        }),
      );
    }
    this.current = {
      race: race.id,
      round,
      owners,
      game,
      sessions,
      off,
      planned,
      handicap,
      mode,
      bots: botHandles,
      seen: new Map(),
      finds: new Map(),
      blinds: new Map(),
      recheck: new Map(),
      unverified,
    };
    for (const session of sessions.values()) session.start();
    this.emit();
  }

  private finishRound(
    race: string,
    round: number,
    players: string[],
    result: RaceResult,
  ): void {
    const c = this.current;
    if (!c || c.race !== race || this.rounds.some((r) => r.race === race))
      return;
    // 결과는 내 대결(내가 든 판), 없으면 처음 끝난 대결의 것
    const own = c.sessions.get(this.me);
    const source = own ?? [...c.sessions.values()][0];
    if (own && !own.snapshot().result) return;
    const snap = source?.snapshot();
    const seed = snap?.seed ?? "";
    const logs: RoundRecord["logs"] = {};
    for (const id of players) logs[id] = [...(source?.moveLog(id) ?? [])];
    let final = own ? (snap?.result as RaceResult) : result;
    const record: Omit<RoundRecord, "result"> = {
      race,
      round,
      players,
      seed,
      scramble: c.game.scrambleFor(seed)?.text ?? "",
      logs,
      start: source?.startState() as PuzzleState,
      ...(hasHandicap(c.handicap) ? { handicap: c.handicap } : {}),
      ...(c.game.shape ? { shape: c.game.shape } : {}),
      ...(c.unverified.length > 0 ? { unverified: [...c.unverified] } : {}),
    };
    // 체력바: 순위·승자를 체력 판정으로 다시 매긴다. 판이 정해진 뒤의 일은 판정에 끼지 않으므로(판 도중 판정과 같다)
    // 모든 기기가 같은 값을 낸다
    if (c.mode && source && !final.cancelled) {
      const outcome = this.partyOf(source, players, true);
      const d = outcome.decided;
      const noDecision = d?.end === "noDecision";
      if (hasHp(c.mode)) {
        final = { ...final, ranking: outcome.ranking };
        record.party = {
          winner: d?.winner ?? null,
          end: d?.end ?? "time",
          places: outcome.places,
          hp: outcome.hp,
          knockedOut: outcome.knockedOut,
          ...(d && Number.isFinite(d.at) ? { at: d.at } : {}),
        };
      } else {
        // 아이템만: 순위는 대결 틀의 시간 순위 그대로, 아이템 규칙을 어긴 사람만 DNF로 뺀다
        final = disqualify(final, outcome.items?.out ?? {});
      }
      if (noDecision) final.noDecision = true;
      else if (hasHp(c.mode)) delete final.noDecision;
      if (outcome.items) record.items = summarizeItems(outcome.items, players);
    }
    // 계획을 맞춰 보지 못한 컴퓨터는 순위 없음으로 뺀다(체력바는 판정에서 이미 뺐다: 차례는 그대로 두고 표시만)
    final = excludeUnverified(final, c.unverified, !hasHp(c.mode));
    // 「평균 대비」: 이 판의 순위를 평균 대비 점수로 다시 매긴다. 기준(평균, 없으면 이 경기에서 처음 맞춘 판)은 모든 기기가
    // 같은 값을 가진다(평균은 지문으로 맞춰 봤고, 앞선 판 결과는 같다)
    const avg = c.handicap.avg;
    let score: Record<string, number> | undefined;
    if (avg) {
      const prior = decidedRounds(this.rounds)
        .filter((r) => !r.result.cancelled)
        .map((r) => r.result);
      const scored = scoreByAverage(final, avg, prior);
      final = { ...final, ranking: scored.ranking };
      score = scored.score;
      record.baseline = scored.baseline;
    }
    this.rounds.push({ ...record, result: final, ...(score ? { score } : {}) });
    const s = this.state;
    if (this.isHost && s && s.race?.id === race) {
      s.status = matchOver(matchRules(s.settings), this.rounds)
        ? "over"
        : "between";
      this.publish();
    }
    this.emit();
  }

  private partyOf(
    session: RaceSession<CubeAct, PuzzleState>,
    players: readonly string[],
    final: boolean,
  ): PartyOutcome {
    const logs: Record<string, ReturnType<typeof session.checkpointLog>> = {};
    for (const id of players) logs[id] = session.checkpointLog(id);
    const mode = this.current?.mode;
    const seed = session.snapshot().seed;
    return judgeParty({
      n: this.state?.settings.n ?? 3,
      players,
      logs,
      disputeMs: DISPUTE_MS,
      final,
      hp: hasHp(mode ?? "hp"),
      ...(this.current?.unverified.length
        ? { exclude: this.current.unverified }
        : {}),
      ...(hasItems(mode) && seed !== undefined
        ? {
            items: {
              seed,
              ...(this.init.drawItem ? { draw: this.init.drawItem } : {}),
            },
          }
        : {}),
    });
  }

  /**
   * 파티 판에서 이 기기가 맡은 참가자를 판정대로 움직인다(확실한 판정만 보고).
   * - 체력바: 체력이 0이 되면 「체력 0」, 판이 정해지면 「판이 끝남」으로 그만둔다(`race-retire`). 다른 기기는 그 사람의 수가
   *   더 오지 않는다는 것을 알게 되어 판정을 이어 간다.
   * - 아이템전: 맞은 한 수 섞기를 바로 넣는다(`!hit`). 컴퓨터는 받은 아이템을 정해진 때 쓰고, 맞은 섞기는 되돌리고, 화면 방해에는
   *   잠깐 멈춘다.
   */
  private partyStep(
    id: string,
    session: RaceSession<CubeAct, PuzzleState>,
    players: readonly string[],
  ): void {
    const snap = session.snapshot();
    if (snap.spectator || snap.phase !== "race") return;
    const c = this.current;
    if (!c) return;
    const outcome = this.partyOf(session, players, false);
    if (outcome.knockedOut[id] !== undefined) {
      session.retire(PARTY_KO);
      return;
    }
    if (outcome.decided) {
      session.retire(PARTY_OVER);
      return;
    }
    if (outcome.items) this.itemStep(c, id, session, outcome.items);
    // 내 시각이 판정을 막고 있으면(내가 그 시각 전에 지났을 수도 있어 기다림) 그때 다시 본다. 메시지가 없어도 시간은 흐른다
    const elapsed = session.snapshot().elapsed ?? 0;
    let wake =
      Number.isFinite(outcome.until) && outcome.until >= elapsed
        ? outcome.until - elapsed + 1
        : Number.POSITIVE_INFINITY;
    // 컴퓨터가 아이템을 쓸 때를 기다린다
    const held = c.seen.get(`held|${id}`);
    if (c.bots.has(id) && held !== undefined)
      wake = Math.min(
        wake,
        Math.max(1, held + BOT_USE_MS - this.init.clock.now()),
      );
    if (!Number.isFinite(wake)) return;
    c.recheck.get(id)?.();
    c.recheck.set(
      id,
      this.init.clock.after(Math.max(1, wake), () => {
        c.recheck.delete(id);
        if (this.current === c && !this.disposed) {
          this.partyStep(id, session, players);
          this.emit();
        }
      }),
    );
  }

  /** 이 기기가 처음 본 시각을 적는다(나: 맞은 방해, 컴퓨터: 가진 아이템). 한 면 가리기는 그 순간 그 면의 스티커를 남긴다 */
  private noteSeen(
    c: NonNullable<CubeRoom["current"]>,
    items: ItemsOutcome,
    id: string,
  ): void {
    const now = this.init.clock.now();
    const state = c.sessions.get(id)?.stateOf(id);
    for (const h of items.hits) {
      if (h.to !== id) continue;
      const key = `hit|${h.by}|${h.k}`;
      if (c.seen.has(key)) continue;
      c.seen.set(key, now);
      if (h.item === "blind" && !h.blocked && state) {
        const nn = c.game.n * c.game.n;
        const f = h.face ?? 0;
        c.blinds.set(
          key,
          Array.from(
            { length: nn },
            (_, k) => state.perm[f * nn + k] as number,
          ),
        );
      }
    }
  }

  private itemStep(
    c: NonNullable<CubeRoom["current"]>,
    id: string,
    session: RaceSession<CubeAct, PuzzleState>,
    items: ItemsOutcome,
  ): void {
    const n = c.game.n;
    const bot = c.bots.get(id);
    this.noteSeen(c, items, id);
    // 한 수 섞기: 맞은 사람 기기가 같은 수를 내 상태에 넣는다(모든 기기가 이 수를 다시 적용한다)
    for (const o of items.owed[id] ?? []) {
      const track = trackOf(session.stateOf(id) as PuzzleState);
      if (track.hits.includes(`${o.by}|${o.k}|${o.moves}`)) continue;
      const act = parseItemText(n, hitText(o.by, o.k, o.moves));
      if (!act) continue;
      if (session.play(act).ok) bot?.afterHit(o.moves);
    }
    if (!bot) return;
    // 컴퓨터: 화면 방해는 잠깐 멈추는 것으로 받는다(안개 0.5초, 다른 것 1초)
    for (const h of items.hits) {
      if (h.to !== id || h.blocked || h.item === "mix") continue;
      const key = `pause|${h.by}|${h.k}`;
      if (c.seen.has(key)) continue;
      c.seen.set(key, this.init.clock.now());
      bot.pause(h.item === "fog" ? 500 : 1_000);
    }
    // 받은 아이템은 확실히 안 때부터 BOT_USE_MS 뒤에, 되돌릴 수가 남지 않았을 때 쓴다
    const item = this.heldItem(id, session);
    const heldKey = `held|${id}`;
    if (!item) {
      c.seen.delete(heldKey);
      return;
    }
    const since = c.seen.get(heldKey);
    if (since === undefined) {
      c.seen.set(heldKey, this.init.clock.now());
      return;
    }
    if (this.init.clock.now() - since < BOT_USE_MS || !bot.idle()) return;
    const undone =
      item === "rewind"
        ? rewindMoves(n, session.stateOf(id) as PuzzleState)
        : [];
    if (!session.play(parseItemText(n, itemUseText(item)) as CubeAct).ok)
      return;
    c.seen.delete(heldKey);
    if (item === "rewind") bot.afterRewind(undone);
    else bot.afterItem();
  }

  private endRace(): void {
    const c = this.current;
    if (!c) return;
    for (const f of c.off) f();
    for (const cancel of c.recheck.values()) cancel();
    for (const s of c.sessions.values()) s.dispose();
    this.hub.clear();
    delete this.current;
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

const BOT_ID = /^bot\d+$/;

/** 점수제면 판 수·점수가 정한 목록 안이어야 한다(끝나지 않는 경기 막기). 다른 방식은 예전처럼 보지 않는다 */
function pointsSettingsOk(s: RoomSettings): boolean {
  if (s.format !== "points") return true;
  return (
    (POINTS_ROUNDS as readonly unknown[]).includes(s.rounds) &&
    typeof s.scoring === "string" &&
    Object.hasOwn(SCORING_LABELS, s.scoring)
  );
}

/** 파티 모드는 정한 값만, 5판 평균과는 함께 쓰지 않는다 */
function partySettingsOk(s: RoomSettings): boolean {
  if (s.party === undefined) return true;
  return PARTY_MODES.includes(s.party) && s.format !== "ao5";
}

/** 모양 만들기는 고를 수 있는 값만, 파티 모드·목표 다르게·평균 대비와는 함께 쓰지 않는다 */
function shapeSettingsOk(s: RoomSettings): boolean {
  if (s.shape === undefined) return true;
  return (
    shapeRuleOk(s.shape, s.n) &&
    s.party === undefined &&
    !s.handicap?.goal &&
    !s.handicap?.score
  );
}

/**
 * 아이템만인 판: 아이템 규칙을 어긴 사람(갖지 않은 아이템을 씀, 맞은 섞기를 넣지 않고 맞춤 등)을 DNF로 돌리고 순위를 다시 매긴다.
 * 판정이 같은 순수 함수라 모든 기기가 같은 값을 낸다
 */
export function disqualify(
  result: RaceResult,
  out: Readonly<Record<string, string>>,
): RaceResult {
  const ids = Object.keys(out).filter((id) => result.players[id]);
  if (ids.length === 0) return result;
  const players = { ...result.players };
  for (const id of ids) {
    const p = players[id];
    if (!p || p.status === "forfeit") continue;
    const next = { ...p, status: "dnf" as const, reason: out[id] as string };
    delete next.accepted;
    delete next.unranked;
    players[id] = next;
  }
  const done = result.ranking.filter((id) => players[id]?.status === "done");
  const rest = result.ranking.filter((id) => players[id]?.status !== "done");
  // 못 맞춘 사람(DNF) 앞, 기권 뒤 차례는 그대로 둔다
  const dnf = rest.filter((id) => players[id]?.status === "dnf");
  const forfeit = rest.filter((id) => players[id]?.status === "forfeit");
  return { ...result, players, ranking: [...done, ...dnf, ...forfeit] };
}

/**
 * 계획을 맞춰 보지 못한 컴퓨터(`CubeRoom.unverifiedBots`)를 순위에서 뺀다: 맞췄어도 순위 없음(`unranked`, 인정 시간 없음)으로
 * 다툼과 같이 다룬다. 그래서 승자·점수제 점수·5판 평균·평균 대비에 들지 않는다(`standings.ts`). `reorder`면 차례를
 * 맞춘 사람 → 순위 없음 → 못 맞춤 → 기권으로 다시 놓는다(체력바는 판정이 이미 뒤로 놓았다).
 * 판정 없음(2명 이하 판의 다툼)이 뺀 컴퓨터 때문이었으면 남은 사람끼리 판정한다.
 * 이 기기가 본 것으로 정하므로 같은 버전 기기(확인한 기기)와 결과가 다를 수 있다
 */
export function excludeUnverified(
  result: RaceResult,
  ids: readonly string[],
  reorder = true,
): RaceResult {
  const drop = new Set(ids.filter((id) => result.players[id]));
  if (drop.size === 0) return result;
  const players = { ...result.players };
  for (const id of drop) {
    const p = players[id];
    if (p?.status !== "done") continue;
    const next = { ...p, unranked: true };
    delete next.accepted;
    players[id] = next;
  }
  const out: RaceResult = { ...result, players };
  if (
    out.noDecision &&
    !Object.values(players).some((p) => p.disputed && !drop.has(p.id))
  )
    delete out.noDecision;
  if (!reorder) return out;
  const at = (id: string) => {
    const p = players[id];
    if (p?.status === "done") return drop.has(id) || p.unranked ? 1 : 0;
    return p?.status === "dnf" ? 2 : 3;
  };
  // 같은 무리 안 차례는 그대로 둔다(정렬은 안정적이다)
  out.ranking = [...result.ranking].sort((x, y) => at(x) - at(y));
  return out;
}

/** 판정의 아이템 기록을 판 기록으로 줄인다(결과 상자) */
export function summarizeItems(
  items: ItemsOutcome,
  players: readonly string[],
): ItemsSummary {
  const by = <T>(make: () => T) =>
    Object.fromEntries(players.map((p) => [p, make()])) as Record<string, T>;
  const got = by<ItemKind[]>(() => []);
  const used = by<ItemKind[]>(() => []);
  const hit = by<ItemKind[]>(() => []);
  const blocked = by<number>(() => 0);
  for (const g of items.grants) if (g.kept) got[g.p]?.push(g.item);
  for (const u of items.uses) used[u.p]?.push(u.item);
  for (const h of items.hits)
    if (h.blocked) blocked[h.to] = (blocked[h.to] ?? 0) + 1;
    else hit[h.to]?.push(h.item);
  return { got, used, hit, blocked, out: { ...items.out } };
}

/**
 * 받은 방 상태의 모양과 참가자 표를 확인한다. 방장도 남의 기기를 바꿀 수 없게:
 * - 사람은 자기 기기에서만 자기 수를 낸다(`device === id`).
 * - 컴퓨터는 아이디가 `bot숫자`이고 방장 기기가 맡는다.
 */
function isRoomState(v: unknown): v is RoomState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as RoomState;
  if (
    !(
      typeof s.v === "number" &&
      typeof s.host === "string" &&
      Array.isArray(s.players) &&
      s.players.every(
        (p) =>
          typeof p?.id === "string" &&
          typeof p.name === "string" &&
          typeof p.device === "string",
      ) &&
      s.players.length <= MAX_PLAYERS &&
      typeof s.round === "number" &&
      typeof s.settings?.n === "number" &&
      [2, 3, 4, 5].includes(s.settings.n) &&
      typeof s.settings.timeLimitSec === "number" &&
      pointsSettingsOk(s.settings) &&
      partySettingsOk(s.settings) &&
      shapeSettingsOk(s.settings) &&
      handicapOk(s.settings.handicap, s.settings.n) &&
      s.players.every((p) => p.avgs === undefined || averagesOk(p.avgs))
    )
  )
    return false;
  const ids = new Set(s.players.map((p) => p.id));
  if (ids.size !== s.players.length) return false;
  const rosterOk = s.players.every((p) =>
    p.bot !== undefined
      ? BOT_ID.test(p.id) &&
        p.device === s.host &&
        typeof p.bot === "string" &&
        p.bot.length <= 32
      : !BOT_ID.test(p.id) && p.device === p.id,
  );
  if (!rosterOk) return false;
  const race = s.race;
  if (race === undefined) return true;
  // 지난 판 참가자는 판 사이에 나갔을 수 있다(판을 열 때 표에 없으면 열지 않는다, `applyState`)
  return (
    typeof race.id === "string" &&
    Array.isArray(race.players) &&
    race.players.every((id) => typeof id === "string")
  );
}
