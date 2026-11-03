import { createRng, nextInt } from "@game/mighty-engine";

import { EVENT_INFO, type TimerEvent } from "./events";

/** 섞는 공식 하나. `official`은 대회 규칙(무작위 상태 섞기)으로 만든 것인지 */
export interface Scramble {
  readonly text: string;
  readonly official: boolean;
}

/**
 * 섞는 공식을 주는 곳. 대회 규칙 섞기 패키지(`cube-scramble`)가 오기 전까지는 아래 임시 구현을 쓴다.
 * 같은 종목·씨앗이면 같은 공식을 돌려줘야 한다(기록을 다시 보거나 시험할 때).
 */
export type ScrambleProvider = (
  event: TimerEvent,
  seed: number,
) => Promise<Scramble>;

/** 종목별 임시 공식 길이 */
export const FALLBACK_LENGTH: Readonly<Record<TimerEvent, number>> = {
  "222": 11,
  "333": 20,
  "444": 40,
  "555": 60,
  "666": 80,
  "777": 100,
  "333bf": 20,
};

type Axis = 0 | 1 | 2;
/** 면 글자와 축(R·L은 0, U·D는 1, F·B는 2), + 쪽 면인지 */
const FACES: readonly { letter: string; axis: Axis; positive: boolean }[] = [
  { letter: "R", axis: 0, positive: true },
  { letter: "L", axis: 0, positive: false },
  { letter: "U", axis: 1, positive: true },
  { letter: "D", axis: 1, positive: false },
  { letter: "F", axis: 2, positive: true },
  { letter: "B", axis: 2, positive: false },
];
const SUFFIXES = ["", "2", "'"] as const;

/**
 * 크기 n에서 쓸 수 있는 수의 종류. 바깥에서 깊이 `depth`층까지(1 = 바깥층 하나, 2 = Rw, 3 = 3Rw).
 * 짝수 크기의 가장 깊은 층(반쪽 전체)은 + 쪽 면(R·U·F)만 쓴다. 반대쪽은 큐브 돌리기와 같아서다
 * (2×2는 R·U·F만, 4×4는 Rw·Uw·Fw만). WCA 섞기의 수 종류와 같다고 기억한다 — 확인 필요.
 */
function moveKinds(n: number) {
  const kinds: { face: number; depth: number }[] = [];
  const maxDepth = Math.floor(n / 2);
  for (let depth = 1; depth <= maxDepth; depth++) {
    FACES.forEach((f, face) => {
      if (n % 2 === 0 && depth === maxDepth && !f.positive) return;
      kinds.push({ face, depth });
    });
  }
  return kinds;
}

function moveText(face: number, depth: number, suffix: string): string {
  const letter = FACES[face]?.letter ?? "R";
  if (depth === 1) return `${letter}${suffix}`;
  return `${depth > 2 ? depth : ""}${letter}w${suffix}`;
}

/**
 * 임시 섞기: 무작위 수를 늘어놓는다. 대회 규칙(3×3·2×2는 무작위 상태)이 아니라서 `official: false`.
 * - 바로 앞 수와 같은 면은 쓰지 않는다(깊이가 달라도).
 * - 같은 축이 세 번 이어지지 않는다(R L R처럼 앞 수와 합쳐지는 것을 막는다).
 */
export function fallbackScrambleText(event: TimerEvent, seed: number): string {
  const n = EVENT_INFO[event].size;
  const kinds = moveKinds(n);
  const rng = createRng(seed);
  const out: string[] = [];
  const faces: number[] = [];
  while (out.length < FALLBACK_LENGTH[event]) {
    const kind = kinds[nextInt(rng, kinds.length)];
    if (!kind) continue;
    const last = faces.at(-1);
    if (last === kind.face) continue;
    const axis = FACES[kind.face]?.axis;
    const prev = faces.slice(-2).map((f) => FACES[f]?.axis);
    if (prev.length === 2 && prev[0] === axis && prev[1] === axis) continue;
    faces.push(kind.face);
    out.push(
      moveText(kind.face, kind.depth, SUFFIXES[nextInt(rng, 3)] as string),
    );
  }
  return out.join(" ");
}

export const fallbackScramble: ScrambleProvider = async (event, seed) => ({
  text: fallbackScrambleText(event, seed),
  official: false,
});

/**
 * 화면이 쓰는 섞기. `cube-scramble`이 들어오면 이 한 줄만 바꾼다:
 * `export const scrambleProvider: ScrambleProvider = async (event, seed) => { const s = await cubeScramble(event, seed); return { text: s.text, official: s.official }; };`
 */
export const scrambleProvider: ScrambleProvider = fallbackScramble;
