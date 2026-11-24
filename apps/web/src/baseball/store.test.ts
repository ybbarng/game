// @vitest-environment jsdom

import { STANDARD_RULES, score } from "@game/baseball-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadBaseball, useBaseball } from "./store";

const MY_SECRET = "123";
/** 내가 차례로 물을 수(모두 규칙에 맞는 서로 다른 세 숫자) */
const GUESSES = ["456", "789", "147", "258", "369", "159"];

/** 내 차례면 하나 한다(비밀 정하기·묻기). 한 것이 있으면 true */
function actOnce(asked: { n: number }): boolean {
  const s = useBaseball.getState();
  const d = s.view?.decision;
  if (!d || s.queue.length > 0) return false;
  if (d.kind === "commit") return s.chooseSecret(MY_SECRET).ok;
  if (d.kind === "guess") {
    const guess = GUESSES[asked.n % GUESSES.length] ?? "456";
    asked.n += 1;
    return s.submit({ type: "guess", guess }).ok;
  }
  return false;
}

/** 내가 `times`번 물을 때까지(그 사이 컴퓨터가 묻는 것은 내 기기가 답한다) 진행한다 */
function playUntilAsked(times: number): void {
  const asked = { n: 0 };
  for (let i = 0; i < 200 && asked.n < times; i++) {
    vi.runOnlyPendingTimers();
    actOnce(asked);
  }
  vi.runOnlyPendingTimers();
}

describe("숫자야구 저장소(공장 + 비밀 확장)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    useBaseball.getState().leave();
    vi.useRealTimers();
  });

  it("비밀은 약속만 내고, 컴퓨터가 물으면 내 기기가 내 비밀로 세어 답한다", () => {
    useBaseball
      .getState()
      .newGame({ rules: STANDARD_RULES, level: 0, seed: 5 });
    playUntilAsked(3);
    const log = useBaseball.getState().local?.save().log ?? [];
    const commit = log.find((e) => e.seat === 0 && e.action.type === "commit");
    expect(commit?.action).not.toHaveProperty("secret");
    // 컴퓨터가 물은 수마다 내 답은 내 비밀로 센 값과 같다
    const answers = log.flatMap((e, i) => {
      const prev = log[i - 1];
      return e.seat === 0 &&
        e.action.type === "answer" &&
        prev?.action.type === "guess"
        ? [{ guess: prev.action.guess, answer: e.action }]
        : [];
    });
    expect(answers.length).toBeGreaterThan(0);
    for (const { guess, answer } of answers) {
      const expected = score(MY_SECRET, guess);
      expect([answer.strikes, answer.balls]).toEqual([
        expected.strikes,
        expected.balls,
      ]);
    }
  });

  it("이어하기 저장본에 비밀을 싣고, 이어하면 그 비밀로 계속 답한다", () => {
    useBaseball
      .getState()
      .newGame({ rules: STANDARD_RULES, level: 0, seed: 5 });
    playUntilAsked(1);
    const saved = loadBaseball();
    expect(saved?.secrets[1]?.secret).toBe(MY_SECRET);
    const logLength = saved?.log.length ?? 0;

    useBaseball.getState().leave();
    expect(useBaseball.getState().secrets).toEqual({});
    if (!saved) throw new Error("저장본이 없어요.");
    useBaseball.getState().resume(saved);
    expect(useBaseball.getState().secrets).toEqual(saved.secrets);
    expect(useBaseball.getState().local?.save().log.length).toBe(logLength);

    // 이어한 뒤에도 컴퓨터 물음에 내 기기가 답한다
    playUntilAsked(2);
    const log = useBaseball.getState().local?.save().log ?? [];
    expect(
      log
        .slice(logLength)
        .some((e) => e.seat === 0 && e.action.type === "answer"),
    ).toBe(true);
  });

  it("무르면 내 마지막 물음까지 되돌리고 비밀은 그대로 둔다", () => {
    useBaseball
      .getState()
      .newGame({ rules: STANDARD_RULES, level: 0, seed: 5 });
    playUntilAsked(2);
    // 무르기는 내가 물을 차례에만 된다
    for (
      let i = 0;
      i < 50 && useBaseball.getState().view?.decision?.kind !== "guess";
      i++
    )
      vi.runOnlyPendingTimers();
    const s = useBaseball.getState();
    const before = s.local?.save().log ?? [];
    const lastGuess = before.findLastIndex(
      (e) => e.seat === 0 && e.action.type === "guess",
    );
    expect(s.canUndo()).toBe(true);
    expect(s.undo()).toBe(true);
    const after = useBaseball.getState();
    expect(after.local?.save().log.length).toBe(lastGuess);
    expect(after.secrets[1]?.secret).toBe(MY_SECRET);
    expect(loadBaseball()?.secrets[1]?.secret).toBe(MY_SECRET);
  });

  it("연습 대국(미션)은 이어하기를 덮어쓰지 않는다", () => {
    useBaseball
      .getState()
      .newGame({ rules: STANDARD_RULES, level: 0, seed: 5 });
    playUntilAsked(1);
    const saved = JSON.stringify(loadBaseball());
    useBaseball.getState().startPractice(null, { rules: STANDARD_RULES });
    playUntilAsked(1);
    expect(useBaseball.getState().practice).toBe(true);
    expect(useBaseball.getState().canUndo()).toBe(false);
    expect(JSON.stringify(loadBaseball())).toBe(saved);
  });
});
