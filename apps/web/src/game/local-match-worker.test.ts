// @vitest-environment node
import { heuristicBot } from "@game/mighty-ai";
import {
  type Action,
  type PlayerView,
  presetRules,
  type RngState,
} from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import type { BotRunner } from "./bot-runner";
import { LocalMatch } from "./local-match";

const rules = presetRules("standard5");

interface Job {
  view: PlayerView;
  rng: RngState;
  signal: AbortSignal | undefined;
  answer(): void;
}

/**
 * 손으로 푸는 가짜 워커: 받은 일을 쌓아 두고, 시험이 `answer()`를 부를 때 같은 스레드의 `decide`로 답한다.
 * 실제 시간을 기다리지 않고 답이 오는 순간을 시험이 정한다
 */
function manualRunner() {
  const jobs: Job[] = [];
  const runBot: BotRunner<PlayerView, Action> = (view, rng, signal) =>
    new Promise((resolve) => {
      jobs.push({
        view,
        rng,
        signal,
        answer: () => {
          const copy = { seed: rng.seed };
          const action = heuristicBot.decide(view, copy);
          resolve({ action, rng: copy });
        },
      });
    });
  return { jobs, runBot };
}

/** 답의 `then`이 돌 때까지 마이크로태스크를 넘긴다 */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("LocalMatch 워커 계산(runBot)", () => {
  it("같은 시드면 워커 경로와 같은 스레드 경로가 같은 기록·같은 난수를 남긴다", async () => {
    const direct = new LocalMatch({ rules, seed: 21, humanSeat: 2 });
    const { jobs, runBot } = manualRunner();
    const offThread = new LocalMatch({
      rules,
      seed: 21,
      humanSeat: 2,
      runBot,
    });
    // 아직 아무 컴퓨터도 두지 않았고, 한 자리씩 센다.
    expect(offThread.actionLog()).toHaveLength(0);
    let answered = 0;
    while (jobs.length > 0) {
      expect(jobs).toHaveLength(1);
      expect(offThread.botThinking).toBe(true);
      (jobs.shift() as Job).answer();
      answered++;
      await settle();
    }
    expect(answered).toBeGreaterThan(1);
    expect(offThread.botThinking).toBe(false);
    expect(offThread.actionLog()).toEqual(direct.actionLog());
    expect(offThread.serialize()).toBe(direct.serialize());
    expect(offThread.resumeState().rng).toBe(direct.resumeState().rng);
  });

  it("워커 계산이 실패해도(옛 봇 묶음 404 등) 판이 멈추지 않고 이 스레드로 이어 같은 기록을 남긴다", async () => {
    const direct = new LocalMatch({ rules, seed: 21, humanSeat: 2 });
    const failing: BotRunner<PlayerView, Action> = () =>
      Promise.reject(new Error("봇 묶음을 불러오지 못함"));
    const errors = console.error;
    console.error = () => {};
    try {
      const match = new LocalMatch({
        rules,
        seed: 21,
        humanSeat: 2,
        runBot: failing,
      });
      for (let i = 0; i < 40 && match.botThinking; i++) await settle();
      expect(match.botThinking).toBe(false);
      expect(match.actionLog()).toEqual(direct.actionLog());
      expect(match.resumeState().rng).toBe(direct.resumeState().rng);
    } finally {
      console.error = errors;
    }
  });

  it("세는 동안 대국을 버리면(무르기·새 판·떠나기) 늦게 온 답을 두지 않는다", async () => {
    const { jobs, runBot } = manualRunner();
    const match = new LocalMatch({ rules, seed: 21, humanSeat: 2, runBot });
    const job = jobs.shift() as Job;
    match.dispose();
    expect(job.signal?.aborted).toBe(true);
    const rng = match.resumeState().rng;
    job.answer();
    await settle();
    expect(match.actionLog()).toHaveLength(0);
    expect(match.resumeState().rng).toBe(rng);
    expect(jobs).toHaveLength(0);
    expect(match.botThinking).toBe(false);
  });

  it("세는 동안 판이 끝나면(기권) 답을 버리고 더 세지 않는다", async () => {
    const { jobs, runBot } = manualRunner();
    const match = new LocalMatch({ rules, seed: 21, humanSeat: 2, runBot });
    const job = jobs.shift() as Job;
    expect(match.end()).toEqual({ ok: true });
    expect(job.signal?.aborted).toBe(true);
    const log = match.actionLog();
    job.answer();
    await settle();
    expect(match.actionLog()).toEqual(log);
    expect(log.some((entry) => entry.bot)).toBe(false);
    expect(jobs).toHaveLength(0);
  });

  it("대신 두던 자리에 사람이 돌아오면 그 답을 버린다", async () => {
    const { jobs, runBot } = manualRunner();
    // 다섯 자리 모두 사람(온라인 방)이라 처음에는 컴퓨터가 세지 않는다.
    const match = new LocalMatch({
      rules,
      seed: 21,
      humanSeat: 0,
      humanSeats: [0, 1, 2, 3, 4],
      runBot,
    });
    expect(jobs).toHaveLength(0);
    // 사람 자리를 모두 대신 두게 하고, 첫 답이 오기 전에 그 자리를 사람에게 돌려준다.
    for (const s of [0, 1, 2, 3, 4]) match.setStandIn(s, true);
    expect(jobs).toHaveLength(1);
    const job = jobs.shift() as Job;
    for (const s of [0, 1, 2, 3, 4]) match.setStandIn(s, false);
    job.answer();
    await settle();
    expect(match.actionLog()).toHaveLength(0);
    expect(jobs).toHaveLength(0);
  });
});
