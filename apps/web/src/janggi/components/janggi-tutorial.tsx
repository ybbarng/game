"use client";

import {
  type Action,
  createJanggiScenario,
  createMatch,
  type GameEvent,
  type JanggiView,
} from "@game/janggi-engine";

import type { TutorialKit } from "@/components/tutorial/kit";
import { useJanggiTutorialProgress } from "@/tutorial/progress";

import { useJanggi } from "../store";
import {
  JANGGI_LESSONS,
  JANGGI_TUTORIAL_RULES,
  type JanggiScene,
} from "../tutorial";
import { JanggiGame } from "./JanggiGame";
import {
  HanDrill,
  MatchupTable,
  OrderScene,
  SetupDrill,
} from "./janggi-matchup-scenes";
import { FollowScene, PlayScene, ReplayScene } from "./janggi-scenes";

const sceneState = (scene: JanggiScene) =>
  createJanggiScenario({ rules: JANGGI_TUTORIAL_RULES, ...scene });

/** 장면마다 새 번호. 단계가 바뀌면 넘겨 보던 수·고른 차림·문제를 처음으로 돌린다 */
const sceneKeys = new WeakMap<JanggiScene, number>();
let nextSceneKey = 0;
function keyOf(scene: JanggiScene): number {
  let key = sceneKeys.get(scene);
  if (key === undefined) {
    key = nextSceneKey++;
    sceneKeys.set(scene, key);
  }
  return key;
}

/** 설명·퀴즈에 보이는 판 그림 */
function JanggiSceneView({ scenario }: { scenario: JanggiScene }) {
  const key = keyOf(scenario);
  if (scenario.matchups) return <MatchupTable key={key} />;
  if (scenario.drill) return <SetupDrill key={key} count={scenario.drill} />;
  if (scenario.hanDrill)
    return <HanDrill key={key} count={scenario.hanDrill} />;
  if (scenario.order) return <OrderScene key={key} />;
  if (scenario.follow) return <FollowScene key={key} scenario={scenario} />;
  if (scenario.replay) return <PlayScene key={key} scenario={scenario} />;
  return <ReplayScene key={key} scenario={scenario} />;
}

/** 장기 배우기. 미션 상대는 입문 컴퓨터, 장면이 없으면 내가 초로 상차림부터 한 판 */
export const janggiTutorial: TutorialKit<
  JanggiView,
  GameEvent,
  JanggiScene,
  Action
> = {
  title: "장기 배우기",
  background: "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]",
  lessons: JANGGI_LESSONS,
  progress: useJanggiTutorialProgress,
  glossary: false,
  startMission(scenario) {
    const state = scenario
      ? sceneState(scenario)
      : {
          ...createMatch(JANGGI_TUTORIAL_RULES, Date.now()).state,
          choSeat: 0,
        };
    useJanggi.getState().startPractice(state);
  },
  subscribe: (listener) =>
    useJanggi.subscribe((state, prev) => {
      if (state.view !== prev.view && state.view)
        listener(state.view, state.events);
    }),
  Scene: JanggiSceneView,
  endMission: () => useJanggi.getState().leave(),
  Table: ({ onExit, mission }) => (
    <JanggiGame
      onExit={() => {
        useJanggi.getState().leave();
        onExit();
      }}
      mission={mission}
    />
  ),
};
