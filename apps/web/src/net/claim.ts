/**
 * 공정한 동시 판정 1층의 데이터 계약(docs/43 4-2, 1층 구현 절).
 *
 * - 청구(`ClaimMessage`)는 "이 자리가 이 판(`seen`)을 보고 이것(`body`)을 주장한다"는 사실 기록이다.
 *   청구한 기기가 방 안 **모두에게 직접** 보낸다(방장을 거치지 않는다, `ClaimHub`).
 * - 방장 발표(`ClaimsResolved`)는 한 묶음의 청구를 정해진 순서로 판정한 결과다. 재료가 아니라 결과일 뿐이라,
 *   각 기기는 자기가 직접 받은 청구와 자기가 본 판으로 같은 순수 함수(`resolveClaimBatch`)를 돌려 맞춰 본다.
 * - 1층에서 순서는 도착 순이 아니라 `(seen, seat, claimId)` 순이다. 방장이 순서를 바꿀 수 없고, 모두가 같은 순서를 계산한다.
 *   같은 판을 두고 겨루는 순서(반응 시간 `rtMs`)는 2층이 정한다. v1은 `rtMs` 자리만 둔다.
 * - 메시지에는 `t`가 없다. 방 코드(`isGuestMessage`·`isHostMessage`)는 `t`가 있는 것만 받으므로,
 *   이 기능이 없는 옛 방 코드는 청구를 그냥 버린다. 꼬리표는 `v`와 `kind`다.
 */

/** 데이터 계약 판. `seen`·`body`의 뜻을 바꾸면 새 판으로 올린다 */
export const CLAIM_VERSION = 1;

export interface ClaimMessage<Body = unknown> {
  v: 1;
  kind: "claim";
  /** 어떤 게임의 청구인가(`GameKit.id`). 다른 게임 방의 청구는 버린다 */
  game: string;
  /** 보낸 기기가 만든 난수(같은 청구를 두 번 세지 않게) */
  claimId: string;
  /** 청구한 자리. 받은 기기는 보낸 연결의 자리와 맞는지 본다 */
  seat: number;
  /** 누른 순간 그 기기 화면에 있던 판 번호(`KitClaims.stimulusOf`) */
  seen: number;
  /** 게임별 내용(원카드: 외침, SET: 카드 세 장). 모양은 `KitClaims.isBody`가 본다 */
  body: Body;
  /** 2층 자리: 누른 시각 − `seen` 판을 그린 시각(ms, 0 이상). 1층은 판정에 쓰지 않는다 */
  rtMs?: number;
  /** `seen` 판을 그린 뒤 탭이 숨겨진 적 있다(통계용) */
  hidden?: boolean;
}

/** 판정하지 않고 넘긴 까닭. 벌칙 없이 버린다 */
export type ClaimIgnoreReason =
  /** `seen`이 너무 옛 판이다(`staleBoards`보다 멀다) */
  | "stale"
  /** 발표 시점에 아직 없는 판을 가리킨다 */
  | "future"
  /** 그 판을 기록해 두지 않았다(오래돼 지웠다) */
  | "unknown-board"
  /** 한 묶음에서 한 자리가 낸 청구가 너무 많다(`maxPerSeat`를 넘은 뒤 것) */
  | "too-many";

export type ClaimOutcome<Verdict = unknown> =
  | { status: "judged"; verdict: Verdict }
  | { status: "ignored"; reason: ClaimIgnoreReason };

export interface ResolvedClaim<Body = unknown, Verdict = unknown> {
  claim: ClaimMessage<Body>;
  outcome: ClaimOutcome<Verdict>;
}

/** 방장 발표: 한 묶음을 처리한 결과. `entries`는 처리한 순서 그대로다 */
export interface ClaimsResolved<Body = unknown, Verdict = unknown> {
  v: 1;
  kind: "claims-resolved";
  game: string;
  /** 방장이 낸 몇 번째 묶음인가(0부터) */
  batch: number;
  /** 묶음을 닫을 때 방장 기기의 판 번호. `stale` 판정의 기준이다 */
  at: number;
  entries: ResolvedClaim<Body, Verdict>[];
}

export type ClaimWire = ClaimMessage | ClaimsResolved;

/** 판정 규칙 값. 게임마다 `KitClaims.rules`로 바꾼다 */
export interface ClaimRules {
  /** 방장이 첫 청구를 받은 뒤 묶음을 닫기까지 기다리는 시간(ms, 방장 `Clock`) */
  windowMs: number;
  /** 발표 시점 판(`at`)에서 몇 판 전까지의 청구를 판정하나. 그보다 옛 판이면 벌칙 없이 버린다 */
  staleBoards: number;
  /** 참가자가 직접 받은 청구가 이만큼 지나도록 어느 발표에도 없으면 이의를 낸다(ms) */
  graceMs: number;
  /** 한 묶음에서 한 자리의 청구를 몇 개까지 판정하나(마구 누르기로 발표가 커지지 않게) */
  maxPerSeat: number;
}

export const CLAIM_RULES: ClaimRules = {
  windowMs: 300,
  staleBoards: 1,
  graceMs: 5_000,
  maxPerSeat: 4,
};

/** 한 묶음의 최대 청구 수(받은 발표를 검사할 때 상한) */
export const CLAIM_BATCH_MAX = 64;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isSeat(value: unknown): value is number {
  return (
    Number.isInteger(value) && (value as number) >= 0 && (value as number) < 64
  );
}

function isBoardNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * 받은 값이 이 게임의 청구 모양이면 정해진 순서의 필드만 남긴 사본을, 아니면 null.
 * 모르는 필드는 버린다(사본끼리 `JSON.stringify`로 견줄 수 있게)
 */
export function parseClaim(
  value: unknown,
  game: string,
  isBody: (body: unknown) => boolean = () => true,
): ClaimMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  if (m.v !== CLAIM_VERSION || m.kind !== "claim" || m.game !== game)
    return null;
  if (typeof m.claimId !== "string" || !ID_PATTERN.test(m.claimId)) return null;
  if (!isSeat(m.seat) || !isBoardNumber(m.seen)) return null;
  if (!("body" in m) || m.body === undefined || !isBody(m.body)) return null;
  if (
    m.rtMs !== undefined &&
    (typeof m.rtMs !== "number" || !Number.isFinite(m.rtMs) || m.rtMs < 0)
  )
    return null;
  if (m.hidden !== undefined && typeof m.hidden !== "boolean") return null;
  return {
    v: 1,
    kind: "claim",
    game,
    claimId: m.claimId,
    seat: m.seat,
    seen: m.seen,
    body: JSON.parse(JSON.stringify(m.body)) as unknown,
    ...(m.rtMs !== undefined ? { rtMs: m.rtMs } : {}),
    ...(m.hidden === true ? { hidden: true } : {}),
  };
}

const IGNORE_REASONS: ReadonlySet<string> = new Set([
  "stale",
  "future",
  "unknown-board",
  "too-many",
]);

/** 받은 값이 이 게임의 방장 발표 모양이면 정리한 사본을, 아니면 null */
export function parseResolved(
  value: unknown,
  game: string,
  isBody: (body: unknown) => boolean = () => true,
): ClaimsResolved | null {
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  if (m.v !== CLAIM_VERSION || m.kind !== "claims-resolved" || m.game !== game)
    return null;
  if (!isBoardNumber(m.batch) || !isBoardNumber(m.at)) return null;
  if (!Array.isArray(m.entries) || m.entries.length > CLAIM_BATCH_MAX)
    return null;
  const entries: ResolvedClaim[] = [];
  for (const raw of m.entries as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const e = raw as { claim?: unknown; outcome?: unknown };
    const claim = parseClaim(e.claim, game, isBody);
    const o = e.outcome as Record<string, unknown> | null | undefined;
    if (!claim || typeof o !== "object" || o === null) return null;
    if (o.status === "judged" && "verdict" in o)
      entries.push({
        claim,
        outcome: {
          status: "judged",
          verdict: JSON.parse(JSON.stringify(o.verdict ?? null)) as unknown,
        },
      });
    else if (
      o.status === "ignored" &&
      typeof o.reason === "string" &&
      IGNORE_REASONS.has(o.reason)
    )
      entries.push({
        claim,
        outcome: { status: "ignored", reason: o.reason as ClaimIgnoreReason },
      });
    else return null;
  }
  return {
    v: 1,
    kind: "claims-resolved",
    game,
    batch: m.batch,
    at: m.at,
    entries,
  };
}

/** 청구나 방장 발표처럼 보이는가(게임·내용 검사 전). 방 코드가 자기 메시지와 가를 때 쓴다 */
export function isClaimWire(value: unknown): value is ClaimWire {
  if (typeof value !== "object" || value === null) return false;
  const m = value as { v?: unknown; kind?: unknown; t?: unknown };
  return (
    m.v === CLAIM_VERSION &&
    m.t === undefined &&
    (m.kind === "claim" || m.kind === "claims-resolved")
  );
}

/** 1층의 처리 순서: 판 번호, 자리, claimId. 도착 순이 아니라서 방장이 바꿀 수 없다 */
export function compareClaims(a: ClaimMessage, b: ClaimMessage): number {
  return (
    a.seen - b.seen ||
    a.seat - b.seat ||
    (a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0)
  );
}

/**
 * 청구가 가리킨 판을 판정해도 되는가. `at`은 묶음을 닫을 때의 판 번호.
 * `seen`이 `at − staleBoards`보다 옛 판이면 "늦음"(벌칙 없이 버림), `at`보다 뒤면 아직 없는 판
 */
export function boardStatus(
  seen: number,
  at: number,
  staleBoards: number,
): "ok" | "stale" | "future" {
  if (seen > at) return "future";
  if (at - seen > staleBoards) return "stale";
  return "ok";
}

export interface BatchInput<Body, Board, Verdict> {
  claims: readonly ClaimMessage<Body>[];
  at: number;
  rules: Pick<ClaimRules, "staleBoards" | "maxPerSeat">;
  /** 그 판 번호의 판(모든 자리에 같은 공개 정보). 기록이 없으면 undefined */
  board(seen: number): Board | undefined;
  judge(board: Board, claim: ClaimMessage<Body>): Verdict;
}

/**
 * 한 묶음을 판정한다(방장과 참가자가 같은 함수로 계산한다). 판정은 늘 `seen` 판 기준이라
 * 늦게 본 사람의 정직한 청구가 새 판 기준으로 헛된 청구가 되지 않는다(docs/43 2-1·2-5)
 */
export function resolveClaimBatch<Body, Board, Verdict>(
  input: BatchInput<Body, Board, Verdict>,
): ResolvedClaim<Body, Verdict>[] {
  const sorted = [...input.claims].sort(compareClaims);
  const perSeat = new Map<number, number>();
  return sorted.map((claim) => {
    const count = (perSeat.get(claim.seat) ?? 0) + 1;
    perSeat.set(claim.seat, count);
    if (count > input.rules.maxPerSeat)
      return { claim, outcome: { status: "ignored", reason: "too-many" } };
    const status = boardStatus(claim.seen, input.at, input.rules.staleBoards);
    if (status !== "ok")
      return { claim, outcome: { status: "ignored", reason: status } };
    const board = input.board(claim.seen);
    if (board === undefined)
      return {
        claim,
        outcome: { status: "ignored", reason: "unknown-board" },
      };
    return {
      claim,
      outcome: { status: "judged", verdict: input.judge(board, claim) },
    };
  });
}
