import type {
  Action,
  GalaxyRules,
  GalaxyState,
  GalaxyView,
  GameEvent,
} from "@game/galaxy-engine";

import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { endRoomSession } from "@/net/room-session";

export type GalaxyHostRoom = HostRoom<
  GalaxyRules,
  GalaxyState,
  GalaxyView,
  Action,
  GameEvent,
  undefined
>;
export type GalaxyGuestRoom = GuestRoom<
  GalaxyRules,
  GalaxyState,
  GalaxyView,
  Action,
  GameEvent,
  undefined
>;

/** 지금 들어가 있는 은하 한 바퀴 온라인 방. 화면이 바뀌어도(대기실 → 대국) 연결은 이어진다 */
export const galaxySession: {
  host: GalaxyHostRoom | null;
  guest: GalaxyGuestRoom | null;
} = { host: null, guest: null };

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다 */
export function endGalaxySession(): void {
  endRoomSession(galaxySession);
}
