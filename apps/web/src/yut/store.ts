import { yutBotFor } from "@game/yut-ai";
import {
  type Action,
  derivedSeed,
  type GameEvent,
  type Gesture,
  sideOf,
  type YutRules,
  type YutState,
  type YutView,
} from "@game/yut-engine";
import { create } from "zustand";
import { workerBotOption } from "@/game/bot-runner";
import { browserPace } from "@/game/bots";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { paced } from "@/game/settings";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";
import { track } from "@/stats/track";

import {
  commitAction,
  loadPendingThrows,
  loadSeedBook,
  mySeed,
  newSeed,
  openAction,
  type PendingThrow,
  revealAction,
  type SeedBook,
  savePendingThrows,
  saveSeedBook,
  sealGesture,
} from "./chain";
import { yutKit } from "./kit";

export type YutLocalMatch = LocalMatch<
  YutRules,
  YutState,
  YutView,
  Action,
  GameEvent,
  undefined
>;
/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type YutHost = MatchHost<YutView, Action, GameEvent> & {
  drain(): Snapshot<YutView, GameEvent>[];
};

export type YutSaved = SavedMatch<YutRules, Action, undefined> & {
  /** 컴퓨터 단계(0 입문, 1 중수, 2 고수) */
  level: number;
};

/** 컴퓨터가 던지거나 움직인 것은 바로 보이지 않고 잠깐 기다렸다 보인다(생각하는 듯이) */
const BOT_DELAY_MS = 550;

const SAVE_KEY = "yut-save";

function saveYut(saved: YutSaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadYut(): YutSaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as YutSaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearYut(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

interface YutStore {
  host: YutHost | null;
  /** 혼자 할 때만: 저장·무르기에 쓴다 */
  local: YutLocalMatch | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  offlineSeats: number[];
  view: YutView | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: GameEvent[];
  queue: Snapshot<YutView, GameEvent>[];
  level: number;
  notice: string | null;
  /** 튜토리얼 미션 대국: 저장·기록·무르기를 하지 않는다 */
  practice: boolean;
  /** 세대마다 내 사슬 씨앗(온라인만, 이 기기에만 있다) */
  seeds: SeedBook;
  /** 던진 윷이 3D 멍석에서 굴러가는 중(다음 화면을 보이지 않고 기다린다) */
  tossing: boolean;
  /** 굴러가던 윷이 다 멈춰 결과를 보이는 중(`tossing`은 아직 참) */
  landed: boolean;
  /** 3D 윷이 다 멈췄다: 결과를 보이는 동안 상태 줄도 결과로 */
  landToss(): void;
  /** 3D 연출이 끝났다: 기다리던 화면을 이어 보인다 */
  finishToss(): void;
  newGame(options: { rules: YutRules; level: number; seed?: number }): void;
  resume(saved: YutSaved): void;
  /** 튜토리얼 미션: 이 장면에서 입문 컴퓨터와 한다(나는 0번 자리) */
  startPractice(initialState: YutState): void;
  /** 온라인 방의 대국을 붙인다(저장·무르기 없음) */
  attachOnline(
    host: YutHost,
    seatNames: string[],
    stats: StatsTarget,
    archive?: ArchiveTarget,
  ): void;
  setSeatNames(seatNames: string[]): void;
  submit(action: Action): SubmitResult;
  /** 이 몸짓을 봉인해 던진다(몸짓은 모든 고리가 공개된 뒤 자동으로 연다, docs/37 13절) */
  throwGesture(gesture: Gesture): SubmitResult;
  /** 화면에 잠깐 보일 알림(너무 낮게 던짐 등) */
  setNotice(notice: string): void;
  /** 혼자 할 때 무르기: 내 마지막 움직임(과 그 뒤 컴퓨터 수)을 되돌린다 */
  undo(): boolean;
  canUndo(): boolean;
  leave(): void;
  clearNotice(): void;
}

/**
 * 사건에 맞춰 소리를 낸다: 던지기, 말 놓기·잡기·나기, 판 끝.
 * 멍석이 그 던지기를 맡았으면(`tossed`) 떨어지는 소리는 멍석이 낸다(3D는 가락이 닿을 때마다, 2D는 떨어질 때 한 번)
 */
function cuesFor(
  events: readonly GameEvent[],
  view: YutView,
  tossed: boolean,
): void {
  const mySide = sideOf(view.rules, view.mySeat);
  for (const e of events) {
    if (e.type === "thrown") playUiCue("yutThrow");
    if (e.type === "result" && !tossed)
      playUiCue(e.bonus ? "yutBonus" : "yutLand");
    if (e.type === "nak" && !tossed) playUiCue("yutLand");
    if (e.type === "moved")
      playUiCue(
        e.captured > 0 ? "yutCapture" : e.finished ? "yutHome" : "yutPiece",
      );
    if (e.type === "gameEnded") {
      const side = e.result?.side ?? null;
      playUiCue(side === null ? "roundEnd" : side === mySide ? "win" : "lose");
    }
  }
}

/**
 * 던진 윷을 보일 화면(멍석). 결과가 나온 화면을 받으면 그 던지기를 연출할지 답한다. 연출하면 store는
 * 결과를 보인 뒤(`finishToss`)까지 다음 화면(컴퓨터의 말 옮기기 등)을 보이지 않고 기다린다(docs/37 14절).
 * 멍석은 3D를 못 그리거나 움직임 줄이기여도 2D 윷가락으로 맡는다(docs/37 14-8). 멍석이 없거나 숨은 탭이면 바로 이어 간다
 */
export type TossDirector = (
  view: YutView,
  events: readonly GameEvent[],
) => boolean;

let tossDirector: TossDirector | null = null;

export function setTossDirector(director: TossDirector | null): void {
  tossDirector = director;
}

/** 연출이 끝났다는 소식이 끝내 오지 않을 때의 안전장치(ms): 가장 긴 연출(약 4초)보다 넉넉히 */
const TOSS_SAFETY_MS = 9000;
let tossTimer: ReturnType<typeof setTimeout> | null = null;

let timer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
/** 마지막으로 자동으로 낸 행동(같은 화면을 다시 받아도 두 번 내지 않는다) */
let lastAuto: string | null = null;
/** 씨앗을 남기는 곳: 온라인은 탭 저장소, 혼자 하기·미션은 자리 재료로 만든 씨앗을 쓴다 */
let seedKey: string | null = null;
/** 봉인해 던진 내 몸짓(열 때까지). 혼자 하기·온라인은 탭 저장소에도 남긴다 */
let kept: PendingThrow[] = [];

function stop(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (tossTimer !== null) clearTimeout(tossTimer);
  tossTimer = null;
  unsubscribe?.();
  unsubscribe = null;
  lastAuto = null;
}

export const useYut = create<YutStore>((set, get) => {
  /**
   * 약속·공개는 내 기기가 바로 낸다(사람이 할 일이 없다). 온라인은 이 기기에서 만든 씨앗,
   * 혼자 하기·미션은 자리 재료로 만든 씨앗을 쓴다
   */
  const autoAct = (): void => {
    const { host, view, queue } = get();
    if (!host || !view || queue.length > 0) return;
    const kind = view.decision?.kind;
    if (kind !== "commit" && kind !== "reveal" && kind !== "open") return;
    const key = `${view.generation}:${view.throwCount}:${kind}`;
    if (lastAuto === key) return;
    const online = seedKey?.startsWith("online:") ?? false;
    let action: Action | null = null;
    if (kind === "commit") {
      let seeds = get().seeds;
      let seed = online ? seeds[view.generation] : undefined;
      if (online && !seed) {
        seed = newSeed();
        seeds = { ...seeds, [view.generation]: seed };
        // 약속을 내기 전에 먼저 남긴다(새로고침해도 공개할 수 있게).
        set({ seeds });
        saveSeedBook(seedKey as string, seeds);
      }
      action = commitAction(seed ?? derivedSeed(view.botKey, view.generation));
    } else if (kind === "open") {
      action = openAction(view, kept);
      if (!action) return;
    } else {
      const seed = mySeed(view, get().seeds);
      if (!seed) return;
      action = revealAction(view, seed);
    }
    lastAuto = key;
    const result = host.submit(action);
    if (!result.ok) set({ notice: result.error });
  };

  /** 쌓인 화면을 차례로 보인다. 컴퓨터가 던지거나 움직인 것은 조금 기다렸다가 */
  const advance = (): void => {
    if (timer !== null || get().tossing) return;
    const next = get().queue[0];
    if (next === undefined) return;
    const host = get().host;
    const me = host?.seat ?? 0;
    // 컴퓨터 상대(혼자 하기)만 기다린다. 온라인 상대 수는 바로 보인다.
    const byBot =
      get().local !== null &&
      next.events.some(
        (e) =>
          (e.type === "thrown" && e.seat !== me) ||
          (e.type === "moved" && e.seat !== me),
      );
    const show = () => {
      timer = null;
      const landed = next.events.some(
        (e) => e.type === "result" || e.type === "nak",
      );
      const tossed =
        landed && (tossDirector?.(next.view, next.events) ?? false);
      set({
        queue: get().queue.slice(1),
        view: next.view,
        events: next.events,
        tossing: tossed,
        landed: false,
      });
      if (tossed)
        tossTimer = setTimeout(() => get().finishToss(), TOSS_SAFETY_MS);
      cuesFor(next.events, next.view, tossed);
      autoAct();
      advance();
    };
    if (byBot) timer = setTimeout(show, paced(BOT_DELAY_MS));
    else show();
  };

  const attach = (
    host: YutHost,
    options: {
      local: YutLocalMatch | null;
      level: number;
      seatNames: string[] | null;
      /** 없으면 내 기록에 남기지 않는다(튜토리얼) */
      stats: StatsTarget | null;
      archive?: ArchiveTarget;
      seeds: SeedBook;
      key: string | null;
    },
  ) => {
    stop();
    const { local, level } = options;
    // 바꾸는 대국이 세던 컴퓨터 수는 버린다(무르기·새 판).
    if (get().local !== local) get().local?.dispose();
    seedKey = options.key;
    kept = options.key ? loadPendingThrows(options.key) : [];
    const recorder = options.stats
      ? new StatsRecorder(yutKit.stats, options.stats)
      : null;
    const practice = options.stats === null;
    const archiver = options.archive
      ? new ArchiveRecorder(yutKit.stats, options.archive)
      : null;
    const persist = () => {
      if (local && !practice) saveYut({ ...local.save(), level });
    };
    const first = host.drain();
    set({
      host,
      local,
      level,
      seatNames: options.seatNames,
      reconnecting: false,
      hostLeft: false,
      offlineSeats: [],
      view: host.current(),
      events: [],
      queue: [],
      notice: null,
      practice,
      seeds: options.seeds,
      tossing: false,
      landed: false,
    });
    persist();
    for (const snapshot of first) {
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
    }
    unsubscribe = host.subscribe((snapshot) => {
      persist();
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
      set({ queue: [...get().queue, snapshot] });
      advance();
    });
    autoAct();
  };

  const newLocal = (
    rules: YutRules,
    seed: number,
    level: number,
    log?: YutSaved["log"],
  ): YutLocalMatch =>
    new LocalMatch(
      {
        kit: yutKit,
        rules,
        seed,
        humanSeat: 0,
        bot: yutBotFor(level),
        ...workerBotOption({ game: "yut", level }),
        pace: browserPace,
      },
      log,
    );

  /** 혼자 하기: 이 기기의 대국으로 붙인다 */
  const attachLocal = (local: YutLocalMatch, level: number, seed: number) =>
    attach(local, {
      local,
      level,
      seatNames: null,
      stats: { game: "yut", mode: "solo", key: `solo:${seed}` },
      archive: {
        game: "yut",
        mode: "solo",
        key: `solo:${seed}`,
        seat: local.seat,
        seatNames: null,
        source: () => {
          const saved = local.save();
          return { rules: saved.rules, seed: saved.seed, log: saved.log };
        },
      },
      seeds: {},
      key: `solo:${seed}`,
    });

  return {
    host: null,
    local: null,
    seatNames: null,
    reconnecting: false,
    hostLeft: false,
    offlineSeats: [],
    view: null,
    events: [],
    queue: [],
    level: 1,
    notice: null,
    practice: false,
    seeds: {},
    tossing: false,
    landed: false,

    landToss() {
      if (get().tossing) set({ landed: true });
    },

    finishToss() {
      if (tossTimer !== null) clearTimeout(tossTimer);
      tossTimer = null;
      if (!get().tossing) return;
      set({ tossing: false, landed: false });
      advance();
    },

    newGame({ rules, level, seed: given }) {
      track("game-start", { game: "yut", mode: "solo", level });
      const seed = given ?? Math.floor(Math.random() * 2 ** 31);
      attachLocal(newLocal(rules, seed, level), level, seed);
    },

    resume(saved) {
      attachLocal(
        newLocal(saved.rules, saved.seed, saved.level, saved.log),
        saved.level,
        saved.seed,
      );
    },

    startPractice(initialState) {
      const local: YutLocalMatch = new LocalMatch({
        kit: yutKit,
        rules: initialState.rules,
        seed: Math.floor(Math.random() * 2 ** 31),
        humanSeat: 0,
        bot: yutBotFor(0),
        pace: browserPace,
        initialState,
      });
      attach(local, {
        local,
        level: 0,
        seatNames: null,
        stats: null,
        seeds: {},
        key: null,
      });
    },

    attachOnline(host, seatNames, stats, archive) {
      attach(host, {
        local: null,
        level: get().level,
        seatNames,
        stats,
        ...(archive ? { archive } : {}),
        seeds: loadSeedBook(stats.key),
        key: stats.key,
      });
    },

    setSeatNames(seatNames) {
      set({ seatNames });
    },

    throwGesture(gesture) {
      const pending = sealGesture(gesture);
      // 던지기를 내기 전에 먼저 남긴다(새로고침해도 열 수 있게).
      kept = [...kept.slice(-3), pending];
      if (seedKey) savePendingThrows(seedKey, kept);
      return get().submit({ type: "throw", seal: pending.seal });
    },

    setNotice(notice) {
      set({ notice });
    },

    submit(action) {
      const host = get().host;
      if (!host) return { ok: false, error: "게임이 없어요." };
      // 컴퓨터 수를 보여 주기 전에는 두지 않는다. 던진 윷이 구르는 동안에는 말을 옮기지 않는다.
      if (get().queue.length > 0) return { ok: false, error: "잠깐만요." };
      if (get().tossing && action.type === "move")
        return { ok: false, error: "잠깐만요." };
      const result = host.submit(action);
      if (!result.ok) {
        set({ notice: result.error });
        playUiCue("invalid");
      }
      return result;
    },

    canUndo() {
      const { local, view } = get();
      // 튜토리얼 장면은 기록으로 다시 만들 수 없어 무르지 않는다. 판 끝은 화면에 보이기 전에 기록되므로
      // 보이는 화면이 아니라 대국의 최신 상태로 본다(컴퓨터 수를 보이는 중에도 무를 수 있다)
      if (!local || !view || get().practice) return false;
      if (local.current().phase === "gameOver") return false;
      return local
        .save()
        .log.some((e) => e.seat === local.seat && e.action.type === "move");
    },

    undo() {
      const { local, level } = get();
      if (!local || !get().canUndo()) return false;
      const saved = local.save();
      const log = [...saved.log];
      // 내 마지막 움직임까지 잘라 낸다(그 뒤 컴퓨터 던지기·움직임과 내 공개도 함께).
      // 던지기 결과는 사슬로 정해져 있어 다시 던져도 같다. 무르기는 말 고르기만 바꾼다.
      while (log.length > 0) {
        const last = log.pop();
        if (last?.seat === local.seat && last.action.type === "move") break;
      }
      attachLocal(
        newLocal(saved.rules, saved.seed, level, log),
        level,
        saved.seed,
      );
      return true;
    },

    leave() {
      stop();
      get().local?.dispose();
      seedKey = null;
      kept = [];
      set({
        host: null,
        local: null,
        seatNames: null,
        view: null,
        queue: [],
        events: [],
        reconnecting: false,
        hostLeft: false,
        offlineSeats: [],
        practice: false,
        seeds: {},
        tossing: false,
        landed: false,
      });
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});
