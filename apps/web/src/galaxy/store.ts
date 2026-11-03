import { derivedChainAction, galaxyBotFor } from "@game/galaxy-ai";
import {
  type Action,
  bidCommitment,
  bidSalt,
  type GalaxyRules,
  type GalaxyState,
  type GalaxyView,
  type GameEvent,
} from "@game/galaxy-engine";
import { create } from "zustand";
import { workerBotOption } from "@/game/bot-runner";
import { browserPace } from "@/game/bots";
import type { MatchHost, Snapshot, SubmitResult } from "@/game/host";
import { LocalMatch, type SavedMatch } from "@/game/local-match";
import { paced } from "@/game/settings";
import { playUiCue } from "@/game/ui-sound";
import { ArchiveRecorder } from "@/review/recorder";
import { StatsRecorder } from "@/stats/recorder";
import { track } from "@/stats/track";
import { buildTimeline, EMPTY_TIMELINE, type Timeline } from "./fx";
import { GALAXY_FX } from "./fx-timing";
import { galaxyKit, myRank } from "./kit";
import { rememberMet } from "./met-stars";
import { galaxyCuesFor } from "./sound";

export type GalaxyLocalMatch = LocalMatch<
  GalaxyRules,
  GalaxyState,
  GalaxyView,
  Action,
  GameEvent,
  undefined
>;
export type GalaxyHost = MatchHost<GalaxyView, Action, GameEvent> & {
  drain(): Snapshot<GalaxyView, GameEvent>[];
};

/** 봉인 입찰에 낸 값(약속을 낸 뒤 공개할 때 쓴다. 새로고침해도 공개할 수 있게 저장에도 남긴다) */
export interface PendingBid {
  index: number;
  value: number;
}

export type GalaxySaved = SavedMatch<GalaxyRules, Action, undefined> & {
  /** 컴퓨터 단계(0 입문, 1 중수, 2 고수) */
  level: number;
  bid?: PendingBid;
};

const SAVE_KEY = "galaxy-save";

function saveGalaxy(saved: GalaxySaved): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 된다.
  }
}

export function loadGalaxy(): GalaxySaved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as GalaxySaved;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearGalaxy(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}

/** 움직임 줄이기(연출 없이 결과만, docs/41 6절) */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

interface GalaxyStore {
  host: GalaxyHost | null;
  local: GalaxyLocalMatch | null;
  view: GalaxyView | null;
  /** 지금 보이는 걸음의 사건 */
  events: GameEvent[];
  /** 지금까지 보인 사건 모두(사건 줄·판 끝 「만난 별」) */
  history: GameEvent[];
  queue: Snapshot<GalaxyView, GameEvent>[];
  /** 지금 걸음의 연출(다 보일 때까지 다음 걸음을 미룬다) */
  timeline: Timeline;
  /** 연출이 시작한 때(performance.now). 걸음마다 바뀐다 */
  fxStart: number;
  /** 연출 중이다(결정 창을 띄우지 않고, 화면 시험이 `data-moving`으로 기다린다) */
  playing: boolean;
  level: number;
  notice: string | null;
  bid: PendingBid | null;
  /** 판 끝에 이 기기에서 처음 만난 별(별 id) */
  firstMet: string[];
  /** 정해진 장면에서 시작한다(저장·기록 없음). 튜토리얼 미션(G6)과 화면 시험이 쓴다 */
  practice: boolean;
  newGame(options: { rules: GalaxyRules; level: number; seed?: number }): void;
  startPractice(initialState: GalaxyState, level: number): void;
  resume(saved: GalaxySaved): void;
  submit(action: Action): SubmitResult;
  /** 봉인 입찰 값 내기(0은 내지 않기). 값은 약속으로만 나가고 모두 낸 뒤 공개한다 */
  placeBid(value: number): SubmitResult;
  leave(): void;
  clearNotice(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let fxTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
/** 마지막으로 자동으로 낸 행동(같은 화면을 다시 받아도 두 번 내지 않는다) */
let lastAuto: string | null = null;

function stop(): void {
  if (timer !== null) clearTimeout(timer);
  if (fxTimer !== null) clearTimeout(fxTimer);
  timer = null;
  fxTimer = null;
  unsubscribe?.();
  unsubscribe = null;
  lastAuto = null;
}

/** 이 걸음에 컴퓨터가 눈에 보이는 결정을 했나(굴리기·사기·넘기기·짓기·거래 제안) */
function botActed(events: readonly GameEvent[], me: number): boolean {
  return events.some(
    (e) =>
      ((e.type === "rolled" ||
        e.type === "bought" ||
        e.type === "built" ||
        e.type === "sold" ||
        e.type === "mortgaged" ||
        e.type === "unmortgaged") &&
        e.seat !== me) ||
      (e.type === "auctionStarted" && e.passer !== me) ||
      (e.type === "tradeOffered" && e.offer.from !== me),
  );
}

export const useGalaxy = create<GalaxyStore>((set, get) => {
  /** 약속·공개·입찰 공개는 내 기기가 바로 낸다(사람이 할 일이 없다). 혼자 하기는 자리 재료로 만든 씨앗 */
  const autoAct = (): void => {
    const { host, view, queue, playing } = get();
    if (!host || !view || queue.length > 0 || playing) return;
    const kind = view.decision?.kind;
    if (kind !== "commit" && kind !== "reveal" && kind !== "bidReveal") return;
    const key = `${view.generation}:${view.revealCount}:${view.auctionCount}:${kind}:${view.chains[view.mySeat]?.used ?? 0}`;
    if (lastAuto === key) return;
    let action: Action | null;
    if (kind === "bidReveal") {
      const bid = get().bid;
      const index = view.auction?.index ?? -1;
      const value = bid && bid.index === index ? bid.value : 0;
      action = {
        type: "bidReveal",
        value,
        salt: bidSalt(view.botKey, index),
      };
    } else action = derivedChainAction(view);
    if (!action) return;
    lastAuto = key;
    const result = host.submit(action);
    if (!result.ok) set({ notice: result.error });
  };

  const persist = () => {
    const { local, level, bid, practice } = get();
    if (local && !practice)
      saveGalaxy({ ...local.save(), level, ...(bid ? { bid } : {}) });
  };

  /** 쌓인 화면을 차례로 보인다. 컴퓨터 결정은 조금 기다렸다가, 연출이 있는 걸음은 연출이 끝난 뒤 다음으로 */
  const advance = (): void => {
    if (timer !== null || get().playing) return;
    const next = get().queue[0];
    if (next === undefined) return;
    const me = get().host?.seat ?? 0;
    const show = () => {
      timer = null;
      const timeline = buildTimeline(next.events, next.view.board, me, {
        reduced: prefersReducedMotion(),
        scale: paced,
      });
      const over = next.events.some((e) => e.type === "gameEnded");
      const history = [...get().history, ...next.events];
      set({
        queue: get().queue.slice(1),
        view: next.view,
        events: next.events,
        history,
        timeline,
        fxStart: performance.now(),
        playing: timeline.total > 0,
        ...(over ? { firstMet: rememberMet(next.view, history) } : {}),
      });
      galaxyCuesFor(next.events, next.view, timeline);
      const done = () => {
        fxTimer = null;
        set({ playing: false, timeline: EMPTY_TIMELINE });
        autoAct();
        advance();
      };
      if (timeline.total > 0) fxTimer = setTimeout(done, timeline.total);
      else done();
    };
    if (get().local !== null && botActed(next.events, me))
      timer = setTimeout(show, paced(GALAXY_FX.botThink));
    else show();
  };

  const attach = (
    local: GalaxyLocalMatch,
    level: number,
    seed: number,
    practice = false,
  ) => {
    stop();
    if (get().local !== local) get().local?.dispose();
    const key = `solo:${seed}`;
    // 정해진 장면(튜토리얼·화면 시험)은 저장·내 기록·복기에 남기지 않는다
    const recorder = practice
      ? null
      : new StatsRecorder(galaxyKit.stats, {
          game: "galaxy",
          mode: "solo",
          key,
        });
    const archiver = practice
      ? null
      : new ArchiveRecorder(galaxyKit.stats, {
          game: "galaxy",
          mode: "solo",
          key,
          seat: local.seat,
          seatNames: null,
          source: () => {
            const saved = local.save();
            return { rules: saved.rules, seed: saved.seed, log: saved.log };
          },
        });
    const first = local.drain();
    set({
      host: local,
      local,
      level,
      view: local.current(),
      events: [],
      history: first.flatMap((s) => s.events),
      queue: [],
      timeline: EMPTY_TIMELINE,
      playing: false,
      notice: null,
      firstMet: [],
      practice,
    });
    persist();
    for (const snapshot of first) {
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
    }
    unsubscribe = local.subscribe((snapshot) => {
      persist();
      recorder?.observe(snapshot);
      archiver?.observe(snapshot);
      set({ queue: [...get().queue, snapshot] });
      advance();
    });
    autoAct();
  };

  const newLocal = (
    rules: GalaxyRules,
    seed: number,
    level: number,
    log?: GalaxySaved["log"],
  ): GalaxyLocalMatch =>
    new LocalMatch(
      {
        kit: galaxyKit,
        rules,
        seed,
        humanSeat: 0,
        bot: galaxyBotFor(level),
        ...workerBotOption({ game: "galaxy", level }),
        pace: browserPace,
      },
      log,
    );

  return {
    host: null,
    local: null,
    view: null,
    events: [],
    history: [],
    queue: [],
    timeline: EMPTY_TIMELINE,
    fxStart: 0,
    playing: false,
    level: 0,
    notice: null,
    bid: null,
    firstMet: [],
    practice: false,

    startPractice(initialState, level) {
      const seed = Math.floor(Math.random() * 2 ** 31);
      set({ bid: null });
      const local: GalaxyLocalMatch = new LocalMatch({
        kit: galaxyKit,
        rules: initialState.rules,
        seed,
        humanSeat: 0,
        bot: galaxyBotFor(level),
        pace: browserPace,
        initialState,
      });
      attach(local, level, seed, true);
    },

    newGame({ rules, level, seed: given }) {
      track("game-start", { game: "galaxy", mode: "solo", level });
      const seed = given ?? Math.floor(Math.random() * 2 ** 31);
      set({ bid: null });
      attach(newLocal(rules, seed, level), level, seed);
    },

    resume(saved) {
      set({ bid: saved.bid ?? null });
      attach(
        newLocal(saved.rules, saved.seed, saved.level, saved.log),
        saved.level,
        saved.seed,
      );
    },

    submit(action) {
      const host = get().host;
      if (!host) return { ok: false, error: "게임이 없어요" };
      // 컴퓨터 수와 연출을 다 보여 주기 전에는 두지 않는다(기권은 언제든).
      if (action.type !== "resign" && (get().queue.length > 0 || get().playing))
        return { ok: false, error: "잠깐만요" };
      const result = host.submit(action);
      if (!result.ok) {
        set({ notice: result.error });
        playUiCue("invalid");
      }
      return result;
    },

    placeBid(value) {
      const view = get().view;
      const index = view?.auction?.index;
      if (!view || index === undefined || view.decision?.kind !== "bid")
        return { ok: false, error: "입찰할 때가 아니에요" };
      // 값을 먼저 남긴다(약속을 낸 뒤 새로고침해도 같은 값을 공개하게).
      set({ bid: { index, value } });
      const result = get().submit({
        type: "bid",
        hash: bidCommitment(index, value, bidSalt(view.botKey, index)),
      });
      if (!result.ok) set({ bid: null });
      return result;
    },

    leave() {
      stop();
      get().local?.dispose();
      set({
        host: null,
        local: null,
        view: null,
        queue: [],
        events: [],
        history: [],
        timeline: EMPTY_TIMELINE,
        playing: false,
        bid: null,
        firstMet: [],
        practice: false,
      });
    },

    clearNotice() {
      set({ notice: null });
    },
  };
});

/** 판 끝 순위 문구에 쓰는 내 순위(끝나지 않았으면 null) */
export function myStanding(view: GalaxyView) {
  return myRank(view.result, view.mySeat);
}
