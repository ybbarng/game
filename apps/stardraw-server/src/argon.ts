import * as crypto from "node:crypto";
import { type Argon2idFn, useArgon2id } from "@game/stardraw-core";

/**
 * 서버의 Argon2id를 Node 내장(`crypto.argon2`, Node 24.7+)으로(2026-11-03). hash-wasm은 부를 때마다 WASM 인스턴스와
 * 메모리(16MB)를 새로 만들어 GC 전까지 쌓였다: 예측 1천 장이 한꺼번에 오면 RSS 461MB(컨테이너 상한 320MiB 넘음).
 * 내장은 libuv 스레드에서 돌고 메모리를 바로 돌려준다. 결과는 같은 바이트다(argon.test.ts가 무작위 입력과 시험 벡터로 본다).
 * 브라우저·검사기는 그대로 hash-wasm이다
 */

type NodeArgon2 = (
  algorithm: "argon2id",
  parameters: {
    message: Uint8Array;
    nonce: Uint8Array;
    parallelism: number;
    tagLength: number;
    memory: number;
    passes: number;
  },
  callback: (err: Error | null, result: Buffer) => void,
) => void;

/** 이 Node에 내장 Argon2가 있으면 그 구현, 없으면 null */
export function nativeArgon2id(): Argon2idFn | null {
  const argon2 = (crypto as unknown as { argon2?: NodeArgon2 }).argon2;
  if (typeof argon2 !== "function") return null;
  return (a) =>
    new Promise((resolve, reject) =>
      argon2(
        "argon2id",
        {
          message: a.password,
          nonce: a.salt,
          parallelism: 1,
          tagLength: 32,
          memory: a.memorySize,
          passes: a.iterations,
        },
        (err, out) =>
          err
            ? reject(err)
            : resolve(new Uint8Array(out.buffer, out.byteOffset, out.length)),
      ),
    );
}

/** 이 스레드의 작업 증명 계산을 내장으로 바꾼다(없으면 hash-wasm 그대로). 바꿨는지 돌려준다 */
export function useNativeArgon2(): boolean {
  const fn = nativeArgon2id();
  if (fn) useArgon2id(fn);
  return fn !== null;
}
