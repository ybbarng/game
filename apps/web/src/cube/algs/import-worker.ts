/// <reference lib="webworker" />
import type { JobReply } from "../worker";
import type { AlgsImportJob } from "./import-in-worker";
import { type ImportResult, importAlgBook } from "./store";

/** 내 공식 가져오기 워커(`import-in-worker.ts`가 부른다). 큐브 워커(worker/cube-worker.ts)와 같은 주고받기 모양 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<{ id: number; job: AlgsImportJob }>) => {
  const { id, job } = event.data;
  try {
    const result = importAlgBook(job.book, job.text);
    scope.postMessage({ id, result } satisfies JobReply<ImportResult>);
  } catch (err) {
    scope.postMessage({
      id,
      error: String(err),
    } satisfies JobReply<ImportResult>);
  }
};
