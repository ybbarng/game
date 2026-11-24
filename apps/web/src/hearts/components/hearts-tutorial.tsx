import { heartsBeginnerBot } from "@game/hearts-ai";
import {
  type Action,
  createHeartsScenario,
  type GameEvent,
  type PlayerView,
} from "@game/hearts-engine";

import type { TutorialKit } from "@/components/tutorial/kit";
import { DEFAULT_BOT_NAMES } from "@/game/bot-names";
import { LocalMatch } from "@/game/local-match";
import { browserPace } from "@/game/pace";
import { useFairBar } from "@/net/fair-bar";
import { useHeartsTutorialProgress } from "@/tutorial/progress";

import { heartsKit } from "../kit";
import { useHearts } from "../store";
import {
  HEARTS_LESSONS,
  HEARTS_TUTORIAL_RULES,
  type HeartsScenario,
} from "../tutorial";
import { HeartsTable } from "./HeartsTable";

const NAMES = ["나", ...DEFAULT_BOT_NAMES.slice(0, 3)];

/** 하트 배우기. 미션 상대는 입문 컴퓨터다 */
export const heartsTutorial: TutorialKit<
  PlayerView,
  GameEvent,
  HeartsScenario,
  Action
> = {
  title: "하트 배우기",
  background: "bg-[radial-gradient(ellipse_at_center,#7f1d1d_0%,#3b0a0a_80%)]",
  lessons: HEARTS_LESSONS,
  progress: useHeartsTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const match = new LocalMatch({
      kit: heartsKit,
      rules: HEARTS_TUTORIAL_RULES,
      seed,
      bot: heartsBeginnerBot,
      pace: browserPace,
      ...(scenario
        ? {
            initialState: createHeartsScenario({
              rules: HEARTS_TUTORIAL_RULES,
              ...scenario,
            }),
          }
        : {}),
    });
    useHearts.getState().attachOnline(match, NAMES);
    useFairBar.getState().reset();
  },
  subscribe: (listener) =>
    useHearts.subscribe((state, prev) => {
      if (state.seq !== prev.seq && state.view)
        listener(state.view, state.events);
    }),
  endMission: () => useHearts.getState().leave(),
  Table: ({ onExit, ...props }) => (
    <HeartsTable
      {...props}
      onExit={() => {
        useHearts.getState().leave();
        onExit();
      }}
    />
  ),
};
