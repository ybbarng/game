import { describe, expect, it } from "vitest";

/**
 * 큐브 전개도를 화면에 다시 들이지 않는다(docs/standing-rules.md 2-1절, 2026-11-10 사용자 「내가 전개도를 말한 것도
 * 수차례 말해서 이제야 겨우 거의 없어지지 않았나. 아직도 어디 남아 있을지도 몰라. 사실 믿을 수가 있어야지」).
 *
 * 「큐브 전개도」는 여섯 면을 십자(또는 펼친) 배치로 모두 보이는 그림이다. 뒤쪽은 거울 판·끌어 둘러보기, 섞인 모습·목표는
 * 비스듬한 큐브 그림 둘(`CubePoster`)로 보인다.
 * OLL·PLL 상황 그림(`AlgPicture`, 윗면 평면도 + 옆면 윗줄)은 전개도와 다른 것이고 있어야 하는 그림이다(사용자
 * 「OLL, PLL과 같은 건 당연히 평면도가 같이 있는 게 좋아. 내가 말한 건 큐브 전개도야」). 그래서 아래 검사는 평면도를
 * 예외로 빼 두지 않는다. 평면도는 윗면과 옆면만 쓰고 아랫면을 그리지 않으니 처음부터 검사에 걸리지 않는다.
 *
 * 검사 셋:
 * 1. 화면 글(주석을 뺀 코드의 문자열·JSX 글)에 「전개도」「펼친 그림」「펼친 큐브」가 없다
 * 2. 전개도 부품 이름(`CubeNet`·`NetView`·`Unfolded`·`FlatCube` 꼴)을 새로 두지 않는다
 * 3. 면 색 배열(`faceGrid`·`faceColors`)로 그리는 화면(.tsx)이 아랫면(D, 3번)을 읽거나 여섯 면을 다 돌지 않는다.
 *    한 화면에 여섯 면을 모두 늘어놓는 것이 전개도다(뒤쪽 셋은 거울 판이 3D 장면 안에서 비춘다)
 *
 * 파일은 `import.meta.glob`(?raw)으로 읽어 모듈 그래프에 잡히므로 `vitest --changed`도 바뀐 화면이 있으면 이 시험을 돌린다.
 */

declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}

const SOURCES = import.meta.glob<string>(
  [
    "./**/*.{ts,tsx}",
    "../app/cube/**/*.{ts,tsx}",
    "!./**/*.test.{ts,tsx}",
    "!./**/*-test-util.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

const NET_WORDS = ["전개도", "펼친 그림", "펼친 큐브"];

/**
 * 주석을 빈칸으로 바꾼다(줄 수는 그대로). 문자열·템플릿 안의 `//`·`/*`는 건드리지 않는다. 정규식 글자는 따로 보지
 * 않는다(이 저장소 화면 코드의 정규식에는 따옴표가 거의 없다. 어긋나면 이 시험이 아니라 검사 결과가 넓어질 뿐이다)
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i] as string;
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 화면 글에 나온 전개도 낱말(「줄: 낱말」) */
function netWordsIn(src: string): string[] {
  const lines = stripComments(src).split("\n");
  const hits: string[] = [];
  lines.forEach((line, i) => {
    for (const w of NET_WORDS)
      if (line.includes(w)) hits.push(`${i + 1}: ${w}`);
  });
  return hits;
}

/** 이름 마디로 Net·Unfold(ed)·Flat이 든 이름인지(`CubeNet`, `NetView`, `UnfoldedCube`, `FlatCube`) */
const NET_NAME = /(?:^|[a-z])(?:Net|Unfold(?:ed)?|Flat)(?:[A-Z]|$)/;

/** 새로 두는 함수·부품·상수 이름 가운데 전개도 꼴 이름 */
function netNamesIn(src: string): string[] {
  const code = stripComments(src);
  const names = [
    ...code.matchAll(
      /\b(?:function|class|interface|type)\s+([A-Za-z_$][\w$]*)/g,
    ),
    ...code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=:]/g),
  ].map((m) => m[1] as string);
  return names.filter((n) => NET_NAME.test(n));
}

/** 면 색 배열로 그리는 화면이 아랫면을 읽거나 여섯 면을 다 도는 자리 */
function allFacesDrawnIn(src: string): string[] {
  const code = stripComments(src);
  if (!/\b(?:faceGrid|faceColors)\s*\(/.test(code)) return [];
  const signs: [string, RegExp][] = [
    ["아랫면 번호(D = 3)", /\bD\s*=\s*3\b/],
    ["아랫면 칸 읽기(faces[3])", /\bfaces\??\.?\[\s*3\s*\]/],
    [
      "여섯 면 돌기(faces.map·forEach)",
      /\bfaces\.(?:map|forEach|flatMap)\s*\(/,
    ],
    ["여섯 면 돌기(f < 6)", /\b\w+\s*<\s*6\b/],
    ["여섯 칸 만들기(length: 6)", /\blength\s*:\s*6\b/],
  ];
  return signs.filter(([, re]) => re.test(code)).map(([name]) => name);
}

const files = Object.entries(SOURCES).map(([path, src]) => ({ path, src }));

describe("큐브 전개도를 화면에 들이지 않는다", () => {
  it("읽을 화면 파일이 있다(glob이 비면 검사가 헛돈다)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.path.endsWith("/AlgPicture.tsx"))).toBe(true);
    expect(files.some((f) => f.path.includes("../app/cube/"))).toBe(true);
  });

  it("화면 글에 「전개도」「펼친 그림」이 없다", () => {
    const hits = files.flatMap(({ path, src }) =>
      netWordsIn(src).map((h) => `${path}:${h}`),
    );
    expect(hits).toEqual([]);
  });

  it("전개도 꼴 이름의 부품을 두지 않는다", () => {
    const hits = files.flatMap(({ path, src }) =>
      netNamesIn(src).map((n) => `${path}: ${n}`),
    );
    expect(hits).toEqual([]);
  });

  it("면 색 배열로 그리는 화면이 여섯 면을 늘어놓지 않는다(평면도는 윗면·옆면만 써서 걸리지 않는다)", () => {
    const hits = files
      .filter(({ path }) => path.endsWith(".tsx"))
      .flatMap(({ path, src }) =>
        allFacesDrawnIn(src).map((s) => `${path}: ${s}`),
      );
    expect(hits).toEqual([]);
  });
});

describe("검사 자체", () => {
  it("주석 속 낱말은 보지 않고 글 속 낱말은 잡는다", () => {
    expect(
      netWordsIn("// 전개도는 없앴다\n/* 펼친 그림 */ const a = 1;"),
    ).toEqual([]);
    expect(netWordsIn('const t = "전개도로 보기";')).toEqual(["1: 전개도"]);
    expect(netWordsIn("<p>펼친 그림</p>")).toEqual(["1: 펼친 그림"]);
    expect(netWordsIn('const u = "https://a.b/c"; // 전개도')).toEqual([]);
  });

  it("전개도 꼴 이름을 잡고 비슷한 다른 이름은 넘긴다", () => {
    expect(netNamesIn("function CubeNet() {}")).toEqual(["CubeNet"]);
    expect(netNamesIn("export function NetView() {}")).toEqual(["NetView"]);
    expect(netNamesIn("const UnfoldedCube = () => null;")).toEqual([
      "UnfoldedCube",
    ]);
    expect(netNamesIn("function FlatCube() {}")).toEqual(["FlatCube"]);
    expect(
      netNamesIn(
        "function isLocalNet() {}\nconst network = 1;\nconst flatten = 2;",
      ),
    ).toEqual(["isLocalNet"]);
    expect(netNamesIn("const planet = 1; function Netflix() {}")).toEqual([]);
  });

  it("여섯 면 전개도는 잡고 윗면 평면도(OLL·PLL 상황 그림)는 정상으로 넘긴다", () => {
    const net = `
      const faces = faceGrid(n, state);
      const D = 3;
      return faces.map((cells, f) => <Face key={f} at={CROSS[f]} cells={cells} />);
    `;
    expect(allFacesDrawnIn(net).length).toBeGreaterThan(0);
    const plan = `
      const faces = faceGrid(n, state);
      const U = 0; const R = 1; const F = 2; const L = 4; const B = 5;
      for (let k = 0; k < n * n; k++) rects.push(fill(U, k));
      for (const side of [B, L, R, F]) strip(side);
    `;
    expect(allFacesDrawnIn(plan)).toEqual([]);
  });
});
