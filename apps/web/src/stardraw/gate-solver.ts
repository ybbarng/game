import { solveGate } from "@mighty/stardraw-core";

/** 응모 앞단 작업 증명 풀기(docs/36 11-31): 문제 값과 공개 열쇠, 목표값으로 답 n을 찾는다 */
export type GateSolver = (
  head: Uint8Array,
  pub: Uint8Array,
  target: number,
) => Promise<number>;

/** 같은 스레드에서 푼다(시험, 워커를 못 쓰는 브라우저). 한 번 계산마다 쉬어 가서 화면이 멈추지 않는다 */
export const inlineGateSolver: GateSolver = async (head, pub, target) => {
  const n = await solveGate(head, pub, target);
  if (n === null) throw new Error("예측 확인 계산을 끝내지 못했습니다");
  return n;
};

/** 번들러가 알아보는 모양 그대로 둔다(`new Worker(new URL(…, import.meta.url))`) */
function spawnGateWorker(): Worker {
  return new Worker(new URL("./gate-worker", import.meta.url));
}

/**
 * 웹 워커에서 푼다(화면이 멈추지 않게, 응모권 Argon2와 다른 코어에서). 풀면 워커를 끝낸다.
 * 워커를 만들 수 없거나 워커가 실패하면 같은 스레드에서 푼다
 */
export const workerGateSolver: GateSolver = (head, pub, target) => {
  let worker: Worker;
  try {
    worker = spawnGateWorker();
  } catch {
    return inlineGateSolver(head, pub, target);
  }
  return new Promise<number>((resolve, reject) => {
    const fallback = () => {
      worker.terminate();
      inlineGateSolver(head, pub, target).then(resolve, reject);
    };
    worker.onmessage = (
      event: MessageEvent<{ nonce?: number | null; error?: string }>,
    ) => {
      const { nonce } = event.data;
      if (typeof nonce !== "number") return fallback();
      worker.terminate();
      resolve(nonce);
    };
    worker.onerror = fallback;
    worker.postMessage({ head, pub, target });
  });
};
