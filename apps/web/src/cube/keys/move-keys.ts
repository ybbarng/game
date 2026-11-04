import type { KeyChord, Keymap } from "../input/keymaps";
import { pressesFor } from "./reach";

/**
 * 배우기·튜토리얼이 수 표기 옆에 그 사람의 키를 보이기 위한 변환(docs/47 4-4, 8절).
 * 해 보기·시연·따라 하기·훈련이 모두 이 함수 하나로 「R → I」를 읽어, 설정의 「두 손」·「표기」·「사용자」 배치가
 * 그대로 화면에 나온다.
 */

/**
 * 공식 글의 한 수를 키 배치가 읽는 이름으로 고친다.
 * - 소문자 넓게(`r` `r'` `r2`)는 `Rw` 꼴(바깥 두 층, 같은 수)
 * - `R2'`는 `R2`(반 바퀴는 방향이 없다)
 */
export function normalizeMove(notation: string): string {
  let t = notation.trim();
  if (t.endsWith("2'")) t = t.slice(0, -1);
  const low = /^([rludfb])(2|')?$/.exec(t);
  if (low) return `${(low[1] as string).toUpperCase()}w${low[2] ?? ""}`;
  return t;
}

/**
 * 수 하나(표기) → 그 배치에서 치는 키 차례. 쓸 수 없거나 놓인 키가 없으면 null(「키 없음」).
 * 여러 길이 있으면 조합 키가 적은 것을 고른다(키 익히기 `/cube/keys/learn`과 같은 것).
 *
 * 예(「두 손」): `R` → I, `R'` → K, `R2` → I I, `Rw` → U, `2R` → Shift+I, `3Rw` → 3 → U
 */
export function keysForMove(
  keymap: Keymap,
  n: number,
  notation: string,
): KeyChord[] | null {
  const name = normalizeMove(notation);
  const options = pressesFor(keymap, n, name);
  return options[0] ?? null;
}

/** 키 하나를 키캡에 넣을 짧은 글로(`⇧I`, `Alt+R`, `;`) */
export function keycapLabel(c: KeyChord): string {
  const code = c.code;
  const base = code.startsWith("Key")
    ? code.slice(3)
    : code.startsWith("Digit")
      ? code.slice(5)
      : (SHORT[code] ?? code);
  return `${c.ctrl ? "Ctrl+" : ""}${c.alt ? "Alt+" : ""}${c.shift ? "⇧" : ""}${base}`;
}

const SHORT: Record<string, string> = {
  Semicolon: ";",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Backslash: "\\",
  Space: "Space",
};

// ── 레슨 본문 속 수 찾기 ─────────────────────────────────

export type TextPart =
  | { kind: "text"; text: string }
  | { kind: "move"; text: string };

/**
 * 확실한 수 토큰. 면 글자(앞 숫자·w), 소문자 넓게, 가운데 층, 큐브 돌리기 뒤에 2·'·2'.
 * 앞뒤에 영문·숫자·밑줄·프라임이 붙어 있으면 낱말의 일부라 보지 않는다(F2L, OLL, EO, CMLL, Ua …).
 */
const MOVE_TOKEN =
  /(?<![A-Za-z0-9_'’~])(?:\d?[RLUDFB]w?|[rludfb]|[MES]|[xyz])(?:2'|2|')?(?![A-Za-z0-9_'’~])/g;

/**
 * 수 뒤에 이 낱말이 오면 수가 아니라 키 이름·모양 이름이다(「R 키」, 「U자」, 「T 퍼뮤테이션」 꼴).
 * 띄어쓰기는 있어도 없어도 된다.
 */
const NOT_A_MOVE_AFTER = /^\s?(?:키|자\b|자 |자$|자모양|퍼뮤|perm|모양)/;

/**
 * 본문 글을 글과 수로 나눈다. 레슨 자료는 그대로 두고 그리는 쪽에서 수만 칩으로 바꾼다.
 * 영어 약어(OLL·PLL·F2L·CFOP·EO·CMLL·LSE …)와 영어 낱말은 앞뒤 글자 때문에 걸리지 않는다.
 *
 * `letters`: 스티커에 글자를 붙여 부르는 단원(블라인드, 「버퍼 B와 D」)은 홑 글자가 수인지 글자인지 알 수 없다.
 * 이때는 덧붙임('·2)·w·깊이가 있거나, 빈칸을 사이에 두고 수가 둘 이상 이어진 것만 수로 본다.
 */
export function splitMoveText(
  text: string,
  { letters = false }: { letters?: boolean } = {},
): TextPart[] {
  const found: { at: number; token: string }[] = [];
  for (const m of text.matchAll(MOVE_TOKEN)) {
    const at = m.index ?? 0;
    const token = m[0];
    const after = text.slice(at + token.length, at + token.length + 6);
    if (NOT_A_MOVE_AFTER.test(after)) continue;
    // 숫자로 시작하는 깊이 수(2R)는 숫자 하나만, 1R·0R은 수가 아니다
    if (/^[01]/.test(token)) continue;
    found.push({ at, token });
  }
  const keep = letters
    ? found.filter((f, i) => {
        if (!/^[RLUDFBMESxyz]$/.test(f.token)) return true;
        const prev = found[i - 1];
        const next = found[i + 1];
        const joined = (a?: { at: number; token: string }, b?: typeof a) =>
          !!a && !!b && /^ +$/.test(text.slice(a.at + a.token.length, b.at));
        return joined(prev, f) || joined(f, next);
      })
    : found;
  const out: TextPart[] = [];
  let last = 0;
  for (const { at, token } of keep) {
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    out.push({ kind: "move", text: token });
    last = at + token.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
