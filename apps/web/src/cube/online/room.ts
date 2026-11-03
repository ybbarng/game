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
import { RaceHub } from "./hub";
import {
  type CubeRaceGame,
  createCubeRaceGame,
  type Scrambler,
} from "./race-game";
import { type MatchFormat, matchOver, type RoundSummary } from "./standings";

/**
 * 큐브 경주 방(docs/47 9절). 대기실·판 시작·판 결과 모으기를 맡고, 한 판의 공정한 진행은 경주 틀(`RaceSession`)이 한다.
 *
 * - 방장이 방 상태(설정·참가자·지금 판)를 정해 모두에게 알린다(`cube-room`). 판정에는 끼지 않는다.
 * - 손님은 들어오면 이름을 알린다(`cube-hello`). 판 도중에 온 사람은 다음 판부터 든다.
 * - 컴퓨터는 방장 기기가 돌린다. 경주 틀에는 방장 기기가 맡은 참가자 하나로 보인다(`RaceHub`).
 * - 판 결과는 각 기기가 자기 경주 틀에서 얻는다(같은 메시지를 받았으면 같은 값). 종합 순위도 각자 계산한다.
 * - 진짜 연결이 없으면(컴퓨터와 경주) 방장 혼자 + 컴퓨터로 같은 길을 쓴다.
 */

export interface RoomSettings {
  n: number;
  format: MatchFormat;
  /** 먼저 N판 이기기의 N */
  target: number;
  /** 살펴보기 15초(false면 없음) */
  inspection: boolean;
  /** 제한 시간(초) */
  timeLimitSec: number;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  n: 3,
  format: "single",
  target: 3,
  inspection: true,
  timeLimitSec: 180,
};

export const MAX_PLAYERS = 8;
export const NAME_MAX = 12;

export interface RoomPlayer {
  id: string;
  name: string;
  /** 이 참가자를 맡은 기기(연결 아이디) */
  device: string;
  bot?: BotLevel;
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
}

type RoomMessage =
  | { type: "cube-hello"; name: string }
  | { type: "cube-room"; state: RoomState }
  | { type: "cube-chat"; id: string; name: string; text: string };

export interface CubeRoomInit {
  /** 없으면 혼자(컴퓨터와 경주) */
  transport?: Transport;
  clock: Clock;
  isHost: boolean;
  name: string;
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

/** 그럴듯함 표시 기준(docs/46 3-4). 3×3 키보드에서 0.5초 안 20수 넘게, 30수 안쪽으로 맞춤 */
function suspicionFor(n: number): SuspicionRules {
  return n === 3
    ? { windowMs: 500, maxMovesInWindow: 20, minMoves: 30 }
    : { windowMs: 500, maxMovesInWindow: 20 };
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
  private current?: {
    race: string;
    round: number;
    game: CubeRaceGame;
    sessions: Map<string, RaceSession<CubeMove, PuzzleState>>;
    off: (() => void)[];
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
      owner: (p) => this.state?.players.find((x) => x.id === p)?.device,
      participantsOf: (d) =>
        this.state?.players.filter((x) => x.device === d).map((x) => x.id) ??
        [],
    });
    if (init.isHost) {
      this.state = {
        v: 1,
        host: this.me,
        settings: { ...DEFAULT_SETTINGS, ...init.settings },
        players: [{ id: this.me, name: cleanName(init.name), device: this.me }],
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

  /** 지금 판의 내 경주(내가 든 판일 때) */
  session(): RaceSession<CubeMove, PuzzleState> | undefined {
    return this.current?.sessions.get(this.me);
  }

  /** 지금 판의 아무 경주(보기만 하는 손님은 없다) */
  anySession(): RaceSession<CubeMove, PuzzleState> | undefined {
    const c = this.current;
    return c
      ? (c.sessions.get(this.me) ?? [...c.sessions.values()][0])
      : undefined;
  }

  game(): CubeRaceGame | undefined {
    return this.current?.game;
  }

  play(move: CubeMove): PlayResult {
    return this.session()?.play(move) ?? { ok: false, reason: "관전" };
  }

  isConnected(device: string): boolean {
    return device === this.me || this.connected.has(device);
  }

  playerName(id: string): string {
    return this.state?.players.find((p) => p.id === id)?.name ?? "나간 사람";
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
    s.settings = { ...s.settings, ...patch };
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
      this.connected.add(from);
      const name = cleanName(msg.name) || "손님";
      const known = s.players.find((p) => p.id === from);
      if (known) known.name = name;
      else if (s.players.length < MAX_PLAYERS)
        s.players.push({ id: from, name, device: from });
      this.publish();
      return;
    }
    if (msg.type === "cube-room" && !this.isHost) {
      const next = msg.state;
      if (!isRoomState(next) || next.host !== from) return;
      if (this.state && next.v <= this.state.v && next.host === this.state.host)
        return;
      if (next.round === 0) this.rounds = [];
      this.state = next;
      this.connected.add(from);
      this.hostLeft = false;
      this.applyState();
      this.emit();
      return;
    }
    if (msg.type === "cube-chat") {
      if (typeof msg.text !== "string" || typeof msg.name !== "string") return;
      if (!this.state?.players.some((p) => p.device === from)) return;
      this.init.onChat?.({
        id: String(msg.id),
        name: cleanName(msg.name),
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
    const local = s.players.filter(
      (p) => race.players.includes(p.id) && p.device === this.me,
    );
    const game = createCubeRaceGame(s.settings.n, this.init.scrambler);
    const options: RaceOptions = {
      inspectionMs: s.settings.inspection ? 15_000 : 0,
      timeLimitMs: s.settings.timeLimitSec * 1000,
      suspicion: suspicionFor(s.settings.n),
    };
    const sessions = new Map<string, RaceSession<CubeMove, PuzzleState>>();
    const off: (() => void)[] = [];
    const round = s.round;
    for (const p of local) {
      const session = new RaceSession({
        game,
        transport: this.hub.local(p.id),
        clock: this.init.clock,
        race: race.id,
        players: race.players,
        options,
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
    this.current = { race: race.id, round, game, sessions, off };
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
    // 결과는 내 경주(내가 든 판), 없으면 처음 끝난 경주의 것
    const own = c.sessions.get(this.me);
    const source = own ?? [...c.sessions.values()][0];
    if (own && !own.snapshot().result) return;
    const snap = source?.snapshot();
    const seed = snap?.seed ?? "";
    const logs: RoundRecord["logs"] = {};
    for (const id of players) logs[id] = [...(source?.moveLog(id) ?? [])];
    this.rounds.push({
      race,
      round,
      players,
      result: own ? (snap?.result as RaceResult) : result,
      seed,
      scramble: c.game.scrambleFor(seed)?.text ?? "",
      logs,
      start: source?.startState() as PuzzleState,
    });
    const s = this.state;
    if (this.isHost && s && s.race?.id === race) {
      s.status = matchOver(s.settings.format, s.settings.target, this.rounds)
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

function isRoomState(v: unknown): v is RoomState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as RoomState;
  return (
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
    typeof s.settings.timeLimitSec === "number"
  );
}
