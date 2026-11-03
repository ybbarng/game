/**
 * 축소가 끝난 n×n을 3×3으로 보기: 바깥 꼭짓점, 짝 지은 모서리(날개 하나나 가운데 조각),
 * 면 가운데로 3×3 스티커 문자열(54글자)을 만든다. 3×3 해의 수는 n×n 바깥층 수 그대로다.
 */
import { FACE_LETTERS } from "./sim";

/** 3×3 칸 0·1·2 → n×n 칸(1은 홀수면 정가운데 줄, 짝수면 둘째 줄) */
function mapIndex(n: number, k: number): number {
  if (k === 0) return 0;
  if (k === 2) return n - 1;
  return n % 2 === 1 ? (n - 1) / 2 : 1;
}

/**
 * n×n 색 배열 → 3×3 스티커 문자열. `faceOfColor[색]`은 그 색이 맞아야 할 면.
 * 가운데·모서리 짝이 다 맞은 뒤에 부른다.
 */
export function toThreeFacelets(
  n: number,
  colors: Uint8Array,
  faceOfColor: readonly number[],
): string {
  let out = "";
  for (let f = 0; f < 6; f++) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const p = f * n * n + mapIndex(n, r) * n + mapIndex(n, c);
        out += FACE_LETTERS[faceOfColor[colors[p] as number] as number];
      }
    }
  }
  return out;
}

/**
 * 3×3 모서리·꼭짓점 자리의 스티커 번호(Kociemba 순서, 자리 차례는 cube-solver와 같다).
 * cube-solver의 facelets 표, cube-ai `cubie.ts`의 조각 번호 표와 같은 것을 따로 적어 두었다.
 * 나중에 cube-solver가 표를 내보내게 하고 셋이 그것을 쓰도록 합친다(남은 일, game-85 #52 검토).
 */
const EDGES: readonly (readonly [number, number])[] = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];

const CORNERS: readonly (readonly [number, number, number])[] = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];

function permParity(perm: readonly number[]): number {
  let parity = 0;
  const seen = new Array<boolean>(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j] as number) {
      seen[j] = true;
      len++;
    }
    parity ^= (len + 1) & 1;
  }
  return parity;
}

const SOLVED = FACE_LETTERS.map((f) => f.repeat(9)).join("");
const key = (s: string, idx: readonly number[]) =>
  idx
    .map((i) => s[i])
    .sort()
    .join("");
const EDGE_KEYS = EDGES.map((e) => key(SOLVED, e));
const CORNER_KEYS = CORNERS.map((c) => key(SOLVED, c));

export interface ThreeParity {
  /** 모서리 하나가 뒤집혀 있다(3×3에서는 생기지 않는 모양): OLL 패리티 */
  oll: boolean;
  /** 꼭짓점과 모서리 순열의 홀짝이 다르다(두 모서리가 바뀌어 있다): PLL 패리티 */
  pll: boolean;
}

/** 3×3 스티커 문자열이 보통 3×3으로 풀 수 없는 모양인지 */
export function threeParity(f: string): ThreeParity {
  let flips = 0;
  const ep = EDGES.map(([a, b]) => {
    const la = f[a] as string;
    const lb = f[b] as string;
    const primary =
      la === "U" || la === "D" || lb === "U" || lb === "D"
        ? la === "U" || la === "D"
          ? la
          : lb
        : la === "F" || la === "B"
          ? la
          : lb;
    if (la !== primary) flips++;
    return EDGE_KEYS.indexOf(key(f, [a, b]));
  });
  const cp = CORNERS.map((c) => CORNER_KEYS.indexOf(key(f, c)));
  if (ep.includes(-1) || cp.includes(-1)) {
    throw new Error("3×3로 읽은 조각의 색 조합이 맞지 않는다");
  }
  return {
    oll: flips % 2 === 1,
    pll: permParity(cp) !== permParity(ep),
  };
}
