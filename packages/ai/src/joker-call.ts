import {
  type Card,
  deckFor,
  isJoker,
  jokerCallOf,
  mightyOf,
  type PlayerView,
} from "@game/mighty-engine";

import { relationTo } from "./sides";

/**
 * 조커콜을 하면 어떻게 될지의 어림(docs/04 8.3절 「효과 있는 조커콜」 기준).
 * 넷을 더하면 1이다.
 */
export interface JokerCallChance {
  /** 상대 편 조커를 끌어내고 우리 편이 그 턴을 먹는다 */
  effective: number;
  /** 상대 편 조커를 끌어내지만 상대 편이 그 턴을 먹는다(조커 대신 마이티로 막는 것도 여기) */
  lostTrick: number;
  /** 우리 편 조커를 끌어낸다 */
  ownJoker: number;
  /** 조커가 아무 손에도 없다(바닥에 묻혔다) */
  noJoker: number;
}

/** 지금까지 본 카드: 내 손, 끝난 턴, 지금 턴, 내가 버린 바닥 카드 */
function seenCards(view: PlayerView): Set<Card> {
  return new Set<Card>([
    ...view.hand,
    ...view.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    ...(view.trick?.plays.map((p) => p.card) ?? []),
    ...(view.discarded ?? []),
  ]);
}

/**
 * 앞선 조커콜에 조커를 내지 않은 자리. 조커콜을 당하면 조커를 가진 사람은 조커(규칙에 따라 마이티)만 낼 수 있어서,
 * 다른 카드를 낸 사람은 조커가 없다. 마이티를 낸 사람은 마이티로 막았을 수도 있어 모른다.
 */
function seatsWithoutJoker(view: PlayerView): Set<number> {
  const kiruda = view.goal?.kiruda ?? "NT";
  const call = jokerCallOf(view.rules, kiruda);
  const mighty = mightyOf(view.rules, kiruda);
  const result = new Set<number>();
  view.tricks.forEach((trick, index) => {
    if (!trick.jokerCalled || trick.plays[0]?.card !== call) return;
    if (index === 0 && !view.rules.jokerCallEffectInFirstTrick) return;
    for (const { seat, card } of trick.plays.slice(1))
      if (seat >= 0 && card !== mighty && !isJoker(card)) result.add(seat);
  });
  return result;
}

/**
 * 프렌드가 누구일 수 있는지. 아는 만큼만 쓴다: 드러났거나 내가 프렌드면 그 자리 하나,
 * 아직 모르면 주공과 나를 뺀 자리 가운데 아무나(똑같이 그럴 법하다고 본다), 프렌드가 없으면 null 하나.
 */
function friendCandidates(view: PlayerView): (number | null)[] {
  if (view.friend !== null) return [view.friend];
  const declaration = view.friendDeclaration;
  if (view.friendRevealed || declaration === null) return [null];
  if (declaration.kind === "none") return [null];
  if (declaration.kind === "player") return [declaration.seat];
  const others = view.players.filter(
    (s) => s !== view.seat && s !== view.declarer,
  );
  // 내가 주공이 아닌데 프렌드 카드가 내 손에 없으면 나는 프렌드가 아니다(그러면 view.friend가 나다).
  return others.length > 0 ? others : [null];
}

/**
 * 조커콜 카드로 선을 잡았을 때, 조커콜을 하면 어떻게 될지 어림한다. 중수가 쓰는 가벼운 어림이다.
 *
 * - 조커가 어디 있는지: 아직 안 나왔고 내 손에도 없으면, 남은 카드 장수에 비례해 다른 자리나 바닥에 있다고 본다.
 *   앞선 조커콜에 다른 카드를 낸 사람에게는 없다. 조커를 프렌드로 불렀으면 프렌드가 가졌다.
 * - 편: 아는 만큼만 쓴다(`relationTo`). 프렌드가 아직 안 드러났으면 프렌드일 수 있는 자리마다 똑같이 나눠 본다.
 * - 턴을 누가 먹는지: 조커를 낸 사람을 뺀 나머지(나는 낮은 조커콜 카드로 선이라 뺀다)가 먹을 기회를 나눠 갖되,
 *   주공은 기루다가 많아 두 몫으로 본다.
 * - 조커콜에 마이티로 막을 수 있는 규칙이면, 조커를 가진 사람이 마이티도 가졌을 만큼은 마이티로 막는다고 본다.
 */
export function jokerCallChance(view: PlayerView): JokerCallChance {
  const none: JokerCallChance = {
    effective: 0,
    lostTrick: 0,
    ownJoker: 0,
    noJoker: 1,
  };
  if (view.jokerUsed || view.hand.some(isJoker)) return none;
  if (view.discarded?.some(isJoker)) return none;

  const kiruda = view.goal?.kiruda ?? "NT";
  const mighty = mightyOf(view.rules, kiruda);
  const seen = seenCards(view);
  const unseen = deckFor(view.rules).filter((c) => !seen.has(c));
  const others = view.players.filter((s) => s !== view.seat);
  // 선을 잡을 때는 모두 같은 장수다. 시뮬레이션 화면처럼 장수가 없으면 내 손 장수로 본다.
  const countOf = (s: number) => view.handCounts?.[s] ?? view.hand.length;
  const held = others.reduce((sum, s) => sum + countOf(s), 0);
  const kitty = Math.max(0, unseen.length - held);
  const noJoker = seatsWithoutJoker(view);
  const jokerFriend =
    view.friendDeclaration?.kind === "card" &&
    view.friendDeclaration.card === "JK";
  const mightyHidden = view.rules.mightyOverridesJokerCall && !seen.has(mighty);

  const friends = friendCandidates(view);
  const total: JokerCallChance = {
    effective: 0,
    lostTrick: 0,
    ownJoker: 0,
    noJoker: 0,
  };
  for (const friend of friends) {
    const share = 1 / friends.length;
    // 이 가정에서 자리마다 우리 편인가
    const ally = (s: number) => {
      const r = relationTo(view, s);
      if (r === "partner") return true;
      if (r === "opponent") return false;
      const meRuling = view.seat === view.declarer || view.friend === view.seat;
      const sRuling = s === view.declarer || s === friend;
      return meRuling === sRuling;
    };
    // 조커가 있을 법한 곳과 무게
    const holders: { seat: number; weight: number }[] = [];
    if (jokerFriend && friend !== null && friend !== view.seat)
      holders.push({ seat: friend, weight: 1 });
    else {
      for (const s of others)
        if (!noJoker.has(s)) holders.push({ seat: s, weight: countOf(s) });
      if (!jokerFriend && !view.discarded && kitty > 0)
        holders.push({ seat: -1, weight: kitty });
    }
    const weightSum = holders.reduce((sum, h) => sum + h.weight, 0);
    if (weightSum === 0) {
      total.noJoker += share;
      continue;
    }
    for (const { seat, weight } of holders) {
      const p = (share * weight) / weightSum;
      if (seat < 0) {
        total.noJoker += p;
        continue;
      }
      if (ally(seat)) {
        total.ownJoker += p;
        continue;
      }
      // 조커를 가진 사람이 마이티도 가졌으면 마이티로 막고 그 턴을 먹는다.
      const blocks =
        mightyHidden && unseen.length > 1
          ? Math.max(0, countOf(seat) - 1) / (unseen.length - 1)
          : 0;
      const rivals = others.filter((s) => s !== seat);
      const strength = (s: number) => (s === view.declarer ? 2 : 1);
      const all = rivals.reduce((sum, s) => sum + strength(s), 0);
      const ours = rivals.filter(ally).reduce((sum, s) => sum + strength(s), 0);
      const win = all > 0 ? (ours / all) * (1 - blocks) : 0;
      total.effective += p * win;
      total.lostTrick += p * (1 - win);
    }
  }
  return total;
}
