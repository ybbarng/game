/**
 * 대회 규칙 섞기(docs/47 3절). 같은 씨앗이면 늘 같은 섞기가 나온다(온라인 경주·컴퓨터·복기에서
 * 같은 섞기를 다시 만든다).
 *
 * - 2×2·3×3·3×3 블라인드: 무작위 상태를 만들고 해법기로 푼 해의 거꾸로를 섞기로 쓴다.
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
  pocketDistance,
  solve3x3,
  solvedFacelets,
  solvePocketIndex,
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
 * 2×2 최적 해가 이보다 짧은 상태는 다시 뽑는다.
 * WCA 규정 4b3(무작위 상태 섞기의 최소 거리)을 기억으로 옮긴 값이다. 확인 필요.
 */
export const MIN_222_DISTANCE = 4;

/**
 * 3×3에서 이 수 이하로 풀리는 상태는 다시 뽑는다(무작위 상태에서는 거의 나오지 않는다).
 * 대회 프로그램도 너무 짧은 상태를 버리는 것으로 기억한다. 정확한 값은 확인 필요.
 */
export const MAX_333_TRIVIAL = 2;

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
    case "333bf":
      return {
        event,
        text: `${scramble333(rng)} ${randomOrientation(rng)}`.trim(),
        official: true,
      };
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
    return invertAlgorithm(solvePocketIndex(index));
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

function scramble333(rng: RngState): string {
  for (;;) {
    const facelets = cubieToFacelets(randomCube333(rng));
    if (solvableWithin(facelets, MAX_333_TRIVIAL)) continue;
    return invertAlgorithm(solve3x3(facelets));
  }
}

/**
 * 블라인드 종목: 섞기 끝에 큐브 방향을 무작위로 바꾸는 넓은 층 돌리기를 붙인다(24가지).
 * 대회 프로그램은 x·y·z 대신 `Rw` `Fw` `Uw`를 붙이는 것으로 기억한다. 확인 필요.
 */
function randomOrientation(rng: RngState): string {
  const o = nextInt(rng, 24);
  const up = ["", "Rw", "Rw2", "Rw'", "Fw", "Fw'"][Math.floor(o / 4)];
  const turn = ["", "Uw", "Uw2", "Uw'"][o % 4];
  return [up, turn].filter((s) => s).join(" ");
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
 * 크기별 수 종류. 대회 프로그램을 기억으로 옮겼다(확인 필요):
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
 * 무작위 수 섞기. 같은 수 종류를 연달아 두지 않고, 같은 축을 세 번 연달아 두지 않는다
 * (같은 축 수끼리는 순서를 바꿔도 같아서 섞기가 헛돈다).
 */
function randomMoves(n: 4 | 5 | 6 | 7, rng: RngState): string {
  const kinds = moveKinds(n);
  const out: string[] = [];
  let prev: MoveKind | null = null;
  let prev2: MoveKind | null = null;
  while (out.length < RANDOM_MOVE_LENGTH[n]) {
    const k = kinds[nextInt(rng, kinds.length)] as MoveKind;
    if (prev && k.name === prev.name) continue;
    if (prev && prev2 && k.axis === prev.axis && k.axis === prev2.axis) {
      continue;
    }
    out.push(k.name + ["", "2", "'"][nextInt(rng, 3)]);
    prev2 = prev;
    prev = k;
  }
  return out.join(" ");
}

/** 섞기를 맞춘 큐브에 적용한 스티커 문자열(화면·시험용). */
export function scrambledFacelets(s: Scramble): string {
  const n = Number(s.event[0]);
  return applyAlgorithm(solvedFacelets(n), s.text, n);
}
