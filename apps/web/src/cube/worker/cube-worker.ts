/// <reference lib="webworker" />
import { type CubeJobMessage, type CubeJobReply, runCubeJob } from "./jobs";

/** 큐브 섞기·풀이 워커(`index.ts`가 부른다). 받은 차례대로 하나씩 한다 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<CubeJobMessage>) => {
  const { id, job } = event.data;
  try {
    const result = await runCubeJob(job);
    scope.postMessage({ id, result } satisfies CubeJobReply);
  } catch (err) {
    scope.postMessage({ id, error: String(err) } satisfies CubeJobReply);
  }
};
