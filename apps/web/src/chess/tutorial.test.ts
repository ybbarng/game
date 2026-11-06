// @vitest-environment node
import { chessBeginnerBot, createChessExpertBot } from "@game/chess-ai";
import {
  type Action,
  createChessScenario,
  type GameEvent,
  inCheck,
  other,
  squareAt,
  viewOf,
} from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { chessKit } from "./kit";
import {
  CHESS_LESSONS,
  CHESS_TUTORIAL_RULES,
  type ChessLesson,
  type ChessScene,
} from "./tutorial";

type Mission = Extract<ChessLesson["steps"][number], { kind: "mission" }>;

function sceneState(scene: ChessScene) {
  return createChessScenario({ rules: CHESS_TUTORIAL_RULES, ...scene });
}

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: chessKit,
    rules: CHESS_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: chessBeginnerBot,
    initialState: sceneState(mission.scenario),
  });
  const events: GameEvent[] = [];
  match.subscribe((s) => events.push(...s.events));
  const before = mission.check({ view: match.current(), events: [] });
  for (const action of actions) {
    const result = match.submit(action);
    if (!result.ok) throw new Error(`${mission.title}: ${result.error}`);
  }
  return { before, after: mission.check({ view: match.current(), events }) };
}

const scenarioMissions = CHESS_LESSONS.flatMap((l) =>
  l.steps.filter(
    (s): s is Mission => s.kind === "mission" && s.scenario !== null,
  ),
);
/** 한 수로 판정하는 미션(정답·실수 수가 있다) */
const missions = scenarioMissions
  .filter((m) => m.solution)
  .map((m) => [m.title, m] as const);
/** 끝내기처럼 컴퓨터와 끝까지 두는 미션(정답 수순이 정해져 있지 않다) */
const playouts = scenarioMissions
  .filter((m) => !m.solution)
  .map((m) => [m.title, m] as const);

/** 끝내기 미션을 대신 둘 고수. 판 수 상한을 줄여 시험을 빨리 끝낸다(줄여도 퀸·룩 메이트는 한다) */
const finisher = createChessExpertBot(10_000);

/** 내 자리를 고수가 대신 두어 판이 끝날 때까지 */
function playOut(mission: Mission) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: chessKit,
    rules: CHESS_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: chessBeginnerBot,
    initialState: sceneState(mission.scenario),
  });
  const events: GameEvent[] = [];
  match.subscribe((s) => events.push(...s.events));
  for (let i = 0; i < 100; i++) {
    const view = match.current();
    if (view.decision?.kind !== "move") break;
    const result = match.submit(finisher.decide(view, { seed: i }));
    if (!result.ok) throw new Error(`${mission.title}: ${result.error}`);
  }
  return mission.check({ view: match.current(), events });
}

describe("체스 튜토리얼 미션", () => {
  it("단원은 아홉, 한 수 미션은 일곱, 끝까지 두는 미션은 둘이다(실전은 처음부터)", () => {
    expect(CHESS_LESSONS).toHaveLength(9);
    expect(missions).toHaveLength(7);
    expect(playouts).toHaveLength(2);
    expect(CHESS_LESSONS[0]?.id).toBe("goal");
    expect(CHESS_LESSONS.at(-1)?.id).toBe("real");
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });

  it.each(playouts)("%s: 고수가 대신 두면 체크메이트로 성공한다", (_t, m) => {
    expect(playOut(m)).toBe("success");
  });
});

describe("체스 튜토리얼 장면", () => {
  it("모든 장면을 만들 수 있고, 내가 둘 차례이며 판이 끝나 있지 않다", () => {
    for (const lesson of CHESS_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const view = viewOf(sceneState(scene), 0);
        expect(view.decision).toEqual({ kind: "move" });
        expect(view.phase).toBe("play");
      }
  });

  it("모든 장면에서 둘 차례가 아닌 편의 킹이 체크받고 있지 않다(나올 수 없는 판이 아니다)", () => {
    for (const lesson of CHESS_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const { position } = sceneState(scene);
        expect(
          inCheck(position.board, other(position.turn)),
          `${lesson.id}: ${scene.fen}`,
        ).toBe(false);
      }
  });

  it("점을 찍는 기물(show)은 그 칸에 있는 둘 차례 편 기물이다", () => {
    for (const lesson of CHESS_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "mission" || !step.scene?.show) continue;
        const state = sceneState(step.scene);
        const cell = state.position.board[squareAt(step.scene.show)];
        expect(cell?.startsWith(state.position.turn)).toBe(true);
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of CHESS_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
