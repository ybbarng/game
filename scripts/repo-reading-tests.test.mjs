import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import config from "../vitest.config.ts";

/**
 * 파일을 직접 읽는 단위 시험은 그 파일이 바뀌면 돈다(2026-11-17, docs/38 16절).
 *
 * `vitest --changed`(CI·push 전 검사)는 바뀐 파일을 import로 불러오는 시험만 고른다. `readFileSync`·`readdirSync`나
 * 다른 프로그램 실행으로 저장소를 읽는 시험은 모듈 그래프에 안 잡혀, 읽는 파일이 바뀌어도 돌지 않는다. 2026-11-17
 * main에서 `affected-e2e.test.mjs`가 두 번 깨진 채 남았다(새 spec이 묶음에 안 듦, 시험 자료가 모든 엔진을 불러옴).
 *
 * 그런 시험은 셋 가운데 하나에 든다.
 * - 늘 도는 묶음(package.json `test:always`): 저장소 전체를 읽는 시험. CI의 바뀐 단위 시험 뒤와 `test:changed`가 늘 돌린다
 * - 좁은 계기(vitest.config.ts `forceRerunTriggers`): 그림·생성 파일처럼 import로 못 읽는 좁은 입력. 바뀌면 전부 돈다
 * - 임시 폴더만: 시험이 만든 임시 폴더만 읽는다(저장소 입력이 없다)
 * 되도록 `import.meta.glob`(?raw, eager)으로 읽어 이 목록에 넣지 않는 것이 먼저다.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 좁은 계기로 덮인 시험 → 그 시험이 읽는 입력을 덮는 forceRerunTriggers 항목 */
const COVERED = {
  "apps/web/src/stats/pinned-script.test.ts": ["**/apps/web/public/stats/**"],
  "apps/web/src/cube/tiers/emblem3d/poster.test.ts": [
    "**/apps/web/public/cube/tiers/emblem3d/**",
    "**/apps/cubie/Resources/Emblems/**",
  ],
  "apps/web/src/cube/components/CubePoster.test.tsx": [
    "**/apps/web/public/cube/hero/**",
  ],
  "packages/stardraw-cli/src/site.test.ts": [
    "**/apps/web/scripts/build-hashes.mjs",
  ],
};

/** 시험이 만든 임시 폴더(별 따기 서버·검증 도구의 장부)만 읽는 파일 */
const TEMP_ONLY = [
  "apps/stardraw-server/src/bundle.test.ts",
  "apps/stardraw-server/src/early-seal.test.ts",
  "apps/stardraw-server/src/light.test.ts",
  "apps/stardraw-server/src/mirror.test.ts",
  "apps/stardraw-server/src/qual.test.ts",
  "apps/stardraw-server/src/restore.test.ts",
  "apps/stardraw-server/src/seal-rotate.test.ts",
  "apps/stardraw-server/src/testing.ts",
  "packages/stardraw-cli/src/evidence.test.ts",
];

/** 단위 시험 파일과 시험 전용 도우미 */
const TEST_FILE =
  /(\.test\.[cm]?[jt]sx?|-suite\.[cm]?[jt]sx?|-test-util\.[cm]?[jt]sx?|\/testing\.[cm]?[jt]s)$/;
/** 저장소를 읽거나 다른 프로그램을 돌리는 꼴 */
const READS =
  /\b(readFileSync|readdirSync|existsSync|statSync|lstatSync|opendirSync|cpSync|createReadStream|readFile|readdir|execFileSync|execSync|spawnSync|execFile|spawn)\s*\(/;
const SKIP_DIRS = new Set(["node_modules", "out", "dist", "target"]);

function testFiles(dir, out = []) {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) testFiles(rel, out);
    else if (TEST_FILE.test(rel)) out.push(rel);
  }
  return out;
}

/** 줄 주석·덩이 주석을 지운 글(설명 속 낱말은 세지 않는다) */
const noComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function alwaysRun() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const cmd = pkg.scripts["test:always"];
  expect(cmd).toMatch(/^vitest run /);
  return cmd.split(/\s+/).slice(2);
}

describe("파일을 직접 읽는 단위 시험", () => {
  const readers = ["apps", "packages", "scripts"]
    .flatMap((d) => testFiles(d))
    .filter((f) =>
      READS.test(noComments(readFileSync(path.join(ROOT, f), "utf8"))),
    )
    .sort();

  it("늘 도는 묶음·좁은 계기·임시 폴더만 가운데 하나에 든다(새로 생기면 목록에 더하고, 되도록 import.meta.glob으로)", () => {
    const listed = [
      ...alwaysRun(),
      ...Object.keys(COVERED),
      ...TEMP_ONLY,
    ].sort();
    expect(readers).toEqual(listed);
  });

  it("좁은 계기로 덮었다고 적은 항목이 vitest.config.ts forceRerunTriggers에 있다", () => {
    const triggers = config.test.forceRerunTriggers;
    for (const [file, wants] of Object.entries(COVERED))
      for (const w of wants) expect(triggers, file).toContain(w);
  });

  it("늘 도는 묶음은 CI 단위 시험 단계와 push 전 검사(test:changed)가 함께 돌린다", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(ROOT, "package.json"), "utf8"),
    );
    expect(pkg.scripts["test:changed"]).toContain("pnpm test:always");
    const ci = readFileSync(
      path.join(ROOT, ".github/workflows/ci.yml"),
      "utf8",
    );
    expect(ci).toContain("pnpm test:always");
    for (const f of alwaysRun())
      expect(readdirSync(path.join(ROOT, path.dirname(f)))).toContain(
        path.basename(f),
      );
  });
});
