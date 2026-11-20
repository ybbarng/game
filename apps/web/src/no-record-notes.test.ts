/*
 * 덧붙임 문구 금지(docs/standing-rules.md 3절 「동작 힌트·덧붙임 문구를 넣지 않는다」)의 기계 점검.
 * 큐브 화면과 Cubie 앱 창에 「기록은 이 기기에만 저장돼요.」·「Cubie 기록 기준이에요.」처럼 기록이 어디에 저장되는지,
 * 어느 기록을 기준으로 매기는지 알리는 안내가 다시 들어오면 실패한다. 2026-11-20 사용자 「잡스런 문구 없애주고」,
 * 「매번 말하는 게 지쳐서 그래」: 3절이 이미 있었는데 2026-11-18에 「티어 화면은 어느 기록 기준인지 밝힌다」는 규칙이
 * 더해져 이 문구가 다시 생겼다. 어느 기록을 읽는지는 화면 글이 아니라 시험이 본다(앱 `TierSheetTests`
 * 「tiersWindowUsesCubieRecordsLikeRecordsWindow」, 화면 시험 `cube-tiers.spec.ts` 「Cubie 창(records=cubie)…」의
 * `data-cube-tier-basis` 속성).
 *
 * 저장 위치가 본문 내용인 곳(숫자야구·윷놀이의 「비밀 수는 각자 기기에만」, 보안 설명, 별 따기 패스키 도움말)은
 * 공정성·보안 설명이라 범위 밖이다.
 */
import { describe, expect, it } from "vitest";
import { sourceTexts } from "@/lib/source-texts";

/** 사이트 큐브 화면 소스(시험·시험 자료는 뺀다) */
const SITE: Record<string, string> = import.meta.glob(
  [
    "./cube/**/*.{ts,tsx}",
    "./app/cube/**/*.{ts,tsx}",
    "!./**/*.test.{ts,tsx}",
    "!./**/*-fixture.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

/** Cubie 앱 소스(앱이 직접 그리는 창의 글 상수와 화면) */
const APP: Record<string, string> = import.meta.glob(
  "../../cubie/Sources/**/*.swift",
  { query: "?raw", import: "default", eager: true },
);

/**
 * 금지 문구. 기록이 어디에 저장되는지(「기기에만」, 「이 기기에 저장」, 「이 기기에 남」)와
 * 어느 기록을 기준으로 매기는지(「기록 기준」, 「사이트 혼자 맞추기 기록과는 따로 매겨요」)를 알리는 안내
 */
const BANNED: readonly RegExp[] = [
  /기기에만/,
  /이 기기에 (저장|남)/,
  /기록 기준/,
  /기록과는 따로 매겨요/,
];

/** Swift 소스의 문자열 글(주석은 뺀다). 여러 줄 글(`"""`)도 줄마다 따옴표 안을 본다 */
function swiftTexts(src: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let multi = false;
  for (const [i, raw] of src.split("\n").entries()) {
    if (multi) {
      if (raw.includes('"""')) multi = false;
      else out.push({ text: raw.trim(), line: i + 1 });
      continue;
    }
    if (/"""\s*$/.test(raw)) {
      multi = true;
      continue;
    }
    // 따옴표 밖의 `//`부터는 주석
    let inString = false;
    let cur = "";
    for (let j = 0; j < raw.length; j++) {
      const c = raw[j];
      if (inString) {
        if (c === "\\") {
          cur += c + (raw[j + 1] ?? "");
          j++;
        } else if (c === '"') {
          out.push({ text: cur, line: i + 1 });
          cur = "";
          inString = false;
        } else cur += c;
      } else if (c === '"') inString = true;
      else if (c === "/" && raw[j + 1] === "/") break;
    }
  }
  return out;
}

function problems(
  files: Record<string, string>,
  texts: (src: string) => { text: string; line: number }[],
): string[] {
  const out: string[] = [];
  for (const [file, src] of Object.entries(files))
    for (const t of texts(src))
      if (BANNED.some((b) => b.test(t.text)))
        out.push(`${file}:${t.line} 「${t.text}」`);
  return out;
}

describe("큐브 화면·Cubie 앱 창에 기록 저장 위치·기준 안내 문구가 없다(고정 규칙 3절)", () => {
  it("사이트 큐브 화면 글", () => {
    expect(Object.keys(SITE).length).toBeGreaterThan(50);
    expect(problems(SITE, sourceTexts)).toEqual([]);
  });

  it("Cubie 앱 글", () => {
    expect(Object.keys(APP).length).toBeGreaterThan(20);
    expect(problems(APP, swiftTexts)).toEqual([]);
  });

  it("점검이 지운 문구를 실제로 잡는다", () => {
    const site =
      'export const X = <p>기록은 이 기기에만 저장돼요.</p>;\nconst y = "Cubie 기록 기준이에요.";';
    expect(problems({ "a.tsx": site }, sourceTexts)).toEqual([
      "a.tsx:1 「기록은 이 기기에만 저장돼요.」",
      "a.tsx:2 「Cubie 기록 기준이에요.」",
    ]);
    const app =
      '  public static let deviceOnly = "Cubie 기록 기준이에요. 기록은 이 기기에만 저장돼요."\n  // 주석 속 「Cubie 기록 기준」은 보지 않는다\n  let u = "https://game.byb.kr" // 기기에만';
    expect(problems({ "A.swift": app }, swiftTexts)).toEqual([
      "A.swift:1 「Cubie 기록 기준이에요. 기록은 이 기기에만 저장돼요.」",
    ]);
  });
});
