// 학습 흐름 보충(docs/47 8-1 「학습 흐름 보충」, CFOP·큰 큐브·블라인드·과정 끝): 새 단계의 글이 말하는 모양과 고르기 문제의 답을 엔진으로 확인한다.
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { BLD_CORNER_TARGETS, BLD_EDGE_TARGETS } from "./bld";
import { COURSES, courseById, nextCourses } from "./index";
import { goalMet } from "./judge";
import { CENTER_LAST_TWO, CENTER_YELLOW, CORNER_SWAP_444 } from "./lessons-big";
import {
  FLIPPED_EDGE,
  MEMO_CORNERS_2,
  MEMO_EDGES_2,
  MEMO_EDGES_4,
  sendCorners,
  sendEdges,
} from "./lessons-bld";
import {
  CFOP_INTRO,
  CFOP21,
  CORNER_STUCK,
  CROSS_TOP_UP,
  EDGE_STUCK,
  FAKE_PAIR,
  JOIN_FRONT,
  JOIN_RIGHT,
  PAIR_FRONT,
  PAIR_RIGHT,
  SPLIT_RIGHT,
  T_PERM,
  WHITE_UP,
  Y_PERM,
  Z_PERM_AUF,
} from "./lessons-cfop";
import { setupFor } from "./notation";
import type { Lesson, LessonStep, QuizSpec } from "./types";

const play = (n: number, alg: string, s: PuzzleState = solvedCube(n)) =>
  applyMoves(n, s, parseMoves(n, alg));
const held = (solution: string) => play(3, setupFor(solution, "z2"));
const same = (a: PuzzleState, b: PuzzleState) =>
  a.perm.every((v, i) => v === b.perm[i]);
/** 맞춘 큐브와 색이 다른 칸 */
const diffColors = (n: number, s: PuzzleState) => {
  const now = faceColors(n, s);
  const base = faceColors(n, solvedCube(n));
  return [...now.keys()].filter((i) => now[i] !== base[i]);
};

// ── 3×3 스티커 이름(첫 글자가 그 칸의 면, 나머지는 같은 조각이 닿은 면) ──
const FACES = "URFDLB";
const AXIS: Record<string, [number, number]> = {
  U: [1, 1],
  D: [1, -1],
  R: [0, 1],
  L: [0, -1],
  F: [2, 1],
  B: [2, -1],
};
function sticker(name: string): number {
  const p: [number, number, number] = [0, 0, 0];
  for (const ch of name) {
    const [a, v] = AXIS[ch] as [number, number];
    p[a] = v;
  }
  return cubeTopology(3).stickerAt(p, FACES.indexOf(name[0] as string));
}
/** 그 칸의 색(맞춘 큐브에서 그 색이 있던 면 글자) */
const col = (s: PuzzleState, name: string) =>
  FACES[faceColors(3, s)[sticker(name)] as number] as string;
/** 칸 `name`과 같은 조각의 칸들 이름(첫 글자를 돌려 가며) */
const rotations = (name: string) =>
  [...name].map((c) => c + [...name].filter((x) => x !== c).join(""));

const step = (lesson: Lesson, kind: LessonStep["kind"], k = 0) =>
  lesson.steps.filter((s) => s.kind === kind)[k] as LessonStep;
const lessonOf = (id: string) =>
  COURSES.flatMap((c) => c.lessons).find((l) => l.id === id) as Lesson;
const stateOf = (st: LessonStep, n = 3) =>
  play(n, (st.setup as { alg: string }).alg);
const answer = (st: LessonStep) => {
  const q = st.quiz as QuizSpec;
  return q.choices[q.answer];
};

// ── CFOP ──────────────────────────────────────────────

/** 흰 면 아래로 쥐었을 때 앞-오른쪽 칸 짝(꼭짓점 흰-초록-주황, 모서리 초록-주황)이 어떤가 */
function pairState(s: PuzzleState): {
  corner: string;
  edge: string;
  kind: "붙음" | "가짜" | "떨어짐";
} {
  const sorted = (x: string) => [...x].sort().join("");
  const pieceAt = (pos: string) =>
    sorted(
      rotations(pos)
        .map((n) => col(s, n))
        .join(""),
    );
  const corner = ["UFR", "URB", "UBL", "ULF", "DFR", "DRB", "DBL", "DLF"].find(
    (p) => pieceAt(p) === sorted("UFL"),
  ) as string;
  const edge = ["UF", "UR", "UB", "UL", "FR", "RB", "BL", "LF"].find(
    (p) => pieceAt(p) === sorted("FL"),
  ) as string;
  if (![...edge].every((f) => corner.includes(f)))
    return { corner, edge, kind: "떨어짐" };
  const joined = [...edge].every((f) => {
    const cn = f + [...corner].filter((x) => x !== f).join("");
    const en = f + [...edge].filter((x) => x !== f).join("");
    return col(s, cn) === col(s, en);
  });
  return { corner, edge, kind: joined ? "붙음" : "가짜" };
}

describe("CFOP 십자", () => {
  const lesson = lessonOf("cfop-cross");
  it("흰색이 위인 모서리 문제: 답의 수만 십자를 만든다", () => {
    const st = step(lesson, "quiz");
    const s = stateOf(st);
    expect(s).toEqual(held(CROSS_TOP_UP));
    const algs = ["F2", "U' F2", "U' F"];
    const ok = algs.map((a) => goalMet(3, play(3, a, s), "cross"));
    expect(ok).toEqual([false, true, false]);
    expect(st.quiz?.answer).toBe(1);
    // 흰-초록 모서리가 위층에서 흰색이 위
    expect(col(s, "UL")).toBe("U");
    expect(col(s, "LU")).toBe("F");
  });

  it("가운데 줄·흰색이 옆인 모서리 해 보기는 그 모양에서 시작한다", () => {
    const tries = lesson.steps.filter((s) => s.kind === "try");
    const middle = stateOf(tries[1] as LessonStep);
    expect([col(middle, "FR"), col(middle, "RF")]).toEqual(["F", "U"]);
    const side = stateOf(tries[2] as LessonStep);
    expect([col(side, "UF"), col(side, "FU")]).toEqual(["F", "U"]);
  });
});

describe("CFOP F2L 짝", () => {
  const lesson = lessonOf("cfop-f2l-pair");
  const CHOICE = { 붙음: 0, 가짜: 1, 떨어짐: 2 } as const;

  it("진짜 짝·가짜 짝 문제의 답을 엔진으로 센다", () => {
    for (const k of [0, 1]) {
      const st = step(lesson, "quiz", k);
      const p = pairState(stateOf(st));
      expect(st.quiz?.answer, st.body).toBe(CHOICE[p.kind]);
    }
    expect(pairState(held(PAIR_RIGHT))).toMatchObject({
      corner: "UFR",
      edge: "UR",
      kind: "붙음",
    });
    expect(pairState(held(FAKE_PAIR))).toMatchObject({
      corner: "UFR",
      edge: "UF",
      kind: "가짜",
    });
  });

  it("붙은 짝은 모서리 쪽에서 넣는다(오른쪽 R, 앞 F')", () => {
    expect(pairState(held(PAIR_FRONT))).toMatchObject({
      edge: "UF",
      kind: "붙음",
    });
    const st = step(lesson, "quiz", 2);
    const s = stateOf(st);
    const ok = ["U R U' R'", "U' F' U F"].map((a) =>
      goalMet(3, play(3, a, s), "f2l-pair:FR"),
    );
    expect(ok.indexOf(true)).toBe(st.quiz?.answer);
  });

  it("떨어졌지만 바로 들어가는 자리: 흰색 오른쪽+모서리 뒤, 흰색 앞+모서리 왼쪽", () => {
    const r = held(JOIN_RIGHT);
    expect(pairState(r)).toMatchObject({ edge: "UB", kind: "떨어짐" });
    expect(col(r, "RUF")).toBe("U");
    const f = held(JOIN_FRONT);
    expect(pairState(f)).toMatchObject({ edge: "UL", kind: "떨어짐" });
    expect(col(f, "FUR")).toBe("U");
  });

  it("떨어진 짝·흰색 위·칸에 박힌 조각: 앞 수 뒤에 글이 말한 모양이 된다", () => {
    expect(pairState(held(SPLIT_RIGHT)).kind).toBe("떨어짐");
    expect(pairState(play(3, "U' R U R'", held(SPLIT_RIGHT)))).toMatchObject({
      corner: "URB",
      edge: "UB",
      kind: "붙음",
    });
    expect(col(held(WHITE_UP), "UFR")).toBe("U");
    expect(same(play(3, "R U2 R' U'", held(WHITE_UP)), held(JOIN_RIGHT))).toBe(
      true,
    );
    expect(pairState(held(CORNER_STUCK)).corner).toBe("DFR");
    expect(
      same(play(3, "R U R' U'", held(CORNER_STUCK)), held(JOIN_RIGHT)),
    ).toBe(true);
    const stuck = pairState(held(EDGE_STUCK));
    expect(stuck.edge).toBe("FR");
    // 뒤집혀 박힘: 앞면 칸이 주황
    expect(col(held(EDGE_STUCK), "FR")).toBe("L");
    expect(same(play(3, "F' U' F", held(EDGE_STUCK)), held(PAIR_RIGHT))).toBe(
      true,
    );
  });
});

describe("CFOP 2단계 OLL", () => {
  /** 위 꼭짓점마다 노랑(D)이 보는 면 */
  const yellowAt = (s: PuzzleState) =>
    Object.fromEntries(
      ["UFL", "UFR", "UBR", "UBL"].map((p) => [
        p,
        (rotations(p).find((n) => col(s, n) === "D") as string)[0],
      ]),
    );
  const LOOK: Record<string, Record<string, string>> = {
    "2look-oll-21": { UFL: "F", UFR: "F", UBR: "B", UBL: "B" },
    "2look-oll-22": { UFL: "L", UFR: "F", UBR: "B", UBL: "L" },
    "2look-oll-23": { UFL: "U", UFR: "U", UBR: "B", UBL: "B" },
    "2look-oll-24": { UFL: "F", UFR: "U", UBR: "U", UBL: "B" },
    "2look-oll-25": { UFL: "U", UFR: "F", UBR: "U", UBL: "L" },
    "2look-oll-26": { UFL: "F", UFR: "R", UBR: "U", UBL: "L" },
    "2look-oll-27": { UFL: "U", UFR: "F", UBR: "R", UBL: "B" },
  };
  it("꼭짓점 일곱 모양: 알아보는 법(note)이 상황과 맞는다", () => {
    for (const c of TWO_LOOK_OLL.filter((x) => x.group === "corners"))
      expect(yellowAt(held(c.algs[0] as string)), c.id).toEqual(LOOK[c.id]);
  });

  it("모양 이름 문제: 답의 공식만 윗면을 노랗게 한다", () => {
    const st = step(lessonOf("cfop-2look-oll"), "quiz", 1);
    const s = stateOf(st);
    const byName = (name: string) =>
      TWO_LOOK_OLL.find((c) => c.name.replace(/^꼭짓점: /, "").startsWith(name))
        ?.algs[0] as string;
    const ok = (st.quiz as QuizSpec).choices.map((n) =>
      goalMet(3, play(3, byName(n), s), "oll"),
    );
    expect(ok.indexOf(true)).toBe(st.quiz?.answer);
    expect(ok.filter(Boolean)).toHaveLength(1);
  });

  it("단원에 2단계 OLL 열 개가 모두 해 보기로 있다", () => {
    const algs = lessonOf("cfop-2look-oll").steps.map((s) => s.alg);
    for (const c of TWO_LOOK_OLL) expect(algs, c.id).toContain(c.algs[0]);
  });
});

describe("CFOP 2단계 PLL", () => {
  /** 옆면마다 위 줄 양 끝 꼭짓점 칸이 같은 색인가(헤드라이트) */
  const ROW: Record<string, [string, string, string]> = {
    F: ["FUL", "FU", "FUR"],
    R: ["RUF", "RU", "RUB"],
    B: ["BUR", "BU", "BUL"],
    L: ["LUB", "LU", "LUF"],
  };
  const headlights = (s: PuzzleState) =>
    Object.keys(ROW).filter((f) => {
      const [a, , b] = ROW[f] as [string, string, string];
      return col(s, a) === col(s, b);
    });

  it("T는 헤드라이트가 왼쪽 하나, Y는 없음, 모서리 공식은 네 면 모두", () => {
    expect(headlights(held(T_PERM))).toEqual(["L"]);
    expect(headlights(held(Y_PERM))).toEqual([]);
    for (const id of ["2look-pll-ua", "2look-pll-ub", "2look-pll-h"])
      expect(
        headlights(held(TWO_LOOK_PLL.find((c) => c.id === id)?.algs[0] ?? "")),
      ).toHaveLength(4);
    expect(headlights(held(Z_PERM_AUF))).toHaveLength(4);
  });

  it("Z퍼뮤는 U'를 붙인 상황에서 꼭짓점이 옆 가운데와 맞는다", () => {
    const centre = (s: PuzzleState, f: string) =>
      FACES[
        faceColors(3, s)[
          cubeTopology(3).stickerAt(
            [
              f === "R" ? 1 : f === "L" ? -1 : 0,
              0,
              f === "F" ? 1 : f === "B" ? -1 : 0,
            ],
            FACES.indexOf(f),
          )
        ] as number
      ];
    const s = held(Z_PERM_AUF);
    for (const f of Object.keys(ROW))
      expect(col(s, (ROW[f] as string[])[0] as string), f).toBe(centre(s, f));
  });

  it("T퍼뮤가 바꾸는 꼭짓점은 노랑-주황이 붙은 오른쪽 둘이다", () => {
    const moved = ["UFR", "URB", "UBL", "ULF"].filter((p) =>
      rotations(p).some((n) => col(held(T_PERM), n) !== col(held(""), n)),
    );
    expect(moved.sort()).toEqual(["UFR", "URB"]);
    // 맞춘 큐브를 흰 면 아래로 쥐면 오른쪽은 주황(L)
    expect(col(held(""), "RU")).toBe("L");
  });

  it("Ua는 앞 모서리가 오른쪽 면 색, Ub는 왼쪽 면 색(뒤가 다 맞음)", () => {
    const of = (id: string) =>
      held(TWO_LOOK_PLL.find((c) => c.id === id)?.algs[0] ?? "");
    for (const [id, side] of [
      ["2look-pll-ua", "RUF"],
      ["2look-pll-ub", "LUF"],
    ] as const) {
      const s = of(id);
      expect(col(s, "FU"), id).toBe(col(s, side));
      expect(col(s, "BU")).toBe(col(s, "BUR"));
    }
  });

  it("고르기 문제: 헤드라이트 없음 → Y퍼뮤, 모서리 모양 → 답의 공식만 맞춘다", () => {
    const lesson = lessonOf("cfop-2look-pll");
    const noLights = step(lesson, "quiz", 1);
    expect(headlights(stateOf(noLights))).toEqual([]);
    expect(answer(noLights)).toBe("Y퍼뮤 한 번");
    const all = step(lesson, "quiz", 2);
    expect(headlights(stateOf(all))).toHaveLength(4);
    const edges = step(lesson, "quiz", 3);
    const s = stateOf(edges);
    const algs = [
      ["2look-pll-ua", "2look-pll-ub"],
      ["2look-pll-h"],
      ["2look-pll-z"],
    ].map((ids) =>
      ids.some((id) =>
        ["", "U", "U'", "U2"].some((u) =>
          goalMet(
            3,
            play(
              3,
              `${TWO_LOOK_PLL.find((c) => c.id === id)?.algs[0]} ${u}`,
              s,
            ),
            "solved",
          ),
        ),
      ),
    );
    expect(algs.indexOf(true)).toBe(edges.quiz?.answer);
    expect(algs.filter(Boolean)).toHaveLength(1);
  });
});

describe("CFOP 한눈에 시연", () => {
  it("단계별 수가 섞인 큐브를 다 맞춘다(십자 → F2L 넷 → OLL → PLL)", () => {
    const demo = step(lessonOf("cfop-overview"), "demo");
    const s0 = stateOf(demo);
    let s = play(3, CFOP21.cross, s0);
    expect(goalMet(3, s, "cross")).toBe(true);
    for (const f of CFOP21.f2l) s = play(3, f, s);
    expect(goalMet(3, s, "f2l")).toBe(true);
    s = play(3, CFOP21.oll, s);
    expect(goalMet(3, s, "oll")).toBe(true);
    expect(goalMet(3, play(3, CFOP21.pll, s), "solved")).toBe(true);
    expect(goalMet(3, play(3, demo.alg as string, s0), "solved")).toBe(true);
  });
});

// ── 큰 큐브 ──────────────────────────────────────────────

describe("4×4·5×5", () => {
  const nn = (n: number) => n * n;
  /** 면 f의 가운데(바깥 줄이 아닌) 칸 색들 */
  const centerColors = (n: number, s: PuzzleState, f: number) => {
    const out: number[] = [];
    const colors = faceColors(n, s);
    for (let r = 1; r < n - 1; r++)
      for (let c = 1; c < n - 1; c++)
        out.push(colors[f * nn(n) + r * n + c] as number);
    return out;
  };

  it("노랑 모으기 상황은 흰 가운데가 다 맞은 채 시작한다", () => {
    const s = play(4, setupFor(CENTER_YELLOW));
    expect(centerColors(4, s, 0).every((c) => c === 0)).toBe(true);
    expect(centerColors(4, s, 3).every((c) => c === 3)).toBe(false);
  });

  it("마지막 두 면 상황은 위·앞 두 면만 섞여 있다", () => {
    const s = play(4, `z ${setupFor(CENTER_LAST_TWO)}`);
    const mixed = [0, 1, 2, 3, 4, 5].filter(
      (f) => new Set(centerColors(4, s, f)).size > 1,
    );
    expect(mixed).toEqual([0, 2]);
  });

  it("꼭짓점 둘만 바뀐 4×4: 처음엔 모서리·가운데가 다 맞고 꼭짓점 칸만 다르다", () => {
    const s = play(4, setupFor(CORNER_SWAP_444));
    const topo = cubeTopology(4);
    const diff = diffColors(4, s);
    expect(diff.length).toBeGreaterThan(0);
    expect(
      diff.every(
        (i) => topo.pieces[topo.stickers[i]?.piece ?? 0]?.kind === "corner",
      ),
    ).toBe(true);
  });

  it("5×5 가운데: 대각선 조각은 대각선 자리끼리만 오간다(문제 답)", () => {
    const topo = cubeTopology(5);
    const diagonal = (i: number) => {
      const p = topo.pieces[topo.stickers[i]?.piece ?? 0];
      if (p?.kind !== "innerCenter") return null;
      return p.position.filter((v) => v === 0).length === 0;
    };
    const s = play(5, "R 2U F' 2R B 2D L2 2F U' 2L D 2B'");
    for (let i = 0; i < s.perm.length; i++) {
      const here = diagonal(i);
      if (here === null) continue;
      expect(diagonal(s.perm[i] as number)).toBe(here);
    }
    const q = step(lessonOf("555-centers"), "quiz");
    expect(answer(q)).toMatch(/^아니요/);
  });

  it("4×4 모서리 찾기: 빨강-초록 날개 둘이 앞-오른쪽 위와 앞-왼쪽 아래에 있다", () => {
    const s = play(4, "Dw'");
    const topo = cubeTopology(4);
    const colors = faceColors(4, s);
    const at = topo.pieces
      .filter((p) => p.kind === "wing")
      .filter(
        (p) =>
          p.stickers
            .map((i) => colors[i] as number)
            .sort()
            .join() === "1,2",
      )
      .map((p) => p.position.join());
    expect(at.sort()).toEqual(["-1.5,-0.5,1.5", "1.5,0.5,1.5"].sort());
  });
});

// ── 블라인드 ──────────────────────────────────────────────

const EDGE_STICKERS =
  "UB UR UF UL LU LF LD LB FU FR FD FL RU RB RD RF BU BL BD BR DF DR DB DL".split(
    " ",
  );
const CORNER_STICKERS =
  "UBL UBR UFR UFL LUB LUF LDF LDB FUL FUR FDR FDL RUF RUB RDB RDF BUR BUL BDL BDR DFL DFR DBR DBL".split(
    " ",
  );
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWX";
const sameSticker = (a: string, b: string) =>
  a.length === b.length && a[0] === b[0] && [...a].every((c) => b.includes(c));

/** 버퍼에서 시작해 글자 줄을 따라간다(버퍼 조각이 나오면 끝) */
function memo(s: PuzzleState, list: string[], buffer: string): string {
  const out: string[] = [];
  let at = buffer;
  for (let i = 0; i < 24; i++) {
    // 이 자리 칸들의 색 = 그 조각의 제자리 칸 이름
    const home = rotations(at)
      .map((n) => col(s, n))
      .join("");
    if ([...home].sort().join("") === [...buffer].sort().join("")) break;
    const k = list.findIndex((x) => sameSticker(x, home));
    out.push(LETTERS[k] as string);
    at = home;
  }
  return out.join(" ");
}

describe("블라인드 외우기", () => {
  it("글자 이름표가 bld.ts의 자리와 같다", () => {
    for (const t of BLD_EDGE_TARGETS)
      expect(
        sameSticker(
          EDGE_STICKERS[LETTERS.indexOf(t.letter)] as string,
          t.sticker,
        ),
        t.letter,
      ).toBe(true);
    for (const t of BLD_CORNER_TARGETS)
      expect(
        sameSticker(
          CORNER_STICKERS[LETTERS.indexOf(t.letter)] as string,
          t.sticker,
        ),
        t.letter,
      ).toBe(true);
  });

  it("외우기 문제의 답은 버퍼에서 따라간 글자 줄이다", () => {
    const solveE = (letters: string) => play(3, setupFor(sendEdges(letters)));
    const solveC = (letters: string) => play(3, setupFor(sendCorners(letters)));
    expect(memo(solveE(MEMO_EDGES_2), EDGE_STICKERS, "UR")).toBe(MEMO_EDGES_2);
    expect(memo(solveE(MEMO_EDGES_4), EDGE_STICKERS, "UR")).toBe(MEMO_EDGES_4);
    expect(memo(solveC(MEMO_CORNERS_2), CORNER_STICKERS, "UBL")).toBe(
      MEMO_CORNERS_2,
    );
    const edges = lessonOf("bld-edges");
    const corners = lessonOf("bld-corners");
    expect(answer(step(edges, "quiz", 2))).toBe(MEMO_EDGES_2);
    expect(memo(stateOf(step(edges, "quiz", 2)), EDGE_STICKERS, "UR")).toBe(
      MEMO_EDGES_2,
    );
    expect(memo(stateOf(step(edges, "quiz", 3)), EDGE_STICKERS, "UR")).toBe(
      answer(step(edges, "quiz", 3)),
    );
    expect(
      memo(stateOf(step(corners, "quiz", 1)), CORNER_STICKERS, "UBL"),
    ).toBe(answer(step(corners, "quiz", 1)));
  });

  it("준비 수 문제와 꼭짓점 글자 문제의 답이 자료와 같다", () => {
    const j = step(lessonOf("bld-edges"), "quiz", 1);
    expect(answer(j)).toBe(
      BLD_EDGE_TARGETS.find((t) => t.letter === "J")?.setup,
    );
    const letters = lessonOf("bld-letters");
    const q = step(letters, "quiz", 1);
    expect(answer(q)).toBe("J");
    expect(
      sameSticker(
        BLD_CORNER_TARGETS.find((t) => t.letter === "J")?.sticker ?? "",
        "FUR",
      ),
    ).toBe(true);
  });

  it("제자리에서 뒤집힌 모서리: 버퍼와 위-앞 모서리 칸만 다르고, C I로 맞는다", () => {
    const s = play(3, setupFor(sendEdges(FLIPPED_EDGE)));
    expect(diffColors(3, s).sort()).toEqual(
      [sticker("UF"), sticker("FU"), sticker("UR"), sticker("RU")].sort(),
    );
    expect(goalMet(3, play(3, sendEdges(FLIPPED_EDGE), s), "solved")).toBe(
      true,
    );
  });
});

// ── 과정 끝 ──────────────────────────────────────────────

describe("과정 끝과 먼저 배울 과정", () => {
  it("3×3·2×2·CFOP·4×4 과정 끝에 섞인 큐브를 처음부터 맞추는 마무리가 있다", () => {
    for (const id of [
      "333-beginner",
      "222-beginner",
      "cfop",
      "444-reduction",
    ]) {
      const c = courseById(id);
      const last = c?.lessons.at(-1);
      expect(last?.id).toBe(`${id}-finale`);
      const t = last?.steps.find((s) => s.kind === "try");
      expect(t?.goal).toBe("solved");
      expect(t?.setup && "rule" in t.setup).toBe(true);
    }
  });

  it("먼저 배울 과정이 모두 있는 과정이고, 과정 끝 「다음 과정」은 그 거꾸로다", () => {
    for (const c of COURSES)
      for (const r of c.requires ?? [])
        expect(courseById(r), c.id).toBeDefined();
    const base = courseById("333-beginner");
    expect(base && nextCourses(base).map((c) => c.id)).toEqual([
      "222-from333",
      "cfop",
      "444-reduction",
    ]);
  });

  it("CFOP 단원은 훈련 묶음으로 이어진다", () => {
    expect(CFOP_INTRO.lessons.map((l) => l.drill)).toEqual([
      undefined,
      undefined,
      "f2l",
      "2look-oll",
      "2look-pll",
      "pll",
    ]);
  });
});
