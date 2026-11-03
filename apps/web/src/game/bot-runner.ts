import type { RngState } from "@game/mighty-engine";

import {
  type BotJob,
  type BotKey,
  type BotReply,
  loadBot,
} from "./bot-registry";

/**
 * 컴퓨터 한 수를 다른 곳(웹 워커)에서 센다. 받은 난수 상태는 바꾸지 않고, 고른 행동과 그 뒤의 난수 상태를
 * 돌려준다. 부르는 쪽(LocalMatch)이 그 난수를 이어 써서, 같은 스레드에서 `decide`를 부를 때와 같은 기록이 된다.
 * `signal`이 끊기면(무르기·새 판·떠나기) 계산을 버린다
 */
export type BotRunner<View, ActionT> = (
  view: View,
  rng: RngState,
  signal?: AbortSignal,
) => Promise<{ action: ActionT; rng: RngState }>;

interface Job {
  key: BotKey;
  view: unknown;
  seed: number;
  resolve: (result: { action: unknown; rng: RngState }) => void;
  reject: (err: unknown) => void;
}

/** 워커 하나를 함께 쓴다. 워커는 받은 차례로 한 수씩 센다 */
let worker: Worker | null = null;
/** 워커를 만들 수 없거나 워커가 죽었다. 그 뒤로는 화면 스레드에서 센다 */
let broken = false;
let nextId = 1;
/** 워커에 보내 답을 기다리는 일 */
const jobs = new Map<number, Job>();

/** 번들러가 알아보는 모양 그대로 둔다(`new Worker(new URL(…, import.meta.url))`) */
function spawnBotWorker(): Worker {
  return new Worker(new URL("./bot-worker", import.meta.url));
}

function ensureWorker(): Worker | null {
  if (worker || broken) return worker;
  try {
    const created = spawnBotWorker();
    created.onmessage = (event: MessageEvent<BotReply>) => {
      const reply = event.data;
      const job = jobs.get(reply.id);
      if (!job) return;
      jobs.delete(reply.id);
      if ("error" in reply) job.reject(new Error(reply.error));
      else job.resolve({ action: reply.action, rng: { seed: reply.seed } });
    };
    created.onerror = (event) => {
      // 워커 파일을 못 불러왔거나 워커가 죽었다: 남은 일은 화면 스레드에서 센다.
      event.preventDefault();
      broken = true;
      created.terminate();
      if (worker === created) worker = null;
      for (const [id, job] of [...jobs]) {
        jobs.delete(id);
        runInline(job);
      }
    };
    worker = created;
  } catch {
    broken = true;
  }
  return worker;
}

/** 같은 스레드에서 센다(워커를 못 쓸 때) */
function runInline(job: Job): void {
  loadBot(job.key).then((bot) => {
    const rng = { seed: job.seed };
    const action = bot.decide(job.view, rng);
    job.resolve({ action, rng });
  }, job.reject);
}

function post(id: number, job: Job): void {
  const target = ensureWorker();
  if (!target) {
    jobs.delete(id);
    runInline(job);
    return;
  }
  try {
    target.postMessage({
      id,
      key: job.key,
      view: job.view,
      seed: job.seed,
    } satisfies BotJob);
  } catch {
    // 화면을 넘길 수 없는 모양이면(복사할 수 없는 값) 여기서 센다.
    jobs.delete(id);
    runInline(job);
  }
}

/** 계산을 버린다. 워커가 그 일을 세는 중일 수 있으니 워커를 끝내고, 남은 일은 새 워커에 다시 보낸다 */
function cancel(id: number): void {
  if (!jobs.has(id)) return;
  jobs.delete(id);
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const [rest, job] of jobs) post(rest, job);
}

function abortError(): Error {
  const err = new Error("컴퓨터 계산을 버렸다");
  err.name = "AbortError";
  return err;
}

/** 이 열쇠의 봇으로 한 수를 센다. 워커가 있으면 워커에서, 없으면 같은 스레드에서(늘 비동기) */
export function thinkWith<ActionT>(
  key: BotKey,
  view: unknown,
  rng: RngState,
  signal?: AbortSignal,
): Promise<{ action: ActionT; rng: RngState }> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const job: Job = {
      key,
      view,
      seed: rng.seed,
      resolve: resolve as Job["resolve"],
      reject,
    };
    jobs.set(id, job);
    signal?.addEventListener(
      "abort",
      () => {
        if (!jobs.has(id)) return;
        cancel(id);
        reject(abortError());
      },
      { once: true },
    );
    post(id, job);
  });
}

/**
 * 이 열쇠의 봇으로 한 수만 고른다(힌트·문제 받는 수). 난수 상태는 쓰고 버린다.
 * `fallback`이 있으면 워커 계산이 실패할 때(새 배포 뒤 열어 둔 탭이 옛 봇 파일에서 404 등) 그 함수로
 * 화면 스레드에서 이어서 센다. 답을 기다리는 화면(문제 받는 수)이 영영 멈추지 않게 한다(LocalMatch와 같은 방식)
 */
export async function adviseWith<ActionT>(
  key: BotKey,
  view: unknown,
  seed: number,
  fallback?: () => ActionT,
): Promise<ActionT> {
  try {
    return (await thinkWith<ActionT>(key, view, { seed })).action;
  } catch (err) {
    if (!fallback || (err instanceof Error && err.name === "AbortError"))
      throw err;
    console.error("컴퓨터 계산 실패, 화면 스레드에서 이어서 센다", err);
    return fallback();
  }
}

/**
 * LocalMatch·HostRoom에 넘길 워커 계산(`runBot`). 워커가 없는 곳(vitest node, 오래된 브라우저)은
 * `undefined`를 돌려줘 지금처럼 같은 스레드에서 바로 센다
 */
export function workerBot<View, ActionT>(
  key: BotKey,
): BotRunner<View, ActionT> | undefined {
  if (typeof Worker === "undefined") return undefined;
  return (view, rng, signal) => thinkWith<ActionT>(key, view, rng, signal);
}

/**
 * LocalMatch·HostRoom 옵션에 펼쳐 넣는 모양(`...workerBotOption(key)`). 워커가 없으면 빈 객체라 같은 스레드에서 센다.
 * 화면은 무엇이든 받고 행동은 받는 게임 것으로 두어(`unknown`·`never`) 어느 게임 옵션에도 맞는다.
 * 화면·행동 모양은 등록부의 봇이 그 게임 것으로 정한다
 */
export function workerBotOption(key: BotKey): {
  runBot?: BotRunner<unknown, never>;
} {
  const runBot = workerBot<unknown, never>(key);
  return runBot ? { runBot } : {};
}
