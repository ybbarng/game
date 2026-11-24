import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 멘탈 포커 시험 난수원(`@game/fair-play/test-random`)은 시험·시험 틀만 부른다(docs/13 8절 「시험」).
 *
 * 방(HostRoom·GuestRoom)과 판·기기는 `testRandom`을 받으면 섞기 순서·열쇠·비밀 값을 씨앗으로 정한다. 씨앗 난수원은
 * 암호용이 아니라, 제품 코드가 이것을 만들어 넘기면 남이 패를 미리 계산할 수 있다. 만드는 함수 `seededTestRandom`은
 * 하위 경로로만 내보내고(묶음 `@game/fair-play`에는 타입만), 이 시험이 제품 소스에서 그 경로를 부르지 않는지 본다.
 * 저장소 전체를 읽으므로 늘 도는 묶음(`test:always`)에 든다.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", "out", "dist", "target", ".next"]);
const SOURCE = /\.(ts|tsx|mts|mjs|js)$/;

/** 시험 파일과 시험 틀(`*-fixture.ts`, 여러 시험이 함께 쓰는 경우 `*-case.ts`) */
const TEST_ONLY =
  /(\.test\.[cm]?[jt]sx?|\.strength\.ts|-suite\.[cm]?[jt]sx?|-fixture\.ts|-case\.ts|-test-util\.ts)$/;

/** 씨앗 난수원 값(함수)을 부르는 꼴. `import type`은 값이 아니라 괜찮다 */
const VALUE_IMPORT =
  /import\s+(?!type\b)[^;]*?from\s+["'](@game\/fair-play\/test-random|\.{1,2}\/(?:[\w-]+\/)*test-random)["']/;
const DYNAMIC_IMPORT =
  /import\(\s*["'](@game\/fair-play\/test-random|\.{1,2}\/(?:[\w-]+\/)*test-random)["']\s*\)/;

function sources(dir, out = []) {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) sources(rel, out);
    else if (SOURCE.test(rel)) out.push(rel);
  }
  return out;
}

function importsSeeded(text) {
  return VALUE_IMPORT.test(text) || DYNAMIC_IMPORT.test(text);
}

describe("멘탈 포커 시험 난수원", () => {
  const files = [...sources("apps"), ...sources("packages")];

  it("제품 소스는 씨앗 난수원을 부르지 않는다(시험·시험 틀만)", () => {
    const found = files.filter(
      (f) =>
        !TEST_ONLY.test(f) &&
        f !== "packages/fair-play/src/test-random.ts" &&
        importsSeeded(readFileSync(path.join(ROOT, f), "utf8")),
    );
    expect(found).toEqual([]);
  });

  it("시험 틀은 실제로 씨앗 난수원을 부른다(검사가 빈 목록을 보지 않는다)", () => {
    const users = files.filter((f) =>
      importsSeeded(readFileSync(path.join(ROOT, f), "utf8")),
    );
    expect(users).toContain("apps/web/src/hwatu/fair-room-fixture.ts");
    expect(users).toContain("apps/web/src/net/fair-room-fixture.ts");
    expect(users).toContain("apps/web/src/net/room-random-fixture.ts");
  });

  it("묶음 `@game/fair-play`은 만드는 함수를 내보내지 않는다(타입만)", () => {
    const index = readFileSync(
      path.join(ROOT, "packages/fair-play/src/index.ts"),
      "utf8",
    );
    expect(index).not.toMatch(/export\s+\*\s+from\s+["']\.\/test-random["']/);
    expect(index).not.toMatch(/export\s+\{[^}]*seededTestRandom/);
  });

  it("부르는 꼴을 알아본다", () => {
    expect(
      importsSeeded(
        'import { seededTestRandom } from "@game/fair-play/test-random";',
      ),
    ).toBe(true);
    expect(
      importsSeeded('import { seededTestRandom } from "./test-random";'),
    ).toBe(true);
    expect(importsSeeded('await import("@game/fair-play/test-random")')).toBe(
      true,
    );
    expect(
      importsSeeded('import type { SeededTestRandom } from "./test-random";'),
    ).toBe(false);
  });
});
