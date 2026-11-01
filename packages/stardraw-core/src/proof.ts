import {
  compareBytes,
  equalBytes,
  fromBase64Url,
  fromHex,
  toBase64Url,
  toHex,
} from "./bytes";
import { inclusionProof, verifyInclusion } from "./merkle";
import type { RoundRecord } from "./record";
import {
  decodeRegistration,
  encodeRegistration,
  type KeyRegistration,
  registrationId,
} from "./registration";
import { decodeTicket, encodeTicket, type Ticket, ticketId } from "./ticket";

/**
 * 가벼운 확인의 머클 포함 증명(docs/36 11-30 설계 1). 서버 증명 API(`/api/proof/…`, `/api/keys/…/tickets`)가 내고,
 * 기기는 자기가 가진 회차 기록의 루트로 확인한다. 서버가 응답하지 않으면 회차 파일 하나로 기기에서 같은 증명을 만든다.
 */

// ── 머클 포함 증명(응모권·등록) ──

/** 응모권 증명: 그 회차 기록의 머클 루트(응모권 id 순 RFC 6962)에 이 응모권이 있다 */
export interface TicketProof {
  v: 1;
  round: number;
  /** 응모권 바이트(base64url) */
  ticket: string;
  index: number;
  size: number;
  /** 아래에서 위로 형제 해시(hex) */
  path: string[];
  /** 사람이 회차 파일과 대조하라고 싣는 루트(hex). 확인은 기기가 가진 기록의 루트로 한다 */
  root: string;
}

/** 등록 증명: 등록 회차 기록의 등록 루트에 이 등록이 있다 */
export interface RegistrationProof {
  v: 1;
  round: number;
  registration: string;
  index: number;
  size: number;
  path: string[];
  root: string;
}

/** `GET /api/keys/{공개 열쇠}/tickets` 응답 */
export interface KeyTicketsResponse {
  v: 1;
  /** 그 열쇠의 응모권 증명(회차 순). from 회차부터, 닫힌 회차까지 */
  tickets: TicketProof[];
  /** 등록 증명(등록이 닫힌 회차에 있을 때). 처음 일정표로 옮긴 등록이거나 아직 열린 회차면 null */
  registration: RegistrationProof | null;
  /** 이 응답이 본 마지막 닫힌 회차(다음에는 through + 1부터 묻는다) */
  through: number;
  /** 한 응답 상한을 넘어 잘렸으면 다음에 물을 회차 */
  next?: number;
}

/** 정렬된 잎(id) 목록에서 증명을 만든다 */
function proofOf(leaves: readonly Uint8Array[], index: number) {
  return inclusionProof(leaves, index).map(toHex);
}

/**
 * 응모권 증명 만들기. `ids`는 그 회차 응모권 id를 사전 순으로(회차 파일 순서), `root`는 그 회차 기록의 루트
 */
export function makeTicketProof(
  round: number,
  ids: readonly Uint8Array[],
  ticket: Ticket,
  root: Uint8Array,
): TicketProof | null {
  const id = ticketId(ticket);
  const index = binarySearch(ids, id);
  if (index < 0) return null;
  return {
    v: 1,
    round,
    ticket: toBase64Url(encodeTicket(ticket)),
    index,
    size: ids.length,
    path: proofOf(ids, index),
    root: toHex(root),
  };
}

export function makeRegistrationProof(
  round: number,
  ids: readonly Uint8Array[],
  registration: KeyRegistration,
  root: Uint8Array,
): RegistrationProof | null {
  const id = registrationId(registration);
  const index = binarySearch(ids, id);
  if (index < 0) return null;
  return {
    v: 1,
    round,
    registration: toBase64Url(encodeRegistration(registration)),
    index,
    size: ids.length,
    path: proofOf(ids, index),
    root: toHex(root),
  };
}

/**
 * 서버가 응답하지 않을 때: 그 회차 파일(앵커 사본의 rounds/NNNNNN.json) 하나의 응모권 목록으로 기기에서 같은 증명을 만든다.
 * `idHex`는 응모권 id 64자리. 목록에 없으면 null. 목록이 기록과 맞는지는 이 증명을 checkTicketProof로 확인하면 드러난다
 */
export function ticketProofFromList(
  record: RoundRecord,
  tickets: readonly Ticket[],
  idHex: string,
): TicketProof | null {
  const ids = tickets.map(ticketId);
  const order = ids
    .map((_, i) => i)
    .sort((a, b) => compareBytes(ids[a] as Uint8Array, ids[b] as Uint8Array));
  const sorted = order.map((i) => ids[i] as Uint8Array);
  const at = order.find((i) => toHex(ids[i] as Uint8Array) === idHex);
  if (at === undefined) return null;
  return makeTicketProof(
    record.round,
    sorted,
    tickets[at] as Ticket,
    record.merkleRoot,
  );
}

function binarySearch(ids: readonly Uint8Array[], id: Uint8Array): number {
  let lo = 0;
  let hi = ids.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = compareBytes(ids[mid] as Uint8Array, id);
    if (c === 0) return mid;
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

const pathBytes = (path: unknown): Uint8Array[] | null => {
  if (!Array.isArray(path)) return null;
  const out: Uint8Array[] = [];
  for (const p of path) {
    if (typeof p !== "string" || !/^[0-9a-f]{64}$/.test(p)) return null;
    out.push(fromHex(p));
  }
  return out;
};

/**
 * 응모권 증명 확인: 기기가 가진 그 회차 기록의 머클 루트로. 맞으면 응모권, 아니면 null.
 * 증명에 실린 root는 쓰지 않는다(서버가 루트를 함께 바꿔치기해도 기록 사슬의 루트와 달라 드러난다)
 */
export function checkTicketProof(
  proof: TicketProof,
  record: RoundRecord,
): Ticket | null {
  try {
    if (proof?.v !== 1 || proof.round !== record.round) return null;
    const ticket = decodeTicket(fromBase64Url(proof.ticket));
    if (ticket.round !== record.round) return null;
    const path = pathBytes(proof.path);
    if (!path || proof.size !== record.count) return null;
    return verifyInclusion(
      ticketId(ticket),
      proof.index,
      proof.size,
      path,
      record.merkleRoot,
    )
      ? ticket
      : null;
  } catch {
    return null;
  }
}

/** 등록 증명 확인: 등록 회차 기록의 등록 루트로. 맞으면 등록, 아니면 null */
export function checkRegistrationProof(
  proof: RegistrationProof,
  record: RoundRecord,
): KeyRegistration | null {
  try {
    if (proof?.v !== 1 || proof.round !== record.round) return null;
    const registration = decodeRegistration(fromBase64Url(proof.registration));
    const path = pathBytes(proof.path);
    if (!path || proof.size !== record.registrationCount) return null;
    return verifyInclusion(
      registrationId(registration),
      proof.index,
      proof.size,
      path,
      record.registrationRoot,
    )
      ? registration
      : null;
  } catch {
    return null;
  }
}

/** 응모권이 그 기록의 등수 당첨 목록에 있는 등수(없으면 null) */
export function listedRank(record: RoundRecord, id: Uint8Array): number | null {
  for (const rank of [1, 2, 3, 4, 5] as const)
    if (record.winners[rank].some((w) => equalBytes(w, id))) return rank;
  return null;
}
