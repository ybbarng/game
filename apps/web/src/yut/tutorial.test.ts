// @vitest-environment node
import { yutBeginnerBot } from "@game/yut-ai";
import {
  type Action,
  chainLink,
  createYutScenario,
  derivedSeed,
  type GameEvent,
  type Gesture,
  nakPermille,
  STEADY_GESTURE,
  sealOf,
  sideOf,
  viewOf,
} from "@game/yut-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { yutKit } from "./kit";
import {
  YUT_LESSONS,
  YUT_TUTORIAL_RULES,
  type YutLesson,
  type YutScene,
} from "./tutorial";

type Mission = Extract<YutLesson["steps"][number], { kind: "mission" }>;

const sceneState = (scene: YutScene) =>
  createYutScenario({
    rules: YUT_TUTORIAL_RULES,
    pieces: scene.pieces,
    ...(scene.pending ? { pending: scene.pending } : {}),
    ...(scene.throwsLeft !== undefined ? { throwsLeft: scene.throwsLeft } : {}),
  });

function runMission(mission: Mission, actions: Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: yutKit,
    rules: YUT_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: yutBeginnerBot,
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

/** 말 옮기기 미션(정답·실수 수가 있다). 던지기 미션과 실전은 따로 본다 */
const missions = YUT_LESSONS.flatMap((l) =>
  l.steps
    .filter(
      (s): s is Mission =>
        s.kind === "mission" && s.scenario !== null && s.solution !== undefined,
    )
    .map((m) => [m.title, m] as const),
);

/**
 * 던지기 미션을 실제 엔진으로 돌린다: 이 몸짓을 봉인해 던지고, 내 고리 공개와 몸짓 열기는
 * 화면처럼 내 기기가 낸다(store의 autoAct와 같은 일). 내 던지기가 결과·낙으로 정해지면 멈춘다
 */
function runToss(mission: Mission, gesture: Gesture) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const match = new LocalMatch({
    kit: yutKit,
    rules: YUT_TUTORIAL_RULES,
    seed: 1,
    humanSeat: 0,
    bot: yutBeginnerBot,
    initialState: sceneState(mission.scenario),
  });
  const events: GameEvent[] = [];
  match.subscribe((s) => events.push(...s.events));
  const before = mission.check({ view: match.current(), events: [] });
  const salt = "ab".repeat(32);
  const submit = (action: Action) => {
    const result = match.submit(action);
    if (!result.ok) throw new Error(`${mission.title}: ${result.error}`);
  };
  submit({ type: "throw", seal: sealOf(gesture, salt) });
  for (let i = 0; i < 4; i++) {
    const view = match.current();
    const kind = view.decision?.kind;
    if (kind === "reveal") {
      const seed = derivedSeed(view.botKey, view.generation);
      const used = view.chains[view.mySeat]?.used ?? 0;
      submit({ type: "reveal", link: chainLink(seed, used + 1) });
    } else if (kind === "open") submit({ type: "open", gesture, salt });
    else break;
  }
  return { before, after: mission.check({ view: match.current(), events }) };
}

describe("윷놀이 튜토리얼 미션", () => {
  it("말 옮기기 미션이 다섯이다(던지기 미션과 실전은 따로)", () => {
    expect(missions.map(([title]) => title)).toEqual([
      "새 말 내보내기",
      "방에 서기",
      "말 둘 잡기",
      "업기",
      "말 나기",
    ]);
  });

  describe("멍석 안에 던지기", () => {
    const toss = YUT_LESSONS.find((l) => l.id === "fair")?.steps.find(
      (s): s is Mission => s.kind === "mission",
    );
    if (!toss) throw new Error("던지기 미션이 없다");

    it("곧장 위로 알맞게 던지면(낙 확률 0) 성공", () => {
      expect(nakPermille(STEADY_GESTURE)).toBe(0);
      expect(runToss(toss, STEADY_GESTURE)).toEqual({
        before: null,
        after: "success",
      });
    });

    it("옆으로 쓸어 던지면 반드시 낙이라 실패", () => {
      expect(
        runToss(toss, { height: 50, direction: 75, strength: 40 }).after,
      ).toBe("fail");
    });

    it("몸짓을 열지 않아 없던 일이 되어도 실패", () => {
      const view = viewOf(sceneState({ pieces: [] }), 0);
      expect(
        toss.check({
          view,
          events: [{ type: "nak", seat: 0, index: 0, reason: "unopened" }],
        }),
      ).toBe("fail");
    });

    it("상대의 던지기 결과로는 정해지지 않는다", () => {
      const view = viewOf(sceneState({ pieces: [] }), 0);
      expect(
        toss.check({
          view,
          events: [
            {
              type: "result",
              seat: 1,
              index: 0,
              sticks: [true, true, false, false],
              value: 2,
              bonus: false,
            },
          ],
        }),
      ).toBeNull();
    });
  });

  it.each(missions)("%s: 정답이면 성공, 실수면 실패", (_title, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    const solved = runMission(mission, mission.solution ?? []);
    expect(solved.before).toBeNull();
    expect(solved.after).toBe("success");
    expect(runMission(mission, mission.mistake ?? []).after).toBe("fail");
  });

  it("실전 미션: 내 편이 말을 모두 내면 성공, 상대가 먼저 내면 실패", () => {
    const real = YUT_LESSONS.find((l) => l.id === "real")?.steps.find(
      (s): s is Mission => s.kind === "mission",
    );
    if (!real) throw new Error("실전 미션이 없다");
    const view = viewOf(sceneState({ pieces: [] }), 0);
    const mine = sideOf(view.rules, 0);
    expect(
      real.check({
        view,
        events: [{ type: "gameEnded", result: { kind: "finish", side: mine } }],
      }),
    ).toBe("success");
    expect(
      real.check({
        view,
        events: [
          { type: "gameEnded", result: { kind: "finish", side: 1 - mine } },
        ],
      }),
    ).toBe("fail");
    expect(real.check({ view, events: [] })).toBeNull();
  });
});

describe("윷놀이 튜토리얼 장면", () => {
  it("모든 장면을 만들 수 있고, 미션 장면은 내 차례다(던지기 미션은 던질 차례)", () => {
    for (const lesson of YUT_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const state = sceneState(scene);
        if (step.kind === "mission")
          expect(viewOf(state, 0).decision?.kind).toBe(
            step.solution ? "move" : "throw",
          );
      }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of YUT_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });
});
