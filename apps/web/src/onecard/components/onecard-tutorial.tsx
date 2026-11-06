"use client";

import type { Card } from "@game/mighty-engine";
import {
  type Action,
  type GameEvent,
  type OnecardCard,
  type OnecardView,
  suitOf,
} from "@game/onecard-engine";

import type { TutorialKit } from "@/components/tutorial/kit";
import { useOnecardTutorialProgress } from "@/tutorial/progress";

import { onecardBotFor, toKitBot } from "../bots";
import { isRedSuit, SUIT_NAMES, SUIT_SYMBOLS } from "../cards";
import { useOnecard } from "../store";
import {
  ONECARD_LESSONS,
  ONECARD_TUTORIAL_RULES,
  type OnecardScene,
} from "../tutorial/lessons";
import { createScriptBot, sceneState } from "../tutorial/script";
import { OnecardCardView } from "./OnecardCard";
import { ONECARD_BG, OnecardGame } from "./OnecardGame";

/** 설명·퀴즈 그림: 상대 뒷면과 장 수, 버린 더미 맨 위, 쌓인 공격, 내 손패. 누를 수 없다 */
function OnecardSceneView({ scenario }: { scenario: OnecardScene }) {
  const state = sceneState(scenario);
  const top = state.pile.at(-1);
  const mine = state.hands[0] ?? [];
  const others = state.hands.slice(1);
  return (
    <div
      data-scene
      className="mx-auto flex w-full max-w-xs flex-col items-center gap-2 rounded-2xl bg-black/25 p-3"
    >
      <div className="flex flex-wrap items-center justify-center gap-3 text-white/70 text-xs">
        {others.map((hand, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 순서가 곧 정체다
            key={i}
            className="flex items-center gap-1"
          >
            <OnecardCardView card={null} width={16} label="" />
            {others.length > 1 ? `컴퓨터${i + 1}` : "컴퓨터"} {hand.length}장
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-white/70 text-xs">
        버린 더미
        {top && <OnecardCardView card={top} width={40} />}
        {state.attack > 0 && (
          <span className="rounded-full bg-rose-600 px-2 py-0.5 font-black text-white">
            공격 +{state.attack}
          </span>
        )}
        {state.suit && top && state.suit !== suitOf(top) && (
          <span
            className={
              isRedSuit(state.suit) ? "text-red-300" : "text-slate-100"
            }
          >
            {SUIT_SYMBOLS[state.suit]} {SUIT_NAMES[state.suit]}
          </span>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {mine.map((card) => (
          <OnecardCardView key={card} card={card} width={36} />
        ))}
      </div>
      <span className="text-white/60 text-xs">내 손패 {mine.length}장</span>
    </div>
  );
}

/** 설명·퀴즈 카드 줄을 원카드 카드 모양(흑백 조커 포함)으로 */
function OnecardCardRow({ cards }: { cards: readonly Card[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {cards.map((card) => (
        <OnecardCardView
          key={card}
          card={card as OnecardCard}
          width={56}
          className="drop-shadow-md"
        />
      ))}
    </div>
  );
}

/**
 * 원카드 배우기. 장면이 있는 미션은 그 장면에서 대본대로 두는 컴퓨터와(미션마다 새로),
 * 장면이 없으면(실전 한 판) 컴퓨터 한 명과 처음부터 한다. 외침 창 시계는 LocalMatch가 `GameKit.timers`로 잰다
 */
export const onecardTutorial: TutorialKit<
  OnecardView,
  GameEvent,
  OnecardScene,
  Action
> = {
  title: "원카드 배우기",
  background: ONECARD_BG,
  lessons: ONECARD_LESSONS,
  progress: useOnecardTutorialProgress,
  glossary: false,
  startMission(scene) {
    const store = useOnecard.getState();
    if (scene) {
      const initialState = sceneState(scene);
      store.startPractice({
        rules: initialState.rules,
        initialState,
        bot: createScriptBot(scene),
      });
      return;
    }
    // 실전: 둘이서 7장, 가장 짧게 끝난다. 컴퓨터는 가장 쉬운 단계(입문)
    store.startPractice({
      rules: { ...ONECARD_TUTORIAL_RULES, players: 2, handSize: 7 },
      bot: toKitBot(onecardBotFor(0)),
    });
  },
  subscribe: (listener) =>
    useOnecard.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: OnecardSceneView,
  CardRow: OnecardCardRow,
  endMission: () => useOnecard.getState().leave(),
  Table: ({ onExit, mission }) => (
    <OnecardGame
      onExit={() => {
        useOnecard.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
