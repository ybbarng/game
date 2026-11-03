// 설명 글(note)의 위치 낱말이 실제 상황과 맞는지 본다. 상황은 맞춘 큐브에 대표 공식의 거꾸로를 돌려 만든다.
// ① 위치를 말하는 설명마다 그 말이 사실인지 확인한다(아래 CLAIMS).
// ② 모든 상황을 위에서 내려다본 문자 그림으로 뽑아 __snapshots__/ll-pictures.txt에 둔다. 공식이나 설명을 바꾸면
//    그림 파일이 달라져 시험이 실패하므로, 그림과 설명을 사람이 다시 대조한 뒤 `vitest -u`로 고친다.
import { describe, expect, it } from "vitest";
import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "../algs-2look";
import { OLL_CASES } from "../algs-oll";
import { ORTEGA_OLL, ORTEGA_PBL } from "../algs-ortega";
import { PLL_CASES } from "../algs-pll";
import type { AlgCase } from "../types";
import { apply, type Cube, invert, normalize, solved } from "./sim";

const TOP = 0;

type Dir = "U" | "D" | "F" | "B" | "L" | "R";
const NORMAL: Record<Dir, number[]> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  L: [-1, 0, 0],
  R: [1, 0, 0],
};

// 자리 이름: 꼭짓점 FL·FR·BL·BR, 모서리 F·B·L·R. 층은 y(2 위, -2 아래)
function posOf(name: string, y: number): number[] {
  const x = name.includes("L") ? -2 : name.includes("R") ? 2 : 0;
  const z = name.includes("F") ? 2 : name.includes("B") ? -2 : 0;
  return [x, y, z];
}

function colorAt(c: Cube, pos: number[], dir: Dir): number {
  const n = NORMAL[dir];
  const s = c.stickers.find(
    (s) =>
      s.pos.every((v, i) => v === pos[i]) &&
      s.normal.every((v, i) => v === n[i]),
  );
  if (!s) throw new Error(`스티커 없음 ${pos} ${dir}`);
  return s.color;
}

const stateOf = (alg: string) => normalize(apply(solved(3), invert(alg)));

const ALL = [
  ...OLL_CASES,
  ...TWO_LOOK_OLL,
  ...ORTEGA_OLL,
  ...PLL_CASES,
  ...TWO_LOOK_PLL,
  ...ORTEGA_PBL,
];
const byId = (id: string): AlgCase => {
  const c = ALL.find((x) => x.id === id);
  if (!c) throw new Error(`없는 상황 ${id}`);
  return c;
};

/** 위층 자리의 노란(윗면 색) 칸이 dir을 본다 */
const yellow = (c: Cube, where: string, dir: Dir) =>
  colorAt(c, posOf(where, 2), dir) === TOP;

/** y층의 side 옆면에서 두 꼭짓점 칸이 같은 색(헤드라이트) */
const headlights = (c: Cube, side: "F" | "B" | "L" | "R", y = 2) => {
  const corners =
    side === "F" || side === "B"
      ? [`${side}L`, `${side}R`]
      : [`F${side}`, `B${side}`];
  return (
    colorAt(c, posOf(corners[0] as string, y), side) ===
    colorAt(c, posOf(corners[1] as string, y), side)
  );
};
/** side 옆면 윗줄 세 칸이 모두 같은 색 */
const sideSolved = (c: Cube, side: "F" | "B" | "L" | "R") =>
  headlights(c, side) &&
  colorAt(c, posOf(side, 2), side) ===
    colorAt(
      c,
      posOf(side === "F" || side === "B" ? `${side}L` : `F${side}`, 2),
      side,
    );

type Claim = [label: string, check: (c: Cube) => boolean];
const up = (...where: string[]): Claim => [
  `${where.join("·")} 위가 노랑`,
  (c) => where.every((w) => yellow(c, w, "U")),
];
const notUp = (...where: string[]): Claim => [
  `${where.join("·")} 위가 노랑이 아님`,
  (c) => where.every((w) => !yellow(c, w, "U")),
];
const faces = (where: string, dir: Dir): Claim => [
  `${where}의 노랑이 ${dir}를 봄`,
  (c) => yellow(c, where, dir),
];
const lights = (side: "F" | "B" | "L" | "R", y = 2): Claim => [
  `${y > 0 ? "위" : "아래"}층 ${side}에 헤드라이트`,
  (c) => headlights(c, side, y),
];
const noLights = (): Claim => [
  "헤드라이트 없음",
  (c) => (["F", "B", "L", "R"] as const).every((s) => !headlights(c, s)),
];
const solvedSide = (side: "F" | "B" | "L" | "R"): Claim => [
  `${side} 윗줄이 통째로 맞음`,
  (c) => sideSolved(c, side),
];

// 상황 id → [어느 공식(algs 번호), 확인할 말들]. 설명·이름·배우기 글의 위치 낱말이 모두 여기 있어야 한다.
const CLAIMS: [id: string, alg: number, claims: Claim[]][] = [
  ["oll-3", 0, [up("FL"), notUp("FR", "BL", "BR")]],
  ["oll-4", 0, [up("FR"), notUp("FL", "BL", "BR")]],
  ["oll-18", 0, [up("BL", "BR"), notUp("FL", "FR")]],
  [
    "oll-21",
    0,
    [faces("FL", "F"), faces("FR", "F"), faces("BL", "B"), faces("BR", "B")],
  ],
  [
    "oll-22",
    0,
    [faces("FL", "L"), faces("BL", "L"), faces("FR", "F"), faces("BR", "B")],
  ],
  ["oll-23", 0, [up("FL", "FR"), faces("BL", "B"), faces("BR", "B")]],
  ["oll-26", 0, [up("BR"), notUp("FL", "FR", "BL"), faces("FL", "F")]],
  ["oll-27", 0, [up("FL"), notUp("FR", "BL", "BR"), faces("FR", "F")]],
  ["2look-oll-line", 0, [up("L", "R"), notUp("F", "B")]],
  ["2look-oll-l", 0, [up("L", "B"), notUp("F", "R")]],
  ["2look-oll-l", 1, [up("F", "R"), notUp("L", "B")]],
  ["2look-oll-21", 0, [faces("FL", "F"), faces("BL", "B")]],
  ["2look-oll-23", 0, [up("FL", "FR"), faces("BL", "B"), faces("BR", "B")]],
  ["2look-oll-26", 0, [up("BR"), faces("FL", "F")]],
  ["2look-oll-27", 0, [up("FL"), faces("FR", "F")]],
  ["ortega-oll-sune", 0, [up("FL"), notUp("FR", "BL", "BR")]],
  ["ortega-oll-antisune", 0, [up("BR"), notUp("FL", "FR", "BL")]],
  [
    "ortega-oll-h",
    0,
    [faces("FL", "F"), faces("FR", "F"), faces("BL", "B"), faces("BR", "B")],
  ],
  [
    "ortega-oll-pi",
    0,
    [faces("FL", "L"), faces("BL", "L"), faces("FR", "F"), faces("BR", "B")],
  ],
  ["ortega-oll-u", 0, [up("FR", "BR"), faces("FL", "L"), faces("BL", "L")]],
  ["ortega-oll-t", 0, [up("FR", "BR"), faces("FL", "F"), faces("BL", "B")]],
  ["ortega-oll-l", 0, [up("BL", "FR"), notUp("FL", "BR")]],
  ["pll-ua", 0, [solvedSide("B")]],
  ["pll-ua", 1, [solvedSide("B")]],
  ["pll-ub", 0, [solvedSide("B")]],
  ["pll-ub", 1, [solvedSide("B")]],
  ["pll-aa", 0, [lights("B")]],
  ["pll-aa", 1, [lights("B")]],
  ["pll-e", 0, [noLights()]],
  [
    "pll-t",
    0,
    [
      lights("L"),
      [
        "L 가운데만 다른 색",
        (c) =>
          colorAt(c, posOf("L", 2), "L") !== colorAt(c, posOf("FL", 2), "L"),
      ],
    ],
  ],
  ["2look-pll-headlights", 0, [lights("L")]],
  ["2look-pll-diagonal", 0, [noLights()]],
  ["2look-pll-ua", 0, [solvedSide("B")]],
  ["2look-pll-ub", 0, [solvedSide("B")]],
  ["ortega-pbl-adj-top", 0, [lights("L")]],
  ["ortega-pbl-adj-adj", 0, [lights("F"), lights("F", -2)]],
  ["ortega-pbl-adj-diag", 0, [lights("F")]],
];

describe("설명 글의 위치 낱말", () => {
  it.each(CLAIMS.map(([id, alg, claims]) => ({ id, alg, claims })))(
    "$id (공식 $alg)",
    ({ id, alg, claims }) => {
      const c = byId(id);
      const s = stateOf(c.algs[alg] as string);
      for (const [label, check] of claims)
        expect(check(s), `${c.name}: ${label}`).toBe(true);
    },
  );
});

// 위에서 내려다본 그림. 맨 윗줄은 뒷면, 맨 아랫줄은 앞면, 양옆은 왼쪽·오른쪽 면의 위층 칸.
const SIDE_LETTER = ["·", "r", "f", "·", "l", "b"];
function picture(c: Cube, mode: "oll" | "pll", y: number, corners: boolean) {
  const xs = corners ? [-2, 2] : [-2, 0, 2];
  const ch = (pos: number[], dir: Dir) => {
    const col = colorAt(c, pos, dir);
    if (mode === "oll") return col === TOP ? "#" : ".";
    return dir === "U" || dir === "D" ? "·" : (SIDE_LETTER[col] as string);
  };
  const face: Dir = y > 0 ? "U" : "D";
  const pad = " ".repeat(2);
  const rows = [`${pad}${xs.map((x) => ch([x, y, -2], "B")).join("")}`];
  for (const z of xs)
    rows.push(
      `${ch([-2, y, z], "L")} ${xs.map((x) => ch([x, y, z], face)).join("")} ${ch([2, y, z], "R")}`,
    );
  rows.push(`${pad}${xs.map((x) => ch([x, y, 2], "F")).join("")}`);
  return rows.join("\n");
}

describe("상황 그림 표", () => {
  it("그림과 설명을 한 파일에 둔다", async () => {
    const out = [
      "# 위층 상황 그림(pictures.test.ts가 만든다)",
      "# 위에서 내려다봄: 맨 윗줄 = 뒷면, 맨 아랫줄 = 앞면, 양옆 = 왼쪽·오른쪽 면의 위층 칸",
      "# OLL: # 노랑(윗면 색), . 다른 색 / PLL: 옆면 칸이 원래 있던 면(f 앞, r 오른쪽, b 뒤, l 왼쪽)",
      "# 2×2(오르테가)는 꼭짓점만 그린다",
      "",
    ];
    for (const c of ALL) {
      const mode =
        c.set.includes("pll") || c.set === "ortega-pbl" ? "pll" : "oll";
      const small = c.set.startsWith("ortega");
      c.algs.forEach((alg, i) => {
        const s = stateOf(alg);
        out.push(`## ${c.id} ${c.name}${i > 0 ? ` (대안 ${i})` : ""}`);
        out.push(`공식: ${alg}`);
        if (c.note !== undefined) out.push(`설명: ${c.note}`);
        out.push(picture(s, mode, 2, small));
        if (c.set === "ortega-pbl")
          out.push(`아래층(위에서 비춰 봄)\n${picture(s, mode, -2, small)}`);
        out.push("");
      });
    }
    await expect(out.join("\n")).toMatchFileSnapshot(
      "__snapshots__/ll-pictures.txt",
    );
  });
});
