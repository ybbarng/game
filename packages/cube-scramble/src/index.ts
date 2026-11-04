/**
 * 대회 규칙 섞기(docs/47 3절). 같은 씨앗이면 늘 같은 섞기가 나온다(온라인 대결·컴퓨터·복기에서
 * 같은 섞기를 다시 만든다).
 *
 * 규칙은 WCA 규정(2026-04-01판) 4b3과 대회 프로그램 TNoodle(tnoodle-lib d01a947)을 따른다.
 *
 * - 2×2: 4수 이상 필요한 무작위 상태를 딱 11수의 U·R·F로 만든다.
 * - 3×3·3×3 블라인드: 2수 이상 필요한 무작위 상태를 해법기로 풀고 그 해의 거꾸로를 쓴다(21수 이하).
 *   블라인드는 끝에 무작위 방향 돌리기를 붙인다.
 * - 4×4: 대회 공식은 무작위 상태지만 1차는 무작위 수 40수(`official: false`).
 * - 5×5·6×6·7×7: 무작위 수 60·80·100수(대회 방식과 같다).
 */
import {
  applyAlgorithm,
  type CubieCube,
  cubieToFacelets,
  invertAlgorithm,
  isSolvedFacelets,
  POCKET_STATE_COUNT,
  parity,
  pocketApply,
  pocketDistance,
  solve3x3,
  solvedFacelets,
} from "@game/cube-solver";
import {
  createRng,
  nextInt,
  type RngState,
  shuffleInPlace,
} from "@game/mighty-engine";

/** WCA 종목 번호 */
export type ScrambleEvent =
  | "222"
  | "333"
  | "333bf"
  | "444"
  | "555"
  | "666"
  | "777";

export const SCRAMBLE_EVENTS: readonly ScrambleEvent[] = [
  "222",
  "333",
  "333bf",
  "444",
  "555",
  "666",
  "777",
];

export interface Scramble {
  event: ScrambleEvent;
  /** WCA 표기, 공백으로 나눈다 */
  text: string;
  /** 대회 공식 섞기와 같은 방식인가(4×4 무작위 수는 아니다) */
  official: boolean;
}

/**
 * 2×2 최적 해가 이보다 짧은 상태는 다시 뽑는다(WCA 규정 4b3b: 4수 이상, HTM).
 */
export const MIN_222_DISTANCE = 4;

/**
 * 2×2 섞기 글의 길이. 대회 프로그램(TNoodle `TWO_BY_TWO_MIN_SCRAMBLE_LENGTH`)처럼 상태를
 * 딱 이 길이의 U·R·F 수로 만든다(최적 해보다 길어도 된다).
 */
export const SCRAMBLE_222_LENGTH = 11;

/**
 * 3×3에서 이 수 이하로 풀리는 상태는 다시 뽑는다. WCA 규정 4b3은 "2수 이상 필요한 상태 가운데
 * 무작위"라서 1수 이하만 버린다(TNoodle `wcaMinScrambleDistance = 2`). 무작위 상태에서는 거의
 * 나오지 않는다.
 */
export const MAX_333_TRIVIAL = 1;

/** 3×3 섞기 길이 상한(TNoodle `THREE_BY_THREE_MAX_SCRAMBLE_LENGTH`) */
export const MAX_333_LENGTH = 21;

/** 무작위 수 섞기의 길이 */
export const RANDOM_MOVE_LENGTH: Record<4 | 5 | 6 | 7, number> = {
  4: 40,
  5: 60,
  6: 80,
  7: 100,
};

export function scramble(event: ScrambleEvent, seed: number): Scramble {
  const rng = createRng(seed);
  switch (event) {
    case "222":
      return { event, text: scramble222(rng), official: true };
    case "333":
      return { event, text: scramble333(rng), official: true };
    case "333bf": {
      // 대회 프로그램처럼 방향 돌리기를 먼저 고르고, 섞기 마지막 수가 그 첫 수와 같은 축이
      // 되지 않게 해를 찾는다(겹치면 방향 돌리기와 합쳐져 섞기가 헛돈다)
      const orientation = randomOrientation(rng);
      const first = orientation[0];
      const text = scramble333(rng, first ? orientationAxis(first) : undefined);
      return { event, text: [text, ...orientation].join(" "), official: true };
    }
    case "444":
      return { event, text: randomMoves(4, rng), official: false };
    case "555":
      return { event, text: randomMoves(5, rng), official: true };
    case "666":
      return { event, text: randomMoves(6, rng), official: true };
    case "777":
      return { event, text: randomMoves(7, rng), official: true };
  }
}

function scramble222(rng: RngState): string {
  for (;;) {
    const index = nextInt(rng, POCKET_STATE_COUNT);
    if (pocketDistance(index) < MIN_222_DISTANCE) continue;
    const text = pocketScrambleExactly(index, SCRAMBLE_222_LENGTH);
    // 2×2는 모든 상태를 11수로 만들 수 있다. 혹시 못 찾으면 다른 상태를 뽑는다
    if (text !== null) return text;
  }
}

/** 해 수(0~8: U U2 U' R R2 R' F F2 F')의 거꾸로 = 섞기 글에 적는 수 */
const POCKET_INVERSE = ["U'", "U2", "U", "R'", "R2", "R", "F'", "F2", "F"];

/**
 * 2×2 상태를 딱 `length`수의 U·R·F로 만드는 섞기(TNoodle `TwoByTwoSolver.generateExactly`를
 * 옮겼다). 그 상태를 딱 `length`수로 맞추는 해를 모두 훑어, 섞기로 돌리기 가장 편한 것(손가락
 * 비용이 가장 낮은 것, 같으면 먼저 찾은 것)의 거꾸로를 낸다. 같은 면은 잇달아 두지 않는다.
 * 그런 해가 없으면 null.
 */
export function pocketScrambleExactly(
  index: number,
  length: number,
): string | null {
  const solution = new Int8Array(length);
  let best: Int8Array | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const search = (state: number, depth: number, lastFace: number): void => {
    const togo = length - depth;
    if (togo === 0) {
      if (state !== 0) return;
      const cost = scrambleCost(solution, length - 1, 0, 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = solution.slice();
      }
      return;
    }
    // 거리표가 정확해서, 남은 수로 못 맞추는 가지는 바로 끊는다
    if (pocketDistance(state) > togo) return;
    for (let move = 0; move < 9; move++) {
      const face = Math.floor(move / 3);
      if (face === lastFace) continue;
      solution[depth] = move;
      search(pocketApply(state, move), depth + 1, face);
    }
  };
  search(index, 0, -1);
  // `best`는 안쪽 함수에서 바뀌어 TypeScript가 null로만 본다
  const found = best as Int8Array | null;
  if (found === null) return null;
  const out: string[] = [];
  for (let i = length - 1; i >= 0; i--) {
    out.push(POCKET_INVERSE[found[i] as number] as string);
  }
  return out.join(" ");
}

/**
 * 섞기를 손으로 돌리는 비용(TNoodle `TwoByTwoSolver.computeCost`를 그대로 옮겼다). 해를 끝에서부터
 * 거꾸로 읽는다(= 섞기 순서). `grip`은 오른손 엄지 자리: -1 아래, 0 앞, 1 위.
 * 값 자체는 뜻이 없고, 같은 길이 섞기 가운데 하나를 고르는 데만 쓴다.
 */
function scrambleCost(
  solution: Int8Array,
  index: number,
  cost: number,
  grip: number,
): number {
  if (index < 0) return cost;
  const next = (add: number, g: number) =>
    scrambleCost(solution, index - 1, cost + add, g);
  const REGRIP = 20;
  switch (solution[index]) {
    case 0: // 섞기에서는 U'
      return next(7, grip);
    case 1: // U2
      return next(10, grip);
    case 2: // U
      if (grip === 0) return next(8, 0);
      if (grip === -1) return Math.min(next(REGRIP + 8, 0), next(20, grip));
      return next(REGRIP + 8, 0);
    case 3: // R'
      return grip > -1 ? next(6, grip - 1) : next(REGRIP + 6, -1);
    case 4: // R2
      if (grip !== 0) return next(10, -grip);
      return Math.min(next(REGRIP + 10, -1), next(REGRIP + 10, 1));
    case 5: // R
      return grip < 1 ? next(6, grip + 1) : next(REGRIP + 6, 1);
    case 6: // F'
      if (grip !== 0) return next(19, grip);
      return Math.min(next(REGRIP + 19, -1), next(REGRIP + 19, 1));
    case 7: // F2
      return grip === -1 ? next(30, -1) : next(REGRIP + 30, -1);
    default: // 8, F
      return grip === -1 ? next(10, -1) : next(REGRIP + 10, -1);
  }
}

function randomCube333(rng: RngState): CubieCube {
  const cp = shuffleInPlace(rng, [0, 1, 2, 3, 4, 5, 6, 7]);
  const ep = shuffleInPlace(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // 꼭짓점과 모서리 순열의 홀짝이 같아야 맞출 수 있다
  if (parity(cp) !== parity(ep)) {
    [ep[0], ep[1]] = [ep[1] as number, ep[0] as number];
  }
  const co: number[] = [];
  for (let i = 0; i < 7; i++) co.push(nextInt(rng, 3));
  co.push((3 - (co.reduce((a, b) => a + b, 0) % 3)) % 3);
  const eo: number[] = [];
  for (let i = 0; i < 11; i++) eo.push(nextInt(rng, 2));
  eo.push(eo.reduce((a, b) => a + b, 0) % 2);
  return { cp, co, ep, eo };
}

const FACE_TURNS = ["U", "R", "F", "D", "L", "B"].flatMap((f) => [
  f,
  `${f}2`,
  `${f}'`,
]);

/** `n`수 이하로 풀리는가(맞춘 상태 포함). 작은 n에서만 쓴다. */
export function solvableWithin(facelets: string, n: number): boolean {
  if (isSolvedFacelets(facelets)) return true;
  if (n === 0) return false;
  return FACE_TURNS.some((m) =>
    solvableWithin(applyAlgorithm(facelets, m, 3), n - 1),
  );
}

/**
 * 3×3 무작위 상태 섞기. `lastAxisNot`을 주면 섞기 마지막 수가 그 축(면과 맞은편 면)이 되지 않는다
 * (섞기 마지막 수 = 해 첫 수의 거꾸로라서 해 탐색에서 첫 수를 막는다).
 */
function scramble333(rng: RngState, lastAxisNot?: "U" | "R" | "F"): string {
  for (;;) {
    const facelets = cubieToFacelets(randomCube333(rng));
    if (solvableWithin(facelets, MAX_333_TRIVIAL)) continue;
    return invertAlgorithm(
      solve3x3(facelets, {
        maxLength: MAX_333_LENGTH,
        ...(lastAxisNot ? { firstAxisNot: lastAxisNot } : {}),
      }),
    );
  }
}

/**
 * 블라인드 종목(WCA 4b3a): 섞기 끝에 큐브 방향을 무작위로 바꾸는 넓은 층 돌리기를 붙인다.
 * TNoodle `getRandomOrientationMoves`와 같다: 첫 수 {없음, Rw, Rw2, Rw', Fw, Fw'} × 둘째 수
 * {없음, Uw, Uw2, Uw'}, 24가지가 같은 확률. 붙일 수 목록(0~2개)을 낸다.
 */
export function randomOrientation(rng: RngState): string[] {
  const o = nextInt(rng, 24);
  const up = ["", "Rw", "Rw2", "Rw'", "Fw", "Fw'"][Math.floor(o / 4)];
  const turn = ["", "Uw", "Uw2", "Uw'"][o % 4];
  return [up, turn].filter((s): s is string => Boolean(s));
}

/** 방향 돌리기 수(`Rw2` 등)의 축 면 */
function orientationAxis(move: string): "U" | "R" | "F" {
  return move[0] as "U" | "R" | "F";
}

/** 무작위 수 섞기에 쓰는 수 종류(면 + 넓이) */
interface MoveKind {
  name: string;
  axis: "x" | "y" | "z";
}

const AXIS: Record<string, MoveKind["axis"]> = {
  U: "y",
  D: "y",
  R: "x",
  L: "x",
  F: "z",
  B: "z",
};

/**
 * 크기별 수 종류(TNoodle `CubeState.getScrambleSuccessors`와 같다: 두께 1~n/2층, 짝수 큐브의
 * 딱 절반 두께는 맞은편과 같아서 U·R·F 쪽만):
 * 4×4는 바깥 6면 + Uw Rw Fw, 5×5는 바깥 + 넓은 6면, 6×6은 거기에 3Uw 3Rw 3Fw,
 * 7×7은 3층 넓은 6면 모두.
 */
export function moveKinds(n: 4 | 5 | 6 | 7): MoveKind[] {
  const outer = ["U", "D", "R", "L", "F", "B"];
  const names = [...outer];
  if (n === 4) names.push("Uw", "Rw", "Fw");
  else names.push(...outer.map((f) => `${f}w`));
  if (n === 6) names.push("3Uw", "3Rw", "3Fw");
  if (n === 7) names.push(...outer.map((f) => `3${f}w`));
  return names.map((name) => ({
    name,
    axis: AXIS[name.replace(/[^URFDLB]/g, "")] as MoveKind["axis"],
  }));
}

/**
 * 무작위 수 섞기(WCA 4b3e). 면·두께·방향을 합친 수 글자 전체에서 같은 확률로 하나를 고르고,
 * 앞 수와 합쳐지는 수면 다시 고른다(TNoodle `isRedundant`를 줄여 옮겼다).
 * 합쳐지는 수: 같은 축 수끼리는 순서를 바꿔도 같으므로, 이어지는 같은 축 묶음 안에 이미 있는
 * 면·두께 종류를 또 두면 그 수와 합쳐진다(R L R → R2 L 등). 축이 바뀌면 묶음을 새로 센다.
 */
function randomMoves(n: 4 | 5 | 6 | 7, rng: RngState): string {
  const kinds = moveKinds(n);
  const out: string[] = [];
  let runAxis: MoveKind["axis"] | null = null;
  const inRun = new Set<string>();
  while (out.length < RANDOM_MOVE_LENGTH[n]) {
    const pick = nextInt(rng, kinds.length * 3);
    const k = kinds[Math.floor(pick / 3)] as MoveKind;
    if (k.axis === runAxis && inRun.has(k.name)) continue;
    if (k.axis !== runAxis) {
      runAxis = k.axis;
      inRun.clear();
    }
    inRun.add(k.name);
    out.push(k.name + ["", "2", "'"][pick % 3]);
  }
  return out.join(" ");
}

/** 섞기를 맞춘 큐브에 적용한 스티커 문자열(화면·시험용). */
export function scrambledFacelets(s: Scramble): string {
  const n = Number(s.event[0]);
  return applyAlgorithm(solvedFacelets(n), s.text, n);
}
