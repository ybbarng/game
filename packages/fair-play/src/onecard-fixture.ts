/** 원카드 멘탈 포커 시험이 같이 쓰는 도우미: 작은 덱, 기기 둘, 장난감 엔진 */
import type { Card } from "@game/mighty-engine";

import type { Incident } from "./coordinator";
import type { FairDevice, FairWire } from "./device";
import { network, type TestNetwork } from "./device-fixture";
import {
  OnecardDeck,
  type OnecardFairSpec,
  type OnecardPreset,
  type OnecardStep,
} from "./onecard-table";
import { COLOR_JOKER } from "./protocol";

/**
 * 시험 덱 8장(두 조커 포함). 손패 두 장씩, 처음 펼칠 카드 한 장, 더미 석 장(자리 5·6·7).
 * 섞기·가리기·열기·다시 섞기 규칙은 덱 크기와 상관없어 작게 본다(54장 시간은 bench가 잰다)
 */
export const SMALL_DECK: readonly Card[] = [
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "JK",
  COLOR_JOKER,
];
export const HANDS = [2, 2] as const;

export interface OnecardNet extends TestNetwork {
  decks: OnecardDeck[];
  incidents: Incident[][];
  /** 방장(0번)이 더미를 열고 참가자(1번)도 같은 알림을 받는다 */
  draw(to: number, n: number): number;
  /** 방장이 다시 섞기를 알리고 참가자도 같은 알림을 받는다 */
  reshuffle(segment: number, cards: readonly Card[]): void;
  /** `device` 기기가 판 자리 `globals`의 카드를 낸다(그 자리 열쇠를 공개한다) */
  play(device: number, globals: readonly number[]): void;
}

/**
 * 기기 둘(방장 0, 참가자 1)을 잇고 1판을 섞어 나눈다. 자리 번호 = 기기 번호.
 * `drop`은 보내지 않을 메시지(시험이 붙잡았다가 나중에 `receive`로 넣어 순서를 바꾼다)
 */
export function onecardNet(
  options: { drop?: (message: FairWire, from: number) => boolean } = {},
): OnecardNet {
  const net = network([0, 1], options);
  const incidents: Incident[][] = [[], []];
  const decks = net.devices.map(
    (device: FairDevice, i) =>
      new OnecardDeck({
        device,
        devices: [0, 1],
        deviceOf: (seat) => seat,
        onIncident: (x) => incidents[i]?.push(x),
        cards: SMALL_DECK,
        clock: net.clock,
      }),
  );
  const [host, guest] = decks as [OnecardDeck, OnecardDeck];
  for (const d of decks) d.beginRound(1, HANDS);
  return {
    ...net,
    decks,
    incidents,
    draw(to, n) {
      const drawn = host.draw(1, to, n);
      for (const r of drawn) guest.request(r.deal, r.slot, r.to);
      return drawn.length;
    },
    reshuffle(segment, cards) {
      for (const d of decks) d.reshuffle(1, segment, cards);
    },
    play(device, globals) {
      const deck = decks[device] as OnecardDeck;
      const byDeal = new Map<number, number[]>();
      for (const g of globals) {
        const at = deck.locate(1, g);
        if (!at) throw new Error(`판 자리 ${g}가 없다`);
        byDeal.set(at.deal, [...(byDeal.get(at.deal) ?? []), at.slot]);
      }
      for (const [deal, slots] of byDeal)
        deck.device.reveal(deal, slots, "play");
    },
  };
}

/* ---------- 장난감 원카드 엔진: 내기·뽑기·펼치기만(판 끝 검증 시험용) ---------- */

export interface ToyState {
  round: number;
  hands: string[][];
  /** 버린 더미(끝이 맨 위) */
  discard: string[];
  deck: string[];
  reshuffles: number;
  refill: string[] | null;
  preset: OnecardPreset | null;
}

export type ToyAction =
  | { type: "play"; card: string }
  | { type: "draw"; n: number }
  | { type: "flip" }
  /** 판을 끝내고 다음 판으로. `n`이 있으면 먼저 그만큼 뽑는다(먹다가 파산해 판이 끝나는 걸음 흉내) */
  | { type: "end"; n?: number };

export type ToyEvent = { type: "draw"; seat: number | null };

function deal(round: number, preset: OnecardPreset): ToyState {
  return {
    round,
    hands: preset.hands.map((h) => [...h]),
    discard: [...preset.open],
    deck: [...preset.deck],
    reshuffles: 0,
    refill: null,
    preset: null,
  };
}

/** 한 장 뽑는다. 더미가 비면 넣어 둔 새 더미로 다시 섞는다(없으면 던진다: 아직 모르는 더미) */
function drawOne(s: ToyState): string {
  if (s.deck.length === 0) {
    if (!s.refill) throw new Error("다시 섞은 더미를 모른다");
    s.deck = [...s.refill];
    s.discard = s.discard.slice(-1);
    s.reshuffles += 1;
    s.refill = null;
  }
  return s.deck.shift() as string;
}

export const TOY_SPEC: OnecardFairSpec<null, ToyState, ToyAction, ToyEvent> = {
  createMatch: (_rules, _seed, preset) => ({
    state: deal(1, preset),
    events: [],
  }),
  step(state, seat, action): OnecardStep<ToyState, ToyEvent> {
    const s: ToyState = JSON.parse(JSON.stringify(state)) as ToyState;
    const hand = s.hands[seat];
    if (!hand) return { ok: false, error: "없는 자리" };
    const events: ToyEvent[] = [];
    switch (action.type) {
      case "play": {
        const i = hand.indexOf(action.card);
        if (i < 0) return { ok: false, error: "손에 없는 카드" };
        hand.splice(i, 1);
        s.discard.push(action.card);
        break;
      }
      case "draw":
        for (let k = 0; k < action.n; k++) {
          hand.push(drawOne(s));
          events.push({ type: "draw", seat });
        }
        break;
      case "flip": {
        // 뽑다가 다시 섞으면 버린 더미 배열이 바뀌니 먼저 뽑는다.
        const card = drawOne(s);
        s.discard.push(card);
        events.push({ type: "draw", seat: null });
        break;
      }
      case "end":
        for (let k = 0; k < (action.n ?? 0); k++) {
          hand.push(drawOne(s));
          events.push({ type: "draw", seat });
        }
        if (!s.preset) throw new Error("다음 판 패를 모른다");
        return { ok: true, state: deal(s.round + 1, s.preset), events };
    }
    return { ok: true, state: s, events };
  },
  roundOf: (s) => s.round,
  withPreset: (s, preset) => ({ ...s, preset }),
  withRefill: (s, deck) => ({ ...s, refill: deck ? [...deck] : null }),
  reshufflesOf: (s) => s.reshuffles,
  reshufflePool: (s) => s.discard.slice(0, -1),
  drawsOf: (events) => events.map((e) => e.seat),
};
