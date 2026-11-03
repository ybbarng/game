// 시험 전용: 3×3(과 2×2 흉내) 상태를 조각 단위로 읽는다. sim.ts 위에서 돈다.
// 색 번호: U=0 R=1 F=2 D=3 L=4 B=5. 위층(y=2)은 OLL·PLL 대상, 아래층(y=-2)은 십자 쪽.
import { apply, type Cube, colorMap, key, normalize, solved } from "./sim";

type V = [number, number, number];

const U_COLOR = 0;
const D_COLOR = 3;

function det(a: V, b: V, c: V): number {
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])
  );
}

function stickersAt(c: Cube, pos: V): { normal: V; color: number }[] {
  return c.stickers
    .filter(
      (s) => s.pos[0] === pos[0] && s.pos[1] === pos[1] && s.pos[2] === pos[2],
    )
    .map((s) => ({ normal: s.normal as V, color: s.color }));
}

const posKey = (p: readonly number[]) => p.join(",");

// 맞춘 상태에서 조각 색 묶음 → 그 조각의 집 자리
const HOME = (() => {
  const m = new Map<string, string>();
  const s = solved(3);
  const seen = new Set<string>();
  for (const st of s.stickers) {
    const k = posKey(st.pos);
    if (seen.has(k)) continue;
    seen.add(k);
    const colors = stickersAt(s, st.pos as V)
      .map((x) => x.color)
      .sort()
      .join("");
    m.set(colors, k);
  }
  return m;
})();

export function homeOf(c: Cube, pos: V): string {
  const colors = stickersAt(c, pos)
    .map((x) => x.color)
    .sort()
    .join("");
  const h = HOME.get(colors);
  if (h === undefined) throw new Error(`모르는 조각 ${colors}`);
  return h;
}

/** 꼭짓점 방향: 위·아래 색(흰·노랑) 스티커가 세로면이면 0, 시계 방향 다음 면이면 1, 그다음이면 2 */
export function cornerOri(c: Cube, pos: V): number {
  const st = stickersAt(c, pos);
  const vert = st.find((s) => s.normal[1] !== 0);
  const sides = st.filter((s) => s.normal[1] === 0);
  if (!vert || sides.length !== 2) throw new Error("꼭짓점이 아니다");
  let [s1, s2] = sides as [(typeof sides)[number], (typeof sides)[number]];
  if (det(vert.normal, s1.normal, s2.normal) > 0) [s1, s2] = [s2, s1];
  const order = [vert, s1, s2];
  const i = order.findIndex((s) => s.color === U_COLOR || s.color === D_COLOR);
  return i;
}

/** 모서리 방향: 기준색(위·아래 색, 없으면 앞·뒤 색)이 기준면(위·아래, 가운데 줄이면 앞·뒤)에 있으면 0 */
export function edgeOri(c: Cube, pos: V): number {
  const st = stickersAt(c, pos);
  const refColor = st.some((s) => s.color === U_COLOR || s.color === D_COLOR)
    ? (s: number) => s === U_COLOR || s === D_COLOR
    : (s: number) => s === 2 || s === 5;
  const onRefFace = (n: V) => (pos[1] !== 0 ? n[1] !== 0 : n[2] !== 0);
  const r = st.find((s) => refColor(s.color));
  if (!r) throw new Error("모서리가 아니다");
  return onRefFace(r.normal) ? 0 : 1;
}

// 위층 자리. 인덱스 i의 조각은 U 한 번에 i+1 자리로 간다.
export const LL_CORNERS: V[] = [
  [2, 2, 2],
  [-2, 2, 2],
  [-2, 2, -2],
  [2, 2, -2],
];
export const LL_EDGES: V[] = [
  [0, 2, 2],
  [-2, 2, 0],
  [0, 2, -2],
  [2, 2, 0],
];

/** 아래 두 층(위층을 뺀 모든 스티커)이 맞아 있나. 큐브 방향은 가운데 기준으로 맞춘 뒤 본다 */
export function f2lIntact(c: Cube): boolean {
  const n = normalize(c);
  const ref = colorMap(solved(3));
  return n.stickers.every(
    (s) => s.pos[1] === 2 || ref.get(key(s.pos, s.normal)) === s.color,
  );
}

/** 아래층 십자(아래 모서리 넷)가 맞아 있나 */
export function crossIntact(c: Cube): boolean {
  const n = normalize(c);
  const ref = colorMap(solved(3));
  return n.stickers.every((s) => {
    const isCrossEdge =
      s.pos[1] === -2 && (s.pos[0] === 0) !== (s.pos[2] === 0);
    return !isCrossEdge || ref.get(key(s.pos, s.normal)) === s.color;
  });
}

/** 앞-오른쪽 칸을 뺀 아래 두 층이 맞아 있나 */
export function otherSlotsIntact(c: Cube): boolean {
  const n = normalize(c);
  const ref = colorMap(solved(3));
  return n.stickers.every((s) => {
    if (s.pos[1] === 2) return true;
    const frCorner = s.pos[0] === 2 && s.pos[1] === -2 && s.pos[2] === 2;
    const frEdge = s.pos[0] === 2 && s.pos[1] === 0 && s.pos[2] === 2;
    return frCorner || frEdge || ref.get(key(s.pos, s.normal)) === s.color;
  });
}

/** 위층 방향 무늬(꼭짓점 4 + 모서리 4) */
export function llOrientation(c: Cube): string {
  const n = normalize(c);
  return [
    ...LL_CORNERS.map((p) => cornerOri(n, p)),
    ...LL_EDGES.map((p) => edgeOri(n, p)),
  ].join("");
}

/** 위층 무늬를 큐브를 돌려 보는 방향(U 넷)과 상관없게: 가장 작은 문자열 */
export function ollKey(c: Cube): string {
  let best = "";
  for (const a of ["", "U", "U2", "U'"]) {
    const k = llOrientation(apply(c, a));
    if (best === "" || k < best) best = k;
  }
  return best;
}

/** 위층 자리 바꿈(자리마다 그 조각의 집 번호) */
export function llPermutation(c: Cube): string {
  const n = normalize(c);
  const idx = (h: string, list: V[]) => list.findIndex((p) => posKey(p) === h);
  const cs = LL_CORNERS.map((p) => idx(homeOf(n, p), LL_CORNERS));
  const es = LL_EDGES.map((p) => idx(homeOf(n, p), LL_EDGES));
  return [...cs, ...es].join("");
}

const AUF = ["", "U", "U2", "U'"];

/** PLL 상황 열쇠: 공식 앞뒤 윗면 돌리기(16가지) 중 가장 작은 자리 바꿈 */
export function pllKey(inverseAlg: string): string {
  let best = "";
  for (const b of AUF) {
    for (const a of AUF) {
      const k = llPermutation(apply(solved(3), `${b} ${inverseAlg} ${a}`));
      if (best === "" || k < best) best = k;
    }
  }
  return best;
}

/** 위층이 윗면 돌리기 하나로 맞나 */
export function llSolvedUpToAuf(c: Cube): boolean {
  return (
    AUF.some((a) => llPermutation(apply(c, a)) === "01230123") &&
    llOrientation(c) === "00000000"
  );
}

/** 꼭짓점 네 개 자리만 본 바꿈 종류: 맞음 / 이웃 둘 바꿈 / 대각 둘 바꿈 / 기타 */
export function cornerPermClass(
  perm: number[],
): "solved" | "adjacent" | "diagonal" | "other" {
  let cls: "solved" | "adjacent" | "diagonal" | "other" = "other";
  for (let r = 0; r < 4; r++) {
    const p = perm.map((x) => (x + r) % 4);
    const wrong = p.map((x, i) => (x === i ? -1 : i)).filter((i) => i >= 0);
    if (wrong.length === 0) return "solved";
    if (wrong.length === 2) {
      const [i, j] = wrong as [number, number];
      if (p[i] === j && p[j] === i)
        cls = Math.abs(i - j) === 2 ? "diagonal" : "adjacent";
    }
  }
  return cls;
}

export function llCornerPerm(c: Cube): number[] {
  const n = normalize(c);
  return LL_CORNERS.map((p) =>
    LL_CORNERS.findIndex((q) => posKey(q) === homeOf(n, p)),
  );
}

// 아래층 꼭짓점(2×2 오르테가용). U 한 번과 같은 방향으로 돈다
export const DL_CORNERS: V[] = [
  [2, -2, 2],
  [-2, -2, 2],
  [-2, -2, -2],
  [2, -2, -2],
];

export function dlCornerPerm(c: Cube): number[] {
  const n = normalize(c);
  return DL_CORNERS.map((p) =>
    DL_CORNERS.findIndex((q) => posKey(q) === homeOf(n, p)),
  );
}

/** 꼭짓점 여덟 개가 모두 위·아래 색을 위·아래로 두고 있나 */
export function allCornersOriented(c: Cube): boolean {
  const n = normalize(c);
  return [...LL_CORNERS, ...DL_CORNERS].every((p) => cornerOri(n, p) === 0);
}

/** 위층 꼭짓점 방향만(2×2·OCLL) */
export function llCornerOriKey(c: Cube): string {
  let best = "";
  for (const a of AUF) {
    const n = normalize(apply(c, a));
    const k = LL_CORNERS.map((p) => cornerOri(n, p)).join("");
    if (best === "" || k < best) best = k;
  }
  return best;
}

/** 아래층 꼭짓점이 제자리·제방향인가(옆색까지) */
export function dlCornersIntact(c: Cube): boolean {
  const n = normalize(c);
  const ref = colorMap(solved(3));
  return n.stickers.every((s) => {
    const isCorner = s.pos[1] === -2 && s.pos[0] !== 0 && s.pos[2] !== 0;
    return !isCorner || ref.get(key(s.pos, s.normal)) === s.color;
  });
}

const FR_CORNER = "2,-2,2";
const FR_EDGE = "2,0,2";

/** F2L 앞-오른쪽 짝의 자리·방향 */
export function pairState(c: Cube): string {
  const n = normalize(c);
  let corner = "";
  let edge = "";
  for (const st of n.stickers) {
    const p = st.pos as V;
    const pk = posKey(p);
    const nz = p.filter((x) => x !== 0).length;
    if (nz === 3 && corner === "" && homeOf(n, p) === FR_CORNER)
      corner = `${pk}@${cornerOri(n, p)}`;
    if (nz === 2 && edge === "" && homeOf(n, p) === FR_EDGE)
      edge = `${pk}@${edgeOri(n, p)}`;
  }
  return `${corner} ${edge}`;
}

/** F2L 상황 열쇠: 공식 앞 윗면 돌리기 넷 중 가장 작은 것 */
export function f2lKey(inverseAlg: string): string {
  let best = "";
  for (const a of AUF) {
    const k = pairState(apply(solved(3), `${inverseAlg} ${a}`));
    if (best === "" || k < best) best = k;
  }
  return best;
}

/** F2L 상황 묶음: 꼭짓점·모서리가 위층(top)인지 칸(slot)인지 */
export function f2lGroup(inverseAlg: string): string {
  const s = pairState(apply(solved(3), inverseAlg));
  const [c, e] = s.split(" ") as [string, string];
  const cTop = c.split(",")[1] === "2";
  const eTop = e.split(",")[1] === "2";
  return `${cTop ? "corner-top" : "corner-slot"}/${eTop ? "edge-top" : "edge-slot"}`;
}
