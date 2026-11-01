import { describe, expect, it } from "vitest";
import {
  checkGate,
  GATE_PARAMS,
  gateContent,
  isGateNonce,
  solveGate,
} from "./gate";
import { powTargetForTries } from "./pow";

/** 정해진 입력과 낮은 세기(평균 8번)로 결정적으로 본다 */
const HEAD = new Uint8Array(32).fill(7);
const OTHER_HEAD = new Uint8Array(32).fill(8);
const PUB = new Uint8Array(65).fill(3);
PUB[0] = 4;
const OTHER_PUB = new Uint8Array(65).fill(5);
OTHER_PUB[0] = 4;
const TARGET = powTargetForTries(8);

describe("앞단 작업 증명: 묶는 것", () => {
  it("규칙 값: Argon2id 256KiB 한 번, 내용은 이름표 ‖ 0 ‖ 응모자 id(16바이트)", () => {
    expect(GATE_PARAMS).toEqual({ memorySize: 256, iterations: 1 });
    const content = gateContent(PUB);
    expect(content.length).toBe("stardraw/gate/v1".length + 1 + 16);
    expect(new TextDecoder().decode(content.slice(0, 16))).toBe(
      "stardraw/gate/v1",
    );
  });

  it("푼 n은 같은 문제 값·같은 열쇠에서만 맞는다(다른 열쇠·다른 회차에 다시 쓸 수 없다)", async () => {
    const n = await solveGate(HEAD, PUB, TARGET);
    // 입력이 정해져 있으니 답도 늘 같다(다른 구현이 맞춰 볼 값)
    expect(n).toBe(7);
    expect(await checkGate(HEAD, PUB, 7, TARGET)).toBe(true);
    expect(await checkGate(OTHER_HEAD, PUB, 7, TARGET)).toBe(false);
    expect(await checkGate(HEAD, OTHER_PUB, 7, TARGET)).toBe(false);
  });

  it("첫 답보다 앞선 n은 모두 틀린다", async () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6])
      expect(await checkGate(HEAD, PUB, n, TARGET)).toBe(false);
  });
});

describe("앞단 작업 증명: 요청 칸 확인", () => {
  it("u32 정수만 받는다", async () => {
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN, "2", null, undefined])
      expect(isGateNonce(bad)).toBe(false);
    for (const good of [0, 2, 0xffffffff]) expect(isGateNonce(good)).toBe(true);
    expect(await checkGate(HEAD, PUB, 2.5, TARGET)).toBe(false);
  });

  it("취소하면 null", async () => {
    const n = await solveGate(HEAD, PUB, 1, { onTry: () => false });
    expect(n).toBeNull();
  });
});
