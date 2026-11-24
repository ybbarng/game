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
import type { SubmitResult } from "@/game/host";
import type { LocalMatch } from "@/game/local-match";
import {
  createMatchStore,
  type MatchSaved,
  type MatchStoreHost,
  savedMatchSlot,
} from "@/game/match-store";
import type { Cue } from "@/game/sound";

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
export type YutHost = MatchStoreHost<YutView, Action, GameEvent>;

export type YutSaved = MatchSaved<YutRules, Action>;

/** 공장에 더한 상태와 행동 */
interface YutExtra {
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
  /** 이 몸짓을 봉인해 던진다(몸짓은 모든 고리가 공개된 뒤 자동으로 연다, docs/37 13절) */
  throwGesture(gesture: Gesture): SubmitResult;
  /** 화면에 잠깐 보일 알림(너무 낮게 던짐 등) */
  setNotice(notice: string): void;
}

const slot = savedMatchSlot<YutSaved>("yut-save");
export const loadYut = slot.load;
export const clearYut = slot.clear;

/**
 * 사건에 맞춰 낼 소리: 던지기, 말 놓기·잡기·나기, 판 끝.
 * 멍석이 그 던지기를 맡았으면(`tossed`) 떨어지는 소리는 멍석이 낸다(3D는 가락이 닿을 때마다, 2D는 떨어질 때 한 번)
 */
function cuesFor(
  events: readonly GameEvent[],
  view: YutView,
  tossed: boolean,
): Cue[] {
  const mySide = sideOf(view.rules, view.mySeat);
  const out: Cue[] = [];
  for (const e of events) {
    if (e.type === "thrown") out.push("yutThrow");
    if (e.type === "result" && !tossed)
      out.push(e.bonus ? "yutBonus" : "yutLand");
    if (e.type === "nak" && !tossed) out.push("yutLand");
    if (e.type === "moved")
      out.push(
        e.captured > 0 ? "yutCapture" : e.finished ? "yutHome" : "yutPiece",
      );
    if (e.type === "gameEnded") {
      const side = e.result?.side ?? null;
      out.push(side === null ? "roundEnd" : side === mySide ? "win" : "lose");
    }
  }
  return out;
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

/** 마지막으로 자동으로 낸 행동(같은 화면을 다시 받아도 두 번 내지 않는다) */
let lastAuto: string | null = null;
/** 씨앗을 남기는 곳: 온라인은 탭 저장소, 혼자 하기·미션은 자리 재료로 만든 씨앗을 쓴다 */
let seedKey: string | null = null;
/** 봉인해 던진 내 몸짓(열 때까지). 혼자 하기·온라인은 탭 저장소에도 남긴다 */
let kept: PendingThrow[] = [];

export const useYut = createMatchStore<
  YutRules,
  YutState,
  YutView,
  Action,
  GameEvent,
  undefined,
  undefined,
  YutExtra
>({
  game: "yut",
  kit: yutKit,
  botFor: yutBotFor,
  slot,
  initialLevel: 1,
  rulesOf: (state) => state.rules,
  /**
   * 무르기로 되돌리는 내 행동: 말 옮기기(그 뒤 컴퓨터 던지기·움직임과 내 공개도 함께).
   * 던지기 결과는 사슬로 정해져 있어 다시 던져도 같다. 무르기는 말 고르기만 바꾼다
   */
  isTurn: (action) => action.type === "move",
  undoable: (latest) => latest.phase !== "gameOver",
  cues: (events, _me, store) =>
    store.view ? cuesFor(events, store.view, store.tossing) : [],
  byOther: (events, me) =>
    events.some(
      (e) =>
        (e.type === "thrown" && e.seat !== me) ||
        (e.type === "moved" && e.seat !== me),
    ),
  // 컴퓨터가 던지거나 움직인 것은 바로 보이지 않고 잠깐 기다렸다 보인다(생각하는 듯이). 온라인 상대 수는 바로
  otherPause: { ms: 550, when: "before", soloOnly: true },
  extend: ({ get, set, advance }) => ({
    extra: {
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
    },
    attach({ reason, key }) {
      seedKey = key;
      kept = key ? loadPendingThrows(key) : [];
      return {
        seeds: reason === "online" && key ? loadSeedBook(key) : {},
        tossing: false,
        landed: false,
      };
    },
    show(next) {
      const landed = next.events.some(
        (e) => e.type === "result" || e.type === "nak",
      );
      const tossing =
        landed && (tossDirector?.(next.view, next.events) ?? false);
      return { tossing, landed: false };
    },
    shown() {
      if (get().tossing)
        tossTimer = setTimeout(() => get().finishToss(), TOSS_SAFETY_MS);
    },
    /**
     * 약속·공개는 내 기기가 바로 낸다(사람이 할 일이 없다). 온라인은 이 기기에서 만든 씨앗,
     * 혼자 하기·미션은 자리 재료로 만든 씨앗을 쓴다
     */
    settle() {
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
        action = commitAction(
          seed ?? derivedSeed(view.botKey, view.generation),
        );
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
    },
    holds: () => get().tossing,
    // 던진 윷이 구르는 동안에는 말을 옮기지 않는다
    refuses: (action) => get().tossing && action.type === "move",
    stop() {
      if (tossTimer !== null) clearTimeout(tossTimer);
      tossTimer = null;
      lastAuto = null;
      seedKey = null;
      kept = [];
    },
  }),
});
