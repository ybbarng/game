import { botSeedOf, committedBid } from "@game/galaxy-ai";
import {
  type Action,
  bidCommitment,
  bidSalt,
  type GalaxyView,
} from "@game/galaxy-engine";
import { chainCommit, chainLink } from "@game/yut-engine";

/**
 * 온라인에서 이 기기에만 두는 비밀(docs/48 4-1·4-3).
 * - 주사위 사슬 씨앗: 방장 엔진에는 약속(x_0)만 가고, 굴릴 때마다 이 기기가 다음 고리를 자동으로 공개한다
 * - 봉투 입찰: 낸 값과 소금. 방장 엔진에는 약속(해시)만 가고, 모두 낸 뒤 이 기기가 자동으로 공개한다
 * 새로고침해도 같은 씨앗·소금으로 이어 가도록 탭 저장소(sessionStorage)에 남긴다(윷놀이와 같은 틀).
 * 혼자 하기는 자리 재료(시드)로 만든 씨앗·소금을 쓴다(`store.ts`)
 */
export interface GalaxySecrets {
  /** 세대(사슬을 다 써서 다시 약속한 횟수) → 그 세대 내 씨앗 */
  seeds: Record<number, string>;
  /** 입찰 번호 → 내가 낸 값과 소금 */
  bids: Record<number, { value: number; salt: string }>;
}

export const EMPTY_SECRETS: GalaxySecrets = { seeds: {}, bids: {} };

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 씨앗 32바이트(브라우저의 안전한 난수) */
export function newSeed(): string {
  return randomHex(32);
}

/** 입찰 소금 16바이트(엔진 `SALT_PATTERN`: 16진수 32자) */
export function newSalt(): string {
  return randomHex(16);
}

/** 같은 씨앗의 약속을 다시 계산하지 않게(사슬 600번 해시) 기억해 둔다 */
const commitCache = new Map<string, string>();

function commitOf(seed: string): string {
  let commit = commitCache.get(seed);
  if (!commit) {
    commit = chainCommit(seed);
    commitCache.set(seed, commit);
  }
  return commit;
}

/**
 * 이번 세대 내 씨앗. 이 기기에 남긴 것 가운데 약속과 맞는 것을 쓴다. 없으면 끊긴 사이 컴퓨터가 내 자리 재료로
 * 대신 약속한 사슬인지 본다. 둘 다 아니면(다른 기기에서 약속했다 등) null
 */
export function mySeed(
  view: GalaxyView,
  secrets: GalaxySecrets,
): string | null {
  const commit = view.chains[view.mySeat]?.commit ?? null;
  const kept = secrets.seeds[view.generation];
  if (!commit) return kept ?? null;
  if (kept && commitOf(kept) === commit) return kept;
  const derived = botSeedOf(view);
  if (commitOf(derived) === commit) return derived;
  return null;
}

export function commitAction(seed: string): Action {
  return { type: "commit", hash: commitOf(seed) };
}

/** 이 사슬 씨앗으로 낼 다음 공개 */
export function revealAction(view: GalaxyView, seed: string): Action {
  const used = view.chains[view.mySeat]?.used ?? 0;
  return { type: "reveal", link: chainLink(seed, used + 1) };
}

/** 봉투 약속 */
export function bidAction(index: number, value: number, salt: string): Action {
  return { type: "bid", hash: bidCommitment(index, value, salt) };
}

/**
 * 이번 입찰에 공개할 값과 소금. 이 기기에 남긴 봉투가 약속과 맞으면 그것, 아니면 방장이 결정 시간을 넘긴 내 대신
 * 낸 「내지 않음」 봉투인지 본다. 둘 다 아니면 null
 */
export function myBid(
  view: GalaxyView,
  secrets: GalaxySecrets,
): { value: number; salt: string } | null {
  const auction = view.auction;
  if (!auction?.myCommit) return null;
  const kept = secrets.bids[auction.index];
  if (
    kept &&
    bidCommitment(auction.index, kept.value, kept.salt) === auction.myCommit
  )
    return kept;
  // 방장이 내 자리 재료 소금으로 대신 낸 봉투는 「내지 않음」(0)일 때만 내 것으로 받는다. 다른 값이면 방장이
  // 내 별빛을 걸고 지어 넣은 봉투일 수 있어 공개하지 않는다(판 끝 검증도 이런 기록을 실패로 잡는다)
  const value = committedBid(view);
  return value === 0
    ? { value, salt: bidSalt(view.botKey, auction.index) }
    : null;
}

/** 사람이 할 일이 없는 공개(주사위 고리·봉투). 내 씨앗·봉투를 모르면 null */
export function revealFor(
  view: GalaxyView,
  secrets: GalaxySecrets,
): Action | null {
  const kind = view.decision?.kind;
  if (kind === "reveal") {
    const seed = mySeed(view, secrets);
    return seed ? revealAction(view, seed) : null;
  }
  if (kind === "bidReveal") {
    const bid = myBid(view, secrets);
    return bid ? { type: "bidReveal", ...bid } : null;
  }
  return null;
}

/** 온라인 방의 내 비밀은 그 탭에만 남긴다(새로고침하면 이어 쓴다) */
export function loadSecrets(key: string): GalaxySecrets {
  try {
    const raw = sessionStorage.getItem(`galaxy-secret:${key}`);
    if (!raw) return { seeds: {}, bids: {} };
    const parsed = JSON.parse(raw) as Partial<GalaxySecrets>;
    return { seeds: parsed.seeds ?? {}, bids: parsed.bids ?? {} };
  } catch {
    return { seeds: {}, bids: {} };
  }
}

export function saveSecrets(key: string, secrets: GalaxySecrets): void {
  try {
    sessionStorage.setItem(`galaxy-secret:${key}`, JSON.stringify(secrets));
  } catch {
    // 남길 수 없으면 새로고침 뒤에 공개할 수 없을 뿐이다(그때는 방장이 끝내기).
  }
}
