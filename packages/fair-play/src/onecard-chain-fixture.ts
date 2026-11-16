/**
 * 덱 사슬을 끝까지 잇는 판 끝 검증 시험(`onecard-chain*.test.ts`, docs/42 4-2 「판 끝에 사슬 잇기」)이 같이 쓰는
 * 도우미. 한 판에서 세 번 다시 섞는다. 기기 둘(방장 0, 참가자 1), 게임이 쓰는 군 r255, 8장 덱(손패 2·2,
 * 처음 펼친 카드 판 자리 4, 더미 5·6·7). 판 하나에 1초 남짓 걸려 시험 파일을 나눠 동시에 돌린다.
 *
 * 조각 0(8장) → 1번이 더미 석 장을 먹고 낸다 → 버린 더미 [4,5,6,7]에서 맨 위를 뺀 [4,5,6]이 조각 1(판 자리 8~10)
 * → 0번이 먹고 낸다 → [7,8,9]가 조각 2(11~13) → 1번이 먹고 낸다 → [10,11,12]가 조각 3(14~16)
 * → 0번이 두 장 먹고 한 장을 모두에게 펼친다. 카드는 섞기로 정해지지만 자리 번호와 차례는 언제나 같다.
 */
import type { Card } from "@game/mighty-engine";

import type { Incident } from "./coordinator";
import type { FairDevice } from "./device";
import { passWaits } from "./device-fixture";
import {
  type OnecardNet,
  onecardNet,
  TOY_SPEC,
  type ToyAction,
} from "./onecard-fixture";
import {
  checkOnecardReplay,
  type OnecardDraw,
  type OnecardLogged,
  type OnecardRoundDeal,
  onecardDealId,
} from "./onecard-table";

/** 세 번째 다시 섞기(조각 3)의 기기 판 번호 */
export const SEG3 = onecardDealId(1, 3);

/** 정직한 판의 기록 길이와, 세 번째 다시 섞기가 일어나는 걸음(0번이 두 장 먹기) */
export const HONEST_LOG_LENGTH = 14;
export const THIRD_RESHUFFLE_STEP = 12;

export interface Played {
  net: OnecardNet;
  /** 조각 k 다시 섞기에 쓴 버린 더미(맨 위 뺀 것, 진짜 카드) */
  pools: Card[][];
  log: OnecardLogged<ToyAction>[];
}

/**
 * 한 판을 세 번 다시 섞으며 끝까지 두고 모든 열쇠를 공개한 뒤 증명 기다리기까지 다 지나게 한다. `third`가 있으면
 * 세 번째 다시 섞기에 방장이 알릴 카드(`all`: 모두에게, `own`: 방장 사슬만)를 바꾼다. `before3`은 세 번째 다시
 * 섞기 바로 앞에 부른다
 */
export async function playRound(
  options: {
    net?: OnecardNet;
    third?: (pool: Card[], top: Card) => { all?: Card[]; own?: Card[] };
    before3?: () => void;
  } = {},
): Promise<Played> {
  const net = options.net ?? onecardNet();
  const [host, guest] = net.decks as [
    OnecardNet["decks"][0],
    OnecardNet["decks"][0],
  ];
  const pub = (g: number) => host.publicCards(1).get(g) as Card;
  const pools: Card[][] = [];
  const log: OnecardLogged<ToyAction>[] = [];
  /** `device`가 더미 석 장을 먹고 모두 낸다 */
  const drawAndPlay = async (device: number, first: number) => {
    const globals = [first, first + 1, first + 2];
    if (net.draw(device, 3) !== 3) throw new Error("더미 석 장을 못 열었다");
    await net.settle();
    net.play(device, globals);
    await net.settle();
    log.push({ seat: device, action: { type: "draw", n: 3 } });
    for (const g of globals)
      log.push({ seat: device, action: { type: "play", card: pub(g) } });
  };
  await net.settle();
  await drawAndPlay(1, 5);
  pools.push([4, 5, 6].map(pub));
  net.reshuffle(1, pools[0] as Card[]);
  await drawAndPlay(0, 8);
  pools.push([7, 8, 9].map(pub));
  net.reshuffle(2, pools[1] as Card[]);
  await drawAndPlay(1, 11);
  pools.push([10, 11, 12].map(pub));
  options.before3?.();
  const change = options.third?.(pools[2] as Card[], pub(13)) ?? {};
  const all = change.all ?? (pools[2] as Card[]);
  host.reshuffle(1, 3, change.own ?? all);
  guest.reshuffle(1, 3, all);
  const n = net.draw(0, 2);
  log.push({ seat: 0, action: { type: "draw", n } });
  if (host.remaining(1) > 0) {
    net.draw(-1, 1);
    log.push({ seat: 0, action: { type: "flip" } });
  }
  await net.settle();
  for (const d of net.decks) d.revealAll(1);
  // 카드가 없는 기기가 미뤄 둔 증명(PROOF_DEFER_MS)과 응답 기다리기가 하나씩 그 시각에 지나게 한다.
  await passWaits(net);
  return { net, pools, log };
}

/** 그 기기 판의 섞기 증명 확인 결과(남의 섞기마다 하나) */
export async function shuffleChecks(
  d: FairDevice,
  deal: number,
): Promise<boolean[]> {
  const ctx = (
    d as unknown as {
      deals: Map<
        number,
        { shuffles: Map<string, { checked: Map<number, Promise<boolean>> }> }
      >;
    }
  ).deals.get(deal);
  return Promise.all(ctx?.shuffles.get("0:shuffle")?.checked.values() ?? []);
}

/** 확정된(누군지 확인하는 중이 아닌) 마지막 알림 */
export const settled = (list: Incident[] | undefined) =>
  (list ?? []).filter((i) => !i.pending).at(-1);

/** 판 끝 검증(게임 끝: 기록 끝까지, 모든 조각을 잇는다) */
export const audit = (
  log: readonly OnecardLogged<ToyAction>[],
  deal: OnecardRoundDeal,
  asked: readonly OnecardDraw[],
) =>
  checkOnecardReplay(
    TOY_SPEC,
    null,
    0,
    log,
    new Map([[1, deal]]),
    { of: () => asked, deviceOf: (seat: number) => seat },
    { complete: true },
  );
