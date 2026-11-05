// 완성까지 거리(docs/51 1-2). 진행 막대로는 쓰지 않는다(사람 풀이 동안 18~20수에 오래 머문다). 결과 상자의
// 「이 섞기의 가장 짧은 풀이」와 맞추는 중의 「완성까지 k수」(8수 안쪽일 때만)에 쓴다. 워커에서 부른다(`worker/jobs.ts`).
import { toFacelets } from "@game/cube-ai";
import { distance2x2, SolveStopped, solve3x3 } from "@game/cube-solver";
// 형식만 가져온다. `realClock`을 가져오면 워커 묶음에 fair-play(libsodium)까지 딸려 온다
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

/** 「완성까지 k수」를 보이는 가장 먼 거리 */
export const NEAR_LIMIT = 8;

/**
 * 맞춘 상태까지의 가장 짧은 수(HTM, 면 돌리기만 센다). `max`보다 멀면 null. 2×2·3×3만(그 밖은 null).
 *
 * 3×3: 2단계 해법은 상한(`maxLength`) 안에 해가 있으면 반드시 하나를 찾는다(마지막 2단계 밖 수까지가 1단계,
 * 그 뒤는 2단계 수뿐이라 탐색이 그 해를 지난다). 그래서 상한을 0부터 하나씩 올려 처음 찾은 길이가 가장 짧은 수다.
 * 따로 구한 정답(가운데서 만나기)과 1~6수 섞기 300개씩 견주어 확인했다(`distance-exact.test.ts`).
 * 8수 안쪽은 상한마다 1ms 안쪽이다(2026-11-05 이 맥에서 잼, 섞기 3~24수).
 */
export function distanceToSolved(
  n: number,
  state: PuzzleState,
  max: number,
): number | null {
  if (n === 2) {
    const d = distance2x2(toFacelets(2, state));
    return d <= max ? d : null;
  }
  if (n !== 3) return null;
  return exactDistance3(toFacelets(3, state), max);
}

const lengthOf = (s: string) => (s === "" ? 0 : s.split(" ").length);

/** 3×3 가장 짧은 수(상한을 0부터 올린다). `max`보다 멀면 null. `shouldStop`으로 멈추면 `SolveStopped` */
function exactDistance3(
  facelets: string,
  max: number,
  shouldStop?: () => boolean,
): number | null {
  for (let limit = 0; limit <= max; limit++) {
    try {
      return lengthOf(solve3x3(facelets, { maxLength: limit, shouldStop }));
    } catch (e) {
      if (e instanceof SolveStopped) throw e;
      // 이 상한 안에는 해가 없다
    }
  }
  return null;
}

export interface ShortSolution {
  /** 수(HTM) */
  moves: number;
  /** 가장 짧은 것이 확실한가(2×2는 정확, 3×3은 2단계 해법의 첫 해라 몇 수 길 수 있다) */
  exact: boolean;
}

/** 3×3에서 가장 짧은 수를 끝까지 찾아보는 거리(넘으면 2단계 해법의 첫 해를 쓴다) */
export const EXACT_LIMIT_333 = 12;

/**
 * 결과 상자의 짧은 풀이 한 걸음마다 쓰는 시간 상한(ms, 그 기기의 시계로). 정확한 거리 찾기와 첫 해 찾기
 * (21수 → 22수)에 하나씩, 마지막 24수 찾기는 상한 없이(늘 빠르다). 그래서 결과 상자는 느린 휴대폰에서도
 * 0.5초 안팎이면 찬다(docs/47 8-7, 2026-11-05 잼)
 */
export const SHORT_STEP_MS = 150;

/** 첫 해 찾기의 길이 상한 차례. 앞 상한에서 시간이 넘으면 다음으로(길이 상한을 넓히면 훨씬 빨리 찾는다) */
const FIRST_LIMITS = [21, 22] as const;
const LAST_LIMIT = 24;

export interface ShortSolutionOptions {
  /** 시간을 재는 시계(시험은 `ManualClock`). 기본은 이 기기의 시계 */
  clock?: Pick<Clock, "now">;
  /** 한 걸음의 시간 상한(ms) */
  stepMs?: number;
  /** 정확한 값을 찾는 가장 먼 거리(기본 `EXACT_LIMIT_333`) */
  exactLimit?: number;
}

const deviceClock: Pick<Clock, "now"> = { now: () => Date.now() };

/**
 * 이 섞기의 짧은 풀이(결과 상자). 2×2는 정확한 값. 3×3은 12수 안쪽이고 `stepMs` 안에 찾으면 정확한 값,
 * 아니면(대회 섞기는 거의 늘 12수보다 멀다) 2단계 해법이 처음 찾은 해의 길이다(「컴퓨터 풀이 n수」).
 * 첫 해도 21수 안쪽을 `stepMs` 안에 못 찾으면 22수, 그다음 24수 안쪽으로 넓힌다.
 */
export function shortSolution(
  n: number,
  state: PuzzleState,
  {
    clock = deviceClock,
    stepMs = SHORT_STEP_MS,
    exactLimit = EXACT_LIMIT_333,
  }: ShortSolutionOptions = {},
): ShortSolution | null {
  if (n === 2) return { moves: distance2x2(toFacelets(2, state)), exact: true };
  if (n !== 3) return null;
  const facelets = toFacelets(3, state);
  const stopAfter = () => {
    const deadline = clock.now() + stepMs;
    return () => clock.now() >= deadline;
  };
  try {
    const near = exactDistance3(facelets, exactLimit, stopAfter());
    if (near !== null) return { moves: near, exact: true };
  } catch (e) {
    if (!(e instanceof SolveStopped)) throw e;
  }
  for (const maxLength of FIRST_LIMITS) {
    try {
      const s = solve3x3(facelets, { maxLength, shouldStop: stopAfter() });
      return { moves: lengthOf(s), exact: false };
    } catch (e) {
      if (!(e instanceof SolveStopped)) throw e;
    }
  }
  const s = solve3x3(facelets, { maxLength: LAST_LIMIT });
  return { moves: lengthOf(s), exact: false };
}
