import type {
  Action,
  GameEvent,
  OnecardRules,
  OnecardState,
  OnecardView,
} from "@game/onecard-engine";

import { useChat } from "@/net/chat";
import type { GuestRoom } from "@/net/guest-room";
import type { HostRoom } from "@/net/host-room";
import { clearHostingRoom } from "@/net/host-store";

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
  clearHostingRoom();
  if (onecardSession.host) {
    const host = onecardSession.host;
    // 발표한 청구 묶음이 기록에 들어가 판 끝 기록을 보낸 뒤에 닫는다(암호화방 준비 줄, `HostRoom.finish`)
    void host.finish().then(() => setTimeout(() => host.close(), 500));
  }
  onecardSession.guest?.leave();
  onecardSession.host = null;
  onecardSession.guest = null;
  useChat.getState().reset();
}
