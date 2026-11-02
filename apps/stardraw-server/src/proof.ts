import {
  entrantId,
  fromHex,
  type KeyTicketsResponse,
  makeRegistrationProof,
  makeTicketProof,
  merkleRoot,
  type RegistrationProof,
  registrationId,
  sortRegistrations,
  type TicketProof,
  toHex,
} from "@game/stardraw-core";

import { EntryError } from "./engine";
import type { Store } from "./store";

/**
 * 증명 API(docs/36 11-30 설계 1). 보통 기기는 응모권 전체를 받지 않고, 내 응모권이 그 회차 기록의 머클 루트에
 * 들어 있다는 증명만 받아 core `checkTicketProof`로 확인한다.
 *   GET /api/proof/{회차}/{응모권 id hex}             → TicketProof
 *   GET /api/keys/{공개 열쇠}/tickets?from={회차}      → KeyTicketsResponse(그 열쇠의 응모권 증명 + 등록 증명)
 * 닫힌 회차만 낸다(열린 회차의 응모권은 아직 루트가 없다).
 *
 * 남용 안전장치: 증명 하나는 그 회차 응모 수만큼의 해시(1천 장이면 약 2천 번, 1ms 안쪽)라 싸다.
 * 회차마다 정렬한 id를 최근 것 몇 개만 기억하고, 서버 전체로 초당 요청 수를 넉넉히 묶는다(토큰 통).
 * IP마다 세지 않는다: 회사·통신사 공유 IP 뒤 정상 사용자끼리 몫을 깎고, 공격자는 주소를 쉽게 바꾼다.
 * 통이 비면 503과 Retry-After를 낸다(화면은 기다렸다 다시 받는다, politeFetch). 닫힌 회차 응모권 증명은 바뀌지 않아 오래 캐시된다
 */

export interface ProofLimits {
  /** 서버 전체 초당 요청(채워지는 속도) */
  perSecond: number;
  /** 한꺼번에 받을 수 있는 요청(통 크기) */
  burst: number;
  /** 열쇠별 응모권 한 응답의 최대 장 수(넘으면 next로 잘라 낸다) */
  pageSize: number;
}

export const DEFAULT_PROOF_LIMITS: ProofLimits = {
  perSecond: 200,
  burst: 2000,
  pageSize: 500,
};

/** 기억할 회차 수(회차마다 정렬한 id. 1천 장 회차면 약 32KB) */
const CACHE_ROUNDS = 64;

export class ProofBusy extends EntryError {
  constructor(readonly retryAfter: number) {
    super("지금 증명 요청이 몰려 있습니다. 잠시 뒤 다시 받아 주세요", 503);
  }
}

export class ProofService {
  private tokens: number;
  private filledAt: number;
  private readonly ticketIds = new Map<number, Uint8Array[]>();
  private readonly regIds = new Map<number, Uint8Array[]>();

  constructor(
    private readonly store: Store,
    private readonly clock: { now(): number },
    private readonly limits: ProofLimits = DEFAULT_PROOF_LIMITS,
  ) {
    this.tokens = limits.burst;
    this.filledAt = clock.now();
  }

  /** 요청 하나를 받을 수 있는지(토큰 통). 없으면 ProofBusy */
  private take(): void {
    const now = this.clock.now();
    const add = ((now - this.filledAt) / 1000) * this.limits.perSecond;
    this.tokens = Math.min(this.limits.burst, this.tokens + add);
    this.filledAt = now;
    if (this.tokens < 1)
      throw new ProofBusy(Math.ceil((1 - this.tokens) / this.limits.perSecond));
    this.tokens -= 1;
  }

  private closed(round: number): boolean {
    return round >= 1 && round <= this.store.recordCount();
  }

  /** 그 회차 응모권 id(정렬). 처음 읽을 때 기록의 루트와 같은지 확인한다 */
  private idsOf(round: number): Uint8Array[] {
    const hit = this.ticketIds.get(round);
    if (hit) {
      this.ticketIds.delete(round);
      this.ticketIds.set(round, hit);
      return hit;
    }
    const record = this.store.record(round);
    if (!record) throw new EntryError("닫히지 않은 회차입니다", 404);
    const ids = this.store.entryIds(round).map(fromHex);
    if (toHex(merkleRoot(ids)) !== toHex(record.merkleRoot))
      throw new Error(`${round}회차 예측 목록이 기록의 머클 루트와 다르다`);
    remember(this.ticketIds, round, ids);
    return ids;
  }

  private regIdsOf(round: number): Uint8Array[] {
    const hit = this.regIds.get(round);
    if (hit) return hit;
    const record = this.store.record(round);
    if (!record) throw new EntryError("닫히지 않은 회차입니다", 404);
    const ids = sortRegistrations(this.store.registrations(round)).map(
      registrationId,
    );
    if (toHex(merkleRoot(ids)) !== toHex(record.registrationRoot))
      throw new Error(`${round}회차 등록 목록이 기록의 등록 루트와 다르다`);
    remember(this.regIds, round, ids);
    return ids;
  }

  /** 응모권 증명. 없는 응모권·열린 회차면 404 */
  ticket(round: number, idHex: string): TicketProof {
    this.take();
    if (!/^[0-9a-f]{64}$/.test(idHex))
      throw new EntryError("예측서 일련번호 형식이 맞지 않습니다");
    if (!this.closed(round))
      throw new EntryError("아직 닫히지 않은 회차입니다", 404);
    const found = this.store.entryById(idHex);
    if (!found || found.round !== round)
      throw new EntryError("그 회차에 없는 예측서입니다", 404);
    const record = this.store.record(round);
    const proof =
      record &&
      makeTicketProof(
        round,
        this.idsOf(round),
        found.ticket,
        record.merkleRoot,
      );
    if (!proof) throw new Error(`${round}회차 예측서 증명을 만들지 못했다`);
    return proof;
  }

  /** 한 열쇠의 응모권 증명(from 회차부터 닫힌 회차까지, 한 번에 pageSize장)과 등록 증명 */
  keyTickets(pub: Uint8Array, from = 1): KeyTicketsResponse {
    this.take();
    if (!Number.isInteger(from) || from < 1)
      throw new EntryError("from 회차가 맞지 않습니다");
    const who = toHex(entrantId(pub));
    const through = this.store.recordCount();
    const rows = this.store.entriesOf(
      who,
      from,
      through,
      this.limits.pageSize + 1,
    );
    const page = rows.slice(0, this.limits.pageSize);
    const tickets: TicketProof[] = [];
    for (const { round, ticket } of page) {
      const record = this.store.record(round);
      const proof =
        record &&
        makeTicketProof(round, this.idsOf(round), ticket, record.merkleRoot);
      if (!proof) throw new Error(`${round}회차 예측서 증명을 만들지 못했다`);
      tickets.push(proof);
    }
    let registration: RegistrationProof | null = null;
    const reg = this.store.registrationOf(who);
    if (reg && this.closed(reg.round)) {
      const record = this.store.record(reg.round);
      registration =
        (record &&
          makeRegistrationProof(
            reg.round,
            this.regIdsOf(reg.round),
            reg.registration,
            record.registrationRoot,
          )) ??
        null;
    }
    const next = rows.length > page.length ? rows.at(-1)?.round : undefined;
    return {
      v: 1,
      tickets,
      registration,
      through: next !== undefined ? next - 1 : through,
      ...(next !== undefined ? { next } : {}),
    };
  }
}

function remember<T>(cache: Map<number, T>, round: number, value: T): void {
  cache.set(round, value);
  while (cache.size > CACHE_ROUNDS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
