import { applyMoves, parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { ALG_SETS, type AlgCase } from "../learn";
import { goalMet } from "../learn/judge";
import { caseById, caseStart, checkAlg, fitsStart, setOf } from "./check";
import { mirrorAlg } from "./transform";

const byId = (id: string): AlgCase => {
  const c = caseById(id);
  if (!c) throw new Error(`없는 상황 ${id}`);
  return c;
};

const ALL = ALG_SETS.flatMap((s) => s.cases);

describe("역할 확인: 자료 공식", () => {
  it.each(ALG_SETS.map((s) => ({ set: s.set, cases: s.cases })))(
    "$set: 대표·대안 공식이 모두 자기 상황에서 맞다",
    ({ cases }) => {
      for (const c of cases)
        for (const alg of c.algs) {
          const r = checkAlg(c, alg);
          expect(r.ok, `${c.name}: ${alg} → ${r.message}`).toBe(true);
        }
    },
  );

  it("OLL·PLL·F2L 대표 공식에서 마지막 수를 빼면 통과하지 못한다", () => {
    for (const c of ALL.filter((x) => ["oll", "pll", "f2l"].includes(x.set))) {
      const tokens = (c.algs[0] as string).split(" ");
      if (/^[Uxyz]/.test(tokens.at(-1) as string)) continue;
      const r = checkAlg(c, tokens.slice(0, -1).join(" "));
      expect(r.ok, c.name).toBe(false);
    }
  });

  it("상황의 시작 큐브는 아직 목표가 아니다(빈 공식은 통과하지 못한다)", () => {
    for (const c of ALL) {
      expect(checkAlg(c, "x y'").ok, c.name).toBe(false);
    }
  });
});

describe("역할 확인: 까닭", () => {
  it("표기를 못 읽으면 위치를 준다", () => {
    const r = checkAlg(byId("oll-27"), "R U Q R'");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errorAt).toBe(4);
    expect(r.message).toBe("표기 오류: Q(5번째 글자)");
    expect(checkAlg(byId("oll-27"), "  ").message).toBe("공식이 비어 있음");
  });

  it("맞으면 이름과 수 수를 준다(HTM·STM)", () => {
    const r = checkAlg(byId("pll-ua"), "M2 U M U2 M' U M2");
    expect(r).toMatchObject({ ok: true, preAuf: "", htm: 11, stm: 7 });
    expect(r.message).toBe("Ua 퍼뮤 맞음");
  });

  it("앞 윗면 돌리기가 필요하면 붙여 저장한다", () => {
    const c = byId("oll-27");
    // 수네를 뒤에서 본 공식: y2로 쥐고 한 것과 같다
    const r = checkAlg(c, "L U L' U L U2 L'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preAuf).not.toBe("");
    expect(r.text.startsWith(r.preAuf)).toBe(true);
    expect(checkAlg(c, r.text)).toMatchObject({ ok: true, preAuf: "" });
  });

  it("OLL: 한 수 빠지면 F2L이 깨지고, F2L을 지키면 윗면이 다 노랑이 아님", () => {
    const c = byId("oll-27");
    expect(checkAlg(c, "R U R' U R U2").message).toBe("F2L이 깨짐");
    expect(checkAlg(c, "R U R' U R U2 R' R U R' U R U2 R'").message).toBe(
      "윗면이 다 노랑이 아님",
    );
  });

  it("다른 상황을 푸는 공식이면 그 상황을 알려 준다(수네 자리에 안티수네)", () => {
    const r = checkAlg(byId("oll-27"), "R U2 R' U' R U' R'");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toBe("윗면이 다 노랑이 아님");
    expect(r.other?.id).toBe("oll-26");
  });

  it("PLL: 남은 조각 수를 말한다", () => {
    const c = byId("pll-t");
    // Ua 퍼뮤는 엣지 셋만 돈다 → T 상황에서는 F2L·윗면은 그대로, 조각이 남는다
    const r = checkAlg(c, "R U' R U R U R U' R' U' R2");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^(코너|엣지) .+ 남음$/);
    expect(checkAlg(c, "R U R' U' R' F R2 U' R' U' R U R'").message).toBe(
      "F2L이 깨짐",
    );
    // Ja 자리에 Jb는 아니지만, 자료의 쌍으로 알아본다
    const jb = checkAlg(byId("pll-ja"), byId("pll-jb").algs[0] as string);
    expect(jb.ok).toBe(false);
    if (!jb.ok) expect(jb.other?.id).toBe("pll-jb");
  });

  it("F2L: 십자·다른 칸·짝을 나눠 말한다", () => {
    const c = byId("f2l-1");
    expect(checkAlg(c, "U").message).toBe("짝이 안 들어감");
    expect(checkAlg(c, "U R U' R' F2").message).toBe("십자가 깨짐");
    expect(checkAlg(c, "U R U' R' L U L'").message).toBe("다른 칸이 깨짐");
  });

  it("단원 상황에 그대로 해 봐서 목표가 되는지(앞 윗면 돌리기가 어긋나면 아니다)", () => {
    const sune = byId("oll-27");
    const start = caseStart(sune);
    const main = sune.algs[0] as string;
    expect(fitsStart(3, start, main, "oll")).toBe(true);
    expect(fitsStart(3, start, `U ${main}`, "oll")).toBe(false);
    expect(fitsStart(3, start, "R Q", "oll")).toBe(false);
  });

  it("F2L 좌우 거울은 FL 칸을 푼다: 어느 상황의 어느 칸인지 알려 준다", () => {
    // 상황 1의 거울(U' L' U L)은 상황 2를 FL 칸에서 푼다
    const r = checkAlg(byId("f2l-1"), mirrorAlg(3, "U R U' R'", "M"));
    expect(r).toMatchObject({
      ok: false,
      message: "다른 칸이 깨짐",
      other: { id: "f2l-2", slot: "FL" },
    });
    // 같은 상황을 다른 칸에서 풀어도 알려 준다(상황 2 자리에 상황 2의 FL판)
    const r2 = checkAlg(byId("f2l-2"), "U' L' U L");
    expect(r2.ok || r2.other).toMatchObject({ id: "f2l-2", slot: "FL" });
    // FR 칸의 다른 상황을 풀면 칸은 붙이지 않는다
    const r3 = checkAlg(byId("f2l-2"), "U R U' R'");
    expect(r3.ok || r3.other).toEqual({
      id: "f2l-1",
      name: "F2L 1 바로 넣기 1",
    });
  });

  it("큐브 돌리기·넓게·가운데 층이 섞여도 방향과 상관없이 판정한다", () => {
    // 수네를 x2 쥐고 뒤집어 한 공식, 와이드로 쓴 OLL
    expect(checkAlg(byId("oll-27"), "y R U R' U R U2 R' y'").ok).toBe(true);
    expect(checkAlg(byId("oll-27"), "z2 L D L' D L D2 L' z2").ok).toBe(true);
    expect(checkAlg(byId("pll-ua"), "y M2 U M U2 M' U M2 y'").ok).toBe(true);
  });

  it("4×4 패리티: OLL은 뒤집힘이 짝수면, PLL은 3×3처럼 풀 수 있으면 맞음", () => {
    const oll = byId("parity-4x4-oll");
    expect(checkAlg(oll, "R U R'").message).toBe("아래 두 층이 깨짐");
    const pll = byId("parity-4x4-pll");
    expect(checkAlg(pll, "U").message).toBe("엣지 둘이 바뀌어 있음");
  });

  it("5×5 엣지: 묶이지 않은 줄 수", () => {
    expect(checkAlg(byId("edges-5x5-flip"), "U").message).toBe(
      "묶이지 않은 엣지 1줄",
    );
  });
});

describe("상황 시작", () => {
  it("마지막 층 묶음은 흰 면을 아래로 쥐고 만든다", () => {
    const c = byId("oll-27");
    const n = setOf(c).size;
    const s = applyMoves(n, caseStart(c), parseMoves(n, c.algs[0] as string));
    expect(goalMet(n, s, "solved")).toBe(true);
    expect(goalMet(n, caseStart(c), "f2l")).toBe(true);
  });
});
