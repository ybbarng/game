import { create } from "zustand";
import { ArchiveRecorder, type ArchiveTarget } from "@/review/recorder";
import { StatsRecorder, type StatsTarget } from "@/stats/recorder";
import { type GameId, track } from "@/stats/track";
import { workerBotOption } from "./bot-runner";
import { browserPace } from "./bots";
import type { MatchHost, Snapshot, SubmitResult } from "./host";
import type { GameKit, KitBot } from "./kit";
import { LocalMatch, type SavedMatch } from "./local-match";
import type { SavedSlot } from "./saved-slot";
import { paced } from "./settings";
import type { Cue } from "./sound";
import { playUiCue } from "./ui-sound";

export { isSavedMatch, type SavedSlot, savedMatchSlot } from "./saved-slot";

/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type MatchStoreHost<View, ActionT, Event> = MatchHost<
  View,
  ActionT,
  Event
> & {
  drain(): Snapshot<View, Event>[];
};

/** 혼자 하기 이어하기 저장본: 대국 기록과 컴퓨터 단계 */
export type MatchSaved<Rules, ActionT, Deal = undefined> = SavedMatch<
  Rules,
  ActionT,
  Deal
> & {
  /** 컴퓨터 단계(0 입문, 1 중수, 2 고수, 3 초고수) */
  level: number;
};

/** 늦게 낼 소리: 장면이 보인 뒤 `delay`초 */
export interface TimedCue {
  cue: Cue;
  delay: number;
}

/** 새 게임 고르기. 편을 고르는 게임(`Pick`이 있으면)만 `pick`을 받는다 */
export type NewGameOptions<Rules, Pick> = {
  rules: Rules;
  level: number;
  /** 정해진 씨앗(주소 `?seed=`). 없으면 새로 */
  seed?: number;
} & ([Pick] extends [undefined] ? { pick?: undefined } : { pick: Pick });

export interface MatchStoreState<
  Rules,
  State,
  View,
  ActionT,
  Event,
  Deal = undefined,
  Pick = undefined,
> {
  host: MatchStoreHost<View, ActionT, Event> | null;
  /** 혼자 할 때만: 저장·무르기에 쓴다 */
  local: LocalMatch<Rules, State, View, ActionT, Event, Deal> | null;
  /** 온라인 대국이면 자리 이름 */
  seatNames: string[] | null;
  reconnecting: boolean;
  hostLeft: boolean;
  /** 내 기기의 판 끝 검증이 실패했으면 그 사유(이 게임은 무효, 마이티·하트와 같다) */
  invalid: string | null;
  offlineSeats: number[];
  view: View | null;
  /** 마지막으로 보인 걸음의 사건 */
  events: Event[];
  /** 보인 걸음 번호(같은 화면이 다시 와도 판 끝 띠를 한 번만 띄운다) */
  seq: number;
  /** 지금 화면을 보인 시각(ms, Date.now). 나이롱뽕 뽕 응답 창의 남은 시간을 세는 기준 */
  viewAt: number;
  queue: Snapshot<View, Event>[];
  level: number;
  notice: string | null;
  /** 연습 대국(튜토리얼 미션·배우기 예시): 저장·기록·무르기를 하지 않는다 */
  practice: boolean;
  newGame(options: NewGameOptions<Rules, Pick>): void;
  resume(saved: MatchSaved<Rules, ActionT, Deal>): void;
  /**
   * 연습 대국: 이 장면에서 컴퓨터(기본 입문)와 둔다(나는 0번 자리). 튜토리얼 미션과 배우기 예시 이어 두기가 쓴다.
   * 장면이 없으면(`null`) 규칙의 처음부터. 저장(이어하기)·내 기록·복기 기록을 남기지 않아 하던 게임을 덮어쓰지 않는다
   */
  startPractice(
    initialState: State | null,
    options?: { level?: number; rules?: Rules },
  ): void;
  /** 온라인 방의 대국을 붙인다(저장·무르기 없음) */
  attachOnline(
    host: MatchStoreHost<View, ActionT, Event>,
    seatNames: string[],
    stats: StatsTarget,
    /** 방장: 복기용 기록(참가자는 게임 끝 검증 뒤 방에서 받아 남긴다) */
    archive?: ArchiveTarget,
  ): void;
  setSeatNames(seatNames: string[]): void;
  submit(action: ActionT): SubmitResult;
  /** 혼자 할 때 무르기: 내 마지막 차례(와 그 뒤 컴퓨터 수)를 되돌린다 */
  undo(): boolean;
  canUndo(): boolean;
  leave(): void;
  clearNotice(): void;
}

export interface MatchStoreConfig<
  Rules,
  State,
  View extends { phase: string },
  ActionT extends { type: string },
  Event,
  Deal = undefined,
  Pick = undefined,
> {
  /** 내 기록·복기·워커 컴퓨터·사용 기록에 쓰는 게임 이름 */
  game: GameId;
  kit: GameKit<Rules, State, View, ActionT, Event, Deal>;
  botFor(level: number): KitBot<View, ActionT>;
  /** 이어하기 저장 칸(`savedMatchSlot`) */
  slot: SavedSlot<MatchSaved<Rules, ActionT, Deal>>;
  /** 저장소를 처음 만들 때의 컴퓨터 단계(온라인 대국에 그대로 실린다) */
  initialLevel: number;
  /** 편을 고르는 게임: 이 씨앗의 첫 판에서 고른 편을 쥐는 자리. 없으면 늘 0번 자리 */
  seatFor?(rules: Rules, seed: number, pick: Pick): number;
  /** 연습 대국의 규칙(장면에서 읽는다). 없으면 `startPractice`에 `rules`를 넘긴다 */
  rulesOf?(state: State): Rules;
  /** 연습 대국의 씨앗. 없으면 새로 */
  practiceSeed?: number;
  /** 무르기로 되돌리는 내 행동(수 두기·쉬기 등) */
  isTurn(action: ActionT): boolean;
  /** 무를 수 있는 단계인가(대국의 최신 상태로 본다). 없으면 `phase === "play"` */
  undoable?(latest: View): boolean;
  /** 새 판을 여는 행동. 있으면 무르기는 이번 판 안의 내 차례만 본다(판을 넘기면 정산이 끝났다) */
  opensRound?(action: ActionT): boolean;
  /** 이 걸음에 낼 소리 */
  cues(events: readonly Event[], me: number): readonly (Cue | TimedCue)[];
  /** 남(컴퓨터·다른 사람)이 한 걸음인가: 잠깐 쉬어 무엇을 했는지 보이게 한다 */
  byOther(events: readonly Event[], me: number): boolean;
  /**
   * 남의 걸음을 보이는 쉼(ms, 진행 속도 설정을 따른다). `when`이 "before"면 그 걸음을 보이기 전에, "after"면 보인 뒤에
   * 쉰다. `soloOnly`면 혼자 하기(컴퓨터 상대)만 쉬고 온라인 상대 수는 바로 보인다
   */
  otherPause: { ms: number; when: "before" | "after"; soloOnly?: boolean };
  /** 이 장면의 연출(나눠 주기·카드 내기 등)이 걸리는 시간(ms). 다음 장면은 그 뒤에 보인다 */
  sceneMs?(events: readonly Event[], view: View): number;
  /**
   * 대국을 붙일 때 처음 보일 사건과 그 연출 시간. `first`는 붙이기 전까지 쌓인 걸음이다.
   * 없으면 사건 없이 지금 화면만 보인다
   */
  opening?(
    first: readonly Snapshot<View, Event>[],
    view: View,
  ): { events: Event[]; ms: number };
  /** 컴퓨터 행동 사이를 늦추는 함수(혼자 하기·연습 대국). 없으면 `browserPace` */
  pace?(next: () => void): void;
}

/**
 * 게임 저장소 공장: 혼자 하기(이 기기의 LocalMatch)·온라인 대국(HostRoom·GuestRoom이 넘기는 창구)·연습 대국을 붙이고,
 * 쌓인 장면을 차례로 보이며(남의 걸음은 잠깐 쉬고, 연출이 끝난 뒤), 소리·이어하기 저장·내 기록·복기·무르기를 맡는다.
 * 게임마다 다른 것(편 고르기, 무르는 행동, 소리, 남의 걸음, 연출 시간)만 `config`로 받는다(docs/21)
 */
export function createMatchStore<
  Rules,
  State,
  View extends { phase: string },
  ActionT extends { type: string },
  Event,
  Deal = undefined,
  Pick = undefined,
>(config: MatchStoreConfig<Rules, State, View, ActionT, Event, Deal, Pick>) {
  type Host = MatchStoreHost<View, ActionT, Event>;
  type Local = LocalMatch<Rules, State, View, ActionT, Event, Deal>;
  type Saved = MatchSaved<Rules, ActionT, Deal>;
  type Store = MatchStoreState<Rules, State, View, ActionT, Event, Deal, Pick>;
  const { game, kit, slot } = config;
  const undoable =
    config.undoable ?? ((latest: View) => latest.phase === "play");
  const pause = config.otherPause;
  const pace = config.pace ?? browserPace;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;
  /** 지금 보이는 장면의 연출(과 남의 걸음을 보이는 쉼)이 끝나는 시각. 다음 장면은 그 뒤에 보인다 */
  let shownUntil = 0;

  function stop(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    shownUntil = 0;
    unsubscribe?.();
    unsubscribe = null;
  }

  function playCues(events: readonly Event[], me: number): void {
    for (const c of config.cues(events, me)) {
      if (typeof c === "string") playUiCue(c);
      else if (c.delay <= 0) playUiCue(c.cue);
      else setTimeout(() => playUiCue(c.cue), c.delay * 1000);
    }
  }

  return create<Store>((set, get) => {
    /** 남의 걸음이라 쉬어야 하나 */
    const pausesFor = (events: readonly Event[], me: number): boolean =>
      (!pause.soloOnly || get().local !== null) && config.byOther(events, me);

    /** 쌓인 화면을 차례로 보인다. 앞 장면의 연출이 끝난 뒤, 남의 걸음은 조금 쉬어 가며 */
    const advance = (): void => {
      if (timer !== null) return;
      const next = get().queue[0];
      if (next === undefined) return;
      const me = get().host?.seat ?? 0;
      const other = pausesFor(next.events, me);
      const show = () => {
        timer = null;
        // 기다리는 사이 새 화면이 쌓였을 수 있어, 그때의 줄에서 첫 장만 뺀다.
        set({
          queue: get().queue.slice(1),
          view: next.view,
          events: next.events,
          seq: get().seq + 1,
          viewAt: Date.now(),
        });
        const scene = config.sceneMs?.(next.events, next.view) ?? 0;
        const after = other && pause.when === "after" ? paced(pause.ms) : 0;
        shownUntil = scene + after > 0 ? Date.now() + scene + after : 0;
        playCues(next.events, me);
        advance();
      };
      const wait =
        Math.max(0, shownUntil - Date.now()) +
        (other && pause.when === "before" ? paced(pause.ms) : 0);
      if (wait > 0) timer = setTimeout(show, wait);
      else show();
    };

    const attach = (
      host: Host,
      options: {
        local: Local | null;
        level: number;
        seatNames: string[] | null;
        /** 없으면 내 기록에 남기지 않는다(연습 대국) */
        stats: StatsTarget | null;
        archive?: ArchiveTarget;
      },
    ) => {
      stop();
      const { local, level } = options;
      // 바꾸는 대국이 세던 컴퓨터 수는 버린다(무르기·새 판).
      if (get().local !== local) get().local?.dispose();
      const recorder = options.stats
        ? new StatsRecorder(kit.stats, options.stats)
        : null;
      const practice = options.stats === null;
      const archiver = options.archive
        ? new ArchiveRecorder(kit.stats, options.archive)
        : null;
      const persist = () => {
        if (local && !practice) slot.save({ ...local.save(), level } as Saved);
      };
      const first = host.drain();
      const current = host.current();
      const opening = config.opening?.(first, current) ?? { events: [], ms: 0 };
      shownUntil = opening.ms > 0 ? Date.now() + opening.ms : 0;
      set({
        host,
        local,
        level,
        seatNames: options.seatNames,
        reconnecting: false,
        hostLeft: false,
        invalid: null,
        offlineSeats: [],
        view: current,
        events: opening.events,
        seq: get().seq + 1,
        viewAt: Date.now(),
        queue: [],
        notice: null,
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
    };

    const newLocal = (
      rules: Rules,
      seed: number,
      humanSeat: number,
      level: number,
      log?: Saved["log"],
    ): Local =>
      new LocalMatch(
        {
          kit,
          rules,
          seed,
          humanSeat,
          bot: config.botFor(level),
          ...workerBotOption({ game, level }),
          pace,
        },
        log,
      );

    /** 혼자 하기: 이 기기의 대국으로 붙인다 */
    const attachLocal = (local: Local, level: number, seed: number) =>
      attach(local, {
        local,
        level,
        seatNames: null,
        stats: { game, mode: "solo", key: `solo:${seed}` },
        archive: {
          game,
          mode: "solo",
          key: `solo:${seed}`,
          seat: local.seat,
          seatNames: null,
          source: () => {
            const saved = local.save();
            return { rules: saved.rules, seed: saved.seed, log: saved.log };
          },
        },
      });

    /** 이번 판 안의 기록(판을 여는 행동이 없으면 전부) */
    const roundLog = (local: Local) => {
      const log = local.actionLog();
      const opens = config.opensRound;
      if (!opens) return log;
      return log.slice(log.findLastIndex((e) => opens(e.action)) + 1);
    };

    return {
      host: null,
      local: null,
      seatNames: null,
      reconnecting: false,
      hostLeft: false,
      invalid: null,
      offlineSeats: [],
      view: null,
      events: [],
      seq: 0,
      viewAt: 0,
      queue: [],
      level: config.initialLevel,
      notice: null,
      practice: false,

      newGame(options) {
        const { rules, level } = options;
        track("game-start", { game, mode: "solo", level });
        const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
        const seat = config.seatFor?.(rules, seed, options.pick as Pick) ?? 0;
        attachLocal(newLocal(rules, seed, seat, level), level, seed);
      },

      resume(saved) {
        attachLocal(
          newLocal(
            saved.rules,
            saved.seed,
            saved.humanSeat,
            saved.level,
            saved.log,
          ),
          saved.level,
          saved.seed,
        );
      },

      startPractice(initialState, options = {}) {
        const level = options.level ?? 0;
        const rules =
          options.rules ??
          (initialState && config.rulesOf
            ? config.rulesOf(initialState)
            : null);
        if (rules === null)
          throw new Error("연습 대국에는 규칙이나 장면이 있어야 해요.");
        const local: Local = new LocalMatch({
          kit,
          rules,
          seed: config.practiceSeed ?? Math.floor(Math.random() * 2 ** 31),
          humanSeat: 0,
          bot: config.botFor(level),
          pace,
          ...(initialState ? { initialState } : {}),
        });
        attach(local, { local, level, seatNames: null, stats: null });
      },

      attachOnline(host, seatNames, stats, archive) {
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

      submit(action) {
        const host = get().host;
        if (!host) return { ok: false, error: "게임이 없어요." };
        // 남의 걸음을 다 보여 주기 전에는 두지 않는다.
        // 그만두기(설정 「그만하기」)는 보던 화면과 상관없어 기다리지 않는다.
        if (get().queue.length > 0 && action.type !== "retire")
          return { ok: false, error: "잠깐만요." };
        const result = host.submit(action);
        if (!result.ok) {
          set({ notice: result.error });
          playUiCue("invalid");
        }
        return result;
      },

      canUndo() {
        const { local, view, practice } = get();
        // 연습 장면은 기록으로 다시 만들 수 없어 무르지 않는다. 판 끝은 화면에 보이기 전에 기록되므로
        // 보이는 화면이 아니라 대국의 최신 상태로 본다(컴퓨터 수를 보이는 중에도 무를 수 있다)
        if (!local || !view || practice || !undoable(local.current()))
          return false;
        return roundLog(local).some(
          (entry) => entry.seat === local.seat && config.isTurn(entry.action),
        );
      },

      undo() {
        const { local, level } = get();
        if (!local || !get().canUndo()) return false;
        const saved = local.save();
        const log = [...saved.log];
        // 내 마지막 차례까지 잘라 낸다(그 뒤 컴퓨터 수도 함께).
        while (log.length > 0) {
          const last = log.pop();
          if (last?.seat === local.seat && config.isTurn(last.action)) break;
        }
        attachLocal(
          newLocal(saved.rules, saved.seed, saved.humanSeat, level, log),
          level,
          saved.seed,
        );
        return true;
      },

      leave() {
        stop();
        get().local?.dispose();
        set({
          host: null,
          local: null,
          seatNames: null,
          view: null,
          queue: [],
          events: [],
          reconnecting: false,
          hostLeft: false,
          invalid: null,
          offlineSeats: [],
          practice: false,
        });
      },

      clearNotice() {
        set({ notice: null });
      },
    };
  });
}
