// 추천 후보 공식: 마지막 층(PLL 21, 2단계, OLL 57). 자료(대표·대안) 밖의 널리 쓰는 다른 공식이다.
// 공식은 speedsolving.com 위키 「PLL」「OLL」 쪽과 흔한 공식 모음에 실리는 것을 기억으로 옮겼고, 어느 상황을 푸는지는
// 검사기(checkAlg)로 다시 확인해 그 상황에 두었다(candidates.test.ts). 앞에 붙은 U는 검사기가 찾은 윗면 맞추기다.
// 확인이 안 된 공식은 넣지 않았다.
import type { CandidateSpec } from "./candidates";

export const LL_CANDIDATES: Record<string, CandidateSpec[]> = {
  // ── PLL ──
  "pll-ua": [
    { alg: "F2 U' L R' F2 L' R U' F2" },
    { alg: "U2 R2 U' R' U' R U R U R U' R" },
    { alg: "U2 M2 U M' U2 M U M2" },
  ],
  "pll-ub": [
    { alg: "F2 U L R' F2 L' R U F2" },
    { alg: "U2 R' U R' U' R' U' R' U R U R2" },
    { alg: "U2 M2 U' M' U2 M U' M2" },
  ],
  "pll-h": [
    { alg: "M2 U' M2 U2 M2 U' M2" },
    { alg: "R2 U2 R U2 R2 U2 R2 U2 R U2 R2" },
  ],
  "pll-z": [
    { alg: "U M2 U M2 U M' U2 M2 U2 M'" },
    { alg: "U M' U' M2 U' M2 U' M' U2 M2" },
    { alg: "R' U' R U' R U R U' R' U R U R2 U' R'" },
  ],
  "pll-aa": [{ alg: "U' x L2 D2 L' U' L D2 L' U L' x'" }],
  "pll-ab": [
    { alg: "U2 x' L2 D2 L U L' D2 L U' L x" },
    { alg: "U R B' R F2 R' B R F2 R2" },
    { alg: "U x' R U' R D2 R' U R D2 R2 x" },
  ],
  "pll-e": [{ alg: "U R2 U R' U' y R U R' U' R U R' U' R U R' y' R U' R2" }],
  "pll-f": [
    { alg: "U R' U2 R' d' R' F' R2 U' R' U R' F R U' F" },
    { alg: "U' M' U2 L F' R U2 r' U r' R2 U2 R2" },
  ],
  "pll-ja": [
    { alg: "R' U2 R U R' U2 L U' R U L'" },
    { alg: "U2 L' U' L F L' U' L U L F' L2 U L" },
    { alg: "U2 L' U2 L U L' U2 R U' L U R'" },
  ],
  "pll-jb": [{ alg: "R U2 R' U' R U2 L' U R' U' L" }],
  "pll-ra": [
    { alg: "R U R' F' R U2 R' U2 R' F R U R U2 R'" },
    { alg: "U' L U2 L' U2 L F' L' U' L U L F L2" },
    { alg: "U R U2 R' U2 R B' R' U' R U R B R2" },
  ],
  "pll-rb": [
    { alg: "U' R' U2 R U2 R' F R U R' U' R' F' R2" },
    { alg: "U' R' U2 R' D' R U' R' D R U R U' R' U' R" },
  ],
  "pll-v": [
    { alg: "R' U R' d' R' F' R2 U' R' U R' F R F" },
    { alg: "U R U' R U R' D R D' R U' D R2 U R2 D' R2" },
  ],
  "pll-y": [{ alg: "F R' F R2 U' R' U' R U R' F' R U R' U' F'" }],
  "pll-na": [
    { alg: "z U R' D R2 U' R D' U R' D R2 U' R D' z'" },
    { alg: "L U' R U2 L' U R' L U' R U2 L' U R'" },
    { alg: "R U' L U2 R' U L' R U' L U2 R' U L'" },
  ],
  "pll-nb": [
    { alg: "z D' R U' R2 D R' U D' R U' R2 D R' U z'" },
    { alg: "R' U L' U2 R U' L R' U L' U2 R U' L" },
  ],
  "pll-ga": [
    { alg: "R2 U R' U R' U' R U' R2 D U' R' U R D'" },
    { alg: "R2 u R' U R' U' R u' R2 y' R' U R" },
  ],
  "pll-gb": [
    { alg: "R' U' R y R2 u R' U R U' R u' R2" },
    { alg: "R' d' F R2 u R' U R U' R u' R2" },
  ],
  "pll-gc": [
    { alg: "R2 u' R U' R U R' u R2 y R U' R'" },
    { alg: "R2 U' R U' R U R' U R2 D' U R U' R' D" },
  ],
  "pll-gd": [{ alg: "R U R' y' R2 u' R U' R' U R' u R2" }],

  // ── 2단계 OLL(엣지) · 2단계 PLL ──
  "2look-oll-l": [
    { alg: "U2 f R U R' U' f'" },
    { alg: "F R U R' U' F' U2 F R U R' U' F'" },
  ],
  "2look-oll-dot": [{ alg: "f R U R' U' f' U F R U R' U' F'" }],
  "2look-pll-headlights": [
    { alg: "R U R' F' R U R' U' R' F R2 U' R'" },
    { alg: "R U2 R' U' R U2 L' U R' U' L" },
    { alg: "x R2 F R F' R U2 r' U r U2 x'" },
  ],
  "2look-pll-diagonal": [
    { alg: "R' U R' d' R' F' R2 U' R' U R' F R F" },
    { alg: "F R' F R2 U' R' U' R U R' F' R U R' U' F'" },
  ],
  "2look-pll-ua": [
    { alg: "R U' R U R U R U' R' U' R2" },
    { alg: "U2 M2 U M' U2 M U M2" },
  ],
  "2look-pll-ub": [
    { alg: "R2 U R U R' U' R' U' R' U R'" },
    { alg: "U2 M2 U' M' U2 M U' M2" },
  ],
  "2look-pll-h": [
    { alg: "M2 U' M2 U2 M2 U' M2" },
    { alg: "R2 U2 R U2 R2 U2 R2 U2 R U2 R2" },
  ],
  "2look-pll-z": [{ alg: "U M2 U M2 U M' U2 M2 U2 M'" }],

  // ── OLL ── (2단계 OLL의 코너 일곱은 같은 번호의 OLL 후보를 함께 쓴다, candidates.ts)
  "oll-2": [{ alg: "U' F R U R' U' F' f R U R' U' f'" }],
  "oll-3": [{ alg: "U' f R U R' U' f' U' F R U R' U' F'" }],
  "oll-4": [{ alg: "U' f R U R' U' f' U F R U R' U' F'" }],
  "oll-5": [{ alg: "U2 r' U2 R U R' U r" }],
  "oll-7": [{ alg: "L' U2 L U2 L F' L' F" }],
  "oll-8": [{ alg: "R U2 R' U2 R' F R F'" }],
  "oll-10": [{ alg: "R U R' y R' F R U' R' F' R" }],
  "oll-11": [{ alg: "U2 M R U R' U R U2 R' U M'" }],
  "oll-12": [{ alg: "U F R U R' U' F' U F R U R' U' F'" }],
  "oll-13": [
    { alg: "r U' r' U' r U r' F' U F" },
    { alg: "F U R U2 R' U' R U R' F'" },
  ],
  "oll-15": [{ alg: "U2 r' U' r R' U' R U r' U r" }],
  "oll-17": [{ alg: "U2 R U R' U R' F R F' U2 R' F R F'" }],
  "oll-18": [{ alg: "U R U2 R2 F R F' U2 M' U R U' r'" }],
  "oll-19": [
    { alg: "M U R U R' U' M' R' F R F'" },
    { alg: "R' U2 F R U R' U' F2 U2 F R" },
  ],
  "oll-20": [{ alg: "M U R U R' U' M2 U R U' r'" }],
  "oll-21": [
    { alg: "U R U R' U R U' R' U R U2 R'" },
    { alg: "F R U R' U' R U R' U' R U R' U' F'" },
  ],
  "oll-22": [{ alg: "f R U R' U' f' F R U R' U' F'" }],
  "oll-23": [{ alg: "U2 R2 D R' U2 R D' R' U2 R'" }],
  "oll-24": [{ alg: "L F R' F' L' F R F'" }],
  "oll-25": [{ alg: "U' R' F R B' R' F' R B" }],
  "oll-26": [{ alg: "U' R' U' R U' R' U2 R" }, { alg: "U L' U' L U' L' U2 L" }],
  "oll-27": [{ alg: "U L' U2 L U L' U L" }, { alg: "U2 L U L' U L U2 L'" }],
  "oll-28": [
    { alg: "U2 M' U M U2 M' U M" },
    { alg: "F R U R' U' F' U2 F R U R' U' F'" },
  ],
  "oll-29": [{ alg: "U' r2 D' r U r' D r2 U' r' U' r" }],
  "oll-30": [{ alg: "U r' D' r U' r' D r2 U' r' U r U r'" }],
  "oll-32": [{ alg: "U2 S R U R' U' R' F R f'" }],
  "oll-33": [{ alg: "F R U' R' U R U R' F'" }],
  "oll-34": [{ alg: "R U R' U' B' R' F R F' B" }],
  "oll-37": [{ alg: "F R U' R' U' R U R' F'" }],
  "oll-39": [{ alg: "U2 R U R' F' U' F U R U2 R'" }],
  "oll-43": [{ alg: "U' R' U' F' U F R" }],
  "oll-44": [{ alg: "U2 f R U R' U' f'" }],
  "oll-47": [{ alg: "F' L' U' L U L' U' L U F" }],
  "oll-49": [{ alg: "U2 R B' R2 F R2 B R2 F' R" }],
  "oll-50": [{ alg: "U2 R' F R2 B' R2 F' R2 B R'" }],
  "oll-51": [{ alg: "U2 f R U R' U' R U R' U' f'" }],
  "oll-52": [{ alg: "R U R' U R d' R U' R' F'" }],
  "oll-53": [{ alg: "U r' U' R U' R' U R U' R' U2 r" }],
  "oll-54": [{ alg: "U r U R' U R U' R' U R U2 r'" }],
  "oll-55": [{ alg: "U R U2 R2 U' R U' R' U2 F R F'" }],
  "oll-56": [{ alg: "F R U R' U' R F' r U R' U' r'" }],

  // ── 후보가 비어 있던 상황(2026-11-17) ──
  // 기억으로 옮긴 공식에 더해, 같은 묶음의 자료·후보 공식을 좌우·앞뒤 거울과 거꾸로로 바꾼 것을 y 돌려 쥐기와
  // 윗면 돌리기마다 이 상황에 해 보아 맞는 것 가운데, 자료 공식을 돌려 쥐기만 한 것은 빼고 골랐다.
  // 대부분 다른 손(왼손) 판이거나 뒷면을 쓰는 판이다.
  "2look-oll-line": [{ alg: "F' L' U' L U F" }],
  "oll-1": [
    { alg: "R U B' R B R2 U' R' F R F'" },
    { alg: "L' U2 L2 F' L' F U2 L F' L' F" },
  ],
  "oll-6": [
    { alg: "F R U' R' U R U2 R' U' F'" },
    { alg: "U2 l U2 L' U' L U' l'" },
  ],
  "oll-9": [
    { alg: "R' U' R U' R B' R' B R' U2 R" },
    { alg: "U2 L' U' L U' L F' L' F L' U2 L" },
  ],
  "oll-14": [
    { alg: "R' F R U R' F' R y' R U' R'" },
    { alg: "F' U' L' U L2 F L' U' L' U L" },
  ],
  "oll-16": [
    { alg: "U2 R' F R U R' U' F' R U' R' U2 R" },
    { alg: "U2 l U l' L U L' U' l U' l'" },
  ],
  "oll-31": [
    { alg: "y2 S' L' U' L U L F' L' f" },
    { alg: "U2 L' U' B U L U' L' B' L" },
  ],
  "oll-35": [
    { alg: "f R U R' U' f' R U R' U R U2 R'" },
    { alg: "U L' U2 L2 F' L' F L' U2 L" },
  ],
  "oll-36": [
    { alg: "U2 R' U' R U' R' U R U R B' R' B" },
    { alg: "U2 R' U' R U' R' U R U l U' R' U x" },
  ],
  "oll-38": [
    { alg: "U2 L U L' U L U' L' U' L' B L B'" },
    { alg: "R U R' U R U' R' U' l' U R U' x'" },
  ],
  "oll-40": [
    { alg: "U2 L' B L U L' U' B' U L" },
    { alg: "R' U' R B U B' U' R' U2 R" },
  ],
  "oll-41": [
    { alg: "F U R U' R' F' R' U2 R U R' U R" },
    { alg: "R U R' U R U2 R' B' R' U' R U B" },
  ],
  "oll-42": [
    { alg: "B' U' R' U R B R U2 R' U' R U' R'" },
    { alg: "y R' F R F' R' F R F' R U R' U' R U R'" },
  ],
  "oll-45": [{ alg: "U2 F' L' U' L U F" }, { alg: "U R' F' U' F U R" }],
  "oll-46": [{ alg: "R U R B' R' B U' R'" }, { alg: "U2 L U L F' L' F U' L'" }],
  "oll-48": [
    { alg: "F R' F' U2 R U R' U R2 U2 R'" },
    { alg: "U2 B L U L' U' L U L' U' B'" },
  ],
  "oll-57": [
    { alg: "R U R' U' r R' U R U' r'" },
    { alg: "L' U' L U M' U' L' U l" },
  ],
  "pll-t": [
    { alg: "R U R' U' R' F R2 U' R' U F' L' U L" },
    { alg: "F R U' R' U R U R2 F' R U R U' R'" },
  ],
};
