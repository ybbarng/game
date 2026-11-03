import { galaxyBeginnerBot } from "@game/galaxy-ai";
import {
  type Action,
  createGalaxyScenario,
  type GameEvent,
  type ScenarioStar,
  stepWithDice,
  viewOf,
} from "@game/galaxy-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { money } from "./format";
import { galaxyKit } from "./kit";
import { scriptedDiceStep } from "./practice";
import { STAR_QUIZ_KINDS, starQuestion } from "./star-quiz";
import {
  type BoardScene,
  boardGroup,
  boardStar,
  GALAXY_LESSONS,
  GALAXY_TUTORIAL_RULES,
  type GalaxyLesson,
  type GalaxyScene,
  sceneState,
  squareOfStar,
  TUTORIAL_BOARD,
  winnerOf,
} from "./tutorial";

type Mission = Extract<GalaxyLesson["steps"][number], { kind: "mission" }>;
type Quiz = Extract<GalaxyLesson["steps"][number], { kind: "quiz" }>;

function runMission(mission: Mission, actions: Action[]) {
  const scene = mission.scenario;
  if (scene?.kind !== "board") throw new Error("판 장면이 없는 미션");
  const initialState = sceneState(scene);
  const match = new LocalMatch({
    kit: galaxyKit,
    rules: GALAXY_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: galaxyBeginnerBot,
    initialState,
    ...(scene.dice ? { step: scriptedDiceStep(initialState, scene.dice) } : {}),
  });
  const events: GameEvent[] = [];
  match.subscribe((s) => events.push(...s.events));
  const before = mission.check({ view: match.current(), events: [] });
  for (const action of actions) {
    const result = match.submit(action);
    if (!result.ok) throw new Error(`${mission.title}: ${result.error}`);
  }
  const after = mission.check({ view: match.current(), events });
  match.dispose();
  return { before, after };
}

const steps = GALAXY_LESSONS.flatMap((l) => l.steps);
const missions = steps
  .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
  .map((m) => [m.title, m] as const);
const quizzes = steps.filter((s): s is Quiz => s.kind === "quiz");

describe("은하 한 바퀴 배우기 단원", () => {
  it("9단원이고, 별자리 익히기 두 단원은 퀴즈가 여덟씩이다", () => {
    expect(GALAXY_LESSONS).toHaveLength(9);
    const count = (id: string) =>
      GALAXY_LESSONS.find((l) => l.id === id)?.steps.filter(
        (s) => s.kind === "quiz",
      ).length;
    expect(count("shapes")).toBe(8);
    expect(count("stars")).toBe(8);
  });

  it("장면이 있는 미션이 넷이다(실전은 처음부터)", () => {
    expect(missions).toHaveLength(4);
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });

  it("실전 미션: 1등이면 성공, 아니면 실패, 끝나기 전에는 판단하지 않는다", () => {
    const real = steps.find(
      (s): s is Mission => s.kind === "mission" && s.scenario === null,
    );
    if (!real) throw new Error("실전 미션이 없다");
    const view = viewOf(sceneState({ kind: "board" }), 0);
    const ended = (rank: number): GameEvent => ({
      type: "gameEnded",
      result: {
        kind: "turns",
        seat: null,
        standings: [
          { seat: 0, rank, assets: 1000, cash: 1000, out: false },
          { seat: 1, rank: 3 - rank, assets: 900, cash: 900, out: false },
        ],
      },
    });
    expect(real.check({ view, events: [ended(1)] })).toBe("success");
    expect(real.check({ view, events: [ended(2)] })).toBe("fail");
    expect(real.check({ view, events: [] })).toBeNull();
  });
});

describe("은하 한 바퀴 배우기 장면", () => {
  const scenes: GalaxyScene[] = steps.flatMap((s) =>
    s.kind === "mission"
      ? s.scenario
        ? [s.scenario]
        : []
      : s.kind !== "quiz" && s.kind !== "explain"
        ? []
        : s.scene
          ? [s.scene]
          : [],
  );

  it("모든 장면을 만들 수 있고, 미션 장면은 내가 굴릴 차례다", () => {
    for (const scene of scenes) {
      if (scene.kind === "board") {
        const view = viewOf(sceneState(scene), 0);
        expect(view.decision?.kind).toBe("roll");
      } else if (scene.kind === "sky") {
        expect(boardGroup(scene.group)).toBeTruthy();
        if (scene.star) {
          const star = boardStar(scene.star);
          expect(TUTORIAL_BOARD.groups[star.group]?.id).toBe(scene.group);
        }
      } else for (const id of scene.stars) expect(boardStar(id)).toBeTruthy();
    }
  });

  it("퀴즈 정답 번호가 보기 안에 있고 보기가 겹치지 않는다", () => {
    expect(quizzes.length).toBeGreaterThan(20);
    for (const quiz of quizzes) {
      expect(quiz.answer).toBeGreaterThanOrEqual(0);
      expect(quiz.answer).toBeLessThan(quiz.options.length);
      expect(new Set(quiz.options).size).toBe(quiz.options.length);
    }
  });

  it("견우성·직녀성을 보기 이름으로 쓰지 않는다", () => {
    for (const quiz of quizzes)
      for (const option of quiz.options)
        expect(option).not.toMatch(/견우|직녀/);
  });
});

/** 컴퓨터(1번 자리)가 정해 둔 눈 1·3으로 이 칸에 와서 일어난 일 */
function botLandsOn(
  square: number,
  options: { stars?: ScenarioStar[]; deck?: number[] },
) {
  const state = createGalaxyScenario({
    board: TUTORIAL_BOARD,
    rules: GALAXY_TUTORIAL_RULES,
    turn: 1,
    positions: [0, (square - 4 + 32) % 32],
    stars: (options.stars ?? []).map((s) => ({ ...s, owner: 0 })),
    ...(options.deck ? { deck: options.deck } : {}),
  });
  const result = stepWithDice(state, 1, [1, 3]);
  if (!result.ok) throw new Error(result.error);
  return result.events;
}

describe("퀴즈 글의 숫자가 엔진 계산과 같다", () => {
  const quizWith = (text: string) => {
    const quiz = quizzes.find((q) => q.question.includes(text));
    if (!quiz) throw new Error(`퀴즈가 없다: ${text}`);
    return quiz;
  };
  const correct = (quiz: Quiz) => quiz.options[quiz.answer];

  it("이용료 퀴즈: 남이 그 별에 멈춰 실제로 낸 값이 정답이다", () => {
    const cases: [string, string, BoardScene][] = [
      ["1단 정거장에 멈췄어요", "Sirius", findScene("1단 정거장에 멈췄어요")],
      ["**2단**을 올렸어요", "Rigel", findScene("**2단**을 올렸어요")],
    ];
    for (const [text, id, scene] of cases) {
      const events = botLandsOn(squareOfStar(id), {
        stars: scene.stars ?? [],
      });
      const paid = events.find((e) => e.type === "pay" && e.reason === "rent");
      expect(paid?.type === "pay" && money(paid.amount)).toBe(
        correct(quizWith(text)),
      );
    }
  });

  it("공문 퀴즈: 그 공문을 실제로 펴서 받은 값이 정답이다", () => {
    for (const quiz of quizzes) {
      const scene = quiz.scene;
      if (scene?.kind !== "board" || scene.card === undefined) continue;
      // 컴퓨터가 공문 칸(4)에 와서 펴는 대신, 내가 가진 별로 계산하도록 내 차례로 둔다
      const state = createGalaxyScenario({
        board: TUTORIAL_BOARD,
        rules: GALAXY_TUTORIAL_RULES,
        positions: [0, 0],
        stars: scene.stars ?? [],
        deck: [scene.card],
      });
      const result = stepWithDice(state, 0, [1, 3]);
      if (!result.ok) throw new Error(result.error);
      const got = result.events
        .filter((e) => e.type === "pay" && e.reason === "card" && e.to === 0)
        .reduce((t, e) => t + (e.type === "pay" ? e.amount : 0), 0);
      expect(money(got)).toBe(correct(quiz));
    }
  });

  it("단원 글의 값·별 값이 판과 같다", () => {
    const text = steps
      .flatMap((s) => (s.kind === "explain" ? s.body : []))
      .join(" ");
    expect(text).toContain(money(boardStar("Sirius").value));
    expect(text).toContain(money(boardGroup("Ori").levelCost));
  });
});

function findScene(text: string): BoardScene {
  const quiz = quizzes.find((q) => q.question.includes(text));
  if (quiz?.scene?.kind !== "board") throw new Error(`판 장면이 없다: ${text}`);
  return quiz.scene;
}

describe("별자리 퀴즈(무작위 문제)", () => {
  /** 정해진 난수(시험이 늘 같게) */
  function seeded(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  it.each(STAR_QUIZ_KINDS)(
    "%s: 정답이 보기 안에 있고 장면과 맞는다",
    (kind) => {
      const random = seeded(kind.length * 7919);
      for (let i = 0; i < 60; i++) {
        const q = starQuestion(random, kind);
        expect(q.kind).toBe(kind);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
        const correct = q.options[q.answer];
        const scene = q.scene;
        if (kind === "shape" && scene.kind === "sky") {
          expect(q.options).toHaveLength(4);
          expect(correct).toBe(boardGroup(scene.group).ko);
        } else if (kind === "star" && scene.kind === "sky") {
          expect(q.options).toHaveLength(4);
          expect(correct).toBe(boardStar(scene.star ?? "").star.ko);
        } else if (scene.kind === "pair") {
          const [a, b] = scene.stars;
          const win = winnerOf(a, b, kind as "brighter" | "farther" | "hotter");
          expect(correct).toBe(boardStar(win ?? "").star.ko);
        } else throw new Error(`갈래와 장면이 맞지 않는다: ${kind}`);
      }
    },
  );

  it("갈래를 고르지 않으면 다섯 갈래가 모두 나온다", () => {
    const random = seeded(3);
    const kinds = new Set(
      Array.from({ length: 80 }, () => starQuestion(random).kind),
    );
    expect(kinds.size).toBe(STAR_QUIZ_KINDS.length);
  });
});
