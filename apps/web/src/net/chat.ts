import { create } from "zustand";

import type { ChatMessage } from "./protocol";

/** 화면에 남겨 두는 채팅 줄 수 */
const KEEP = 50;

/**
 * 반응 보내기(docs/48 15-5 6번): 남의 자리에 짧은 그림 반응을 띄운다. 규칙을 건드리지 않는다.
 * 방 메시지를 새로 두지 않고 채팅 줄에 보이지 않는 머리(`REACTION_HEAD`)를 붙여 보낸다. 받는 기기는 채팅 목록에
 * 넣지 않고 반응으로 읽는다. 같은 사람의 반응은 `REACTION_GAP_MS`에 한 번만 받는다(보내는 쪽도 막는다)
 */
export const REACTIONS = {
  clap: "👏",
  wow: "😮",
  aww: "😢",
} as const;
export type ReactionKind = keyof typeof REACTIONS;
export const REACTION_GAP_MS = 3000;
/** 보이지 않는 구분 문자 + 표식 */
const REACTION_HEAD = "\u2063react:";

export interface Reaction {
  id: string;
  /** 보낸 자리 */
  from: number;
  /** 받은 자리 */
  to: number;
  kind: ReactionKind;
  at: number;
}

export function encodeReaction(kind: ReactionKind, to: number): string {
  return `${REACTION_HEAD}${kind}:${to}`;
}

export function parseReaction(
  text: string,
): { kind: ReactionKind; to: number } | null {
  if (!text.startsWith(REACTION_HEAD)) return null;
  const [kind, to] = text.slice(REACTION_HEAD.length).split(":");
  const seat = Number(to);
  if (!kind || !(kind in REACTIONS) || !Number.isInteger(seat) || seat < 0)
    return null;
  return { kind: kind as ReactionKind, to: seat };
}

/** 화면에 남겨 두는 반응 수(떠올랐다 사라지는 것이라 몇 개만) */
const KEEP_REACTIONS = 12;

interface ChatState {
  messages: (ChatMessage & { at: number })[];
  /** 받은 반응(최근 몇 개). 화면이 `at`으로 떠오르는 동안만 그린다 */
  reactions: Reaction[];
  /** 채팅 창을 닫아 둔 동안 온 말 수 */
  unread: number;
  open: boolean;
  /** 지금 방에서 말하기. 방에 들어가면 정해진다 */
  send: ((text: string) => void) | null;
  receive(message: ChatMessage): void;
  /** 반응을 보낸다. 방에 있으면 채팅 줄로, 혼자 하기면 이 기기에만 띄운다. 너무 잦으면 false */
  react(from: number, to: number, kind: ReactionKind, now?: number): boolean;
  setOpen(open: boolean): void;
  reset(): void;
}

/** 이 자리가 반응을 보낸 지 `REACTION_GAP_MS`가 안 됐나 */
function tooSoon(list: readonly Reaction[], from: number, now: number) {
  return list.some((r) => r.from === from && now - r.at < REACTION_GAP_MS);
}

function pushReaction(list: readonly Reaction[], r: Reaction): Reaction[] {
  return [...list, r].slice(-KEEP_REACTIONS);
}

/** 온라인 대전 채팅. 대기실과 게임 화면이 같이 쓴다 */
export const useChat = create<ChatState>()((set, get) => ({
  messages: [],
  reactions: [],
  unread: 0,
  open: false,
  send: null,
  receive: (message) => {
    const reaction = parseReaction(message.text);
    if (reaction) {
      const now = Date.now();
      if (tooSoon(get().reactions, message.seat, now)) return;
      set((s) => ({
        reactions: pushReaction(s.reactions, {
          id: message.id,
          from: message.seat,
          to: reaction.to,
          kind: reaction.kind,
          at: now,
        }),
      }));
      return;
    }
    set((s) => ({
      messages: [...s.messages, { ...message, at: Date.now() }].slice(-KEEP),
      unread: s.open ? 0 : s.unread + 1,
    }));
  },
  react: (from, to, kind, now = Date.now()) => {
    if (tooSoon(get().reactions, from, now)) return false;
    const send = get().send;
    // 방에서는 방장이 모두에게(나에게도) 다시 보내므로 받을 때 띄운다
    if (send) send(encodeReaction(kind, to));
    else
      set((s) => ({
        reactions: pushReaction(s.reactions, {
          id: `${from}-${now}`,
          from,
          to,
          kind,
          at: now,
        }),
      }));
    return true;
  },
  setOpen: (open) => set((s) => ({ open, unread: open ? 0 : s.unread })),
  reset: () =>
    set({ messages: [], reactions: [], unread: 0, open: false, send: null }),
}));

/** 자주 쓰는 짧은 말 */
export const QUICK_CHATS = [
  "👍",
  "😂",
  "😮",
  "😭",
  "🔥",
  "👏",
  "잘했어!",
  "아깝다",
];
