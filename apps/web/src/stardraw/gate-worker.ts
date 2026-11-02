/// <reference lib="webworker" />
import { solveGate } from "@game/stardraw-core";

/**
 * 응모 앞단 작업 증명을 화면 밖 스레드에서 푼다(docs/36 11-31). 한 번 풀고 답을 돌려준다(부르는 쪽이 워커를 끝낸다)
 */
export interface GateJob {
  head: Uint8Array;
  pub: Uint8Array;
  target: number;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<GateJob>) => {
  const { head, pub, target } = event.data;
  try {
    const nonce = await solveGate(head, pub, target);
    scope.postMessage({ nonce });
  } catch (err) {
    scope.postMessage({ error: String(err) });
  }
};
