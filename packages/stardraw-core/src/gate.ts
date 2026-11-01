import { concat, utf8 } from "./bytes";
import { entrantId } from "./keys";
import { checkPow, type PowParams, type SolveOptions, solvePow } from "./pow";

/**
 * 응모 앞단 작업 증명(docs/36 11-30, 보안 표 I2). 장부에는 싣지 않고 응모·등록 **요청**에만 붙는다.
 * 서버는 비싼 Argon2(16MB)를 돌리기 전에 이것을 1ms 안쪽으로 확인해, 없거나 틀린 요청을 바로 버린다.
 *
 * - 무엇에 묶나: 문제 값(앞 회차 기록 해시, 회차마다 한 번 바뀐다)과 응모자 id(공개 열쇠 해시).
 *   고른 번호에는 묶지 않아 응모 화면에 들어오는 순간부터 뒤에서 풀어 둘 수 있다.
 *   다른 열쇠·다른 회차에는 다시 쓸 수 없다. 같은 열쇠의 같은 회차에는 등록과 응모가 함께 쓴다.
 * - 계산: Argon2id(256KiB, 1회)로 `"stardraw/gate/v1" ‖ 0 ‖ 응모자 id ‖ n`을 계산해 앞 4바이트가 목표값보다 작은 n.
 *   SHA-256 대신 작은 Argon2를 쓰는 까닭은 공격자의 전용 칩·그래픽카드 이점을 줄이기 위해서다(11-30 ⑤).
 */

/** 앞단 계산 세기(규칙의 값). 한 번 계산이 이 맥 wasm에서 약 0.3ms */
export const GATE_PARAMS: PowParams = { memorySize: 256, iterations: 1 };

/** 기본 평균 시도 수: 이 맥에서 약 0.15초, 중간 휴대폰에서 0.5~0.8초 어림(11-30 「난이도」) */
export const DEFAULT_GATE_TRIES = 512;

const GATE_TAG = utf8("stardraw/gate/v1");

/** 앞단 계산에 넣는 내용(문제 값은 salt로 따로 들어간다) */
export function gateContent(publicKey: Uint8Array): Uint8Array {
  return concat(GATE_TAG, new Uint8Array([0]), entrantId(publicKey));
}

/** n이 u32 정수인지(요청 칸을 믿지 않는다) */
export function isGateNonce(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0xffffffff
  );
}

export function checkGate(
  head: Uint8Array,
  publicKey: Uint8Array,
  nonce: number,
  target: number,
  params: PowParams = GATE_PARAMS,
): Promise<boolean> {
  if (!isGateNonce(nonce)) return Promise.resolve(false);
  return checkPow(head, gateContent(publicKey), nonce, target, params);
}

/** 목표값을 넘는 n을 찾는다. 취소되면 null */
export function solveGate(
  head: Uint8Array,
  publicKey: Uint8Array,
  target: number,
  options: SolveOptions = {},
): Promise<number | null> {
  return solvePow(head, gateContent(publicKey), target, {
    ...options,
    params: options.params ?? GATE_PARAMS,
  });
}
