// @vitest-environment node

import {
  type Board,
  createJanggiScenario,
  pointName,
  pseudoTargets,
  SETUPS,
  type Side,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { pairExample } from "./matchup-examples";
import { openingPieces } from "./opening-lessons";
import { parseMove, type ReplayBy, replayBoards, sideAt } from "./replay";
import { JANGGI_LESSONS } from "./tutorial";

/*
 * 찻길을 연다는 글(2026-11-08 사용자 지적): 졸이 같은 세로줄 앞으로 나가면 차 길을 그대로 막는다.
 * 세로줄을 열려면 졸·병이 옆으로 비켜야 한다. 배우기 글 어디서든 이 말이 판과 맞는지 본다.
 */

interface Example {
  name: string;
  start: Board;
  moves: readonly string[];
  notes: readonly string[];
  by?: ReplayBy | undefined;
}

function examples(): Example[] {
  const found: Example[] = [];
  for (const lesson of JANGGI_LESSONS)
    lesson.steps.forEach((step, i) => {
      if (step.kind === "mission") return;
      const scene = step.scene;
      if (!scene?.replay || !scene.notes) return;
      found.push({
        name: `${lesson.id}#${i}`,
        start: createJanggiScenario({ pieces: scene.pieces }).board,
        moves: scene.replay,
        notes: scene.notes,
        by: scene.replayBy,
      });
    });
  for (const han of SETUPS)
    for (const cho of SETUPS) {
      const example = pairExample(han.value, cho.value);
      found.push({
        name: `짝 한 ${han.label} 초 ${cho.label}`,
        start: createJanggiScenario({
          pieces: openingPieces(cho.value, han.value),
        }).board,
        moves: example.moves,
        notes: example.notes,
      });
    }
  return found;
}

/** `side` 편 차마다 갈 수 있는 곳의 수(자리 이름 → 수) */
function rookReach(board: Board, side: Side): Map<string, number> {
  const reach = new Map<string, number>();
  board.forEach((cell, at) => {
    if (cell === `${side}R`)
      reach.set(pointName(at), pseudoTargets(board, at).length);
  });
  return reach;
}

/** 이 수를 둔 글이 찻길(차가 다니는 세로줄)을 연다고 말하나 */
const SAYS_OPENS = /찻길[을이]? ?열|세로줄[을이] 열|차[^.]*나올 길을 열/;

/** 졸·병이 같은 세로줄 앞으로 나가면 찻길이 열린다는 말(틀린 말) */
const FORWARD_OPENS =
  /앞으로 (?:나가|올리|가)면[^.]*(?:차가 나갈|찻길이 열|세로줄이 열|세로줄로 차)/;

/** 단원·짝 예시에 든 모든 글 */
function allTexts(): string[] {
  const texts: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object")
      Object.values(value).forEach(walk);
  };
  walk(JANGGI_LESSONS);
  for (const han of SETUPS)
    for (const cho of SETUPS) walk(pairExample(han.value, cho.value));
  return texts;
}

describe("찻길을 연다는 글", () => {
  it("그 수는 졸·병을 옆으로 비키는 수이고, 그 편 차가 실제로 더 멀리 갈 수 있게 된다", () => {
    let checked = 0;
    for (const { name, start, moves, notes, by } of examples()) {
      const boards = replayBoards(start, moves);
      notes.forEach((note, i) => {
        // 「~하면 열려요」 같은 가정은 이 수가 아니라 다른 수의 말이라 뺀다.
        const claims = note
          .split(". ")
          .filter((s) => SAYS_OPENS.test(s) && !/면 /.test(s));
        if (claims.length === 0) return;
        const label = `${name} ${i + 1}째 수 ${moves[i]}: ${note}`;
        const before = boards[i] as Board;
        const after = boards[i + 1] as Board;
        const side = sideAt(i, by);
        const m = parseMove(moves[i] as string);
        expect(before[m.from], label).toBe(`${side}P`);
        // 옆걸음: 같은 가로줄(자리 이름의 앞 숫자)
        expect(pointName(m.from)[0], label).toBe(pointName(m.to)[0]);
        const was = rookReach(before, side);
        const now = rookReach(after, side);
        const gained = [...now].some(
          ([at, count]) => count > (was.get(at) ?? 0),
        );
        expect(gained, label).toBe(true);
        checked++;
      });
    }
    // 첫 수·짝 예시·초반 21수에서 찻길을 여는 글이 여럿 있다(정규식이 놓치면 여기서 알린다).
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it("졸·병이 앞으로 나가면 찻길이 열린다고 말하지 않는다", () => {
    const wrong = allTexts().filter((text) => FORWARD_OPENS.test(text));
    expect(wrong).toEqual([]);
    // 이 확인이 실제로 그 말을 잡는지(2026-11-08까지 초반 21수 마지막 수의 글)
    expect(
      FORWARD_OPENS.test(
        "73 졸이 앞으로 나가면 3번 세로줄로 차가 나갈 수 있어요.",
      ),
    ).toBe(true);
  });
});
