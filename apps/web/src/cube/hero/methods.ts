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
 * - 첫 면 색(`first`, docs/47 0절 2026-11-10 사용자 「초보자용 해법으로 맞출 때는 무조건 흰색을 첫 면, 그 외에는
 *   십자가 맞추기에 가장 효율적인 것」): 초보자 해법은 늘 흰색(`"white"`). 그 밖은 여섯 색으로 모두 풀어 보고
 *   `first`에 적은 단계(십자, 2×2는 첫 층, 루는 첫 블록, ZZ는 EO라인)의 수가 가장 적은 색을 고른다(같으면 흰색
 *   먼저, 그다음 색 번호 차례). 4×4 이상은 축소(흰·노랑 센터부터)가 끝난 뒤 3×3 단계의 첫 면 색이다.
 */

export type HeroSize = 2 | 3 | 4 | 5 | 6 | 7;
export const HERO_SIZES: readonly HeroSize[] = [2, 3, 4, 5, 6, 7];
export const DEFAULT_HERO_SIZE: HeroSize = 3;

export interface HeroMethodDef {
  /** 저장값(크기를 앞에 붙여 겹치지 않게) */
  id: string;
  size: HeroSize;
  /** 설정·꼬리표에 보이는 이름 */
  label: string;
  /** `first`: 첫 면 색(0 흰 · 1 빨강 · 2 초록 · 3 노랑 · 4 주황 · 5 파랑) */
  solve: (state: PuzzleState, first: number) => Promise<HumanSolve>;
  view: HeroView;
  /** 첫 면 색 고르기: 늘 흰색, 아니면 이 단계 수가 가장 적은 색(색 중립) */
  first: "white" | { cheapest: string };
}

const TAUGHT = { taught: true } as const;
const WHITE = "white" as const;
const CROSS = { cheapest: "cross" } as const;
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
    first: WHITE,
  },
  {
    id: "2-algs",
    size: 2,
    label: "공식 해법",
    solve: async (s, first) => (await ai()).solveIntermediate2(s, { first }),
    view: {},
    first: { cheapest: "first-layer" },
  },
  {
    id: "3-beginner",
    size: 3,
    label: "초보자 해법",
    solve: async (s) => (await ai()).solveBeginner3(s, TAUGHT),
    // 흰 십자는 넣을 자리를 y로 앞에 가져와 앞면으로 올리는 모습을 그대로 보인다
    // 조각마다 「큐브 돌리기 → 반대 면(D) → 공식」 사이를 쉬어 보인다
    view: {
      ...TAUGHT_VIEW,
      search: true,
      keepY: ["cross"],
      bring: ["cross", "corners"],
    },
    first: WHITE,
  },
  {
    id: "3-cfop",
    size: 3,
    label: "프리드리히",
    solve: async (s, first) => (await ai()).solveCfop(s, { first }),
    view: { ...CROSS_VIEW, search: true },
    first: CROSS,
  },
  {
    id: "3-roux",
    size: 3,
    label: "루",
    solve: async (s, first) => (await ai()).solveRoux(s, { first }),
    // 첫 블록은 왼쪽 아래라 카메라(위-앞-오른쪽)에서 가려진다: y2로 돌려 오른쪽에 보이고 되돌린다
    view: { mirror: ["fb"] },
    first: { cheapest: "fb" },
  },
  {
    id: "3-zz",
    size: 3,
    label: "ZZ",
    solve: async (s, first) => (await ai()).solveZZ(s, { first }),
    // 왼쪽 블록도 같은 까닭으로 y2
    view: { mirror: ["zz-left"] },
    first: { cheapest: "eoline" },
  },
  ...([4, 5, 6, 7] as const).flatMap((size): HeroMethodDef[] => [
    {
      id: `${size}-beginner`,
      size,
      label: "축소법(초보자)",
      solve: async (s) =>
        (await ai()).solveHuman("beginner", size, s, undefined, TAUGHT),
      view: TAUGHT_VIEW,
      first: WHITE,
    },
    {
      id: `${size}-cfop`,
      size,
      label: "축소법(프리드리히)",
      solve: async (s, first) =>
        (await ai()).solveHuman("advanced", size, s, undefined, { first }),
      view: CROSS_VIEW,
      first: CROSS,
    },
  ]),
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
  /** 첫 면 색(0 흰 … 5 파랑). 옛 워커 답에는 없다(흰) */
  first?: number;
  moves: string[];
  stages: { label: string; start: number; end: number }[];
  /** 단계 안에서 살피느라 잠깐 멈추는 자리(이 번호의 수 앞) */
  looks: number[];
  /** 조각을 찾는 돌리기(이 번호의 수). 옛 워커 답에는 없다 */
  searches?: number[];
  /** 강조 사건(이 번호의 수 앞, 차례대로). 옛 워커 답에는 없다 */
  marks?: { at: number; mark: PieceMark }[];
  /** 반대 면으로 조각을 칸 밑에 둔 뒤 공식 앞에서 쉬는 자리(이 번호의 수 앞). 옛 워커 답에는 없다 */
  gaps?: number[];
}

/** 색 이름(꾸미는 꼴). 색 번호는 맞춘 큐브에서 그 색이 있던 면(U R F D L B) 차례 */
const COLOR_WORDS = ["흰", "빨간", "초록", "노란", "주황", "파란"] as const;

/**
 * 꼬리표 글. 색이 들어가는 단계는 그 판의 첫 면 색으로 바꾼다: 십자는 첫 면 색, 마지막 층 십자·면은 맞은편 색
 * (흰 십자 → 노란 십자가 늘 맞은편이듯). 축소의 「흰·노랑 센터」는 첫 면 색과 상관없이 늘 흰·노랑부터 맞춘다
 */
export function heroStageLabel(
  name: string,
  first: number,
  labels: Readonly<Record<string, string>>,
): string {
  const color = COLOR_WORDS[first] ?? COLOR_WORDS[0];
  const opposite = COLOR_WORDS[(first + 3) % 6] ?? COLOR_WORDS[3];
  if (name === "cross") return `${color} 십자`;
  if (name === "eo") return `${opposite} 십자`;
  if (name === "co") return `${opposite} 면`;
  return labels[name] ?? name;
}

/** 단계 `stage`의 수(큐브 돌리기는 세지 않는다) */
function stageCost(solve: HumanSolve, stage: string): number {
  let cost = 0;
  for (const st of solve.stages)
    if (st.name === stage)
      for (let i = st.start; i < st.end; i++)
        if (!/^[xyz]/.test(solve.moves[i] as string)) cost++;
  return cost;
}

/** 색 중립에서 견줄 색 차례: 흰색 먼저(같으면 흰색), 그다음 색 번호 차례 */
export const FIRST_COLOR_ORDER: readonly number[] = [0, 1, 2, 3, 4, 5];

/**
 * 첫 면 색을 골라 푼다. 늘 흰색인 해법은 흰색으로, 그 밖은 여섯 색으로 모두 풀어 `first.cheapest` 단계 수가
 * 가장 적은 색(같으면 앞 차례). 큰 큐브는 축소법 해를 기억해 두므로(`@game/cube-ai` big.ts) 3×3 단계만 여섯 번 돈다
 */
export async function solveWithFirst(
  def: HeroMethodDef,
  state: PuzzleState,
): Promise<{ raw: HumanSolve; first: number }> {
  if (def.first === "white")
    return { raw: await def.solve(state, 0), first: 0 };
  let best: { raw: HumanSolve; first: number; cost: number } | null = null;
  for (const first of FIRST_COLOR_ORDER) {
    const raw = await def.solve(state, first);
    const cost = stageCost(raw, def.first.cheapest);
    if (!best || cost < best.cost) best = { raw, first, cost };
  }
  if (!best) throw new Error("풀지 못했다");
  return { raw: best.raw, first: best.first };
}

/**
 * 표의 해법으로 풀고(첫 면 색을 골라) 보여 주기 변환(`present.ts`)을 거쳐 꼬리표를 붙인다(워커 안에서).
 * 표에 없는 해법이면 던진다
 */
export async function solveForHero(
  methodId: string,
  state: PuzzleState,
): Promise<HeroSolve> {
  const def = findHeroMethod(methodId);
  if (!def) throw new Error(`모르는 해법: ${methodId}`);
  const [{ raw, first }, { STAGE_LABELS }, { presentSolve }] =
    await Promise.all([solveWithFirst(def, state), ai(), import("./present")]);
  const solve = presentSolve(def.size, state, raw, def.view, first);
  return {
    first,
    moves: solve.moves,
    stages: solve.stages.map((s) => ({
      label: heroStageLabel(s.name, first, STAGE_LABELS),
      start: s.start,
      end: s.end,
    })),
    looks: solve.looks,
    searches: solve.searches,
    marks: solve.marks,
    gaps: solve.gaps,
  };
}
