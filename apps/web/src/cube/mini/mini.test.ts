import {
  applyMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import type { SolveRecord } from "../records";
import { SolveSession } from "../solve-session";
import { parseFromApp } from "./app-bridge";
import { FocusClock } from "./focus-clock";
import { IdleShow, type IdleTiming, jigglePlan, playMoves } from "./idle";
import {
  addMiniRecord,
  inputSourceOf,
  loadMiniPrefs,
  loadMiniRecords,
  MINI_KEY,
  saveMiniPrefs,
  summarize,
} from "./store";

/** 미니 모드(docs/47 14절)의 시계·떠 있을 때 움직임·저장·앱 다리 */

describe("앱 다리", () => {
  it("앱이 보내는 꼴만 받고 모르는 꼴은 버린다", () => {
    expect(parseFromApp({ type: "focus", focused: true })).toEqual({
      type: "focus",
      focused: true,
    });
    expect(parseFromApp({ type: "mirror" })).toEqual({ type: "mirror" });
    expect(parseFromApp({ type: "size", n: 4 })).toEqual({
      type: "size",
      n: 4,
    });
    expect(parseFromApp({ type: "key", source: "synthetic" })).toEqual({
      type: "key",
      source: "synthetic",
    });
    expect(parseFromApp({ type: "key", source: "robot" })).toBeNull();
    expect(parseFromApp({ type: "focus" })).toBeNull();
    expect(parseFromApp({ type: "erase" })).toBeNull();
    expect(parseFromApp("scramble")).toBeNull();
  });
});

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

/** 결정적인 [0,1) 수 */
function seq(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe("FocusClock", () => {
  it("포커스가 있는 동안만 흐르고 다시 받으면 이어 간다", () => {
    const base = new ManualClock();
    const c = new FocusClock(base, false);
    base.advance(5000);
    expect(c.now()).toBe(0);
    c.setFocused(true);
    base.advance(1200);
    expect(c.now()).toBe(1200);
    c.setFocused(false);
    base.advance(60_000);
    expect(c.now()).toBe(1200);
    c.setFocused(true);
    base.advance(300);
    expect(c.now()).toBe(1500);
    // 같은 값을 거듭 넣어도 흐름이 끊기지 않는다
    c.setFocused(true);
    base.advance(100);
    expect(c.now()).toBe(1600);
  });

  it("세션 시간: 섞은 뒤 첫 수부터 맞출 때까지, 포커스 없는 동안은 빼고 잰다", () => {
    const base = new ManualClock();
    const clock = new FocusClock(base, true);
    const records: SolveRecord[] = [];
    const s = new SolveSession({
      n: 3,
      mode: "solo",
      inspection: false,
      clock,
      onRecord: (r) => records.push(r),
    });
    s.start("R U");
    expect(s.phase).toBe("ready");
    base.advance(4000); // 첫 수 전에 살펴본 시간은 재지 않는다
    const [u, r] = parseMoves(3, "U' R'");
    s.input(u as never, "U'");
    base.advance(1000);
    clock.setFocused(false);
    base.advance(90_000); // 다른 앱에 가 있던 시간
    clock.setFocused(true);
    base.advance(500);
    s.input(r as never, "R'");
    expect(s.phase).toBe("done");
    expect(records[0]?.ms).toBe(1500);
    expect(records[0]?.moves).toBe(2);
  });
});

describe("jigglePlan", () => {
  it("조금 섞고 되돌리면 처음 상태와 같다(사용자의 진행을 바꾸지 않는다)", () => {
    for (const n of [2, 3, 4, 5, 6, 7]) {
      const start = applyMoves(
        n,
        solvedCube(n),
        parseMoves(n, "R U F' D2 L B"),
      );
      for (let seed = 1; seed <= 20; seed++) {
        const plan = jigglePlan(n, seq(seed), 4);
        expect(plan).toHaveLength(8);
        expect(applyMoves(n, start, plan)).toEqual(start);
        // 가운데쯤(되돌리기 전)은 처음과 다르다
        expect(applyMoves(n, start, plan.slice(0, 4))).not.toEqual(start);
      }
    }
  });
});

describe("playMoves", () => {
  it("간격마다 하나씩 두고, 끄면 그 뒤로 두지 않는다", () => {
    const clock = new ManualClock();
    const moves = parseMoves(3, "R U R' U'");
    const seen: unknown[] = [];
    let done = 0;
    playMoves(
      clock,
      moves,
      500,
      (m) => seen.push(m),
      () => done++,
    );
    clock.advance(0);
    expect(seen).toHaveLength(1);
    clock.advance(1500);
    expect(seen).toHaveLength(4);
    expect(done).toBe(0);
    clock.advance(500);
    expect(done).toBe(1);

    const seen2: unknown[] = [];
    const off = playMoves(
      clock,
      moves,
      500,
      (m) => seen2.push(m),
      () => done++,
    );
    clock.advance(600);
    off();
    clock.advance(10_000);
    expect(seen2).toHaveLength(2);
    expect(done).toBe(1);
  });
});

describe("IdleShow", () => {
  const T: IdleTiming = {
    firstMs: 1000,
    heroEveryMs: 10_000,
    jiggleEveryMs: 5000,
    jiggleStepMs: 100,
    jiggleMoves: 4,
  };

  function setup(solved: boolean, heroOk = true) {
    const clock = new ManualClock();
    const log: string[] = [];
    let state = solved;
    const show = new IdleShow(
      clock,
      {
        solved: () => state,
        hero: (done) => {
          if (!heroOk) return null;
          log.push("hero");
          const off = clock.after(3000, () => {
            log.push("hero-end");
            done();
          });
          return () => {
            log.push("hero-stop");
            off();
          };
        },
        jiggle: (done) => {
          log.push("jiggle");
          const off = clock.after(800, () => {
            log.push("jiggle-end");
            done();
          });
          return () => {
            log.push("jiggle-stop");
            off();
          };
        },
        restore: () => log.push("restore"),
      },
      T,
    );
    return {
      clock,
      log,
      show,
      setSolved: (v: boolean) => {
        state = v;
      },
    };
  }

  it("맞춘 큐브: 쉬기 시작하고 잠시 뒤 연출, 끝나면 되돌리고 다음 간격을 건다", () => {
    const { clock, log, show } = setup(true);
    show.setActive(true);
    clock.advance(999);
    expect(log).toEqual([]);
    clock.advance(1);
    expect(show.showing).toBe("hero");
    clock.advance(3000);
    expect(log).toEqual(["hero", "hero-end", "restore"]);
    expect(show.showing).toBeNull();
    clock.advance(9999);
    expect(log.filter((x) => x === "hero")).toHaveLength(1);
    clock.advance(1);
    expect(log.filter((x) => x === "hero")).toHaveLength(2);
  });

  it("섞인 큐브: 조금 섞기를 jiggle 간격으로 되풀이한다", () => {
    const { clock, log, show } = setup(false);
    show.setActive(true);
    clock.advance(1000 + 800);
    expect(log).toEqual(["jiggle", "jiggle-end", "restore"]);
    clock.advance(5000);
    expect(log.filter((x) => x === "jiggle")).toHaveLength(2);
  });

  it("움직이는 중에 포커스를 받으면 바로 멈추고 되돌린 뒤 쉰다", () => {
    const { clock, log, show } = setup(false);
    show.setActive(true);
    clock.advance(1300);
    expect(show.showing).toBe("jiggle");
    show.setActive(false);
    expect(log).toEqual(["jiggle", "jiggle-stop", "restore"]);
    expect(show.showing).toBeNull();
    expect(show.armed).toBe(false);
    clock.advance(60_000);
    expect(log).toHaveLength(3);
  });

  it("연출을 못 하는 크기는 맞춘 큐브에서도 조금 섞기", () => {
    const { clock, log, show } = setup(true, false);
    show.setActive(true);
    clock.advance(1000);
    expect(log).toEqual(["jiggle"]);
  });

  it("멈추기 전에 포커스를 받으면 아무것도 하지 않는다", () => {
    const { clock, log, show } = setup(true);
    show.setActive(true);
    clock.advance(500);
    show.setActive(false);
    clock.advance(60_000);
    expect(log).toEqual([]);
  });
});

describe("미니 모드 저장", () => {
  const rec = (n: number, ms: number | null): SolveRecord => ({
    at: 1,
    n,
    mode: "solo",
    ms,
    penalty: 0,
    moves: 40,
    scramble: "R",
  });

  it("크기·거울을 남기고 깨진 값은 기본값으로 읽는다", () => {
    const st = memoryStorage();
    expect(loadMiniPrefs(st)).toEqual({ n: 3, mirror: true });
    saveMiniPrefs({ n: 5, mirror: false }, st);
    expect(loadMiniPrefs(st)).toEqual({ n: 5, mirror: false });
    st.setItem(MINI_KEY, JSON.stringify({ n: 9, mirror: "yes" }));
    expect(loadMiniPrefs(st)).toEqual({ n: 3, mirror: true });
    st.setItem(MINI_KEY, "{깨짐");
    expect(loadMiniPrefs(st)).toEqual({ n: 3, mirror: true });
  });

  it("기록은 크기마다 따로, 혼자 맞추기 기록과도 따로 둔다", () => {
    const st = memoryStorage();
    addMiniRecord(rec(3, 20_000), st);
    addMiniRecord(rec(3, 10_000), st);
    addMiniRecord(rec(2, 5000), st);
    saveMiniPrefs({ n: 2, mirror: true }, st);
    const three = loadMiniRecords(3, st);
    expect(three.map((r) => [r.no, r.ms])).toEqual([
      [2, 10_000],
      [1, 20_000],
    ]);
    expect(loadMiniRecords(2, st)).toHaveLength(1);
    expect([...st.map.keys()]).toEqual([MINI_KEY]);
  });

  it("한 판의 입력 출처: 다른 프로그램 입력 > 마우스 > 모름 > 키보드", () => {
    expect(inputSourceOf(["keyboard", "keyboard"])).toBe("keyboard");
    expect(inputSourceOf(["keyboard", "pointer"])).toBe("pointer");
    expect(inputSourceOf(["pointer", "synthetic", "keyboard"])).toBe(
      "synthetic",
    );
    expect(inputSourceOf(["keyboard", "unknown"])).toBe("unknown");
    expect(inputSourceOf([])).toBe("unknown");
    // 기록 칸으로 남고 다시 읽힌다
    const st = memoryStorage();
    addMiniRecord({ ...rec(3, 9000), inputSource: "synthetic" }, st);
    expect(loadMiniRecords(3, st)[0]?.inputSource).toBe("synthetic");
  });

  it("최고·평균·5번 평균", () => {
    const list = [1, 2, 3, 4, 5].map((s) => rec(3, s * 1000));
    const sum = summarize(list);
    expect(sum.best).toBe(1000);
    expect(sum.mean).toBe(3000);
    expect(sum.ao5).toBe(3000);
    expect(sum.ao12).toBeUndefined();
    expect(summarize([])).toMatchObject({ count: 0, best: null, mean: null });
  });
});

it("되돌린 뒤 판정: 맞춘 큐브에 조금 섞기를 해도 맞춘 큐브다", () => {
  const plan = jigglePlan(3, seq(7), 4);
  expect(isSolved(3, applyMoves(3, solvedCube(3), plan))).toBe(true);
});
