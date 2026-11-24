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
import type { SubmitResult } from "@/game/host";
import type { LocalMatch } from "@/game/local-match";
import {
  createMatchStore,
  isSavedMatch,
  type MatchSaved,
  type MatchStoreHost,
  savedMatchSlot,
} from "@/game/match-store";
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
import { galaxyKit } from "./kit";
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
export type GalaxyHost = MatchStoreHost<GalaxyView, Action, GameEvent>;

/** 봉투 입찰에 낸 값(약속을 낸 뒤 공개할 때 쓴다. 새로고침해도 공개할 수 있게 저장에도 남긴다) */
export interface PendingBid {
  index: number;
  value: number;
}

/** 이어하기 저장본에 함께 싣는 것 */
interface GalaxySavedExtra {
  bid?: PendingBid;
}
export type GalaxySaved = MatchSaved<GalaxyRules, Action> & GalaxySavedExtra;

/** 공장에 더한 상태와 행동 */
interface GalaxyExtra {
  /** 온라인: 이 기기에만 있는 주사위 사슬 씨앗과 봉투(`chain.ts`) */
  secrets: GalaxySecrets;
  /** 지금까지 보인 사건 모두(사건 줄·판 끝 「만난 별」) */
  history: GameEvent[];
  /** 지금 걸음의 연출(다 보일 때까지 다음 걸음을 미룬다) */
  timeline: Timeline;
  /** 연출이 시작한 때(performance.now). 걸음마다 바뀐다 */
  fxStart: number;
  /** 연출 중이다(결정 창을 띄우지 않고, 화면 시험이 `data-moving`으로 기다린다) */
  playing: boolean;
  bid: PendingBid | null;
  /** 판 끝에 이 기기에서 처음 만난 별(별 id) */
  firstMet: string[];
  /** 봉투 입찰 값 내기(0은 내지 않기). 값은 약속으로만 나가고 모두 낸 뒤 공개한다 */
  placeBid(value: number): SubmitResult;
}

// 판 번호가 다른 이어하기(옛 규칙 판)는 버린다
const slot = savedMatchSlot<GalaxySaved>(
  "galaxy-save",
  (value) =>
    isSavedMatch(value) &&
    (value as GalaxySaved).rules?.edition === GALAXY_EDITION,
);
export const loadGalaxy = slot.load;
export const clearGalaxy = slot.clear;

/** 움직임 줄이기(연출 없이 결과만, docs/41 6절) */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * 정해진 장면에서 시작하는 연습 대국의 선택지(튜토리얼 미션과 화면 시험). `dice`: 장면의 굴림 눈을 차례로 정해 둔다.
 * 다 쓰면 보통처럼 사슬로 굴린다
 */
export function galaxyPractice(
  initialState: GalaxyState,
  level: number,
  dice?: readonly (readonly [number, number])[],
) {
  return {
    level,
    ...(dice && dice.length > 0
      ? { step: scriptedDiceStep(initialState, dice) }
      : {}),
  };
}

let fxTimer: ReturnType<typeof setTimeout> | null = null;
/** 마지막으로 자동으로 낸 행동(같은 화면을 다시 받아도 두 번 내지 않는다) */
let lastAuto: string | null = null;
/** 온라인 방의 비밀을 남기는 열쇠(`online:방`). 혼자 하기·미션은 null(자리 재료로 만든 씨앗·소금) */
let secretKey: string | null = null;

/** 이 걸음에 컴퓨터가 눈에 보이는 결정을 했나(굴리기·사기·넘기기·짓기·사들이기) */
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
      (e.type === "takenOver" && e.seat !== me),
  );
}

export const useGalaxy = createMatchStore<
  GalaxyRules,
  GalaxyState,
  GalaxyView,
  Action,
  GameEvent,
  undefined,
  undefined,
  GalaxyExtra,
  GalaxySavedExtra
>({
  game: "galaxy",
  kit: galaxyKit,
  botFor: galaxyBotFor,
  slot,
  initialLevel: 0,
  rulesOf: (state) => state.rules,
  // 무르기는 없다
  isTurn: () => false,
  cues(events, _me, store) {
    if (store.view) galaxyCuesFor(events, store.view, store.timeline);
    return [];
  },
  byOther: botActed,
  // 컴퓨터 결정은 조금 기다렸다가 보인다(온라인 상대 수는 바로)
  otherPause: { ms: GALAXY_FX.botThink, when: "before", soloOnly: true },
  // 기권·그만두기는 연출 중에도 받는다
  anytime: (action) => action.type === "resign" || action.type === "retire",
  extend: ({ get, set, advance }) => {
    /**
     * 약속·공개·입찰 공개는 내 기기가 바로 낸다(사람이 할 일이 없다). 온라인은 이 기기에서 만든 씨앗·소금,
     * 혼자 하기는 자리 재료로 만든 씨앗·소금. 온라인에서 내 비밀을 모르면(다른 기기에서 약속했다 등) 내지 않는다
     */
    const autoAct = (): void => {
      const { host, view, queue, playing } = get();
      if (!host || !view || queue.length > 0 || playing) return;
      const kind = view.decision?.kind;
      if (
        kind !== "commit" &&
        kind !== "reveal" &&
        kind !== "bidReveal" &&
        kind !== "requestReveal"
      )
        return;
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
          action = commitAction(seed, view);
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

    return {
      extra: {
        secrets: EMPTY_SECRETS,
        history: [],
        timeline: EMPTY_TIMELINE,
        fxStart: 0,
        playing: false,
        bid: null,
        firstMet: [],

        placeBid(value) {
          const view = get().view;
          const index = view?.auction?.index;
          if (!view || index === undefined || view.decision?.kind !== "bid")
            return { ok: false, error: "입찰할 때가 아니에요." };
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
      },
      attach({ reason, key, saved, first }) {
        secretKey = reason === "online" ? key : null;
        return {
          secrets:
            reason === "online" && key ? loadSecrets(key) : EMPTY_SECRETS,
          bid: reason === "resume" ? (saved?.bid ?? null) : null,
          history: first.flatMap((s) => s.events),
          timeline: EMPTY_TIMELINE,
          playing: false,
          firstMet: [],
        };
      },
      show(next, me) {
        const timeline = buildTimeline(next.events, next.view.board, me, {
          // 연출 시간은 진행 속도 설정과 상관없이 그대로(읽을 시간 1.2초·움직임 0.6초를 지킨다, docs/41 6절).
          // 진행 속도는 컴퓨터가 생각하는 기다림만 줄인다
          reduced: prefersReducedMotion(),
        });
        const over = next.events.some((e) => e.type === "gameEnded");
        const history = [...get().history, ...next.events];
        return {
          history,
          timeline,
          fxStart: performance.now(),
          playing: timeline.total > 0,
          ...(over ? { firstMet: rememberMet(next.view, history) } : {}),
        };
      },
      /** 연출이 있는 걸음은 연출이 끝난 뒤 다음으로 */
      shown() {
        const done = () => {
          fxTimer = null;
          set({ playing: false, timeline: EMPTY_TIMELINE });
          autoAct();
          advance();
        };
        const total = get().timeline.total;
        if (total > 0) fxTimer = setTimeout(done, total);
        else done();
      },
      settle: autoAct,
      holds: () => get().playing,
      refuses: () => get().playing,
      saved() {
        const bid = get().bid;
        return bid ? { bid } : {};
      },
      stop() {
        if (fxTimer !== null) clearTimeout(fxTimer);
        fxTimer = null;
        lastAuto = null;
        secretKey = null;
      },
    };
  },
});
