import type { KitClaims, VerifyContext } from "@/game/kit";

import type { ClaimsResolved } from "./claim";

/**
 * 실시간 청구를 쓰는 게임의 `GameKit.verifyUnsigned`·`verifyUnsignedDone`(판 끝 다시 계산, docs/43 7-1·docs/42 16절).
 *
 * - 청구로만 들어와야 하는 직접 행동(`KitClaims.direct`)이 사람 자리(컴퓨터 자리가 아닌 곳)에 있으면 방장이 지어낸 것이다.
 * - 기록 속 청구 묶음 행동(`KitClaims.recorded`)은 이 기기가 받아들인 발표마다 `KitClaims.action`으로 만든 기대 행동과
 *   차례·내용이 같아야 한다(방장이 발표는 바르게, 기록만 빼거나 바꾸거나 없던 청구를 넣지 못하게).
 *   `partial`이면(받지 못한 발표가 있을 수 있다) 받은 발표가 빠짐없이 차례대로 들어 있는지만 본다.
 * - 빠진 것은 끝에서만 안다(`verifyUnsignedDone`). `complete`가 아니면(판마다 검증) 끝 확인은 건너뛴다.
 * 같은 `context`로 차례대로 부르는 동안의 진행 위치는 `context`를 열쇠로 든다
 */
export function claimsVerifier<Action>(
  // biome-ignore lint/suspicious/noExplicitAny: 청구 내용·판·판정 모양은 게임마다 다르다
  spec: KitClaims<any, Action, any, any, any>,
) {
  const cursors = new WeakMap<
    VerifyContext,
    { expected: string[]; at: number }
  >();
  const cursorOf = (context: VerifyContext) => {
    let c = cursors.get(context);
    if (!c) {
      c = {
        expected: ((context.claimsResolved ?? []) as ClaimsResolved[]).flatMap(
          (r) => {
            const action = spec.action(r);
            return action === null ? [] : [JSON.stringify(action)];
          },
        ),
        at: 0,
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
      if (context.partial) {
        // 받지 못한 발표의 묶음일 수 있다: 받은 것과 같으면 다음 것으로 넘어간다
        if (text === c.expected[c.at]) c.at++;
        return null;
      }
      const want = c.expected[c.at];
      if (want === undefined)
        return `기록 속 청구 묶음이 받은 발표보다 많다(방장이 없던 청구를 넣었다)`;
      if (want !== text)
        return `기록 속 청구 묶음이 방장 발표와 다르다(빼거나 바꿨다)`;
      c.at++;
      return null;
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
