// 페트루스 블록의 엣지 블럭 놓기 경우별 정해진 길(docs/47 16-15). 흰 면 위·초록 앞 그대로 쥔다.
// 2×2×2: ① 노랑-주황 → 아래-왼쪽, ② 노랑-파랑 → 아래-뒤(①을 옮기는 L·D는 쓰지 않음). 2×2×3: ③ 노랑-초록 → 아래-앞
// (블록을 옮기는 L·B·D는 쓰지 않음). 경우는 셋뿐이다: 가운데 층·아래 층(제자리가 아님)이면 먼저 위 층으로 올리고,
// 위 층에서 노란색이 위를 보면 U로 그 자리 바로 위에 두고 반 바퀴, 옆을 보면 U로 정한 자리에 두고 두 수.
// lessons-zz.ts가 이 표를 글로 쓰고, petrus-path.test.ts가 24가지 시작마다 맞는지 본다.
import { cubeTopology, faceColors } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { play3 } from "./zz-path";

const FN = "URFDLB";
const TOPO = cubeTopology(3);

export interface PetrusEdge {
  id: "dl" | "db" | "df";
  /** 엣지 블럭의 두 색(엔진 색 번호, 첫째가 노랑) */
  colors: [number, number];
  /** 제자리(면 글자 둘, 정렬) */
  home: string;
  /** 노란색이 위를 볼 때: U로 둘 위 층 자리와 반 바퀴 */
  topSlot: string;
  half: string;
  /** 노란색이 옆을 볼 때: U로 둘 위 층 자리와 두 수 */
  sideSlot: string;
  side: string;
  /** 가운데 층·아래 층에서 위 층으로 올리는 수(자리 → 수) */
  lift: Record<string, string>;
  /** 아래 층에서 노란색이 아래를 보면 D로 바로(①만) */
  bottomByD: boolean;
}

const sortFaces = (s: string) => [...s].sort().join("");

export const PETRUS_EDGES: PetrusEdge[] = [
  {
    id: "dl",
    colors: [3, 4],
    home: sortFaces("DL"),
    topSlot: sortFaces("UL"),
    half: "L2",
    sideSlot: sortFaces("UF"),
    side: "F' L",
    lift: {
      [sortFaces("FR")]: "R",
      [sortFaces("BR")]: "R'",
      [sortFaces("FL")]: "F",
      [sortFaces("BL")]: "B'",
      [sortFaces("DF")]: "F2",
      [sortFaces("DR")]: "R2",
      [sortFaces("DB")]: "B2",
      [sortFaces("DL")]: "L2",
    },
    bottomByD: true,
  },
  {
    id: "db",
    colors: [3, 5],
    home: sortFaces("DB"),
    topSlot: sortFaces("UB"),
    half: "B2",
    sideSlot: sortFaces("UR"),
    side: "R B'",
    lift: {
      [sortFaces("FR")]: "R",
      [sortFaces("BR")]: "R'",
      [sortFaces("FL")]: "F",
      [sortFaces("BL")]: "B'",
      [sortFaces("DF")]: "F2",
      [sortFaces("DR")]: "R2",
      [sortFaces("DB")]: "B2",
    },
    bottomByD: false,
  },
  {
    id: "df",
    colors: [3, 2],
    home: sortFaces("DF"),
    topSlot: sortFaces("UF"),
    half: "F2",
    sideSlot: sortFaces("UR"),
    side: "R' F",
    lift: {
      [sortFaces("FR")]: "R",
      [sortFaces("BR")]: "R'",
      [sortFaces("FL")]: "F",
      [sortFaces("DR")]: "R2",
      [sortFaces("DF")]: "F2",
    },
    bottomByD: false,
  },
];

/** 그 두 색 엣지 블럭의 자리(면 글자 둘, 정렬)와 노란색이 보는 면 */
export function edgeAt(
  s: PuzzleState,
  colors: [number, number],
): { slot: string; yellow: string } {
  const col = faceColors(3, s);
  for (const p of TOPO.pieces) {
    if (p.kind !== "edge") continue;
    const cs = p.stickers.map((st) => col[st] as number);
    const k = cs.indexOf(colors[0]);
    if (k >= 0 && cs.includes(colors[1])) {
      const faces = p.stickers.map(
        (st) => FN[TOPO.stickers[st]?.face as number] as string,
      );
      return { slot: sortFaces(faces.join("")), yellow: faces[k] as string };
    }
  }
  throw new Error("엣지 블럭을 못 찾음");
}

const U_TURNS = ["", "U", "U'", "U2"];

/** 그 엣지 블럭을 제자리에 놓는 수(경우 셋을 차례로) */
export function placePetrusEdge(s: PuzzleState, e: PetrusEdge): string {
  const moves: string[] = [];
  let t = s;
  for (let guard = 0; guard < 3; guard++) {
    const at = edgeAt(t, e.colors);
    if (at.slot === e.home && at.yellow === "D") return moves.join(" ");
    if (at.slot.includes("U")) {
      const up = at.yellow === "U";
      const slot = up ? e.topSlot : e.sideSlot;
      const u = U_TURNS.find(
        (x) => edgeAt(play3(t, x), e.colors).slot === slot,
      );
      const seq = [u, up ? e.half : e.side].filter(Boolean).join(" ");
      moves.push(seq);
      t = play3(t, seq);
      continue;
    }
    if (e.bottomByD && at.slot.includes("D") && at.yellow === "D") {
      const d = ["D", "D'", "D2"].find(
        (x) => edgeAt(play3(t, x), e.colors).slot === e.home,
      ) as string;
      moves.push(d);
      t = play3(t, d);
      continue;
    }
    const lift = e.lift[at.slot];
    if (!lift) throw new Error(`올리는 수 없음: ${at.slot}`);
    moves.push(lift);
    t = play3(t, lift);
  }
  throw new Error("엣지 블럭을 놓지 못함");
}
