/*
 * 원카드 튜토리얼 장면과 컴퓨터 대본.
 * 장면은 엔진 `createOnecardScenario`의 재료에 컴퓨터 자리의 정해진 행동(대본)을 더한 것이다.
 * 대본은 화면(View)만 보고 고르므로 방장 `LocalMatch`의 컴퓨터(`KitBot`)로 그대로 꽂을 수 있다.
 */
import {
  type Action,
  createOnecardScenario,
  type GameEvent,
  legalActions,
  type OnecardScenarioOptions,
  type OnecardState,
  type OnecardView,
  STANDARD_ONECARD_RULES,
  seededReshuffle,
  step,
  viewOf,
} from "@game/onecard-engine";

/** 튜토리얼 규칙: 기본 규칙에 잡기 창 T만 넉넉히 5초(실전 3초). 본인 시간 P는 실전과 같은 1초 */
export const ONECARD_TUTORIAL_RULES = {
  ...STANDARD_ONECARD_RULES,
  catchWindowMs: 5000 as const,
};

/**
 * 컴퓨터 대본 한 줄. 차례 행동(내기·먹기) 또는 미리 외침(`shout`, 판 번호는 그때 화면에서 채운다).
 * 대본이 다 떨어지거나 지금 할 수 없는 줄이면 낼 수 있는 첫 카드(없으면 먹기)를 둔다
 */
export type ScriptMove =
  | Extract<Action, { type: "play" } | { type: "draw" }>
  | { type: "shout" };

/** 튜토리얼 장면. 0번 자리가 나다 */
export interface OnecardScene extends Omit<OnecardScenarioOptions, "rules"> {
  /** 없으면 튜토리얼 규칙 */
  rules?: OnecardScenarioOptions["rules"];
  /** 컴퓨터 자리별 대본(앞부터 쓴다) */
  script?: Partial<Record<number, ScriptMove[]>>;
}

/** 장면에서 판 상태를 만든다 */
export function sceneState(scene: OnecardScene): OnecardState {
  const { script: _script, rules, ...setup } = scene;
  return createOnecardScenario({
    ...setup,
    rules: { ...ONECARD_TUTORIAL_RULES, ...rules },
  });
}

function sameMove(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "play" && b.type === "play")
    return a.card === b.card && a.suit === b.suit;
  return true;
}

/**
 * 대본대로 두는 컴퓨터. `LocalMatch`의 `bot`(`KitBot`: `name`, `decide(view, rng)`) 모양이다.
 * 자리마다 몇 줄 썼는지 기억하므로 미션을 열 때마다 새로 만든다
 */
export function createScriptBot(scene: OnecardScene) {
  const used = new Map<number, number>();
  return {
    name: "대본",
    decide(view: OnecardView, _rng?: unknown): Action {
      const seat = view.mySeat;
      const lines = scene.script?.[seat] ?? [];
      const index = used.get(seat) ?? 0;
      const line = lines[index];
      if (line) {
        used.set(seat, index + 1);
        if (line.type === "shout") return { type: "shout", seen: view.turnNo };
        if (view.moves.some((m) => sameMove(m, line))) return line;
      }
      return view.moves[0] ?? { type: "draw" };
    },
  };
}

/** 대본 진행 결과 */
export interface SceneRun {
  state: OnecardState;
  /** 처음부터 생긴 모든 사건(미션 `check`에 그대로 넘긴다) */
  events: GameEvent[];
  /** 받아들이지 않은 내 행동(있으면 그 자리에서 멈춘다) */
  rejected: { action: Action; error: string } | null;
}

const ME = 0;
/** 대본이 끝없이 도는 것을 막는 안전장치(장면은 몇 수 안에 끝난다) */
const MAX_AUTO = 200;

/**
 * 장면을 엔진으로 진행한다(시험·설명용). 컴퓨터는 대본대로, 다시 섞기는 씨앗으로 하고,
 * 내 행동(`actions`)은 0번 자리로 넣는다. 시간 끝(`timeout`)도 내 행동 목록에 적어 "그만큼 시간이 지났다"를 나타낸다
 */
export function runScene(
  scene: OnecardScene,
  actions: readonly Action[],
  seed = 1,
): SceneRun {
  let state = sceneState(scene);
  const bot = createScriptBot(scene);
  const events: GameEvent[] = [];
  const auto = () => {
    for (let i = 0; i < MAX_AUTO && state.phase !== "over"; i++) {
      if (state.phase === "reshuffle") {
        const order = seededReshuffle(state, seed + i);
        if (!order) return;
        state = apply(state, ME, order);
        continue;
      }
      if (state.turn === ME) return;
      state = apply(state, state.turn, bot.decide(viewOf(state, state.turn)));
    }
  };
  const apply = (s: OnecardState, seat: number, action: Action) => {
    const result = step(s, seat, action);
    if (!result.ok)
      throw new Error(`대본이 틀렸다(${seat}번): ${result.error}`);
    events.push(...result.events);
    return result.state;
  };
  auto();
  for (const action of actions) {
    const result = step(state, ME, action);
    if (!result.ok)
      return { state, events, rejected: { action, error: result.error } };
    events.push(...result.events);
    state = result.state;
    auto();
  }
  return { state, events, rejected: null };
}

/** 장면 시작에서 내가 할 수 있는 차례 행동 */
export function sceneMoves(scene: OnecardScene): Action[] {
  return legalActions(runScene(scene, []).state, ME);
}
