import {
  attacked,
  createJanggiScenario,
  pointAt,
  pseudoTargets,
  sideToAct,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { canContinue, exampleState, guessRight } from "./example-play";
import { parseMove, replayBoards, sideAt } from "./replay";
import { JANGGI_LESSONS, type JanggiScene } from "./tutorial";

/** 단원들의 직접 두는 예시(넘겨 보기였던 것 모두) */
function playScenes(): { name: string; scene: JanggiScene }[] {
  const found: { name: string; scene: JanggiScene }[] = [];
  for (const lesson of JANGGI_LESSONS)
    lesson.steps.forEach((step, i) => {
      if (step.kind === "mission" || !step.scene?.replay) return;
      found.push({ name: `${lesson.id}#${i}`, scene: step.scene });
    });
  return found;
}

describe("직접 두고 맞혀 보기", () => {
  it("맞혀 볼 정답은 그 순간 다음 수가 가는 자리이고, 그 수를 두는 기물이 닿는 자리다", () => {
    for (const { name, scene } of playScenes()) {
      const { guess, replay = [] } = scene;
      if (!guess) continue;
      expect(guess.at, name).toBeLessThanOrEqual(replay.length);
      const boards = replayBoards(
        createJanggiScenario({ pieces: scene.pieces }).board,
        replay,
      );
      const before = boards[guess.at] ?? [];
      const answer = pointAt(guess.answer);
      if (guess.at < replay.length) {
        const m = parseMove(replay[guess.at] as string);
        expect(m.to, name).toBe(answer);
        expect(pseudoTargets(before, m.from), name).toContain(m.to);
      } else {
        // 끝에서 물으면: 마지막 수를 둔 편이 노리는 상대 기물
        const by = sideAt(replay.length - 1, scene.replayBy);
        expect(before[answer]?.[0], name).toBe(by === "c" ? "h" : "c");
        expect(attacked(before, answer, by), name).toBe(true);
      }
      expect(guessRight(guess, pointAt(guess.answer))).toBe(true);
      expect(guess.ask.endsWith("."), name).toBe(true);
      expect(guess.why.endsWith("."), name).toBe(true);
    }
  });

  it("예시 끝 판에서 이어 둘 대국은 엔진 규칙대로 둔 판이고, 둘 차례가 이어진다", () => {
    for (const { name, scene } of playScenes()) {
      if (!canContinue(scene.replayBy)) continue;
      const replay = scene.replay ?? [];
      const state = exampleState({
        pieces: scene.pieces,
        moves: replay,
        ...(scene.setups ? { setups: scene.setups } : {}),
      });
      const boards = replayBoards(
        createJanggiScenario({ pieces: scene.pieces }).board,
        replay,
      );
      expect(state.board, name).toEqual(boards[replay.length]);
      expect(state.phase, name).toBe("play");
      const next = sideAt(replay.length - 1) === "c" ? "h" : "c";
      expect(sideToAct(state), name).toBe(next);
      expect(state.choSeat, name).toBe(0);
    }
  });
});
