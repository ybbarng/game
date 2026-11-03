import type { KitClaims, VerifyContext } from "@/game/kit";

import type { ClaimsResolved } from "./claim";

/**
 * 실시간 청구를 쓰는 게임의 `GameKit.verifyUnsigned`·`verifyUnsignedDone`(판 끝 다시 계산, docs/43 7-1·docs/42 16절).
 *
 * - 청구로만 들어와야 하는 직접 행동(`KitClaims.direct`)이 사람 자리(컴퓨터 자리가 아닌 곳)에 있으면 방장이 지어낸 것이다.
 * - 기록 속 청구 묶음 행동(`KitClaims.recorded`)은 이 기기가 받아들인 발표마다 `KitClaims.action`으로 만든 기대 행동과
 *   차례·내용이 같아야 한다(방장이 발표는 바르게, 기록만 빼거나 바꾸거나 없던 청구를 넣지 못하게).
 * - `partial`이면(끊김·새로고침으로 받지 못한 발표가 있을 수 있다) 기대와 다른 묶음은 **끊긴 구간 안에서만** 넘긴다.
 *   구간(`VerifyContext.gaps`)은 「끊길 때까지 받은 발표 수」로 적는다. 발표는 차례대로 오고 방장은 발표한 차례대로
 *   기록에 넣으므로, 받지 못한 묶음은 끊기기 전 마지막으로 받은 발표와 다시 받은 첫 발표 사이에만 기록에 있을 수 있다.
 *   그 밖에서 기대와 다른 묶음은 바꾸거나 지어낸 것이다. `gaps`가 없으면(구간을 모르는 호출) 받은 발표가 빠짐없이
 *   차례대로 들어 있는지만 본다.
 * - 빠진 것은 끝에서만 안다(`verifyUnsignedDone`). `complete`가 아니면(판마다 검증) 끝 확인은 건너뛴다.
 * 같은 `context`로 차례대로 부르는 동안의 진행 위치는 `context`를 열쇠로 든다
 */
export function claimsVerifier<Action>(
  // biome-ignore lint/suspicious/noExplicitAny: 청구 내용·판·판정 모양은 게임마다 다르다
  spec: KitClaims<any, Action, any, any, any>,
) {
  const cursors = new WeakMap<
    VerifyContext,
    { expected: string[]; at: number; gaps: Set<number> | null }
  >();
  const cursorOf = (context: VerifyContext) => {
    let c = cursors.get(context);
    if (!c) {
      const resolved = (context.claimsResolved ?? []) as ClaimsResolved[];
      // 발표 위치 → 그 앞까지의 기대 행동 수(엔진에 넣을 것이 없는 발표는 기록에도 없다)
      const before: number[] = [];
      const expected: string[] = [];
      for (const r of resolved) {
        before.push(expected.length);
        const action = spec.action(r);
        if (action !== null) expected.push(JSON.stringify(action));
      }
      before.push(expected.length);
      c = {
        expected,
        at: 0,
        gaps: context.gaps
          ? new Set(
              context.gaps.map(
                (g) => before[Math.min(Math.max(0, g), resolved.length)] ?? 0,
              ),
            )
          : null,
      };
      cursors.set(context, c);
    }
    return c;
  };
  return {
    verifyUnsigned(input: {
      seat: number;
      action: Action;
      index: number;
      context: VerifyContext;
    }): string | null {
      const { seat, action, context } = input;
      if (spec.direct?.(action) && !context.botSeats?.has(seat))
        return `${seat}번 자리의 청구가 청구 통로를 거치지 않고 기록에 들어 있다(방장이 지어냈다)`;
      if (!spec.recorded(action)) return null;
      const c = cursorOf(context);
      const text = JSON.stringify(action);
      const want = c.expected[c.at];
      if (text === want) {
        c.at++;
        return null;
      }
      if (context.partial) {
        // 받지 못한 발표의 묶음일 수 있다: 끊긴 구간 안이면 넘긴다(구간을 모르면 어디서든)
        if (!c.gaps || c.gaps.has(c.at)) return null;
        return want === undefined
          ? "끊긴 구간 밖의 기록 속 청구 묶음이 받은 발표보다 많다(방장이 없던 청구를 넣었다)"
          : "끊긴 구간 밖의 기록 속 청구 묶음이 방장 발표와 다르다(빼거나 바꿨다)";
      }
      if (want === undefined)
        return "기록 속 청구 묶음이 받은 발표보다 많다(방장이 없던 청구를 넣었다)";
      return "기록 속 청구 묶음이 방장 발표와 다르다(빼거나 바꿨다)";
    },
    verifyUnsignedDone(context: VerifyContext): string | null {
      if (!context.complete) return null;
      const c = cursorOf(context);
      return c.at < c.expected.length
        ? "방장이 발표한 청구 묶음이 기록에서 빠졌다"
        : null;
    },
  };
}
