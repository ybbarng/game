// 공식 연습(docs/47 16-9)의 자료 모양. 화면과 떨어진 순수 자료라 웹 미니 모드·겨루기(3단계)도 그대로 읽는다.
import type { AlgCase, GoalName, MaskName } from "../learn/types";

/** 연습 상황 하나 */
export interface DrillCase {
  id: string;
  /** 한국어 이름 */
  name: string;
  /** 모양 묶음(OLL의 「점」 등) */
  group?: string;
  /** 자료의 공식들. 첫 공식이 실물에서 흔한 공식(배우기 단원의 대표) */
  algs: string[];
  /** 단원이 그 상황을 만드는 공식(쥐기 뒤). 없으면 대표의 거꾸로. 보고 치기의 「그 상황인가」 확인용 */
  setup?: string;
  /** 공식 모음의 상황(내 공식·후보를 고를 수 있는 묶음만) */
  source?: AlgCase;
}

export type PracticeMethod = "beginner" | "cfop";

/** 연습 단계 하나(`/cube/train?set=<id>`) */
export interface PracticeStage {
  id: string;
  /** 해법 카드·단계 칩에 보이는 이름 */
  title: string;
  method: PracticeMethod;
  /** 시작할 때 쥐는 큐브 돌리기(흰 면 아래면 "z2") */
  hold: "" | "z2";
  /** 그 단계와 상관없는 칸 가리기 */
  mask: MaskName;
  /** 익숙해진 상황은 윗면을 돌려 둔 채 낸다 */
  auf: boolean;
  /** 보고 치기의 통과 모양 */
  goal: (c: DrillCase) => GoalName;
  cases: DrillCase[];
}
