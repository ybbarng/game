import type { HumanSolve } from "@game/cube-ai";
import type { PuzzleState } from "@game/puzzle-core";

import type { PieceMark } from "../piece-marks";
import type { HeroView } from "./present";

/**
 * 첫 화면 큐브 연출이 쓰는 해법 표. 설정 화면(「첫 화면 큐브」)과 연출이 모두 이 표만 본다.
 * 새 해법(예: 4×4 야우, 풀이 함수가 생기면)을 더하려면 `HERO_METHODS`에 한 줄을 더하면 된다:
 * 설정의 해법 고르기와 「번갈아」 차례에 저절로 나온다.
 *
 * - `id`는 저장값이라 한 번 정하면 바꾸지 않는다(바꾸면 옛 설정이 「번갈아」로 읽힌다).
 * - `solve`는 워커 안에서 부른다(`worker/jobs.ts`의 `hero` 일). 무거운 해법 패키지는 여기서 늦게 불러와,
 *   이 표를 읽는 설정 화면 묶음에 싣지 않는다. 못 풀면 던진다(연출은 그 판을 건너뛰고 다시 섞는다).
 * - 단계 이름은 `HumanSolve.stages`의 `name`을 `STAGE_LABELS`로 바꿔 꼬리표에 쓴다.
 * - `view`는 화면에 보이는 방향 규칙(`present.ts`): 첫 층을 위에서 보일 단계(`up`), y2로 돌려 보일 단계
 *   (`mirror`). 넣는 단계는 늘 넣을 칸을 앞-오른쪽으로 돌려 보인다. 해법이 낸 수는 바꾸지 않는다.
 * - `search`(3×3 초보자·프리드리히): 조각 하나·짝 하나를 넣기 전에 보이는 세 면에서 찾아 돌리고, 넣을 곳·찾은
 *   조각·맞춘 조각 강조 사건을 낸다(`present.ts`, `../piece-marks.ts`). 루·ZZ·2×2·큰 큐브는 아직 찾지 않는다.
 * - 초보자 해법은 배우기에서 가르치는 방식(흰 면 위 십자·첫 층, 마지막 층은 노란 십자 → 옆면 맞추기 →
 *   코너 자리 → 코너 방향, `{ taught: true }`)으로 푼다.
 *   컴퓨터 대결은 이 선택지를 쓰지 않는다.
 */

export type HeroSize = 2 | 3 | 4 | 5;
export const HERO_SIZES: readonly HeroSize[] = [2, 3, 4, 5];
export const DEFAULT_HERO_SIZE: HeroSize = 3;

export interface HeroMethodDef {
  /** 저장값(크기를 앞에 붙여 겹치지 않게) */
  id: string;
  size: HeroSize;
  /** 설정·꼬리표에 보이는 이름 */
  label: string;
  solve: (state: PuzzleState) => Promise<HumanSolve>;
  view: HeroView;
}

const TAUGHT = { taught: true } as const;
/** 배우는 방식: 흰 십자와 첫 층 코너를 위에서, 끝나면 z2 */
const TAUGHT_VIEW: HeroView = { up: ["cross", "corners"] };
/** 프리드리히: 십자를 위에서 보이고 뒤집어, F2L은 맞춘 면 아래 */
const CROSS_VIEW: HeroView = { up: ["cross"] };

const ai = () => import("@game/cube-ai");

export const HERO_METHODS: readonly HeroMethodDef[] = [
  {
    id: "2-beginner",
    size: 2,
    label: "초보자 해법",
    solve: async (s) => (await ai()).solveBeginner2(s, TAUGHT),
    view: { up: ["first-layer"] },
  },
  {
    id: "2-algs",
    size: 2,
    label: "공식 해법",
    solve: async (s) => (await ai()).solveIntermediate2(s),
    view: {},
  },
  {
    id: "3-beginner",
    size: 3,
    label: "초보자 해법",
    solve: async (s) => (await ai()).solveBeginner3(s, TAUGHT),
    view: { ...TAUGHT_VIEW, search: true },
  },
  {
    id: "3-cfop",
    size: 3,
    label: "프리드리히",
    solve: async (s) => (await ai()).solveCfop(s),
    view: { ...CROSS_VIEW, search: true },
  },
  {
    id: "3-roux",
    size: 3,
    label: "루",
    solve: async (s) => (await ai()).solveRoux(s),
    // 첫 블록은 왼쪽 아래라 카메라(위-앞-오른쪽)에서 가려진다: y2로 돌려 오른쪽에 보이고 되돌린다
    view: { mirror: ["fb"] },
  },
  {
    id: "3-zz",
    size: 3,
    label: "ZZ",
    solve: async (s) => (await ai()).solveZZ(s),
    // 왼쪽 블록도 같은 까닭으로 y2
    view: { mirror: ["zz-left"] },
  },
  {
    id: "4-beginner",
    size: 4,
    label: "축소법(초보자)",
    solve: async (s) =>
      (await ai()).solveHuman("beginner", 4, s, undefined, TAUGHT),
    view: TAUGHT_VIEW,
  },
  {
    id: "4-cfop",
    size: 4,
    label: "축소법(프리드리히)",
    solve: async (s) => (await ai()).solveHuman("advanced", 4, s),
    view: CROSS_VIEW,
  },
  {
    id: "5-beginner",
    size: 5,
    label: "축소법(초보자)",
    solve: async (s) =>
      (await ai()).solveHuman("beginner", 5, s, undefined, TAUGHT),
    view: TAUGHT_VIEW,
  },
  {
    id: "5-cfop",
    size: 5,
    label: "축소법(프리드리히)",
    solve: async (s) => (await ai()).solveHuman("advanced", 5, s),
    view: CROSS_VIEW,
  },
];

/** 「번갈아」: 그 크기의 해법을 표 차례대로 돌아가며 */
export const HERO_ALTERNATE = "alternate";
export type HeroChoice = typeof HERO_ALTERNATE | string;

export function heroMethodsFor(size: HeroSize): HeroMethodDef[] {
  return HERO_METHODS.filter((m) => m.size === size);
}

export function findHeroMethod(id: string): HeroMethodDef | undefined {
  return HERO_METHODS.find((m) => m.id === id);
}

/** 설정(크기·고른 해법)으로 연출이 돌릴 해법 차례 */
export function heroRotation(
  size: HeroSize,
  choice: HeroChoice,
): HeroMethodDef[] {
  const one = findHeroMethod(choice);
  if (one && one.size === size) return [one];
  return heroMethodsFor(size);
}

export const isHeroSize = (v: unknown): v is HeroSize =>
  typeof v === "number" && (HERO_SIZES as readonly number[]).includes(v);

/** 워커가 돌려주는 풀이: 단계 이름을 이미 꼬리표 글로 바꿔 둔다(화면이 해법 패키지를 싣지 않게) */
export interface HeroSolve {
  moves: string[];
  stages: { label: string; start: number; end: number }[];
  /** 단계 안에서 살피느라 잠깐 멈추는 자리(이 번호의 수 앞) */
  looks: number[];
  /** 조각을 찾는 돌리기(이 번호의 수). 옛 워커 답에는 없다 */
  searches?: number[];
  /** 강조 사건(이 번호의 수 앞, 차례대로). 옛 워커 답에는 없다 */
  marks?: { at: number; mark: PieceMark }[];
}

/**
 * 표의 해법으로 풀고 보여 주기 변환(`present.ts`)을 거쳐 꼬리표를 붙인다(워커 안에서).
 * 표에 없는 해법이면 던진다
 */
export async function solveForHero(
  methodId: string,
  state: PuzzleState,
): Promise<HeroSolve> {
  const def = findHeroMethod(methodId);
  if (!def) throw new Error(`모르는 해법: ${methodId}`);
  const [raw, { STAGE_LABELS }, { presentSolve }] = await Promise.all([
    def.solve(state),
    ai(),
    import("./present"),
  ]);
  const solve = presentSolve(def.size, state, raw, def.view);
  return {
    moves: solve.moves,
    stages: solve.stages.map((s) => ({
      label: STAGE_LABELS[s.name as keyof typeof STAGE_LABELS] ?? s.name,
      start: s.start,
      end: s.end,
    })),
    looks: solve.looks,
    searches: solve.searches,
    marks: solve.marks,
  };
}
