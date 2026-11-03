import { MASTER_PLAN_LABELS, type MasterPlanId } from "@game/janggi-ai";

/**
 * 초고수의 노림을 내 쪽에서 본 말로. 계획의 왼·오른은 컴퓨터 쪽에서 본 방향이라
 * 마주 앉은 나에게는 거꾸로다(컴퓨터의 왼쪽 = 내 궁성 오른쪽)
 */
export function planText(id: MasterPlanId): string {
  switch (id) {
    case "attack-left":
      return "내 궁성 오른쪽 공격";
    case "attack-right":
      return "내 궁성 왼쪽 공격";
    case "attack-center":
      return "내 궁성 가운데 공격";
    default:
      return MASTER_PLAN_LABELS[id];
  }
}
