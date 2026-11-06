// @vitest-environment node
import { janggiBeginnerBot } from "@game/janggi-ai";
import {
  type Action,
  applyMove,
  createJanggiScenario,
  createMatch,
  type GameEvent,
  kingsFacing,
  legalMoves,
  pointAt,
  viewOf,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { janggiKit } from "./kit";
import {
  JANGGI_LESSONS,
  JANGGI_TUTORIAL_RULES,
  type JanggiLesson,
  type JanggiScene,
} from "./tutorial";

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
      }
  });

  it("점을 찍는 기물(show)은 그 자리에 있는 내 기물이다", () => {
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "mission" || !step.scene?.show) continue;
        const cell = sceneState(step.scene).board[pointAt(step.scene.show)];
        expect(cell?.startsWith("c")).toBe(true);
      }
  });

  it("넘겨 보는 수순(replay)은 초부터 번갈아 모두 둘 수 있는 수다", () => {
    let count = 0;
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "mission" || !step.scene?.replay) continue;
        count++;
        let board = sceneState(step.scene).board;
        step.scene.replay.forEach((text, i) => {
          const [from = "", to = ""] = text.split("-");
          const legal = legalMoves(board, i % 2 === 0 ? "c" : "h").some(
            (m) => m.from === pointAt(from) && m.to === pointAt(to),
          );
          expect(legal, `${lesson.id} ${i + 1}째 수 ${text}`).toBe(true);
          board = applyMove(board, { from: pointAt(from), to: pointAt(to) });
        });
      }
    expect(count).toBe(2);
  });

  it("고리(mark·warn)는 판 위 자리 이름이다", () => {
    for (const lesson of JANGGI_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "mission" || !step.scene) continue;
        for (const name of [
          ...(step.scene.mark ?? []),
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
