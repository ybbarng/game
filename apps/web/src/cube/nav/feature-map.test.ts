import { describe, expect, it } from "vitest";

import {
  earlyUses,
  type OrderedTerm,
  type TextPlace,
} from "@/tutorial/term-order";

import { loosePieceWords } from "../learn/glossary-333";
import { FEATURE_MAP, MAP_INTRO } from "./feature-map";

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

// 큐브 page 파일 목록. import.meta.glob(?raw, 글로만 읽는다)으로 얻어 page 파일이 모듈 그래프에 잡힌다. 그래서 page를
// 고치거나 더하면 `vitest --changed`가 이 시험을 돌린다(예전 forceRerunTriggers는 큐브 page 하나만 바뀌어도 단위 시험
// 전부를 돌렸다, 2026-11-10). 불러오지 않는 glob(eager 없이)이나 `Object.keys(import.meta.glob(…))`처럼 바로 키만
// 쓰는 꼴은 vite가 import를 빼 버려 그래프에 잡히지 않는다. 그래서 결과를 상수에 담은 뒤 키를 읽는다.
// 키는 "../../app/cube/solo/page.tsx" 꼴
const PAGE_SOURCES = import.meta.glob<string>("../../app/cube/**/page.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});
const PAGES = new Set(
  Object.keys(PAGE_SOURCES).map((k) =>
    k.replace(/^\.\.\/\.\.\/app/, "").replace(/\/page\.tsx$/, ""),
  ),
);

describe("기능 지도", () => {
  const items = FEATURE_MAP.flatMap((s) => s.items);

  it("주소마다 page가 있다", () => {
    for (const { href } of items) {
      const path = href.split("?")[0] as string;
      expect(PAGES.has(path), href).toBe(true);
    }
  });

  it("같은 주소를 두 번 적지 않는다", () => {
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("미니 모드·개발용 화면은 넣지 않는다", () => {
    for (const { href } of items)
      expect(href).not.toMatch(/^\/cube\/(mini|lab|tiers\/emblems)/);
  });
});

// 처음 오는 사람이 위에서 아래로 읽는다. 해법·기능 이름은 하는 일로 먼저 풀고, 뜻을 알린 뒤에 쓴다(docs/standing-rules.md 1·3절)
describe("기능 지도 글", () => {
  const items = FEATURE_MAP.flatMap((s) => s.items);
  const PLACES: TextPlace[] = [
    { where: "첫 글", group: 0, text: MAP_INTRO },
    ...items.map((i) => ({
      where: i.title,
      group: 0,
      text: `${i.title}\n${i.what}`,
    })),
  ];
  const TERMS: OrderedTerm[] = [
    { term: "표기", use: /표기/, define: /글자인 표기/ },
    { term: "공식", use: /공식/, define: /돌리기 묶음인 짧은 공식/ },
    {
      term: "CFOP·루·ZZ",
      use: /CFOP|ZZ/,
      define: /이름이 CFOP·루·ZZ인 빠른 해법/,
    },
    { term: "티어", use: /티어/, define: /등급인 티어/ },
    { term: "센터 블럭", use: /센터 블럭/, define: /조각인 센터 블럭/ },
    { term: "엣지 블럭", use: /엣지 블럭/, define: /조각인 엣지 블럭/ },
    { term: "블라인드", use: /블라인드/, define: /가리고 맞추는 블라인드/ },
    { term: "핑거 트릭", use: /핑거 트릭/, define: /돌리는 법인 핑거 트릭/ },
  ];

  it("뜻을 알린 뒤에 쓴다", () => {
    expect(earlyUses(PLACES, TERMS)).toEqual([]);
  });

  it("설명 글에 풀지 않은 전문 낱말을 쓰지 않는다", () => {
    for (const { title, what } of items)
      for (const w of ["체력바", "패리티", "오르테가", "PLL", "서버", "그리기"])
        expect(what, title).not.toContain(w);
  });

  it("설명은 끝맺은 문장이다", () => {
    expect(MAP_INTRO).toMatch(/\.$/);
    for (const { title, what } of items) expect(what, title).toMatch(/\.$/);
  });

  it("묶음 이름과 칸 이름, 칸 아이콘이 겹치지 않는다", () => {
    const sections = new Set(FEATURE_MAP.map((s) => s.title));
    for (const { title } of items)
      expect(sections.has(title), title).toBe(false);
    const icons = items.map((i) => i.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("홀로 쓴 엣지·코너·센터가 없다", () => {
    expect(items.flatMap((i) => loosePieceWords(i.what))).toEqual([]);
  });
});
