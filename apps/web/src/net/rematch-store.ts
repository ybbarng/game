import { create } from "zustand";

/**
 * 온라인 판 끝 「한 판 더」 상태. 모든 게임의 판 끝 단추(`RoundEndButtons`)가 이 하나를 본다.
 * 방 화면(`RoomScreen`)이 방에 들어갈 때 채우고, 방을 떠나면(`endRoomSession`) 지운다
 */
interface RematchState {
  /** 지금 들어가 있는 온라인 방에서 내 역할. 방 밖(혼자 하기·다시 보기)이면 null */
  role: "host" | "guest" | null;
  /** 방장: 지금은 한 판 더를 시작할 수 없다(친구가 들어와야 하는 게임인데 친구가 나갔다) */
  blocked: boolean;
  /** 방장: 한 판 더를 시작하는 중(참가자 약속을 모으고 새로 섞는 동안) */
  busy: boolean;
  /** 방장: 한 판 더를 시작한다 */
  start: (() => void) | null;
  reset(): void;
}

export const useRematch = create<RematchState>()((set) => ({
  role: null,
  blocked: false,
  busy: false,
  start: null,
  reset: () => set({ role: null, blocked: false, busy: false, start: null }),
}));

/**
 * 같은 방의 게임마다 다른 기록 열쇠. 첫 게임은 예전과 같은 `online:<방>`이라 새로고침해도 같은 기록을 이어 쓰고,
 * 한 판 더로 시작한 게임은 `online:<방>:<번째>`로 따로 남는다(앞 게임 기록을 덮지 않는다)
 */
export function roomGameKey(room: string, gameNo: number): string {
  return gameNo > 1 ? `${room}:${gameNo}` : room;
}
