// 큰 큐브의 「3×3처럼」 단계와 패리티(docs/47 16-16). 센터가 맞고 엣지가 묶인 4×4·5×5를 3×3 처음 맞추기의 경우별
// 정해진 길(beginner-path.ts)로 푼다. 바깥 층만 돌리므로 바깥 층만 본 3×3(project)에서 규칙을 돌려 수를 얻고,
// 그 수를 큰 큐브에 그대로 친다. 3×3에서 나올 수 없는 모양(패리티)은 4×4에서만 나오고, 알아보는 곳은 둘이다.
// ① 노란 십자: 위를 보는 노란 엣지가 1·3개면 OLL 패리티. 노란색이 위를 보지 않는 엣지 하나를 U로 위-앞에 두고 공식.
// ② 코너 자리: 옆면을 맞춘 뒤 제자리 코너가 꼭 둘이면, 또는 「제자리 없음」 공식을 한 번 친 뒤에도 꼭 하나가 아니면
//    PLL 패리티. 공식(위-앞·위-뒤 엣지 맞바꾸기) 뒤 옆면 맞추기부터 다시 한다. 이웃한 엣지 둘이 바뀐 모양, 맞은편
//    엣지 둘이 바뀐 모양, 코너 둘이 바뀐 모양이 모두 이 한 곳에서 드러난다(옆면 맞추기는 엣지 자리만 보니 어떤 엣지
//    자리든 맞춘다).
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  stickerFace,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { PARITY_4X4 } from "./algs-big";
import {
  nextStep,
  type PathStageId,
  type PathStep,
  placedCorners,
  runStage,
  stepMoves,
} from "./beginner-path";

const algOf = (id: string) =>
  PARITY_4X4.find((c) => c.id === id)?.algs[0] as string;
export const OLL_PARITY_ALG = algOf("parity-4x4-oll");
export const PLL_PARITY_ALG = algOf("parity-4x4-pll");

const playN = (n: number, s: PuzzleState, alg: string) =>
  alg.trim() ? applyMoves(n, s, parseMoves(n, alg)) : s;
const join = (...xs: string[]) =>
  xs.filter(Boolean).join(" ").trim().replace(/\s+/g, " ");

/** 큰 큐브 바깥 층만 본 3×3(센터는 한가운데, 엣지는 바깥에서 둘째 칸) */
export function project(n: number, s: PuzzleState): PuzzleState {
  const col = faceColors(n, s);
  const m = (v: number) => (v === 0 ? 0 : v === 2 ? n - 1 : n === 4 ? 1 : 2);
  const at3 = (i: number) => {
    const f = Math.floor(i / 9);
    const r = Math.floor((i % 9) / 3);
    const c = i % 3;
    return col[f * n * n + m(r) * n + m(c)] as number;
  };
  const topo = cubeTopology(3);
  const perm = new Uint16Array(54);
  const used = new Set<number>();
  for (const piece of topo.pieces) {
    const here = piece.stickers.map(at3);
    const key = [...here].sort().join();
    const home = topo.pieces.find(
      (q, qi) =>
        !used.has(qi) &&
        q.stickers.length === piece.stickers.length &&
        q.stickers
          .map((st) => stickerFace(3, st))
          .sort()
          .join() === key,
    );
    if (!home) throw new Error("3×3로 볼 수 없다(센터·엣지가 덜 맞음)");
    used.add(topo.pieces.indexOf(home));
    piece.stickers.forEach((pos, k) => {
      const st = home.stickers.find(
        (x) => stickerFace(3, x) === here[k],
      ) as number;
      perm[pos] = st;
    });
  }
  return { perm, twist: new Uint8Array(54) };
}

const ROTATIONS = (() => {
  const out: string[] = [];
  for (const a of ["", "x", "x'", "x2", "z", "z'"])
    for (const b of ["", "y", "y'", "y2"]) out.push(join(a, b));
  return out;
})();

/** 윗면 색·앞면 색이 그 색이 되게 쥐는 큐브 돌리기 */
function holdFaces(n: number, s: PuzzleState, up: number, front: number) {
  const mid = Math.floor(n / 2);
  const face = (t: PuzzleState, f: number) =>
    faceColors(n, t)[f * n * n + mid * n + mid];
  const r = ROTATIONS.find((x) => {
    const t = playN(n, s, x);
    return face(t, 0) === up && face(t, 2) === front;
  });
  if (r === undefined) throw new Error("쥘 방향이 없다");
  return r;
}

export interface ReducedStage {
  id: PathStageId | "oll-parity" | "pll-parity";
  moves: string;
  steps: PathStep[];
}

const YELLOW = 3;
/** 위를 보는 노란 엣지 수(노란 면 위로 쥔 3×3) */
function yellowUpEdges(s3: PuzzleState): number {
  const col = faceColors(3, s3);
  return [1, 3, 5, 7].filter((i) => col[i] === YELLOW).length;
}

/**
 * 센터가 맞고 엣지가 묶인 큰 큐브를 3×3 처음 맞추기 차례로 끝까지. 흰 위·초록 앞으로 쥐고 시작한다.
 * 단계마다 친 수를 돌려준다(패리티 공식은 따로 한 단계)
 */
export function solveReduced(
  n: 4 | 5,
  start: PuzzleState,
  /** 아래 두 층이 맞고 노란 면이 위인 큐브에서 마지막 층만(단원 해 보기) */
  lastLayerOnly = false,
): { state: PuzzleState; stages: ReducedStage[] } {
  const stages: ReducedStage[] = [];
  let s = start;
  const hold = lastLayerOnly ? "" : holdFaces(n, s, 0, 2);
  s = playN(n, s, hold);
  let pending = hold;
  const run = (id: PathStageId, before = "") => {
    s = playN(n, s, before);
    const r = runStage(id, project(n, s));
    const moves = join(pending, before, ...r.steps.map(stepMoves));
    pending = "";
    s = playN(n, s, r.steps.map(stepMoves).join(" "));
    stages.push({ id, moves, steps: r.steps });
  };
  if (!lastLayerOnly) {
    run("cross");
    run("corners");
    run("second", "z2");
  }
  // ① OLL 패리티
  if (yellowUpEdges(project(n, s)) % 2 === 1) {
    const u = ["", "U", "U'", "U2"].find(
      (x) => faceColors(3, project(n, playN(n, s, x)))[7] !== YELLOW,
    ) as string;
    const front = faceColors(n, s)[2 * n * n + n + 1] as number;
    s = playN(n, s, join(u, OLL_PARITY_ALG));
    const back = holdFaces(n, s, YELLOW, front);
    s = playN(n, s, back);
    stages.push({
      id: "oll-parity",
      moves: join(u, OLL_PARITY_ALG, back),
      steps: [],
    });
  }
  run("yellow-cross");
  run("edges");
  // ② PLL 패리티: 제자리 코너가 꼭 둘이거나, 「제자리 없음」 공식 뒤에도 꼭 하나가 아니면
  const placed = () => placedCorners(project(n, s)).length;
  let parity = placed() === 2;
  if (!parity && placed() === 0 && n === 4) {
    // 「제자리 없음」 한 걸음만 쳐 본다
    const first = nextStep("corner-place", project(n, s));
    if (first && first.caseId === "none") {
      const after = playN(n, s, stepMoves(first));
      const k = placedCorners(project(n, after)).length;
      if (k !== 1 && k !== 4) {
        s = after;
        stages.push({
          id: "corner-place",
          moves: stepMoves(first),
          steps: [first],
        });
        parity = true;
      }
    }
  }
  if (parity) {
    s = playN(n, s, PLL_PARITY_ALG);
    stages.push({ id: "pll-parity", moves: PLL_PARITY_ALG, steps: [] });
    run("edges");
  }
  run("corner-place");
  run("corner-twist");
  return { state: s, stages };
}
