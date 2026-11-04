import { describe, expect, it } from "vitest";

import { KeyInterpreter } from "../input/interpreter";
import { presetKeymap } from "../input/keymaps";
import { StepRun, targetLabel, tutorialSteps } from "./tutorial";
import { TWO_HAND_RULES } from "./two-hand";

const press = (code: string, shiftKey = false) => ({
  code,
  shiftKey,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
});

describe("키 익히기: 배치 규칙 단계", () => {
  it("「두 손」은 대응표의 손가락으로 맞히고, 맞는 키를 치면 넘어간다", () => {
    const km = presetKeymap("twoHand");
    const step = tutorialSteps(km).find((s) => s.id === "rule");
    expect(step?.lines.join(" ")).toContain("csTimer");
    const asks = step?.targets.filter((t) => t.kind === "move" && t.ask) ?? [];
    expect(asks.map((t) => (t.kind === "move" ? t.notation : ""))).toEqual([
      "L'",
      "L",
      "U'",
      "F'",
    ]);
    for (const t of asks)
      if (t.kind === "move")
        expect(t.ask).toBe(
          TWO_HAND_RULES.find((r) => r.move === t.notation)?.finger,
        );
    expect(targetLabel(asks[0] as never)).toBe("L' ?");
    // R(I) → L'(E) → L(D) → U(J) → U'(F) → F'(G)
    const run = new StepRun(3, step as never);
    const it3 = new KeyInterpreter(3, km);
    for (const code of ["KeyI", "KeyE", "KeyD", "KeyJ", "KeyF", "KeyG"]) {
      const r = it3.handle(press(code));
      if (r?.kind === "move") run.feed({ kind: "move", move: r.move });
    }
    expect(run.done).toBe(true);
  });

  it("「표기」는 Shift 규칙을 맞힌다", () => {
    const step = tutorialSteps(presetKeymap("notation")).find(
      (s) => s.id === "rule",
    );
    expect(step?.targets.map(targetLabel)).toEqual(["R", "R' ?", "U' ?"]);
  });
});
