import { FACES } from "@game/cube-solver";
import { EDGE_FACELETS } from "./cubie";
import { type Solve, yTurn } from "./solve";

/**
 * 배우기에서 가르치는 방식 그대로의 흰 십자와 첫 층 꼭짓점(흰 면 위, docs/47 0절 2026-11-04).
 * 첫 화면 연출(초보자 해법)만 쓴다. 컴퓨터 대결 계획(`botPlan`)은 기존 해법을 그대로 써서
 * 다른 기기가 다시 계산한 계획과 어긋나지 않는다.
 *
 * 십자(`learn/lessons-333.ts` 「흰 십자」의 다섯 경우):
 * 1. 아래층, 흰색이 아래: D로 옆색을 같은 가운데 밑에 맞추고 그 면 반 바퀴.
 * 2. 가운데 줄: 흰색이 아닌 쪽 색이 붙은 면을 한 번 돌려 올린다. 옆색이 그 면 가운데와 다르면
 *    U로 제자리를 그 면에 비켜 놓고, 올리고, U를 되돌린다(이미 넣은 모서리를 지킨다).
 * 3. 아래층, 흰색이 옆: 그 면을 한 번 돌려 가운데 줄로 올린 뒤 2.
 * 4. 윗층에서 뒤집힘: 그 면을 한 번 돌려 가운데 줄로 내린 뒤 2.
 * 5. 윗층 흰색 위, 엉뚱한 자리: 그 면 반 바퀴로 내린 뒤 1(아직 넣은 것이 없으면 U만 돌려도 된다).
 *
 * 첫 층 꼭짓점: 넣을 칸을 앞-오른쪽 위(UFR)에 오게 y로 돌려 쥐고, 그 흰 꼭짓점을 D로 바로 밑(DFR)에
 * 데려와 `R' D' R D`를 흰색이 위로 올 때까지 되풀이한다. 윗층 엉뚱한 자리에 박힌 꼭짓점은 그 칸을
 * UFR에 두고 `R' D' R D` 한 번으로 뺀다.
 *
 * 모두 흰 가운데가 위에 있는 기준 방향 글자(`Solve.rel()`)로 판단한다.
 */

export const TAUGHT_CORNER_TRIGGER = "R' D' R D";

type FaceLetter = (typeof FACES)[number];
const faceOf = (i: number) => FACES[Math.floor(i / 9)] as FaceLetter;

/** 흰 면을 위로 든다(흰 가운데가 이미 위면 그대로) */
export function whiteUp(s: Solve): void {
  for (const r of ["", "x2", "x", "x'", "z", "z'"]) {
    if (s.clone().apply(r).f[4] === "U") {
      s.apply(r);
      return;
    }
  }
  throw new Error("흰 가운데를 찾지 못했다");
}

interface WhiteEdge {
  slot: number;
  /** 흰 스티커 자리 */
  white: number;
  /** 다른 색 스티커 자리 */
  other: number;
  /** 다른 색(제자리 옆면) */
  color: FaceLetter;
}

function whiteEdges(rel: string): WhiteEdge[] {
  const out: WhiteEdge[] = [];
  EDGE_FACELETS.forEach(([a, b], slot) => {
    if (rel[a] === "U")
      out.push({ slot, white: a, other: b, color: rel[b] as FaceLetter });
    else if (rel[b] === "U")
      out.push({ slot, white: b, other: a, color: rel[a] as FaceLetter });
  });
  return out;
}

/** 십자 자리(UR UF UL UB)의 옆 스티커 */
const CROSS_SIDE = [10, 19, 37, 46];

function crossSolvedSlots(rel: string): number[] {
  return [0, 1, 2, 3].filter((j) => {
    const [a, b] = EDGE_FACELETS[j] as readonly [number, number];
    return rel[a] === "U" && rel[b] === faceOf(b);
  });
}

/** 색 `c` 모서리의 십자 자리 */
const homeOf = (c: FaceLetter) => CROSS_SIDE.findIndex((i) => faceOf(i) === c);

const D_TURNS = ["", "D", "D'", "D2"];
const U_GUARD = ["", "U", "U'", "U2"];
const inverseU: Record<string, string> = {
  "": "",
  U: "U'",
  "U'": "U",
  U2: "U2",
};

export type CrossCase =
  | "down-white-down"
  | "middle"
  | "down-white-side"
  | "top-flipped"
  | "top-wrong";

const CASE_ORDER: readonly CrossCase[] = [
  "down-white-down",
  "middle",
  "down-white-side",
  "top-flipped",
  "top-wrong",
];

function caseOf(e: WhiteEdge): CrossCase {
  if (e.slot >= 8) return "middle";
  if (e.slot >= 4)
    return faceOf(e.white) === "D" ? "down-white-down" : "down-white-side";
  return faceOf(e.white) === "U" ? "top-wrong" : "top-flipped";
}

const join = (...parts: string[]) => parts.filter(Boolean).join(" ");

/** 가운데 줄 모서리를 올리는 수 후보(바로 올리기 먼저, 그다음 U로 비켜 놓기) */
function middleCandidates(e: WhiteEdge): string[] {
  const o = faceOf(e.other);
  const out: string[] = [];
  for (const u of U_GUARD)
    for (const t of [o, `${o}'`]) out.push(join(u, t, inverseU[u] as string));
  return out;
}

/** 그 면을 한 번 돌려 가운데 줄로 보내는 수(흰 스티커가 붙은 면) */
function toMiddleCandidates(e: WhiteEdge): string[] {
  const w = faceOf(e.white);
  return [w, `${w}'`];
}

/** 모서리 하나를 경우대로 올리는 수 후보(짧은 것부터 고른다) */
function edgeCandidates(s: Solve, e: WhiteEdge): string[] {
  const kind = caseOf(e);
  if (kind === "down-white-down")
    return D_TURNS.map((d) => join(d, `${e.color}2`));
  if (kind === "middle") return middleCandidates(e);
  const out: string[] = [];
  if (kind === "top-wrong") {
    // 아직 넣은 것이 없으면 윗면만 돌려 맞출 수도 있다(레슨: 「U'로 윗면을 돌리면 맞아요」)
    out.push("U", "U'", "U2");
    const down = `${faceOf(e.other)}2`;
    for (const d of D_TURNS) out.push(join(down, d, `${e.color}2`));
    return out;
  }
  const pres = kind === "down-white-side" ? D_TURNS : [""];
  for (const pre of pres) {
    const t1 = s.clone().apply(pre);
    const moved = whiteEdges(t1.rel()).find((x) => x.color === e.color);
    if (!moved) continue;
    for (const m of toMiddleCandidates(moved)) {
      const t2 = t1.clone().apply(m);
      const mid = whiteEdges(t2.rel()).find((x) => x.color === e.color);
      if (!mid || mid.slot < 8) continue;
      for (const up of middleCandidates(mid)) out.push(join(pre, m, up));
    }
  }
  return out;
}

const length = (alg: string) => (alg ? alg.split(" ").length : 0);

/**
 * 다음에 넣을 흰 모서리 하나와 그 수. 쉬운 경우(1→5 차례)의 모서리부터, 이미 넣은 것을 지키며
 * 그 모서리를 넣는 가장 짧은 후보. 십자가 다 됐으면 null.
 */
export function nextCrossEdge(
  s: Solve,
): { kind: CrossCase; color: FaceLetter; alg: string } | null {
  const rel = s.rel();
  const solved = crossSolvedSlots(rel);
  if (solved.length === 4) return null;
  const todo = whiteEdges(rel).filter(
    (e) => !(e.slot < 4 && solved.includes(e.slot)),
  );
  for (const kind of CASE_ORDER) {
    for (const e of todo.filter((x) => caseOf(x) === kind)) {
      let best: string | null = null;
      for (const alg of edgeCandidates(s, e)) {
        if (best !== null && length(alg) >= length(best)) continue;
        const after = crossSolvedSlots(s.clone().apply(alg).rel());
        if (
          after.includes(homeOf(e.color)) &&
          solved.every((j) => after.includes(j))
        )
          best = alg;
      }
      if (best !== null) return { kind, color: e.color, alg: best };
    }
  }
  throw new Error("십자 모서리를 넣을 수를 찾지 못했다");
}

/** 배우는 방식 흰 십자(흰 면 위). 모서리마다 살피고 하나씩 넣는다 */
export function crossTaught(s: Solve): void {
  for (let i = 0; ; i++) {
    if (i > 4) throw new Error("십자 단계가 끝나지 않는다");
    const next = nextCrossEdge(s);
    if (!next) return;
    s.look();
    s.apply(next.alg);
  }
}

const cornerOk = (cp: number[], co: number[], slot: number) =>
  cp[slot] === slot && co[slot] === 0;

const dTurn = (a: number) => ["", "D", "D2", "D'"][a] as string;

/** 배우는 방식 첫 층 꼭짓점(흰 면 위, `R' D' R D`) */
export function cornersTaught(s: Solve): void {
  const U_CORNERS = [0, 1, 2, 3];
  for (let iter = 0; ; iter++) {
    if (iter > 20) throw new Error("첫 층 꼭짓점 단계가 끝나지 않는다");
    const c = s.cubie();
    if (U_CORNERS.every((i) => cornerOk(c.cp, c.co, i))) return;
    s.look();
    // 아래층에 흰 꼭짓점이 있으면: 그 제자리를 UFR로 돌려 쥐고, D로 바로 밑에 데려와 되풀이
    const k = [0, 1, 2, 3].find(
      (k) => s.clone().apply(yTurn(k)).cubie().cp.indexOf(0) >= 4,
    );
    if (k !== undefined) {
      s.apply(yTurn(k));
      const a = [0, 1, 2, 3].find(
        (a) => s.clone().apply(dTurn(a)).cubie().cp[4] === 0,
      ) as number;
      s.apply(dTurn(a));
      for (let r = 0; ; r++) {
        if (r > 6) throw new Error("꼭짓점 넣기가 끝나지 않는다");
        const t = s.cubie();
        if (cornerOk(t.cp, t.co, 0)) break;
        s.apply(TAUGHT_CORNER_TRIGGER);
      }
      continue;
    }
    // 아래층에 없으면 윗층에 잘못 박힌 꼭짓점을 UFR로 돌려 한 번 뺀다
    const j = [0, 1, 2, 3].find((j) => {
      const t = s.clone().apply(yTurn(j)).cubie();
      return !cornerOk(t.cp, t.co, 0);
    }) as number;
    s.apply(yTurn(j)).apply(TAUGHT_CORNER_TRIGGER);
  }
}
