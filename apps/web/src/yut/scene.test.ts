import { createRng } from "@game/mighty-engine";
import { yutBotFor } from "@game/yut-ai";
import {
  createMatch,
  type GameEvent,
  pendingSeats,
  STANDARD_RULES,
  step,
  TEAM_RULES,
  viewOf,
  type YutRules,
} from "@game/yut-engine";
import { describe, expect, it } from "vitest";

import { sceneOf, type YutScene } from "./scene";

/** 한 걸음 뒤의 화면: 장면, 차례, 그 걸음의 사건 */
interface Frame {
  scene: YutScene;
  turn: number;
  events: GameEvent[];
}

/** 컴퓨터 넷(또는 둘)이 한 판을 끝까지 두며 걸음마다 장면을 남긴다(던진 윷 연출은 없다고 본다) */
const played = new Map<string, Frame[]>();

function frames(rules: YutRules, seed: number): Frame[] {
  const key = `${rules.players}${rules.mode}:${seed}`;
  const known = played.get(key);
  if (known) return known;
  const out = playFrames(rules, seed);
  played.set(key, out);
  return out;
}

function playFrames(rules: YutRules, seed: number): Frame[] {
  let { state } = createMatch(rules, seed);
  const rng = createRng(seed + 1);
  const out: Frame[] = [];
  for (let guard = 0; guard < 20_000; guard++) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined) return out;
    const bot = yutBotFor(1);
    const result = step(state, seat, bot.decide(viewOf(state, seat), rng));
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    out.push({
      scene: sceneOf(state.phase, false),
      turn: state.turn,
      events: result.events,
    });
  }
  throw new Error("판이 끝나지 않는다");
}

describe("장면 고르기", () => {
  it("던질 차례·공개·몸짓 열기는 던지는 장면, 말 옮기기와 판 끝은 말 옮기는 장면", () => {
    expect(sceneOf("commit", false)).toBe("throw");
    expect(sceneOf("throw", false)).toBe("throw");
    expect(sceneOf("reveal", false)).toBe("throw");
    expect(sceneOf("open", false)).toBe("throw");
    expect(sceneOf("move", false)).toBe("move");
    expect(sceneOf("gameOver", false)).toBe("move");
  });

  it("던진 윷이 굴러가는 동안은 결과가 나왔어도 던지는 장면에 머문다", () => {
    expect(sceneOf("move", true)).toBe("throw");
    expect(sceneOf("gameOver", true)).toBe("throw");
  });
});

describe("장면 전환: 한 차례 한 번", () => {
  for (const [name, rules] of [
    ["1:1", STANDARD_RULES],
    ["2:2 편", TEAM_RULES],
  ] as const)
    it(`${name}: 차례마다 던지기 → 말 옮기기로 한 번만 바뀌고, 잡아서 더 던질 때만 되돌아간다`, () => {
      let checkedTurns = 0;
      for (const seed of [3, 11]) {
        let prev: Frame | null = null;
        let switches = 0;
        let captures = 0;
        for (const f of frames(rules, seed)) {
          const captured = f.events.some(
            (e) => e.type === "moved" && e.captured > 0,
          );
          if (prev && f.turn !== prev.turn) {
            checkedTurns++;
            switches = 0;
            captures = 0;
          }
          if (captured) captures++;
          if (prev && f.scene !== prev.scene && f.turn === prev.turn) {
            if (f.scene === "move") switches++;
            // 같은 차례 안에서 던지는 장면으로 돌아가는 것은 상대 말을 잡은 걸음뿐
            else expect(captured, `씨앗 ${seed}`).toBe(true);
          }
          // 말 옮기는 장면으로는 한 번(잡아서 더 던진 만큼 더)
          expect(switches, `씨앗 ${seed}`).toBeLessThanOrEqual(1 + captures);
          prev = f;
        }
      }
      expect(checkedTurns).toBeGreaterThan(20);
    });

  it("윷·모로 이어 던지면 던지는 장면에 그대로 머문다", () => {
    let seen = 0;
    for (const seed of [3, 11]) {
      const all = frames(STANDARD_RULES, seed);
      for (const f of all) {
        const bonus = f.events.some((e) => e.type === "result" && e.bonus);
        if (!bonus) continue;
        seen++;
        expect(f.scene, `씨앗 ${seed}`).toBe("throw");
      }
    }
    // 두 판이면 윷·모가 여러 번 나온다(확인하는 경우가 실제로 있었다)
    expect(seen).toBeGreaterThan(3);
  });
});
