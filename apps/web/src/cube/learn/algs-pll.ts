// PLL(Permutation of the Last Layer, 윗층 자리 맞추기) 21 상황.
// 이름은 굳은 이름(T퍼뮤 = T 퍼뮤테이션, 「자리 바꾸기 공식」)을 그대로 쓰고 설명을 곁들인다.
// 수순 확인: PLL 이름(Ua·Ub·H·Z·Aa·Ab·E·T·F·Ja·Jb·Ra·Rb·V·Y·Na·Nb·Ga~Gd)은 널리 쓰는 이름을 기억으로 옮겼고,
//   바깥 자료와 다시 대조하지는 못했다(2026-11-04) — 공식과 이름만 옮겼다. pll.test.ts가 21 상황이 서로 다르고
//   묶음(이웃·대각 코너 바꿈 등)과 맞는지 시뮬레이터로 확인한다. 설명(note)은 우리말로 새로 썼다.
import type { AlgCase } from "./types";

const pll = (
  id: string,
  group: string,
  name: string,
  algs: string[],
  extra: Partial<Pick<AlgCase, "fingers" | "note">> = {},
): AlgCase => ({ id: `pll-${id}`, set: "pll", name, group, algs, ...extra });

export const PLL_GROUPS = {
  edges: "엣지만 바꿈",
  corners: "코너만 바꿈",
  adjacent: "이웃 코너 둘 + 엣지 바꿈",
  diagonal: "대각 코너 둘 + 엣지 바꿈",
  g: "G 묶음(코너 셋·엣지 셋 돌림)",
} as const;

export const PLL_CASES: AlgCase[] = [
  pll(
    "ua",
    "edges",
    "Ua 퍼뮤(엣지 셋 돌리기, 시계 반대)",
    ["M2 U M U2 M' U M2", "R U' R U R U R U' R' U' R2"],
    {
      note: "한 면이 통째로 맞음. 나머지 엣지 셋이 돌아요.",
    },
  ),
  pll("ub", "edges", "Ub 퍼뮤(엣지 셋 돌리기, 시계)", [
    "M2 U' M U2 M' U' M2",
    "R2 U R U R' U' R' U' R' U R'",
  ]),
  pll("h", "edges", "H 퍼뮤(맞은편 엣지끼리 바꾸기)", ["M2 U M2 U2 M2 U M2"], {
    note: "네 옆면 모두 가운데 칸만 맞은편 색",
  }),
  pll("z", "edges", "Z 퍼뮤(이웃 엣지 두 쌍 바꾸기)", [
    "M' U M2 U M2 U M' U2 M2",
  ]),
  pll(
    "aa",
    "corners",
    "Aa 퍼뮤(코너 셋 돌리기)",
    ["x R' U R' D2 R U' R' D2 R2 x'", "R' F R' B2 R F' R' B2 R2"],
    {
      note: "한쪽에 헤드라이트. 코너 셋의 자리만 바꾸고 방향은 지켜요.",
    },
  ),
  pll("ab", "corners", "Ab 퍼뮤(코너 셋 반대로 돌리기)", [
    "x R2 D2 R U R' D2 R U' R x'",
    "R2 B2 R F R' B2 R F' R",
  ]),
  pll(
    "e",
    "corners",
    "E 퍼뮤(코너 두 쌍 바꾸기)",
    ["x' R U' R' D R U R' D' R U R' D R U' R' D' x"],
    {
      note: "헤드라이트가 하나도 없음",
    },
  ),
  pll("t", "adjacent", "T 퍼뮤", ["R U R' U' R' F R2 U' R' U' R U R' F'"], {
    fingers: "RW RI RW LI RW RIf RW LI RW LI RW RI RW LIf",
    note: "왼쪽에 헤드라이트(사이 칸만 다른 색), 앞·뒤에는 왼쪽 두 칸이 같은 색으로 붙어 있음",
  }),
  pll("f", "adjacent", "F 퍼뮤", [
    "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
  ]),
  pll("ja", "adjacent", "Ja 퍼뮤", [
    "x R2 F R F' R U2 r' U r U2 x'",
    "R' U L' U2 R U' R' U2 R L",
  ]),
  pll("jb", "adjacent", "Jb 퍼뮤", ["R U R' F' R U R' U' R' F R2 U' R'"], {
    fingers: "RW RI RW LIf RW RI RW LI RW RIf RW LI RW",
  }),
  pll("ra", "adjacent", "Ra 퍼뮤", ["R U' R' U' R U R D R' U' R D' R' U2 R'"]),
  pll("rb", "adjacent", "Rb 퍼뮤", ["R2 F R U R U' R' F' R U2 R' U2 R"]),
  pll("v", "diagonal", "V 퍼뮤", ["R' U R' U' y R' F' R2 U' R' U R' F R F"]),
  pll("y", "diagonal", "Y 퍼뮤", [
    "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  ]),
  pll("na", "diagonal", "Na 퍼뮤", [
    "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
  ]),
  pll("nb", "diagonal", "Nb 퍼뮤", [
    "R' U R U' R' F' U' F R U R' F R' F' R U' R",
  ]),
  pll("ga", "g", "Ga 퍼뮤", ["R2 U R' U R' U' R U' R2 U' D R' U R D'"]),
  pll("gb", "g", "Gb 퍼뮤", ["R' U' R U D' R2 U R' U R U' R U' R2 D"]),
  pll("gc", "g", "Gc 퍼뮤", ["R2 U' R U' R U R' U R2 U D' R U' R' D"]),
  pll("gd", "g", "Gd 퍼뮤", ["R U R' U' D R2 U' R U' R' U R' U R2 D'"]),
];
