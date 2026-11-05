import {
  BANK,
  cardById,
  type GalaxyBoard,
  type GameEvent,
} from "@game/galaxy-engine";

import { money, SEASON_NAMES, squareName } from "./format";

/**
 * 별 사실 공문(2·3·4·8·10·12)과 별자리 선 측량(16)에서 해당하는 별이 없어 0이 됐을 때 붙이는 말. 그 밖은 null
 */
export function cardNoMatch(
  cardId: number,
  squares: readonly number[],
): string | null {
  if (squares.length > 0) return null;
  if (cardId === 16) return "해당 별자리 없음";
  return cardById(cardId).fact !== null ? "해당 별 없음" : null;
}

/**
 * 사건 한 줄(오른쪽 「기록」 칸·다시 보기). 돈이 누구에게서 누구에게 왜 갔는지를 보인다(docs/48 13절 1번).
 * 화면에 남길 것이 없는 사건(약속·공개·차례 시작 등)은 null
 */
export function eventLine(
  e: GameEvent,
  board: GalaxyBoard,
  name: (seat: number) => string,
): string | null {
  const who = (seat: number) => (seat === BANK ? "우주국" : name(seat));
  switch (e.type) {
    case "pay": {
      const about = e.square !== undefined ? squareName(board, e.square) : "";
      switch (e.reason) {
        case "rent":
          return `${who(e.from)} → ${who(e.to)} · ${about} 이용료 ${money(e.amount)}`;
        case "salary":
          return `${who(e.to)} · 우주국 지원금 ${money(e.amount)}`;
        case "observatory":
          return `${who(e.to)} · 관측 지원금 ${money(e.amount)}`;
        case "fine":
          return `${who(e.from)} · 소행성대를 나가며 ${money(e.amount)}`;
        case "card":
          return e.from === BANK
            ? `${who(e.to)} · 공문으로 ${money(e.amount)} 받음`
            : e.to === BANK
              ? `${who(e.from)} · 공문으로 ${money(e.amount)} 냄`
              : `${who(e.from)} → ${who(e.to)} · 공문 ${money(e.amount)}`;
        case "build":
          return `${who(e.from)} · ${about} 정거장 ${money(e.amount)}`;
        case "sell":
          return `${who(e.to)} · ${about} 정거장 내림 ${money(e.amount)}`;
        case "mortgage":
          return `${who(e.to)} · ${about} 맡김 ${money(e.amount)}`;
        case "unmortgage":
          return `${who(e.from)} · ${about} 되찾음 ${money(e.amount)}`;
        case "trade":
          return `${who(e.from)} → ${who(e.to)} · 거래 ${money(e.amount)}`;
        case "bankrupt":
          return `${who(e.from)} → ${who(e.to)} · 남은 별빛 ${money(e.amount)}`;
        // 사기·입찰은 아래 bought·auctionEnded 줄이 함께 말한다.
        default:
          return null;
      }
    }
    case "bought":
      return `${name(e.seat)} · ${squareName(board, e.square)} 샀어요 ${money(e.price)}`;
    case "auctionEnded":
      return e.result.winner === null
        ? `봉투 입찰 · ${squareName(board, e.result.square)} · 아무도 내지 않음`
        : `봉투 입찰 · ${name(e.result.winner)} ${squareName(board, e.result.square)} ${money(e.result.price)}`;
    case "observed":
      return e.amount > 0
        ? null
        : `${name(e.seat)} · 관측지 · 자산 1위라 관측 지원금 없음`;
    case "card": {
      const none = cardNoMatch(e.card, e.squares);
      return `${name(e.seat)} · 공문 「${cardById(e.card).title}」${none ? ` · ${none}` : ""}`;
    }
    case "linked": {
      const group = board.groups[e.group]?.ko ?? "";
      return e.owned >= e.size
        ? `${name(e.seat)} · ${group} 완성`
        : `${name(e.seat)} · ${group} 선 하나 이어짐`;
    }
    case "built":
      return `${name(e.seat)} · ${squareName(board, e.square)} ${e.level >= 4 ? "큰 정거장" : `정거장 ${e.level}단`}`;
    case "sold":
      return `${name(e.seat)} · ${squareName(board, e.square)} 정거장 ${e.level}단으로 내림`;
    case "mortgaged":
      return `${name(e.seat)} · ${squareName(board, e.square)} 우주국에 맡김`;
    case "unmortgaged":
      return `${name(e.seat)} · ${squareName(board, e.square)} 되찾음`;
    case "jailed":
      return `${name(e.seat)} · 소행성대에 걸림`;
    case "freed":
      return e.by === "fine" ? null : `${name(e.seat)} · 소행성대를 나감`;
    case "tradeAccepted":
      return `${name(e.offer.from)} ↔ ${name(e.offer.to)} · 거래 성사`;
    case "tradeRejected":
      return `${name(e.offer.to)} · 거래 거절`;
    case "bankrupt":
      return `${name(e.seat)} · 운항 중단`;
    case "seasonChanged":
      return `${SEASON_NAMES[e.season] ?? ""} 하늘이 떠올랐어요`;
    case "meteorShower":
      return "유성우의 밤 · 판 끝까지 이용료 2배";
    case "timeUp":
      return "시간이 다 됐어요 · 모두 이번 차례를 마치면 끝나요";
    default:
      return null;
  }
}
