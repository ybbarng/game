import { sha256Hex } from "@game/yut-engine";

/**
 * 함께 정하는 난수(docs/48 4절). 사슬 자체(약속·고리)는 윷놀이 것(`@game/yut-engine`)을 쓰고,
 * 여기는 공개된 고리에서 주사위·공문·나눠 줄 별을 정하는 일만 한다.
 */

/**
 * 해시에서 치우침 없이 수를 꺼내는 흐름. 2바이트씩 읽고, 고르게 나누어지지 않는 끝값은 버리고 다음을 읽는다.
 * 다 읽으면 해시를 한 번 더 돌려 이어 간다
 */
export class HashStream {
  private hex: string;
  private offset = 0;

  constructor(seedHex: string) {
    this.hex = seedHex;
  }

  private next16(): number {
    if (this.offset + 4 > this.hex.length) {
      this.hex = sha256Hex(`galaxy-more|${this.hex}`);
      this.offset = 0;
    }
    const value = Number.parseInt(
      this.hex.slice(this.offset, this.offset + 4),
      16,
    );
    this.offset += 4;
    return value;
  }

  /** 0 이상 `count` 미만의 수 하나 */
  below(count: number): number {
    if (!Number.isInteger(count) || count <= 0)
      throw new Error("뽑을 수가 없다");
    const limit = Math.floor(65536 / count) * count;
    for (;;) {
      const value = this.next16();
      if (value < limit) return value % count;
    }
  }
}

/** 이번 굴림(번호 `index`)에 공개된 모든 자리 고리를 섞은 해시 */
export function rollHash(index: number, links: readonly string[]): string {
  return sha256Hex(`galaxy-roll|${index}|${links.join("|")}`);
}

/** 굴림 해시에서 두 눈(1~6) */
export function diceFrom(hash: string): [number, number] {
  const stream = new HashStream(hash);
  return [stream.below(6) + 1, stream.below(6) + 1];
}

/**
 * 공문 뽑기: 남은 공문 `remaining`장 가운데 몇 번째를 펼지(4-2).
 * 멘탈 포커로 바꾸게 되면 이 함수 자리만 바꾼다
 */
export function drawIndex(remaining: number, link: string): number {
  return new HashStream(sha256Hex(`galaxy-card|${link}`)).below(remaining);
}

/** 굴림 해시 흐름으로 섞는다(피셔-예이츠) */
function shuffled<T>(stream: HashStream, list: readonly T[]): T[] {
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = stream.below(i + 1);
    [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
  }
  return pool;
}

/**
 * 짧은 판 시작 별(docs/48 2-11): 굴림 해시로 별자리를 섞어 자리마다 다른 별자리 하나를 고르고,
 * 그 별자리 별을 `perSeat`개 준다(완성이 되지 않게 별자리 별 수 − 1까지). 모자라면 고른 별자리가 아닌 별에서 채운다.
 * `groups`는 별자리마다 별 칸(판 차례)
 */
export function dealStars(
  hash: string,
  groups: readonly (readonly number[])[],
  seats: readonly number[],
  perSeat: number,
): number[][] {
  if (groups.length < seats.length)
    throw new Error("자리마다 다른 별자리를 줄 만큼 별자리가 없다");
  const stream = new HashStream(sha256Hex(`galaxy-deal|${hash}`));
  const chosen = shuffled(stream, groups).slice(0, seats.length);
  const rest = shuffled(
    stream,
    groups.filter((g) => !chosen.includes(g)).flat(),
  );
  let at = 0;
  return chosen.map((group) => {
    const take = Math.min(perSeat, group.length - 1);
    const hand = shuffled(stream, group)
      .slice(0, take)
      .sort((a, b) => a - b);
    const fill = rest.slice(at, at + perSeat - take);
    at += fill.length;
    return [...hand, ...fill];
  });
}

export const SALT_PATTERN = /^[0-9a-f]{32}$/;
export const HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * 봉인 입찰 약속(4-3): SHA-256("galaxy-bid|" ‖ 입찰 번호 ‖ 값 ‖ 소금). 값 0은 「내지 않음」
 */
export function bidCommitment(
  index: number,
  value: number,
  salt: string,
): string {
  return sha256Hex(`galaxy-bid|${index}|${value}|${salt}`);
}

/** 재료(`keys`)에서 입찰 소금을 만든다(컴퓨터·혼자 하기 자리) */
export function bidSalt(key: string, index: number): string {
  return sha256Hex(`galaxy-salt|${key}|${index}`).slice(0, 32);
}
