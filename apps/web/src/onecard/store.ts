import {
  type Action,
  attackValue,
  type GameEvent,
  isAttackCard,
  type OnecardRules,
  type OnecardSetup,
  type OnecardState,
  type OnecardView,
  rankOf,
} from "@game/onecard-engine";
import { create } from "zustand";

import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import type { KitBot } from "@/game/kit";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder } from "@/review/recorder";
import { StatsRecorder } from "@/stats/recorder";
import { track } from "@/stats/track";

import { onecardBotFor, toKitBot } from "./bots";
import { onecardKit } from "./kit";

export type OnecardLocalMatch = LocalMatch<
  OnecardRules,
  OnecardState,
  OnecardView,
  Action,
  GameEvent,
  OnecardSetup
>;
export type OnecardHost = MatchHost<OnecardView, Action, GameEvent> & {
  drain(): Snapshot<OnecardView, GameEvent>[];
};

export type OnecardSaved = SavedMatch<OnecardRules, Action, OnecardSetup> & {
  level: number;
};

/**
 * 컴퓨터가 차례 수를 두기 전에 기다리는 시간. 대국 진행 자체를 늦춘다(외침 창은 엔진 걸음 시각부터 재므로,
 * 화면만 늦추면 내가 볼 시간이 그만큼 준다)
 */
export const BOT_PACE_MS = 700;

/** 화면 시험이 컴퓨터를 빨리 두게 할 때(`window.__onecardPace`) */
function paceMs(): number {
  const fast = (globalThis as { __onecardPace?: number }).__onecardPace;
  return typeof fast === "number" ? fast : BOT_PACE_MS;
}

function botPace(next: () => void): void {
  setTimeout(next, paceMs());
}

const SAVE_KEY = "onecard-save";

function saveOnecard(saved: OnecardSaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadOnecard(): OnecardSaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as OnecardSaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearOnecard(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

/** 사건에 맞춰 소리를 낸다 */
export function cuesFor(
  events: readonly GameEvent[],
  me: number,
  rules: OnecardRules,
  play: (cue: Parameters<typeof playUiCue>[0], times?: number) => void,
): void {
  // 벌칙으로 먹는 것은 잡힘·헛외침 소리가 대신한다.
  const penalty = new Set<number>();
  for (const e of events) {
    switch (e.type) {
      case "dealt":
        play("deal");
        break;
      case "played": {
        const rank = rankOf(e.card);
        if (isAttackCard(e.card)) {
          const own = attackValue(e.card, rules);
          if (e.attack > own) play("onecardBlock");
          else play("onecardAttack", Math.min(3, Math.ceil(e.attack / 3)));
        } else if (rank === "7") play("onecardSuit");
        else if (rank === "J") play("onecardSkip");
        else if (rank === "Q") play("onecardReverse");
        else if (rank === "K") play("onecardAgain");
        else play("card");
        break;
      }
      case "drew":
        if (e.reason === "caught" || e.reason === "falseShout") break;
        if (!penalty.has(e.seat)) play("onecardDraw");
        break;
      case "shouted":
        play("onecardShout");
        break;
      case "caught":
        penalty.add(e.target);
        play("onecardCaught");
        break;
      case "falseShout":
        penalty.add(e.seat);
        play("onecardFalse");
        break;
      case "reshuffled":
        play("onecardReshuffle");
        break;
      case "finished":
        play("onecardOut");
        break;
      case "ended":
        if (!e.retired) play(e.result.ranks[me] === 1 ? "win" : "lose");
        break;
      default:
        break;
    }
  }
}

interface OnecardStore {
  host: OnecardHost | null;
  local: OnecardLocalMatch | null;
  view: OnecardView | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: GameEvent[];
  /** 사건 묶음마다 오르는 번호(말풍선을 새로 띄운다) */
  eventSeq: number;
  level: number;
  notice: string | null;
  /** 튜토리얼 연습 판(이어하기 저장·내 기록·복기에 남기지 않는다) */
  practice: boolean;
  newGame(options: { rules: OnecardRules; level: number; seed?: number }): void;
  resume(saved: OnecardSaved): void;
  /**
   * 튜토리얼 연습 판. 장면 상태(`initialState`)가 있으면 거기서, 없으면 `rules`로 처음부터.
   * 컴퓨터는 넘겨받은 것(장면 대본 또는 실전 컴퓨터)을 쓴다
   */
  startPractice(options: {
    rules: OnecardRules;
    initialState?: OnecardState;
    bot: KitBot<OnecardView, Action, GameEvent>;
  }): void;
  submit(action: Action): SubmitResult;
  /** 혼자 하기를 그만두고 지금 순위로 끝낸다 */
  resign(): void;
  leave(): void;
  clearNotice(): void;
}

let unsubscribe: (() => void) | null = null;

function stop(): void {
  unsubscribe?.();
  unsubscribe = null;
}

export const useOnecard = create<OnecardStore>((set, get) => {
  const playCue = (cue: Parameters<typeof playUiCue>[0], times = 1) => {
    for (let i = 0; i < times; i++) setTimeout(() => playUiCue(cue), i * 160);
  };

  const attachLocal = (
    local: OnecardLocalMatch,
    level: number,
    seed: number,
  ) => {
    stop();
    if (get().local !== local) get().local?.dispose();
    const key = `solo:${seed}`;
    const recorder = new StatsRecorder(onecardKit.stats, {
      game: "onecard",
      mode: "solo",
      key,
    });
    const archiver = new ArchiveRecorder(onecardKit.stats, {
      game: "onecard",
      mode: "solo",
      key,
      seat: local.seat,
      seatNames: null,
      source: () => {
        const saved = local.save();
        return { rules: saved.rules, seed: saved.seed, log: saved.log };
      },
    });
    const persist = () => saveOnecard({ ...local.save(), level });
    const first = local.drain();
    set({
      host: local,
      local,
      level,
      view: local.current(),
      events: first.flatMap((s) => s.events),
      eventSeq: get().eventSeq + 1,
      notice: null,
      practice: false,
    });
    persist();
    for (const snapshot of first) {
      recorder.observe(snapshot);
      archiver.observe(snapshot);
    }
    cuesFor(
      first.flatMap((s) => s.events),
      local.seat,
      local.current().rules,
      playCue,
    );
    unsubscribe = local.subscribe((snapshot) => {
      persist();
      recorder.observe(snapshot);
      archiver.observe(snapshot);
      set({
        view: snapshot.view,
        events: snapshot.events,
        eventSeq: get().eventSeq + 1,
      });
      cuesFor(snapshot.events, local.seat, snapshot.view.rules, playCue);
    });
  };

  const newLocal = (
    rules: OnecardRules,
    seed: number,
    level: number,
    log?: OnecardSaved["log"],
  ): OnecardLocalMatch =>
    new LocalMatch(
      {
        kit: onecardKit,
        rules,
        seed,
        humanSeat: 0,
        bot: toKitBot(onecardBotFor(level)),
        pace: botPace,
      },
      log,
    );

  return {
    host: null,
    local: null,
    view: null,
    events: [],
    eventSeq: 0,
    level: 1,
    notice: null,
    practice: false,

    newGame({ rules, level, seed: given }) {
      track("game-start", { game: "onecard", mode: "solo", level });
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

    startPractice({ rules, initialState, bot }) {
      stop();
      get().local?.dispose();
      const local: OnecardLocalMatch = new LocalMatch({
        kit: onecardKit,
        rules,
        seed: Math.floor(Math.random() * 2 ** 31),
        humanSeat: 0,
        bot,
        pace: botPace,
        ...(initialState ? { initialState } : {}),
      });
      const first = local.drain();
      const events = first.flatMap((s) => s.events);
      set({
        host: local,
        local,
        level: 1,
        view: local.current(),
        events,
        eventSeq: get().eventSeq + 1,
        notice: null,
        practice: true,
      });
      cuesFor(events, local.seat, local.current().rules, playCue);
      unsubscribe = local.subscribe((snapshot) => {
        set({
          view: snapshot.view,
          events: snapshot.events,
          eventSeq: get().eventSeq + 1,
        });
        cuesFor(snapshot.events, local.seat, snapshot.view.rules, playCue);
      });
    },

    submit(action) {
      const host = get().host;
      if (!host) return { ok: false, error: "게임이 없다" };
      const result = host.submit(action);
      if (!result.ok) {
        set({ notice: result.error });
        playUiCue("invalid");
      }
      return result;
    },

    resign() {
      get().local?.end();
    },

    leave() {
      stop();
      get().local?.dispose();
      set({
        host: null,
        local: null,
        view: null,
        events: [],
        practice: false,
      });
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});
