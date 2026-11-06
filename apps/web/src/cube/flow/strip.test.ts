import { type CubeMove, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import {
  comboNow,
  EMPTY_FLOW,
  FLOW_KEEP,
  type FlowStrip,
  flowSpeed,
  pushFlow,
} from "./strip";

const m = (n: number, s: string) => parseMoves(n, s)[0] as CubeMove;

/** 수 글을 차례로 띠에 넣는다(100ms 간격) */
function play(n: number, alg: string, from: FlowStrip = EMPTY_FLOW) {
  let strip = from;
  let t = 0;
  for (const s of alg.split(" ")) {
    strip = pushFlow(strip, n, m(n, s), 0, t);
    t += 100;
  }
  return strip;
}

const texts = (s: FlowStrip) => s.items.map((i) => i.text);

describe("수 흐름 띠 합치기", () => {
  it("U U → U2", () => {
    expect(texts(play(3, "U U"))).toEqual(["U2"]);
  });

  it("U U U → U′", () => {
    expect(texts(play(3, "U U U"))).toEqual(["U′"]);
  });

  it("U U′ → 지움(되돌리기도 반대 수라 앞 수를 지운다)", () => {
    expect(texts(play(3, "R U U'"))).toEqual(["R"]);
    expect(texts(play(3, "U2 U2"))).toEqual([]);
  });

  it("다른 층이 끼면 합치지 않는다", () => {
    expect(texts(play(3, "R U R U"))).toEqual(["R", "U", "R", "U"]);
    expect(texts(play(3, "R Rw"))).toEqual(["R", "Rw"]);
  });

  it("합쳐도 번호는 그대로, rev가 올라 다시 떠오른다", () => {
    const one = play(3, "R");
    const two = play(3, "R", one);
    expect(two.items[0]?.id).toBe(one.items[0]?.id);
    expect(two.items[0]?.rev).toBe(1);
  });

  it("큐브 돌리기는 회색(색 없음)이고 빠르기에 세지 않는다", () => {
    const s = play(3, "x R y'");
    expect(s.items.map((i) => [i.text, i.rotation, i.color])).toEqual([
      ["x", true, null],
      ["R", false, 0],
      ["y′", true, null],
    ]);
    expect(s.times).toHaveLength(1);
  });

  it(`지나간 수는 ${FLOW_KEEP}개만 남긴다`, () => {
    const s = play(
      3,
      Array.from({ length: 30 }, (_, i) => (i % 2 ? "R" : "U")).join(" "),
    );
    expect(s.items).toHaveLength(FLOW_KEEP);
    expect(s.items.at(-1)?.id).toBe(30);
  });
});

describe("빠르기", () => {
  it("두 수 아래면 없다", () => {
    expect(flowSpeed(play(3, "R"), 0)).toBeNull();
  });

  it("최근 3초 안의 수를 센다(막 시작하면 1초로 나눈다)", () => {
    // 0·100·…·900ms에 10수
    const s = play(3, "R U R U R U R U R U");
    expect(flowSpeed(s, 900)).toBe(10);
    // 3초 뒤: 구간 안 수가 다 빠졌다
    expect(flowSpeed(s, 4_000)).toBeNull();
    // 2초 뒤: 10수 / 2.9초
    expect(flowSpeed(s, 2_900)).toBeCloseTo(10 / 2.9);
  });
});

describe("흐름 콤보(docs/51 2-1)", () => {
  /** 시계를 감으며 수를 둔다: [수, 앞 수부터 감을 ms] */
  function playAt(
    clock: ManualClock,
    steps: [string, number][],
    from: FlowStrip = EMPTY_FLOW,
  ) {
    let strip = from;
    for (const [s, wait] of steps) {
      clock.advance(wait);
      strip = pushFlow(strip, 3, m(3, s), 0, clock.now());
    }
    return strip;
  }

  it("1초 안쪽으로 이어 치면 쌓이고, 1초 넘게 멈추면 끊겨 다시 1부터", () => {
    const clock = new ManualClock();
    let strip = playAt(clock, [
      ["R", 0],
      ["U", 300],
      ["R'", 1_000], // 꼭 1초는 이어진 것
      ["U'", 200],
    ]);
    expect(comboNow(strip, clock.now())).toBe(4);
    // 멈춘 채 1초까지는 보이고, 넘으면 보이지 않는다
    clock.advance(1_000);
    expect(comboNow(strip, clock.now())).toBe(4);
    clock.advance(1);
    expect(comboNow(strip, clock.now())).toBe(0);
    // 그 뒤 수는 1부터
    strip = pushFlow(strip, 3, m(3, "F"), 0, clock.now());
    expect(strip.combo).toBe(1);
  });

  it("띠는 합치기만 하고, 콤보는 `combo.ts` 규칙을 따른다(합친 수는 세고 되돌리는 수는 끊는다)", () => {
    const clock = new ManualClock();
    const strip = playAt(clock, [
      ["R", 0],
      ["U", 100],
      ["U", 100], // U2로 합침: 친 수로 센다
    ]);
    expect(texts(strip)).toEqual(["R", "U2"]);
    expect(comboNow(strip, clock.now())).toBe(3);
    // U2를 되돌리는 U2: 띠에서 지우고 콤보도 끊긴다
    const undone = playAt(clock, [["U2", 100]], strip);
    expect(texts(undone)).toEqual(["R"]);
    expect(undone.combo).toBe(0);
  });

  it("진행 칸을 넘기면 콤보의 「진행 없음」 규칙도 띠에 함께 남는다", () => {
    let strip = EMPTY_FLOW;
    for (let i = 0; i < 10; i++)
      strip = pushFlow(strip, 3, m(3, i % 2 ? "U" : "R"), 0, i * 100, 5);
    // 10수 동안 5칸 그대로: 끊긴다
    expect(strip.combo).toBe(0);
    expect(strip.start).toBe(5);
  });
});
