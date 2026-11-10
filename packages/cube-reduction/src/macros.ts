/**
 * 축소법이 쓰는 짧은 공식 묶음(macro)과, 그 공식 앞에 붙이는 준비 수(setup).
 *
 * 공식 하나마다 "돌린 뒤 자리 p의 스티커가 원래 어디 있었나"(`src`)를 미리 계산해 두면,
 * 지금 큐브에서 그 공식이 무엇을 바꾸는지 몇 자리만 읽어 바로 알 수 있다.
 */
import type { CubeMove } from "@game/cube-engine";
import { faceOfSticker, reductionGeometry } from "./geometry";
import { invert, moves, outerMoves, simplify, sourceMap } from "./sim";

export interface Macro {
  readonly moves: readonly CubeMove[];
  readonly src: Int32Array;
  /** 움직이는 가운데 조각 자리 */
  readonly centers: readonly number[];
  /** 움직이는 모서리 칸 번호 */
  readonly slots: readonly number[];
  /** 모서리·가운데가 아닌 자리(꼭짓점)를 움직이는가 */
  readonly movesCorners: boolean;
  /** 움직이는 가운데 조각이 모두 제 면 안에서만 움직이는가(맞은 가운데를 그대로 둔다) */
  readonly centersKeepFace: boolean;
  /** 가운데 조각이 들고 나는 면(가운데 단계의 준비 수는 이 면들만 돌린다) */
  readonly centerFaces: readonly number[];
}

export function compileMacro(n: number, list: readonly CubeMove[]): Macro {
  const g = reductionGeometry(n);
  const src = sourceMap(n, list);
  const centers: number[] = [];
  const slots = new Set<number>();
  let movesCorners = false;
  let movesFixed = false;
  let centersKeepFace = true;
  const centerFaces = new Set<number>();
  for (let p = 0; p < src.length; p++) {
    if (src[p] === p) continue;
    if (g.isCenter[p]) {
      centers.push(p);
      const from = faceOfSticker(n, src[p] as number);
      const to = faceOfSticker(n, p);
      if (from !== to) {
        centersKeepFace = false;
        centerFaces.add(from);
        centerFaces.add(to);
      }
    } else if ((g.slotOf[p] as number) >= 0) slots.add(g.slotOf[p] as number);
    else if (g.fixedCenters.includes(p)) movesFixed = true;
    else movesCorners = true;
  }
  if (movesFixed)
    throw new Error("정가운데 조각을 움직이는 공식은 쓰지 않는다");
  return {
    moves: list,
    src,
    centers,
    slots: [...slots].sort((a, b) => a - b),
    movesCorners,
    centersKeepFace,
    centerFaces: [...centerFaces].sort((a, b) => a - b),
  };
}

/**
 * 안쪽 한 층 돌리기(축 3 × 층 × 1·2·3). 홀수 크기의 정가운데 층은 `withMiddle`일 때만
 * (정가운데 조각을 옮기므로 교환자 안에서만 쓴다).
 */
export function innerSlices(n: number, withMiddle = false): CubeMove[] {
  const out: CubeMove[] = [];
  for (const axis of ["x", "y", "z"] as const) {
    for (let l = 2; l <= n - 1; l++) {
      if (!withMiddle && n % 2 === 1 && l === (n + 1) / 2) continue;
      for (const turns of [1, 2, 3] as const) {
        out.push({ axis, from: l, to: l, turns });
      }
    }
  }
  return out;
}

function single(n: number): CubeMove[] {
  return outerMoves(n).map((l) => l[0] as CubeMove);
}

export interface CenterMacros {
  /** 안쪽 층 넣기 `s X s'` */
  readonly inserts: readonly Macro[];
  /** 세 조각 돌리기 */
  readonly cycles: readonly Macro[];
}

const centerCache = new Map<number, CenterMacros>();

/**
 * 가운데 맞추기 공식.
 * - 안쪽 층 넣기: `s X s'`(안쪽 층으로 한 줄을 다른 면에 올리고, 그 면을 돌리고, 되돌린다)
 * - 세 조각 돌리기: 교환자 `[A, B]`(A는 안쪽 층 하나나 `s X s'`, B는 수 하나) 가운데
 *   가운데 조각을 셋 이하만 바꾸는 것. 마지막 몇 조각에 쓴다.
 */
export function centerMacros(n: number): CenterMacros {
  const hit = centerCache.get(n);
  if (hit) return hit;
  const slices = innerSlices(n);
  const outer = single(n);
  const conj: CubeMove[][] = [];
  for (const s of slices) {
    for (const x of outer) {
      if (x.axis === s.axis) continue;
      conj.push([s, x, ...invert([s])]);
    }
  }
  const inserts: Macro[] = conj.map((l) => compileMacro(n, l));
  const out: Macro[] = [];
  const seen = new Set<string>();
  const g = reductionGeometry(n);
  const pairs: [CubeMove[], CubeMove[]][] = [];
  for (const a of [...slices.map((s) => [s]), ...conj]) {
    for (const b of [...outer, ...slices]) pairs.push([a, [b]]);
  }
  // [m, X s X']: 5×5의 가운데 줄 조각(+ 모양)은 정가운데 층(m)을 써야 셋만 돌릴 수 있다
  for (const m of innerSlices(n, true)) {
    if (m.turns === 2) continue;
    for (const x of outer) {
      if (x.axis === m.axis) continue;
      for (const s of slices) {
        if (s.axis === x.axis || s.turns === 2) continue;
        pairs.push([[m], [x, s, ...invert([x])]]);
      }
    }
  }
  for (const [a, b] of pairs) {
    const list = simplify([...a, ...b, ...invert(a), ...invert(b)]);
    const src = sourceMap(n, list);
    // 면을 건너가는 조각 수(같은 면 안에서 도는 것은 세지 않는다)
    let count = 0;
    let key = "";
    let fixed = false;
    for (const p of g.centers) {
      if (src[p] !== p) {
        if (faceOfSticker(n, src[p] as number) !== faceOfSticker(n, p)) count++;
        key += `${p}<${src[p]},`;
      }
    }
    for (const p of g.fixedCenters) if (src[p] !== p) fixed = true;
    if (fixed || count === 0 || count > 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(compileMacro(n, list));
  }
  const result = { inserts, cycles: out };
  centerCache.set(n, result);
  return result;
}

export interface EdgeMacros {
  /** 짝 짓기 `s B s'` */
  readonly pairs: readonly Macro[];
  /** 날개 세 개 돌리기와, 그것을 안쪽 층으로 감싼 것 */
  readonly cycles: readonly Macro[];
}

const edgeCache = new Map<number, EdgeMacros>();

/** 면 이름을 y축 돌리기만큼 바꾼 표기(R→F→L→B→R 차례로 `k`번) */
function relabelY(text: string, k: number): string {
  const ring = ["R", "F", "L", "B"];
  return text.replace(
    /[RFLB]/g,
    (c) => ring[(ring.indexOf(c) + k) % 4] as string,
  );
}

/** 위아래를 뒤집은 표기(x2: U↔D, F↔B) */
function flipUD(text: string): string {
  const map: Record<string, string> = { U: "D", D: "U", F: "B", B: "F" };
  return text.replace(/[UDFB]/g, (c) => map[c] as string);
}

/**
 * 모서리 짝 공식. 모두 가운데를 그대로 둔다.
 * - 짝 짓기 `s B s'`: 안쪽 층(s)으로 날개 하나를 옆 칸으로 옮겨 짝을 맞추고, 바깥층 수(B)로
 *   그 칸을 빼고 다른 칸을 넣은 뒤 되돌린다. B는 `X Y X'`(옆면-위·아래면-옆면)이나
 *   모서리 뒤집기(`R U R' F R' F' R`, 마지막 두 짝에 쓴다).
 * - 날개 세 개 돌리기: 교환자 `[s, X Y X']` 가운데 날개를 셋만 바꾸는 것.
 */
export function edgeMacros(n: number): EdgeMacros {
  const hit = edgeCache.get(n);
  if (hit) return hit;
  const g = reductionGeometry(n);
  const outer = single(n);
  const ySlices = innerSlices(n).filter((s) => s.axis === "y" && s.turns !== 2);
  const bTexts: string[] = [];
  for (const x of ["R", "R'", "L", "L'", "F", "F'", "B", "B'"]) {
    const xi = x.endsWith("'") ? x.slice(0, 1) : `${x}'`;
    for (const y of ["U", "U2", "U'", "D", "D2", "D'"]) {
      bTexts.push(`${x} ${y} ${xi}`);
    }
  }
  for (const base of ["R U R' F R' F' R", "R F' U R' F"]) {
    for (let k = 0; k < 4; k++) {
      for (const t of [base, flipUD(base)]) {
        const text = relabelY(t, k);
        bTexts.push(text);
        bTexts.push(
          text
            .split(" ")
            .reverse()
            .map((m) => (m.endsWith("'") ? m.slice(0, 1) : `${m}'`))
            .join(" "),
        );
      }
    }
  }
  const pairs: Macro[] = [];
  const cycleMacros: Macro[] = [];
  const seen = new Set<string>();
  const keep = (list: CubeMove[], out: Macro[]) => {
    const m = compileMacro(n, list);
    if (!m.centersKeepFace || m.slots.length === 0) return;
    let key = "";
    for (const s of m.slots) {
      key += `${s}:`;
      for (const p of g.slots[s]?.stickers ?? []) key += `${m.src[p]},`;
    }
    if (seen.has(key)) return;
    seen.add(key);
    out.push(m);
  };
  for (const s of ySlices) {
    for (const b of bTexts) keep([s, ...moves(n, b), ...invert([s])], pairs);
  }
  // 날개 세 개 돌리기
  const cycles: CubeMove[][] = [];
  for (const s of innerSlices(n).filter((m) => m.turns !== 2)) {
    for (const x of outer) {
      for (const y of outer) {
        if (x.axis === y.axis || x.axis === s.axis) continue;
        const b = [x, y, ...invert([x])];
        const list = [s, ...b, ...invert([s]), ...invert(b)];
        const m = compileMacro(n, list);
        if (!m.centersKeepFace || m.movesCorners || m.slots.length > 3)
          continue;
        keep(list, cycleMacros);
        cycles.push(list);
      }
    }
  }
  // 안쪽 층 하나로 감싼 날개 세 개 돌리기: 한 칸의 두 날개를 함께 바꾸는 모양(마지막 두 짝)
  for (const c of cycles) {
    for (const s of ySlices) {
      const list = [s, ...c, ...invert([s])];
      const m = compileMacro(n, list);
      if (!m.centersKeepFace || m.slots.length > 2) continue;
      keep(list, cycleMacros);
    }
  }
  const result = { pairs, cycles: cycleMacros };
  edgeCache.set(n, result);
  return result;
}

const parityCache = new Map<string, Macro[]>();

/** 날개 묶음 하나(모서리 끝에서 `depth`칸)만 도는 안쪽 한 층 표기로 바꾼다(`2R` → `3R` 등) */
function atDepth(text: string, depth: number): string {
  return text.replace(/\b2([RL])/g, `${depth + 1}$1`);
}

/**
 * 한 모서리의 두 날개 맞바꾸기(모서리 패리티). 날개 순열의 홀짝을 바꾸는 유일한 공식이라
 * 짝 수가 늘지 않아도 쓴다(마지막 두 모서리에서 다른 공식으로 더 나아가지 못할 때).
 * `depth`는 날개 묶음(모서리 끝에서 떨어진 칸 수, 6×6·7×7은 1·2): 그 묶음의 안쪽 층만 돌린다.
 */
export function edgeParityMacros(n: number, depth = 1): Macro[] {
  const key = `${n}:${depth}`;
  const hit = parityCache.get(key);
  if (hit) return hit;
  const out: Macro[] = [];
  const base = atDepth(EDGE_PARITY_TEXT, depth);
  for (let k = 0; k < 4; k++) {
    for (const t of [base, flipUD(base)]) {
      out.push(compileMacro(n, moves(n, relabelY(t, k))));
    }
  }
  parityCache.set(key, out);
  return out;
}

/**
 * 한 모서리(UF)의 두 날개를 맞바꾸는 공식. 4×4에서는 OLL 패리티, 5×5에서는 모서리 패리티.
 * 안쪽 한 층(`2R`·`2L`)만 써서 가운데를 그대로 둔다.
 */
export const EDGE_PARITY_TEXT =
  "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2";

/** 4×4 PLL 패리티: 위층의 두 모서리 짝(UF·UB)을 맞바꾼다 */
export const PLL_PARITY_TEXT = "2R2 U2 2R2 Uw2 2R2 2U2";

/** 짝수 크기의 안쪽 층 묶음(2층 ~ 가운데까지) 표기. 4×4는 `2R` 한 층 */
function innerBlock(n: number, face: string): string {
  const h = n / 2;
  return h === 2 ? `2${face}` : `2-${h}${face}w`;
}

/**
 * 짝수 크기 OLL 패리티(3×3으로 볼 때 짝 지은 모서리 하나 뒤집기): 4×4 공식의 안쪽 한 층을 안쪽 층 묶음
 * 전부로 넓힌다(6×6은 `2-3Rw`). 4×4는 `EDGE_PARITY_TEXT` 그대로
 */
export function ollParityText(n: number): string {
  return EDGE_PARITY_TEXT.replace(/\b2([RL])/g, (_, f: string) =>
    innerBlock(n, f),
  );
}

/** 짝수 크기 PLL 패리티(짝 지은 모서리 둘 맞바꾸기): 4×4 공식을 안쪽 층 묶음으로 넓힌다 */
export function pllParityText(n: number): string {
  const h = n / 2;
  const r = innerBlock(n, "R");
  const wideU = h === 2 ? "Uw" : `${h}Uw`;
  return `${r}2 U2 ${r}2 ${wideU}2 ${r}2 ${innerBlock(n, "U")}2`;
}
