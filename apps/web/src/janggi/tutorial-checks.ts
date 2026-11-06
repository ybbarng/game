import {
  type Action,
  type GameEvent,
  type JanggiView,
  type Piece,
  pointAt,
  type Setup,
} from "@game/janggi-engine";

import type { MissionContext, MissionStatus } from "@/tutorial/types";

/** 장기 미션 판정이 보는 것: 지금 화면과 미션을 시작한 뒤 생긴 일 */
export type Context = MissionContext<JanggiView, GameEvent>;

/** 내가 옮긴 수들(둔 차례대로) */
export function myMoves({ view, events }: Context) {
  return events.filter(
    (e): e is Extract<GameEvent, { type: "moved" }> =>
      e.type === "moved" && e.seat === view.mySeat,
  );
}

/** 내가 처음 옮긴 수 */
export function myFirstMove(ctx: Context) {
  return myMoves(ctx)[0] ?? null;
}

/** 첫 수가 그 자리로 갔으면 성공 */
export function firstTo(name: string) {
  const target = pointAt(name);
  return (ctx: Context): MissionStatus => {
    const moved = myFirstMove(ctx);
    if (!moved) return null;
    return moved.to === target ? "success" : "fail";
  };
}

/** 내 수 `limit`번 안에 그 자리에 그 기물이 서면 성공, 못 서면 실패 */
export function standsWithin(piece: Piece, name: string, limit: number) {
  const at = pointAt(name);
  return (ctx: Context): MissionStatus => {
    const count = myMoves(ctx).length;
    if (count === 0) return null;
    if (ctx.view.board[at] === piece) return "success";
    return count >= limit ? "fail" : null;
  };
}

/** 내가 고른 상차림이 그것이면 성공 */
export function choseSetup(setup: Setup) {
  return ({ view, events }: Context): MissionStatus => {
    const chosen = events.find(
      (e) => e.type === "setupChosen" && e.seat === view.mySeat,
    );
    if (chosen?.type !== "setupChosen") return null;
    return chosen.setup === setup ? "success" : "fail";
  };
}

/** 판이 끝났을 때 내가 이겼으면 성공 */
export function wonRound({ view, events }: Context): MissionStatus {
  const ended = events.find((e) => e.type === "roundEnded");
  if (ended?.type !== "roundEnded") return null;
  return ended.result.seat === view.mySeat ? "success" : "fail";
}

/** 출발-도착 자리 이름으로 쓴 수 */
export const move = (from: string, to: string): Action => ({
  type: "move",
  from: pointAt(from),
  to: pointAt(to),
});
