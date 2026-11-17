import {
  type CubeMove,
  faceColors,
  formatMove,
  moveTable,
  parseMoves,
} from "@game/cube-engine";
import { reductionGeometry } from "@game/cube-reduction";
import type { PuzzleState } from "@game/puzzle-core";

/**
 * 4×4 컴퓨터 야우의 짧은 엣지 짝(docs/47 10-5). 흰 십자 넷이 아래 층에 맞고 센터가 모두 맞은 4×4에서, 남은 엣지 여덟
 * (위 층 넷·가운데 층 넷)을 십자와 센터를 깨지 않고 짝짓는다. 실제 야우 사용자의 짝짓기(3-2-3 등)처럼
 * 안쪽 가로층(2U·2D·Uw·Dw)으로 날개를 맞대고, 십자를 지키는 바깥층 수(R U R'·뒤집기 R U R' F R' F' R 등)로 짝을 빼낸 뒤
 * 그 층을 되돌린다. 걸음마다 「준비 수(십자를 지키는 바깥층 수) + 공식(안쪽 층 s · 바깥층 수 X · s 되돌리기)」 가운데
 * 수 하나당 짝이 가장 많이 느는 것을 고른다(같으면 표의 차례에서 앞선 것). 한 걸음으로 늘릴 수 없으면(남은 셋이 위 층에서
 * 날개를 서로 바꿔 든 모양 등) 준비 수나 공식 하나를 먼저 두고 그 뒤 한 걸음으로 늘리는 두 걸음을 본다. 차례가 정해져 있어
 * 같은 상태면 늘 같은 수다. 대회 섞기 300개(씨앗 1000부터)에서 평균 27.5수·가장 김 44수, 한 판에 약 0.1초
 * (단원 규칙 엣지 짝은 평균 86.6수, 축소법 컴퓨터의 엣지 열둘 짝은 약 22수).
 *
 * 배우기 단원과 첫 화면 연출은 단원 규칙(`taught-big.ts` `runEdges444`)을 그대로 쓴다(배우는 사람이 따라 하는 길).
 * 이 풀이는 고수·초고수 컴퓨터만 쓴다
 */

const N = 4;
const SIZE = 6 * N * N;
const D_FACE = 3;

const face = (p: number) => Math.floor(p / (N * N));

/** 수열을 돌린 뒤 자리 p의 스티커가 원래 있던 자리 */
function sourceOf(moves: readonly CubeMove[]): Int32Array {
  let cur = new Int32Array(SIZE);
  let next = new Int32Array(SIZE);
  for (let i = 0; i < SIZE; i++) cur[i] = i;
  for (const m of moves) {
    const dest = moveTable(N, m).dest;
    for (let i = 0; i < SIZE; i++) next[dest[i] as number] = cur[i] as number;
    [cur, next] = [next, cur];
  }
  return cur;
}

const geometry = () => reductionGeometry(N);

/**
 * 지킬 십자 자리: 아래 층 엣지 자리 가운데 제 엣지 블럭이 짝지어 제자리에 든 것(번호는 `reductionGeometry` 자리 차례).
 * 보통 넷이다. 단원 길의 옆 센터 넣기(R)가 흰 십자 셋 단계에서 비운 자리에 미리 들어간 흰 엣지 블럭을 빼낼 때가 있어
 * (섞기 300개 가운데 하나) 그때는 셋만 지키고, 빠진 하나는 뒤의 「3×3처럼」 십자 단계가 넣는다
 */
function keptCross(c: Uint8Array): number[] {
  const center = (f: number) => c[f * N * N + N + 1];
  const out: number[] = [];
  geometry().slots.forEach((s, i) => {
    if (!s.faces.includes(D_FACE)) return;
    const ok = s.pieces.every(
      ([p, q]) => c[p] === center(face(p)) && c[q] === center(face(q)),
    );
    if (ok) out.push(i);
  });
  return out;
}

/** 지킬 자리의 스티커와, 짝지을 나머지 자리(자리마다 [날개 0 첫 면, 날개 0 둘째 면, 날개 1 첫 면, 날개 1 둘째 면]) */
function splitSlots(kept: readonly number[]): {
  keep: number[];
  open: number[][];
} {
  const slots = geometry().slots;
  return {
    keep: kept.flatMap((i) => [...(slots[i]?.stickers ?? [])]),
    open: slots.filter((_, i) => !kept.includes(i)).map((s) => s.pieces.flat()),
  };
}

interface Macro {
  moves: string[];
  src: Int32Array;
}

const SLICES = ["2U", "2D", "Uw", "Dw"].flatMap((l) =>
  ["", "'", "2"].map((t) => `${l}${t}`),
);

const inv = (m: string) =>
  m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`;

/** 십자를 지키는 바깥층 수열을 이룰 면(D는 십자를 돌린다) */
const OUTER_FACES = ["U", "R", "F", "L", "B"];
const AXIS: Readonly<Record<string, string>> = {
  U: "y",
  R: "x",
  L: "x",
  F: "z",
  B: "z",
};

/** 바깥층 수열 길이 1~`max`(같은 면을 잇달아 두지 않고, 맞은편 면은 정한 차례로만) */
function outerSequences(max: number): string[][] {
  const singles = OUTER_FACES.flatMap((f) =>
    ["", "'", "2"].map((t) => `${f}${t}`),
  );
  const out: string[][] = [];
  let frontier: string[][] = [[]];
  for (let len = 1; len <= max; len++) {
    const next: string[][] = [];
    for (const seq of frontier) {
      const last = seq.at(-1);
      for (const m of singles) {
        if (last) {
          const lf = last[0] as string;
          const mf = m[0] as string;
          if (lf === mf) continue;
          if (
            AXIS[lf] === AXIS[mf] &&
            OUTER_FACES.indexOf(lf) > OUTER_FACES.indexOf(mf)
          )
            continue;
        }
        next.push([...seq, m]);
      }
    }
    out.push(...next);
    frontier = next;
  }
  return out;
}

/** 엣지 뒤집기(앞-오른쪽 엣지를 뒤집어 위 층 엣지와 바꾼다)와 그 거울·거꾸로, 네 옆면마다 */
function flips(): string[][] {
  const base = ["R U R' F R' F' R", "L' U' L F' L F L'"];
  const all = base.flatMap((b) => {
    const m = b.split(" ");
    return [m, m.toReversed().map(inv)];
  });
  // y 쪽으로 옆면 이름을 바꿔 네 자리에
  const turn: Readonly<Record<string, string>> = {
    R: "B",
    B: "L",
    L: "F",
    F: "R",
    U: "U",
  };
  const out: string[][] = [];
  for (const seq of all) {
    let cur = seq;
    for (let k = 0; k < 4; k++) {
      out.push(cur);
      cur = cur.map((m) => `${turn[m[0] as string]}${m.slice(1)}`);
    }
  }
  return out;
}

interface Tables {
  setups: Macro[];
  macros: Macro[];
  slots: number[][];
}

/** 지킬 십자 자리마다 한 번 만든다(보통 넷 모두 지키는 표 하나) */
const tables = new Map<string, Tables>();

function tablesFor(kept: readonly number[]): Tables {
  const key = kept.join(",");
  let t = tables.get(key);
  if (!t) {
    t = build(kept);
    tables.set(key, t);
  }
  return t;
}

function build(kept: readonly number[]): Tables {
  const { keep: cross, open } = splitSlots(kept);
  const centers = geometry().centers;
  const keeps = (src: Int32Array) =>
    cross.every((p) => src[p] === p) &&
    centers.every((p) => face(src[p] as number) === face(p));
  const seen = new Set<string>();
  const make = (moves: string[]): Macro | null => {
    const src = sourceOf(parseMoves(N, moves.join(" ")));
    if (!keeps(src)) return null;
    const key = src.join(",");
    if (seen.has(key)) return null;
    seen.add(key);
    return { moves, src };
  };
  const outer = outerSequences(3);
  // 준비 수: 십자를 지키는 바깥층 수열(빈 수 포함). 짧은 것부터라 같은 효과면 짧은 것이 남는다
  const setups: Macro[] = [{ moves: [], src: sourceOf([]) }];
  seen.add(setups[0]?.src.join(",") as string);
  for (const seq of outer) {
    const m = make(seq);
    if (m) setups.push(m);
  }
  const middles = [...outer, ...flips()];
  const macros: Macro[] = [];
  for (const s of SLICES) {
    for (const x of middles) {
      const m = make([s, ...x, inv(s)]);
      if (m) macros.push(m);
    }
  }
  macros.sort((a, b) => a.moves.length - b.moves.length);
  return { setups, macros, slots: open };
}

function paired(c: Uint8Array, slot: number[]): boolean {
  return (
    c[slot[0] as number] === c[slot[2] as number] &&
    c[slot[1] as number] === c[slot[3] as number]
  );
}

function pairedCount(c: Uint8Array, slots: readonly number[][]): number {
  let k = 0;
  for (const s of slots) if (paired(c, s)) k++;
  return k;
}

/** 걸음 하나: 준비 수 + 공식. 짝이 늘지 않으면 null */
function bestStep(c: Uint8Array, t: Tables): string[] | null {
  const before = pairedCount(c, t.slots);
  const cs = new Uint8Array(SIZE);
  let best: { moves: string[]; ratio: number } | null = null;
  for (const setup of t.setups) {
    for (let p = 0; p < SIZE; p++) cs[p] = c[setup.src[p] as number] as number;
    for (const macro of t.macros) {
      const length = setup.moves.length + macro.moves.length;
      const src = macro.src;
      let after = 0;
      for (const s of t.slots) {
        if (
          cs[src[s[0] as number] as number] ===
            cs[src[s[2] as number] as number] &&
          cs[src[s[1] as number] as number] ===
            cs[src[s[3] as number] as number]
        )
          after++;
      }
      const gain = after - before;
      if (gain <= 0) continue;
      const ratio = length / gain;
      if (!best || ratio < best.ratio)
        best = { moves: [...setup.moves, ...macro.moves], ratio };
    }
  }
  return best?.moves ?? null;
}

const play = (c: Uint8Array, src: Int32Array) => {
  const out = new Uint8Array(SIZE);
  for (let p = 0; p < SIZE; p++) out[p] = c[src[p] as number] as number;
  return out;
};

/**
 * 한 걸음으로 짝이 늘지 않을 때(마지막 두 엣지가 서로 날개를 바꿔 든 모양 등): 공식 하나를 먼저 하고 그 뒤 한 걸음으로
 * 늘리는 것 가운데 수 하나당 가장 많이 느는 것
 */
function bestTwoSteps(c: Uint8Array, t: Tables): string[][] | null {
  const before = pairedCount(c, t.slots);
  let best: { steps: string[][]; ratio: number } | null = null;
  for (const first of [...t.setups.slice(1), ...t.macros]) {
    const c1 = play(c, first.src);
    const second = bestStep(c1, t);
    if (!second) continue;
    const c2 = play(c1, sourceOf(parseMoves(N, second.join(" "))));
    const gain = pairedCount(c2, t.slots) - before;
    if (gain <= 0) continue;
    const ratio = (first.moves.length + second.length) / gain;
    if (!best || ratio < best.ratio)
      best = { steps: [first.moves, second], ratio };
  }
  return best?.steps ?? null;
}

/**
 * 센터가 맞고 흰 십자가 아래 층에 든 4×4(야우 마지막 십자 엣지 뒤)의 엣지를 모두 짝짓는 걸음들(걸음마다 수 글).
 * 제자리에 든 십자 엣지 블럭(보통 넷, `keptCross`)과 센터는 그대로 둔다
 */
export function yauEdgesShort(state: PuzzleState, limit = 20): string[] {
  let c = faceColors(N, state);
  const t = tablesFor(keptCross(c));
  const steps: string[] = [];
  while (pairedCount(c, t.slots) < t.slots.length) {
    const one = bestStep(c, t);
    const list = one ? [one] : bestTwoSteps(c, t);
    if (!list) throw new Error("야우 엣지 짝을 더 맞출 공식을 찾지 못했다");
    for (const step of list) {
      steps.push(step.join(" "));
      c = play(c, sourceOf(parseMoves(N, step.join(" "))));
    }
    if (steps.length > limit) throw new Error("야우 엣지 짝이 끝나지 않는다");
  }
  return steps.map((s) =>
    parseMoves(N, s)
      .map((m) => formatMove(N, m))
      .join(" "),
  );
}
