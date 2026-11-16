import { describe, expect, it } from "vitest";

import { chainCommit, chainLink, derivedSeed, gestureThrow } from "./chain";
import {
  type DragPoint,
  derivedThrow,
  type Gesture,
  gestureFromDrag,
  isGesture,
  MIN_HEIGHT,
  nakPermille,
  STEADY_GESTURE,
  sealOf,
  tooLow,
} from "./gesture";
import legacy from "./legacy-y1.fixture.json";
import { createMatch, replay, step } from "./match";
import {
  decodeYutRules,
  encodeYutRules,
  STANDARD_RULES,
  type YutRules,
} from "./rules";
import { createYutScenario } from "./scenario";
import type { Action, YutState } from "./state";

const SALT = "5a".repeat(32);
const LINKS = ["11".repeat(32), "22".repeat(32)];

function must(state: YutState, seat: number, action: Action): YutState {
  const result = step(state, seat, action);
  if (!result.ok) throw new Error(`${result.error}: ${JSON.stringify(action)}`);
  return result.state;
}

/** 모든 자리가 재료로 만든 사슬 고리를 공개한다 */
function revealAll(state: YutState): YutState {
  let next = state;
  for (let s = 0; s < next.rules.players; s++) {
    const seed = derivedSeed(next.keys[s] as string, next.generation);
    const used = next.chains[s]?.used ?? 0;
    next = must(next, s, { type: "reveal", link: chainLink(seed, used + 1) });
  }
  return next;
}

/** 모두 약속해 첫 던지기 차례까지 */
function started(rules: YutRules = STANDARD_RULES, seed = 3): YutState {
  let { state } = createMatch(rules, seed);
  for (let s = 0; s < rules.players; s++)
    state = must(state, s, {
      type: "commit",
      hash: chainCommit(derivedSeed(state.keys[s] as string, 0)),
    });
  return state;
}

/** 던질 차례인 사람이 이 몸짓을 봉인해 던지고, 모두 공개한 뒤 연다 */
function throwWith(state: YutState, gesture: Gesture) {
  const thrower = state.turn;
  const thrown = must(state, thrower, {
    type: "throw",
    seal: sealOf(gesture, SALT),
  });
  const revealed = revealAll(thrown);
  const result = step(revealed, thrower, {
    type: "open",
    gesture,
    salt: SALT,
  });
  if (!result.ok) throw new Error(result.error);
  return { revealed, ...result };
}

/** 누른 점에서 `pull`만큼 아래로 당겼다가, 그 점에서 (dx, up)만큼 `steps`번에 나눠 `stepMs`마다 튕긴 길 */
function drag(
  pull: number,
  dx: number,
  up: number,
  steps = 3,
  stepMs = 10,
): DragPoint[] {
  const points: DragPoint[] = [
    { x: 100, y: 100, t: 0 },
    { x: 100, y: 100 + pull / 2, t: 100 },
    { x: 100, y: 100 + pull, t: 200 },
  ];
  for (let i = 1; i <= steps; i++)
    points.push({
      x: 100 + (dx * i) / steps,
      y: 100 + pull - (up * i) / steps,
      t: 200 + i * stepMs,
    });
  return points;
}

describe("몸짓 재기", () => {
  it("당긴 길이가 높이, 튕긴 방향이 방향, 튕긴 빠르기가 세기가 된다", () => {
    // 당김 끝까지 200px. 100px 당겨 곧장 위로 30px를 30ms에 튕긴다: 초당 5배 = 세기 42.
    expect(gestureFromDrag(drag(100, 0, 30), 200)).toEqual({
      height: 50,
      direction: 0,
      strength: 42,
    });
    // 오른쪽 45도로 같은 거리를 튕기면 방향 45.
    expect(gestureFromDrag(drag(100, 30, 30), 200)?.direction).toBe(45);
    expect(gestureFromDrag(drag(100, -30, 30), 200)?.direction).toBe(-45);
    // 같은 거리를 더 빠르게 튕기면 세기가 커진다. 점 사이는 적어도 8ms로 잰다(5ms여도 8ms로).
    expect(gestureFromDrag(drag(100, 0, 30, 3, 5), 200)?.strength).toBe(52);
    // 아주 빠르면 100에서 멈춘다.
    expect(gestureFromDrag(drag(100, 0, 600), 200)?.strength).toBe(100);
  });

  it("끝까지보다 더 당겨도 높이는 100이고, 옆으로 쓸어 놓으면 방향이 옆 끝 가까이다", () => {
    expect(gestureFromDrag(drag(500, 0, 30), 200)?.height).toBe(100);
    const side = gestureFromDrag(
      [
        { x: 100, y: 100, t: 0 },
        { x: 100, y: 150, t: 100 },
        { x: 160, y: 149, t: 120 },
      ],
      200,
    );
    expect(side?.direction).toBe(89);
  });

  it("가장 낮은 점에서 튕기지 않고 놓으면 던진 것이 아니고, 조금만 당기면 너무 낮다", () => {
    expect(gestureFromDrag(drag(100, 0, 0, 1), 200)).toBeNull();
    expect(gestureFromDrag([{ x: 0, y: 0, t: 0 }], 200)).toBeNull();
    const low = gestureFromDrag(drag(20, 0, 30), 200) as Gesture;
    expect(low.height).toBe(10);
    expect(tooLow(low)).toBe(true);
    expect(isGesture(low)).toBe(false);
    expect(tooLow({ ...low, height: MIN_HEIGHT })).toBe(false);
  });

  it("받은 몸짓 값은 정수·범위·모양을 본다", () => {
    expect(isGesture(STEADY_GESTURE)).toBe(true);
    expect(isGesture({ ...STEADY_GESTURE, height: 50.5 })).toBe(false);
    expect(isGesture({ ...STEADY_GESTURE, direction: 91 })).toBe(false);
    expect(isGesture({ ...STEADY_GESTURE, strength: -1 })).toBe(false);
    expect(isGesture({ ...STEADY_GESTURE, extra: 1 })).toBe(false);
    expect(isGesture(null)).toBe(false);
  });
});

describe("낙 확률", () => {
  const at = (patch: Partial<Gesture>) =>
    nakPermille({ ...STEADY_GESTURE, ...patch });

  it("가운데로 알맞게 던지면 0이고, 경계를 넘으면서 오른다", () => {
    expect(at({})).toBe(0);
    // 방향: 10도까지 0, 넘으면 (넘은 도)²/5
    expect(at({ direction: 10 })).toBe(0);
    expect(at({ direction: -12 })).toBe(0);
    expect(at({ direction: 13 })).toBe(1);
    expect(at({ direction: 30 })).toBe(80);
    expect(at({ direction: 60 })).toBe(500);
    // 세기: 70까지 0, 넘으면 (넘은 만큼)²/2
    expect(at({ strength: 70 })).toBe(0);
    expect(at({ strength: 72 })).toBe(2);
    expect(at({ strength: 100 })).toBe(450);
    // 높이: 80까지 0, 넘으면 살짝(넘은 만큼 × 2)
    expect(at({ height: 80 })).toBe(0);
    expect(at({ height: 100 })).toBe(40);
    // 함께 치우치면 더한다.
    expect(at({ direction: 30, strength: 80, height: 90 })).toBe(80 + 50 + 20);
  });

  it("옆으로 60도를 넘겨 쓸어 던지면 반드시 낙이다", () => {
    expect(at({ direction: 61 })).toBe(1000);
    expect(at({ direction: -90 })).toBe(1000);
  });
});

describe("결과 = 몸짓 + 모두의 값", () => {
  it("같은 번호·몸짓·고리면 늘 같은 결과다", () => {
    const a = gestureThrow(4, STEADY_GESTURE, LINKS, STANDARD_RULES);
    expect(gestureThrow(4, STEADY_GESTURE, LINKS, STANDARD_RULES)).toEqual(a);
    expect(a.nak).toBeNull();
  });

  it("고리가 같아도 몸짓이 다르면 결과가 달라진다(결과가 몸짓에 달렸다)", () => {
    const results = new Set<string>();
    for (let height = 20; height < 60; height++)
      results.add(
        JSON.stringify(
          gestureThrow(4, { ...STEADY_GESTURE, height }, LINKS, STANDARD_RULES)
            .sticks,
        ),
      );
    // 가락 넷의 앞뒷면은 16가지. 몸짓 40개로 여러 가지가 나온다.
    expect(results.size).toBeGreaterThan(8);
  });

  it("낙은 몸짓의 낙 확률대로 나온다(4000번, 표준편차 5배 안)", () => {
    const gesture: Gesture = { ...STEADY_GESTURE, direction: 49 }; // 304‰
    expect(nakPermille(gesture)).toBe(304);
    let naks = 0;
    const n = 4000;
    for (let i = 0; i < n; i++)
      if (gestureThrow(i, gesture, LINKS, STANDARD_RULES).nak === "chance")
        naks++;
    const p = 0.304;
    expect(Math.abs(naks - n * p)).toBeLessThan(5 * Math.sqrt(n * p * (1 - p)));
    // 가운데로 알맞게 던지면 한 번도 낙이 없다.
    for (let i = 0; i < 500; i++)
      expect(gestureThrow(i, STEADY_GESTURE, LINKS, STANDARD_RULES).nak).toBe(
        null,
      );
  });

  it("쓸어 던지면 고리와 상관없이 낙이고, 낙을 끈 방이면 낙이 없다", () => {
    const sweep: Gesture = { ...STEADY_GESTURE, direction: -75 };
    for (let i = 0; i < 50; i++)
      expect(gestureThrow(i, sweep, LINKS, STANDARD_RULES).nak).toBe("sweep");
    const off = { ...STANDARD_RULES, nak: false };
    for (let i = 0; i < 50; i++)
      expect(gestureThrow(i, sweep, LINKS, off).nak).toBeNull();
  });
});

describe("봉인 → 공개 → 열기", () => {
  it("연 몸짓으로 엔진이 정한 결과는 같은 고리로 다시 계산한 것과 같다", () => {
    const state = started();
    const { revealed, state: after, events } = throwWith(state, STEADY_GESTURE);
    const expected = gestureThrow(
      0,
      STEADY_GESTURE,
      revealed.reveals as string[],
      STANDARD_RULES,
    );
    expect(after.lastThrow?.sticks).toEqual(expected.sticks);
    expect(after.lastThrow?.gesture).toEqual(STEADY_GESTURE);
    expect(events.some((e) => e.type === "result")).toBe(true);
    expect(after.seal).toBeNull();
  });

  it("봉인과 다른 몸짓·소금, 규칙에 맞지 않는 몸짓, 다른 사람의 열기는 받지 않는다", () => {
    const state = started();
    const thrower = state.turn;
    const revealed = revealAll(
      must(state, thrower, {
        type: "throw",
        seal: sealOf(STEADY_GESTURE, SALT),
      }),
    );
    expect(revealed.phase).toBe("open");
    const open = (gesture: Gesture, salt = SALT, seat = thrower) =>
      step(revealed, seat, { type: "open", gesture, salt });
    expect(open({ ...STEADY_GESTURE, strength: 41 })).toEqual({
      ok: false,
      error: "봉인한 몸짓이 아니다",
    });
    expect(open(STEADY_GESTURE, "5b".repeat(32))).toEqual({
      ok: false,
      error: "봉인한 몸짓이 아니다",
    });
    expect(open({ ...STEADY_GESTURE, height: 5 })).toEqual({
      ok: false,
      error: "몸짓 값이 규칙에 맞지 않다",
    });
    expect(open(STEADY_GESTURE, SALT, 1 - thrower)).toEqual({
      ok: false,
      error: "던진 사람이 아니다",
    });
    // 고리가 모두 공개되기 전에는 열 수 없다.
    const early = must(state, thrower, {
      type: "throw",
      seal: sealOf(STEADY_GESTURE, SALT),
    });
    expect(
      step(early, thrower, {
        type: "open",
        gesture: STEADY_GESTURE,
        salt: SALT,
      }).ok,
    ).toBe(false);
  });

  it("열지 않으면(방장 시계) 그 던지기는 무효이고 차례가 넘어간다", () => {
    const state = started();
    const thrower = state.turn;
    const revealed = revealAll(
      must(state, thrower, {
        type: "throw",
        seal: sealOf(STEADY_GESTURE, SALT),
      }),
    );
    expect(step(revealed, thrower, { type: "unopened", index: 1 })).toEqual({
      ok: false,
      error: "기다리던 던지기가 아니다",
    });
    const result = step(revealed, thrower, { type: "unopened", index: 0 });
    if (!result.ok) throw new Error(result.error);
    expect(result.events).toContainEqual({
      type: "nak",
      seat: thrower,
      index: 0,
      reason: "unopened",
    });
    expect(result.state.turn).toBe(1 - thrower);
    expect(result.state.phase).toBe("throw");
    expect(result.state.lastThrow).toMatchObject({
      sticks: null,
      value: null,
      nak: "unopened",
    });
  });
});

describe("낙", () => {
  const sweep: Gesture = { ...STEADY_GESTURE, direction: 70 };

  it("일부러 낙(쓸어 던지기)이면 그 던지기는 무효, 차례가 넘어간다", () => {
    const state = started();
    const thrower = state.turn;
    const { state: after, events } = throwWith(state, sweep);
    expect(events).toContainEqual({
      type: "nak",
      seat: thrower,
      index: 0,
      reason: "sweep",
    });
    expect(after.turn).toBe(1 - thrower);
    expect(after.pending).toEqual([]);
    expect(after.throwCount).toBe(1);
    expect(after.lastThrow?.value).toBeNull();
  });

  it("윷 뒤의 한 번 더가 낙이어도 모아 둔 윷은 쓴다", () => {
    const scene = createYutScenario({
      pieces: [],
      pending: [4],
      throwsLeft: 1,
    });
    expect(scene.phase).toBe("throw");
    const { state: after } = throwWith(scene, sweep);
    expect(after.phase).toBe("move");
    expect(after.turn).toBe(0);
    expect(after.pending).toEqual([4]);
    expect(after.throwsLeft).toBe(0);
    const moved = must(after, 0, { type: "move", value: 4, from: -1 });
    expect(moved.turn).toBe(1);
  });

  it("낙을 끈 방은 쓸어 던져도 결과가 나온다", () => {
    const state = started({ ...STANDARD_RULES, nak: false });
    const { events } = throwWith(state, sweep);
    expect(events.some((e) => e.type === "nak")).toBe(false);
    expect(events.some((e) => e.type === "result")).toBe(true);
  });
});

describe("규칙 판 번호", () => {
  it("판 2는 y2- 문자열에 낙 글자(k·x)를 붙이고, 옛 y1- 문자열은 판 1로 읽는다", () => {
    expect(encodeYutRules({ ...STANDARD_RULES, nak: false })).toBe(
      "y2-2s4b6px",
    );
    expect(decodeYutRules("y2-2s4b6px")).toEqual({
      ok: true,
      rules: { ...STANDARD_RULES, nak: false },
    });
    const old = decodeYutRules("y1-2s4b6p");
    expect(old.ok && old.rules.version).toBeUndefined();
    expect(old.ok && encodeYutRules(old.rules)).toBe("y1-2s4b6p");
    expect(decodeYutRules("y2-2s4b6p").ok).toBe(false);
  });

  it("옛 기록(판 1, 2026-11-17 전 엔진으로 만든 판)은 그대로 다시 둔다", () => {
    const decoded = decodeYutRules(legacy.rules);
    if (!decoded.ok) throw new Error(decoded.reason);
    const again = replay(
      decoded.rules,
      legacy.seed,
      legacy.log as { seat: number; action: Action }[],
    );
    if (!again.ok) throw new Error(again.error);
    expect({
      throwCount: again.state.throwCount,
      result: again.state.result,
      lastThrow: again.state.lastThrow,
      pieces: again.state.pieces,
    }).toEqual(legacy.end);
    // 옛 기록에는 몸짓 단계가 없다(공개가 모이면 바로 결과).
    expect(again.state.seal).toBeUndefined();
  });

  it("판 1은 봉인 없이 던지고 공개가 모이면 바로 결과가 나온다", () => {
    const { version: _v, nak: _n, ...v1 } = STANDARD_RULES;
    const state = started(v1);
    const revealed = revealAll(must(state, state.turn, { type: "throw" }));
    expect(revealed.phase).not.toBe("open");
    expect(revealed.throwCount).toBe(1);
  });
});

describe("컴퓨터 몸짓", () => {
  it("재료와 던지기 번호로 정해지고, 봉인이 맞는다", () => {
    const a = derivedThrow("ab".repeat(32), 3);
    expect(derivedThrow("ab".repeat(32), 3)).toEqual(a);
    expect(derivedThrow("ab".repeat(32), 4)).not.toEqual(a);
    expect(isGesture(a.gesture)).toBe(true);
    expect(sealOf(a.gesture, a.salt)).toBe(a.seal);
  });
});
