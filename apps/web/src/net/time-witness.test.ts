// @vitest-environment node
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import {
  type Arrival,
  ArrivalBook,
  arrivalsByState,
  spentOf,
  TURN_SLACK_MS,
  WINDOW_SLACK_MS,
  type WitnessInput,
  witnessTimes,
} from "./time-witness";

const at = (ms: number, segment = 0, hidden = false): Arrival => ({
  at: ms,
  segment,
  hidden,
});

/**
 * 두 사람이 번갈아 두는 판: 수마다 [자리, 방장이 적은 쓴 시간, 내 기기에 다음 화면이 닿은 때].
 * 상태 0의 화면은 0에 닿았다
 */
function alternating(
  moves: [seat: number, spent: number, arrived: number][],
): WitnessInput {
  const turns: WitnessInput["turns"][number][] = [];
  const arrivalOf = new Map<number, Arrival>([[0, at(0)]]);
  for (const [i, [seat, , arrived]] of moves.entries()) {
    turns.push({ seat, left: 180_000 });
    arrivalOf.set(i + 1, at(arrived));
  }
  turns.push(null);
  return {
    turns,
    windows: [],
    entries: moves.map(([seat, spent]) => ({
      seat,
      spent,
      keeps: false,
      window: null,
    })),
    arrivalOf,
    botSeats: new Set(),
  };
}

/** 씨앗을 정한 난수(mulberry32, 0 이상 1 미만) */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * 휴대폰 손님과 둔 판: 0번이 방장, 1번이 손님, 번갈아 `moves`수. 화면마다 내려받기 지연이 0.05~0.8초에서 따로 흔들리고
 * 3%는 2초 더 늦는다(가장 나쁘게: 앞뒤 화면의 지연이 서로 상관없다). 수마다 실제로 1~10초를 쓴다.
 * `steal`이면 방장이 수마다 그만큼 가져간다: 자기 수는 줄여 적고 손님 수는 부풀려 적는다(`side`로 한쪽만)
 */
function phoneGame(
  seed: number,
  moves: number,
  steal = 0,
  side: "both" | "guest" | "host" = "both",
): WitnessInput {
  const r = seeded(seed);
  const delay = () => (r() < 0.03 ? 2_000 : 0) + 50 + r() * 750;
  const arrivalOf = new Map<number, Arrival>([[0, at(delay())]]);
  const turns: WitnessInput["turns"][number][] = [];
  const entries: WitnessInput["entries"][number][] = [];
  let t = 0;
  for (let i = 0; i < moves; i++) {
    const seat = i % 2;
    const spent = 1_000 + r() * 9_000;
    t += spent;
    arrivalOf.set(i + 1, at(t + delay()));
    turns.push({ seat, left: 600_000 });
    const cheat =
      seat === 1
        ? side === "host"
          ? 0
          : steal
        : side === "guest"
          ? 0
          : -steal;
    entries.push({
      seat,
      spent: Math.round(spent + cheat),
      keeps: false,
      window: null,
    });
  }
  turns.push(null);
  return { turns, windows: [], entries, arrivalOf, botSeats: new Set() };
}

describe("손님 시계 확인(witnessTimes)", () => {
  describe("흔들리는 휴대폰 망에서 긴 판(200수)", () => {
    const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

    it("정직한 방장은 씨앗 50개 모두 통과한다(어긋남은 부호 있는 채로 더해 서로 상쇄된다)", () => {
      for (const seed of SEEDS)
        expect(witnessTimes(phoneGame(seed, 200)), `씨앗 ${seed}`).toBeNull();
    });

    it("방장이 수마다 0.5초씩 가져가면(자기 수 줄이기·손님 수 부풀리기) 씨앗 50개 모두 잡힌다", () => {
      for (const seed of SEEDS)
        expect(witnessTimes(phoneGame(seed, 200, 500)), `씨앗 ${seed}`).toMatch(
          /번 자리 시간을 내 기기에서 잰 것보다/,
        );
    });

    it("한쪽만 가져가도 잡힌다(손님 수만 부풀리기, 자기 수만 줄이기)", () => {
      for (const seed of SEEDS) {
        expect(witnessTimes(phoneGame(seed, 200, 500, "guest"))).toMatch(
          /1번 자리 시간을 .*많이 적었다/,
        );
        expect(witnessTimes(phoneGame(seed, 200, 500, "host"))).toMatch(
          /0번 자리 시간을 .*적게 적었다/,
        );
      }
    });
  });

  it("방장이 적은 시간이 닿은 사이와 같으면 통과한다", () => {
    expect(
      witnessTimes(
        alternating([
          [0, 5_000, 5_000],
          [1, 7_000, 12_000],
          [0, 1_000, 13_000],
        ]),
      ),
    ).toBeNull();
  });

  it("내려받기 지연이 흔들리는 만큼은 허용한다", () => {
    // 두 번째 화면이 1초 늦게 닿았다: 앞 차례는 길게, 뒤 차례는 짧게 잰다.
    expect(
      witnessTimes(
        alternating([
          [0, 5_000, 6_000],
          [1, 7_000, 12_000],
        ]),
      ),
    ).toBeNull();
  });

  it("방장이 손님 시간을 부풀려 적으면(일찍 낸 시간패) 실패한다", () => {
    const problem = witnessTimes(
      alternating([
        [0, 5_000, 5_000],
        // 손님은 10초를 썼는데 방장이 남은 시간 전부(시간패)를 적었다
        [1, 180_001, 15_000],
      ]),
    );
    expect(problem).toMatch(/기록 2번째: 1번 자리 시간을.*많이 적었다/);
  });

  it("방장이 자기 시간을 적게 적으면 실패한다", () => {
    const problem = witnessTimes(
      alternating([
        [0, 1_000, 60_000],
        [1, 5_000, 65_000],
      ]),
    );
    expect(problem).toMatch(/기록 1번째: 0번 자리 시간을.*적게 적었다/);
  });

  it("차례마다 조금씩 훔쳐도 쌓여서 허용 폭을 넘으면 실패한다", () => {
    const moves: [number, number, number][] = [];
    let t = 0;
    for (let i = 0; i < 40; i++) {
      const seat = i % 2;
      t += 10_000;
      // 방장(0번)은 수마다 1초씩 적게 적는다
      moves.push([seat, seat === 0 ? 9_000 : 10_000, t]);
    }
    expect(witnessTimes(alternating(moves))).toMatch(/0번 자리.*적게 적었다/);
  });

  it("끊기거나 가려진 사이에 걸친 차례는 재지 않는다", () => {
    const input = alternating([
      [0, 5_000, 5_000],
      [1, 180_001, 15_000],
    ]);
    const broken = new Map(input.arrivalOf);
    broken.set(2, at(15_000, 1));
    expect(witnessTimes({ ...input, arrivalOf: broken })).toBeNull();
    const hidden = new Map(input.arrivalOf);
    hidden.set(1, at(5_000, 0, true));
    expect(witnessTimes({ ...input, arrivalOf: hidden })).toBeNull();
  });

  it("컴퓨터 자리는 적게 적은 것을 보지 않는다(생각이 길어도 지지 않게 줄여 적는다)", () => {
    const input = alternating([
      [0, 5_000, 5_000],
      [1, 1_000, 60_000],
    ]);
    expect(witnessTimes({ ...input, botSeats: new Set([1]) })).toBeNull();
    expect(witnessTimes(input)).not.toBeNull();
  });

  it("차례를 끝내지 않는 행동 뒤에는 차례 처음부터 잰다", () => {
    // 0번이 무승부 제안(쓴 시간 없음, 이어 잼) 뒤 수를 둔다: 쓴 시간은 차례 처음부터다.
    const input: WitnessInput = {
      turns: [
        { seat: 0, left: 1 },
        { seat: 0, left: 1 },
        { seat: 1, left: 1 },
      ],
      windows: [],
      entries: [
        { seat: 0, spent: null, keeps: true, window: null },
        { seat: 0, spent: 9_000, keeps: false, window: null },
      ],
      arrivalOf: new Map([
        [0, at(0)],
        [1, at(6_000)],
        [2, at(9_000)],
      ]),
      botSeats: new Set(),
    };
    expect(witnessTimes(input)).toBeNull();
    expect(
      witnessTimes({
        ...input,
        entries: input.entries.map((e) => ({ ...e, keeps: false })),
      }),
    ).not.toBeNull();
  });

  describe("시간 창(시간 상한)", () => {
    const cap = 18 * 60_000;
    const window = (closedAt: number, openedHidden = false): WitnessInput => ({
      turns: [],
      windows: [
        new Map([["timeUp", cap]]),
        new Map([["timeUp", cap]]),
        new Map(),
      ],
      entries: [
        { seat: 1, spent: null, keeps: false, window: null },
        { seat: 0, spent: null, keeps: false, window: "timeUp" },
      ],
      arrivalOf: new Map([
        [0, at(0, 0, openedHidden)],
        [1, at(1_000)],
        [2, at(closedAt, 7)],
      ]),
      botSeats: new Set(),
    });

    it("창 길이만큼 지난 뒤에 닫혔으면 통과한다(끊김은 상관없다)", () => {
      expect(witnessTimes(window(cap))).toBeNull();
      expect(witnessTimes(window(cap - WINDOW_SLACK_MS + 1))).toBeNull();
    });

    it("일찍 닫혔으면 실패한다", () => {
      expect(witnessTimes(window(cap - 60_000))).toMatch(
        /기록 2번째: 시간 창이 내 기기에서 60.0초 일찍 닫혔다/,
      );
    });

    it("창이 열린 화면을 가려진 채 받았으면 재지 않는다", () => {
      expect(witnessTimes(window(60_000, true))).toBeNull();
    });

    it("열리지 않은 창으로 넣었으면 실패한다", () => {
      const input = window(cap);
      expect(
        witnessTimes({ ...input, windows: [new Map(), new Map(), new Map()] }),
      ).toMatch(/열리지 않은 시간 창/);
    });
  });
});

describe("닿은 시각 적기", () => {
  it("끊김·가려짐마다 구간을 나누고, 같은 화면이 이어지면 처음 닿은 때를 쓴다", () => {
    const clock = new ManualClock();
    const book = new ArrivalBook(clock);
    book.record();
    clock.advance(1_000);
    book.record();
    book.breakSegment();
    clock.advance(1_000);
    book.record();
    book.setHidden(true);
    book.record();
    expect(book.arrivals).toEqual([
      at(0, 0),
      at(1_000, 0),
      at(2_000, 1),
      at(2_000, 2, true),
    ]);
    const map = arrivalsByState(["a", "b", "b", "c"], book.arrivals, [
      "a",
      "x",
      "b",
      "c",
    ]);
    expect([...map]).toEqual([
      [0, at(0, 0)],
      [2, at(1_000, 0)],
      [3, at(2_000, 2, true)],
    ]);
  });

  it("쓴 시간은 행동의 `spent`에서 읽는다", () => {
    expect(spentOf({ type: "place", spent: 1_200 })).toBe(1_200);
    expect(spentOf({ type: "resign" })).toBeNull();
    expect(spentOf({ type: "place", spent: "1" })).toBeNull();
    expect(TURN_SLACK_MS).toBeGreaterThan(0);
  });
});
