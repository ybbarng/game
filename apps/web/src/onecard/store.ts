import {
  type Action,
  attackValue,
  type GameEvent,
  isAttackCard,
  type OnecardRules,
  type OnecardState,
  type OnecardView,
  rankOf,
} from "@game/onecard-engine";
import { create } from "zustand";

import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import type { KitBot } from "@/game/kit";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";
import { track } from "@/stats/track";

import { onecardBotFor, toKitBot } from "./bots";
import { type OnecardExtra, onecardKit } from "./kit";

export type OnecardLocalMatch = LocalMatch<
  OnecardRules,
  OnecardState,
  OnecardView,
  Action,
  GameEvent,
  OnecardExtra
>;
export type OnecardHost = MatchHost<OnecardView, Action, GameEvent> & {
  drain(): Snapshot<OnecardView, GameEvent>[];
};

export type OnecardSaved = SavedMatch<OnecardRules, Action, OnecardExtra> & {
  level: number;
};

/**
 * 컴퓨터가 차례 수를 두기 전에 기다리는 시간. 대국 진행 자체를 늦춘다(외침 창은 엔진 걸음 시각부터 재므로,
 * 화면만 늦추면 내가 볼 시간이 그만큼 준다)
 */
export const BOT_PACE_MS = 700;

/**
 * 컴퓨터 대기(혼자 하기·온라인 방 모두 이 함수 하나로 기다린다).
 *
 * `window.__onecardPace`는 **시험 전용**이다(이 함수 밖에서 읽지 않는다). 온라인 화면 시험은 탭이 여럿이라
 * `page.clock`으로 감을 수 없어 이 값으로 컴퓨터 차례 수 대기만 줄인다. 외침 반응(컴퓨터 `react`), 본인 시간 P·잡기 창 T,
 * 청구 묶음 창은 모두 Clock으로 재므로 이 값이 닿지 않는다(판정 시간은 시험에서도 제품과 같다)
 */
export function botPace(next: () => void): void {
  const fast = (globalThis as { __onecardPace?: number }).__onecardPace;
  setTimeout(next, typeof fast === "number" ? fast : BOT_PACE_MS);
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

/**
 * 자리별 외침·잡기·헛외침 사건 수(`OnecardStore.shoutEvents`). 사건을 낸 자리(외친 사람·잡은 사람·헛외친 사람)로 센다.
 * `prev`에 더한 새 배열을 돌려준다
 */
export function countShouts(
  events: readonly GameEvent[],
  prev: readonly number[] = [],
): number[] {
  const next = [...prev];
  for (const e of events)
    if (e.type === "shouted" || e.type === "caught" || e.type === "falseShout")
      next[e.seat] = (next[e.seat] ?? 0) + 1;
  return Array.from(next, (n) => n ?? 0);
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
  /** 혼자 할 때만: 저장에 쓴다 */
  local: OnecardLocalMatch | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  offlineSeats: number[];
  view: OnecardView | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: GameEvent[];
  /** 사건 묶음마다 오르는 번호(말풍선을 새로 띄운다) */
  eventSeq: number;
  /**
   * 이 대국에서 받은 외침·잡기·헛외침 사건 수, 사건을 낸 자리별(말풍선은 잠깐 떴다 사라지지만 이 값은 남는다).
   * 화면 뿌리의 `data-shouts-by`(자리 순서로 쉼표로 이은 수)로 보인다(화면 시험이 잠깐 뜨는 말풍선 대신 이 값을 기다린다)
   */
  shoutEvents: readonly number[];
  level: number;
  notice: string | null;
  /** 튜토리얼 연습 판(이어하기 저장·내 기록·복기에 남기지 않는다) */
  practice: boolean;
  newGame(options: { rules: OnecardRules; level: number; seed?: number }): void;
  resume(saved: OnecardSaved): void;
  /**
   * 온라인 방의 대국을 붙인다(저장 없음). `claim`은 "원카드!"를 방 청구 통로(`room.claims`)로 보내는 함수다.
   * 온라인에서는 외침이 엔진 행동이 아니라 모두에게 직접 가는 청구다(docs/43 7-1)
   */
  attachOnline(
    host: OnecardHost,
    seatNames: string[],
    stats: StatsTarget,
    claim: (seen: number, rtMs?: number) => boolean,
    archive?: ArchiveTarget,
  ): void;
  setSeatNames(seatNames: string[]): void;
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
  /** 가운데 더미 치기. 혼자 하기는 바로 행동으로, 온라인은 청구로. `rtMs`: 그 판을 그린 뒤 누르기까지(o2 겨루기) */
  shout(seen: number, rtMs?: number): void;
  /** 혼자 하기를 그만두고 지금 순위로 끝낸다 */
  resign(): void;
  leave(): void;
  clearNotice(): void;
}

let unsubscribe: (() => void) | null = null;
/** 온라인 방의 청구 보내기(혼자 하기면 null) */
let claimShout: ((seen: number, rtMs?: number) => boolean) | null = null;

function stop(): void {
  unsubscribe?.();
  unsubscribe = null;
}

export const useOnecard = create<OnecardStore>((set, get) => {
  const playCue = (cue: Parameters<typeof playUiCue>[0], times = 1) => {
    for (let i = 0; i < times; i++) setTimeout(() => playUiCue(cue), i * 160);
  };

  const attach = (
    host: OnecardHost,
    options: {
      local: OnecardLocalMatch | null;
      level: number;
      seatNames: string[] | null;
      stats: StatsTarget;
      archive?: ArchiveTarget;
    },
  ) => {
    stop();
    const { local, level } = options;
    if (get().local !== local) get().local?.dispose();
    const recorder = new StatsRecorder(onecardKit.stats, options.stats);
    const archiver = options.archive
      ? new ArchiveRecorder(onecardKit.stats, options.archive)
      : null;
    const persist = () => {
      if (local) saveOnecard({ ...local.save(), level });
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
      events: first.flatMap((s) => s.events),
      eventSeq: get().eventSeq + 1,
      shoutEvents: countShouts(first.flatMap((s) => s.events)),
      notice: null,
      practice: false,
    });
    persist();
    for (const snapshot of first) {
      recorder.observe(snapshot);
      archiver?.observe(snapshot);
    }
    cuesFor(
      first.flatMap((s) => s.events),
      host.seat,
      host.current().rules,
      playCue,
    );
    unsubscribe = host.subscribe((snapshot) => {
      persist();
      recorder.observe(snapshot);
      archiver?.observe(snapshot);
      set({
        view: snapshot.view,
        events: snapshot.events,
        eventSeq: get().eventSeq + 1,
        shoutEvents: countShouts(snapshot.events, get().shoutEvents),
      });
      cuesFor(snapshot.events, host.seat, snapshot.view.rules, playCue);
    });
  };

  const attachLocal = (
    local: OnecardLocalMatch,
    level: number,
    seed: number,
  ) => {
    claimShout = null;
    const key = `solo:${seed}`;
    attach(local, {
      local,
      level,
      seatNames: null,
      stats: { game: "onecard", mode: "solo", key },
      archive: {
        game: "onecard",
        mode: "solo",
        key,
        seat: local.seat,
        seatNames: null,
        source: () => {
          const saved = local.save();
          return { rules: saved.rules, seed: saved.seed, log: saved.log };
        },
      },
    });
  };

  const newLocal = (
    rules: OnecardRules,
    seed: number,
    level: number,
    log?: OnecardSaved["log"],
    reactRng?: number,
  ): OnecardLocalMatch =>
    new LocalMatch(
      {
        kit: onecardKit,
        rules,
        seed,
        humanSeat: 0,
        bot: toKitBot(onecardBotFor(level)),
        pace: botPace,
        ...(reactRng !== undefined ? { reactRng } : {}),
      },
      log,
    );

  return {
    host: null,
    local: null,
    seatNames: null,
    reconnecting: false,
    hostLeft: false,
    offlineSeats: [],
    view: null,
    events: [],
    eventSeq: 0,
    shoutEvents: [],
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
        newLocal(
          saved.rules,
          saved.seed,
          saved.level,
          saved.log,
          saved.reactRng,
        ),
        saved.level,
        saved.seed,
      );
    },

    attachOnline(host, seatNames, stats, claim, archive) {
      claimShout = claim;
      attach(host, {
        local: null,
        level: get().level,
        seatNames,
        stats,
        ...(archive ? { archive } : {}),
      });
    },

    setSeatNames(seatNames) {
      set({ seatNames });
    },

    startPractice({ rules, initialState, bot }) {
      stop();
      claimShout = null;
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
        shoutEvents: countShouts(events),
        notice: null,
        practice: true,
      });
      cuesFor(events, local.seat, local.current().rules, playCue);
      unsubscribe = local.subscribe((snapshot) => {
        set({
          view: snapshot.view,
          events: snapshot.events,
          eventSeq: get().eventSeq + 1,
          shoutEvents: countShouts(snapshot.events, get().shoutEvents),
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

    shout(seen, rtMs) {
      // 판이 끝나면 더미 치기를 받지 않는다(온라인 방은 판 끝에 청구 통로를 닫는다)
      const view = get().view;
      if (view?.phase === "over") return;
      if (claimShout) {
        if (!claimShout(seen, rtMs)) playUiCue("invalid");
        return;
      }
      // o2 겨루기는 반응 시간을 싣는다(옛 규칙은 싣지 않는다)
      get().submit(
        view?.rules.race && rtMs !== undefined
          ? { type: "shout", seen, rt: rtMs }
          : { type: "shout", seen },
      );
    },

    resign() {
      get().local?.end();
    },

    leave() {
      stop();
      claimShout = null;
      get().local?.dispose();
      set({
        host: null,
        local: null,
        seatNames: null,
        view: null,
        events: [],
        shoutEvents: [],
        reconnecting: false,
        hostLeft: false,
        offlineSeats: [],
        practice: false,
      });
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});
