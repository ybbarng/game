import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { Clock } from "@game/fair-play";
import {
  drandRoundForClose,
  drandTime,
  type Rank,
  ROOM_TEXT_MAX,
  type RoomModAction,
  rankOf,
  roomCharCount,
  roomModMessage,
  roomPassMessage,
  roundTimes,
  type Schedule,
  type SignatureData,
  type Ticket,
  toBase64Url,
  toHex,
  verifyEntrantSignature,
  type WebAuthnPolicy,
} from "@game/stardraw-core";

import { EntryError } from "./engine";

/**
 * 회차 방(docs/36 11-23): 실시간 추첨을 함께 보고 말하고 응원하는 곳.
 * 모든 것이 메모리에만 있다. 말은 그 순간 연결된 사람들에게 건네고 버린다(장부·디스크에 남기지 않는다).
 * 서명 내용(대화 표·국장 조치)은 화면과 같이 쓰려고 규칙 패키지(room.ts)에 있다
 */

export interface RoomLimits {
  /** 말 길이(글자) */
  textMax: number;
  /** 표마다 말 사이(ms)와 몰아서 낼 수 있는 수 */
  sayIntervalMs: number;
  sayBurst: number;
  /** 응원 사이(ms) */
  cheerIntervalMs: number;
  /** 표마다 신고 사이(ms)와 몰아서 낼 수 있는 수 */
  reportIntervalMs: number;
  reportBurst: number;
  /** 방마다 신고 수를 세어 둘 말 수(넘으면 오래된 말부터 버린다) */
  maxReportedMessages: number;
  /** 추첨 뒤 방을 닫기까지(ms) */
  closeAfterMs: number;
  /** 한 번 쓰는 값이 살아 있는 시간(ms) */
  nonceTtlMs: number;
  /**
   * 표 없이 보는 연결(언덕 아래) 상한. 표 가진 사람의 연결과 따로 센다: 보는 연결이 아무리 많아도 언덕에 오른
   * 우주인은 밀려나지 않게
   */
  maxWatchers: number;
  /** 표 하나로 동시에 열 수 있는 연결(탭) 수. 표 가진 사람의 연결은 maxPasses × 이 값 안에 묶인다 */
  connectionsPerPass: number;
  maxPasses: number;
  /**
   * 기한 안에 이미 쓴 한 번 쓰는 값을 기억해 둘 수. 발급한 값은 서버가 기억하지 않는다(서버 비밀로 서명해 내준다).
   * 기억은 서명이 맞은 뒤에만 하고 기한이 지나면 지운다. 가득 차면 기한 안의 것을 버리지 않고(버리면 다시 쓸 수 있게
   * 된다) 새 서명을 잠깐 거절한다
   */
  maxUsedNonces: number;
  /** 서버 전체에 동시에 둘 방 수 */
  maxRooms: number;
  /** 시각 알림 사이(ms). 스트림이 끊기지 않게도 */
  heartbeatMs: number;
  /**
   * 언덕마다 전체 말 빠르기(몰아서 roomSayBurst번, 그 뒤 roomSayIntervalMs마다 한 번, docs/36 11-56). 말 하나는 그
   * 언덕의 모든 연결(1번 언덕은 보는 연결도)에 한 번씩 쓰여 연결 수만큼 일이 늘어난다. 화면은 풍등을 동시에 몇 개만
   * 띄우므로 그보다 많은 말은 어차피 읽히지 않는다
   */
  roomSayIntervalMs: number;
  roomSayBurst: number;
  /**
   * 응원을 모아 보내는 사이(ms). 응원 하나마다 모든 연결에 쓰지 않고, 이 사이에 온 응원을 수로 묶어 한 소식(`cheers`)으로
   */
  cheerBatchMs: number;
  /**
   * 연결 하나에 쌓인 쓰기(아직 내보내지 못한 바이트) 상한. 넘으면 그 연결을 끊는다(화면은 잠시 뒤 다시 붙어 인사부터
   * 받는다). 받는 쪽이 느린 연결 때문에 서버 메모리가 쌓이지 않게
   */
  maxBufferedBytes: number;
  /**
   * 한 언덕에 앉힐 수 있는 사람 수(docs/36 11-56). 대화 표를 받을 때 아직 이만큼 차지 않은 가장 낮은 번호의 언덕에 앉힌다.
   * 말·얼굴·전체 말 빠르기는 언덕마다 따로다. 사람이 이보다 적으면 언덕은 하나뿐이라 예전과 같다
   */
  hillSize: number;
}

export const DEFAULT_ROOM_LIMITS: RoomLimits = {
  textMax: ROOM_TEXT_MAX,
  sayIntervalMs: 2500,
  sayBurst: 3,
  cheerIntervalMs: 800,
  reportIntervalMs: 2000,
  reportBurst: 5,
  maxReportedMessages: 2000,
  closeAfterMs: 7 * 60_000,
  nonceTtlMs: 120_000,
  // 회사 하나(125명)가 탭 여럿을 열어도 넉넉하게. 공유 IP를 세지 않고 방마다 연결 수로만 묶는다
  maxWatchers: 2000,
  connectionsPerPass: 6,
  maxPasses: 600,
  maxUsedNonces: 5000,
  maxRooms: 4,
  heartbeatMs: 15_000,
  roomSayIntervalMs: 125,
  roomSayBurst: 16,
  cheerBatchMs: 1000,
  maxBufferedBytes: 256 * 1024,
  hillSize: 40,
};

/** 방이 서버에서 읽는 것 */
export interface RoomDeps {
  clock: Clock;
  policy: WebAuthnPolicy;
  schedule: () => Schedule;
  isRegistered: (pub: Uint8Array) => boolean;
  isDirector: (pub: Uint8Array) => boolean;
  /** 봉인(마감)이 끝났는지 */
  sealed: (round: number) => boolean;
  /** 그 회차 응모권(봉인 뒤 공개되는 것). 방은 봉인 뒤 한 번만 읽는다 */
  tickets: (round: number) => Ticket[];
  /** 이 열쇠가 그 회차에 예측했는지(봉인 전 얼굴 표시용, 전체 목록을 읽지 않는 조회) */
  entered: (round: number, pub: Uint8Array) => boolean;
  /** 회차 기록이 닫혔는지(결과가 나왔는지) */
  drawn: (round: number) => boolean;
  /**
   * 방 소식을 모아 쓸 때(운영은 setImmediate). 주면 같은 차례에 생긴 소식(들어옴 몰림, 말 여럿)을 연결마다 한 번의
   * 쓰기로 묶는다: 연결 쓰기 횟수가 소식 수 × 연결 수에서 차례 수 × 연결 수로 준다. 없으면 소식마다 바로 쓴다(시험)
   */
  defer?: (flush: () => void) => void;
  /**
   * 방이 닫힐 때 숫자 요약 한 줄을 남길 곳(운영은 `[stardraw]` 서버 로그, docs/33 11절). 말 내용·열쇠·IP는 넣지 않는다
   */
  log?: (message: string) => void;
  /**
   * 회차 결과(빛난 별·보너스 별). 관측 뒤 1~3등의 말을 모든 언덕에 건네려고 읽는다(하늘 가운데 입상 소감, docs/36 11-56).
   * 없으면 말은 늘 그 언덕에만 간다
   */
  record?: (
    round: number,
  ) => { numbers: number[]; bonus: number; void: boolean } | null;
}

/** 방 이벤트(스트림 한 줄) */
export type RoomEvent =
  | {
      type: "hello";
      serverTime: number;
      round: number;
      drawAt: number;
      entryDeadline: number;
      closesAt: number;
      me: string | null;
      /** 이 연결이 보는 언덕의 얼굴만(docs/36 11-56) */
      people: Person[];
      watchers: number;
      sealed: boolean;
      drawn: boolean;
      picks: Picks | null;
      /**
       * 언덕 나누기(2026-11-03, 더하기만 한 항목): 이 연결이 보는 언덕 번호(1부터, 표 없이 보는 연결은 1번 언덕), 지금 언덕
       * 수, 모든 언덕의 얼굴 수. 예전 화면은 모르는 항목이라 넘긴다
       */
      hill: number;
      hills: number;
      faces: number;
    }
  | { type: "time"; serverTime: number }
  | { type: "join"; person: Person }
  | { type: "leave"; id: string }
  /** 보는 사람 수(1초마다). faces·hills는 언덕 나누기와 함께 더한 항목 */
  | { type: "watchers"; count: number; faces: number; hills: number }
  | {
      type: "say";
      id: string;
      from: string;
      text: string;
      at: number;
      /** 말한 사람의 언덕 */
      hill: number;
      /** 다른 언덕으로 가는 입상 소감에만: 말한 사람의 공개 열쇠와 고른 별(받는 화면에 그 얼굴이 없어 등수·얼굴을 계산하게) */
      pub?: string;
      picks?: number[];
    }
  | {
      type: "cheer";
      from: string;
      kind: "twinkle" | "meteor";
      to: string | null;
    }
  /**
   * 묶은 응원(2026-11-03): 앞 묶음 뒤에 온 별똥별 수와 얼굴마다 반짝임 수. 한 사람씩 보내던 `cheer`는 서버가 더 보내지
   * 않는다(옛 화면은 이 소식을 모르는 종류로 넘긴다 — 응원만 안 보이고 나머지는 그대로)
   */
  | { type: "cheers"; meteor: number; twinkle: Record<string, number> }
  | { type: "hide"; id: string }
  | { type: "kicked"; id: string }
  | { type: "sealed"; picks: Picks }
  | { type: "drawn" }
  | { type: "closed" };

/** 방 안 사람(표 하나). `pub`으로 화면이 얼굴·이름을 계산한다 */
export interface Person {
  id: string;
  pub: string;
  entered: boolean;
  /** 국장 패스키로 받은 표(국장 조치를 쓸 수 있다) */
  director?: boolean;
  /**
   * 봉인 뒤에만: 이 사람이 고른 6개(봉인 때 이미 장부에 공개된다). 봉인 뒤 언덕에 오른 사람의 고른 별을 먼저 와 있던
   * 화면도 알게(sealed 소식의 byPerson은 그때 있던 사람만 담는다, docs/36 11-44 언덕 위 등수)
   */
  picks?: number[];
}

/** 봉인 뒤 공개: 별마다 고른 수와 사람마다 고른 6개 */
export interface Picks {
  counts: Record<number, number>;
  byPerson: Record<string, number[]>;
}

interface Pass {
  token: string;
  id: string;
  pub: Uint8Array;
  pubHex: string;
  issuedAt: number;
  director: boolean;
  say: Bucket;
  report: Bucket;
  lastCheer: number;
  kicked: boolean;
  /** 봉인 전에 예측한 것을 한 번 보았으면 true(예측은 거두어지지 않으니 다시 묻지 않는다) */
  entered: boolean;
  /** 앉은 언덕(1부터) */
  hill: number;
  /** 관측 뒤 1~3등이면 그 등수, 아니면 null(결과가 나온 뒤 한 번 계산, 그 전에는 undefined) */
  rank?: Rank | null;
}

/** 언덕 하나(docs/36 11-56) */
interface Hill {
  /** 이 언덕에 앉힌 열쇠 수(나갔다 와도 자리는 그 사람 몫이라 줄지 않는다) */
  seated: number;
  /** 언덕 전체 말 빠르기 */
  say: Bucket;
  /** 아직 보내지 않은 반짝임(얼굴 → 수) */
  twinkles: Map<string, number>;
}

/** 표마다 물통: 몰아서 burst번, 그 뒤 intervalMs마다 한 번씩 찬다 */
interface Bucket {
  tokens: number;
  refillAt: number;
}

function takeToken(
  bucket: Bucket,
  now: number,
  intervalMs: number,
  burst: number,
): boolean {
  const refill = Math.floor((now - bucket.refillAt) / intervalMs);
  if (refill > 0) {
    bucket.tokens = Math.min(burst, bucket.tokens + refill);
    bucket.refillAt += refill * intervalMs;
  }
  if (bucket.tokens <= 0) return false;
  if (bucket.tokens === burst) bucket.refillAt = now;
  bucket.tokens -= 1;
  return true;
}

interface Connection {
  res: ServerResponse;
  pass: Pass | null;
  /** 이 연결이 보는 언덕(표가 있으면 그 표의 언덕, 없으면 1번 언덕) */
  hill: number;
  /** 이 연결이 들어온 때의 방 소식 번호(그 전에 모아 둔 소식은 인사에 이미 담겨 있어 보내지 않는다) */
  since: number;
}

/** 모아 둔 소식 하나 */
interface Outgoing {
  seq: number;
  text: string;
  except?: Connection;
  /** 이 언덕의 연결에만(없으면 모두). directors면 국장 연결도 받는다 */
  hill?: number;
  directors?: boolean;
}

/** 소식을 건넬 곳(없으면 관측지 전체) */
interface Scope {
  hill: number;
  directors?: boolean;
}

const reaches = (o: { hill?: number; directors?: boolean }, c: Connection) =>
  o.hill === undefined ||
  c.hill === o.hill ||
  (o.directors === true && c.pass?.director === true);

interface Room {
  round: number;
  drawAt: number;
  entryDeadline: number;
  closesAt: number;
  passes: Map<string, Pass>;
  /** 이미 쓴 한 번 쓰는 값(hex) → 기한(ms) */
  usedNonces: Map<string, number>;
  connections: Set<Connection>;
  /** 표 없이 보는 연결 수와, 화면들에 아직 알리지 않은 바뀜이 있는지(1초마다 한 번 알린다) */
  watcherCount: number;
  watchersDirty: boolean;
  /** 봉인 뒤 한 번 만든 고른 별(별마다 수, 열쇠마다 6개). 봉인 전에는 null */
  sealedPicks: {
    counts: Record<number, number>;
    byPub: Map<string, number[]>;
  } | null;
  reports: Map<string, Set<string>>;
  sealedSent: boolean;
  drawnSent: boolean;
  closed: boolean;
  messageSeq: number;
  /** 언덕들(번호 = 자리 + 1)과 열쇠(hex)마다 앉은 언덕. 다시 표를 받아도 같은 언덕으로 */
  hills: Hill[];
  hillOf: Map<string, number>;
  /** 얼굴 수가 바뀌었는지(언덕이 둘 이상일 때 1초마다 모두에게 알린다) */
  facesDirty: boolean;
  /** 소식 번호와 아직 쓰지 않은 소식(defer가 있을 때만 쌓인다) */
  seq: number;
  outbox: Outgoing[];
  flushing: boolean;
  /** 아직 보내지 않은 별똥별(cheerBatchMs마다 한 소식으로, 반짝임은 언덕마다) */
  meteors: number;
  cheerAt: number;
  /** 닫을 때 남길 숫자(관측지 요약): 가장 많았던 보는 연결·언덕 얼굴 수, 별똥별·반짝임 합 */
  peakWatchers: number;
  peakFaces: number;
  meteorTotal: number;
  twinkleTotal: number;
}

const sec = (ms: number) => Math.floor(ms / 1000);

export type ModAction = RoomModAction;
export { roomModMessage, roomPassMessage };

const charCount = roomCharCount;

export class RoomHub {
  private rooms = new Map<number, Room>();
  private stopBeat: () => void;
  /** 한 번 쓰는 값에 붙이는 서명 열쇠(프로세스마다 새로. 다시 띄우면 방도 비므로 앞 값이 쓸모없어져도 된다) */
  private readonly nonceKey = randomBytes(32);

  constructor(
    private deps: RoomDeps,
    private limits: RoomLimits = DEFAULT_ROOM_LIMITS,
  ) {
    const beat = () => {
      this.tick();
      this.stopBeat = deps.clock.after(1000, beat);
    };
    this.stopBeat = deps.clock.after(1000, beat);
  }

  stop(): void {
    this.stopBeat();
    for (const room of this.rooms.values()) this.closeRoom(room);
  }

  /** 지금 열려 있는 방 수(시험·상태용) */
  roomCount(): number {
    return this.rooms.size;
  }

  private nowMs(): number {
    return this.deps.clock.now();
  }

  /** 회차의 방. 아직 열리지 않았거나 이미 닫힌 회차면 거절 */
  private room(round: number, create = true): Room {
    const found = this.rooms.get(round);
    if (found) {
      if (found.closed)
        throw new EntryError("이 회차 관측지는 닫혔습니다", 410);
      return found;
    }
    if (!Number.isInteger(round) || round < 1)
      throw new EntryError("회차가 맞지 않습니다");
    const times = roundTimes(this.deps.schedule(), round);
    const drawAt = drandTime(drandRoundForClose(times.closesAt));
    const now = sec(this.nowMs());
    if (!create)
      throw now * 1000 >= drawAt * 1000 + this.limits.closeAfterMs
        ? new EntryError("이 회차 관측지는 닫혔습니다", 410)
        : new EntryError("열린 관측지가 없습니다", 404);
    if (now < times.opensAt)
      throw new EntryError("아직 열리지 않은 회차입니다", 404);
    if (now * 1000 >= drawAt * 1000 + this.limits.closeAfterMs)
      throw new EntryError("이 회차 관측지는 닫혔습니다", 410);
    if (this.rooms.size >= this.limits.maxRooms) {
      // 가장 오래된 방부터 정리(닫힌 방)
      for (const [r, room] of this.rooms) if (room.closed) this.rooms.delete(r);
      if (this.rooms.size >= this.limits.maxRooms)
        throw new EntryError("관측지가 가득 찼습니다", 503);
    }
    const room: Room = {
      round,
      drawAt,
      entryDeadline: times.entryDeadline,
      closesAt: times.closesAt,
      passes: new Map(),
      usedNonces: new Map(),
      connections: new Set(),
      watcherCount: 0,
      watchersDirty: false,
      sealedPicks: null,
      reports: new Map(),
      sealedSent: this.deps.sealed(round),
      drawnSent: this.deps.drawn(round),
      closed: false,
      messageSeq: 0,
      seq: 0,
      outbox: [],
      flushing: false,
      hills: [],
      hillOf: new Map(),
      facesDirty: false,
      meteors: 0,
      cheerAt: this.nowMs(),
      peakWatchers: 0,
      peakFaces: 0,
      meteorTotal: 0,
      twinkleTotal: 0,
    };
    this.rooms.set(round, room);
    return room;
  }

  /**
   * ① 한 번 쓰는 값(16바이트, 서명 내용 형식은 규칙 패키지가 정한다): 발급 시각(초, 4) ‖ 무작위(4) ‖
   * 서버 비밀로 만든 HMAC(회차 ‖ 앞 8바이트)의 앞 8바이트. 서버는 발급한 값을 기억하지 않아 요청이 몰려도
   * 먼저 받아 둔 정상 사용자의 값이 밀려나지 않는다. 다시 쓰지 못하게 하는 것은 `consumeNonce`
   */
  challenge(round: number): { nonce: string; expiresAt: number } {
    this.room(round);
    const issued = Math.floor(this.nowMs() / 1000);
    const head = Buffer.alloc(8);
    head.writeUInt32BE(issued >>> 0, 0);
    randomBytes(4).copy(head, 4);
    const nonce = Buffer.concat([head, this.nonceMac(round, head)]);
    return {
      nonce: toBase64Url(nonce),
      expiresAt: issued * 1000 + this.limits.nonceTtlMs,
    };
  }

  private nonceMac(round: number, head: Uint8Array): Buffer {
    const r = Buffer.alloc(4);
    r.writeUInt32BE(round >>> 0, 0);
    return createHmac("sha256", this.nonceKey)
      .update("stardraw/room-nonce/v1")
      .update(r)
      .update(head)
      .digest()
      .subarray(0, 8);
  }

  /**
   * 서명을 보기 전에 값이 이 서버·이 회차가 낸 것인지, 기한 안인지, 이미 쓰지 않았는지 본다.
   * 기한이 지났으면 409(화면이 새로 받아 다시 시도한다), 그 밖은 403
   */
  private checkNonce(
    room: Room,
    nonce: string,
  ): { bytes: Uint8Array; hex: string; expiresAt: number } {
    const bytes = Buffer.from(nonce, "base64url");
    const bad = () => new EntryError("확인 값이 맞지 않습니다", 403);
    // 같은 바이트를 다른 글자로 적은 값을 따로 세지 않게, 정규 표기만 받는다
    if (bytes.length !== 16 || toBase64Url(bytes) !== nonce) throw bad();
    const head = bytes.subarray(0, 8);
    if (!timingSafeEqual(bytes.subarray(8), this.nonceMac(room.round, head)))
      throw bad();
    const issuedMs = bytes.readUInt32BE(0) * 1000;
    const now = this.nowMs();
    if (issuedMs > now + 1000) throw bad();
    const expiresAt = issuedMs + this.limits.nonceTtlMs;
    if (now > expiresAt)
      throw new EntryError("확인 값의 기한이 지났습니다", 409);
    const hex = bytes.toString("hex");
    if (room.usedNonces.has(hex))
      throw new EntryError("이미 쓴 확인 값입니다", 403);
    return { bytes, hex, expiresAt };
  }

  /**
   * 서명이 맞은 뒤 그 값을 썼다고 기억한다. 서명 확인을 기다리는 사이 같은 값이 먼저 쓰였으면 거절한다
   * (이 함수는 기다림 없이 한 번에 돌아 둘 다 받는 일이 없다)
   */
  private consumeNonce(
    room: Room,
    nonce: { hex: string; expiresAt: number },
  ): void {
    if (room.usedNonces.has(nonce.hex))
      throw new EntryError("이미 쓴 확인 값입니다", 403);
    if (room.usedNonces.size >= this.limits.maxUsedNonces) {
      const now = this.nowMs();
      for (const [n, until] of room.usedNonces)
        if (until < now) room.usedNonces.delete(n);
      if (room.usedNonces.size >= this.limits.maxUsedNonces)
        throw new EntryError("관측지가 가득 찼습니다", 503);
    }
    room.usedNonces.set(nonce.hex, nonce.expiresAt);
  }

  /** ② 대화 표: 등록한 우주인의 패스키 서명(또는 국장 패스키) */
  async issuePass(
    round: number,
    input: { pub: Uint8Array; signature: SignatureData; nonce: string },
  ): Promise<{ pass: string; id: string }> {
    const room = this.room(round);
    const nonce = this.checkNonce(room, input.nonce);
    const director = this.deps.isDirector(input.pub);
    if (!director && !this.deps.isRegistered(input.pub))
      throw new EntryError("등록한 우주인만 말할 수 있습니다", 403);
    const ok = await verifyEntrantSignature(
      input.pub,
      roomPassMessage(round, nonce.bytes),
      input.signature,
      this.deps.policy,
    );
    if (!ok) throw new EntryError("신분증 확인이 맞지 않습니다", 403);
    if (room.closed) throw new EntryError("이 회차 관측지는 닫혔습니다", 410);
    this.consumeNonce(room, nonce);
    const pubHex = toHex(input.pub);
    // 같은 사람이 다시 받으면 앞 표를 바꾼다(얼굴은 하나)
    for (const [t, p] of room.passes)
      if (p.pubHex === pubHex) room.passes.delete(t);
    if (room.passes.size >= this.limits.maxPasses)
      throw new EntryError("관측지가 가득 찼습니다", 503);
    const hill = this.seat(room, pubHex);
    const token = toBase64Url(randomBytes(32));
    const pass: Pass = {
      token,
      id: pubHex.slice(0, 16),
      pub: input.pub,
      pubHex,
      issuedAt: this.nowMs(),
      director,
      say: { tokens: this.limits.sayBurst, refillAt: this.nowMs() },
      report: { tokens: this.limits.reportBurst, refillAt: this.nowMs() },
      lastCheer: 0,
      kicked: false,
      entered: false,
      hill,
    };
    room.passes.set(token, pass);
    return { pass: token, id: pass.id };
  }

  /**
   * 열쇠가 앉을 언덕(docs/36 11-56): 앞서 앉은 적이 있으면 그 언덕, 아니면 아직 hillSize만큼 차지 않은 가장 낮은 번호의
   * 언덕(먼저 채운다). 모두 찼으면 새 언덕
   */
  private seat(room: Room, pubHex: string): number {
    const known = room.hillOf.get(pubHex);
    if (known !== undefined) return known;
    let i = room.hills.findIndex((h) => h.seated < this.limits.hillSize);
    if (i < 0) {
      room.hills.push({
        seated: 0,
        say: { tokens: this.limits.roomSayBurst, refillAt: this.nowMs() },
        twinkles: new Map(),
      });
      i = room.hills.length - 1;
    }
    (room.hills[i] as Hill).seated += 1;
    room.hillOf.set(pubHex, i + 1);
    return i + 1;
  }

  /** 번호의 언덕(표를 받은 사람의 언덕은 늘 있다) */
  private hill(room: Room, n: number): Hill {
    return room.hills[n - 1] as Hill;
  }

  /** 지금 언덕 수(아무도 오르지 않았어도 1. 보는 연결은 1번 언덕을 본다) */
  private hillCount(room: Room): number {
    return Math.max(1, room.hills.length);
  }

  private passOf(room: Room, token: unknown): Pass {
    if (typeof token !== "string")
      throw new EntryError("대화 표가 없습니다", 401);
    const pass = room.passes.get(token);
    if (!pass || pass.kicked)
      throw new EntryError("대화 표가 맞지 않습니다", 401);
    return pass;
  }

  /**
   * 봉인 뒤 고른 별: 응모권 목록을 방마다 한 번만 읽어 지도로 둔다(봉인 뒤에는 목록이 바뀌지 않는다).
   * 예전에는 들어오는 사람마다·인사마다 목록 전체를 읽어, 수천 장·수백 명이면 인사 한 번이 무거웠다
   */
  private sealedPicks(room: Room): Room["sealedPicks"] {
    if (room.sealedPicks) return room.sealedPicks;
    if (!this.deps.sealed(room.round)) return null;
    const counts: Record<number, number> = {};
    const byPub = new Map<string, number[]>();
    for (const t of this.deps.tickets(room.round)) {
      for (const n of t.numbers) counts[n] = (counts[n] ?? 0) + 1;
      byPub.set(toHex(t.pub), [...t.numbers]);
    }
    room.sealedPicks = { counts, byPub };
    return room.sealedPicks;
  }

  private person(room: Room, pass: Pass): Person {
    const sealed = this.sealedPicks(room);
    const chosen = sealed?.byPub.get(pass.pubHex);
    if (!sealed && !pass.entered)
      pass.entered = this.deps.entered(room.round, pass.pub);
    return {
      id: pass.id,
      pub: toBase64Url(pass.pub),
      entered: sealed ? chosen !== undefined : pass.entered,
      ...(pass.director ? { director: true } : {}),
      ...(chosen ? { picks: [...chosen] } : {}),
    };
  }

  /** 그 언덕의 얼굴들 */
  private people(room: Room, hill: number): Person[] {
    const seen = new Set<string>();
    const out: Person[] = [];
    for (const c of room.connections)
      if (c.pass && c.pass.hill === hill && !seen.has(c.pass.id)) {
        seen.add(c.pass.id);
        out.push(this.person(room, c.pass));
      }
    return out;
  }

  private picks(room: Room): Picks | null {
    const sealed = this.sealedPicks(room);
    if (!sealed) return null;
    const byPerson: Record<string, number[]> = {};
    for (const p of room.passes.values()) {
      const chosen = sealed.byPub.get(p.pubHex);
      if (chosen) byPerson[p.id] = [...chosen];
    }
    return { counts: { ...sealed.counts }, byPerson };
  }

  /** ③ 스트림 연결(표가 있으면 얼굴로, 없으면 보는 사람으로) */
  connect(round: number, res: ServerResponse, token: unknown): void {
    const room = this.room(round);
    let pass: Pass | null = null;
    if (typeof token === "string" && token) {
      pass = this.passOf(room, token);
    }
    // 표 가진 사람과 보는 사람을 따로 센다(보는 연결이 차도 언덕에 오른 우주인은 들어온다)
    if (pass) {
      let mine = 0;
      for (const c of room.connections) if (c.pass === pass) mine++;
      if (mine >= this.limits.connectionsPerPass)
        throw new EntryError("이 표로 연 화면이 너무 많습니다", 429);
    } else if (room.watcherCount >= this.limits.maxWatchers)
      throw new EntryError("관측지가 가득 찼습니다", 503);
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    });
    const hill = pass?.hill ?? 1;
    const conn: Connection = { res, pass, hill, since: room.seq };
    const wasHere = pass ? this.hasFace(room, pass.id) : false;
    room.connections.add(conn);
    if (!pass) {
      room.watcherCount++;
      room.watchersDirty = true;
      room.peakWatchers = Math.max(room.peakWatchers, room.watcherCount);
    } else if (!wasHere) {
      room.peakFaces = Math.max(room.peakFaces, this.faceCount(room));
      room.facesDirty = true;
    }
    this.write(conn, {
      type: "hello",
      serverTime: this.nowMs(),
      round,
      drawAt: room.drawAt,
      entryDeadline: room.entryDeadline,
      closesAt: room.closesAt,
      me: pass?.id ?? null,
      people: this.people(room, hill),
      watchers: room.watcherCount,
      sealed: this.deps.sealed(round),
      drawn: this.deps.drawn(round),
      picks: this.picks(room),
      hill,
      hills: this.hillCount(room),
      faces: this.faceCount(room),
    });
    // 들어옴·나감은 그 언덕에만
    if (pass && !wasHere)
      this.broadcast(
        room,
        { type: "join", person: this.person(room, pass) },
        conn,
        { hill: pass.hill },
      );
    // 보는 사람 수는 드나들 때마다 모두에게 알리지 않고 1초마다 한 번(tick). 보는 연결이 많을 때 소식이 연결 수의
    // 제곱으로 늘지 않게
    let gone = false;
    res.on("close", () => {
      if (gone) return;
      gone = true;
      room.connections.delete(conn);
      if (!conn.pass) {
        room.watcherCount--;
        room.watchersDirty = true;
      }
      if (room.closed) return;
      if (conn.pass && !this.hasFace(room, conn.pass.id)) {
        room.facesDirty = true;
        this.broadcast(room, { type: "leave", id: conn.pass.id }, undefined, {
          hill: conn.pass.hill,
        });
      }
    });
  }

  /** 지금 언덕에 얼굴이 보이는 사람 수(연결이 하나 이상인 표) */
  private faceCount(room: Room): number {
    const ids = new Set<string>();
    for (const c of room.connections) if (c.pass) ids.add(c.pass.id);
    return ids.size;
  }

  private hasFace(room: Room, id: string): boolean {
    return this.faceHill(room, id) !== null;
  }

  /** 얼굴이 보이는 언덕(지금 연결이 없으면 null) */
  private faceHill(room: Room, id: string): number | null {
    for (const c of room.connections) if (c.pass?.id === id) return c.pass.hill;
    return null;
  }

  /** 결과가 나온 뒤 이 사람이 1~3등인지(입상 소감 후보). 결과와 고른 별은 바뀌지 않아 표마다 한 번만 계산한다 */
  private topRank(room: Room, pass: Pass): Rank | null {
    if (pass.rank !== undefined) return pass.rank;
    const record = this.deps.record?.(room.round);
    if (!record) return null;
    const chosen = this.sealedPicks(room)?.byPub.get(pass.pubHex);
    const rank = !record.void && chosen ? rankOf(record, chosen) : null;
    pass.rank = rank !== null && rank <= 3 ? rank : null;
    return pass.rank;
  }

  /** ④ 말하기 */
  say(round: number, token: unknown, text: unknown): { id: string } {
    const room = this.room(round, false);
    const pass = this.passOf(room, token);
    if (typeof text !== "string") throw new EntryError("말이 없습니다");
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) throw new EntryError("말이 없습니다");
    if (charCount(clean) > this.limits.textMax)
      throw new EntryError(`말은 ${this.limits.textMax}자까지입니다`, 413);
    const now = this.nowMs();
    if (
      !takeToken(pass.say, now, this.limits.sayIntervalMs, this.limits.sayBurst)
    )
      throw new EntryError("조금 천천히 말해 주세요", 429);
    if (
      !takeToken(
        this.hill(room, pass.hill).say,
        now,
        this.limits.roomSayIntervalMs,
        this.limits.roomSayBurst,
      )
    ) {
      // 표 몫은 돌려준다(언덕이 붐빈 것이지 이 사람이 빠른 것이 아니다)
      pass.say.tokens = Math.min(this.limits.sayBurst, pass.say.tokens + 1);
      throw new EntryError("관측지가 붐벼요. 조금 뒤에 다시 말해 주세요", 429);
    }
    // 말 번호는 관측지 전체에서 하나씩(신고가 언덕을 몰라도 되게)
    room.messageSeq += 1;
    const id = `${room.round}-${room.messageSeq}`;
    const event: RoomEvent = {
      type: "say",
      id,
      from: pass.id,
      text: clean,
      at: now,
      hill: pass.hill,
    };
    // 관측 뒤 1~3등의 말은 모든 언덕에 건넨다(받는 화면이 관측 연출이 끝난 뒤 첫 말인지 보고 하늘 가운데 소감으로 띄우고,
    // 다른 언덕의 그 밖의 말은 버린다). 다른 언덕 화면에는 그 얼굴이 없어 공개 열쇠와 고른 별(봉인 뒤 장부에 공개된 것)을 싣는다
    const chosen = this.sealedPicks(room)?.byPub.get(pass.pubHex);
    if (room.hills.length > 1 && chosen && this.topRank(room, pass) !== null)
      this.broadcast(room, {
        ...event,
        pub: toBase64Url(pass.pub),
        picks: [...chosen],
      });
    // 그 밖의 말은 그 언덕과 국장에게만
    else
      this.broadcast(room, event, undefined, {
        hill: pass.hill,
        directors: true,
      });
    return { id };
  }

  /** ⑤ 응원 */
  cheer(round: number, token: unknown, kind: unknown, to: unknown): void {
    const room = this.room(round, false);
    const pass = this.passOf(room, token);
    if (kind !== "twinkle" && kind !== "meteor")
      throw new EntryError("응원 종류가 맞지 않습니다");
    const now = this.nowMs();
    if (now - pass.lastCheer < this.limits.cheerIntervalMs)
      throw new EntryError("조금 천천히 응원해 주세요", 429);
    pass.lastCheer = now;
    // 모아 두었다가 cheerBatchMs마다 수로 보낸다(tick). 얼굴이 없는 반짝임은 화면에 보일 곳이 없어 세지 않는다.
    // 별똥별은 하늘(관측지 전체)에, 반짝임은 그 얼굴이 있는 언덕에만 보인다(docs/36 11-56)
    if (kind === "meteor") {
      room.meteors += 1;
      room.meteorTotal += 1;
    } else if (typeof to === "string") {
      const hill = this.faceHill(room, to);
      if (hill === null) return;
      const twinkles = this.hill(room, hill).twinkles;
      twinkles.set(to, (twinkles.get(to) ?? 0) + 1);
      room.twinkleTotal += 1;
    }
  }

  /** 언덕마다 한 소식: 관측지 전체의 별똥별 수와 그 언덕 얼굴의 반짝임. 언덕이 하나면 모두에게(예전과 같다) */
  private flushCheers(room: Room, now: number): void {
    if (now - room.cheerAt < this.limits.cheerBatchMs) return;
    room.cheerAt = now;
    const meteor = room.meteors;
    room.meteors = 0;
    const many = room.hills.length > 1;
    for (let n = 1; n <= this.hillCount(room); n++) {
      const twinkles = room.hills[n - 1]?.twinkles;
      if (meteor === 0 && !twinkles?.size) continue;
      const event: RoomEvent = {
        type: "cheers",
        meteor,
        twinkle: Object.fromEntries(twinkles ?? []),
      };
      twinkles?.clear();
      this.broadcast(room, event, undefined, many ? { hill: n } : undefined);
    }
  }

  /** 신고: 국장 화면에서 그 말 옆에 수가 보인다(말은 남기지 않으므로 수만) */
  report(round: number, token: unknown, messageId: unknown): { count: number } {
    const room = this.room(round, false);
    const pass = this.passOf(room, token);
    // 이 방에서 실제로 나간 말의 번호(`${round}-${n}`, 1 ≤ n ≤ messageSeq)만 받는다
    const m =
      typeof messageId === "string"
        ? /^(\d{1,12})-(\d{1,12})$/.exec(messageId)
        : null;
    const n = m ? Number(m[2]) : 0;
    if (!m || Number(m[1]) !== room.round || n < 1 || n > room.messageSeq)
      throw new EntryError("신고할 말이 없습니다");
    if (
      !takeToken(
        pass.report,
        this.nowMs(),
        this.limits.reportIntervalMs,
        this.limits.reportBurst,
      )
    )
      throw new EntryError("조금 천천히 신고해 주세요", 429);
    const id = `${room.round}-${n}`;
    // 말마다 표 id 모음: 표는 열쇠마다 하나(같은 열쇠로 다시 받으면 같은 id)라 방의 maxPasses를 넘지 않는다
    let set = room.reports.get(id);
    if (!set) {
      set = new Set<string>();
      while (room.reports.size >= this.limits.maxReportedMessages) {
        const oldest = room.reports.keys().next().value;
        if (oldest === undefined) break;
        room.reports.delete(oldest);
      }
      room.reports.set(id, set);
    }
    set.add(pass.id);
    for (const c of room.connections)
      if (c.pass?.director)
        this.writeRaw(c, { type: "report", id, count: set.size });
    return { count: set.size };
  }

  /** 국장 조치: 국장 패스키 서명 */
  async moderate(
    round: number,
    input: {
      pub: Uint8Array;
      signature: SignatureData;
      nonce: string;
      action: ModAction;
      target: string;
    },
  ): Promise<void> {
    const room = this.room(round, false);
    if (!this.deps.isDirector(input.pub))
      throw new EntryError("국장 패스키가 아닙니다", 403);
    const nonce = this.checkNonce(room, input.nonce);
    const ok = await verifyEntrantSignature(
      input.pub,
      roomModMessage(round, input.action, input.target, nonce.bytes),
      input.signature,
      this.deps.policy,
    );
    if (!ok) throw new EntryError("국장 서명이 맞지 않습니다", 403);
    if (room.closed) throw new EntryError("이 회차 관측지는 닫혔습니다", 410);
    this.consumeNonce(room, nonce);
    if (input.action === "hide") {
      this.broadcast(room, { type: "hide", id: input.target });
      return;
    }
    for (const p of room.passes.values())
      if (p.id === input.target) p.kicked = true;
    this.broadcast(room, { type: "kicked", id: input.target });
    // 내보낸다는 소식이 끊기 전에 닿게
    this.flush(room);
    for (const c of [...room.connections])
      if (c.pass?.id === input.target) c.res.end();
  }

  /** 1초마다: 시각 알림, 봉인·추첨 소식, 닫기 */
  private tick(): void {
    const now = this.nowMs();
    for (const [round, room] of this.rooms) {
      if (room.closed) {
        this.rooms.delete(round);
        continue;
      }
      if (!room.sealedSent && this.deps.sealed(round)) {
        room.sealedSent = true;
        const picks = this.picks(room);
        if (picks) this.broadcast(room, { type: "sealed", picks });
      }
      if (!room.drawnSent && this.deps.drawn(round)) {
        room.drawnSent = true;
        this.broadcast(room, { type: "drawn" });
      }
      if (now >= room.drawAt * 1000 + this.limits.closeAfterMs) {
        this.broadcast(room, { type: "closed" });
        this.logSummary(room);
        this.closeRoom(room);
        continue;
      }
      this.flushCheers(room, now);
      // 언덕이 둘 이상이면 얼굴 수(관측지 전체)가 바뀔 때도 알린다. 하나면 화면이 들어옴·나감으로 센다
      if (room.watchersDirty || (room.facesDirty && room.hills.length > 1)) {
        room.watchersDirty = false;
        room.facesDirty = false;
        this.broadcast(room, {
          type: "watchers",
          count: room.watcherCount,
          faces: this.faceCount(room),
          hills: this.hillCount(room),
        });
      }
      for (const [n, until] of room.usedNonces)
        if (until < now) room.usedNonces.delete(n);
      if (
        Math.floor(now / 1000) % Math.round(this.limits.heartbeatMs / 1000) ===
        0
      )
        this.broadcast(room, { type: "time", serverTime: now });
    }
  }

  /**
   * 관측지 요약 한 줄(docs/33 11절): 가장 많았던 보는 사람(언덕 아래 연결)·언덕 얼굴, 언덕에 오른 사람(표를 받은 열쇠 수),
   * 언덕 수(docs/36 11-56), 말·신고한 말·별똥별·반짝임 수. 숫자만 남긴다
   */
  private logSummary(room: Room): void {
    this.deps.log?.(
      `관측지 ${JSON.stringify({
        round: room.round,
        peakWatchers: room.peakWatchers,
        peakFaces: room.peakFaces,
        hill: room.passes.size,
        hills: this.hillCount(room),
        says: room.messageSeq,
        reported: room.reports.size,
        meteors: room.meteorTotal,
        twinkles: room.twinkleTotal,
      })}`,
    );
  }

  private closeRoom(room: Room): void {
    this.flush(room);
    room.closed = true;
    for (const c of room.connections) c.res.end();
    room.connections.clear();
    room.passes.clear();
    room.usedNonces.clear();
    room.sealedPicks = null;
  }

  private write(conn: Connection, event: RoomEvent): void {
    this.writeRaw(conn, event);
  }

  private writeRaw(conn: Connection, event: unknown): void {
    this.send(conn, `data: ${JSON.stringify(event)}\n\n`);
  }

  /**
   * 쓰기 하나. 내보내지 못하고 쌓인 바이트가 상한을 넘은 연결은 끊는다(받는 쪽이 따라오지 못하는 연결에 계속 쌓으면
   * 서버 메모리가 는다). 끊으면 close가 나서 방에서 빠지고, 화면은 잠시 뒤 다시 붙는다
   */
  private send(conn: Connection, text: string): void {
    const res = conn.res;
    if (res.destroyed) return;
    if ((res.writableLength ?? 0) > this.limits.maxBufferedBytes) {
      res.destroy();
      return;
    }
    res.write(text);
  }

  /**
   * 소식 글을 한 번만 만들어 받을 연결 모두에 같은 글로 쓴다(연결마다 JSON을 다시 만들지 않는다). scope가 있으면 그
   * 언덕(과 국장)에만
   */
  private broadcast(
    room: Room,
    event: RoomEvent,
    except?: Connection,
    scope?: Scope,
  ): void {
    const text = `data: ${JSON.stringify(event)}\n\n`;
    room.seq += 1;
    const defer = this.deps.defer;
    if (!defer) {
      for (const c of room.connections)
        if (c !== except && (!scope || reaches(scope, c))) this.send(c, text);
      return;
    }
    room.outbox.push({
      seq: room.seq,
      text,
      ...(except ? { except } : {}),
      ...scope,
    });
    if (!room.flushing) {
      room.flushing = true;
      defer(() => this.flush(room));
    }
  }

  /**
   * 모아 둔 소식을 연결마다 한 번에 쓴다. 같은 언덕의 연결(국장은 따로)은 같은 글을 받으므로 그 글은 언덕마다 한 번만
   * 만든다. 모으는 사이에 들어온 연결(인사에 이미 담김)과 제외할 연결만 따로 고른다
   */
  private flush(room: Room): void {
    room.flushing = false;
    const out = room.outbox;
    if (out.length === 0) return;
    room.outbox = [];
    const first = (out[0] as Outgoing).seq;
    const excepts = new Set<Connection>();
    for (const o of out) if (o.except) excepts.add(o.except);
    const shared = new Map<string, string>();
    for (const c of room.connections) {
      if (c.since < first && !excepts.has(c)) {
        const key = `${c.hill}:${c.pass?.director ? 1 : 0}`;
        let text = shared.get(key);
        if (text === undefined) {
          text = out
            .filter((o) => reaches(o, c))
            .map((o) => o.text)
            .join("");
          shared.set(key, text);
        }
        if (text) this.send(c, text);
        continue;
      }
      const mine = out
        .filter((o) => o.seq > c.since && o.except !== c && reaches(o, c))
        .map((o) => o.text)
        .join("");
      if (mine) this.send(c, mine);
    }
  }
}
