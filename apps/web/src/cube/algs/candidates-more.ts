// 추천 후보 공식: F2L 41, 2×2 오르테가, 4×4 패리티, 5×5 마지막 엣지.
// F2L의 「찾은 공식」(found)은 엔진으로 그 상황(앞-오른쪽 칸)을 R·U(없으면 R·U·F)만으로 가장 짧게 맞추는 수를 찾은 것이다
// (2026-11-04, 깊이 우선 탐색: R·U는 10수, R·U·F는 7수까지). 나머지는 흔한 공식 모음의 공식을 기억으로 옮기고
// 검사기(checkAlg)로 어느 상황을 푸는지 확인해 두었다(candidates.test.ts).
import type { CandidateSpec } from "./candidates";

export const MORE_CANDIDATES: Record<string, CandidateSpec[]> = {
  // ── F2L ──
  "f2l-1": [{ alg: "U2 R U2 R'", found: true }],
  "f2l-2": [
    { alg: "y' U' R' U R" },
    { alg: "y U' L' U L" },
    { alg: "F R' F' R", found: true },
  ],
  "f2l-3": [{ alg: "y' R' U' R" }, { alg: "y L' U' L" }],
  "f2l-5": [{ alg: "U' R U R' U' R U2 R'", found: true }],
  "f2l-6": [{ alg: "y' U R' U' R U2 R' U R" }, { alg: "d R' U' R U2 R' U R" }],
  "f2l-7": [{ alg: "U' R U2 R' U' R U2 R'", found: true }],
  "f2l-8": [{ alg: "R2 U2 F R2 F' U2 R2", found: true }],
  "f2l-10": [{ alg: "U2 R U' R' U' R U R'", found: true }],
  "f2l-11": [{ alg: "F U2 F2 U' F2 U' F'", found: true }],
  "f2l-12": [{ alg: "R' U2 R2 U R2 U R", found: true }],
  "f2l-14": [{ alg: "U2 R2 U R' U R U2 R2", found: true }],
  "f2l-15": [{ alg: "R U' R U2 R2 U' R2 U' R2", found: true }],
  "f2l-19": [{ alg: "U R U2 R' U2 R U2 R'", found: true }],
  "f2l-20": [{ alg: "U' F' U2 F2 R' F' R", found: true }],
  "f2l-21": [{ alg: "R U' R' U2 R U R'" }],
  "f2l-22": [
    { alg: "U2 R U R' F' U' F", found: true },
    { alg: "F' U F U2 F' U' F", found: true },
  ],
  "f2l-23": [
    { alg: "R U R' U2 R U R' U' R U R'" },
    { alg: "U2 R2 U2 R' U' R U' R2", found: true },
  ],
  "f2l-25": [
    { alg: "R' U' R' U' R' U R U R", found: true },
    { alg: "R2 U R2 U R U' R U' R2", found: true },
  ],
  "f2l-26": [{ alg: "U R U' R' U' F' U F" }],
  "f2l-27": [{ alg: "R U' R' U2 R U2 R'", found: true }],
  "f2l-28": [
    { alg: "R U2 R' F' U2 F", found: true },
    { alg: "F' U F2 R' F' R", found: true },
  ],
  "f2l-29": [{ alg: "U2 R' F R F' U R U' R'" }],
  "f2l-31": [
    { alg: "R U' R' F' U2 F", found: true },
    { alg: "F' U F R U2 R'", found: true },
  ],
  "f2l-32": [
    { alg: "R U R' U' R U R' U' R U R'" },
    { alg: "R2 U R2 U R2 U2 R2", found: true },
  ],
  "f2l-33": [{ alg: "U' R U' R' U' R U2 R'", found: true }],
  "f2l-34": [
    { alg: "U R U R' U2 R U R'", found: true },
    { alg: "U' R U2 R' U R U R'", found: true },
  ],
  "f2l-37": [{ alg: "R U' R' d R' U2 R U2 R' U R" }],
  "f2l-38": [
    { alg: "R U' R' U' R U R' U' R U2 R'" },
    { alg: "R2 U2 R' U' R U' R' U2 R'", found: true },
  ],
  "f2l-39": [{ alg: "R U2 R U R' U R U2 R2", found: true }],

  // ── 2×2 오르테가 ──
  "ortega-oll-sune": [
    { alg: "U' R' U2 R U R' U R" },
    { alg: "U L' U2 L U L' U L" },
  ],
  "ortega-oll-antisune": [
    { alg: "U' R' U' R U' R' U2 R" },
    { alg: "U L' U' L U' L' U2 L" },
  ],
  "ortega-oll-h": [
    { alg: "R2 U2 R' U2 R2" },
    { alg: "F R U R' U' R U R' U' R U R' U' F'" },
    { alg: "R U2 R' U' R U R' U' R U' R'" },
  ],
  "ortega-oll-pi": [{ alg: "R U2 R2 U' R2 U' R2 U2 R" }],
  "ortega-oll-u": [{ alg: "U2 F' L' U' L U F" }],
  "ortega-oll-l": [
    { alg: "F R U' R' U' R U R' F'" },
    { alg: "R' F R B' R' F' R B" },
  ],
  "ortega-pbl-adj-top": [
    { alg: "R U R' F' R U R' U' R' F R2 U' R'" },
    { alg: "R U2 R' U' R U2 L' U R' U' L" },
    { alg: "U' R' U L' U2 R U' R' U2 R L" },
  ],
  "ortega-pbl-diag-top": [{ alg: "R U' R' U' F2 U' R U R' D R2" }],
  "ortega-pbl-diag-diag": [{ alg: "R2 B2 R2" }],
  "ortega-pbl-adj-adj": [{ alg: "R2 U R2 U2 F2 U F2" }],
  "ortega-pbl-adj-diag": [{ alg: "U2 R' U R' F2 R F' R" }],

  // ── 4×4 패리티 · 5×5 마지막 엣지 ──
  "parity-4x4-oll": [
    { alg: "Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2" },
    { alg: "Rw U2 Rw U2 Rw' U2 Rw U2 Lw' U2 Rw U2 Rw' U2 Lw Rw2 U2 Rw'" },
  ],
  "parity-4x4-pll": [
    { alg: "Uw2 2R2 Uw2 2R2 U2 2R2" },
    { alg: "2R2 F2 U2 2R2 U2 F2 2R2" },
  ],
  "edges-5x5-flip": [
    { alg: "Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2" },
  ],
  "edges-5x5-pair": [{ alg: "Dw R F' U R' F Dw'" }],
};
