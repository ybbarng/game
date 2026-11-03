import {
  type Action,
  judgeShout,
  legalActions,
  shoutWindows,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import {
  BANKRUPT_SCENE,
  CALL_SCENE,
  CATCH_SCENE,
  COUNTER_SCENE,
  FINISH_SCENE,
  FOLLOW_SCENE,
  JACK_SCENE,
  NO_MOVE_SCENE,
  ONECARD_LESSONS,
  type OnecardLesson,
  SEVEN_SCENE,
} from "./lessons";
import {
  createScriptBot,
  type OnecardScene,
  runScene,
  sceneMoves,
  sceneState,
} from "./script";

type Mission = Extract<OnecardLesson["steps"][number], { kind: "mission" }>;

const missions = ONECARD_LESSONS.flatMap((l) =>
  l.steps
    .filter((s): s is Mission => s.kind === "mission" && s.scenario !== null)
    .map((m) => [m.title, m] as const),
);

function judge(mission: Mission, actions: readonly Action[]) {
  if (!mission.scenario) throw new Error("장면이 없는 미션");
  const run = runScene(mission.scenario, actions);
  const view = { mySeat: 0 } as Parameters<Mission["check"]>[0]["view"];
  return { run, status: mission.check({ view, events: run.events }) };
}

const plays = (scene: OnecardScene) =>
  sceneMoves(scene).flatMap((a) => (a.type === "play" ? [a.card] : []));

describe("원카드 튜토리얼 단원", () => {
  it("기본 → 특수 카드 → 공격 → 외치기 → 끝 순서이고 마지막은 실전 한 판", () => {
    expect(ONECARD_LESSONS.map((l) => l.id)).toEqual([
      "basic",
      "special",
      "attack",
      "shout",
      "end",
    ]);
    expect(missions).toHaveLength(7);
    const last = ONECARD_LESSONS.at(-1)?.steps.at(-1);
    expect(last?.kind === "mission" && last.scenario).toBeNull();
  });

  it.each(missions)("%s: 대본대로 두면 성공, 실수면 실패", (_t, mission) => {
    expect(mission.solution && mission.mistake).toBeTruthy();
    // 시작(컴퓨터가 대본 첫 수를 둔 뒤)에는 아직 결과가 없다
    expect(judge(mission, []).status).toBeNull();
    const solved = judge(mission, mission.solution ?? []);
    expect(solved.run.rejected).toBeNull();
    expect(solved.status).toBe("success");
    const missed = judge(mission, mission.mistake ?? []);
    expect(missed.run.rejected).toBeNull();
    expect(missed.status).toBe("fail");
  });

  it("시킨 첫 차례 행동은 엔진이 낼 수 있다고 본 것이다", () => {
    for (const [, mission] of missions) {
      const scene = mission.scenario as OnecardScene;
      const first = [...(mission.solution ?? []), ...(mission.mistake ?? [])];
      const moves = legalActions(runScene(scene, []).state, 0);
      for (const action of first.filter(
        (a) => a.type === "play" || a.type === "draw",
      ))
        expect(moves).toContainEqual(action);
    }
  });

  it("퀴즈 정답 번호가 보기 안에 있다", () => {
    for (const lesson of ONECARD_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind !== "quiz") continue;
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
  });

  it("모든 장면을 만들 수 있고 카드가 겹치지 않는다", () => {
    for (const lesson of ONECARD_LESSONS)
      for (const step of lesson.steps) {
        const scene =
          step.kind === "mission" ? step.scenario : (step.scene ?? null);
        if (!scene) continue;
        const state = sceneState(scene);
        const all = [...state.hands.flat(), ...state.pile, ...state.deck];
        expect(new Set(all).size).toBe(all.length);
      }
  });
});

describe("단원 장면이 엔진 규칙과 맞다", () => {
  it("기본: ♥5 위에는 ♠5·♥9만 낼 수 있고, 낼 게 없으면 먹기뿐이다", () => {
    expect(plays(FOLLOW_SCENE)).toEqual(["S5", "H9"]);
    expect(
      runScene(FOLLOW_SCENE, [{ type: "play", card: "C8" }]).rejected,
    ).not.toBeNull();
    expect(sceneMoves(NO_MOVE_SCENE)).toEqual([{ type: "draw" }]);
  });

  it("7: 무늬를 골라 낸다. 고르지 않으면 받지 않는다", () => {
    expect(plays(SEVEN_SCENE)).toEqual(["S7", "S7", "S7", "S7"]);
    expect(
      runScene(SEVEN_SCENE, [{ type: "play", card: "S7" }]).rejected,
    ).not.toBeNull();
    const { state } = runScene(SEVEN_SCENE, [
      { type: "play", card: "S7", suit: "H" },
    ]);
    // 컴퓨터는 ♥가 없어 먹었다
    expect(state.hands[1]).toHaveLength(6);
    expect(state.suit).toBe("H");
  });

  it("J: 한 장 남은 1번을 건너뛰고 2번이 낸다", () => {
    const { events } = runScene(JACK_SCENE, [{ type: "play", card: "DJ" }]);
    const played = events.flatMap((e) => (e.type === "played" ? [e.seat] : []));
    expect(played).toEqual([0, 2]);
  });

  it("공격: 2 위에 아무 2·같은 무늬 A만, 받아치면 쌓이고 먹으면 쌓인 만큼", () => {
    expect(plays(COUNTER_SCENE)).toEqual(["S2", "HA"]);
    for (const card of ["C5", "CK"] as const)
      expect(
        runScene(COUNTER_SCENE, [{ type: "play", card }]).rejected,
      ).not.toBeNull();
    const countered = runScene(COUNTER_SCENE, [{ type: "play", card: "S2" }]);
    expect(
      countered.events.find((e) => e.type === "drew" && e.seat === 1),
    ).toMatchObject({ count: 4, reason: "attack" });
    const drew = runScene(COUNTER_SCENE, [{ type: "draw" }]);
    expect(drew.state.hands[0]).toHaveLength(7);
  });

  it("마지막 카드: ♥5를 먼저 내면 ♥A로 끝낼 수 없다", () => {
    const { state } = runScene(FINISH_SCENE, [{ type: "play", card: "H5" }]);
    expect(state.hands[0]).toEqual(["HA"]);
    expect(legalActions(state, 0)).toEqual([{ type: "draw" }]);
  });

  it("잡기: 1초 안에 치면 적어 두고, 1초가 지나면 잡기, 창이 닫힌 뒤면 늦음", () => {
    const started = runScene(CATCH_SCENE, []).state;
    expect(started.turnNo).toBe(1);
    expect(judgeShout(started, 0, 1)).toEqual({ kind: "hold", targets: [1] });
    // 1초 안에 쳐도 컴퓨터가 끝내 안 외치면 1초가 지날 때 잡힌다
    const held = runScene(CATCH_SCENE, [
      { type: "shout", seen: 1 },
      { type: "timeout", kind: "selfWindow", target: 1 },
    ]);
    expect(held.events).toContainEqual({ type: "caught", seat: 0, target: 1 });
    expect(held.state.hands[1]).toHaveLength(2);
    // 잡기 창(배우기 5초)까지 지나면 벌칙 없이 아무 일 없다
    const late = runScene(CATCH_SCENE, [
      { type: "timeout", kind: "selfWindow", target: 1 },
      { type: "timeout", kind: "catchWindow", target: 1 },
      { type: "shout", seen: 1 },
    ]);
    expect(late.events.some((e) => e.type === "caught")).toBe(false);
    expect(late.events.some((e) => e.type === "falseShout")).toBe(false);
    // 컴퓨터가 내기 전에는 잡을 사람이 없다
    expect(judgeShout(sceneState(CATCH_SCENE), 0, 0)).toEqual({
      kind: "false",
    });
  });

  it("헛외침: 아무도 한 장이 아닐 때 치면 내가 1장 먹는다", () => {
    const state = sceneState(FOLLOW_SCENE);
    expect(judgeShout(state, 0, 0)).toEqual({ kind: "false" });
    const { events } = runScene(FOLLOW_SCENE, [{ type: "shout", seen: 0 }]);
    expect(events).toContainEqual({
      type: "drew",
      seat: 0,
      count: 1,
      reason: "falseShout",
    });
  });

  it("외치기: 두 장일 때 치면 미리 외침, 내고 나면 잡을 창이 없다", () => {
    expect(judgeShout(sceneState(CALL_SCENE), 0, 0)).toEqual({ kind: "pre" });
    const called = runScene(CALL_SCENE, [
      { type: "shout", seen: 0 },
      { type: "play", card: "H5" },
    ]);
    expect(called.state.called[0]).toBe(true);
    expect(shoutWindows(called.state)).toEqual([]);
    const forgot = runScene(CALL_SCENE, [{ type: "play", card: "H5" }]);
    expect(shoutWindows(forgot.state).map((w) => w.seat)).toEqual([0]);
    // 두 번 치면 두 번째는 헛외침이라 실패
    const mission = missions.find(([t]) => t === "원카드 외치기")?.[1];
    if (!mission) throw new Error("외치기 미션이 없다");
    const twice = judge(mission, [
      { type: "shout", seen: 0 },
      { type: "shout", seen: 0 },
      { type: "play", card: "H5" },
    ]);
    expect(twice.status).toBe("fail");
  });

  it("파산: 먹으면 다시 섞은 뒤 20장이 되어 파산, 받아치면 컴퓨터가 6장", () => {
    expect(plays(BANKRUPT_SCENE)).toEqual(["CA"]);
    const drew = runScene(BANKRUPT_SCENE, [{ type: "draw" }]);
    const types = drew.events.map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(["reshuffleNeeded", "reshuffled", "bankrupt"]),
    );
    expect(drew.state.bankruptCounts[0]).toBe(20);
    expect(drew.state.result?.ranks).toEqual([2, 1]);
    const dodged = runScene(BANKRUPT_SCENE, [{ type: "play", card: "CA" }]);
    expect(dodged.state.hands[0]).toHaveLength(16);
    expect(dodged.state.hands[1]).toHaveLength(11);
  });
});

describe("대본 컴퓨터", () => {
  it("대본 줄을 차례로 쓰고, 할 수 없는 줄이면 낼 수 있는 첫 카드를 낸다", () => {
    const scene: OnecardScene = {
      hands: [["S3"], ["H4", "H6", "C9"]],
      pile: ["H5"],
      turn: 1,
      script: {
        1: [{ type: "shout" }, { type: "play", card: "C9" }],
      },
    };
    const bot = createScriptBot(scene);
    const view = {
      mySeat: 1,
      turnNo: 3,
      moves: [{ type: "play", card: "H4" }, { type: "draw" }],
    } as unknown as Parameters<typeof bot.decide>[0];
    expect(bot.decide(view)).toEqual({ type: "shout", seen: 3 });
    expect(bot.decide(view)).toEqual({ type: "play", card: "H4" });
    expect(bot.decide(view)).toEqual({ type: "play", card: "H4" });
  });
});
