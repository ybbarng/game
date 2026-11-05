import { beforeEach, describe, expect, it } from "vitest";

import {
  encodeReaction,
  parseReaction,
  REACTION_GAP_MS,
  useChat,
} from "@/net/chat";

import { botReactions } from "./reactions";

describe("반응 보내기(docs/48 15-5 6번): 채팅 줄에 실어 보내기", () => {
  beforeEach(() => useChat.getState().reset());

  it("반응은 보이지 않는 머리를 단 채팅 줄로 오가고, 받으면 채팅 목록이 아니라 반응으로 들어간다", () => {
    const text = encodeReaction("clap", 2);
    expect(parseReaction(text)).toEqual({ kind: "clap", to: 2 });
    expect(parseReaction("👏")).toBeNull();
    expect(parseReaction(`${text.slice(0, -1)}x`)).toBeNull();
    useChat.getState().receive({ id: "a", seat: 1, name: "손님", text });
    useChat
      .getState()
      .receive({ id: "b", seat: 1, name: "손님", text: "안녕" });
    const s = useChat.getState();
    expect(s.messages.map((m) => m.text)).toEqual(["안녕"]);
    expect(s.reactions.map((r) => [r.from, r.to, r.kind])).toEqual([
      [1, 2, "clap"],
    ]);
    expect(s.unread).toBe(1);
  });

  it("같은 사람의 반응은 3초에 한 번만 받는다", () => {
    const chat = useChat.getState();
    chat.receive({
      id: "a",
      seat: 1,
      name: "손님",
      text: encodeReaction("wow", 0),
    });
    chat.receive({
      id: "b",
      seat: 1,
      name: "손님",
      text: encodeReaction("aww", 0),
    });
    chat.receive({
      id: "c",
      seat: 2,
      name: "둘",
      text: encodeReaction("aww", 0),
    });
    expect(useChat.getState().reactions.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("혼자 하기(방 없음)는 이 기기에만 띄우고, 보내는 쪽도 3초 안에는 다시 보내지 않는다", () => {
    const chat = useChat.getState();
    expect(chat.react(0, 1, "clap", 10_000)).toBe(true);
    expect(chat.react(0, 2, "wow", 10_000 + REACTION_GAP_MS - 1)).toBe(false);
    expect(chat.react(0, 2, "wow", 10_000 + REACTION_GAP_MS)).toBe(true);
    expect(useChat.getState().reactions.map((r) => r.to)).toEqual([1, 2]);
  });

  it("방에 있으면 채팅 줄로 보낸다(방장이 모두에게 다시 보내 받을 때 띄운다)", () => {
    const sent: string[] = [];
    useChat.setState({ send: (t) => sent.push(t) });
    useChat.getState().react(0, 3, "aww", 1);
    expect(sent).toEqual([encodeReaction("aww", 3)]);
    expect(useChat.getState().reactions).toEqual([]);
  });
});

describe("컴퓨터의 반응(혼자 하기)", () => {
  it("큰 이용료를 낸 사람에게는 아쉬움, 별자리를 완성한 사람에게는 박수. 받는 사람이 아닌 컴퓨터 하나가 보낸다", () => {
    const reactions = botReactions(
      [
        {
          type: "pay",
          from: 1,
          to: 2,
          amount: 260,
          reason: "rent",
          square: 15,
        },
        { type: "pay", from: 1, to: 2, amount: 40, reason: "rent", square: 3 },
        { type: "linked", seat: 0, group: 3, owned: 3, size: 3 },
      ],
      { players: 4, me: 0 },
    );
    expect(reactions).toEqual([
      { from: 3, to: 1, kind: "aww" },
      { from: 1, to: 0, kind: "clap" },
    ]);
    // 컴퓨터가 낸 반응은 사람 자리(나)에서 나오지 않는다
    for (const r of reactions) expect(r.from).not.toBe(0);
  });
});
