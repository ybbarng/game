import { sha256Hex } from "@game/baseball-engine";

import type { RaceResume } from "@/net/race/types";

/**
 * 새로고침 뒤 대결 자리 되찾기(docs/47 9-11).
 *
 * 큐브 방은 연결 아이디가 곧 참가자 아이디인데, 새로고침하면 연결 아이디(trystero `selfId`)가 바뀐다. 그래서 「새 연결이
 * 예전 그 사람이다」를 증명해야 한다. 큐브 대결은 방장이 판정하지 않고 모든 기기가 직접 확인하므로(9-2) 방장만 믿는 증명으로는
 * 모자라다(방장이 판 도중 남의 자리를 자기 기기로 옮겨 그 사람 이름으로 수를 둘 수 있다). 그래서 **기기마다 따로 확인한다**:
 *
 * - 사람마다 다른 사람 하나하나에게 그 사람만 아는 토큰을 직접(그 연결에만) 보낸다(`cube-seat`). 받는 기기는 처음 받은 것을
 *   그 사람 몫으로 고정한다. 토큰은 탭(sessionStorage)에 남는다.
 * - 되찾을 때는 받는 사람마다 sha256(토큰 | 새 연결 아이디 | 되찾기 번호)를 보낸다(`cube-hello`의 `seat`). 토큰은 보내지 않는다.
 *   새 연결 아이디가 들어 있어 엿들은 사람이 자기 연결로 다시 써도 맞지 않고, 받는 사람마다 토큰이 달라 한 사람이 받은 증명을
 *   다른 사람에게 써도 맞지 않는다. 번호는 늘기만 해서 옛 증명으로 예전 연결에 자리를 돌려놓지 못한다.
 * - 확인한 기기만 그 사람의 수를 새 연결에서 받는다(판 참가자 표를 그 기기가 직접 고친다). 방장이 알린 방 상태의 기기 칸도
 *   이 기기가 확인한 것과 같을 때만 받는다.
 */

/** 되찾기 증명. 받는 사람의 토큰으로 만든다 */
export function seatProof(token: string, device: string, n: number): string {
  return sha256Hex(`cube-seat|${token}|${device}|${n}`);
}

/** 토큰 글자 수 상한(받는 쪽이 엉뚱하게 긴 글을 쌓아 두지 않게) */
export const SEAT_TOKEN_MAX = 64;

/** 탭에 남기는 자리 정보. 방장·손님 모두 남기고, 되찾기는 손님만 한다 */
export interface SavedSeat {
  v: 1;
  /** 내 참가자 아이디(처음 들어온 연결 아이디) */
  me: string;
  /** 방장 연결 아이디 */
  host: string;
  /** 마지막으로 쓴 되찾기 번호(처음 들어올 때 0) */
  n: number;
  /** 내가 남에게 준 토큰: 받은 참가자 → 토큰 */
  given: Record<string, string>;
  /** 남이 나에게 준 토큰: 준 참가자 → 토큰 */
  got: Record<string, string>;
}

/** 탭에 남기는 판 정보(판 기록·지금 판의 내 몫). 바뀔 때만 따로 적는다 */
export interface SavedMatch {
  v: 1;
  /** 마지막으로 받은 방 상태(돌아오자마자 판을 다시 열고 내 몫을 이어 가려고) */
  state?: unknown;
  /** 이 기기가 낸 판 기록(종합 순위는 각 기기가 자기 기록으로 계산한다) */
  rounds?: unknown[];
}

export interface SavedRace {
  v: 1;
  race: string;
  /** 남길 때 (벽시계 − 세션 시계). 새 페이지에서 세션 시계로 옮길 때 쓴다 */
  at: number;
  resume: RaceResume;
}

/** 자리 정보를 남기는 곳(제품은 탭의 sessionStorage, 시험은 메모리) */
export interface SeatStore {
  get(key: "seat" | "match" | "race"): string | null;
  set(key: "seat" | "match" | "race", value: string): void;
}

/** 방 하나의 자리 정보를 이 탭의 sessionStorage에. 탭을 닫으면 사라진다(닫은 탭 다시 열기는 브라우저가 되살린다) */
export function sessionSeatStore(room: string): SeatStore {
  const key = (k: string) => `cube.online.${k}.${room}`;
  return {
    get(k) {
      try {
        return sessionStorage.getItem(key(k));
      } catch {
        return null;
      }
    },
    set(k, value) {
      try {
        sessionStorage.setItem(key(k), value);
      } catch {
        // 남기지 못하면 새로고침 때 새 손님으로 들어간다
      }
    },
  };
}

export function readSeat(raw: string | null): SavedSeat | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SavedSeat;
    const records = (r: unknown) =>
      typeof r === "object" &&
      r !== null &&
      Object.values(r).every((t) => typeof t === "string");
    if (
      s?.v !== 1 ||
      typeof s.me !== "string" ||
      typeof s.host !== "string" ||
      !Number.isInteger(s.n) ||
      s.n < 0 ||
      !records(s.given) ||
      !records(s.got)
    )
      return null;
    return s;
  } catch {
    return null;
  }
}

export function readJson<T extends { v: 1 }>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as T;
    return value?.v === 1 ? value : null;
  } catch {
    return null;
  }
}

/** 제품의 벽시계: 페이지가 바뀌어도 이어지는 ms(새로고침하면 `performance.now`는 0부터 다시 잰다) */
export function pageWallClock(): number {
  return performance.timeOrigin + performance.now();
}
