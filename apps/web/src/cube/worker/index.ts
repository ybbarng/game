import type { BotLevel, BotPlan } from "@game/cube-ai";
import type { Scramble, ScrambleEvent } from "@game/cube-scramble";
import { type Clock, realClock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import type { AlgBook, ImportResult } from "../algs/store";
import type { CrossRound, CrossRoundRequest } from "../cross/scramble";
import type { HeroSolve } from "../hero/methods";
import {
  type CubeJob,
  type CubeJobAnswer,
  type CubeJobMessage,
  type CubeJobReply,
  runCubeJob,
} from "./jobs";

/**
 * 큐브 섞기·풀이를 웹 워커에서 한다(혼자 맞추기·블라인드·타이머가 함께 쓴다).
 *
 *   const s = await scrambleInWorker("333", seed);   // { event, text, official }
 *   const solution = await solveInWorker(facelets);   // WCA 표기 글
 *
 * - 워커를 만들어 계속 쓴다(표는 워커 안에 한 번만 만든다). 일은 보낸 차례로 한다. 섞기만 따로 워커 하나를 쓴다
 *   (아래 `laneOf`, 다른 일 뒤에서 기다리지 않게).
 * - 워커를 만들 수 없거나 죽으면 그 뒤로는 화면 스레드에서 한다(느리지만 결과는 같다).
 * - 워커가 답 없이 일마다 정한 시간(`JOB_LIMIT_MS`)을 넘기면 그 워커를 끝내고 남은 일은 화면 스레드에서 한다.
 * - 같은 씨앗이면 같은 섞기가 나온다. 다만 해법기가 바뀌면 달라질 수 있으니 기록에는 섞기 글도 함께 남긴다.
 */

/** 워커에서 쓰는 것만(시험에서 가짜 워커를 넣는다) */
export interface WorkerLike {
  onmessage: ((event: MessageEvent<CubeJobReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: CubeJobMessage): void;
  terminate(): void;
}

/**
 * 일마다 시간 상한(ms). 멈춘 워커를 잡는 안전장치라 넉넉히 둔다: 표를 처음 만드는 섞기·풀이도 몇 초면 끝난다.
 * 넘으면 워커를 끝내고(다음 일은 새 워커가 받는다) 남은 일은 화면 스레드에서 한다.
 */
export const JOB_LIMIT_MS: Record<CubeJob["kind"], number> = {
  // 섞기 줄은 섞기만 받아, 표를 처음 만드는 첫 섞기도 이 맥에서 0.3초 안쪽이다(2026-11-05). 멈춘 워커에 오래
  // 묶이지 않게 짧게 둔다(느린 휴대폰도 넉넉하다)
  scramble: 10_000,
  solve: 20_000,
  plan: 30_000,
  "algs-import": 30_000,
  // 첫 화면 연출 풀이는 5×5 축소법도 1초 안쪽이다(2026-11-05 섞기 20개씩 잼). 연출은 이 상한을 기다리지 않고
  // `heroTiming().workerWait`(2초) 뒤 스스로 화면 스레드에서 푼다. 이 상한은 멈춘 워커를 버리는 데만 쓴다
  hero: 20_000,
  // 십자 표(색마다 수십 ms)와 3×3 해법기 표를 처음 만들 때
  cross: 30_000,
};

export interface JobRunnerOptions {
  /** 워커를 만든다. 못 만들면 null이나 예외(그 뒤로는 화면 스레드에서) */
  spawn: () => WorkerLike | null;
  clock: Clock;
  /** 화면 스레드에서 일 하나 */
  runInline?: (job: CubeJob) => Promise<CubeJobAnswer>;
  limits?: Record<CubeJob["kind"], number>;
}

interface Pending {
  job: CubeJob;
  resolve: (r: CubeJobAnswer) => void;
  reject: (e: unknown) => void;
  /** 시간 상한 끄기 */
  stopLimit: () => void;
}

/** 워커 하나로 일을 차례로 한다. 모듈의 함수들이 쓰고, 시험은 가짜 워커·시계를 넣어 만든다 */
export function createJobRunner(opts: JobRunnerOptions): {
  request: (job: CubeJob) => Promise<CubeJobAnswer>;
} {
  const runInlineJob = opts.runInline ?? runCubeJob;
  const limits = opts.limits ?? JOB_LIMIT_MS;
  let worker: WorkerLike | null = null;
  let broken = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const runInline = (p: Pending): void => {
    p.stopLimit();
    runInlineJob(p.job).then(p.resolve, p.reject);
  };

  /** 이 워커를 버리고 남은 일을 화면 스레드에서 한다 */
  const abandon = (target: WorkerLike): void => {
    target.terminate();
    if (worker === target) worker = null;
    for (const [id, p] of [...pending]) {
      pending.delete(id);
      runInline(p);
    }
  };

  const ensureWorker = (): WorkerLike | null => {
    if (worker || broken) return worker;
    try {
      const created = opts.spawn();
      if (!created) {
        broken = true;
        return null;
      }
      created.onmessage = (event) => {
        const reply = event.data;
        const p = pending.get(reply.id);
        if (!p) return;
        pending.delete(reply.id);
        p.stopLimit();
        if ("error" in reply) p.reject(new Error(reply.error));
        else p.resolve(reply.result);
      };
      created.onerror = (event) => {
        // 워커 파일을 못 불러왔거나 워커가 죽었다: 그 뒤로는 화면 스레드에서
        event.preventDefault();
        broken = true;
        abandon(created);
      };
      worker = created;
    } catch {
      broken = true;
    }
    return worker;
  };

  const request = (job: CubeJob): Promise<CubeJobAnswer> =>
    new Promise((resolve, reject) => {
      const p: Pending = { job, resolve, reject, stopLimit: () => {} };
      const target = ensureWorker();
      if (!target) {
        runInline(p);
        return;
      }
      const id = nextId++;
      pending.set(id, p);
      // 답 없이 멈춘 워커: 끝내고 남은 일은 화면 스레드에서(다음 일은 새 워커가 받는다).
      // 상한이 무한이면 걸지 않는다(화면 시험, 아래 `noJobLimit`)
      const limit = limits[job.kind];
      if (Number.isFinite(limit))
        p.stopLimit = opts.clock.after(limit, () => {
          if (pending.has(id)) abandon(target);
        });
      try {
        target.postMessage({ id, job });
      } catch {
        pending.delete(id);
        runInline(p);
      }
    });

  return { request };
}

/**
 * 일을 받는 줄. 섞기는 따로 한 줄(워커 하나)을 쓴다: 한 워커는 일을 차례로 하므로, 같은 화면에서 컴퓨터 계획
 * (대결)·풀이·십자 훈련 판이 먼저 들어가 있으면 다음 섞기가 그 뒤에서 기다리고, 그 일이 답 없이 멈추면 상한까지
 * 「섞는 중」에 묶인다. 섞기 줄의 워커는 3×3·2×2 해법기 표만 만든다. 큐브 화면 사이는 페이지를 새로 여는 링크라
 * 워커는 화면마다 새로 생긴다(첫 화면에서 데워 둘 수 없다, 2026-11-05 잼).
 */
export type JobLane = "scramble" | "main";

export function laneOf(kind: CubeJob["kind"]): JobLane {
  return kind === "scramble" ? "scramble" : "main";
}

/** 줄마다 워커 하나(`createJobRunner`)를 두고 일을 그 줄로 보낸다. 워커는 줄에 첫 일이 올 때 만든다 */
export function createLanedRunner(opts: JobRunnerOptions): {
  request: (job: CubeJob) => Promise<CubeJobAnswer>;
} {
  const lanes: Record<JobLane, ReturnType<typeof createJobRunner>> = {
    scramble: createJobRunner(opts),
    main: createJobRunner(opts),
  };
  return { request: (job) => lanes[laneOf(job.kind)].request(job) };
}

/** 번들러가 알아보는 모양 그대로 둔다(`new Worker(new URL(…, import.meta.url))`) */
function spawn(): WorkerLike | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./cube-worker", import.meta.url));
}

/**
 * 화면 시험은 Playwright 가짜 시계를 멈출 때 시각을 크게 건너뛴다(e2e/cube.ts `pauseClock`). 그때 걸려 있던
 * 시간 상한이 터지면 멀쩡한 워커를 버리게 되므로, 시험은 `window.__cubeNoJobLimit`으로 상한을 끈다.
 * 상한은 멈춘 워커를 잡는 안전장치라 시험에서는 시험 시간 상한이 그 일을 한다
 */
function noJobLimit(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as { __cubeNoJobLimit?: boolean }).__cubeNoJobLimit === true
  );
}

const NO_LIMITS = Object.fromEntries(
  Object.keys(JOB_LIMIT_MS).map((k) => [k, Number.POSITIVE_INFINITY]),
) as Record<CubeJob["kind"], number>;

const runner = createLanedRunner({
  spawn,
  clock: realClock,
  ...(noJobLimit() ? { limits: NO_LIMITS } : {}),
});
const request = runner.request;

/** 대회 규칙 섞기(종목·씨앗). 3×3·2×2는 처음 부를 때 표를 만드느라 몇 초 걸릴 수 있다 */
export function scrambleInWorker(
  event: ScrambleEvent,
  seed: number,
): Promise<Scramble> {
  return request({ kind: "scramble", event, seed }) as Promise<Scramble>;
}

/** 3×3 풀이(2단계 해법). `facelets`는 cube-solver의 스티커 글 */
export function solveInWorker(
  facelets: string,
  maxLength?: number,
): Promise<string> {
  return request(
    maxLength === undefined
      ? { kind: "solve", facelets }
      : { kind: "solve", facelets, maxLength },
  ) as Promise<string>;
}

/** 컴퓨터가 맞추는 계획(수와 둘 시각). 해법기 표를 처음 만들 때 1초 넘게 걸릴 수 있다 */
export function planInWorker(
  level: BotLevel,
  size: number,
  state: PuzzleState,
  seed: number,
): Promise<BotPlan> {
  return request({
    kind: "plan",
    level,
    size,
    perm: Array.from(state.perm),
    twist: Array.from(state.twist),
    seed,
  }) as Promise<BotPlan>;
}

/** 첫 화면 연출의 사람 흉내 해법(`hero/methods.ts` 표의 id). 못 풀면 거부된다 */
export function heroSolveInWorker(
  method: string,
  state: PuzzleState,
): Promise<HeroSolve> {
  return request({
    kind: "hero",
    method,
    perm: Array.from(state.perm),
    twist: Array.from(state.twist),
  }) as Promise<HeroSolve>;
}

/**
 * 내 공식 가져오기(파일 글을 검사해 더한다). 공식마다 검사기를 돌려 화면이 멈추지 않게 워커에서 한다.
 * 글을 못 읽으면 Error(화면에 보일 까닭)
 */
export function importAlgsInWorker(
  book: AlgBook,
  text: string,
): Promise<ImportResult> {
  return request({ kind: "algs-import", book, text }) as Promise<ImportResult>;
}

/** 십자 훈련 한 판(어려움에 맞는 섞기와 최적 수·해) */
export function crossRoundInWorker(
  req: CrossRoundRequest,
): Promise<CrossRound> {
  return request({ kind: "cross", request: req }) as Promise<CrossRound>;
}

/** 표를 미리 만들어 두게 한다(화면을 열 때 불러 두면 첫 섞기가 빠르다) */
export function warmUpScramble(event: ScrambleEvent): void {
  void scrambleInWorker(event, 1).catch(() => undefined);
}

export type { Scramble, ScrambleEvent };
