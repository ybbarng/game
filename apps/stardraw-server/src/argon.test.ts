import { createHash } from "node:crypto";
import {
  checkGate,
  GATE_PARAMS,
  hashWasmArgon2id,
  POW_PARAMS,
  powHash,
  TEST_VECTORS,
  toHex,
  useArgon2id,
} from "@game/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { nativeArgon2id, useNativeArgon2 } from "./argon";

/**
 * 서버의 Node 내장 Argon2id(argon.ts)가 화면·검사기의 hash-wasm과 같은 바이트를 내는지. 작업 증명은 공개 규칙이라
 * 한 바이트라도 다르면 서버가 정상 예측을 거절하거나 검사기와 어긋난다
 */

const native = nativeArgon2id();

afterEach(() => useArgon2id(null));

/** 결정적 바이트(시드마다 다르게) */
function bytes(seed: number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let block = createHash("sha256").update(`argon/${seed}`).digest();
  for (let i = 0; i < length; i++) {
    if (i > 0 && i % 32 === 0)
      block = createHash("sha256").update(block).digest();
    out[i] = block[i % 32] as number;
  }
  return out;
}

describe.runIf(native)("Node 내장 Argon2id", () => {
  const nat = native as NonNullable<typeof native>;

  it("무작위 입력 300개(길이·메모리·반복을 바꿔)에서 hash-wasm과 같은 바이트", async () => {
    for (let i = 0; i < 300; i++) {
      const input = {
        password: bytes(i, 4 + (i % 97)),
        salt: bytes(i + 10_000, 8 + (i % 41)),
        iterations: 1 + (i % 3),
        memorySize: 8 + ((i * 37) % 120),
      };
      expect(toHex(await nat(input))).toBe(
        toHex(await hashWasmArgon2id(input)),
      );
    }
  });

  it("공개 규칙의 두 설정(예측 16MB, 앞단 256KB)에서 같은 바이트", async () => {
    for (let i = 0; i < 3; i++)
      for (const p of [POW_PARAMS, GATE_PARAMS]) {
        const input = {
          password: bytes(i, 200),
          salt: bytes(i + 1, 32),
          ...p,
        };
        expect(toHex(await nat(input))).toBe(
          toHex(await hashWasmArgon2id(input)),
        );
      }
  });

  it("바꿔 끼우면 core 시험 벡터(작업 증명)와 앞단 확인이 그대로 맞는다", async () => {
    expect(useNativeArgon2()).toBe(true);
    const pow = TEST_VECTORS.find((g) => g.id === "pow");
    expect(pow?.vectors.length).toBeGreaterThan(0);
    for (const v of pow?.vectors ?? [])
      expect(await v.compute()).toBe(v.expected);
    // 목표값 최대면 nonce 0이 맞는다(앞단 확인이 내장 구현으로 돈다)
    expect(await checkGate(bytes(1, 32), bytes(2, 33), 0, 0xffffffff)).toBe(
      true,
    );
    const a = await powHash(bytes(3, 32), bytes(4, 50), 7, {
      memorySize: 64,
      iterations: 1,
    });
    useArgon2id(null);
    const b = await powHash(bytes(3, 32), bytes(4, 50), 7, {
      memorySize: 64,
      iterations: 1,
    });
    expect(toHex(a)).toBe(toHex(b));
  });
});
