/*
 * 템플릿 자리(`${…}`) 바로 뒤에 받침에 따라 바뀌는 조사(이/가·은/는·을/를·와/과·으로/로·이에요/예요)를
 * 그대로 붙인 글을 잡는다(docs/standing-rules.md 3절 「이름·카드·수 뒤 조사는 조사 도우미로」).
 * 「${카드}가 두 번 나왔어요」는 카드가 ♠10이면 「♠10가」가 된다. 자리 값을 모르니 `subj`·`obj` 등
 * (`@game/mighty-engine/josa`, 웹은 `lib/josa`)으로 고른다.
 * 보는 곳: 엔진·화투·멘탈 포커·컴퓨터 패키지의 소스(거절 사유·검증 실패 사유·오류 글)와 웹 온라인 방(`net/`).
 */
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: 소스에서 찾은 템플릿 자리를 글 그대로 적어 견준다
import { describe, expect, it } from "vitest";

const files: Record<string, string> = import.meta.glob(
  [
    "./net/**/*.ts",
    "../../../packages/{engine,*-engine,hwatu,fair-play,ai,*-ai}/src/**/*.ts",
    "!./**/*.test.ts",
    "!../../../packages/**/*.test.ts",
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
];

/** 조사 꼴. 긴 것부터 맞춘다(「이에요」를 「이」로 자르지 않게) */
const TAIL = /^(이에요|예요|으로|이|가|은|는|을|를|와|과|로)(?![가-힣])/;

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
    const tail = TAIL.exec(source.slice(end + 1, end + 5));
    if (!tail) continue;
    found.push({
      line: source.slice(0, at).split("\n").length,
      place: source.slice(at, end + 1) + tail[1],
    });
  }
  return found;
}

/** glob 열쇠(「./net/…」·「../../../packages/…」)를 저장소 기준 경로로 */
const repoPath = (key: string) =>
  key.startsWith("./")
    ? `apps/web/src/${key.slice(2)}`
    : key.replace(/^(\.\.\/)+/, "");

describe("템플릿 자리 뒤 조사", () => {
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

  it("엔진·멘탈 포커·컴퓨터·온라인 방 글은 자리 뒤 조사를 도우미로 고른다", () => {
    expect(Object.keys(files).length).toBeGreaterThan(100);
    const problems: string[] = [];
    for (const [key, source] of Object.entries(files)) {
      const file = repoPath(key);
      for (const { line, place } of bareTails(source)) {
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
        !key || !bareTails(files[key] as string).some((t) => t.place === place)
      );
    }).map((e) => `${e.file}  ${e.place}`);
    expect(stale).toEqual([]);
  });
});
