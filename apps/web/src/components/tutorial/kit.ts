import type { Card } from "@game/mighty-engine";
import type { ComponentType } from "react";

import type { TutorialProgressStore } from "@/tutorial/progress";
import type { Lesson } from "@/tutorial/types";

import type { MissionProps } from "./MissionOverlay";

/** 튜토리얼 화면(단원 목록·단원 진행)을 한 게임에 잇는 것. 게임마다 하나씩 둔다 */
export interface TutorialKit<View, Event, Scenario, Action> {
  /** 단원 목록 제목 */
  title: string;
  /** 화면 배경(Tailwind 클래스) */
  background: string;
  lessons: readonly Lesson<View, Event, Scenario, Action>[];
  progress: TutorialProgressStore;
  /** 용어 사전 단추를 보인다 */
  glossary: boolean;
  /** 미션 대국을 연다. 장면이 없으면 처음부터 한 판 */
  startMission(scenario: Scenario | null): void;
  /**
   * 미션을 마치고 다음 걸음으로 넘어갈 때 미션 대국을 닫는다(컴퓨터 차례·연출 타이머를 멈춘다).
   * ✕로 나갈 때는 `Table`의 `onExit`가 따로 닫는다. 없으면 아무것도 하지 않는다
   */
  endMission?(): void;
  /** 판 화면이 새 진행을 보여 줄 때마다 부른다. 구독을 끊는 함수를 돌려준다 */
  subscribe(
    listener: (view: View, events: readonly Event[]) => void,
  ): () => void;
  /** 설명·퀴즈의 `scene`을 그리는 그림(판 게임). 없으면 장면을 보이지 않는다 */
  Scene?: ComponentType<{ scenario: Scenario }>;
  /** 설명·퀴즈의 `cards`를 그리는 줄. 없으면 마이티 카드 그림으로 그린다(원카드는 제 카드 모양) */
  CardRow?: ComponentType<{ cards: readonly Card[] }>;
  /** 미션 띠를 얹은 판 화면 */
  Table: ComponentType<{
    onExit: () => void;
    mission: MissionProps;
    /** 처음부터 한 판일 때 추천 카드를 보인다 */
    hints: boolean;
  }>;
}
