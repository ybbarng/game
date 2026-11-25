import {
  type Card,
  createScenario,
  type MatchState,
  presetRules,
  step,
  viewOf,
} from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import {
  type FairLogged,
  FRIEND_ANSWERED,
  FRIEND_HIDDEN,
  FRIEND_UNSURE,
  hiddenFriend,
  type OwnAnswers,
  type SeenFriendView,
} from "./audit";

/**
 * 경기 5마(점수를 따면 프렌드가 드러남). 주공 0번, ♥A 프렌드(2번이 가짐). 손패 둘이라 턴 둘.
 * `plays`대로 차례로 내며 걸음마다의 상태를 모은다(`checkReplay`의 `states`와 같은 꼴)
 */
function replay(plays: readonly (readonly [number, Card])[]): MatchState[] {
  let state = createScenario({
    rules: presetRules("gyeonggi5"),
    phase: "play",
    declarer: 0,
    goal: { kiruda: "S", score: 13 },
    friend: { kind: "card", card: "HA" },
    leader: 0,
    hands: [
      ["D2", "C4"],
      ["D3", "C5"],
      ["DK", "HA"],
      ["D4", "C6"],
      ["D5", "C7"],
    ],
  });
  const states = [state];
  for (const [seat, card] of plays) {
    const result = step(state, seat, { type: "play", card });
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    states.push(state);
  }
  return states;
}

/** 3번 자리가 받은 화면(방장이 정직하면 다시 계산한 상태 그대로) */
const seenBy3 = (states: readonly MatchState[]): SeenFriendView[] =>
  states.map((s) => viewOf(s, 3));

describe("참가자 길 프렌드 숨기기 찾기(hiddenFriend)", () => {
  // 2번이 ◆K로 첫 턴(점수 1)을 이겨 드러난다. 다음 턴 첫 카드까지 낸다.
  const scored = replay([
    [0, "D2"],
    [1, "D3"],
    [2, "DK"],
    [3, "D4"],
    [4, "D5"],
    [2, "HA"],
  ]);

  it("받은 화면에서도 점수 턴 뒤 프렌드가 드러났으면 찾지 않는다", () => {
    expect(scored[5]?.round.friendRevealed).toBe(true);
    expect(hiddenFriend(scored, seenBy3(scored))).toBeNull();
  });

  it("점수 턴 뒤 받은 화면이 프렌드를 숨겼으면 그 턴을 끝낸 걸음과 프렌드 자리를 짚는다", () => {
    // 자리 표 진행에서 2번이 물음에 아니라고 해 방장 화면에는 드러나지 않았다.
    const seen = seenBy3(scored).map((v, i) =>
      i >= 5 ? { ...v, friendRevealed: false } : v,
    );
    expect(hiddenFriend(scored, seen)).toEqual({
      index: 4,
      seat: 2,
      reason: FRIEND_HIDDEN,
    });
  });

  describe("프렌드 본인 기기는 그 턴 물음에 보낸 답으로 가린다", () => {
    // 첫 턴을 끝낸 카드(4번 ◆5)의 자리 번호. 방장은 그 자리를 실어 2번에게 묻는다.
    const ENDING_SLOT = 24;
    const log: FairLogged[] = [
      [0, "D2"],
      [1, "D3"],
      [2, "DK"],
      [3, "D4"],
      [4, "D5"],
      [2, "HA"],
    ].map(([seat, card], i) => ({
      seat: seat as number,
      action: {
        type: "play",
        card: card as Card,
        deckSlot: i === 4 ? ENDING_SLOT : 30 + i,
      } as FairLogged["action"],
    }));
    // 점수 턴 뒤 받은 화면이 프렌드를 숨겼다(2번 기기가 받은 화면도 프렌드 칸은 같다).
    const seen = seenBy3(scored).map((v, i) =>
      i >= 5 ? { ...v, friendRevealed: false } : v,
    );
    const round = scored[0]?.roundNumber as number;
    const own = (have: boolean, delivered = true, slot = ENDING_SLOT) =>
      ({
        seat: 2,
        answers: [
          {
            query: { kind: "friend", deal: round, seat: 2, slot },
            have,
            delivered,
          },
        ],
      }) satisfies OwnAnswers;

    it("「맞다」고 답했고 방장이 받았으면 방장을 짚는다", () => {
      expect(hiddenFriend(scored, seen, log, own(true))).toEqual({
        index: 4,
        seat: 0,
        reason: FRIEND_ANSWERED,
      });
    });

    it("「아니다」고 답했으면 다른 기기처럼 자기 자리를 짚는다", () => {
      expect(hiddenFriend(scored, seen, log, own(false))).toEqual({
        index: 4,
        seat: 2,
        reason: FRIEND_HIDDEN,
      });
    });

    it("답이 방장에게 닿았는지 모르면 누구도 짚지 않는다", () => {
      expect(hiddenFriend(scored, seen, log, own(true, false))).toEqual({
        index: 4,
        seat: null,
        reason: FRIEND_UNSURE,
      });
    });

    it("그 턴 물음을 받지 못했으면(다른 턴 물음에만 답함) 누구도 짚지 않는다", () => {
      expect(hiddenFriend(scored, seen, log, own(false, true, 99))).toEqual({
        index: 4,
        seat: null,
        reason: FRIEND_UNSURE,
      });
    });

    it("다른 자리 기기의 답은 쓰지 않는다(받은 화면대로 프렌드를 짚는다)", () => {
      const others: OwnAnswers = { ...own(true), seat: 3 };
      expect(hiddenFriend(scored, seen, log, others)).toEqual({
        index: 4,
        seat: 2,
        reason: FRIEND_HIDDEN,
      });
    });
  });

  it("턴 가운데 프렌드 카드를 내 드러나면 그 턴 앞 화면이 숨긴 것은 숨기기가 아니다", () => {
    // 2번이 첫 턴(♣)에 ♥A를 내 드러난다(♣이 없어 버림). 그 앞 걸음 화면은 당연히 숨긴 채다.
    const played = replay([
      [0, "C4"],
      [1, "C5"],
      [2, "HA"],
    ]);
    expect(played[3]?.round.friendRevealed).toBe(true);
    expect(seenBy3(played)[2]?.friendRevealed).toBe(false);
    expect(hiddenFriend(played, seenBy3(played))).toBeNull();
  });
});
