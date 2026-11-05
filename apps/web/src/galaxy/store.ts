import { derivedChainAction, galaxyBotFor } from "@game/galaxy-ai";
import {
  type Action,
  bidCommitment,
  bidSalt,
  GALAXY_EDITION,
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
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";
import { track } from "@/stats/track";
import {
  bidAction,
  commitAction,
  EMPTY_SECRETS,
  type GalaxySecrets,
  loadSecrets,
  newSalt,
  newSeed,
  revealFor,
  saveSecrets,
} from "./chain";
import { buildTimeline, EMPTY_TIMELINE, type Timeline } from "./fx";
import { GALAXY_FX } from "./fx-timing";
import { galaxyKit, myRank } from "./kit";
import { rememberMet } from "./met-stars";
import { scriptedDiceStep } from "./practice";
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

/** 봉투 입찰에 낸 값(약속을 낸 뒤 공개할 때 쓴다. 새로고침해도 공개할 수 있게 저장에도 남긴다) */
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
    // 판 번호가 다른 이어하기(옛 규칙 판)는 버린다
    return saved.version === 1 &&
      Array.isArray(saved.log) &&
      saved.rules?.edition === GALAXY_EDITION
      ? saved
      : null;
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
  /** 혼자 할 때만: 저장에 쓴다. 온라인 대국이면 null */
  local: GalaxyLocalMatch | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  offlineSeats: number[];
  /** 온라인: 이 기기에만 있는 주사위 사슬 씨앗과 봉투(`chain.ts`) */
  secrets: GalaxySecrets;
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
  /** `dice`: 장면의 굴림 눈을 차례로 정해 둔다(튜토리얼 미션). 다 쓰면 보통처럼 사슬로 굴린다 */
  startPractice(
    initialState: GalaxyState,
    level: number,
    dice?: readonly (readonly [number, number])[],
  ): void;
  resume(saved: GalaxySaved): void;
  /** 온라인 방의 대국을 붙인다(저장 없음) */
  attachOnline(
    host: GalaxyHost,
    seatNames: string[],
    stats: StatsTarget,
    archive?: ArchiveTarget,
  ): void;
  setSeatNames(seatNames: string[]): void;
  submit(action: Action): SubmitResult;
  /** 봉투 입찰 값 내기(0은 내지 않기). 값은 약속으로만 나가고 모두 낸 뒤 공개한다 */
  placeBid(value: number): SubmitResult;
  leave(): void;
  clearNotice(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let fxTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
/** 마지막으로 자동으로 낸 행동(같은 화면을 다시 받아도 두 번 내지 않는다) */
let lastAuto: string | null = null;
/** 온라인 방의 비밀을 남기는 열쇠(`online:방`). 혼자 하기·미션은 null(자리 재료로 만든 씨앗·소금) */
let secretKey: string | null = null;

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
  /**
   * 약속·공개·입찰 공개는 내 기기가 바로 낸다(사람이 할 일이 없다). 온라인은 이 기기에서 만든 씨앗·소금,
   * 혼자 하기는 자리 재료로 만든 씨앗·소금. 온라인에서 내 비밀을 모르면(다른 기기에서 약속했다 등) 내지 않는다
   */
  const autoAct = (): void => {
    const { host, view, queue, playing } = get();
    if (!host || !view || queue.length > 0 || playing) return;
    const kind = view.decision?.kind;
    if (kind !== "commit" && kind !== "reveal" && kind !== "bidReveal") return;
    const key = `${view.generation}:${view.revealCount}:${view.auctionCount}:${kind}:${view.chains[view.mySeat]?.used ?? 0}`;
    if (lastAuto === key) return;
    let action: Action | null;
    if (secretKey) {
      let secrets = get().secrets;
      if (kind === "commit") {
        let seed = secrets.seeds[view.generation];
        if (!seed) {
          seed = newSeed();
          secrets = {
            ...secrets,
            seeds: { ...secrets.seeds, [view.generation]: seed },
          };
          // 약속을 내기 전에 먼저 남긴다(새로고침해도 공개할 수 있게).
          set({ secrets });
          saveSecrets(secretKey, secrets);
        }
        action = commitAction(seed);
      } else action = revealFor(view, secrets);
    } else if (kind === "bidReveal") {
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
        // 연출 시간은 진행 속도 설정과 상관없이 그대로(읽을 시간 1.2초·움직임 0.6초를 지킨다, docs/41 6절).
        // 진행 속도는 컴퓨터가 생각하는 기다림만 줄인다
        reduced: prefersReducedMotion(),
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
    host: GalaxyHost,
    options: {
      local: GalaxyLocalMatch | null;
      level: number;
      seatNames: string[] | null;
      /** 정해진 장면(튜토리얼·화면 시험)이면 저장·내 기록·복기에 남기지 않는다 */
      practice: boolean;
      stats: StatsTarget | null;
      archive?: ArchiveTarget;
      secrets: GalaxySecrets;
      secretKey: string | null;
    },
  ) => {
    stop();
    const { local, level, practice } = options;
    if (get().local !== local) get().local?.dispose();
    secretKey = options.secretKey;
    const recorder =
      practice || !options.stats
        ? null
        : new StatsRecorder(galaxyKit.stats, options.stats);
    const archiver =
      practice || !options.archive
        ? null
        : new ArchiveRecorder(galaxyKit.stats, options.archive);
    const first = host.drain();
    set({
      host,
      local,
      level,
      seatNames: options.seatNames,
      reconnecting: false,
      hostLeft: false,
      offlineSeats: [],
      secrets: options.secrets,
      view: host.current(),
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

  /** 혼자 하기·미션: 이 기기의 대국으로 붙인다 */
  const attachLocal = (
    local: GalaxyLocalMatch,
    level: number,
    seed: number,
    practice = false,
  ) => {
    const key = `solo:${seed}`;
    attach(local, {
      local,
      level,
      seatNames: null,
      practice,
      stats: { game: "galaxy", mode: "solo", key },
      archive: {
        game: "galaxy",
        mode: "solo",
        key,
        seat: local.seat,
        seatNames: null,
        source: () => {
          const saved = local.save();
          return { rules: saved.rules, seed: saved.seed, log: saved.log };
        },
      },
      secrets: EMPTY_SECRETS,
      secretKey: null,
    });
  };

  return {
    host: null,
    local: null,
    seatNames: null,
    reconnecting: false,
    hostLeft: false,
    offlineSeats: [],
    secrets: EMPTY_SECRETS,
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

    startPractice(initialState, level, dice) {
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
        ...(dice && dice.length > 0
          ? { step: scriptedDiceStep(initialState, dice) }
          : {}),
      });
      attachLocal(local, level, seed, true);
    },

    newGame({ rules, level, seed: given }) {
      track("game-start", { game: "galaxy", mode: "solo", level });
      const seed = given ?? Math.floor(Math.random() * 2 ** 31);
      set({ bid: null });
      attachLocal(newLocal(rules, seed, level), level, seed);
    },

    resume(saved) {
      set({ bid: saved.bid ?? null });
      attachLocal(
        newLocal(saved.rules, saved.seed, saved.level, saved.log),
        saved.level,
        saved.seed,
      );
    },

    attachOnline(host, seatNames, stats, archive) {
      set({ bid: null });
      attach(host, {
        local: null,
        level: get().level,
        seatNames,
        practice: false,
        stats,
        ...(archive ? { archive } : {}),
        secrets: loadSecrets(stats.key),
        secretKey: stats.key,
      });
    },

    setSeatNames(seatNames) {
      set({ seatNames });
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
      if (secretKey) {
        // 온라인: 이 기기에서 만든 소금으로 약속한다. 값과 소금을 먼저 남긴다(새로고침해도 공개하게).
        const salt = newSalt();
        const secrets = get().secrets;
        const next = {
          ...secrets,
          bids: { ...secrets.bids, [index]: { value, salt } },
        };
        set({ secrets: next });
        saveSecrets(secretKey, next);
        return get().submit(bidAction(index, value, salt));
      }
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
      secretKey = null;
      set({
        host: null,
        local: null,
        seatNames: null,
        reconnecting: false,
        hostLeft: false,
        offlineSeats: [],
        secrets: EMPTY_SECRETS,
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
