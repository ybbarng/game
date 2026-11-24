// @vitest-environment jsdom

import { STANDARD_RULES as BADUK } from "@game/baduk-engine";
import { STANDARD_RULES as BASEBALL } from "@game/baseball-engine";
import { STANDARD_RULES as CHESS } from "@game/chess-engine";
import { STANDARD_RULES as GALAXY } from "@game/galaxy-engine";
import { STANDARD_RULES as JANGGI } from "@game/janggi-engine";
import { STANDARD_RULES as OMOK } from "@game/omok-engine";
import { STANDARD_RULES as YUT } from "@game/yut-engine";
import { beforeEach, describe, expect, it } from "vitest";

import { badukKit } from "@/baduk/kit";
import { baseballKit } from "@/baseball/kit";
import { chessKit } from "@/chess/kit";
import { galaxyKit } from "@/galaxy/kit";
import { janggiKit } from "@/janggi/kit";
import { omokKit } from "@/omok/kit";
import { resultsOf } from "@/stats/outcome";
import { StatsRecorder } from "@/stats/recorder";
import { loadStats } from "@/stats/records";
import { summarizeYut, type YutRound, yutKit } from "@/yut/kit";

import type { GameKit } from "./kit";
import { LocalMatch } from "./local-match";

beforeEach(() => localStorage.clear());

// 판 게임 일곱의 키트와 기본 규칙. 키트마다 모양이 달라 묶을 때만 느슨한 꼴로 본다.
type AnyKit = GameKit<unknown, unknown, never, unknown, unknown, unknown>;
const GAMES: [string, AnyKit, unknown][] = [
  ["오목", omokKit as unknown as AnyKit, OMOK],
  ["장기", janggiKit as unknown as AnyKit, JANGGI],
  ["체스", chessKit as unknown as AnyKit, CHESS],
  ["바둑", badukKit as unknown as AnyKit, BADUK],
  ["숫자야구", baseballKit as unknown as AnyKit, BASEBALL],
  ["윷놀이", yutKit as unknown as AnyKit, YUT],
  ["은하", galaxyKit as unknown as AnyKit, GALAXY],
];

/** 혼자 하기 대국을 열고 기록기를 붙인 뒤, 설정 메뉴 「그만하기」가 내는 행동을 낸다 */
function quitSolo(kit: AnyKit, rules: unknown) {
  const match = new LocalMatch({
    kit,
    rules,
    seed: 11,
    bot: kit.botFor?.(0) as never,
  });
  const recorder = new StatsRecorder(kit.stats, {
    game: kit.id,
    mode: "solo",
    key: "solo:11",
  });
  for (const s of match.drain()) recorder.observe(s);
  match.subscribe((s) => recorder.observe(s));
  const result = match.submit(kit.quitAction ?? kit.retireAction);
  return { match, result };
}

describe("혼자 하기 그만하기(판 게임 일곱)", () => {
  for (const [name, kit, rules] of GAMES) {
    it(`${name}: 게임이 끝나고 「그만둔 게임」으로 남으며 승패로 세지 않는다`, () => {
      const { match, result } = quitSolo(kit, rules);
      expect(result).toEqual({ ok: true });
      expect(kit.isOver(match.current())).toBe(true);
      const { rounds, games } = loadStats();
      expect(games).toHaveLength(1);
      expect(games[0]?.data).toMatchObject({ retired: true, won: false });
      expect(resultsOf(kit.stats.result, { rounds, games })).toEqual([]);
    });
  }

  it("윷놀이: 예전에 비김으로 남은 그만둔 판도 판·승패로 세지 않는다", () => {
    const old: YutRound = {
      players: 2,
      mode: "solo",
      outcome: "draw",
      by: "retired",
      throws: 3,
      yuts: 0,
      mos: 0,
      captures: 0,
      captured: 0,
      finished: 0,
    };
    const rounds = [
      { id: "solo:3:1", game: "yut", at: 1, mode: "solo" as const, data: old },
    ];
    expect(summarizeYut(rounds)).toMatchObject({ rounds: 0, draws: 0 });
    expect(resultsOf(yutKit.stats.result, { rounds, games: [] })).toEqual([]);
  });
});
