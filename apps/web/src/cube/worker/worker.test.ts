import { scramble } from "@game/cube-scramble";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";
import {
  createJobRunner,
  createLanedRunner,
  importAlgsInWorker,
  scrambleInWorker,
  type WorkerLike,
} from "./index";
import type { CubeJob, CubeJobMessage, CubeJobReply } from "./jobs";

describe("큐브 워커 모듈", () => {
  // node에는 Worker가 없어 화면 스레드 대신 처리로 돈다. 표가 필요 없는 5×5로 본다
  it("워커를 못 쓰면 같은 스레드에서 같은 섞기를 낸다", async () => {
    const s = await scrambleInWorker("555", 3);
    expect(s).toEqual(scramble("555", 3));
    expect(s.text.split(" ")).toHaveLength(60);
  });

  it("내 공식 가져오기도 워커를 못 쓰면 같은 스레드에서 한다", async () => {
    const text = JSON.stringify({
      format: "cube-algs",
      version: 1,
      cases: { "oll-27": { mine: ["L U L' U L U2 L'", "R U R'"] } },
    });
    const r = await importAlgsInWorker({}, text);
    expect(r.added).toBe(1);
    expect(r.rejected.map((x) => x.message)).toEqual(["F2L이 깨짐"]);
    await expect(importAlgsInWorker({}, "{")).rejects.toThrow(
      "JSON을 읽지 못함",
    );
  });
});

/** 받은 일을 쌓아 두기만 하는 가짜 워커. `reply`로 답을 보낸다 */
class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<CubeJobReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: CubeJobMessage[] = [];
  terminated = false;
  postMessage(message: CubeJobMessage): void {
    this.sent.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(id: number, result: string): void {
    this.onmessage?.({ data: { id, result } } as MessageEvent<CubeJobReply>);
  }
}

function setup(limits?: Record<CubeJob["kind"], number>) {
  const clock = new ManualClock();
  const workers: FakeWorker[] = [];
  const inline: CubeJob[] = [];
  const runner = createJobRunner({
    clock,
    spawn: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    runInline: async (job) => {
      inline.push(job);
      return "화면 스레드";
    },
    ...(limits ? { limits } : {}),
  });
  return { clock, workers, inline, runner };
}

const SOLVE: CubeJob = { kind: "solve", facelets: "x" };

describe("워커 시간 상한", () => {
  it("답 없이 상한을 넘기면 워커를 끝내고 화면 스레드에서 하며, 다음 일은 새 워커가 받는다", async () => {
    const { clock, workers, inline, runner } = setup();
    const answer = runner.request(SOLVE);
    expect(workers).toHaveLength(1);
    clock.advance(19_999);
    expect(inline).toEqual([]);
    clock.advance(1);
    expect(workers[0]?.terminated).toBe(true);
    await expect(answer).resolves.toBe("화면 스레드");
    expect(inline).toEqual([SOLVE]);

    const next = runner.request(SOLVE);
    expect(workers).toHaveLength(2);
    const w = workers[1] as FakeWorker;
    w.reply(w.sent[0]?.id as number, "워커");
    await expect(next).resolves.toBe("워커");
  });

  it("상한 안에 답하면 상한이 지나도 아무 일 없다", async () => {
    const { clock, workers, inline, runner } = setup();
    const answer = runner.request(SOLVE);
    const w = workers[0] as FakeWorker;
    w.reply(w.sent[0]?.id as number, "워커");
    await expect(answer).resolves.toBe("워커");
    clock.advance(60_000);
    expect(w.terminated).toBe(false);
    expect(inline).toEqual([]);
  });

  it("상한이 무한이면(화면 시험) 시계를 크게 건너뛰어도 워커를 버리지 않는다", () => {
    const inf = Number.POSITIVE_INFINITY;
    const { clock, workers, inline, runner } = setup({
      scramble: inf,
      solve: inf,
      plan: inf,
      "algs-import": inf,
      hero: inf,
      cross: inf,
    });
    void runner.request(SOLVE);
    clock.advance(600_000);
    expect(workers[0]?.terminated).toBe(false);
    expect(inline).toEqual([]);
  });

  it("섞기는 10초 안에 답이 없으면 화면 스레드에서 한다", async () => {
    const { clock, workers, inline, runner } = setup();
    const job: CubeJob = { kind: "scramble", event: "333", seed: 1 };
    const s = runner.request(job);
    clock.advance(9_999);
    expect(inline).toEqual([]);
    clock.advance(1);
    expect(workers[0]?.terminated).toBe(true);
    await expect(s).resolves.toBe("화면 스레드");
  });

  it("계획은 30초까지 기다린다", () => {
    const { clock, workers, runner } = setup();
    void runner.request({
      kind: "plan",
      level: "beginner",
      size: 3,
      perm: [],
      twist: [],
      seed: 1,
    } as CubeJob);
    clock.advance(20_000);
    expect(workers[0]?.terminated).toBe(false);
    clock.advance(10_000);
    expect(workers[0]?.terminated).toBe(true);
  });
});

describe("섞기 줄", () => {
  it("섞기는 다른 일과 다른 워커가 받아, 답 없는 연출 풀이 뒤에서 기다리지 않는다", async () => {
    const clock = new ManualClock();
    const workers: FakeWorker[] = [];
    const runner = createLanedRunner({
      clock,
      spawn: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
      runInline: async () => "화면 스레드",
    });
    void runner.request({ kind: "hero", method: "x", perm: [], twist: [] });
    const s = runner.request({ kind: "scramble", event: "333", seed: 1 });
    expect(workers).toHaveLength(2);
    const [main, lane] = workers as [FakeWorker, FakeWorker];
    expect(main.sent.map((m) => m.job.kind)).toEqual(["hero"]);
    expect(lane.sent.map((m) => m.job.kind)).toEqual(["scramble"]);
    lane.reply(lane.sent[0]?.id as number, "섞기");
    await expect(s).resolves.toBe("섞기");
    // 다음 섞기도 같은 섞기 워커가 받는다(표를 다시 만들지 않는다)
    void runner.request({ kind: "scramble", event: "333", seed: 2 });
    expect(workers).toHaveLength(2);
    expect(lane.sent).toHaveLength(2);
  });
});
