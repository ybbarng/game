import {
  type Action,
  type GalaxyState,
  type StepResult,
  step,
  stepWithDice,
} from "@game/galaxy-engine";

/**
 * 튜토리얼 미션: 장면에서 시작한 뒤 굴림 눈을 차례로 정해 둔다(누가 굴리든 순서대로).
 * 몇 번째 굴림인지는 공개 수(`revealCount`)로 센다. 정한 눈을 다 쓰면 보통처럼 사슬로 굴린다.
 * 이런 대국은 저장·기록하지 않는다(`stepWithDice`는 `replay`에 들어가지 않는다)
 */
export function scriptedDiceStep(
  initial: GalaxyState,
  dice: readonly (readonly [number, number])[],
): (state: GalaxyState, seat: number, action: Action) => StepResult {
  const start = initial.revealCount;
  return (state, seat, action) => {
    const next = dice[state.revealCount - start];
    if (action.type === "roll" && next && state.phase === "turn")
      return stepWithDice(state, seat, [next[0], next[1]]);
    return step(state, seat, action);
  };
}
