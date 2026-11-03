import { ManualClock } from "@game/fair-play";
import type { Action, GameEvent } from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { onecardKit } from "../kit";
import { ONECARD_LESSONS, type OnecardScene } from "./lessons";
import { createScriptBot, sceneState } from "./script";

/**
 * 화면이 미션을 여는 길(튜토리얼 화면 `startMission`)과 같은 대국 진행으로 미션을 둔다.
 * 장면 상태 + 대본 컴퓨터 + 외침 창 시계(`GameKit.timers`). 시간 끝(`timeout`)은 직접 넣지 않고
 * 시계를 그 창 길이만큼 감아 대국 기기가 넣게 한다
 */
function playMission(scene: OnecardScene, actions: readonly Action[]) {
  const clock = new ManualClock();
  const initialState = sceneState(scene);
  const match = new LocalMatch({
    kit: onecardKit,
    rules: initialState.rules,
    seed: 1,
    humanSeat: 0,
    bot: createScriptBot(scene),
    initialState,
    clock,
  });
  const events: GameEvent[] = [];
  for (const s of match.drain()) events.push(...s.events);
  match.subscribe((s) => events.push(...s.events));
  for (const action of actions) {
    if (action.type === "timeout") {
      const rules = initialState.rules;
      clock.advance(
        action.kind === "selfWindow" ? rules.selfWindowMs : rules.catchWindowMs,
      );
      continue;
    }
    const sent =
      action.type === "shout"
        ? { type: "shout" as const, seen: match.current().turnNo }
        : action;
    expect(match.submit(sent).ok).toBe(true);
  }
  return { view: match.current(), events, match };
}

const missions = ONECARD_LESSONS.flatMap((lesson) =>
  lesson.steps.flatMap((step) =>
    step.kind === "mission" && step.scenario
      ? [{ name: `${lesson.id}: ${step.title}`, step, scene: step.scenario }]
      : [],
  ),
);

describe("원카드 튜토리얼 미션 판(LocalMatch + 대본 컴퓨터 + 외침 창 시계)", () => {
  it.each(missions)("$name: 정답은 성공, 실수는 실패", ({ step, scene }) => {
    if (step.kind !== "mission") throw new Error("미션이 아니다");
    const good = playMission(scene, step.solution ?? []);
    expect(step.check(good)).toBe("success");
    if (step.mistake) {
      const bad = playMission(scene, step.mistake);
      expect(step.check(bad)).toBe("fail");
    }
  });

  it("잡기 미션: 컴퓨터가 한 장이 되고 본인 시간이 지나면 더미를 쳐 잡는다", () => {
    const step = missions.find(
      (m) => m.step.kind === "mission" && m.name.includes("잡기"),
    );
    if (!step) throw new Error("잡기 미션이 없다");
    const { view, events } = playMission(step.scene, [
      { type: "timeout", kind: "selfWindow", target: 1 },
      { type: "shout", seen: 0 },
    ]);
    expect(events.some((e) => e.type === "caught" && e.seat === 0)).toBe(true);
    // 잡힌 컴퓨터는 한 장 먹어 두 장
    expect(view.handCounts[1]).toBe(2);
  });
});
