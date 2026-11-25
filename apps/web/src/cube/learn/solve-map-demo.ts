// 해법 지도 시안의 견본 기록(`?demo=1`). 화면 안에서만 쓰고 localStorage에 쓰지 않는다. 시안을 고르면 지운다.
import type { SolveRecord } from "../records";
import type { LearnProgress, TrainBook } from "./progress";

const done = { passed: [], done: true };

/** 초보자 아래 두 층까지 끝냄, 노란 십자 하는 중, CFOP 십자·루 첫 블록 끝냄 */
export const DEMO_PROGRESS: LearnProgress = {
  lessons: {
    "333-start": done,
    "333-piece-moves": done,
    "333-notation": done,
    "333-safe-turns": done,
    "333-white-cross": done,
    "333-first-corners-up": done,
    "333-second-layer": done,
    "333-ll-cross": { passed: [1], done: false },
    "cfop-cross": done,
    "roux-fb": done,
  },
  last: "333-ll-cross",
};

const stats = (solves: number, fails: number, ms: number) => ({
  solves,
  fails,
  best: ms - 300,
  times: Array.from({ length: Math.min(solves, 12) }, (_, i) => ms + i * 40),
  moves: [],
});

/** 초보자 십자·둘째 층·노란 십자 연습 기록 */
export const DEMO_TRAIN: TrainBook = {
  "beginner-second-front": stats(9, 1, 2100),
  "beginner-second-right": stats(7, 0, 2400),
  "beginner-second-flipped": stats(2, 2, 6100),
  "beginner-yc-line": stats(6, 0, 1500),
  "beginner-yc-corner": stats(3, 1, 2600),
};

/** 층별로 맞춘 3×3 열 판: 십자는 빠르고 둘째 층이 느리다 */
export const DEMO_RECORDS: SolveRecord[] = Array.from(
  { length: 10 },
  (_, i) => {
    const d = i * 700;
    const cross = 9000 + d / 4;
    const layer1 = cross + 24000 + d / 3;
    const layer2 = layer1 + 42000 + d / 2;
    const oll = layer2 + 10000;
    const ll = oll + 20000 + d;
    return {
      at: 1_764_000_000_000 + i * 60_000,
      no: i + 1,
      n: 3,
      mode: "solo",
      ms: ll,
      penalty: 0,
      moves: 130,
      scramble: "",
      splits: `cross@${cross} layer1@${layer1} layer2@${layer2} oll@${oll} ll@${ll}`,
    };
  },
);
