/*
 * 소스 파일(.ts·.tsx)에서 화면에 나갈 한글 글을 뽑는다. 화면 글 말투 시험(`src/screen-tone.test.ts`)이 쓴다.
 * TypeScript 7에는 JS로 부르는 파서가 없어 가볍게 직접 읽는다:
 * - 주석은 건너뛴다(`//`, `/* *\/`, JSX 안 `{/* *\/}`)
 * - 따옴표 문자열과 템플릿 문자열을 글 하나로 본다. 템플릿의 `${…}` 자리는 「○」로 바꾸고, 그 안의 문자열은 바깥 글의 조각(`whole: false`)으로 따로 뽑는다
 * - 코드 자리에 나온 한글은 JSX 글이다. `>`·`}`에서 `<`·`{`까지를 글 하나로 본다
 * - 개발자에게만 가는 글(`new Error(…)`, `console.*(…)`의 첫 글)은 뽑지 않는다
 * 글이 뒤에 다른 조각과 이어지면(`"…" +`, JSX 글 뒤 `{이름}`·`<a>`) 끝이 문장 중간이라 `whole: false`다.
 * 정규식 글자(`/["']/`)는 가리지 못한다. 그런 줄이 있는 파일은 시험의 제외 목록에 둔다
 */

export type SourceText = {
  /** 빈칸을 하나로 줄인 글 */
  text: string;
  /** 1부터 세는 줄 번호 */
  line: number;
  /** 소스에서 글이 놓인 자리 [start, end) — 따옴표·백틱은 빼고 */
  start: number;
  end: number;
  /** 글이 여기서 끝나는가(false면 끝 조각은 문장 중간) */
  whole: boolean;
  /** 객체 속성 값이면 그 이름(`label: "…"` → "label") */
  key?: string;
  /** JSX 글 뒤에 여는 태그(`<button>`·`<b>`)가 온다 */
  beforeTag?: boolean;
};

const HANGUL = /[가-힣]/;
/** 뒤에 문자열이 바로 올 수 있는 낱말 */
const KEYWORDS = new Set(
  "return case typeof in of else yield await throw export from import void delete instanceof".split(
    " ",
  ),
);
const DEV_ONLY = /(\bError|\bconsole\.\w+)\(\s*$/;

export function sourceTexts(src: string): SourceText[] {
  const out: SourceText[] = [];
  const lineAt = (pos: number) => src.slice(0, pos).split("\n").length;

  const emit = (
    text: string,
    start: number,
    end: number,
    whole: boolean,
    beforeTag?: boolean,
  ) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!HANGUL.test(t)) return;
    const before = src.slice(Math.max(0, start - 40), start - 1);
    if (DEV_ONLY.test(before)) return;
    const key = /(\w+)\s*[:=]\s*\{?\s*$/.exec(before)?.[1];
    out.push({
      text: t,
      line: lineAt(start),
      start,
      end,
      whole,
      ...(key ? { key } : {}),
      ...(beforeTag ? { beforeTag } : {}),
    });
  };

  const nextCode = (pos: number) => {
    let p = pos;
    while (p < src.length && /\s/.test(src[p] ?? "")) p++;
    return src[p] ?? "";
  };
  const prevCode = (pos: number) => {
    let p = pos - 1;
    while (p >= 0 && /\s/.test(src[p] ?? "")) p--;
    return src[p] ?? "";
  };

  /**
   * 이 따옴표가 문자열을 여는가. JSX 글 속 따옴표(「원작의 "마이티 용어 사용"과」, 「Fomin's」)는 앞이 글자다.
   * 코드에서 글자 뒤에 문자열이 오는 것은 `return "…"` 같은 낱말 뒤뿐이다
   */
  const stringStarts = (pos: number) => {
    const prev = prevCode(pos);
    if (/[가-힣)\].]/.test(prev)) return false;
    if (/[A-Za-z0-9_$]/.test(prev)) {
      const word = /[A-Za-z0-9_$]+$/.exec(src.slice(0, pos).trimEnd())?.[0];
      return KEYWORDS.has(word ?? "");
    }
    return true;
  };

  /** 지금 템플릿 `${…}` 안에 몇 겹 들어와 있나. 그 안의 문자열은 바깥 글의 조각이다 */
  let placeholders = 0;

  /** 따옴표 문자열 하나를 읽고 끝 다음 자리를 돌려준다 */
  const readQuoted = (start: number): number => {
    const q = src[start];
    let p = start + 1;
    let text = "";
    while (p < src.length && src[p] !== q) {
      if (src[p] === "\\") {
        text += src[p + 1] ?? "";
        p += 2;
        continue;
      }
      if (src[p] === "\n") break;
      text += src[p];
      p++;
    }
    const end = p + 1;
    const joined = prevCode(start) === "+" || nextCode(end) === "+";
    emit(text, start + 1, p, !joined && placeholders === 0);
    return end;
  };

  /** 템플릿 문자열 하나를 읽는다. `${…}`는 코드로 읽어 그 안의 글도 뽑는다 */
  const readTemplate = (start: number): number => {
    let p = start + 1;
    let text = "";
    while (p < src.length && src[p] !== "`") {
      if (src[p] === "\\") {
        text += src[p + 1] ?? "";
        p += 2;
        continue;
      }
      if (src[p] === "$" && src[p + 1] === "{") {
        placeholders++;
        p = readCode(p + 2, "}");
        placeholders--;
        text += "○";
        continue;
      }
      text += src[p];
      p++;
    }
    emit(
      text,
      start + 1,
      p,
      prevCode(start) !== "+" && nextCode(p + 1) !== "+" && placeholders === 0,
    );
    return p + 1;
  };

  /** 코드를 `until`(닫는 `}`)까지 읽는다. 끝 다음 자리를 돌려준다 */
  function readCode(start: number, until: string | null): number {
    let p = start;
    let depth = 0;
    let jsx = "";
    let jsxStart = p;
    const flushJsx = (end: number, whole: boolean, beforeTag?: boolean) => {
      emit(jsx, jsxStart, end, whole, beforeTag);
      jsx = "";
    };
    while (p < src.length) {
      const c = src[p] ?? "";
      const c2 = src.slice(p, p + 2);
      if (c2 === "//") {
        while (p < src.length && src[p] !== "\n") p++;
        continue;
      }
      if (c2 === "/*") {
        const end = src.indexOf("*/", p + 2);
        p = end < 0 ? src.length : end + 2;
        continue;
      }
      if ((c === '"' || c === "'" || c === "`") && !stringStarts(p)) {
        jsx += c;
        p++;
        continue;
      }
      if (c === '"' || c === "'") {
        p = readQuoted(p);
        jsx = "";
        jsxStart = p;
        continue;
      }
      if (c === "`") {
        p = readTemplate(p);
        jsx = "";
        jsxStart = p;
        continue;
      }
      if (c === "{" || c === "<") {
        // 닫는 태그(`</`) 앞에서 끝나면 글이 끝난 것이다
        if (HANGUL.test(jsx))
          flushJsx(p, c2 === "</", c === "<" && /<[a-zA-Z]/.test(c2));
        jsx = "";
        if (c === "{") depth++;
        p++;
        jsxStart = p;
        continue;
      }
      if (c === "}" || c === ">") {
        if (HANGUL.test(jsx)) flushJsx(p, false);
        jsx = "";
        if (c === "}") {
          if (depth === 0 && until === "}") return p + 1;
          depth--;
        }
        p++;
        jsxStart = p;
        continue;
      }
      jsx += c;
      p++;
    }
    return p;
  }

  readCode(0, null);
  return out;
}
