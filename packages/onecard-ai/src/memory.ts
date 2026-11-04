/*
 * 컴퓨터의 기억(docs/42 13절). 화면(`viewOf`)은 누가 외쳤는지·창이 열렸는지를 숨긴다(B안 6번).
 * 사람은 외침 소리·말풍선과 손패 장 수를 보고 기억하므로, 컴퓨터도 모두에게 똑같이 가는 사건만 보고 기억한다.
 * 남의 손패·창은 보지 않는다(공정).
 *
 * - 한 장 상태: 외치지 않은 채 한 장이 된 자리(잡을 거리), 외친 자리, 미리 외친 자리
 * - 없는 무늬: 공격 없이 먹은 자리는 그때 맞출 무늬가 손에 없었다고 짐작한다(고수가 쓴다)
 *
 * 컴퓨터 자리마다 하나씩 두고, 받아들인 행동마다 `observe`로 사건과 그 뒤 화면(과 지금 시각)을 넣는다.
 *
 * 외침 소리(`shouted` 사건)에는 자리만 있어, 엔진이 받은 본인 외침과 본인 시간 P가 지나 받지 않은
 * 늦은 본인 외침(`lateSelf`, 그 사람은 여전히 잡힌다)이 같아 보인다. 사람이 "한 장이 된 지 얼마 만에
 * 외쳤나"로 알아채듯, 시각을 받으면 한 장이 된 때부터 P(+여유) 안의 외침만 안전으로 본다.
 * 시각이 없으면 예전처럼 모두 안전으로 본다(잘못 잡아 헛외침 벌칙을 받는 쪽보다 놓치는 쪽이 낫다).
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

/**
 * 본인 시간 P를 넘긴 외침도 이만큼까지는 받아들여졌다고 본다(ms). 사건이 닿는 시각과 방장이 잰 시각의
 * 차이를 덮는다. 받지 않은 외침을 안전으로 보면 잡을 사람을 놓칠 뿐이지만, 받은 외침을 잡을 거리로 보면
 * 헛외침 벌칙을 받으므로 넉넉히 둔다
 */
export const SELF_GRACE_MS = 300;

export interface OnecardMemory {
  seat: number;
  /** 본인 시간 P(ms, 규칙) */
  selfWindowMs: number;
  /** o2 겨루기 규칙(본인 시간·미리 외침이 없다. 한 장인 사람의 외침은 늘 받아들여졌거나 잡혔다) */
  race: boolean;
  /** 지난 화면의 판 모양(먹은 까닭을 짐작할 때 쓴다) */
  counts: number[];
  turn: number;
  suit: Suit | null;
  attack: number;
  marks: OneCardMark[];
  /** 한 장 상태가 바뀔 때마다 새 번호(같은 상황에 외침 계획을 한 번만 세운다) */
  markIds: number[];
  nextMarkId: number;
  /** 외치지 않은 채 한 장이 된 시각(ms). 시각을 받지 않았으면 null */
  exposedAt: (number | null)[];
  /** 외치지 않은 채 한 장이 된 판 번호(o2 겨루기 누름의 `seen`). 모르면 null */
  exposedTurn: (number | null)[];
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
    selfWindowMs: view.rules.selfWindowMs,
    race: view.rules.race === true,
    counts: [...view.handCounts],
    turn: view.turn,
    suit: view.suit,
    attack: view.attack,
    marks: new Array<OneCardMark>(n).fill("none"),
    markIds: new Array<number>(n).fill(0),
    nextMarkId: 1,
    exposedAt: new Array<number | null>(n).fill(null),
    exposedTurn: new Array<number | null>(n).fill(null),
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

function onPlayed(
  memory: OnecardMemory,
  seat: number,
  card: OnecardCard,
  now: number | undefined,
  turnNo: number,
) {
  const count = (memory.counts[seat] ?? 1) - 1;
  memory.counts[seat] = count;
  if (count === 1 && memory.marks[seat] !== "pre") {
    setMark(memory, seat, "exposed");
    memory.exposedAt[seat] = now ?? null;
    memory.exposedTurn[seat] = turnNo;
  } else setMark(memory, seat, count === 1 ? "safe" : "none");
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

/** 외치지 않은 한 장짜리의 외침을 엔진이 본인 외침으로 받았다고 볼 수 있나(본인 시간 P 안) */
function selfAccepted(
  memory: OnecardMemory,
  seat: number,
  now: number | undefined,
): boolean {
  const since = memory.exposedAt[seat];
  // o2: 본인 시간이 없다. 한 장인 사람의 외침이 들렸으면 이긴 것이다(졌으면 잡힘·먹음 사건이 같이 온다)
  if (memory.race) return true;
  if (now === undefined || since === null || since === undefined) return true;
  // P가 0이면 창이 처음부터 잡기 창이라 본인 외침은 늘 받지 않는다
  if (memory.selfWindowMs === 0) return false;
  return now - since <= memory.selfWindowMs + SELF_GRACE_MS;
}

function onShouted(
  memory: OnecardMemory,
  seat: number,
  now: number | undefined,
) {
  const mark = memory.marks[seat];
  if (mark === "exposed") {
    // 받지 않은 늦은 본인 외침이면 그대로 잡을 거리다
    if (selfAccepted(memory, seat, now)) setMark(memory, seat, "safe");
  } else if (
    !memory.race &&
    mark !== "pre" &&
    seat === memory.turn &&
    memory.counts[seat] === 2
  )
    setMark(memory, seat, "pre");
}

/**
 * 받아들인 행동 하나의 사건과 그 뒤 내 화면을 기억에 넣는다.
 * `now`: 그 행동이 받아들여진 시각(ms, 방장 시계든 받은 시각이든 한 판 안에서 같은 시계). 없으면 시간을 따지지 않는다
 */
export function observe(
  memory: OnecardMemory,
  events: readonly GameEvent[],
  view: OnecardView,
  now?: number,
): void {
  for (const event of events) {
    switch (event.type) {
      case "played":
        onPlayed(memory, event.seat, event.card, now, view.turnNo);
        memory.suit = event.suit;
        memory.attack = event.attack;
        break;
      case "drew":
        onDrew(memory, event.seat, event.count, event.reason);
        break;
      case "shouted":
        onShouted(memory, event.seat, now);
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
