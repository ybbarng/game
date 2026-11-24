import { useChat } from "./chat";
import { useFairBar } from "./fair-bar";
import { clearHostingRoom } from "./host-store";
import { useRematch } from "./rematch-store";

/** 방장 쪽 방: 판 끝 기록을 공개하고(`finish`) 닫는다(`close`) */
export type ClosableHost = { finish(): Promise<void> | void; close(): void };

/**
 * 방장 방을 닫는다. 판 끝 기록 공개(`HostRoom.finish`, 발표한 청구 묶음이 기록에 들어간 뒤에 풀린다)를 기다린 뒤,
 * 그 기록이 참가자에게 닿을 틈을 조금 주고 닫는다. 기록 공개가 실패해도 방은 닫는다
 */
export function closeHostWhenFinished(host: ClosableHost): void {
  const close = () => setTimeout(() => host.close(), 500);
  void Promise.resolve()
    .then(() => host.finish())
    .then(close, close);
}

/** 지금 들어가 있는 온라인 방(방장이거나 참가자) */
export type RoomSession = {
  host: ClosableHost | null;
  guest: { leave(): void } | null;
};

/** 방을 나간다. 방장이면 검증용 기록을 공개하고 닫는다. 모든 게임의 `end…Session`이 쓴다 */
export function endRoomSession(session: RoomSession): void {
  clearHostingRoom();
  if (session.host) closeHostWhenFinished(session.host);
  session.guest?.leave();
  session.host = null;
  session.guest = null;
  useChat.getState().reset();
  useFairBar.getState().reset();
  useRematch.getState().reset();
}
