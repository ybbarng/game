import type { HumanSolve } from "@game/cube-ai";
import type { PuzzleState } from "@game/puzzle-core";

/**
 * 첫 화면 큐브 연출이 쓰는 해법 표. 설정 화면(「첫 화면 큐브」)과 연출이 모두 이 표만 본다.
 * 새 해법(예: 4×4 야우, 풀이 함수가 생기면)을 더하려면 `HERO_METHODS`에 한 줄을 더하면 된다:
 * 설정의 해법 고르기와 「번갈아」 차례에 저절로 나온다.
 *
 * - `id`는 저장값이라 한 번 정하면 바꾸지 않는다(바꾸면 옛 설정이 「번갈아」로 읽힌다).
 * - `solve`는 워커 안에서 부른다(`worker/jobs.ts`의 `hero` 일). 무거운 해법 패키지는 여기서 늦게 불러와,
 *   이 표를 읽는 설정 화면 묶음에 싣지 않는다. 못 풀면 던진다(연출은 그 판을 건너뛰고 다시 섞는다).
 * - 단계 이름은 `HumanSolve.stages`의 `name`을 `STAGE_LABELS`로 바꿔 꼬리표에 쓴다.
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
}

const ai = () => import("@game/cube-ai");

export const HERO_METHODS: readonly HeroMethodDef[] = [
  {
    id: "2-beginner",
    size: 2,
    label: "초보자 해법",
    solve: async (s) => (await ai()).solveBeginner2(s),
  },
  {
    id: "2-algs",
    size: 2,
    label: "공식 해법",
    solve: async (s) => (await ai()).solveIntermediate2(s),
  },
  {
    id: "3-beginner",
    size: 3,
    label: "초보자 해법",
    solve: async (s) => (await ai()).solveBeginner3(s),
  },
  {
    id: "3-cfop",
    size: 3,
    label: "프리드리히",
    solve: async (s) => (await ai()).solveCfop(s),
  },
  {
    id: "3-roux",
    size: 3,
    label: "루",
    solve: async (s) => (await ai()).solveRoux(s),
  },
  {
    id: "3-zz",
    size: 3,
    label: "ZZ",
    solve: async (s) => (await ai()).solveZZ(s),
  },
  {
    id: "4-beginner",
    size: 4,
    label: "축소법(초보자)",
    solve: async (s) => (await ai()).solveHuman("beginner", 4, s),
  },
  {
    id: "4-cfop",
    size: 4,
    label: "축소법(프리드리히)",
    solve: async (s) => (await ai()).solveHuman("advanced", 4, s),
  },
  {
    id: "5-beginner",
    size: 5,
    label: "축소법(초보자)",
    solve: async (s) => (await ai()).solveHuman("beginner", 5, s),
  },
  {
    id: "5-cfop",
    size: 5,
    label: "축소법(프리드리히)",
    solve: async (s) => (await ai()).solveHuman("advanced", 5, s),
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
}

/** 표의 해법으로 풀어 꼬리표를 붙인다(워커 안에서). 표에 없는 해법이면 던진다 */
export async function solveForHero(
  methodId: string,
  state: PuzzleState,
): Promise<HeroSolve> {
  const def = findHeroMethod(methodId);
  if (!def) throw new Error(`모르는 해법: ${methodId}`);
  const [solve, { STAGE_LABELS }] = await Promise.all([def.solve(state), ai()]);
  return {
    moves: solve.moves,
    stages: solve.stages.map((s) => ({
      label: STAGE_LABELS[s.name] ?? s.name,
      start: s.start,
      end: s.end,
    })),
    looks: solve.looks,
  };
}
