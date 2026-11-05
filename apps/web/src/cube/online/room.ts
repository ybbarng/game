import type { BotLevel } from "@game/cube-ai";
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
import { attachBot, botSupports, type PlanFn } from "./bot-racer";
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
import {
  type CubeRaceGame,
  createCubeRaceGame,
  type Scrambler,
} from "./race-game";
import {
  decidedRounds,
  type MatchFormat,
  type MatchRules,
  matchOver,
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
  /** 실력 차 균형(docs/51 4절). 옛 판 방장은 보내지 않는다. 쓸 때만 판정 설정 지문에 넣는다(`raceOptionsFor`) */
  handicap?: Handicap;
}

/**
 * 크기별 기본 제한 시간(초). 가장 느린 컴퓨터(입문, 초당 2수·층별)도 시간 안에 맞추게 넉넉히 둔다.
 * `botPlan("beginner")` 길이(2026-11-04): 2×2 씨앗 200개 중앙값 50초·최대 82초, 3×3 씨앗 40개 중앙값 104초·최대 130초.
 * 그래서 2×2 3분, 3×3 5분(최대의 2배 남짓).
 * 4×4·5×5도 컴퓨터가 있다(큰 큐브 빠르기, 입문 초당 1.5수). 같은 날 씨앗 1~40으로 잰 입문 길이(살펴보기 빼고):
 * 4×4 중앙값 202초·최대 237초, 5×5 중앙값 256초·최대 290초. 둘 다 10분(최대의 2배 남짓) 안이라 그대로 둔다.
 * 다른 단계는 더 짧다(5×5 중급 최대 124초, 고수 48초, 초고수 29초)
 */
export const TIME_LIMIT_SEC: Record<number, number> = {
  2: 180,
  3: 300,
  4: 600,
  5: 600,
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
  bot?: BotLevel;
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
}

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
  botPlan?: PlanFn;
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
): RaceOptions {
  const options: RaceOptions = {
    inspectionMs: s.inspection ? 15_000 : 0,
    timeLimitMs: s.timeLimitSec * 1000,
    suspicion: suspicionFor(s.n),
  };
  const game: Record<string, unknown> = {};
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
    if (goals || handicap.avg)
      game.handicap = {
        ...(goals ? { goal: handicap.goal } : {}),
        ...(handicap.avg ? { avg: handicap.avg } : {}),
      };
  }
  if (Object.keys(game).length > 0) options.gameOptions = game;
  return options;
}

function suspicionFor(n: number): SuspicionRules {
  const common: SuspicionRules = {
    windowMs: 500,
    maxMovesInWindow: 20,
    evenCv: 0.2,
    evenMinMoves: 30,
    fastStartMoves: 12,
    fastStartMs: 600,
  };
  return n === 3 ? { ...common, minMoves: 30 } : common;
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
    sessions: Map<string, RaceSession<CubeMove, PuzzleState>>;
    off: (() => void)[];
    /** 이 기기 컴퓨터가 계획을 세운 시도 번호 */
    planned: Map<string, number>;
    /** 이 판의 핸디캡(판을 열 때 고정) */
    handicap: ActiveHandicap;
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
  session(): RaceSession<CubeMove, PuzzleState> | undefined {
    return this.current?.sessions.get(this.me);
  }

  /** 지금 판의 아무 대결(보기만 하는 손님은 없다) */
  anySession(): RaceSession<CubeMove, PuzzleState> | undefined {
    const c = this.current;
    return c
      ? (c.sessions.get(this.me) ?? [...c.sessions.values()][0])
      : undefined;
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

  play(move: CubeMove): PlayResult {
    return this.session()?.play(move) ?? { ok: false, reason: "관전" };
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
    this.resetMatch();
  }

  addBot(level: BotLevel): void {
    const s = this.state;
    if (!this.isHost || !s || s.status === "racing") return;
    if (s.players.length >= MAX_PLAYERS || !botSupports(s.settings.n)) return;
    let k = 1;
    while (s.players.some((p) => p.id === `bot${k}`)) k++;
    s.players.push({
      id: `bot${k}`,
      name: `컴퓨터 ${k}`,
      device: this.me,
      bot: level,
    });
    this.publish();
  }

  /** 빈자리를 모두 컴퓨터로 채운다 */
  fillWithBots(level: BotLevel): void {
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
      id: `${s.round}-${randomId(8)}`,
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
    // 지문이 달라 드러난다(남의 평균은 확인할 수 없다)
    const humans = race.players.filter((id) => !bots.has(id));
    const handicap = activeHandicap(s.settings.handicap, humans, {
      ao5: s.settings.format === "ao5",
      averageOf: (id) => this.averageOf(id),
    });
    const game = createCubeRaceGame(
      s.settings.n,
      this.init.scrambler,
      undefined,
      handicap.goal,
    );
    const options = raceOptionsFor(s.settings, handicap);
    const sessions = new Map<string, RaceSession<CubeMove, PuzzleState>>();
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
      if (p.bot)
        off.push(
          attachBot({
            session,
            id: p.id,
            level: p.bot,
            n: s.settings.n,
            clock: this.init.clock,
            ...(this.init.botPlan ? { plan: this.init.botPlan } : {}),
            onPlanned: (attempt) => {
              planned.set(p.id, attempt);
              this.emit();
            },
          }),
        );
      off.push(
        session.onChange((snap) => {
          if (snap.result)
            this.finishRound(race.id, round, race.players, snap.result);
          else this.emit();
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
    };
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

  private endRace(): void {
    const c = this.current;
    if (!c) return;
    for (const f of c.off) f();
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
      handicapOk(s.settings.handicap, s.settings.n) &&
      s.players.every((p) => p.avgs === undefined || averagesOk(p.avgs))
    )
  )
    return false;
  const ids = new Set(s.players.map((p) => p.id));
  if (ids.size !== s.players.length) return false;
  const rosterOk = s.players.every((p) =>
    p.bot !== undefined
      ? BOT_ID.test(p.id) && p.device === s.host
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
