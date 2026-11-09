import {
  applyMoves,
  invertMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { goalMet } from "../learn/judge";
import { HINT_RULES, HintGate } from "./hint";
import { pickHint } from "./hint-pick";

/** Cubie 「공식 보기」(docs/47 15-15): 공식 고르기와 횟수·시간 제한 */

const at = (n: number, moves: string, from: PuzzleState = solvedCube(n)) =>
  applyMoves(n, from, parseMoves(n, moves));
/** 공식을 거꾸로 해 상황을 만든다 */
const caseOf = (alg: string, from: PuzzleState) =>
  applyMoves(3, from, invertMoves(parseMoves(3, alg)));

/** 힌트대로(쥐는 법 → 공식) 두면 그 단계가 끝나는가 */
function follow(n: number, s: PuzzleState, h: { before: string; alg: string }) {
  return at(n, `${h.before} ${h.alg}`.trim(), s);
}

describe("공식 고르기", () => {
  // 흰 면 아래(z2)로 쥔 맞춘 큐브: CFOP로 맞추는 사람의 F2L 끝 모습
  const held = at(3, "z2");

  it("OLL 1단계: 가로줄 상황이면 그 공식, 공식대로 두면 노란 십자", () => {
    const s = caseOf("F R U R' U' F'", held);
    const a = pickHint(3, s);
    expect(a.kind).toBe("hint");
    if (a.kind !== "hint") return;
    expect(a.hint.stage).toBe("OLL 1단계(노란 십자)");
    expect(a.hint.name).toBe("엣지: 가로줄");
    expect(a.hint.alg).toBe("F R U R' U' F'");
    expect(a.hint.before).toBe("");
    expect(a.hint.lesson).toBe("cfop-2look-oll");
  });

  it("흰 면이 위인 채로 쥐었으면 쥐는 법(돌리기)을 앞에 붙이고, 그대로 두면 다음 단계로 간다", () => {
    // 흰 면 위로 쥔 채 PLL T퍼뮤 상황(윗면 돌리기 U도 하나)
    const t = "R U R' U' R' F R2 U' R' U' R U R' F'";
    const s = at(3, "U z2", caseOf(t, held));
    const a = pickHint(3, s);
    expect(a.kind).toBe("hint");
    if (a.kind !== "hint") return;
    expect(a.hint.stage).toMatch(/^PLL/);
    expect(a.hint.before).toMatch(/^[xz]/);
    const after = follow(3, s, a.hint);
    // 공식 뒤에는 다 맞거나 윗면 돌리기만 남는다
    expect(
      ["", "U", "U2", "U'"].some((u) =>
        isSolved(3, u ? at(3, u, after) : after),
      ),
    ).toBe(true);
  });

  it("F2L 전이면 해법의 다음 단계(십자) 수를 내고, 그대로 두면 십자가 맞는다", () => {
    const s = at(3, "R U F' L2 D B' R2 U2 F");
    const a = pickHint(3, s);
    expect(a.kind).toBe("hint");
    if (a.kind !== "hint") return;
    expect(a.hint.stage).toBe("십자");
    expect(a.hint.lesson).toBe("cfop-cross");
    expect(goalMet(3, follow(3, s, a.hint), "cross")).toBe(true);
  });

  it("윗면 돌리기만 남았으면 그 한 수", () => {
    const a = pickHint(3, at(3, "U'", held));
    expect(a).toEqual({
      kind: "hint",
      hint: { stage: "마무리(윗면 맞추기)", before: "", alg: "U" },
    });
  });

  it("2×2는 다음 단계 수, 4×4 이상은 판정 없음, 맞춘 큐브는 낼 것 없음", () => {
    const a = pickHint(2, at(2, "R U F' R2 U'"));
    expect(a.kind).toBe("hint");
    expect(pickHint(4, at(4, "R U"))).toEqual({ kind: "unsupported" });
    expect(pickHint(7, solvedCube(7))).toEqual({ kind: "unsupported" });
    expect(pickHint(3, solvedCube(3))).toEqual({ kind: "none" });
  });
});

describe("횟수·시간 제한", () => {
  it(`보이면 ${HINT_RULES.showMs}ms 뒤 사라지고, ${HINT_RULES.cooldownMs}ms 동안 다시 못 본다(남은 초를 알린다)`, () => {
    const clock = new ManualClock();
    const gate = new HintGate(clock);
    expect(gate.request()).toEqual({ ok: true, used: 1 });
    expect(gate.showing).toBe(true);
    clock.advance(HINT_RULES.showMs - 1);
    expect(gate.showing).toBe(true);
    clock.advance(1);
    expect(gate.showing).toBe(false);
    clock.advance(10_000 - HINT_RULES.showMs);
    expect(gate.request()).toEqual({
      ok: false,
      reason: "cooldown",
      seconds: 10,
    });
    clock.advance(HINT_RULES.cooldownMs - 10_000);
    expect(gate.request()).toEqual({ ok: true, used: 2 });
  });

  it("수를 두면 바로 숨고, 한 판에 세 번까지, 섞으면 처음으로", () => {
    const clock = new ManualClock();
    let changes = 0;
    const gate = new HintGate(clock, () => changes++);
    for (let i = 1; i <= HINT_RULES.perSolve; i++) {
      expect(gate.request().ok).toBe(true);
      gate.hide();
      expect(gate.showing).toBe(false);
      clock.advance(HINT_RULES.cooldownMs);
    }
    expect(gate.request()).toEqual({ ok: false, reason: "limit" });
    expect(gate.used).toBe(3);
    expect(changes).toBe(6);
    gate.reset();
    expect(gate.used).toBe(0);
    expect(gate.request()).toEqual({ ok: true, used: 1 });
  });
});
