import type { Scramble, ScrambleEvent } from "@game/cube-scramble";

import {
  type CubeJob,
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
 * - 워커 하나를 만들어 계속 쓴다(표는 워커 안에 한 번만 만든다). 일은 보낸 차례로 한다.
 * - 워커를 만들 수 없거나 죽으면 그 뒤로는 화면 스레드에서 한다(느리지만 결과는 같다).
 * - 같은 씨앗이면 같은 섞기가 나온다. 다만 해법기가 바뀌면 달라질 수 있으니 기록에는 섞기 글도 함께 남긴다.
 */

interface Pending {
  job: CubeJob;
  resolve: (r: Scramble | string) => void;
  reject: (e: unknown) => void;
}

let worker: Worker | null = null;
let broken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

/** 번들러가 알아보는 모양 그대로 둔다(`new Worker(new URL(…, import.meta.url))`) */
function spawn(): Worker {
  return new Worker(new URL("./cube-worker", import.meta.url));
}

function runInline(p: Pending): void {
  runCubeJob(p.job).then(p.resolve, p.reject);
}

function ensureWorker(): Worker | null {
  if (worker || broken) return worker;
  if (typeof Worker === "undefined") {
    broken = true;
    return null;
  }
  try {
    const created = spawn();
    created.onmessage = (event: MessageEvent<CubeJobReply>) => {
      const reply = event.data;
      const p = pending.get(reply.id);
      if (!p) return;
      pending.delete(reply.id);
      if ("error" in reply) p.reject(new Error(reply.error));
      else p.resolve(reply.result);
    };
    created.onerror = (event) => {
      // 워커 파일을 못 불러왔거나 워커가 죽었다: 남은 일은 화면 스레드에서
      event.preventDefault();
      broken = true;
      created.terminate();
      if (worker === created) worker = null;
      for (const [id, p] of [...pending]) {
        pending.delete(id);
        runInline(p);
      }
    };
    worker = created;
  } catch {
    broken = true;
  }
  return worker;
}

function request(job: CubeJob): Promise<Scramble | string> {
  return new Promise((resolve, reject) => {
    const p: Pending = { job, resolve, reject };
    const target = ensureWorker();
    if (!target) {
      runInline(p);
      return;
    }
    const id = nextId++;
    pending.set(id, p);
    try {
      target.postMessage({ id, job } satisfies CubeJobMessage);
    } catch {
      pending.delete(id);
      runInline(p);
    }
  });
}

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

/** 표를 미리 만들어 두게 한다(화면을 열 때 불러 두면 첫 섞기가 빠르다) */
export function warmUpScramble(event: ScrambleEvent): void {
  void scrambleInWorker(event, 1).catch(() => undefined);
}

export type { Scramble, ScrambleEvent };
