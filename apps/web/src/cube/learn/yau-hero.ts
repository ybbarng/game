// 첫 화면 연출의 4×4 「야우」(docs/47 0절·8-6). 야우 풀이 함수(`yau-solve.ts`, 배우기 단원의 경우별 길)가 낸 수를
// 그대로 연출이 읽는 사람 해법 꼴(`HumanSolve`: 수 하나씩, 단계 경계, 살피는 자리)로 바꾼다. 수는 바꾸지 않는다.
//
// - 첫 면 색(`first`): 야우는 첫 두 센터와 십자를 함께 맞추므로 첫 면 색이 처음부터 정해진다. 그 색을 흰색으로 읽게
//   스티커 색을 바꿔(`firstFaceMap`, 큐브 돌리기 하나와 같은 바꿈이라 올바른 큐브 그대로) 흰색 차례로 푼다.
//   풀이는 색만 보므로 바꾼 큐브에서 낸 수가 원래 큐브도 같은 모양으로 맞춘다.
// - 단계: 첫 두 센터(`yau-centers`) → 십자 셋(`yau-cross3`) → 나머지 센터 → 마지막 십자 엣지(`yau-last-cross`) →
//   엣지 짝 → 「3×3처럼」(3×3 처음 맞추기 차례: 십자 · 첫 층 코너 · 둘째 층 엣지 · (패리티) · 노란 십자 · 옆면 맞추기 ·
//   (패리티) · 코너 자리 · 코너 방향). 십자는 야우가 이미 맞춰 두어 3×3 십자 단계가 큐브 돌리기뿐이면 첫 층 코너에 붙인다.
// - 살피는 자리: 걸음(경우 하나: 쥐기 + 공식)마다. 단계 첫 수는 넣지 않는다.
// Cubie 코어 `yau.rs` `solve_yau_human`이 같은 값을 낸다(공통 자료 `fixtures/hero-show-yau.json`).
import { firstFaceMap, type HumanSolve, type StageName } from "@game/cube-ai";
import type { PuzzleState } from "@game/puzzle-core";

import { solveYau, type YauPart, type YauStageId } from "./yau-solve";

const STAGE_OF: Readonly<Record<Exclude<YauStageId, "three">, StageName>> = {
  "centers-ud": "yau-centers",
  cross3: "yau-cross3",
  "centers-rest": "centers-rest",
  "last-cross": "yau-last-cross",
  edges: "edges",
};

const PART_OF: Readonly<Record<YauPart["id"], StageName>> = {
  cross: "cross",
  corners: "corners",
  second: "middle",
  "oll-parity": "oll-parity",
  "yellow-cross": "eo",
  edges: "ll-edges",
  "pll-parity": "pll-parity",
  "corner-place": "ll-corner-place",
  "corner-twist": "ll-corner-twist",
};

/** 4×4 스티커 색을 바꾼 상태(색 `c`가 `map[c]`가 된다). 조각 자리·방향은 그대로다 */
export function recolor(
  n: number,
  s: PuzzleState,
  map: readonly number[],
): PuzzleState {
  const nn = n * n;
  const perm = new Uint16Array(s.perm.length);
  for (let i = 0; i < perm.length; i++) {
    const p = s.perm[i] as number;
    perm[i] = (map[Math.floor(p / nn)] as number) * nn + (p % nn);
  }
  return { perm, twist: s.twist };
}

const tokens = (text: string) => text.split(/\s+/).filter(Boolean);
const isRotation = (m: string) => /^[xyz]/.test(m);

/**
 * 섞인 4×4를 야우로(첫 면 색 `first`, 0 흰 … 5 파랑). `until`이면 그 단계까지만 낸다(첫 면 색을 견줄 때,
 * 앞 단계의 수는 끝까지 푼 판과 같다)
 */
export function solveYauHuman(
  state: PuzzleState,
  first = 0,
  until?: StageName,
): HumanSolve {
  const r = solveYau(first ? recolor(4, state, firstFaceMap(first)) : state);
  const groups: { name: StageName; steps: string[] }[] = [];
  for (const st of r.stages) {
    if (st.id !== "three") {
      groups.push({ name: STAGE_OF[st.id], steps: st.steps });
      continue;
    }
    let carry: string[] = [];
    for (const p of st.parts ?? []) {
      // 이미 맞은 십자: 큐브 돌리기뿐인 십자 단계는 다음 단계의 첫 걸음에 붙인다
      if (p.id === "cross" && tokens(p.moves).every(isRotation)) {
        carry = tokens(p.moves);
        continue;
      }
      const steps = [...p.steps];
      if (carry.length) {
        steps[0] = [...carry, ...tokens(steps[0] ?? "")].join(" ");
        carry = [];
      }
      groups.push({ name: PART_OF[p.id], steps });
    }
  }
  const moves: string[] = [];
  const stages: HumanSolve["stages"] = [];
  const looks: number[] = [];
  for (const g of groups) {
    const start = moves.length;
    for (const step of g.steps) {
      const t = tokens(step);
      if (!t.length) continue;
      if (moves.length > start) looks.push(moves.length);
      moves.push(...t);
    }
    stages.push({ name: g.name, start, end: moves.length });
    if (g.name === until) break;
  }
  return { moves, stages, looks };
}
