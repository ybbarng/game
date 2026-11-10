// 페트루스 블록의 엣지 블럭 놓기 경우별 정해진 길(docs/47 16-15). 흰 면 위·초록 앞 그대로 쥔다.
// 2×2×2: ① 노랑-주황 → 아래-왼쪽, ② 노랑-파랑 → 아래-뒤(①을 옮기는 L·D는 쓰지 않음). 2×2×3: ③ 노랑-초록 → 아래-앞
// (블록을 옮기는 L·B·D는 쓰지 않음). 경우는 셋뿐이다: 가운데 층·아래 층(제자리가 아님)이면 먼저 위 층으로 올리고,
// 위 층에서 노란색이 위를 보면 U로 그 자리 바로 위에 두고 반 바퀴, 옆을 보면 U로 정한 자리에 두고 두 수.
// lessons-zz.ts가 이 표를 글로 쓰고, petrus-path.test.ts가 24가지 시작마다 맞는지 본다.
import { cubeTopology, faceColors } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { badEdges, play3 } from "./zz-path";

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

// ── 엣지 방향 고치기(2×2×3 블록 뒤) ─────────────────────────────────────────────
// 흰 면 위·초록 앞 그대로. 블록 밖 엣지 블럭 일곱(위 층 넷, 앞-오른쪽·뒤-오른쪽·아래-오른쪽) 가운데 나쁜 엣지는
// 0·2·4·6개다. 한 번에 꼭 둘을 고친다: 나쁜 엣지 하나를 앞-오른쪽에 두고, 다른 하나가 위 층 위-오른쪽·위-뒤·위-왼쪽
// 가운데 어디 있는지에 따라 F' U F · F' U2 F · F' U' F. F'가 블록의 앞쪽 조각(아래-앞·앞-왼쪽 엣지 블럭, 아래-앞-왼쪽
// 코너 블럭)을 U가 닿지 않는 자리로 비켜 두고 F가 되돌리니 블록은 그대로다(petrus-path.test.ts가 엔진으로 본다).
// 그래서 고치는 횟수는 나쁜 엣지 수의 절반(6개면 세 번)이다. 나머지 수는 R·U뿐이라 블록을 건드리지 않는다.

/** 앞-오른쪽을 채운 방법 */
export type PetrusFill = "ready" | "right" | "top-right" | "top";
/** 짝 나쁜 엣지가 있던 곳 */
export type PetrusPartner = "ur" | "ub" | "ul" | "uf" | "br" | "dr";

export interface PetrusEoStep {
  fill: PetrusFill;
  partner: PetrusPartner;
  hold: string;
  alg: string;
}

const isBad = (s: PuzzleState, faces: string) =>
  badEdges(s).some(
    (f) => f.length === 2 && [...faces].every((c) => f.includes(FN.indexOf(c))),
  );

/** 짝 자리 → [고치기 전 수, 고치는 공식] */
const PARTNER: [PetrusPartner, string, string, string][] = [
  ["ur", "UR", "", "F' U F"],
  ["ub", "UB", "", "F' U2 F"],
  ["ul", "UL", "", "F' U' F"],
  ["uf", "UF", "U'", "F' U F"],
  ["br", "BR", "R' U' R", "F' U2 F"],
  ["dr", "DR", "R2 U' R2", "F' U2 F"],
];

/** 엣지 방향의 다음 한 걸음(나쁜 엣지가 없으면 null) */
export function nextPetrusEo(s: PuzzleState): PetrusEoStep | null {
  if (badEdges(s).length === 0) return null;
  // ① 앞-오른쪽에 나쁜 엣지를 둔다
  let fill: PetrusFill = "ready";
  let setup = "";
  if (!isBad(s, "FR")) {
    if (isBad(s, "DR")) [fill, setup] = ["right", "R"];
    else if (isBad(s, "BR")) [fill, setup] = ["right", "R2"];
    else if (isBad(s, "UR")) [fill, setup] = ["top-right", "R'"];
    else {
      const u = (
        [
          ["UF", "U'"],
          ["UB", "U"],
          ["UL", "U2"],
        ] as const
      ).find(([f]) => isBad(s, f));
      if (!u) throw new Error("나쁜 엣지 자리를 모른다");
      [fill, setup] = ["top", `${u[1]} R'`];
    }
  }
  const t = play3(s, setup);
  // ② 짝 나쁜 엣지 자리에 따라 공식
  const p = PARTNER.find(([, f]) => isBad(t, f));
  if (!p) throw new Error("짝 나쁜 엣지가 없다");
  return {
    fill,
    partner: p[0],
    hold: mergeTurns(`${setup} ${p[2]}`),
    alg: p[3],
  };
}

/** 이웃한 같은 면 돌리기를 합친다(R과 R2 → R', R과 R' → 없음) */
function mergeTurns(alg: string): string {
  const out: [string, number][] = [];
  for (const m of alg.split(/\s+/).filter(Boolean)) {
    const q = m.endsWith("2") ? 2 : m.endsWith("'") ? 3 : 1;
    const last = out[out.length - 1];
    if (last && last[0] === m[0]) {
      last[1] = (last[1] + q) % 4;
      if (last[1] === 0) out.pop();
    } else out.push([m[0] as string, q]);
  }
  return out.map(([f, q]) => f + ["", "", "2", "'"][q]).join(" ");
}

export const stepMovesPetrusEo = (st: PetrusEoStep) =>
  [st.hold, st.alg].filter(Boolean).join(" ");

export function runPetrusEo(s: PuzzleState): {
  state: PuzzleState;
  steps: PetrusEoStep[];
} {
  const steps: PetrusEoStep[] = [];
  let state = s;
  for (;;) {
    const st = nextPetrusEo(state);
    if (!st) return { state, steps };
    steps.push(st);
    if (steps.length > 3) throw new Error("엣지 방향이 끝나지 않는다");
    state = play3(state, stepMovesPetrusEo(st));
  }
}
