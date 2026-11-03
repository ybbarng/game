// 시험 전용 작은 큐브 시뮬레이터. 엔진(packages/cube-engine)과 따로, 배우기 자료의 공식이 맞는지만 본다.
// 스티커 하나하나를 "조각 자리 + 바깥 방향"으로 두고, 수마다 해당 층의 스티커를 90도씩 돌린다.
// 좌표는 두 배 정수(n×n이면 -(n-1)..(n-1), 2씩)로 둬서 짝수 크기도 같은 식으로 다룬다.
// 축: x 오른쪽(R), y 위(U), z 앞(F). 색 번호는 맞춘 상태에서 그 스티커가 있던 면이다.

export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACES)[number];
export type Vec = readonly [number, number, number];

const FACE_NORMAL: Record<Face, Vec> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

export interface Sticker {
  pos: [number, number, number];
  normal: [number, number, number];
  color: number;
}

export interface Cube {
  n: number;
  stickers: Sticker[];
}

export function solved(n: number): Cube {
  const stickers: Sticker[] = [];
  const m = n - 1;
  for (let fi = 0; fi < FACES.length; fi++) {
    const face = FACES[fi] as Face;
    const nv = FACE_NORMAL[face];
    const axis = nv[0] !== 0 ? 0 : nv[1] !== 0 ? 1 : 2;
    const sign = nv[axis] as number;
    for (let a = -m; a <= m; a += 2) {
      for (let b = -m; b <= m; b += 2) {
        const pos: [number, number, number] = [0, 0, 0];
        pos[axis] = sign * m;
        const others = [0, 1, 2].filter((i) => i !== axis);
        pos[others[0] as number] = a;
        pos[others[1] as number] = b;
        stickers.push({ pos, normal: [nv[0], nv[1], nv[2]], color: fi });
      }
    }
  }
  return { n, stickers };
}

export function clone(c: Cube): Cube {
  return {
    n: c.n,
    stickers: c.stickers.map((s) => ({
      pos: [...s.pos],
      normal: [...s.normal],
      color: s.color,
    })),
  };
}

// 양의 축 둘레로 반시계 90도 × q (오른손 법칙)
function rot(v: [number, number, number], axis: number, q: number): void {
  const t = ((q % 4) + 4) % 4;
  for (let i = 0; i < t; i++) {
    const [x, y, z] = v;
    if (axis === 0) {
      v[1] = -z;
      v[2] = y;
    } else if (axis === 1) {
      v[0] = z;
      v[2] = -x;
    } else {
      v[0] = -y;
      v[1] = x;
    }
  }
}

interface Turn {
  axis: number;
  // 돌릴 층(축 위의 두 배 좌표). null이면 전체
  layers: number[] | null;
  // 양의 축 둘레 반시계 90도 횟수
  q: number;
}

const MOVE_RE = /^(\d*)([URFDLBurfdlbMESxyz])(w?)(2?)('?)$/;

export function tokens(alg: string): string[] {
  return alg
    .replace(/[()[\]]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function parseMove(tok: string, n: number): Turn {
  const m = MOVE_RE.exec(tok);
  if (!m) throw new Error(`읽을 수 없는 수: ${tok}`);
  const prefix = m[1] ?? "";
  let letter = m[2] as string;
  let wide = m[3] === "w";
  const twice = m[4] === "2";
  const prime = m[5] === "'";
  const amount = twice ? 2 : prime ? -1 : 1;
  const big = n - 1;
  if ("xyz".includes(letter)) {
    const axis = "xyz".indexOf(letter);
    // x는 R, y는 U, z는 F 방향: 양의 축 둘레 시계 = 반시계 -1
    return { axis, layers: null, q: -amount };
  }
  if ("MES".includes(letter)) {
    if (n % 2 === 0) throw new Error(`짝수 큐브에 ${letter}는 없다`);
    // M은 L 방향(-x 둘레 시계 = +x 둘레 반시계), E는 D 방향, S는 F 방향
    if (letter === "M") return { axis: 0, layers: [0], q: amount };
    if (letter === "E") return { axis: 1, layers: [0], q: amount };
    return { axis: 2, layers: [0], q: -amount };
  }
  if (letter === letter.toLowerCase()) {
    letter = letter.toUpperCase();
    wide = true;
  }
  const nv = FACE_NORMAL[letter as Face];
  const axis = nv[0] !== 0 ? 0 : nv[1] !== 0 ? 1 : 2;
  const sign = nv[axis] as number;
  const depthOf = (d: number) => sign * (big - 2 * (d - 1));
  let layers: number[];
  if (wide) {
    const k = prefix === "" ? 2 : Number(prefix);
    layers = [];
    for (let d = 1; d <= k; d++) layers.push(depthOf(d));
  } else {
    const k = prefix === "" ? 1 : Number(prefix);
    layers = [depthOf(k)];
  }
  // 면 바깥에서 봤을 때 시계 = 바깥 방향 축 둘레로 -90도
  return { axis, layers, q: -sign * amount };
}

export function applyTurn(c: Cube, t: Turn): void {
  for (const s of c.stickers) {
    if (t.layers !== null && !t.layers.includes(s.pos[t.axis] as number))
      continue;
    rot(s.pos, t.axis, t.q);
    rot(s.normal, t.axis, t.q);
  }
}

export function apply(c: Cube, alg: string): Cube {
  const out = clone(c);
  for (const tok of tokens(alg)) applyTurn(out, parseMove(tok, c.n));
  return out;
}

export function invertMove(tok: string): string {
  if (tok.endsWith("2'")) return tok.slice(0, -1);
  if (tok.endsWith("2")) return tok;
  if (tok.endsWith("'")) return tok.slice(0, -1);
  return `${tok}'`;
}

export function invert(alg: string): string {
  return tokens(alg).reverse().map(invertMove).join(" ");
}

export function key(pos: readonly number[], normal: readonly number[]): string {
  return `${pos.join(",")}|${normal.join(",")}`;
}

export function colorMap(c: Cube): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of c.stickers) m.set(key(s.pos, s.normal), s.color);
  return m;
}

const ROTATIONS: string[] = (() => {
  const out: string[] = [];
  for (const a of ["", "x", "x2", "x'", "z", "z'"]) {
    for (const b of ["", "y", "y2", "y'"]) out.push(`${a} ${b}`.trim());
  }
  return out;
})();

// 다른 스티커 수. 큐브 전체를 돌린 24가지 중 가장 적은 것으로 본다(공식 끝의 x·y 등을 무시하려고)
export function normalize(c: Cube): Cube {
  const ref = colorMap(solved(c.n));
  let best = c;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const r of ROTATIONS) {
    const t = apply(c, r);
    let diff = 0;
    for (const s of t.stickers)
      if (ref.get(key(s.pos, s.normal)) !== s.color) diff++;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = t;
    }
  }
  return best;
}

// 맞춘 상태와 다른 스티커 자리 목록(큐브 방향은 맞춘 뒤)
export function diffStickers(c: Cube): Sticker[] {
  const ref = colorMap(solved(c.n));
  return normalize(c).stickers.filter(
    (s) => ref.get(key(s.pos, s.normal)) !== s.color,
  );
}

export function isSolved(c: Cube): boolean {
  return diffStickers(c).length === 0;
}
