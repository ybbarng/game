import { realClock } from "@game/fair-play/clock";
import { createJobRunner, noJobLimit, type WorkerLike } from "../worker";
import { type AlgBook, type ImportResult, importAlgBook } from "./store";

/**
 * 내 공식 가져오기(파일 글을 검사해 더한다). 공식마다 검사기를 돌려 화면이 멈추지 않게 워커에서 한다.
 * 큐브 워커(worker/index.ts)와 같은 장치(`createJobRunner`: 워커를 못 쓰거나 상한을 넘기면 화면 스레드에서)를 쓰되
 * 워커 파일은 따로 둔다. 공식 자료(단원 목록)를 불러오는 일이 큐브 워커에 있으면 그 워커를 쓰는 모든 큐브 화면이
 * 공식 자료에 기대는 것으로 보여 화면 시험이 넓어진다(docs/38 17절)
 */
export type AlgsImportJob = {
  kind: "algs-import";
  book: AlgBook;
  text: string;
};

/** 멈춘 워커를 잡는 안전장치(예전 큐브 워커의 `algs-import` 상한과 같다) */
export const ALGS_IMPORT_LIMIT_MS = 30_000;

/** 번들러가 알아보는 모양 그대로 둔다(`new Worker(new URL(…, import.meta.url))`) */
function spawn(): WorkerLike<AlgsImportJob, ImportResult> | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./import-worker", import.meta.url));
}

const runner = createJobRunner<AlgsImportJob, ImportResult>({
  spawn,
  clock: realClock,
  runInline: async (job) => importAlgBook(job.book, job.text),
  limits: {
    "algs-import": noJobLimit()
      ? Number.POSITIVE_INFINITY
      : ALGS_IMPORT_LIMIT_MS,
  },
});

/** 글을 못 읽으면 Error(화면에 보일 까닭) */
export function importAlgsInWorker(
  book: AlgBook,
  text: string,
): Promise<ImportResult> {
  return runner.request({ kind: "algs-import", book, text });
}
