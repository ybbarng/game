import { createRng } from "@game/mighty-engine";
import { yutBotFor } from "@game/yut-ai";
import {
  type Action,
  createMatch,
  decodeYutRules,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
  type YutRules,
  type YutState,
} from "@game/yut-engine";
import { describe, expect, it } from "vitest";

// 옛 엔진(규칙 판 1, 몸짓 없음)으로 만든 판 기록
import legacy from "../../../../../packages/yut-engine/src/legacy-y1.fixture.json";
import { planFor, replayCue } from "./plan";

/** 컴퓨터끼리 두며 걸음마다 상태를 남긴다(다시 보기가 기록을 다시 둔 것과 같은 모양: 0번은 판을 만든 때) */
function playStates(rules: YutRules, seed: number, limit: number): YutState[] {
  let { state } = createMatch(rules, seed);
  const rng = createRng(seed + 1);
  const states = [state];
  const bot = yutBotFor(1);
  while (states.length < limit) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined) break;
    const result = step(state, seat, bot.decide(viewOf(state, seat), rng));
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    states.push(state);
  }
  return states;
}

/** 옛 기록을 처음부터 다시 둔 상태들 */
function legacyStates(): YutState[] {
  const decoded = decodeYutRules(legacy.rules);
  if (!decoded.ok) throw new Error(decoded.reason);
  let { state } = createMatch(decoded.rules, legacy.seed);
  const states = [state];
  for (const entry of legacy.log as { seat: number; action: Action }[]) {
    const result = step(state, entry.seat, entry.action);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    states.push(state);
  }
  return states;
}

const states = playStates(STANDARD_RULES, 7, 160);

/** 새 던지기 결과가 나온 걸음 번호들 */
function throwSteps(list: readonly YutState[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < list.length; i++) {
    const now = list[i]?.lastThrow;
    if (now && now.index !== list[i - 1]?.lastThrow?.index) out.push(i);
  }
  return out;
}

describe("다시 보기 멍석: 걸음 → 궤적", () => {
  const thrown = throwSteps(states).filter(
    (i) => states[i]?.lastThrow?.gesture && !states[i]?.lastThrow?.nak,
  );

  it("시험 판에 몸짓으로 던진 결과가 여럿 있다", () => {
    expect(thrown.length).toBeGreaterThanOrEqual(5);
  });

  it("한 걸음 앞으로 와서 던지기 결과가 나오면 대국 중 멍석과 같은 궤적을 굴린다", () => {
    for (const i of thrown) {
      for (const seat of [0, 1]) {
        const cue = replayCue(states, i - 1, i, seat);
        // 대국 중 멍석은 결과가 나온 화면(내 자리에서 본 것)으로 궤적을 고른다
        const view = viewOf(states[i] as YutState, seat);
        expect(cue).toEqual({
          index: i,
          plan: planFor(view, view.lastThrow),
          animate: true,
        });
      }
    }
  });

  it("궤적은 내 자리에서 본 던진 사람 쪽에서 날아온다(자리가 다르면 날아오는 쪽이 다르다)", () => {
    const i = thrown[0] as number;
    const mine = replayCue(states, i - 1, i, 0).plan;
    const theirs = replayCue(states, i - 1, i, 1).plan;
    expect(mine?.sticks[0]?.launch).not.toEqual(theirs?.sticks[0]?.launch);
  });

  it("건너뛰거나 뒤로 가면 굴리지 않고 그 걸음의 마지막 던지기로 멈춘 모습만 보인다", () => {
    for (const i of thrown) {
      const rest = replayCue(states, i - 1, i, 0).plan;
      // 그 걸음으로 건너뛰기(처음·끝 단추, 뒤로)
      expect(replayCue(states, i, i, 0)).toEqual({
        index: i,
        plan: rest,
        animate: false,
      });
      // 두 걸음 앞에서 한 걸음 뒤로
      expect(replayCue(states, i + 1, i, 0).animate).toBe(false);
      // 여러 걸음을 건너뛰어 앞으로
      expect(replayCue(states, Math.max(0, i - 3), i, 0).animate).toBe(false);
    }
  });

  it("던지기 결과가 나오지 않은 걸음(말 옮기기·공개)은 앞 결과를 멈춘 모습으로 둔다", () => {
    const first = thrown[0] as number;
    let checked = 0;
    for (let i = first + 1; i < states.length; i++) {
      if (thrown.includes(i)) continue;
      const cue = replayCue(states, i - 1, i, 0);
      expect(cue.animate).toBe(false);
      expect(cue.plan).toEqual(replayCue(states, i - 1, i - 1, 0).plan);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("다시 보기 멍석: 옛 기록(규칙 판 1)", () => {
  const old = legacyStates();

  it("옛 기록에도 던지기 결과가 있다", () => {
    expect(throwSteps(old).length).toBeGreaterThan(0);
  });

  it("몸짓이 없어 어느 걸음에서도 궤적이 없고 굴리지 않는다(2D 윷가락)", () => {
    for (let i = 1; i < old.length; i++)
      expect(replayCue(old, i - 1, i, 0)).toEqual({
        index: i,
        plan: null,
        animate: false,
      });
  });
});
