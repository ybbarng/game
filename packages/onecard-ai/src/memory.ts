/*
 * 컴퓨터의 기억(docs/42 13절). 화면(`viewOf`)은 누가 외쳤는지·창이 열렸는지를 숨긴다(B안 6번).
 * 사람은 외침 소리·말풍선과 손패 장 수를 보고 기억하므로, 컴퓨터도 모두에게 똑같이 가는 사건만 보고 기억한다.
 * 남의 손패·창은 보지 않는다(공정).
 *
 * - 한 장 상태: 외치지 않은 채 한 장이 된 자리(잡을 거리), 외친 자리, 미리 외친 자리
 * - 없는 무늬: 공격 없이 먹은 자리는 그때 맞출 무늬가 손에 없었다고 짐작한다(고수가 쓴다)
 *
 * 컴퓨터 자리마다 하나씩 두고, 받아들인 행동마다 `observe`로 사건과 그 뒤 화면을 넣는다.
 */
import {
  type GameEvent,
  isJoker,
  type OnecardCard,
  type OnecardView,
  type Suit,
  suitOf,
} from "@game/onecard-engine";

/**
 * none: 한 장이 아니다(또는 다 냈다)
 * pre: 두 장인 자기 차례에 미리 외쳤다
 * safe: 한 장이고 외쳤다(미리 외침 포함)
 * exposed: 한 장인데 외치는 소리를 듣지 못했다(잡을 거리)
 */
export type OneCardMark = "none" | "pre" | "safe" | "exposed";

export interface OnecardMemory {
  seat: number;
  /** 지난 화면의 판 모양(먹은 까닭을 짐작할 때 쓴다) */
  counts: number[];
  turn: number;
  suit: Suit | null;
  attack: number;
  marks: OneCardMark[];
  /** 한 장 상태가 바뀔 때마다 새 번호(같은 상황에 외침 계획을 한 번만 세운다) */
  markIds: number[];
  nextMarkId: number;
  /** 자리별 없다고 짐작한 무늬 */
  voids: Suit[][];
  /** 자리별 조커가 없다고 짐작한다 */
  noJoker: boolean[];
  /** 없는 무늬를 짐작한 뒤 새로 받은 장 수(이 장들은 아무 카드일 수 있다) */
  fresh: number[];
  /** 이미 정한 외침 계획(`planShout`) */
  planned: Set<string>;
}

export function createMemory(view: OnecardView): OnecardMemory {
  const n = view.rules.players;
  return {
    seat: view.mySeat,
    counts: [...view.handCounts],
    turn: view.turn,
    suit: view.suit,
    attack: view.attack,
    marks: new Array<OneCardMark>(n).fill("none"),
    markIds: new Array<number>(n).fill(0),
    nextMarkId: 1,
    voids: Array.from({ length: n }, () => [] as Suit[]),
    noJoker: new Array<boolean>(n).fill(false),
    fresh: new Array<number>(n).fill(0),
    planned: new Set(),
  };
}

function setMark(memory: OnecardMemory, seat: number, mark: OneCardMark) {
  if (memory.marks[seat] === mark) return;
  memory.marks[seat] = mark;
  memory.markIds[seat] = memory.nextMarkId++;
}

function forgetVoids(memory: OnecardMemory, seat: number) {
  memory.voids[seat] = [];
  memory.noJoker[seat] = false;
  memory.fresh[seat] = 0;
}

function onPlayed(memory: OnecardMemory, seat: number, card: OnecardCard) {
  const count = (memory.counts[seat] ?? 1) - 1;
  memory.counts[seat] = count;
  if (count === 1)
    setMark(memory, seat, memory.marks[seat] === "pre" ? "safe" : "exposed");
  else setMark(memory, seat, "none");
  const suit = suitOf(card);
  if (suit)
    memory.voids[seat] = (memory.voids[seat] ?? []).filter((s) => s !== suit);
  if (isJoker(card)) memory.noJoker[seat] = false;
}

function onDrew(
  memory: OnecardMemory,
  seat: number,
  count: number,
  reason: string,
) {
  const suit = memory.suit;
  if (
    reason === "draw" &&
    seat === memory.turn &&
    memory.attack === 0 &&
    suit !== null
  ) {
    // 맞출 무늬가 손에 없어 먹었다고 짐작한다. 앞서 짐작한 무늬는 새로 받은 카드가 없을 때만 남긴다
    const kept =
      (memory.fresh[seat] ?? 0) === 0 ? (memory.voids[seat] ?? []) : [];
    memory.voids[seat] = [...new Set([...kept, suit])];
    memory.noJoker[seat] = true;
    memory.fresh[seat] = count;
  } else memory.fresh[seat] = (memory.fresh[seat] ?? 0) + count;
  if (reason === "attack") memory.attack = 0;
  memory.counts[seat] = (memory.counts[seat] ?? 0) + count;
  setMark(memory, seat, "none");
}

function onShouted(memory: OnecardMemory, seat: number) {
  const mark = memory.marks[seat];
  if (mark === "exposed") setMark(memory, seat, "safe");
  else if (mark !== "pre" && seat === memory.turn && memory.counts[seat] === 2)
    setMark(memory, seat, "pre");
}

/** 받아들인 행동 하나의 사건과 그 뒤 내 화면을 기억에 넣는다 */
export function observe(
  memory: OnecardMemory,
  events: readonly GameEvent[],
  view: OnecardView,
): void {
  for (const event of events) {
    switch (event.type) {
      case "played":
        onPlayed(memory, event.seat, event.card);
        memory.suit = event.suit;
        memory.attack = event.attack;
        break;
      case "drew":
        onDrew(memory, event.seat, event.count, event.reason);
        break;
      case "shouted":
        onShouted(memory, event.seat);
        break;
      case "finished":
      case "bankrupt":
        memory.counts[event.seat] = 0;
        setMark(memory, event.seat, "none");
        forgetVoids(memory, event.seat);
        break;
      default:
        break;
    }
  }
  // 화면과 맞춘다(장 수는 모두 보인다)
  memory.counts = [...view.handCounts];
  memory.turn = view.turn;
  memory.suit = view.suit;
  memory.attack = view.attack;
  view.handCounts.forEach((count, seat) => {
    if (count !== 1 && memory.marks[seat] !== "pre")
      setMark(memory, seat, "none");
    if (count === 0 || (memory.fresh[seat] ?? 0) >= count)
      forgetVoids(memory, seat);
  });
}
