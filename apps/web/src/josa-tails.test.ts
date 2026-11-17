/*
 * 템플릿 자리(`${…}`) 바로 뒤에 받침에 따라 바뀌는 조사(이/가·은/는·을/를·와/과·으로/로·이에요/예요)를
 * 그대로 붙인 글을 잡는다(docs/standing-rules.md 3절 「이름·카드·수 뒤 조사는 조사 도우미로」).
 * 「${카드}가 두 번 나왔어요」는 카드가 ♠10이면 「♠10가」가 된다. 자리 값을 모르니 `subj`·`obj` 등
 * (`@game/mighty-engine/josa`, 웹은 `lib/josa`)으로 고른다.
 * 보는 곳: 엔진·화투·멘탈 포커·컴퓨터 패키지의 소스(거절 사유·검증 실패 사유·오류 글), 별 따기 공통 코드·터미널 도구
 * (`stardraw-core`·`stardraw-cli`)와 별 따기 서버(`apps/stardraw-server`, 응답 글·운영 기록), 웹 소스 전체
 * (게임 폴더·`components`·`review`·`stats`·튜토리얼·수 배우기·큐브·별 따기·온라인 방 `net/`). 시험·시험 자료·시험 틀은 뺀다.
 * 굵은 글씨 표시·괄호 풀이를 사이에 둔 것(`**${money(x)}**이에요`, `${name}(컴퓨터)가`)도 같은 자리로 본다.
 * `.tsx`는 JSX 본문도 본다(`jsxTails`): `{값}` 바로 뒤, 안이 `{값}` 하나뿐인 태그(`<Num>{m}</Num>를`) 뒤,
 * 값을 받는 스스로 닫는 태그(`<SuitText text={name} />는`) 뒤. JSX에서는 `{topic(x)}`처럼 값과 조사를 함께 내거나
 * `{josaOf(m, obj)}`로 조사만 낸다. 태그 안이 고정 글(`<code>type</code>이`)이거나 속성이 모두 고정 글인 것은
 * 받침이 정해져 있어 보지 않는다.
 */
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: 소스에서 찾은 템플릿 자리를 글 그대로 적어 견준다
import { describe, expect, it } from "vitest";

const files: Record<string, string> = import.meta.glob(
  [
    "./**/*.{ts,tsx}",
    "../../../packages/{engine,*-engine,hwatu,fair-play,ai,*-ai}/src/**/*.ts",
    "../../../packages/stardraw-{core,cli}/src/**/*.ts",
    "../../stardraw-server/src/**/*.ts",
    "!./**/*.test.{ts,tsx}",
    "!./**/*-fixture.ts", // 시험 자료
    "!./**/*-suite.ts", // 시험 틀
    "!./**/__test__/**", // 시험 도우미
    "!./cube/native/{core-fixtures*,fixture-test-util}.ts", // 공통 시험 자료 만들기(시험 전용)
    "!./net/*-case.ts", // 시험 이름표
    "!./hwatu/card-table-sim.ts", // 시험·시연용 흉내
    "!./lib/josa.ts", // 조사 도우미 자신
    "!../../../packages/**/*.test.ts",
    "!../../stardraw-server/src/**/*.test.ts",
    "!../../../packages/stardraw-core/src/testing.ts", // 시험 도우미
    "!../../stardraw-server/src/testing.ts", // 시험 도우미
    "!../../../packages/stardraw-core/src/*.fixtures.ts", // 시험 자료
    "!../../../packages/engine/src/josa.ts", // 조사 도우미 자신(「${word}(으)로」)
  ],
  { query: "?raw", import: "default", eager: true },
);

/**
 * 받침과 상관없이 맞는 자리. 자리 값이 늘 같은 끝소리로 끝나는 것만 둔다.
 * `place`는 자리부터 조사까지 그대로 적은 글이다.
 */
const EXCEPTIONS: { file: string; place: string; why: string }[] = [
  {
    file: "packages/baseball-engine/src/match.ts",
    place: '${rules.zero ? "" : "(1~9)"}로',
    why: "자리 값은 빈 글이나 「(1~9)」라 늘 「숫자로」·「숫자(1~9)로」로 읽힌다",
  },
  {
    file: "apps/web/src/game/mighty-commentary.ts",
    place: '${ruling ? "여당" : "야당"}으로',
    why: "둘 다 「당」(ㅇ 받침)으로 끝난다",
  },
  {
    file: "apps/web/src/omok/study.ts",
    place: '${direct ? "화월" : "포월"}이에요',
    why: "둘 다 「월」(받침)로 끝난다",
  },
  {
    file: "apps/web/src/galaxy/components/GalaxyGame.tsx",
    place: "${rank}이에요",
    why: "rank는 늘 「n등」(ㅇ 받침)이다",
  },
  {
    file: "apps/web/src/stats/achievements.ts",
    place: "${unit}을",
    why: "unit은 「판」·「게임」뿐이라 늘 받침이 있다",
  },
  {
    file: "apps/web/src/cube/math/counts.ts",
    place: "${power[1]}은",
    why: "「10^k」는 「10의 k제곱」으로 읽어 늘 「제곱」(받침)으로 끝난다",
  },
  {
    file: "apps/web/src/stardraw/learn/toys-draw.tsx",
    place: '${changed ? displayRound(changed, liveFrom).label : ""}로',
    why: "회차 표시(`displayRound().label`)는 늘 「n회」(받침 없음)로 끝나고, 이 글은 바뀐 일정(changed)이 있을 때만 보인다",
  },
];

/** 조사 꼴. 긴 것부터 맞춘다(「이에요」를 「이」로 자르지 않게) */
const JOSA = "(이에요|예요|으로|이|가|은|는|을|를|와|과|로)(?![가-힣])";
const JOSA_AT = new RegExp(`^${JOSA}`);

/**
 * 자리 바로 뒤(`from`)의 조사. 사이에 굵은 글씨 표시(`**`)와 괄호 풀이(`(${magText(m)})`, 같은 줄 안에서 짝을 맞춤)가
 * 있으면 건너뛴다. 조사는 그 앞 자리 값에 붙기 때문이다. 조사가 없으면 null, 있으면 건너뛴 글부터 조사까지
 */
function tailAt(source: string, from: number): string | null {
  let i = from;
  if (source.startsWith("**", i)) i += 2;
  if (source[i] === "(") {
    let depth = 0;
    for (; ; i++) {
      const ch = source[i];
      if (ch === undefined || ch === "\n") return null;
      if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) break;
    }
    i++;
  }
  const m = JOSA_AT.exec(source.slice(i, i + 4));
  return m ? source.slice(from, i) + m[1] : null;
}

/** 글 안의 `${…}` 자리마다 닫는 괄호를 찾아, 바로 뒤에 조사가 붙은 것을 돌려준다 */
function bareTails(source: string): { line: number; place: string }[] {
  const found: { line: number; place: string }[] = [];
  for (
    let at = source.indexOf("${");
    at >= 0;
    at = source.indexOf("${", at + 2)
  ) {
    let depth = 0;
    let end = -1;
    for (let i = at + 1; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    const tail = tailAt(source, end + 1);
    if (tail === null) continue;
    found.push({
      line: source.slice(0, at).split("\n").length,
      place: source.slice(at, end + 1) + tail,
    });
  }
  return found;
}

/** `}`에서 거꾸로 짝이 되는 `{`를 찾는다. 못 찾으면 -1 */
function openerOf(source: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (source[i] === "}") depth++;
    else if (source[i] === "{" && --depth === 0) return i;
  }
  return -1;
}

/** JSX 본문에서 값 바로 뒤에 붙은 조사. 템플릿 자리(`${…}`)는 `bareTails`가 본다 */
function jsxTails(source: string): { line: number; place: string }[] {
  const found: { line: number; place: string }[] = [];
  const push = (at: number, place: string) =>
    found.push({ line: source.slice(0, at).split("\n").length, place });
  // {값}를 · {값}(풀이)를
  for (const m of source.matchAll(/\}/g)) {
    const tail = tailAt(source, m.index + 1);
    if (tail === null) continue;
    const at = openerOf(source, m.index);
    if (at < 0 || source[at - 1] === "$") continue;
    push(at, source.slice(at, m.index + 1) + tail);
  }
  // <Num>{m}</Num>를: 태그 안이 값 하나뿐인 것만(고정 글이면 받침이 정해져 있다)
  for (const m of source.matchAll(
    new RegExp(
      `<([A-Za-z][\\w.]*)(?:\\s[^<>]*)?>\\{[^<>]*\\}</\\1>${JOSA}`,
      "g",
    ),
  ))
    push(m.index, m[0]);
  // <SuitText text={name} />는: 속성에 고정 글이 아닌 값이 있는 것만
  for (const m of source.matchAll(
    new RegExp(`<[A-Za-z][\\w.]*\\s[^<>]*/>${JOSA}`, "g"),
  ))
    if (/=\{(?!["'`])/.test(m[0])) push(m.index, m[0]);
  return found;
}

/** 템플릿 자리는 모든 파일, JSX 본문은 `.tsx`만(`.ts`의 `{…}`는 코드라 보지 않는다) */
const tails = (key: string, source: string) =>
  key.endsWith(".tsx")
    ? [...bareTails(source), ...jsxTails(source)]
    : bareTails(source);

/** glob 열쇠(「./net/…」·「../../../packages/…」·「../../stardraw-server/…」)를 저장소 기준 경로로 */
const repoPath = (key: string) =>
  key.startsWith("./")
    ? `apps/web/src/${key.slice(2)}`
    : key.startsWith("../../../")
      ? key.slice("../../../".length)
      : `apps/${key.slice("../../".length)}`;

describe("템플릿 자리·JSX 본문 뒤 조사", () => {
  it("자리 뒤에 받침을 가리지 않는 조사를 붙인 글을 찾는다", () => {
    const source = [
      "const a = `${cardText(card)}가 두 번 나왔어요.`;",
      "const b = `자리 ${slot}을 열 수 없어요.`;",
      "const c = `${n}가지 · ${subj(name)} 이겼어요 · ${n}번`;",
      "const d = `평균 ${n}이에요.`;",
    ].join("\n");
    expect(bareTails(source)).toEqual([
      { line: 1, place: "${cardText(card)}가" },
      { line: 2, place: "${slot}을" },
      { line: 4, place: "${n}이에요" },
    ]);
  });

  it("굵은 글씨 표시와 괄호 풀이를 건너뛴 뒤의 조사도 찾는다", () => {
    const source = [
      "const a = `**${money(n)}**이에요. ${copula(`**${money(m)}**`)}`;",
      "const b = `**${ko(id)}**(${magText(mag(id))})예요. ${name}(컴퓨터)가`;",
      "const c = `${n}(으)로 · ${obj(`${a}(${b})`)} · ${x} (풀이)를`;",
    ].join("\n");
    expect(bareTails(source)).toEqual([
      { line: 1, place: "${money(n)}**이에요" },
      { line: 2, place: "${ko(id)}**(${magText(mag(id))})예요" },
      { line: 2, place: "${name}(컴퓨터)가" },
      { line: 3, place: "${n}(으)로" },
    ]);
  });

  it("JSX 본문에서 값 바로 뒤에 붙은 조사를 찾는다", () => {
    const source = [
      "<li>카드 <Num>{m}</Num>를 r = {r}로 감싸요.</li>",
      "<b>{n}장</b>을 <code>type</code>이 {topic(x)} 같아요.",
      '<SuitText text={name} />는 <SuitText text={"♥이다"} />를',
      "<p>{`${a}`}가</p>",
    ].join("\n");
    expect(jsxTails(source)).toEqual([
      { line: 1, place: "{r}로" },
      { line: 4, place: "{`${a}`}가" },
      { line: 1, place: "<Num>{m}</Num>를" },
      { line: 3, place: "<SuitText text={name} />는" },
    ]);
  });

  it("엔진·멘탈 포커·컴퓨터·별 따기 패키지와 웹 화면 글은 자리 뒤 조사를 도우미로 고른다", () => {
    expect(Object.keys(files).length).toBeGreaterThan(1000);
    const problems: string[] = [];
    for (const [key, source] of Object.entries(files)) {
      const file = repoPath(key);
      for (const { line, place } of tails(key, source)) {
        if (EXCEPTIONS.some((e) => e.file === file && e.place === place))
          continue;
        problems.push(`${file}:${line}  ${place}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("예외 목록의 자리는 아직 소스에 있다(고쳐서 없어지면 목록에서도 지운다)", () => {
    const stale = EXCEPTIONS.filter(({ file, place }) => {
      const key = Object.keys(files).find((k) => repoPath(k) === file);
      return (
        !key || !tails(key, files[key] as string).some((t) => t.place === place)
      );
    }).map((e) => `${e.file}  ${e.place}`);
    expect(stale).toEqual([]);
  });
});
