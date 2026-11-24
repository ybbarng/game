import { baseballBotFor } from "@game/baseball-ai";
import {
  type Action,
  type BaseballRules,
  type BaseballState,
  type BaseballView,
  commitmentOf,
  type GameEvent,
} from "@game/baseball-engine";
import type { SubmitResult } from "@/game/host";
import type { LocalMatch } from "@/game/local-match";
import {
  createMatchStore,
  type MatchSaved,
  type MatchStoreHost,
  savedMatchSlot,
} from "@/game/match-store";
import type { Cue } from "@/game/sound";

import { baseballKit } from "./kit";
import {
  autoAction,
  loadSecretBook,
  newSalt,
  type SecretBook,
  saveSecretBook,
} from "./secret";

export type BaseballLocalMatch = LocalMatch<
  BaseballRules,
  BaseballState,
  BaseballView,
  Action,
  GameEvent,
  undefined
>;
/** 화면이 아는 대국 창구: 혼자 하기·방장은 LocalMatch, 참가자는 RemoteMatch */
export type BaseballHost = MatchStoreHost<BaseballView, Action, GameEvent>;

/** 이어하기 저장본에 함께 싣는 것 */
interface BaseballSavedExtra {
  /** 판마다 내 비밀(이 기기에만 있다) */
  secrets: SecretBook;
}
export type BaseballSaved = MatchSaved<BaseballRules, Action> &
  BaseballSavedExtra;

/** 공장에 더한 상태와 행동 */
interface BaseballExtra {
  /** 판마다 내 비밀(이 기기에만 있다) */
  secrets: SecretBook;
  /** 이번 판 내 비밀 수를 정한다: 소금을 만들어 이 기기에 남기고 약속만 낸다 */
  chooseSecret(secret: string): SubmitResult;
}

const slot = savedMatchSlot<BaseballSaved>("baseball-save");
export const loadBaseball = slot.load;
export const clearBaseball = slot.clear;

/** 사건에 맞춰 낼 소리: 답(스트라이크·볼·아웃), 판 끝(이김·짐·비김) */
function cuesFor(events: readonly GameEvent[], me: number): Cue[] {
  const out: Cue[] = [];
  for (const e of events) {
    if (e.type === "answered") {
      // 다 맞힌 답은 방망이 소리(뒤이어 판 끝 소리가 난다), 아니면 미트 소리
      out.push(
        e.strikes === e.guess.length
          ? "homerun"
          : e.strikes > 0
            ? "strike"
            : e.balls > 0
              ? "ball"
              : "pass",
      );
    }
    if (e.type === "roundEnded") {
      const r = e.result;
      const draw = r.kind === "draw" || (r.kind === "cheat" && r.seat === null);
      out.push(
        draw ? "roundEnd" : "seat" in r && r.seat === me ? "win" : "lose",
      );
    }
  }
  return out;
}

/** 마지막으로 자동으로 낸 행동(같은 화면을 다시 받아도 두 번 내지 않는다) */
let lastAuto: string | null = null;
/** 비밀을 남기는 곳: 혼자 하기는 저장 파일(`solo:…`), 온라인은 탭 저장소(`online:…`), 미션은 메모리(null) */
let secretKey: string | null = null;

export const useBaseball = createMatchStore<
  BaseballRules,
  BaseballState,
  BaseballView,
  Action,
  GameEvent,
  undefined,
  undefined,
  BaseballExtra,
  BaseballSavedExtra
>({
  game: "baseball",
  kit: baseballKit,
  botFor: baseballBotFor,
  slot,
  initialLevel: 1,
  rulesOf: (state) => state.rules,
  /** 무르기로 되돌리는 내 행동: 묻기(그 뒤 컴퓨터 답·물음과 내 답도 함께 되돌린다) */
  isTurn: (action) => action.type === "guess",
  // 이번 판 안에서 내가 물을 차례일 때만 무른다
  undoable: (latest) =>
    latest.phase === "play" && latest.decision?.kind === "guess",
  opensRound: (action) => action.type === "continue",
  cues: cuesFor,
  byOther: (events, me) =>
    events.some(
      (e) =>
        (e.type === "guessed" && e.seat !== me) ||
        (e.type === "answered" && e.seat !== me),
    ),
  // 컴퓨터가 묻거나 답한 것은 바로 보이지 않고 잠깐 기다렸다 보인다(생각하는 듯이). 온라인 상대 수는 바로
  otherPause: { ms: 450, when: "before", soloOnly: true },
  extend: ({ get, set }) => {
    const persistSecrets = (secrets: SecretBook) => {
      if (secretKey?.startsWith("online:")) saveSecretBook(secretKey, secrets);
    };
    return {
      extra: {
        secrets: {},
        chooseSecret(secret) {
          const view = get().view;
          if (view?.decision?.kind !== "commit")
            return { ok: false, error: "비밀 수를 정할 때가 아니에요." };
          const material = { secret, salt: newSalt() };
          const secrets = { ...get().secrets, [view.roundNumber]: material };
          // 약속을 내기 전에 먼저 남긴다(새로고침해도 답할 수 있게).
          set({ secrets });
          persistSecrets(secrets);
          return get().submit({
            type: "commit",
            hash: commitmentOf(material.secret, material.salt),
          });
        },
      },
      attach({ reason, key, saved }) {
        secretKey = key;
        const secrets =
          reason === "online" && key
            ? loadSecretBook(key)
            : reason === "resume"
              ? (saved?.secrets ?? {})
              : reason === "undo"
                ? get().secrets
                : {};
        return { secrets };
      },
      /** 답하기·공개는 내 기기가 바로 낸다(사람이 셀 필요가 없다) */
      settle() {
        const { host, view, queue, secrets } = get();
        if (!host || !view || queue.length > 0) return;
        const action = autoAction(view, secrets);
        if (!action) return;
        const key = `${view.roundNumber}:${view.guesses.length}:${action.type}`;
        if (lastAuto === key) return;
        lastAuto = key;
        const result = host.submit(action);
        if (!result.ok) set({ notice: result.error });
      },
      saved: () => ({ secrets: get().secrets }),
      stop() {
        lastAuto = null;
        secretKey = null;
      },
    };
  },
});
