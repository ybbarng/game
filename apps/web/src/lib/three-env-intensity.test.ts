import { describe, expect, it } from "vitest";

/**
 * 재질 반사 세기(`envMapIntensity`)를 효과 없이 두지 않는다(docs/standing-rules.md 4절, 2026-11-16).
 *
 * three(r169)는 장면에 반사 지도(`scene.environment`)를 걸고 재질에 제 반사 지도(`envMap`)가 없으면, WebGL·WebGPU 모두
 * 재질의 `envMapIntensity` 대신 장면의 `environmentIntensity`를 쓴다(WebGLRenderer `setProgram`). 이 사이트의 3D 장면은
 * 모두 장면 반사 지도를 쓰므로(큐브 화면·엠블럼·별 따기 훈장), 재질에 1이 아닌 반사 세기를 두면 아무 일도 하지 않고
 * 읽는 사람만 속인다(엠블럼 틀 0.7·금속 1.3, 큐브 스티커 0.5, 훈장 리본 0.35 등이 그랬다). 세기를 바꾸려면 장면의
 * `environmentIntensity`를 바꾸고, 재질 하나만 다르게 하려면 그 재질에 `envMap`도 함께 건다.
 *
 * 검사: 주석을 뺀 코드에서 `envMapIntensity`를 1이 아닌 값으로 두는 파일은 같은 파일에서 재질에 `envMap`을 건다.
 * 파일은 `import.meta.glob`(?raw)으로 읽어 모듈 그래프에 잡히므로 `vitest --changed`도 바뀐 3D 파일이 있으면 이 시험을 돌린다.
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
  ["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);

/** 주석을 빈칸으로 바꾼다(문자열 안의 `//`·`/*`는 그대로) */
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
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 1이 아닌 값으로 두는 재질 반사 세기(`envMapIntensity: 0.5`, `m.envMapIntensity = x` 꼴) */
function nonUnitIntensities(code: string): string[] {
  const found: string[] = [];
  const re = /\benvMapIntensity\s*(?::|=(?!=))\s*([^,;\n}]+)/g;
  for (const m of code.matchAll(re)) {
    const v = (m[1] ?? "").trim();
    if (!/^1(\.0*)?$/.test(v)) found.push(m[0].trim());
  }
  return found;
}

/** 재질에 제 반사 지도를 거는가(`envMap: tex`, `m.envMap = tex`) */
function setsMaterialEnvMap(code: string): boolean {
  return /\benvMap\s*(?::|=(?!=))/.test(code);
}

describe("재질 반사 세기", () => {
  it("검사 규칙: 1이 아닌 값만 잡고, 제 반사 지도를 건 재질은 놓아준다", () => {
    expect(nonUnitIntensities("new M({ envMapIntensity: 0.5 })")).toEqual([
      "envMapIntensity: 0.5",
    ]);
    expect(nonUnitIntensities("m.envMapIntensity = GEM;")).toEqual([
      "envMapIntensity = GEM",
    ]);
    expect(nonUnitIntensities("new M({ envMapIntensity: 1 })")).toEqual([]);
    expect(nonUnitIntensities("if (m.envMapIntensity === 2) f();")).toEqual([]);
    expect(
      setsMaterialEnvMap("new M({ envMap: tex, envMapIntensity: 2 })"),
    ).toBe(true);
    expect(setsMaterialEnvMap("textureCubeUV( envMap, r )")).toBe(false);
  });

  it("장면 반사 지도를 쓰는 사이트에서 재질 반사 세기를 효과 없이 두지 않는다", () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(SOURCES)) {
      const code = stripComments(src);
      const found = nonUnitIntensities(code);
      if (found.length > 0 && !setsMaterialEnvMap(code))
        bad.push(`${file}: ${found.join(", ")}`);
    }
    expect(
      bad,
      "장면 반사 지도가 있으면 재질의 envMapIntensity는 효과가 없다. 장면 environmentIntensity를 바꾸거나 그 재질에 envMap을 함께 건다",
    ).toEqual([]);
  });

  it("검사가 3D 파일을 실제로 읽는다", () => {
    const files = Object.keys(SOURCES);
    for (const f of [
      "../cube/view/cube-view.ts",
      "../stardraw/medal/medal-scene.ts",
      "../cube/tiers/emblem3d/scene.ts",
    ])
      expect(files).toContain(f);
  });
});
