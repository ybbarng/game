// 큐브 배우기 화면 글에 고정 규칙 1절이 막은 틀 문장·가리킴말과 2절이 화면 글에서 뺀 낱말 「과정」·「단원」이 없는지 본다
// (docs/standing-rules.md 1·2절, 2026-11-28 사용자 「문제를 찾았으면 고쳐야지」). 배우기 구조 이름은 해법 > 강의 > n강 > 쪽,
// 맞추는 차례는 단계·걸음이다(docs/47 1-1). 글은 강의마다 강의 이름·요약, 강 이름·요약, 쪽 글(문제·설명·덩어리 포함)과
// 해 보기 목표 글(GOALS)이다.
import { describe, expect, it } from "vitest";

import { sourceTexts } from "@/lib/source-texts";

import { COURSES } from "./courses";
import { stepText } from "./term-places";
import { GOALS } from "./types";

interface Place {
  where: string;
  text: string;
}

function places(): Place[] {
  const out: Place[] = [];
  for (const c of COURSES) {
    out.push({
      where: `${c.id} 강의 이름·요약`,
      text: `${c.title}\n${c.summary}`,
    });
    for (const s of c.stages ?? [])
      out.push({ where: `${c.id} 단계 ${s.title}`, text: s.title });
    for (const l of c.lessons) {
      out.push({
        where: `${l.id} 강 이름·요약`,
        text: `${l.title}\n${l.summary}`,
      });
      for (const [i, s] of l.steps.entries())
        out.push({ where: `${l.id} ${i + 1}쪽`, text: stepText(s) });
    }
  }
  for (const [name, text] of Object.entries(GOALS))
    out.push({ where: `목표 ${name}`, text });
  return out;
}

/** 사이트 큐브 화면 소스(시험·시험 자료는 뺀다). 강 글 자료도 들지만 위 `places`가 이미 보는 글과 같다 */
const CUBE_SOURCES: Record<string, string> = import.meta.glob(
  [
    "../**/*.{ts,tsx}",
    "../../app/cube/**/*.{ts,tsx}",
    "!../**/*.test.{ts,tsx}",
    "!../**/*-fixture.ts",
    "!../**/__test__/**",
    // 네이티브 공통 시험 자료(화면 글이 아니다)
    "!../native/**",
  ],
  { query: "?raw", import: "default", eager: true },
);

/** 화면 글에서 뺀 낱말(2절 배우기 구조 이름). 「과정」은 일반어 꼴(「맞추는 과정」 등)도 쓰지 않아 예외가 없다 */
const BANNED_WORDS = /과정|단원/;

/**
 * 1절 틀 문장·가리킴말: 「이번 ○○에서는」, 「이 ○○에서는」, 「화면의 큐브는 …상태예요」. 「앞 단원에서」·「앞 과정」은
 * 낱말 시험이 잡는다. 앞 강의 내용을 가리켜야 하면 「앞 강」·「○강 「…」」처럼 구조 이름으로 부른다
 */
const FRAMES = [
  /이번 (강|강의|쪽)에서는/,
  /이 (강|강의|쪽)에서는/,
  /화면의 \S+는[^.]*상태예요/,
];

/** 걸린 곳마다 그 문장(실패 글에 고칠 문장이 바로 보이게) */
const hits = (re: RegExp) =>
  places().flatMap((p) =>
    p.text
      .split(/(?<=[.?!])\s+|\n/)
      .filter((s) => re.test(s))
      .map((s) => `${p.where}: ${s}`),
  );

describe("큐브 배우기 화면 글의 구조 낱말과 첫머리 틀(standing-rules 1·2절)", () => {
  it("화면 글에 「과정」·「단원」을 쓰지 않는다(강의·강·쪽으로 부른다)", () => {
    expect(hits(BANNED_WORDS)).toEqual([]);
  });

  it("큐브 화면 소스의 글(단추·제목·안내, 시연 출처 메모 `source` 빼고)에도 「과정」·「단원」이 없다", () => {
    const found = Object.entries(CUBE_SOURCES).flatMap(([file, src]) =>
      sourceTexts(src)
        .filter((t) => t.key !== "source" && BANNED_WORDS.test(t.text))
        .map((t) => `${file}:${t.line}: ${t.text}`),
    );
    expect(found).toEqual([]);
  });

  it("「이번 강에서는」·「이 강의에서는」 같은 가리킴 틀과 「화면의 큐브는 …상태예요」로 열지 않는다", () => {
    expect(FRAMES.flatMap(hits)).toEqual([]);
  });
});
