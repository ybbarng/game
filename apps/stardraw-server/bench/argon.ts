/**
 * 서버 작업 증명 확인 속도(docs/36 11-30): Argon2id(16MB, 반복 1) 한 번 확인에 걸리는 시간과,
 * 작업 스레드 수(STARDRAW_ARGON_CONCURRENCY)에 따른 초당 확인 수. 응모 한 장 = 확인 1번, 처음 응모(등록 함께) = 2번.
 *
 * 실행: nice -n 15 node apps/stardraw-server/dist/bench/argon.js [--count 200] [--threads 1,2,4]
 */
import { checkPow, POW_PARAMS } from "@mighty/stardraw-core";
import {
  isPowWorker,
  type PowJob,
  runPowWorker,
  WorkerPowChecker,
} from "../src/pow-pool";
import { arg, MAX_TARGET } from "./common";

async function main() {
  const count = Number(arg("count", "200"));
  const threads = arg("threads", "1,2,4").split(",").map(Number);
  const job = (i: number): PowJob => ({
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    content: crypto.getRandomValues(new Uint8Array(76)),
    nonce: i,
    target: MAX_TARGET,
    params: POW_PARAMS,
  });
  // 같은 스레드에서 차례로
  const warm = 5;
  for (let i = 0; i < warm; i++) {
    const j = job(i);
    await checkPow(j.challenge, j.content, j.nonce, j.target, j.params);
  }
  const s0 = performance.now();
  const single = Math.min(count, 50);
  for (let i = 0; i < single; i++) {
    const j = job(i);
    await checkPow(j.challenge, j.content, j.nonce, j.target, j.params);
  }
  const perCheck = (performance.now() - s0) / single;
  console.log(`같은 스레드: 한 번 ${perCheck.toFixed(1)}ms`);
  const rows: unknown[] = [{ threads: 0, perCheckMs: +perCheck.toFixed(1) }];
  for (const n of threads) {
    const pool = new WorkerPowChecker(new URL(import.meta.url), n);
    await Promise.all(
      Array.from({ length: n * 2 }, (_, i) => pool.check(job(i))),
    );
    const t0 = performance.now();
    await Promise.all(
      Array.from({ length: count }, (_, i) => pool.check(job(i))),
    );
    const sec = (performance.now() - t0) / 1000;
    const rate = count / sec;
    rows.push({ threads: n, perSecond: +rate.toFixed(1) });
    console.log(`작업 스레드 ${n}개: 초당 ${rate.toFixed(1)}번`);
    pool.close();
  }
  console.log(`결과 ${JSON.stringify(rows)}`);
}

if (isPowWorker()) runPowWorker();
else
  void main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
