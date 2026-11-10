// 블라인드(올드 포흐만) 단원 글의 규칙을 엔진으로 확인한다(docs/47 16-15).
// 1) 글자 붙이기: 「면을 정면에서 바로 본다(윗면은 뒷면 쪽을 위로, 아랫면은 앞면 쪽을 위로), 시계 방향, 엣지는 위 칸부터,
//    코너는 왼쪽 위 칸부터」를 좌표로 옮겨 bld.ts 표와 같은지.
// 2) 외우기: 버퍼에서 따라가기, 버퍼 조각이 나오면 끝(뒤집혀·돌아가 나와도), 고리 깨기(남은 조각 가운데 글자 차례가
//    가장 앞인 조각의 윗면·아랫면 칸, 가운데 층 엣지는 앞·뒤 면 칸부터, 돌아온 쪽 칸 글자로 닫기), 엣지 글자가 홀수면
//    패리티 — 이 규칙만으로 무작위 상태를 끝까지 맞추는지.
import {
  applyMoves,
  cubeTopology,
  faceColors,
  isSolved,
  parseMoves,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState, Vec3 } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { BLD_ALGS, BLD_CORNER_TARGETS, BLD_EDGE_TARGETS } from "./bld";
import { sendCorners, sendEdges } from "./lessons-bld";

const FACES = "URFDLB";
const NORMAL: Record<string, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};
const faceOfVec = (v: Vec3) =>
  Object.keys(NORMAL).find((k) =>
    (NORMAL[k] as Vec3).every((x, i) => x === v[i]),
  ) as string;
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

/** 글의 규칙으로 만든 글자 → 스티커 이름(첫 글자가 그 칸의 면) */
function speffz(kind: "edge" | "corner"): Map<string, string> {
  const out = new Map<string, string>();
  const order = "ULFRBD";
  [...order].forEach((face, fi) => {
    const n = NORMAL[face] as Vec3;
    // 바라볼 때 위쪽: 윗면은 뒷면 쪽, 아랫면은 앞면 쪽, 옆면은 윗면 쪽
    const up: Vec3 =
      face === "U"
        ? (NORMAL.B as Vec3)
        : face === "D"
          ? (NORMAL.F as Vec3)
          : (NORMAL.U as Vec3);
    // 밖에서 바라볼 때 오른쪽 = 위 × 바깥 방향
    const right = cross(up, n);
    const [u, r, d, l] = [up, right, neg(up), neg(right)].map(faceOfVec);
    const names =
      kind === "edge"
        ? [face + u, face + r, face + d, face + l]
        : [face + u + l, face + u + r, face + d + r, face + d + l];
    names.forEach((nm, k) => {
      out.set("ABCDEFGHIJKLMNOPQRSTUVWX"[fi * 4 + k] as string, nm);
    });
  });
  return out;
}
const sameSticker = (a: string, b: string) =>
  a.length === b.length && a[0] === b[0] && [...a].every((c) => b.includes(c));

describe("글자 붙이기(Speffz) 방향", () => {
  it("엣지·코너 글자가 글의 규칙(윗면은 뒷면 쪽을 위로, 아랫면은 앞면 쪽을 위로, 시계 방향)과 bld.ts 표가 같다", () => {
    const e = speffz("edge");
    for (const t of BLD_EDGE_TARGETS)
      expect(sameSticker(e.get(t.letter) as string, t.sticker), t.letter).toBe(
        true,
      );
    const c = speffz("corner");
    for (const t of BLD_CORNER_TARGETS)
      expect(sameSticker(c.get(t.letter) as string, t.sticker), t.letter).toBe(
        true,
      );
    // 버퍼: 엣지 B = 위-오른쪽, 코너 A = 위-뒤-왼쪽
    expect(sameSticker(e.get("B") as string, "UR")).toBe(true);
    expect(sameSticker(c.get("A") as string, "UBL")).toBe(true);
  });
});

// ── 외우기 ─────────────────────────────────────────────

const topo = cubeTopology(3);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWX";
function stickerIndex(name: string): number {
  const p: [number, number, number] = [0, 0, 0];
  for (const ch of name) {
    const v = NORMAL[ch] as Vec3;
    for (let i = 0; i < 3; i++) if (v[i] !== 0) p[i] = v[i] as number;
  }
  return topo.stickerAt(p, FACES.indexOf(name[0] as string));
}

interface Kind {
  letters: Map<string, number>; // 글자 → 스티커 자리
  buffer: string[]; // 버퍼 조각의 글자들(첫째가 윗면 칸)
}
function kindOf(kind: "edge" | "corner"): Kind {
  const m = speffz(kind);
  const letters = new Map<string, number>();
  for (const [k, v] of m) letters.set(k, stickerIndex(v));
  const buffer = kind === "edge" ? ["B", "M"] : ["A", "E", "R"];
  return { letters, buffer };
}
const EDGE = kindOf("edge");
const CORNER = kindOf("corner");
const SOLVED = faceColors(3, solvedCube(3));

/** 스티커 자리 → 같은 조각의 스티커 자리들 */
const pieceOf = (st: number) =>
  topo.pieces.find((p) => p.stickers.includes(st))?.stickers ?? [];
/** 지금 자리 st에 있는 스티커가 제자리에서 놓일 칸의 글자 */
function homeLetter(col: Uint8Array, k: Kind, st: number): string {
  const colors = pieceOf(st).map((x) => col[x] as number);
  const want = [...colors].sort().join();
  const mine = col[st] as number;
  for (const [letter, pos] of k.letters) {
    const ps = pieceOf(pos);
    if (
      ps
        .map((x) => SOLVED[x] as number)
        .sort()
        .join() === want &&
      SOLVED[pos] === mine
    )
      return letter;
  }
  throw new Error("제자리 글자를 못 찾음");
}
const lettersOfPiece = (k: Kind, letter: string) => {
  const ps = pieceOf(k.letters.get(letter) as number);
  return [...k.letters].filter(([, pos]) => ps.includes(pos)).map(([l]) => l);
};

/** 고리 깨기에서 그 조각의 첫 칸: 윗면·아랫면 칸, 없으면(가운데 층 엣지) 앞·뒤 면 칸 */
function firstSticker(k: Kind, letters: string[]): string {
  const faceOf = (l: string) =>
    FACES[topo.stickers[k.letters.get(l) as number]?.face as number];
  return (
    letters.find((l) => "UD".includes(faceOf(l) as string)) ??
    (letters.find((l) => "FB".includes(faceOf(l) as string)) as string)
  );
}

interface Memo {
  letters: string[];
  bufferCameBackWrong: boolean;
  breaks: number;
}

/** 단원 글의 외우기 규칙 */
function memorize(s: PuzzleState, k: Kind): Memo {
  const col = faceColors(3, s);
  const out: string[] = [];
  const done = new Set<string>(); // 끝난 조각(그 조각 글자 하나로 대표)
  const key = (l: string) => lettersOfPiece(k, l).sort().join();
  done.add(key(k.buffer[0] as string));
  // 제자리에 바르게 있는 조각
  for (const l of k.letters.keys())
    if (homeLetter(col, k, k.letters.get(l) as number) === l) {
      if (
        lettersOfPiece(k, l).every(
          (x) => homeLetter(col, k, k.letters.get(x) as number) === x,
        )
      )
        done.add(key(l));
    }
  let bufferCameBackWrong = false;
  let breaks = 0;
  // 버퍼에서 따라가기
  let at = k.letters.get(k.buffer[0] as string) as number;
  for (let i = 0; i < 30; i++) {
    const t = homeLetter(col, k, at);
    if (k.buffer.includes(t)) {
      if (i > 0 && t !== k.buffer[0]) bufferCameBackWrong = true;
      break;
    }
    out.push(t);
    done.add(key(t));
    at = k.letters.get(t) as number;
  }
  // 고리 깨기: 남은 조각 가운데 글자 차례가 가장 앞인 조각
  for (;;) {
    const left = [...LETTERS].find(
      (l) => k.letters.has(l) && !done.has(key(l)),
    );
    if (!left) break;
    breaks++;
    const start = firstSticker(k, lettersOfPiece(k, left));
    out.push(start);
    done.add(key(start));
    const startPiece = key(start);
    at = k.letters.get(start) as number;
    for (let i = 0; i < 30; i++) {
      const t = homeLetter(col, k, at);
      out.push(t);
      if (key(t) === startPiece) break; // 같은 조각으로 돌아오면 돌아온 쪽 칸 글자를 적고 닫는다
      done.add(key(t));
      at = k.letters.get(t) as number;
    }
  }
  return { letters: out, bufferCameBackWrong, breaks };
}

const PARITY = BLD_ALGS.find((a) => a.id === "bld-op-parity")
  ?.algs[0] as string;
const play = (s: PuzzleState, alg: string) =>
  alg.trim() ? applyMoves(3, s, parseMoves(3, alg)) : s;

describe("외우기 규칙만으로 끝까지", () => {
  it("무작위 200개: 엣지 → (홀수면 패리티) → 코너로 맞고, 버퍼가 뒤집혀·돌아가 나오는 판과 고리 깨기를 모두 만난다", () => {
    let wrongEdge = 0;
    let wrongCorner = 0;
    let breaks = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = randomCubeState(3, seed);
      const e = memorize(s, EDGE);
      const c = memorize(s, CORNER);
      if (e.bufferCameBackWrong) wrongEdge++;
      if (c.bufferCameBackWrong) wrongCorner++;
      breaks += e.breaks + c.breaks;
      const parity = e.letters.length % 2 === 1 ? PARITY : "";
      const solution = [
        e.letters.length ? sendEdges(e.letters.join(" ")) : "",
        parity,
        c.letters.length ? sendCorners(c.letters.join(" ")) : "",
      ].join(" ");
      expect(isSolved(3, play(s, solution)), `씨앗 ${seed}`).toBe(true);
      // 엣지와 코너 글자 수의 홀짝은 같다(그래서 패리티는 엣지 쪽만 본다)
      expect(e.letters.length % 2).toBe(c.letters.length % 2);
    }
    expect(wrongEdge).toBeGreaterThan(0);
    expect(wrongCorner).toBeGreaterThan(0);
    expect(breaks).toBeGreaterThan(0);
  });

  it("아래 층 코너가 제자리에서 돌아간 경우도 「아랫면 칸 → 그 칸 스티커의 제자리」 두 글자로 맞는다", () => {
    // 버퍼와 아래-앞-오른쪽 코너만 제자리에서 돌아간 상태(두 방향)를 엔진으로 만든다
    // A = (R' D' R D) 두 번은 위-앞-오른쪽 코너를 돌린다(아래 층은 A를 세 번 하면 돌아온다).
    // R로 아래-앞-오른쪽을 위-앞-오른쪽에 올려 A, U2로 버퍼를 그 자리에 두고 A 두 번, U2와 R'로 되돌리기
    const A = "R' D' R D R' D' R D";
    for (const [one, two] of [
      [A, `${A} ${A}`],
      [`${A} ${A}`, A],
    ]) {
      const s = play(solvedCube(3), `R ${one} U2 ${two} U2 R'`);
      expect(isSolved(3, s)).toBe(false);
      const m = memorize(s, CORNER);
      expect(m.breaks).toBe(1);
      expect(m.letters).toHaveLength(2);
      // 첫 글자는 아래-앞-오른쪽의 아랫면 칸(V)
      expect(m.letters[0]).toBe("V");
      expect(isSolved(3, play(s, sendCorners(m.letters.join(" "))))).toBe(true);
    }
  });
});
