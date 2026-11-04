/**
 * 공정한 동시 판정 2층: 반응 시간 겨루기(docs/43 7-2, docs/42 17절). 방장 발표와 참가자 확인이 **같은 함수**로
 * 인정 반응 시간과 순서를 계산한다(어긋나면 이의).
 *
 * - 인정 반응 시간 = max(보고 rt, 아래 경계, 사람 하한). 아래 경계는 `claimBound`(docs/43 1-2)에 왕복 최소를
 *   보정 상한 `MAX_LATENCY_CREDIT_MS`로 자른 값을 넣는다. 경계를 어긴 청구는 버리지 않고 늘려 인정한다.
 * - 순서: 먼저 본 판 → 인정 rt. 맨 앞과 공정 창 X 안이면 동점 묶음이고, 묶음 안에서는 본인(그 판에서 한 장이던 사람)이 먼저,
 *   잡는 사람끼리는 함께 뽑기(`jointTiebreak`)로 가른다.
 *
 * 판정 자료는 방 안에만 있다. 서버·`/diag`로 보내지 않고, `getStats`는 쓰지 않는다(docs/43 0-1).
 */

import type { ClaimMessage } from "./claim";
import { claimBound } from "./claim-bound";
import { type JointOutcome, jointTiebreak } from "./joint-random";

/**
 * 보정 상한 C(ms). 청구 경계에 넣는 왕복 최소를 이 값으로 자른다. 핑 답을 늦춰 망이 느린 척해도 얻는 이득이 C를 넘지 못하고,
 * 정직한 사람은 실제 왕복이 C 안이면 손해가 없다(넘으면 넘는 만큼 앞섬을 잃을 뿐 벌칙은 없다).
 * 느린 척은 진짜 느린 망과 구별할 수 없어 지울 수 없고, C로 이득을 묶는다
 */
export const MAX_LATENCY_CREDIT_MS = 150;

/** 흔들림 + 그리기 여유(ms). 경계에서 이만큼은 봐준다(거짓 보고가 남길 수 있는 몫이기도 하다) */
export const RACE_SLACK_MS = 50;

/** 참가자가 방장 발표의 반응 시간을 확인할 때 더 봐주는 여유(ms). 정직한 방장을 망 흔들림으로 짚지 않게 */
export const RACE_CHECK_MARGIN_MS = 100;

/** 방장이 첫 청구를 받은 뒤 기다리는 시간의 아래·위 상한과 왕복에 더하는 여유(ms) */
export const RACE_GATHER = { minMs: 120, maxMs: 600, marginMs: 80 } as const;

/** 왕복 표본이 없을 때 모으는 시간(ms) */
export const RACE_GATHER_DEFAULT_MS = 300;

/** 게임이 채우는 2층 값(`KitClaims.race`) */
export interface ClaimRaceSpec<Board = unknown> {
  /** 그 판(`seen`)에서 이 청구를 낸 자리가 본인(한 장이던 사람)인가. 모두에게 같은 공개 판으로 정한다 */
  isOwner(board: Board, claim: ClaimMessage): boolean;
  /** 사람 반응 하한(ms). 이보다 짧은 보고는 이 값으로 인정한다(동점 구역) */
  floorMs: number;
  /** 공정 창 X(ms) */
  tieMs: number;
  /** 누름에서 청구를 보내기까지 늘 걸리는 시간(ms, 원카드 누르고 있기 확인). 경계에서 뺀다 */
  sendDelayMs: number;
}

/** 방장 발표에 싣는 2층 자료(`ClaimsResolved.race`) */
export interface ClaimRaceInfo {
  /** 항목마다 인정 반응 시간(ms, `entries`와 같은 차례) */
  rt: number[];
}

/**
 * 방장이 손님 청구의 인정 반응 시간을 정한다. `elapsedMs` = 청구가 방장에게 닿은 시각 − 방장이 그 판을 낸 시각.
 * `rttMinMs`는 그 손님과 방 안 앱 핑으로 잰 왕복 최소(없으면 null → 상한 C로 본다)
 */
export function allowedRt(input: {
  rtMs: number | undefined;
  elapsedMs: number | null;
  rttMinMs: number | null;
  spec: Pick<ClaimRaceSpec, "floorMs" | "sendDelayMs">;
  slackMs?: number;
}): number {
  const reported = input.rtMs ?? 0;
  const credit = Math.min(
    input.rttMinMs ?? MAX_LATENCY_CREDIT_MS,
    MAX_LATENCY_CREDIT_MS,
  );
  const bound =
    input.elapsedMs === null
      ? reported
      : claimBound({
          elapsedMs: input.elapsedMs - input.spec.sendDelayMs,
          rttMinMs: credit,
          rtReportedMs: reported,
          slackMs: input.slackMs ?? RACE_SLACK_MS,
        }).allowedRtMs;
  return Math.round(Math.max(bound, reported, input.spec.floorMs));
}

export interface RaceItem {
  claim: ClaimMessage;
  /** 인정 반응 시간 */
  rt: number;
  /** 그 판의 본인인가 */
  owner: boolean;
}

/** 잡는 사람끼리 동점 묶음의 순서: 동점인 청구의 아이디를 비밀 값으로 함께 뽑는다(모든 기기가 같은 재료로 같은 값) */
async function drawCatchers(
  group: RaceItem[],
  label: string,
): Promise<RaceItem[]> {
  const bySeat = new Map<number, RaceItem[]>();
  for (const item of group) {
    const list = bySeat.get(item.claim.seat) ?? [];
    list.push(item);
    bySeat.set(item.claim.seat, list);
  }
  const seats = [...bySeat.keys()].sort((a, b) => a - b);
  if (seats.length < 2) return group;
  const outcome: JointOutcome = {
    scope: "claim-race",
    honest: seats,
    faulted: [],
    secrets: seats.map((s) =>
      (bySeat.get(s) ?? [])
        .map((i) => i.claim.claimId)
        .sort()
        .join("."),
    ),
    fallback: false,
  };
  const order = await jointTiebreak(outcome, seats, label);
  return order.flatMap((s) => bySeat.get(s) ?? []);
}

/**
 * 겨루기 순서(엔진 `raceOrder`와 같은 규칙). 잡는 사람끼리 동점이 없으면 함께 뽑기 없이 바로 끝난다.
 * `label`은 묶음 번호(같은 청구라도 묶음마다 다른 뽑기)
 */
export async function raceArrange(
  items: readonly RaceItem[],
  tieMs: number,
  label: string,
): Promise<RaceItem[]> {
  const left = items
    .map((item, i) => ({ item, i }))
    .sort(
      (a, b) =>
        a.item.claim.seen - b.item.claim.seen ||
        a.item.rt - b.item.rt ||
        (a.item.claim.claimId < b.item.claim.claimId ? -1 : 1) ||
        a.i - b.i,
    )
    .map((x) => x.item);
  const out: RaceItem[] = [];
  let g = 0;
  while (left.length > 0) {
    const head = left[0] as RaceItem;
    const group = left.filter(
      (x) => x.claim.seen === head.claim.seen && x.rt <= head.rt + tieMs,
    );
    for (const x of group) left.splice(left.indexOf(x), 1);
    const owners = group.filter((x) => x.owner);
    const catchers = group.filter((x) => !x.owner);
    out.push(
      ...owners,
      ...(catchers.length > 1
        ? await drawCatchers(catchers, `${label}:${g}`)
        : catchers),
    );
    g++;
  }
  return out;
}
