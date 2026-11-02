import type {
  KeyRegistration,
  PowParams,
  Problem,
  QualInfo,
  RoundRecord,
  RoundSummary,
  Schedule,
  SignatureData,
  Ticket,
} from "@game/stardraw-core";

import type { LedgerStatus } from "./local-ledger";

/** 닫힌 회차: 기록과 요약(docs/36 11-30). 응모권 전체는 들고 있지 않는다 */
export interface ClosedRound {
  record: RoundRecord;
  summary: RoundSummary;
}

/** 「이 회차 확인」 결과(core `checkRound`, 연습 장부는 전체 검사에서 그 회차 문제만) */
export interface RoundCheck {
  problems: Problem[];
  skipped: string[];
}

/**
 * 화면이 쓰는 장부. 기기 안 연습 장부(`LocalLedger`)와 서버 장부(`RemoteLedger`)가 같은 모양이다.
 * 읽기(`status`·`record`·`closed`)는 동기로, 가져온 내용을 들고 있다가 `settle()` 때 새로 맞춘다.
 */
export interface Ledger {
  /** 처음 일정표(서버 장부는 첫 `settle()` 뒤에 정해진다) */
  readonly schedule: Schedule;
  /** 응모·등록 작업 증명 세기(연습은 가볍게, 서버는 규칙의 16MB) */
  readonly powParams: PowParams;
  /** 기기 안 연습 장부(practice), 서버 시험 운영(trial), 정식(live) */
  readonly mode: "practice" | "trial" | "live";
  /**
   * 장부 표시: 연습·서버와 처음 일정표 해시(예: "server:ab12…"). 서버 장부를 다시 시작하면 바뀐다.
   * 지갑은 이 값으로 다른 장부의 응모권을 가른다. 서버 장부는 첫 `settle()` 전에는 null
   */
  id(): string | null;
  /** 지금 시각(초, 장부 기준) */
  now(): number;
  /** 다음 회차 문제 값 */
  head(): Uint8Array;
  /** 지난 회차를 맞춘다(연습은 추첨, 서버는 받아 오기) */
  settle(): Promise<void>;
  status(): LedgerStatus;
  isRegistered(pub: Uint8Array): boolean | Promise<boolean>;
  /** 패스키 번호로 장부에 등록된 공개 열쇠를 찾는다(다른 기기에서 내 패스키 찾기) */
  passkeyPub(credentialId: Uint8Array): Promise<Uint8Array | null>;
  /** 이 공개 열쇠가 장부에 등록된 회차(우주인 등록증의 등록 일자). 아직 응모 전이라 등록이 없으면 null */
  registeredRound(pub: Uint8Array): Promise<number | null>;
  /**
   * 응모 없이 등록만 올린다(우주인 등록 직후, docs/36 11-14). `proof`는 그 패스키로 한 등록 증명 서명,
   * `challenge`는 작업 증명에 쓴 문제 값. 등록 회차를 돌려준다. 지금 받을 수 없으면(마감 뒤, 회차가 바뀜) `RegisterLater`
   */
  register(
    registration: KeyRegistration,
    proof: SignatureData,
    challenge: Uint8Array,
  ): Promise<{ round: number }>;
  submit(
    ticket: Ticket,
    registration?: KeyRegistration,
  ): Promise<{ receivedAt: number }>;
  /**
   * 이 열쇠로 낼 요청의 앞단 작업 증명을 뒤에서 미리 풀기 시작한다(서버 장부만, docs/36 11-31).
   * 응모 화면에 들어오면 부르고, 응모권 Argon2를 시작하기 전에 끝나길 기다린다(둘이 겹치면 둘 다 느려진다).
   * 연습 장부는 서버가 없어 필요 없다
   */
  prepare?(pub: Uint8Array): Promise<void>;
  /** 닫힌 회차 기록과 요약(회차 순) */
  closed(): readonly ClosedRound[];
  record(round: number): RoundRecord | undefined;
  /**
   * 그 회차 응모권 전체(회차 파일 하나). 회차 상세의 소속 판정·「이 회차 확인」만 쓴다.
   * 서버 장부는 그때 받고(한 회차 크기), 받은 목록이 기록의 머클 루트와 맞지 않으면 던진다
   */
  roundTickets(round: number): Promise<readonly Ticket[]>;
  /**
   * 응모권 하나(확인 링크·응모권 보기). 서버 장부는 증명 API로 받아 기록의 머클 루트로 확인한다.
   * 닫히지 않은 회차·없는 응모권·맞지 않는 증명은 null
   */
  findTicket(round: number, idHex: string): Promise<Ticket | null>;
  /**
   * 내 열쇠들의 닫힌 회차 응모권(회차 순, 머클 증명으로 확인한 것). 다른 기기에서 낸 것도 들어온다.
   * `known`은 지갑의 응모권: 서버가 응답하지 않으면 지갑 것만 돌려준다(등수는 기록의 당첨 id로 다시 본다)
   */
  keyTickets(
    pubs: readonly Uint8Array[],
    known: readonly Ticket[],
  ): Promise<Ticket[]>;
  /** 한 회차 확인(사슬·회차 파일·drand·봉인·내 응모권). 장부 전체 검사는 검증 페이지가 한다 */
  verifyRound(round: number, mine?: readonly Uint8Array[]): Promise<RoundCheck>;
  /** 상품 자격(docs/36 11-13): 효력이 생긴 자격 기간과 여기서 받을 수 있는지 */
  qualInfo(): Promise<QualInfo>;
  /**
   * 도장 받기: 신원 확인 값(구글 ID 토큰, 데모는 "demo")과 가린 값을 보내 가린 도장을 받는다.
   * 장부(우주국)는 무엇에 찍었는지 모른다
   */
  issueStamp(
    periodId: string,
    credential: string,
    blinded: Uint8Array,
  ): Promise<Uint8Array>;
}

/** 등록을 지금 받을 수 없다(마감 뒤이거나 회차가 바뀌었다). 다음 회차가 열리면 다시 계산해 보낸다 */
export class RegisterLater extends Error {
  constructor(message = "다음 회차가 열리면 등록됩니다") {
    super(message);
    this.name = "RegisterLater";
  }
}
