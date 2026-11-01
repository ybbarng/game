import { sha256 } from "@noble/hashes/sha2.js";
import { createSHA256 } from "hash-wasm";
import { expect, it } from "vitest";
import {
  checkGate,
  DEFAULT_GATE_TRIES,
  GATE_PARAMS,
  solveGate,
} from "../src/gate";
import { POW_PARAMS, powHash, powTargetForTries } from "../src/pow";

/**
 * 앞단 작업 증명 시간 재기(docs/36 11-30). 단위 시험이 아니다: `pnpm --filter @mighty/stardraw-core bench`.
 * 휴대폰 시간은 이 숫자에 기기 배수를 곱해 어림한다(11-30 「난이도」). `GATE_TRIES`로 평균 시도 수를 바꿔 잰다
 */

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const TRIES = Number(process.env.GATE_TRIES ?? DEFAULT_GATE_TRIES);
const RUNS = Number(process.env.GATE_RUNS ?? 40);

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

it("앞단 풀이·확인 시간과 응모권 Argon2 한 번", async () => {
  const target = powTargetForTries(TRIES);
  const times: number[] = [];
  const tries: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const head = randomBytes(32);
    const pub = randomBytes(65);
    const t = performance.now();
    const n = await solveGate(head, pub, target);
    times.push(performance.now() - t);
    tries.push((n ?? 0) + 1);
    expect(await checkGate(head, pub, n ?? 0, target)).toBe(true);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const perTry =
    times.reduce((a, b) => a + b, 0) / tries.reduce((a, b) => a + b, 0);

  const head = randomBytes(32);
  const pub = randomBytes(65);
  let t = performance.now();
  for (let i = 0; i < 200; i++) await checkGate(head, pub, i, target);
  const check = (performance.now() - t) / 200;

  t = performance.now();
  for (let i = 0; i < 10; i++) await powHash(head, pub, i, POW_PARAMS);
  const argon16 = (performance.now() - t) / 10;

  const msg = new Uint8Array(69);
  t = performance.now();
  for (let i = 0; i < 200_000; i++) {
    msg[68] = i;
    msg[67] = i >> 8;
    sha256(msg);
  }
  const nobleRate = 200_000 / ((performance.now() - t) / 1000);
  const h = await createSHA256();
  t = performance.now();
  for (let i = 0; i < 200_000; i++) {
    msg[68] = i;
    msg[67] = i >> 8;
    h.init();
    h.update(msg);
    h.digest("binary");
  }
  const wasmShaRate = 200_000 / ((performance.now() - t) / 1000);

  console.log(
    [
      `앞단(Argon2id ${GATE_PARAMS.memorySize}KiB, 평균 ${TRIES}번) ${RUNS}번 풀이 ms:`,
      `  평균 ${mean.toFixed(0)} · 가운데 ${pct(times, 0.5).toFixed(0)} · 90% ${pct(times, 0.9).toFixed(0)} · 최대 ${pct(times, 1).toFixed(0)}`,
      `  한 번 계산 ${perTry.toFixed(3)}ms · 서버 확인 한 번 ${check.toFixed(3)}ms`,
      `응모권 Argon2id 16MB 한 번 ${argon16.toFixed(1)}ms`,
      `SHA-256(비교): noble ${(nobleRate / 1e6).toFixed(2)}M/s · wasm ${(wasmShaRate / 1e6).toFixed(2)}M/s`,
    ].join("\n"),
  );
});
