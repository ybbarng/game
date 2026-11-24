import type { BusyReason } from "@game/fair-play";
import { create } from "zustand";

import { useChat } from "./chat";
import type { LobbyState } from "./protocol";
import { randomId } from "./transport";

/** 끊긴 사람을 오래 기다려 연 끝내기 투표. `voters`는 표를 낼 수 있는 자리(연결된 사람) */
export interface EndVoteState {
  votes: { seat: number; end: boolean }[];
  voters: number[];
}

/** 부정 감지(내 기기가 찾았거나, 판을 진행하는 방장이 알렸다) */
export interface IncidentState {
  seat: number | null;
  reason: string;
  own: boolean;
  /** 부정은 확실하지만 누가 했는지 확인하는 중 */
  pending?: boolean;
}

/** 부정 알림(내 기기가 찾은 것과 다른 사람이 알린 것) */
export interface IncidentNoticeLike {
  reporter: number;
  seat: number | null;
  reason: string;
  own: boolean;
  pending?: boolean;
}

export interface BusyCoordinator {
  onBusy(listener: (busy: BusyReason | null) => void): () => void;
}

/**
 * 암호화방(멘탈 포커) 판의 화면 상태. 모든 카드 게임(마이티·하트·화투 셋·원카드)이 이 하나를 쓴다.
 * 한 번에 한 판만 열려 있으니 게임마다 따로 둘 까닭이 없다
 */
interface FairBarState {
  /**
   * 부정을 찾아 판을 멈췄다. `own`이면 내 기기가 찾은 것, 아니면 판을 진행하는 방장이 알린 것.
   * `seat`가 null이면 누군지 가릴 수 없다
   */
  incident: IncidentState | null;
  /**
   * 내 카드를 아직 다 열지 못했다. 판 시작 섞기(`deal`), 다시 섞기(`redeal`),
   * 그 밖에 바닥 카드·증명을 기다리는 중(`wait`)
   */
  shuffling: BusyReason | null;
  /** 섞는 연출을 시작한 시각. 나눠 줄 때 남은 섞기 연출 시간을 정한다 */
  shuffleStartedAt: number | null;
  setShuffling(reason: BusyReason | null): void;
  /** 멘탈 포커 판인가(연결이 끊긴 사람을 컴퓨터가 대신하지 않고 기다린다) */
  fair: boolean;
  /** 방장: 연결이 끊긴 사람을 더 기다리지 않고 게임을 끝낸다 */
  endGame: (() => void) | null;
  /** 끊긴 사람을 오래 기다려 연 끝내기 투표와 내 표 내기 */
  endVote: EndVoteState | null;
  voteEnd: ((end: boolean) => void) | null;
  /** 자리 이름과 연결이 끊긴 사람 자리(대기실 정보) */
  names: string[];
  offline: number[];
  /** 새 판을 붙일 때: 지난 판의 부정 알림과 섞는 중 표시를 지운다 */
  clearRound(): void;
  /** 혼자 하기·다시 보기·방을 떠날 때: 암호화방 표시를 모두 지운다 */
  reset(): void;
}

export const useFairBar = create<FairBarState>()((set, get) => ({
  incident: null,
  shuffling: null,
  shuffleStartedAt: null,
  setShuffling(reason) {
    const { shuffling, shuffleStartedAt } = get();
    // 판 시작 섞기를 시작할 때 섞는 연출 시작 시각을 적는다(다 나눠 줄 때까지 둔다).
    const starting = reason === "deal" && shuffling !== "deal";
    set({
      shuffling: reason,
      shuffleStartedAt: starting ? Date.now() : shuffleStartedAt,
    });
  },
  fair: false,
  endGame: null,
  endVote: null,
  voteEnd: null,
  names: [],
  offline: [],
  clearRound: () =>
    set({ incident: null, shuffling: null, shuffleStartedAt: null }),
  reset: () =>
    set({
      incident: null,
      shuffling: null,
      shuffleStartedAt: null,
      fair: false,
      endGame: null,
      endVote: null,
      voteEnd: null,
      names: [],
      offline: [],
    }),
}));

/**
 * 부정 알림. 채팅에 남기고, 내 기기가 찾은 것이나 판을 진행하는 방장이 알린 것은 화면에 띄운다.
 * 다른 참가자의 알림은 그 사람의 주장으로 채팅에만 남긴다(거짓 알림으로 남의 판을 멈추지 못하게).
 */
export function reportIncident(n: IncidentNoticeLike, names: string[]): void {
  const who =
    n.seat === null ? "누군지 모름" : (names[n.seat] ?? `${n.seat}번`);
  useChat.getState().receive({
    id: randomId(8),
    seat: -1,
    name: "부정 감지",
    text: n.pending
      ? `⚠ ${n.own ? "내 기기가 찾음" : `${names[n.reporter] ?? `${n.reporter}번`}의 알림`} — ${n.reason}`
      : n.own
        ? `⚠ 내 기기가 찾음 — ${who}: ${n.reason}`
        : `${names[n.reporter] ?? `${n.reporter}번`}의 알림 — ${who}: ${n.reason} (내 기기 확인과 따로 봐요)`,
  });
  const current = useFairBar.getState().incident;
  // 확인하는 중이던 알림은 같은 사람의 확정 알림으로 바꾼다.
  if (n.own || (n.reporter === 0 && (!current || current.pending)))
    useFairBar.setState({
      incident: {
        seat: n.seat,
        reason: n.reason,
        own: n.own,
        ...(n.pending ? { pending: true } : {}),
      },
    });
}

/** 멘탈 포커 판: 섞는 중 표시와 끊긴 사람 처리를 화면 상태에 잇는다. 일반방이면 표시를 끈다 */
export function bindFair(
  coordinator: BusyCoordinator | undefined,
  endGame: (() => void) | null,
  voteEnd: (end: boolean) => void,
): void {
  if (!coordinator) {
    useFairBar.setState({
      fair: false,
      endGame: null,
      voteEnd: null,
      shuffling: null,
    });
    return;
  }
  useFairBar.setState({ fair: true, endGame, voteEnd });
  coordinator.onBusy((busy) => useFairBar.getState().setShuffling(busy));
}

/** 대기실 정보에서 끝내기 투표(열려 있을 때). 표를 낼 수 있는 사람은 연결된 사람 자리다 */
export function endVoteOf(lobby: LobbyState): EndVoteState | null {
  if (!lobby.endVote) return null;
  return {
    votes: lobby.endVote.votes,
    voters: lobby.seats
      .filter((s) => s.kind !== "bot" && s.connected)
      .map((s) => s.seat),
  };
}

/** 판마다 진짜 카드로 다시 계산해 문제가 없었다고 채팅에 남긴다 */
export function announceRoundVerified(): void {
  useChat.getState().receive({
    id: randomId(8),
    seat: -1,
    name: "검증",
    text: "이번 판을 진짜 카드로 다시 계산했어요 — 문제없음 ✓",
  });
}
