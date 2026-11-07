// @vitest-environment node
import { janggiBeginnerBot } from "@game/janggi-ai";
import {
  type Action,
  applyMove,
  createJanggiScenario,
  createMatch,
  type GameEvent,
  inCheck,
  kingsFacing,
  legalMoves,
  pointAt,
  viewOf,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { janggiKit } from "./kit";
import { sideAt } from "./replay";
import {
  JANGGI_LESSONS,
  JANGGI_TUTORIAL_RULES,
  type JanggiLesson,
  type JanggiScene,
} from "./tutorial";
import { move } from "./tutorial-checks";

type Mission = Extract<JanggiLesson["steps"][number], { kind: "mission" }>;

function sceneState(scene: JanggiScene) {
  return createJanggiScenario({ rules: JANGGI_TUTORIAL_RULES, ...scene });
}

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: janggiKit,
    rules: JANGGI_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: janggiBeginnerBot,
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

const missions = JANGGI_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

/** 처음부터 두는 판(상차림부터)에서 미션을 해 본다 */
function runFromSetup(mission: Mission, actions: Action[]) {
  const match = new LocalMatch({
    kit: janggiKit,
    rules: JANGGI_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: janggiBeginnerBot,
    initialState: {
      ...createMatch(JANGGI_TUTORIAL_RULES, 1).state,
      choSeat: 0,
    },
  });
  const events: GameEvent[] = [];
  match.subscribe((s) => events.push(...s.events));
  for (const action of actions) {
    const result = match.submit(action);
    if (!result.ok) throw new Error(`${mission.title}: ${result.error}`);
  }
  return mission.check({ view: match.current(), events });
}

describe("장기 튜토리얼 미션", () => {
  it("장면이 있는 미션이 열이다(상차림 고르기·실전은 처음부터)", () => {
    expect(missions).toHaveLength(10);
  });

  it("상차림 고르기: 마상마상이면 성공, 다른 차림이면 실패", () => {
    const mission = JANGGI_LESSONS.flatMap((l) => l.steps).find(
      (s): s is Mission => s.kind === "mission" && s.title === "상차림 고르기",
    );
    if (!mission) throw new Error("상차림 고르기 미션이 없다");
    expect(runFromSetup(mission, [])).toBeNull();
    expect(runFromSetup(mission, mission.solution ?? [])).toBe("success");
    expect(runFromSetup(mission, mission.mistake ?? [])).toBe("fail");
  });

  it("상 쪽 졸 쓸기: 79 졸을 78로 옮겨야 성공, 77 졸을 78로 옮기면 실패", () => {
    const mission = missions.find(([t]) => t === "상 쪽 졸 쓸기")?.[1];
    if (!mission) throw new Error("상 쪽 졸 쓸기 미션이 없다");
    expect(runMission(mission, [move("79", "78")]).after).toBe("success");
    expect(runMission(mission, [move("77", "78")]).after).toBe("fail");
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });
});

describe("장기 튜토리얼 장면", () => {
  it("모든 장면을 만들 수 있고 내가 둘 차례다", () => {
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const view = viewOf(sceneState(scene), 0);
        expect(view.decision).toEqual({ kind: "move" });
        // 시작부터 빅장(점수로 끝)이 아니어야 한다.
        expect(kingsFacing(view.board)).toBe(false);
        // 둘 차례가 아닌 한 궁이 이미 장군을 받는 판(나올 수 없는 판)이 아니어야 한다.
        expect(inCheck(view.board, "h"), `${lesson.id}`).toBe(false);
      }
  });

  it("점을 찍는 기물(show)은 그 자리에 있는 내 기물이다(넘겨 보기는 그 자리로 오는 첫 수부터)", () => {
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "mission" || !step.scene?.show) continue;
        const { show, replay = [] } = step.scene;
        let board = sceneState(step.scene).board;
        const boards = [board];
        for (const text of replay) {
          const [from = "", to = ""] = text.split("-");
          board = applyMove(board, { from: pointAt(from), to: pointAt(to) });
          boards.push(board);
        }
        const first = boards.findIndex((b) => b[pointAt(show)] !== "");
        expect(first, `${lesson.id} ${show}`).toBeGreaterThanOrEqual(0);
        // 한 번 오면 끝까지 내 기물이 그 자리에 있다.
        for (const b of boards.slice(first))
          expect(b[pointAt(show)]?.startsWith("c")).toBe(true);
      }
  });

  it("넘겨 보는 수순(replay)은 둔 편(번갈아·초 혼자)이 모두 둘 수 있는 수이고, 까닭은 수마다 하나다", () => {
    let count = 0;
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "mission" || !step.scene?.replay) continue;
        count++;
        const { replay, notes, replayBy, follow } = step.scene;
        if (notes) expect(notes).toHaveLength(replay.length);
        // 따라 두기는 초 수를 내가 두니 초부터 번갈아야 한다.
        if (follow) expect(replayBy ?? "turns").toBe("turns");
        let board = sceneState(step.scene).board;
        replay.forEach((text, i) => {
          const [from = "", to = ""] = text.split("-");
          const legal = legalMoves(board, sideAt(i, replayBy)).some(
            (m) => m.from === pointAt(from) && m.to === pointAt(to),
          );
          expect(legal, `${lesson.id} ${i + 1}째 수 ${text}`).toBe(true);
          board = applyMove(board, { from: pointAt(from), to: pointAt(to) });
        });
      }
    expect(count).toBe(15);
  });

  it("글은 마침표로 끝난다(설명·까닭·퀴즈 풀이)", () => {
    for (const lesson of JANGGI_LESSONS.slice(1))
      for (const step of lesson.steps) {
        const texts =
          step.kind === "explain"
            ? [...step.body, ...(step.scene?.notes ?? [])]
            : step.kind === "quiz"
              ? [step.explain]
              : [step.objective, step.success, step.fail];
        for (const text of texts)
          expect(/[.!?)]$/.test(text), `${lesson.id}: ${text}`).toBe(true);
      }
  });

  it("고리(rings·warn)는 판 위 자리 이름이다", () => {
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "mission" || !step.scene) continue;
        for (const name of [
          ...(step.scene.rings ?? []),
          ...(step.scene.warn ?? []),
        ])
          expect(() => pointAt(name)).not.toThrow();
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
