// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import type { KitStats } from "@/game/kit";

import { StatsRecorder } from "./recorder";
import { loadStats } from "./records";

type Event = "start" | "end" | "over";

/** 사건 이름만 보는 작은 기록 정의 */
const SPEC: KitStats<{ round: number }, Event> = {
  roundStarted: (events) => events.includes("start"),
  roundEnded: (events) => events.includes("end"),
  gameEnded: (events) => events.includes("over"),
  roundNumber: (view) => view.round,
  round: () => ({ won: true }),
  game: () => ({ won: true }),
  result: { unit: "round", outcome: () => "win" },
  achievements: [],
};

beforeEach(() => localStorage.clear());

describe("같이 앉은 사람 남기기", () => {
  it("판과 게임이 끝날 때 그때 같이 앉은 사람 이름을 남긴다", () => {
    let people = ["철수"];
    const recorder = new StatsRecorder(SPEC, {
      game: "omok",
      mode: "online",
      key: "online:r1",
      people: () => people,
    });
    recorder.observe({ view: { round: 1 }, events: ["start"] });
    recorder.observe({ view: { round: 1 }, events: ["end"] });
    people = ["철수", "영희"];
    recorder.observe({ view: { round: 2 }, events: ["start"] });
    recorder.observe({ view: { round: 2 }, events: ["end", "over"] });
    const { rounds, games } = loadStats();
    expect(rounds.map((r) => [r.id, r.with])).toEqual([
      ["online:r1:1", ["철수"]],
      ["online:r1:2", ["철수", "영희"]],
    ]);
    expect(games[0]?.with).toEqual(["철수", "영희"]);
  });

  it("혼자 하기처럼 같이 앉은 사람이 없으면 칸을 두지 않는다", () => {
    const recorder = new StatsRecorder(SPEC, {
      game: "omok",
      mode: "solo",
      key: "solo:3",
    });
    recorder.observe({ view: { round: 1 }, events: ["start"] });
    recorder.observe({ view: { round: 1 }, events: ["end"] });
    expect("with" in (loadStats().rounds[0] ?? {})).toBe(false);
  });
});
