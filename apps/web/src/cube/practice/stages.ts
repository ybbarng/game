// 공식 연습 단계(docs/47 16-9). 짧고 쉬운 것부터: 십자 → 초보자 2층 → 초보자 3층 넷 → F2L → 2단계 OLL·PLL → 전체 OLL·PLL.
// 초보자 해법 카드는 앞의 여섯, CFOP 카드는 F2L부터 보인다. 오르테가·패리티·블라인드 공식은 「더 보기」(옛 자유 훈련).
import { ALG_SETS, type AlgCase, type AlgSetInfo } from "../learn";
import { goalForCase } from "../learn/judge";
import type { AlgSet } from "../learn/types";
import {
  BEGINNER_CORNERS,
  BEGINNER_CROSS,
  BEGINNER_EDGES,
  BEGINNER_SECOND,
  BEGINNER_TWIST,
  BEGINNER_YELLOW_CROSS,
} from "./beginner";
import type { DrillCase, PracticeMethod, PracticeStage } from "./types";

const fromSet = (id: AlgSet): AlgSetInfo =>
  ALG_SETS.find((s) => s.set === id) as AlgSetInfo;

const drillOf = (c: AlgCase): DrillCase => ({
  id: c.id,
  name: c.name,
  ...(c.group ? { group: c.group } : {}),
  algs: c.algs,
  ...(c.setup ? { setup: c.setup } : {}),
  source: c,
});

/** 공식 모음 묶음을 연습 단계로(쥐기 z2, 묶음의 가리기, 윗면 돌리기) */
function cfopStage(id: AlgSet, title: string): PracticeStage {
  const set = fromSet(id);
  return {
    id,
    title,
    method: "cfop",
    hold: "z2",
    mask: set.mask,
    auf: true,
    goal: (c) => goalForCase(set, c.source as AlgCase),
    cases: set.cases.map(drillOf),
  };
}

export const PRACTICE_STAGES: PracticeStage[] = [
  {
    id: "beginner-cross",
    title: "십자",
    method: "beginner",
    hold: "",
    mask: "cross",
    auf: false,
    goal: () => "white-cross",
    cases: BEGINNER_CROSS,
  },
  {
    id: "beginner-second",
    title: "2층",
    method: "beginner",
    hold: "z2",
    mask: "f2l",
    auf: false,
    goal: () => "second-layer",
    cases: BEGINNER_SECOND,
  },
  {
    id: "beginner-yellow-cross",
    title: "노란 십자",
    method: "beginner",
    hold: "z2",
    mask: "oll",
    auf: false,
    goal: () => "yellow-cross",
    cases: BEGINNER_YELLOW_CROSS,
  },
  {
    id: "beginner-edges",
    title: "옆면 맞추기",
    method: "beginner",
    hold: "z2",
    mask: "all",
    auf: false,
    goal: () => "yellow-edges",
    cases: BEGINNER_EDGES,
  },
  {
    id: "beginner-corners",
    title: "코너 자리",
    method: "beginner",
    hold: "z2",
    mask: "all",
    auf: false,
    goal: () => "ll-corners-placed",
    cases: BEGINNER_CORNERS,
  },
  {
    id: "beginner-twist",
    title: "코너 방향",
    method: "beginner",
    hold: "z2",
    mask: "all",
    auf: false,
    goal: () => "ll",
    cases: BEGINNER_TWIST,
  },
  cfopStage("f2l", "F2L"),
  cfopStage("2look-oll", "2단계 OLL"),
  cfopStage("2look-pll", "2단계 PLL"),
  cfopStage("oll", "OLL"),
  cfopStage("pll", "PLL"),
];

export const METHOD_TITLE: Record<PracticeMethod, string> = {
  beginner: "초보자",
  cfop: "CFOP",
};

/** 「더 보기」에 둘 옛 묶음(자유 훈련으로 연다) */
export const MORE_SETS: AlgSet[] = ALG_SETS.map((s) => s.set).filter(
  (s) => !PRACTICE_STAGES.some((p) => p.id === s),
);

export function stageById(
  id: string | null | undefined,
): PracticeStage | undefined {
  return PRACTICE_STAGES.find((s) => s.id === id);
}

export function stagesOf(method: PracticeMethod): PracticeStage[] {
  return PRACTICE_STAGES.filter((s) => s.method === method);
}

/**
 * `/cube/train`의 주소가 옛 자유 훈련(상황 고르기·약한 것·내 목록)을 여나. 「더 보기」의 옛 묶음, 내 공식의
 * 「내 목록 훈련」(`?pick=mine`), `?mode=free`. 나머지는 공식 연습
 */
export function isFreeTrain(search: string): boolean {
  const q = new URLSearchParams(search);
  const set = q.get("set");
  return (
    q.get("mode") === "free" ||
    q.get("pick") === "mine" ||
    (set !== null && (MORE_SETS as string[]).includes(set))
  );
}

/** 배우기 과정 → 연습 단계 해법(없으면 null) */
export function methodOfCourse(courseId: string): PracticeMethod | null {
  if (courseId === "333-beginner") return "beginner";
  if (courseId === "cfop") return "cfop";
  return null;
}
