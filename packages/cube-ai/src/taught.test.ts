import {
  applyMoves,
  formatMove,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { toFacelets } from "./facelets";
import {
  BEGINNER3_TAUGHT_STEPS,
  solveBeginner2,
  solveBeginner3,
  solveHuman,
} from "./methods";
import { Solve } from "./solve";
import {
  type CrossCase,
  cornerPlace2Taught,
  cornersTaught,
  crossTaught,
  llCornerTwistTaught,
  nextCrossEdge,
  whiteUp,
} from "./taught";

/**
 * 배우는 방식 흰 십자·첫 층(첫 화면 연출만). 경우마다 레슨과 같은 꼴인지, 늘 끝나는지 본다.
 * 기본 해법과 컴퓨터 계획은 바뀌지 않는다(선택지를 주지 않으면 이 파일의 함수를 부르지 않는다).
 */

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

/**
 * 십자 엣지는 앞면으로만 내리고 올린다(2026-11-05 사용자 「항상 D면으로 내려서 옮겨서 올려」). 수는 F·D·y뿐이고
 * U(맞춘 면)·R·L·B는 없다. 끝은 늘 F로 올리는 수다
 */
const FRONT_ONLY = /^([FDy]['2]? )*F['2]?$/;

const crossDone = (s: Solve) => {
  const r = s.rel();
  return (
    r[4] === "U" &&
    [1, 3, 5, 7].every((i) => r[i] === "U") &&
    r[10] === "R" &&
    r[19] === "F" &&
    r[37] === "L" &&
    r[46] === "B"
  );
};

const fmt = (s: Solve, from: number, to: number) =>
  s.moves
    .slice(from, to)
    .map((m) => formatMove(s.n, m))
    .join(" ");

describe("배우는 방식 흰 십자", () => {
  it("엣지마다 F·D·y로만 넣고, 넣은 것을 지키며 늘 십자가 끝난다", () => {
    const seen = new Set<CrossCase>();
    for (const seed of SEEDS) {
      const s = new Solve(3, toFacelets(3, randomCubeState(3, seed)));
      whiteUp(s);
      for (let k = 0; k < 4; k++) {
        const next = nextCrossEdge(s);
        if (!next) break;
        seen.add(next.kind);
        expect(next.alg, `${seed} ${next.kind}`).toMatch(FRONT_ONLY);
        s.apply(next.alg);
      }
      expect(nextCrossEdge(s)).toBeNull();
      expect(crossDone(s)).toBe(true);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  // 레슨(lessons-333.ts 「흰 십자」)의 시연 상황에서 같은 경우로 보고 같은 수를 낸다(둔 그대로, 합치기 전)
  const LESSON: [CrossCase, string, string][] = [
    ["down-white-down", "F2", "F2"],
    ["down-white-down", "D' F2", "F2 D"],
    ["down-white-down", "y F2", "R2"],
    ["down-white-down", "D2 y F2", "R2 D2"],
    ["middle", "F F2", "F"],
    ["middle", "y F' F2", "R'"],
    ["middle", "F D F' y F2", "R2 F D' F'"],
    ["middle", "y F' D' F y' F2", "F2 R' D R"],
    ["down-white-side", "F D' F' y F", "B R B' D'"],
    ["down-white-side", "y F' D F y' F'", "R F R' D'"],
    ["top-flipped", "F y F' D' F y' F2", "R F R' D' F2"],
    ["top-wrong", "F2 D y F2", "R2 D' F2 D R2"],
  ];
  for (const [kind, alg, setup] of LESSON) {
    it(`레슨 상황 ${setup} → ${kind} ${alg}`, () => {
      const start = new Solve(3, SOLVED).apply(setup);
      const next = nextCrossEdge(start);
      expect(next?.kind).toBe(kind);
      expect(next?.alg).toMatch(FRONT_ONLY);
      expect(next?.alg).toBe(alg);
    });
  }
});

describe("배우는 방식 첫 층 꼭짓점", () => {
  it("넣을 때마다 y로 칸을 UFR에 두고 D로 밑에 데려와 R' D' R D를 되풀이한다(빼기는 한 번)", () => {
    const insert = /^(y['2]? )?(D['2]? )?R' D' R D( R' D' R D)*$/;
    for (const seed of SEEDS) {
      const s = new Solve(3, toFacelets(3, randomCubeState(3, seed)));
      whiteUp(s);
      crossTaught(s);
      const from = s.moves.length;
      const looksBefore = s.lookList.length;
      cornersTaught(s);
      const cuts = [...s.lookList.slice(looksBefore), s.moves.length];
      expect(cuts[0]).toBe(from);
      for (let i = 0; i + 1 < cuts.length; i++) {
        const seg = fmt(s, cuts[i] as number, cuts[i + 1] as number);
        expect(seg, `${seed}: ${seg}`).toMatch(insert);
      }
      // 흰 면이 위에서 첫 층이 다 맞고 십자도 그대로
      const r = s.rel();
      expect(crossDone(s)).toBe(true);
      for (const i of [0, 2, 6, 8]) expect(r[i]).toBe("U");
    }
  });
});

describe("흰 십자는 앞면으로만 올린다", () => {
  it("섞기 300개: 십자 단계 수는 F·D·y뿐이고(4×4·5×5 축소법의 3×3 단계도 같은 함수) 십자가 끝난다", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = new Solve(3, toFacelets(3, randomCubeState(3, seed)));
      whiteUp(s);
      const from = s.moves.length;
      crossTaught(s);
      const seg = fmt(s, from, s.moves.length);
      if (seg) expect(seg, `${seed}`).toMatch(FRONT_ONLY);
      expect(crossDone(s), `${seed}`).toBe(true);
    }
  });
});

const FRONT_RIGHT_EDGE = 8;
const edgeOk = (s: Solve, i: number) => {
  const c = s.cubie();
  return c.ep[i] === i && c.eo[i] === 0;
};
const MIDDLE_FORM =
  /^(y['2]? )?(U['2]? )?(U R U' R' U' F' U F|U' F' U F U R U' R')$/;

describe("코너·둘째 층은 늘 앞-오른쪽 칸에서 넣는다(2026-11-05 사용자 「코너는 F와 R면 사이에서」「2층도 마찬가지」)", () => {
  it("섞기 300개: 코너 공식 뒤 앞-오른쪽 위 칸이, 둘째 층 공식 뒤 앞-오른쪽 칸이 맞고(빼내기 빼고), 왼쪽 공식이 없다", () => {
    let fromRight = 0;
    let fromFront = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = runTaught3(seed);
      expect(s.isSolved(), `${seed}`).toBe(true);
      const replay = new Solve(3, toFacelets(3, randomCubeState(3, seed)));
      for (const name of ["corners", "middle"] as const) {
        const st = s.stageList.find((x) => x.name === name);
        if (!st) throw new Error(name);
        replay.apply(fmt(s, replay.moves.length, st.start));
        const cuts = [
          st.start,
          ...s.lookList.filter((l) => l > st.start && l < st.end),
          st.end,
        ];
        for (let i = 0; i + 1 < cuts.length; i++) {
          let seg = fmt(s, cuts[i] as number, cuts[i + 1] as number);
          // 코너 단계 끝의 뒤집기(z2)는 공식이 아니다
          if (name === "corners") seg = seg.replace(/ ?z2$/, "");
          if (!seg) continue;
          expect(seg, `${seed} ${name}`).not.toMatch(/L/);
          if (name === "middle") {
            expect(seg, `${seed} middle`).toMatch(MIDDLE_FORM);
            const topHas = [0, 1, 2, 3].some(
              (j) => (replay.cubie().ep[j] as number) >= 8,
            );
            if (seg.endsWith("U R U' R'")) fromRight++;
            else fromFront++;
            replay.apply(seg);
            if (topHas)
              expect(edgeOk(replay, FRONT_RIGHT_EDGE), `${seed} ${seg}`).toBe(
                true,
              );
          } else {
            replay.apply(seg);
            const c = replay.cubie();
            // 넣은 토막 뒤에는 앞-오른쪽 위 칸이 맞는다. 아니면 위에 박힌 것을 그 칸에서 한 번 빼낸 토막이다
            const placed = c.cp[0] === 0 && c.co[0] === 0;
            if (!placed)
              expect(seg, `${seed} ${seg}`).toMatch(/^(y['2]? )?R' D' R D$/);
          }
        }
        replay.apply(fmt(s, replay.moves.length, st.end));
      }
    }
    expect(fromRight).toBeGreaterThan(0);
    expect(fromFront).toBeGreaterThan(0);
  });
});

describe("taught 선택지", () => {
  it("3×3 초보자: 흰 면 위 십자 → 첫 층 → z2 뒤 둘째 층부터 그대로, 다 맞춘다", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const start = randomCubeState(3, seed);
      const solve = solveBeginner3(start, { taught: true });
      const end = applyMoves(3, start, parseMoves(3, solve.moves.join(" ")));
      expect(isSolved(3, end)).toBe(true);
      const corners = solve.stages.find((st) => st.name === "corners");
      expect(solve.moves[(corners?.end ?? 0) - 1]).toBe("z2");
    }
  });

  it("2×2 초보자도 첫 층을 흰 면 위에서 맞추고 다 맞춘다", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const start = randomCubeState(2, seed);
      const solve = solveBeginner2(start, { taught: true });
      const end = applyMoves(2, start, parseMoves(2, solve.moves.join(" ")));
      expect(isSolved(2, end)).toBe(true);
      expect(solve.moves.join(" ")).toContain("R' D' R D");
    }
  });
});

// ---------- 마지막 층(배우기 lessons-333.ts 「노란 십자」~「꼭짓점 방향」과 같은 순서·쥐는 법·횟수) ----------

const EO = "F R U R' U' F'";
const EDGE_SWAP = "R U R' U R U2 R' U";
const CYCLE = "U R U' L' U R' U' L";
const TWIST = "R' D' R D";

/** 단계 하나를 살피는 멈춤 자리로 자른 조각들(둔 수 그대로, 합치기 전) */
function segments(s: Solve, name: string): string[] {
  const st = s.stageList.find((x) => x.name === name);
  if (!st) throw new Error(`단계 없음: ${name}`);
  const cuts = [
    st.start,
    ...s.lookList.filter((l) => l > st.start && l < st.end),
    st.end,
  ];
  const out: string[] = [];
  for (let i = 0; i + 1 < cuts.length; i++)
    out.push(fmt(s, cuts[i] as number, cuts[i + 1] as number));
  return out;
}

const count = (segs: string[], alg: string) =>
  segs.filter((x) => x.includes(alg)).length;

/** 2×2·3×3 공통: 꼭짓점 방향 조각은 U만 돌려 가져와 R' D' R D 2번 또는 4번, 큐브는 돌려 쥐지 않는다 */
const TWIST_SEG = new RegExp(
  `^((U['2]? )?${TWIST} ${TWIST}( ${TWIST} ${TWIST})?( U['2]?)?|U['2]?|)$`,
);

const runTaught3 = (seed: number) => {
  const s = new Solve(3, toFacelets(3, randomCubeState(3, seed)));
  for (const step of BEGINNER3_TAUGHT_STEPS)
    if (typeof step === "function") step(s);
  return s;
};

describe("배우는 방식 마지막 층(3×3)", () => {
  const FORM: Record<string, RegExp> = {
    eo: new RegExp(`^((U['2]? )?${EO}|)$`),
    "ll-edges": new RegExp(
      `^((U['2]? )?(y['2]? )?${EDGE_SWAP}( U['2]?)?|U['2]?|)$`,
    ),
    "ll-corner-place": new RegExp(`^((y['2]? )?${CYCLE}|)$`),
    "ll-corner-twist": TWIST_SEG,
  };
  const LIMIT: Record<string, [string, number]> = {
    eo: [EO, 3],
    "ll-edges": [EDGE_SWAP, 2],
    "ll-corner-place": [CYCLE, 2],
    "ll-corner-twist": [TWIST, 4],
  };

  it("노란 십자 → 옆면 맞추기 → 꼭짓점 자리 → 꼭짓점 방향, 단계마다 그 공식만 레슨 규칙 횟수 안에서", () => {
    const seen = { eo3: false, edges2: false, place2: false, twist4: false };
    for (let seed = 1; seed <= 60; seed++) {
      const s = runTaught3(seed);
      expect(s.isSolved(), `${seed}`).toBe(true);
      expect(s.stageList.map((x) => x.name)).toEqual([
        "cross",
        "corners",
        "middle",
        "eo",
        "ll-edges",
        "ll-corner-place",
        "ll-corner-twist",
      ]);
      for (const [name, form] of Object.entries(FORM)) {
        const segs = segments(s, name);
        for (const seg of segs) expect(seg, `${seed} ${name}`).toMatch(form);
        // 꼭짓점 방향은 돌아간 꼭짓점(많아야 넷)마다 한 조각
        const [alg, limit] = LIMIT[name] as [string, number];
        expect(count(segs, alg), `${seed} ${name}`).toBeLessThanOrEqual(limit);
      }
      if (count(segments(s, "eo"), EO) === 3) seen.eo3 = true;
      if (count(segments(s, "ll-edges"), EDGE_SWAP) === 2) seen.edges2 = true;
      if (count(segments(s, "ll-corner-place"), CYCLE) === 2)
        seen.place2 = true;
      if (segments(s, "ll-corner-twist").some((x) => x.split(TWIST).length > 4))
        seen.twist4 = true;
    }
    // 여러 경우(점, 마주 본 모서리, 두 번 도는 꼭짓점, 네 번 돌리기)를 지나왔다
    expect(seen).toEqual({
      eo3: true,
      edges2: true,
      place2: true,
      twist4: true,
    });
  });

  it("꼭짓점 방향 도중에는 아래 두 층이 흐트러졌다가 끝나면 돌아온다", () => {
    let messed = false;
    for (let seed = 1; seed <= 12 && !messed; seed++) {
      const s = runTaught3(seed);
      const st = s.stageList.find((x) => x.name === "ll-corner-twist");
      if (!st || st.end - st.start < 8) continue;
      const t = new Solve(3, toFacelets(3, randomCubeState(3, seed)));
      t.apply(fmt(s, 0, st.start + 5));
      if ([...t.rel().slice(27, 36)].some((c) => c !== "D")) messed = true;
    }
    expect(messed).toBe(true);
  });

  it("solveBeginner3 결과의 단계 이름도 같은 차례다", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const solve = solveBeginner3(randomCubeState(3, seed), { taught: true });
      expect(solve.stages.map((x) => x.name).slice(3)).toEqual([
        "eo",
        "ll-edges",
        "ll-corner-place",
        "ll-corner-twist",
      ]);
    }
  });
});

describe("배우는 방식 마지막 층(4×4·5×5 축소법의 3×3 단계)", () => {
  const LL = ["eo", "ll-edges", "ll-corner-place", "ll-corner-twist"];
  it.each([
    [4, [1, 2, 3, 4]],
    [5, [1]],
  ])(
    "%i×%i: 패리티는 옆면 맞추기 전에 고치고, 같은 마지막 층으로 다 맞춘다",
    (n, seeds) => {
      const parities = new Set<string>();
      for (const seed of seeds as number[]) {
        const start = randomCubeState(n as number, seed);
        const solve = solveHuman("beginner", n as number, start, undefined, {
          taught: true,
        });
        const end = applyMoves(
          n as number,
          start,
          parseMoves(n as number, solve.moves.join(" ")),
        );
        expect(isSolved(n as number, end), `${seed}`).toBe(true);
        // 3×3 단계의 첫 두 층도 맞춘 면(십자·코너는 U, 둘째 층은 z2 뒤 D)을 돌리지 않는다
        for (const [name, face] of [
          ["cross", "U"],
          ["corners", "U"],
          ["middle", "D"],
        ] as const) {
          const st = solve.stages.find((x) => x.name === name);
          const turns = solve.moves.slice(st?.start, st?.end);
          expect(turns.length, `${seed} ${name}`).toBeGreaterThan(0);
          for (const m of turns)
            expect(m[0], `${seed} ${name} ${m}`).not.toBe(face);
        }
        const names = solve.stages.map((x) => x.name);
        for (const p of names.filter((x) => x.endsWith("parity")))
          parities.add(p);
        expect(
          names.filter((x) => LL.includes(x)),
          `${seed}`,
        ).toEqual(LL);
        // PLL 패리티는 노란 십자 뒤·옆면 맞추기 앞
        const pll = names.indexOf("pll-parity");
        if (pll >= 0) {
          expect(names[pll - 1]).toBe("eo");
          expect(names[pll + 1]).toBe("ll-edges");
        }
      }
      if (n === 4) expect(parities.has("pll-parity")).toBe(true);
    },
  );
});

describe("배우는 방식 마지막 층(2×2)", () => {
  const SOLVED2 = "UUUURRRRFFFFDDDDLLLLBBBB";
  const SUNE = "R U R' U R U2 R'";
  const Y_PERM = "F R U' R' U' R U R' F' R U R' U' R' F R F'";
  const GEN = [SUNE, Y_PERM, CYCLE, "U", "U'"];

  /** 첫 층이 맞은 2×2 윗층 섞기(결정적) */
  function llState(i: number): Solve {
    const s = new Solve(2, SOLVED2);
    let x = i * 7919 + 13;
    for (let k = 0; k < 6; k++) {
      x = (x * 1103515245 + 12345) % 2147483648;
      s.apply(GEN[(x >> 8) % GEN.length] as string);
    }
    return new Solve(2, s.f.join(""));
  }

  const placed = (s: Solve) => {
    const cp = s.cubie().cp;
    return [0, 1, 2, 3].filter((j) => cp[j] === j).length;
  };
  const U4 = ["", "U", "U2", "U'"];

  it("꼭짓점 자리는 제자리가 꼭 하나인 U 자리에서(없으면 0인 자리에서 한 번), 꼭짓점 방향은 2·4번씩", () => {
    let diagonal = false;
    for (let i = 0; i < 80; i++) {
      const start = llState(i);
      const s = start.clone();
      cornerPlace2Taught(s);
      s.stage("ll-corner-place");
      llCornerTwistTaught(s);
      s.stage("ll-corner-twist");
      expect(s.isSolved(), `${i}`).toBe(true);
      const segs = segments(s, "ll-corner-place");
      const replay = start.clone();
      for (const seg of segs) {
        expect(seg, `${i}`).toMatch(
          new RegExp(`^((U['2]? )?(y['2]? )?${CYCLE}|U['2]?|)$`),
        );
        const at = seg.indexOf(CYCLE);
        const pre = at >= 0 ? seg.slice(0, at) : seg;
        const byU = U4.map((u) => placed(replay.clone().apply(u)));
        replay.apply(pre);
        if (at < 0) continue;
        if (byU.includes(1)) {
          // 제자리가 하나인 U 자리에서 그것을 앞-오른쪽 위에 둔다
          expect(placed(replay), `${i}`).toBe(1);
          expect(replay.cubie().cp[0], `${i}`).toBe(0);
        } else {
          // 대각 바꿈: 제자리가 없는 자리에서 한 번
          diagonal = true;
          expect(placed(replay), `${i}`).toBe(0);
        }
        replay.apply(CYCLE);
      }
      expect(count(segs, CYCLE), `${i}`).toBeLessThanOrEqual(3);
      for (const seg of segments(s, "ll-corner-twist"))
        expect(seg, `${i}`).toMatch(TWIST_SEG);
    }
    expect(diagonal).toBe(true);
  });

  it("solveBeginner2 taught: 첫 층 → 꼭짓점 자리 → 꼭짓점 방향", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const solve = solveBeginner2(randomCubeState(2, seed), { taught: true });
      expect(solve.stages.map((x) => x.name)).toEqual([
        "first-layer",
        "ll-corner-place",
        "ll-corner-twist",
      ]);
    }
  });
});
