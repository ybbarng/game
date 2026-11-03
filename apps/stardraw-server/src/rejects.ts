/**
 * 예측서 거절 까닭 숫자(docs/33 11절). 회차마다 까닭별로 몇 장을 돌려보냈는지만 센다. IP·열쇠·예측서 id는 남기지 않는다.
 * 예측 몰림(pressure.ts)이 이미 세는 거절(줄 가득·기다림 상한·IP 앞부분 상한·마감 뒤 1분 안 도착)은 여기서 세지 않는다
 * (그 거절에는 code를 달지 않는다). 메모리에만 두고 최근 `keep`회차만 남긴다.
 */

/** 거절 까닭. 이름은 서버 로그 한 줄(`예측 거절 {...}`)에 그대로 나간다 */
export type RejectCode =
  /** 앞 회차 관측이 끝나기 전 */
  | "early"
  /** 예측서·등록 형식, 별 번호 */
  | "format"
  /** 패스키가 아닌 직접 만든 열쇠 */
  | "raw-key"
  /** 이번 회차가 아닌(앞선) 회차 예측서 */
  | "wrong-round"
  /** 마감 뒤 1분이 지나 도착(옛 탭. 1분 안은 몰림의 late) */
  | "stale"
  /** 앞단 작업 증명이 없거나 틀림 */
  | "gate"
  /** 등록하지 않은 열쇠인데 등록이 함께 오지 않음 */
  | "unregistered"
  /** 함께 온 등록이 예측서와 다르거나 맞지 않음 */
  | "registration"
  /** 국장 열쇠 */
  | "director"
  /** 이미 다른 열쇠로 등록된 패스키 */
  | "credential-taken"
  /** 예측서 서명 */
  | "signature"
  /** 소속 증서 */
  | "qual"
  /** 이번 회차에 이미 예측함 */
  | "duplicate"
  /** 작업 증명(Argon2)이 맞지 않음 */
  | "pow"
  /** 작업 증명에서 떨어진 본문·열쇠를 다시 냄 */
  | "pow-blocked"
  /** 같은 열쇠의 등록이 먼저 들어옴(다시 내면 된다) */
  | "race-registered";

export const REJECTS_KEEP = 24;

export class EntryRejects {
  private readonly rounds = new Map<number, Map<RejectCode, number>>();

  constructor(private readonly keep = REJECTS_KEEP) {}

  add(round: number, code: RejectCode): void {
    let m = this.rounds.get(round);
    if (!m) {
      m = new Map();
      this.rounds.set(round, m);
      while (this.rounds.size > this.keep)
        this.rounds.delete(Math.min(...this.rounds.keys()));
    }
    m.set(code, (m.get(code) ?? 0) + 1);
  }

  /** 그 회차의 까닭별 수(0인 까닭은 빠진다) */
  get(round: number): Partial<Record<RejectCode, number>> {
    return Object.fromEntries(this.rounds.get(round) ?? []);
  }
}
