/**
 * 스티커(facelet) 문자열 위에서 도는 n×n 큐브 시뮬레이터.
 *
 * 문자열 순서는 Kociemba식이다: U면 n×n개, R, F, D, L, B 순서. 한 면 안에서는 그 면을
 * 정면으로 볼 때 위 줄부터 왼쪽에서 오른쪽으로. 글자는 그 스티커가 속한 면 이름이다
 * (맞춘 큐브는 "UUU…RRR…"). 3×3은 54글자, 2×2는 24글자.
 *
 * 수는 실제 3차원 회전으로 계산한다(외워 둔 순열 표가 없다). 해법기의 꼭짓점·모서리 수 표도
 * 여기서 나온 결과로 만들어, 두 표현이 서로 어긋나지 않는다.
 */

export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACES)[number];

/** 면마다 바깥 방향(x: L→R, y: D→U, z: B→F). */
const NORMALS: Record<Face, readonly [number, number, number]> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

/** 읽은 수 하나. 면 쪽에서 셀 때 `from`층부터 `to`층까지를 시계 방향 90°의 `turns`배 돌린다. */
export interface FaceletMove {
  face: Face;
  from: number;
  to: number;
  turns: 1 | 2 | 3;
}

type Vec = [number, number, number];

/** 칸 번호 0..n-1을 좌표로: 바깥 스티커가 ±n, 조각 가운데가 ±(n-1) 안쪽에 오도록 2칸 간격. */
function coord(n: number, k: number): number {
  return 2 * k - (n - 1);
}

/** 스티커 자리 i의 3차원 위치. */
function stickerPosition(n: number, index: number): Vec {
  const face = FACES[Math.floor(index / (n * n))] as Face;
  const p = index % (n * n);
  const r = Math.floor(p / n);
  const c = p % n;
  const a = (k: number) => coord(n, k);
  switch (face) {
    case "U":
      return [a(c), n, a(r)];
    case "R":
      return [n, a(n - 1 - r), a(n - 1 - c)];
    case "F":
      return [a(c), a(n - 1 - r), n];
    case "D":
      return [a(c), -n, a(n - 1 - r)];
    case "L":
      return [-n, a(n - 1 - r), a(c)];
    case "B":
      return [a(n - 1 - c), a(n - 1 - r), -n];
  }
}

interface Geometry {
  positions: Vec[];
  index: Map<string, number>;
}

const geometryCache = new Map<number, Geometry>();

function geometry(n: number): Geometry {
  let g = geometryCache.get(n);
  if (!g) {
    const positions: Vec[] = [];
    const index = new Map<string, number>();
    for (let i = 0; i < 6 * n * n; i++) {
      const p = stickerPosition(n, i);
      positions.push(p);
      index.set(p.join(","), i);
    }
    g = { positions, index };
    geometryCache.set(n, g);
  }
  return g;
}

/** 축 a(단위 벡터) 쪽에서 볼 때 시계 방향 90°: v' = a(a·v) - a×v */
function rotateClockwise(a: readonly [number, number, number], v: Vec): Vec {
  const dot = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  const cross: Vec = [
    a[1] * v[2] - a[2] * v[1],
    a[2] * v[0] - a[0] * v[2],
    a[0] * v[1] - a[1] * v[0],
  ];
  return [a[0] * dot - cross[0], a[1] * dot - cross[1], a[2] * dot - cross[2]];
}

const permCache = new Map<string, Int32Array>();

/** 수 하나가 스티커를 어디로 보내는지: 결과의 dest[i]는 자리 i의 스티커가 가는 자리. */
export function movePermutation(n: number, move: FaceletMove): Int32Array {
  const key = `${n}:${move.face}:${move.from}:${move.to}:${move.turns}`;
  const cached = permCache.get(key);
  if (cached) return cached;
  const { positions, index } = geometry(n);
  const axis = NORMALS[move.face];
  const dest = new Int32Array(positions.length);
  for (let i = 0; i < positions.length; i++) {
    let v = positions[i] as Vec;
    let along = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
    if (along === n) along = n - 1;
    if (along === -n) along = -(n - 1);
    // 면 쪽에서 센 층 번호(바깥이 1)
    const layer = (n - 1 - along) / 2 + 1;
    if (layer >= move.from && layer <= move.to) {
      for (let t = 0; t < move.turns; t++) v = rotateClockwise(axis, v);
    }
    const to = index.get(v.join(","));
    if (to === undefined) throw new Error("스티커 자리를 찾지 못했다");
    dest[i] = to;
  }
  permCache.set(key, dest);
  return dest;
}

/** 맞춘 큐브의 스티커 문자열. */
export function solvedFacelets(n: number): string {
  return FACES.map((f) => f.repeat(n * n)).join("");
}

const TOKEN = /^(\d*)([URFDLB])(w?)(2'|2|'|)$/;
const ROTATION = /^([xyz])(2'|2|'|)$/;
const ROTATION_FACE: Record<string, Face> = { x: "R", y: "U", z: "F" };

function turnsOf(suffix: string): 1 | 2 | 3 {
  if (suffix === "'") return 3;
  if (suffix === "2" || suffix === "2'") return 2;
  return 1;
}

/**
 * WCA 표기 한 수를 읽는다. `R` `U2` `F'` `Rw` `3Rw2` `2R`(안쪽 한 층만) `x` `y'` `z2`.
 * n×n 큐브 크기가 있어야 층 범위와 큐브 돌리기를 정할 수 있다.
 */
export function parseMove(n: number, token: string): FaceletMove {
  const rot = ROTATION.exec(token);
  if (rot) {
    return {
      face: ROTATION_FACE[rot[1] as string] as Face,
      from: 1,
      to: n,
      turns: turnsOf(rot[2] as string),
    };
  }
  const m = TOKEN.exec(token);
  if (!m) throw new Error(`읽을 수 없는 수: ${token}`);
  const prefix = m[1] as string;
  const face = m[2] as Face;
  const wide = m[3] === "w";
  const turns = turnsOf(m[4] as string);
  const k = prefix === "" ? (wide ? 2 : 1) : Number(prefix);
  if (k < 1 || k > n) throw new Error(`층 범위를 벗어난 수: ${token}`);
  return wide
    ? { face, from: 1, to: k, turns }
    : { face, from: k, to: k, turns };
}

/** 공백으로 나뉜 표기를 수 목록으로. 빈 문자열은 빈 목록. */
export function splitMoves(text: string): string[] {
  return text.trim() === "" ? [] : text.trim().split(/\s+/);
}

/** 스티커 문자열에 표기를 차례로 적용한다. */
export function applyAlgorithm(
  facelets: string,
  text: string,
  n = sizeOf(facelets),
): string {
  let cur = facelets.split("");
  for (const token of splitMoves(text)) {
    const dest = movePermutation(n, parseMove(n, token));
    const next = new Array<string>(cur.length);
    for (let i = 0; i < cur.length; i++)
      next[dest[i] as number] = cur[i] as string;
    cur = next;
  }
  return cur.join("");
}

/** 스티커 문자열 길이로 n을 알아낸다. */
export function sizeOf(facelets: string): number {
  const n = Math.round(Math.sqrt(facelets.length / 6));
  if (n < 1 || 6 * n * n !== facelets.length) {
    throw new Error(`스티커 개수가 맞지 않는다: ${facelets.length}`);
  }
  return n;
}

/** 면마다 한 색이면 맞춘 것(큐브 방향은 따지지 않는다). */
export function isSolvedFacelets(facelets: string): boolean {
  const n = sizeOf(facelets);
  const s = n * n;
  for (let f = 0; f < 6; f++) {
    const c = facelets[f * s];
    for (let i = 1; i < s; i++) if (facelets[f * s + i] !== c) return false;
  }
  return true;
}

/** 표기를 거꾸로: 순서를 뒤집고 방향을 바꾼다(`R U'` → `U R'`). */
export function invertAlgorithm(text: string): string {
  return splitMoves(text)
    .reverse()
    .map((t) => {
      if (t.endsWith("2'")) return t.slice(0, -1);
      if (t.endsWith("2")) return t;
      if (t.endsWith("'")) return t.slice(0, -1);
      return `${t}'`;
    })
    .join(" ");
}
