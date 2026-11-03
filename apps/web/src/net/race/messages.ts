/**
 * 경주 틀이 주고받는 메시지(README.md 표). 모두 `race`(판 아이디)와 `attempt`(섞기 시도 번호)를 단다.
 * 받은 것은 남이 만든 값이라 모양을 확인한 뒤에만 쓴다(`parseRaceMessage`).
 */

/** 기권 처리한 사람과 까닭. 시도를 넘길 때 함께 보낸다 */
export interface OutEntry {
  id: string;
  reason: string;
}

export type RaceMessage =
  | {
      type: "race-commit";
      race: string;
      attempt: number;
      commit: string;
      /** 이 시도까지 기권 처리된 사람 */
      out: OutEntry[];
    }
  | {
      type: "race-reveal";
      race: string;
      attempt: number;
      nonce: string;
      salt: string;
    }
  | {
      type: "race-seed";
      race: string;
      attempt: number;
      /** 씨앗을 만든 사람별 약속. 서로 다른 섞기를 받았는지 맞춰 본다 */
      commits: Record<string, string>;
      /** 보낸 기기가 만든 시작 상태의 지문(`RaceGame.startFingerprint`). 게임이 안 쓰면 없다 */
      start?: string;
    }
  | {
      type: "race-moves";
      race: string;
      attempt: number;
      /** i: 0부터 순서, m: 게임이 글로 바꾼 수, t: 풀림 기준 ms */
      moves: { i: number; m: string; t: number }[];
    }
  | { type: "race-done"; race: string; attempt: number; n: number; t: number }
  | {
      type: "race-bound";
      race: string;
      attempt: number;
      /** 누구의 하한인가 */
      of: string;
      /** 보낸 기기가 본 하한(ms). null이면 끊김 등으로 확인 약함 */
      bound: number | null;
    };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

export function parseRaceMessage(raw: unknown): RaceMessage | null {
  if (!isObj(raw) || !isStr(raw.type) || !isStr(raw.race)) return null;
  if (!isInt(raw.attempt) || (raw.attempt as number) < 0) return null;
  const base = { race: raw.race, attempt: raw.attempt as number };
  switch (raw.type) {
    case "race-commit": {
      if (!isStr(raw.commit) || !Array.isArray(raw.out)) return null;
      const out: OutEntry[] = [];
      for (const e of raw.out) {
        if (!isObj(e) || !isStr(e.id) || !isStr(e.reason)) return null;
        out.push({ id: e.id, reason: e.reason });
      }
      return { type: raw.type, ...base, commit: raw.commit, out };
    }
    case "race-reveal":
      if (!isStr(raw.nonce) || !isStr(raw.salt)) return null;
      return { type: raw.type, ...base, nonce: raw.nonce, salt: raw.salt };
    case "race-seed": {
      if (!isObj(raw.commits)) return null;
      const commits: Record<string, string> = {};
      for (const [id, c] of Object.entries(raw.commits)) {
        if (!isStr(c)) return null;
        commits[id] = c;
      }
      if (raw.start !== undefined && !isStr(raw.start)) return null;
      return {
        type: raw.type,
        ...base,
        commits,
        ...(isStr(raw.start) ? { start: raw.start } : {}),
      };
    }
    case "race-moves": {
      if (!Array.isArray(raw.moves)) return null;
      const moves: { i: number; m: string; t: number }[] = [];
      for (const e of raw.moves) {
        if (!isObj(e) || !isInt(e.i) || !isStr(e.m) || !isNum(e.t)) return null;
        moves.push({ i: e.i as number, m: e.m, t: e.t });
      }
      return { type: raw.type, ...base, moves };
    }
    case "race-done":
      if (!isInt(raw.n) || !isNum(raw.t)) return null;
      return { type: raw.type, ...base, n: raw.n as number, t: raw.t };
    case "race-bound":
      if (!isStr(raw.of) || !(raw.bound === null || isNum(raw.bound)))
        return null;
      return { type: raw.type, ...base, of: raw.of, bound: raw.bound };
    default:
      return null;
  }
}
