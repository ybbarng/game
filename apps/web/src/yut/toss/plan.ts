import {
  type LastThrow,
  throwName,
  type YutState,
  type YutView,
} from "@game/yut-engine";

import { planToss, seatAngle, type TossPlan } from "./sim";

/**
 * 던진 사람 자리에서 날아오는 궤적 계획(무효거나 몸짓이 없는 옛 판이면 null).
 * 대국 화면(`TossMat`)과 다시 보기(`ReplayMat`)가 함께 쓴다: 같은 던지기 번호·몸짓 값·결과·자리면 같은 궤적이다
 */
export function planFor(
  view: Pick<YutView, "rules" | "mySeat">,
  thrown: LastThrow | null,
): TossPlan | null {
  if (!thrown?.gesture || !thrown.sticks || thrown.nak === "unopened")
    return null;
  const players = view.rules.players;
  return planToss({
    index: thrown.index,
    gesture: thrown.gesture,
    sticks: thrown.sticks,
    nak: thrown.nak ?? null,
    angle: seatAngle(thrown.seat - view.mySeat, players),
  });
}

/** 결과 글: 도·개·걸, 「윷! 한 번 더」, 낙, 무효 */
export function resultLabel(thrown: LastThrow): string {
  if (thrown.nak === "unopened") return "무효";
  if (thrown.nak) return "낙";
  const v = thrown.value;
  if (v === null) return "";
  return `${throwName(v)}${v === 4 || v === 5 ? "! 한 번 더" : ""}`;
}

/** 다시 보기 한 걸음에서 멍석이 할 일 */
export interface ReplayCue {
  /** 보이는 걸음(바뀌면 멍석이 다시 정한다) */
  index: number;
  /** 그 걸음의 마지막 던지기를 멈춘 자리(또는 연출)로 그릴 계획. 없으면 3D에 가락이 없다 */
  plan: TossPlan | null;
  /** 그 계획을 처음부터 굴린다(한 걸음 앞으로 와서 새 던지기 결과가 나왔을 때만) */
  animate: boolean;
}

/**
 * 다시 보기에서 `from` 걸음에서 `to` 걸음으로 갈 때 멍석이 할 일(docs/37 14-7).
 * - 한 걸음 앞으로 와서 그 걸음에 새 던지기 결과가 나왔으면 그 던지기의 궤적을 처음부터 굴린다.
 * - 뒤로 가거나 건너뛰면 굴리지 않고 그 걸음의 마지막 던지기로 멈춘 모습만 보인다.
 * - 몸짓이 없는 옛 판(규칙 판 1)과 무효(열지 않음)는 계획이 없다(2D).
 * 궤적은 대국 중과 같은 `planFor`(던지기 번호·몸짓·결과·던진 자리와 내 자리)로 고른다
 */
export function replayCue(
  states: readonly YutState[],
  from: number,
  to: number,
  seat: number,
): ReplayCue {
  const state = states[to];
  if (!state) return { index: to, plan: null, animate: false };
  const thrown = state.lastThrow;
  const plan = planFor({ rules: state.rules, mySeat: seat }, thrown);
  const before = states[from]?.lastThrow ?? null;
  const animate =
    plan !== null &&
    thrown !== null &&
    to === from + 1 &&
    before?.index !== thrown.index;
  return { index: to, plan, animate };
}
