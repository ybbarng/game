// 6×6·7×7로 넓히기(docs/47 16-29): 단원 글이 공식마다 말한 일(무엇이 어디로 가고, 무엇은 그대로인지)과 해 보기 상황을
// 엔진으로 본다. 해 보기는 모범 답의 거꾸로로 만든 상황이라, 상황에서 시작해 모범 답을 치면 목표가 되는지도 함께 본다.
import {
  applyMoves,
  cubeTopology,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { goalMet, stepStart } from "./judge";
import {
  BAR_ALIGN,
  BAR_BUILD,
  BAR_IN_2,
  BAR_IN_3,
  BIG_666_777,
  FOOL_666,
  MID_IN_1,
  MID_IN_2,
  PAIR_INNER,
  PAIR_OUTER,
  RABBIT_BOTH_666,
  RABBIT_INNER,
  RABBIT_OUTER,
} from "./lessons-big67";
import { setupFor } from "./notation";

const FACE = "URFDLB";
type Kind = "corner" | "edge" | "wing" | "center" | "innerCenter";

/** 스티커 자리 하나: 면 글자와 좌표(x 오른쪽, y 위, z 앞) */
interface Spot {
  face: string;
  at: number[];
  kind: Kind;
}

function spots(n: number): Spot[] {
  const topo = cubeTopology(n);
  return topo.stickers.map((s) => ({
    face: FACE[s.face] as string,
    at: s.position.map((v) => Math.round(v * 2) / 2),
    kind: topo.pieces[s.piece]?.kind as Kind,
  }));
}

const play = (n: number, alg: string, from: PuzzleState = solvedCube(n)) =>
  applyMoves(n, from, parseMoves(n, alg));

/** 옮겨 간 스티커: 「어디에서 → 어디로」(맞춘 큐브에서 alg를 친 뒤) */
function moved(n: number, alg: string): { from: Spot; to: Spot }[] {
  const s = play(n, alg);
  const all = spots(n);
  const out: { from: Spot; to: Spot }[] = [];
  s.perm.forEach((src, p) => {
    if (src !== p) out.push({ from: all[src] as Spot, to: all[p] as Spot });
  });
  return out;
}

const key = (s: Spot) => `${s.face}(${s.at.join(",")})`;
const movedCenters = (n: number, alg: string) =>
  moved(n, alg).filter((m) => m.to.kind === "innerCenter");
/** 맞춘 큐브에서 색이 달라진 칸(다른 면에서 온 스티커). 같은 면 안에서만 옮긴 센터 블럭은 세지 않는다 */
const recolored = (n: number, alg: string) =>
  moved(n, alg).filter((m) => m.from.face !== m.to.face);
/** -0을 0으로(좌표 비교) */
const z0 = (v: number) => v + 0;

/** 스티커 자리에 지금 있는 색(맞춘 상태에서 있던 면 글자) */
function colorAt(n: number, state: PuzzleState, face: string, at: number[]) {
  const all = spots(n);
  const p = all.findIndex(
    (s) => s.face === face && s.at.every((v, i) => v === at[i]),
  );
  if (p < 0) throw new Error(`자리 없음 ${face} ${at}`);
  return all[state.perm[p] as number]?.face;
}

describe("센터: 막대 넣기", () => {
  it.each([
    [7, BAR_IN_2, 2],
    [7, BAR_IN_3, 1],
    [6, BAR_IN_2, 1.5],
    [6, BAR_IN_3, 0.5],
  ])(
    "%i×n %s: 앞면 그 층 막대는 윗면 맞은편 층으로, 그 자리의 블럭은 앞면으로 가고 윗면·앞면 밖 센터는 그대로",
    (n, alg, x) => {
      const moves = movedCenters(n, alg);
      // 아랫면·뒷면·오른쪽·왼쪽 면 센터는 그대로
      expect(new Set(moves.map((m) => m.to.face))).toEqual(new Set(["U", "F"]));
      // 앞면에서 윗면으로 간 것은 앞면 x 층 막대 전부, 간 곳은 윗면 -x 층
      const up = moves.filter((m) => m.from.face === "F" && m.to.face === "U");
      expect(up.map((m) => m.from.at[0])).toEqual(up.map(() => x));
      expect(up.map((m) => m.to.at[0])).toEqual(up.map(() => -x));
      expect(up).toHaveLength(n - 2);
      // 윗면에서 앞면으로 내려온 것은 윗면 -x 층 세로 칸
      const down = moves.filter(
        (m) => m.from.face === "U" && m.to.face === "F",
      );
      expect(down.map((m) => [m.from.at[0], m.to.at[0]])).toEqual(
        down.map(() => [-x, x]),
      );
      // 윗면 안에서 옮겨 간 센터 블럭은 세로 칸 그대로 맞은편으로(반 바퀴)
      for (const m of moves.filter(
        (m) => m.from.face === "U" && m.to.face === "U",
      )) {
        expect(z0(m.to.at[0] as number)).toBe(z0(-(m.from.at[0] as number)));
        expect(z0(m.to.at[2] as number)).toBe(z0(-(m.from.at[2] as number)));
      }
    },
  );

  it("넣을 자리가 윗면 3R 층이면: 해 보기 상황은 윗면 3R 층 초록 막대·앞면 3R 층 흰 막대이고, U2 뒤 막대 넣기로 센터가 다 맞는다", () => {
    const start = play(7, setupFor(BAR_ALIGN));
    for (const y of [-2, -1, 0, 1, 2]) {
      expect(colorAt(7, start, "F", [1, y, 3.5])).toBe("U");
    }
    for (const z of [-2, -1, 0, 1, 2]) {
      expect(colorAt(7, start, "U", [1, 3.5, z])).toBe("F");
    }
    // 그대로 막대 넣기만 치면 3L 층의 흰 막대가 앞면으로 내려가 맞지 않는다(문제 풀이)
    expect(goalMet(7, play(7, BAR_IN_3, start), "centers")).toBe(false);
    expect(goalMet(7, play(7, BAR_ALIGN, start), "centers")).toBe(true);
  });

  it("막대 넣기 해 보기 상황: 흰 막대가 앞면 2R 층, 초록 막대가 윗면 2L 층", () => {
    const start = play(7, setupFor(BAR_IN_2));
    for (const v of [-2, -1, 0, 1, 2]) {
      expect(colorAt(7, start, "F", [2, v, 3.5])).toBe("U");
      expect(colorAt(7, start, "U", [-2, 3.5, v])).toBe("F");
    }
  });

  it("4R U2 4R'은 앞면 가운데 세로 칸의 센터 블럭을 앞면으로 되돌린다(가운데 세로 칸에는 막대 넣기가 듣지 않는다)", () => {
    const fromMiddle = movedCenters(7, "4R U2 4R'").filter(
      (m) => m.from.face === "F" && m.from.at[0] === 0,
    );
    expect(fromMiddle.length).toBeGreaterThan(0);
    expect(fromMiddle.map((m) => m.to.face)).toEqual(fromMiddle.map(() => "F"));
    // 2R 층으로 바꾸면 같은 꼴이 막대를 윗면에 남긴다(거꾸로 견줌)
    const from2R = movedCenters(7, BAR_IN_2).filter(
      (m) => m.from.face === "F" && m.from.at[0] === 2,
    );
    expect(from2R.map((m) => m.to.face)).toEqual(from2R.map(() => "U"));
  });
});

describe("센터: 막대 만들기", () => {
  it("안쪽 가로 층과 R·L·B는 윗면·아랫면 센터 블럭을 움직이지 않는다", () => {
    for (const n of [6, 7])
      for (const alg of ["2U", "3U", "3D", "2D", "R", "L", "B"]) {
        const faces = movedCenters(n, alg).map((m) => m.to.face);
        expect(
          faces.filter((f) => f === "U" || f === "D"),
          `${n} ${alg}`,
        ).toEqual([]);
      }
  });

  it("2D 해 보기: 앞면 2D 층 다섯 칸이 빨강, 왼쪽 면 2D 층 센터 블럭 다섯이 초록이고, 2D가 왼쪽 면 → 앞면으로 옮긴다", () => {
    const start = play(7, setupFor(BAR_BUILD));
    for (const v of [-2, -1, 0, 1, 2]) {
      expect(colorAt(7, start, "F", [v, -2, 3.5])).toBe("R");
      expect(colorAt(7, start, "L", [-3.5, -2, v])).toBe("F");
    }
    const lToF = movedCenters(7, BAR_BUILD).filter(
      (m) => m.from.face === "L" && m.to.face === "F",
    );
    expect(lToF).toHaveLength(5);
  });
});

describe("센터: 7×7 가운데 세로 칸 하나씩", () => {
  it.each([
    [MID_IN_1, 1],
    [MID_IN_2, 2],
  ])(
    "%s: 앞면 한가운데 아래쪽 → 윗면 한가운데 앞쪽 → 앞면 한가운데 왼쪽 → 처음 자리, 셋만",
    (alg, d) => {
      const cycle = movedCenters(7, alg).map(
        (m) => `${key(m.from)}→${key(m.to)}`,
      );
      expect(cycle.sort()).toEqual(
        [
          `F(0,${-d},3.5)→U(0,3.5,${d})`,
          `U(0,3.5,${d})→F(${-d},0,3.5)`,
          `F(${-d},0,3.5)→F(0,${-d},3.5)`,
        ].sort(),
      );
    },
  );

  it("해 보기 상황: 앞면 한가운데 아래쪽 칸이 흰색, 윗면 한가운데 앞쪽 칸이 초록", () => {
    const start = play(7, setupFor(MID_IN_1));
    expect(colorAt(7, start, "F", [0, -1, 3.5])).toBe("U");
    expect(colorAt(7, start, "U", [0, 3.5, 1])).toBe("F");
  });

  it("층을 바꾼 하나씩 넣기(2R U 3L' U' 2R' U 3L U' 등)도 6×6·7×7에서 센터 블럭 셋만 돌리고 왼쪽·오른쪽 면은 건드리지 않는다", () => {
    for (const n of [6, 7])
      for (const a of [2, 3])
        for (const b of [2, 3]) {
          const alg = `${a}R U ${b}L' U' ${a}R' U ${b}L U'`;
          const m = moved(n, alg);
          expect(
            m.every((x) => x.to.kind === "innerCenter"),
            alg,
          ).toBe(true);
          expect(m, `${n} ${alg}`).toHaveLength(3);
          expect(m.some((x) => x.to.face === "R" || x.to.face === "L")).toBe(
            false,
          );
        }
  });
});

describe("엣지: 겹", () => {
  it("날개는 제 겹 자리로만 옮겨 간다: 바깥 겹과 안쪽 겹은 다른 궤도다", () => {
    for (const n of [6, 7]) {
      const topo = cubeTopology(n);
      const all = spots(n);
      const orbitAt = (x: number) => {
        const s = all.findIndex(
          (p) =>
            p.face === "U" &&
            p.kind === "wing" &&
            p.at[0] === x &&
            p.at[2] === (n - 1) / 2,
        );
        return topo.pieces[topo.stickers[s]?.piece as number]?.orbit;
      };
      const outer = n === 7 ? 2 : 1.5;
      const inner = n === 7 ? 1 : 0.5;
      expect(orbitAt(outer)).toBe(orbitAt(-outer));
      expect(orbitAt(inner)).toBe(orbitAt(-inner));
      expect(orbitAt(outer)).not.toBe(orbitAt(inner));
    }
  });

  it.each([
    [PAIR_OUTER, 2],
    [PAIR_INNER, 1],
  ])(
    "%s: 상황에서는 앞-오른쪽 줄 그 겹의 짝 날개가 앞-왼쪽 줄의 그 층에 있고, 공식은 센터를 그대로 둔 채 엣지를 다 묶는다",
    (alg, d) => {
      const start = play(7, setupFor(alg));
      /** 앞-오른쪽(right) 또는 앞-왼쪽 줄의 높이 y 날개 색 둘 */
      const wing = (right: boolean, y: number) =>
        [
          colorAt(7, start, right ? "R" : "L", [right ? 3.5 : -3.5, y, 3]),
          colorAt(7, start, "F", [right ? 3 : -3, y, 3.5]),
        ]
          .sort()
          .join("");
      // 앞-오른쪽 줄 그 층 날개의 짝(같은 두 색)이 앞-왼쪽 줄의 같은 층에 있다
      expect(wing(false, -d)).toBe(wing(true, -d));
      // 3D·2D가 옮긴 센터 블럭은 되돌아온다(센터는 그대로)
      expect(
        recolored(7, alg).filter((m) => m.to.kind === "innerCenter"),
      ).toEqual([]);
      expect(goalMet(7, start, "edges-paired")).toBe(false);
      expect(goalMet(7, play(7, alg, start), "edges-paired")).toBe(true);
    },
  );
});

describe("패리티(토끼이빨·바보토끼이빨)", () => {
  /** 색이 달라진 칸이 모두 날개이고, 그 날개들이 위-앞(·위-뒤) 엣지의 어느 x 자리인지 */
  function wingsOnly(n: number, alg: string) {
    const m = recolored(n, alg);
    expect(
      m.every((x) => x.to.kind === "wing"),
      alg,
    ).toBe(true);
    return [
      ...new Set(
        m
          .filter((x) => x.to.face === "U")
          .map((x) => `${(x.to.at[2] ?? 0) > 0 ? "UF" : "UB"}:${x.to.at[0]}`),
      ),
    ].sort();
  }

  it("토끼이빨 공식은 위-앞 엣지에서 그 층의 날개 둘만 맞바꾼다: 2R·2L은 바깥 겹, 3R·3L은 안쪽 겹", () => {
    expect(wingsOnly(7, RABBIT_OUTER)).toEqual(["UF:-2", "UF:2"]);
    expect(wingsOnly(7, RABBIT_INNER)).toEqual(["UF:-1", "UF:1"]);
    expect(wingsOnly(6, RABBIT_OUTER)).toEqual(["UF:-1.5", "UF:1.5"]);
  });

  it("6×6 2-3Rw·2-3Lw 토끼이빨은 위-앞 엣지 하나를 통째로 뒤집고(날개 넷), 2-3Rw는 3Rw R'과 같다", () => {
    expect(wingsOnly(6, RABBIT_BOTH_666)).toEqual([
      "UF:-0.5",
      "UF:-1.5",
      "UF:0.5",
      "UF:1.5",
    ]);
    expect(play(6, "2-3Rw").perm).toEqual(play(6, "3Rw R'").perm);
  });

  it("6×6 바보토끼이빨은 위-앞·위-뒤 엣지를 통째로 맞바꾸고 다른 조각은 그대로, 4×4 공식 그대로면 센터 블럭이 흐트러진다", () => {
    const m = recolored(6, FOOL_666);
    expect(m.every((x) => x.to.kind === "wing")).toBe(true);
    // 위-앞 날개 넷의 앞면 칸은 뒷면 색, 위-뒤 날개 넷의 뒷면 칸은 앞면 색(윗면 칸은 그대로 흰색끼리)
    expect(m.map((x) => `${x.from.face}→${x.to.face}`).sort()).toEqual(
      [...Array(4).fill("B→F"), ...Array(4).fill("F→B")].sort(),
    );
    expect(
      recolored(6, "2R2 U2 2R2 Uw2 2R2 Uw2 U2").filter(
        (x) => x.to.kind === "innerCenter",
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("해 보기 상황에서 모범 답을 치면 목표가 된다", () => {
  const tries = BIG_666_777.lessons.flatMap((lesson) =>
    lesson.steps
      .filter((s) => s.kind === "try")
      .map((step) => ({ lesson, step })),
  );
  it("해 보기는 여덟이고 6×6·7×7 둘 다에 있다", () => {
    expect(tries).toHaveLength(8);
    expect(new Set(tries.map((t) => t.lesson.size))).toEqual(new Set([6, 7]));
  });
  it.each(tries.map((t) => [t.lesson.id, t.step.alg, t] as const))(
    "%s %s",
    (_, alg, { lesson, step }) => {
      const start = stepStart(lesson, step, 1);
      const goal = step.goal;
      if (!goal || !alg) throw new Error("목표·모범 답 없음");
      expect(goalMet(lesson.size, start, goal)).toBe(false);
      expect(goalMet(lesson.size, play(lesson.size, alg, start), goal)).toBe(
        true,
      );
    },
  );
});
