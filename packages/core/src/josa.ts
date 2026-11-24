/*
 * 낱말 뒤 조사를 끝소리 받침으로 고른다. 해설·안내 문장에 이름·카드·수·숫자가 끼어들 때 쓴다.
 * 끝의 괄호 풀이(「차(59)」)·기호(+ # ! 굵은 글씨 표시 **)는 건너뛰고 그 앞 글자로 본다.
 * JSX처럼 값과 조사를 따로 그려야 하면 `josaOf(값, obj)`로 조사만 받는다.
 * 숫자는 읽는 소리로(0 영·1 일·3 삼·6 육·7 칠·8 팔·10 십은 받침이 있다), 로마자는 이름으로(L 엘·M 엠·N 엔·R 알만 받침).
 * 받침을 모르는 글자(기호만 있는 말 등)는 「이(가)」처럼 둘 다 적는다.
 * 모든 게임이 함께 쓰는 공통 패키지(@game/core)에 두고 `@game/core/josa`로 부른다(웹은 `lib/josa`가 다시 내보낸다).
 * 옛 경로 `@game/mighty-engine/josa`도 같은 것을 다시 내보낸다(2026-11-25 마이티 엔진에서 옮김).
 */

/** 받침이 있으면 true, 없으면 false, 모르면 null. `rieul`은 끝소리가 ㄹ인가(「로」·「으로」를 고를 때) */
function lastSound(word: string): { batchim: boolean; rieul: boolean } | null {
  let w = word.trim();
  // 끝의 괄호 풀이와 기호(굵은 글씨 표시 ** 포함)는 읽지 않는다
  for (;;) {
    const next = w
      .replace(/\([^()]*\)$/, "")
      .replace(/[\s+#!?*'"」』)\]]+$/, "");
    if (next === w) break;
    w = next;
  }
  const ch = w.at(-1);
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return { batchim: jong !== 0, rieul: jong === 8 };
  }
  if (/[0-9]/.test(ch)) {
    // 끝이 0이면 영·십·백·천·만 모두 받침이 있다(ㄹ 아님)
    return { batchim: "136780".includes(ch), rieul: "178".includes(ch) };
  }
  if (/[a-zA-Z]/.test(ch)) {
    const up = ch.toUpperCase();
    return { batchim: "LMNR".includes(up), rieul: up === "L" || up === "R" };
  }
  if (ch === "%") return { batchim: false, rieul: false };
  return null;
}

function pick(word: string, withBatchim: string, without: string): string {
  const s = lastSound(word);
  if (s === null) return `${word}${withBatchim}(${without})`;
  return `${word}${s.batchim ? withBatchim : without}`;
}

/** 받침이 있나(모르면 false) */
export const hasBatchim = (word: string) => lastSound(word)?.batchim ?? false;
/** 「이/가」. 「나」는 「내가」 */
export const subj = (word: string) =>
  word === "나" ? "내가" : pick(word, "이", "가");
/** 「은/는」 */
export const topic = (word: string) => pick(word, "은", "는");
/** 「을/를」 */
export const obj = (word: string) => pick(word, "을", "를");
/** 「과/와」 */
export const wa = (word: string) => pick(word, "과", "와");
/** 「이에요/예요」 */
export const copula = (word: string) => pick(word, "이에요", "예요");
/** 「으로/로」(ㄹ 받침은 「로」) */
export function ro(word: string): string {
  const s = lastSound(word);
  if (s === null) return `${word}(으)로`;
  return `${word}${s.batchim && !s.rieul ? "으로" : "로"}`;
}

/**
 * 조사만. 값은 따로 그리고(`<Num>{m}</Num>`) 바로 뒤에 조사를 붙일 때 쓴다: `{josaOf(m, obj)}`.
 * 「나」→「내가」처럼 값째 바뀌는 꼴은 조사만 떼어 낼 수 없으니 `subj`를 그대로 쓴다.
 */
export function josaOf(
  word: string | number,
  of: (word: string) => string,
): string {
  const w = String(word);
  return of(w).slice(w.length);
}
