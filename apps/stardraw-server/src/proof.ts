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
 * 통이 비면 503과 Retry-After를 낸다(화면은 기다렸다 다시 받는다, politeFetch). 닫힌 회차 응모권 증명은 바뀌지 않아 오래 캐시된다.
 *
 * 한 클라이언트가 통을 다 써서 모든 화면의 확인이 막히지 않게(2026-11-03 검토 M8):
 * 1. 닫힌 회차의 응답은 바뀌지 않으므로 서버 메모리에 크기 상한을 두고 기억한다. 기억에서 내주는 응답은 계산이 없어 통을 쓰지 않는다
 *    (같은 요청을 되풀이해도 다른 사람의 몫이 줄지 않는다). 열쇠별 응답은 닫힌 회차 수가 열쇠에 들어 있어 새 회차가 닫히면 저절로 새로 만든다.
 * 2. 넉넉한 보조로, 한 접속 주소는 서버 전체 통의 일부(기본 절반)까지만 쓴다. 주소는 사람이 아니라서(회사·통신사 공유 IP 뒤에
 *    수백 명) 1차 기준으로 쓰지 않는다: 몫을 통의 절반(1,000번, 초당 100번)으로 두어 회사 하나가 한꺼번에 확인해도 닿지 않고,
 *    주소 하나가 아무리 써도 나머지 절반은 다른 사람에게 남는다. 주소를 여럿 쓰는 쪽은 서버 전체 통이 서버를 지킨다
 */

export interface ProofLimits {
  /** 서버 전체 초당 요청(채워지는 속도) */
  perSecond: number;
  /** 한꺼번에 받을 수 있는 요청(통 크기) */
  burst: number;
  /** 열쇠별 응모권 한 응답의 최대 장 수(넘으면 next로 잘라 낸다) */
  pageSize: number;
  /** 접속 주소 하나가 쓸 수 있는 몫(서버 전체 통의 비율, 0~1). 1이면 따로 세지 않는다 */
  clientShare: number;
  /** 기억해 둘 응답 크기 합(JSON 글자 수 + 칸마다 덧붙는 몫 어림) */
  cacheBytes: number;
}

export const DEFAULT_PROOF_LIMITS: ProofLimits = {
  perSecond: 200,
  burst: 2000,
  pageSize: 500,
  clientShare: 0.5,
  // 응모권 증명 하나 약 1KB, 열쇠별 응답 한 장(500장) 약 0.5MB. 컨테이너 상한 320MiB 안에서 작게
  cacheBytes: 8 * 1024 * 1024,
};

/** 접속 주소별 통을 둘 수 상한(넘으면 가득 찬 통부터, 그래도 넘으면 오래된 것부터 잊는다) */
const MAX_CLIENT_BUCKETS = 10_000;

interface Bucket {
  tokens: number;
  filledAt: number;
}

function refill(b: Bucket, now: number, perSecond: number, burst: number) {
  b.tokens = Math.min(
    burst,
    b.tokens + ((now - b.filledAt) / 1000) * perSecond,
  );
  b.filledAt = now;
}

/** 기억할 회차 수(회차마다 정렬한 id. 1천 장 회차면 약 32KB) */
const CACHE_ROUNDS = 64;

export class ProofBusy extends EntryError {
  constructor(readonly retryAfter: number) {
    super("지금 증명 요청이 몰려 있습니다. 잠시 뒤 다시 받아 주세요", 503);
  }
}

export class ProofService {
  private readonly all: Bucket;
  private readonly clients = new Map<string, Bucket>();
  private readonly ticketIds = new Map<number, Uint8Array[]>();
  private readonly regIds = new Map<number, Uint8Array[]>();
  private readonly answers = new Map<
    string,
    { value: unknown; size: number }
  >();
  private answerBytes = 0;

  constructor(
    private readonly store: Store,
    private readonly clock: { now(): number },
    private readonly limits: ProofLimits = DEFAULT_PROOF_LIMITS,
  ) {
    this.all = { tokens: limits.burst, filledAt: clock.now() };
  }

  /**
   * 요청 하나를 받을 수 있는지(서버 전체 통, 주소를 알면 그 주소의 몫도). 없으면 ProofBusy.
   * 두 통 모두 남아 있을 때만 한꺼번에 하나씩 꺼낸다
   */
  private take(client: string | undefined): void {
    const now = this.clock.now();
    const { perSecond, burst, clientShare } = this.limits;
    refill(this.all, now, perSecond, burst);
    const mine =
      client !== undefined && clientShare < 1
        ? this.bucketOf(client, now)
        : null;
    const share = {
      perSecond: perSecond * clientShare,
      burst: burst * clientShare,
    };
    if (mine) refill(mine, now, share.perSecond, share.burst);
    if (this.all.tokens < 1)
      throw new ProofBusy(Math.ceil((1 - this.all.tokens) / perSecond));
    if (mine && mine.tokens < 1)
      throw new ProofBusy(Math.ceil((1 - mine.tokens) / share.perSecond));
    this.all.tokens -= 1;
    if (mine) mine.tokens -= 1;
  }

  private bucketOf(client: string, now: number): Bucket {
    const found = this.clients.get(client);
    if (found) return found;
    if (this.clients.size >= MAX_CLIENT_BUCKETS) {
      const { perSecond, burst, clientShare } = this.limits;
      for (const [k, b] of this.clients) {
        refill(b, now, perSecond * clientShare, burst * clientShare);
        if (b.tokens >= burst * clientShare) this.clients.delete(k);
      }
      while (this.clients.size >= MAX_CLIENT_BUCKETS) {
        const oldest = this.clients.keys().next().value;
        if (oldest === undefined) break;
        this.clients.delete(oldest);
      }
    }
    const b = {
      tokens: this.limits.burst * this.limits.clientShare,
      filledAt: now,
    };
    this.clients.set(client, b);
    return b;
  }

  /** 기억해 둔 응답(닫힌 회차라 바뀌지 않는다). 맞으면 통을 쓰지 않는다 */
  private recall<T>(key: string): T | undefined {
    const hit = this.answers.get(key);
    if (!hit) return undefined;
    this.answers.delete(key);
    this.answers.set(key, hit);
    return hit.value as T;
  }

  private keep(key: string, value: unknown): void {
    // 빈 응답도 Map 한 칸·열쇠 글자만큼은 쓰므로 그만큼 더해 센다
    const size = JSON.stringify(value).length + key.length + 256;
    if (size > this.limits.cacheBytes / 4) return;
    this.answers.set(key, { value, size });
    this.answerBytes += size;
    while (this.answerBytes > this.limits.cacheBytes) {
      const oldest = this.answers.keys().next().value;
      if (oldest === undefined) break;
      this.answerBytes -= this.answers.get(oldest)?.size ?? 0;
      this.answers.delete(oldest);
    }
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

  /** 응모권 증명. 없는 응모권·열린 회차면 404. `client`는 상한을 셀 접속 주소(모르면 서버 전체 통만) */
  ticket(round: number, idHex: string, client?: string): TicketProof {
    if (!/^[0-9a-f]{64}$/.test(idHex))
      throw new EntryError("예측서 일련번호 형식이 맞지 않습니다");
    const key = `t|${round}|${idHex}`;
    const hit = this.recall<TicketProof>(key);
    if (hit) return hit;
    this.take(client);
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
    this.keep(key, proof);
    return proof;
  }

  /** 한 열쇠의 응모권 증명(from 회차부터 닫힌 회차까지, 한 번에 pageSize장)과 등록 증명 */
  keyTickets(pub: Uint8Array, from = 1, client?: string): KeyTicketsResponse {
    if (!Number.isInteger(from) || from < 1)
      throw new EntryError("from 회차가 맞지 않습니다");
    const who = toHex(entrantId(pub));
    const through = this.store.recordCount();
    // 닫힌 회차 수까지 열쇠에 넣는다: 그 수까지의 응모권·등록은 바뀌지 않는다
    const key = `k|${who}|${from}|${through}`;
    const hit = this.recall<KeyTicketsResponse>(key);
    if (hit) return hit;
    this.take(client);
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
    const answer: KeyTicketsResponse = {
      v: 1,
      tickets,
      registration,
      through: next !== undefined ? next - 1 : through,
      ...(next !== undefined ? { next } : {}),
    };
    this.keep(key, answer);
    return answer;
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
