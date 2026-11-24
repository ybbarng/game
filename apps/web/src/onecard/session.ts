import type {
  Action,
  GameEvent,
  OnecardRules,
  OnecardState,
  OnecardView,
} from "@game/onecard-engine";

import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { endRoomSession } from "@/net/room-session";

import type { OnecardExtra } from "./kit";

export type OnecardHostRoom = HostRoom<
  OnecardRules,
  OnecardState,
  OnecardView,
  Action,
  GameEvent,
  OnecardExtra
>;
export type OnecardGuestRoom = GuestRoom<
  OnecardRules,
  OnecardState,
  OnecardView,
  Action,
  GameEvent,
  OnecardExtra
>;

/** 지금 들어가 있는 원카드 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const onecardSession: {
  host: OnecardHostRoom | null;
  guest: OnecardGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endOnecardSession(): void {
  endRoomSession(onecardSession);
}
