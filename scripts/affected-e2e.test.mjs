import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASE_SPECS,
  loadContext,
  packageOwner,
  readGameIds,
  selectE2e,
  shardCount,
  webAreaOf,
} from "./affected-e2e.mjs";

// 고르기는 저장소의 지금 모습(registry, spec 목록, import, package.json)을 읽는다. 그래서 시험도 진짜 저장소로 본다
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = loadContext(ROOT);
const pick = (...files) => selectE2e(ctx, files);
const cubeSpecs = ctx.specs.filter((s) => s.startsWith("cube-"));

describe("게임과 spec 짝", () => {
  it("registry.ts의 게임은 모두 묶음이 된다", () => {
    for (const id of ["mighty", "hearts", "cube", "stardraw", "galaxy"]) {
      expect(ctx.areas[id]).toBeDefined();
    }
  });

  it("지금 spec은 모두 어느 게임이나 기본 묶음에 든다", () => {
    expect(ctx.orphanSpecs).toEqual([]);
  });

  it("어느 게임에도 안 든 spec은 무엇이 바뀌든 함께 돈다", () => {
    const r = selectE2e({ ...ctx, orphanSpecs: ["omok"] }, [
      "packages/cube-engine/src/index.ts",
    ]);
    expect(r.specs).toContain("omok");
  });

  it("마이티처럼 이름이 제각각인 spec도 그 게임에 든다", () => {
    expect(ctx.areas.mighty.specs).toEqual(
      expect.arrayContaining(["play-round", "online", "tutorial", "variants"]),
    );
  });

  it("id가 다른 id의 앞부분이어도 긴 id부터 맞춘다(stardraw-learn은 learn이 아니다)", () => {
    expect(ctx.areas.learn.specs).toEqual(["learn"]);
    expect(ctx.areas.stardraw.specs).toContain("stardraw-learn");
  });

  it("웹 경로 → 묶음", () => {
    expect(webAreaOf(ctx, "hearts/components/HeartsApp.tsx")).toBe("hearts");
    expect(webAreaOf(ctx, "app/hearts/page.tsx")).toBe("hearts");
    expect(webAreaOf(ctx, "app/hwatu-cards/page.tsx")).toBe("hwatu");
    expect(webAreaOf(ctx, "net/guest-room.ts")).toBe("*common*");
    expect(webAreaOf(ctx, "app/layout.tsx")).toBe("*common*");
    expect(webAreaOf(ctx, "app/review/page.tsx")).toBe("*common*");
  });

  it("패키지 이름 → 게임", () => {
    expect(packageOwner(ctx, "@game/cube-solver")).toBe("cube");
    expect(packageOwner(ctx, "@game/hearts-ai")).toBe("hearts");
    expect(packageOwner(ctx, "@game/stardraw-core/testing")).toBe("stardraw");
    expect(packageOwner(ctx, "@game/fair-play")).toBeNull();
  });

  it("registry에서 id를 읽는다", () => {
    expect(
      readGameIds(
        'export type X = { id: "nope" };\nexport const GAMES = [\n  { id: "omok", name: "오목" },\n  { id: "cube" },\n];',
      ),
    ).toEqual(["omok", "cube"]);
  });
});

describe("바뀐 파일 → 돌릴 화면 시험", () => {
  it("큐브 엔진만: 큐브 spec과 기본 묶음", () => {
    const r = pick("packages/cube-engine/src/index.ts");
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual([...cubeSpecs, ...BASE_SPECS].sort());
  });

  it("큐브 풀이기: 그것에 기대는 큐브 패키지를 거쳐 큐브만", () => {
    expect(pick("packages/cube-solver/src/two-phase.ts").specs).toEqual(
      [...cubeSpecs, ...BASE_SPECS].sort(),
    );
  });

  it("fair-play(공용 패키지): 전부", () => {
    expect(pick("packages/fair-play/src/coordinator.ts").mode).toBe("all");
  });

  it("마이티 엔진(모든 게임이 기댄다): 전부", () => {
    expect(pick("packages/engine/src/rng.ts").mode).toBe("all");
  });

  it("하트 화면: 하트 spec과 기본 묶음, 큐브·별 따기는 안 돈다", () => {
    const r = pick("apps/web/src/hearts/components/HeartsTable.tsx");
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual(expect.arrayContaining(["hearts", ...BASE_SPECS]));
    expect(r.specs.some((s) => s.startsWith("cube-"))).toBe(false);
    expect(r.specs.some((s) => s.startsWith("stardraw"))).toBe(false);
  });

  it("별 따기 화면: 별 따기를 불러 쓰는 은하도 돈다", () => {
    const r = pick("apps/web/src/stardraw/wallet.ts");
    expect(r.specs).toEqual(expect.arrayContaining(["stardraw", "galaxy"]));
  });

  it("윷 엔진: 윷과, 윷 엔진에 기대는 은하", () => {
    const r = pick("packages/yut-engine/src/index.ts");
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual(["galaxy", "yut", ...BASE_SPECS].sort());
  });

  it("net/ 공통: 전부", () => {
    expect(pick("apps/web/src/net/guest-room.ts").mode).toBe("all");
  });

  it("화면 시험 공용 도구: 전부", () => {
    expect(pick("apps/web/e2e/test.ts").mode).toBe("all");
    expect(pick("apps/web/playwright.config.ts").mode).toBe("all");
  });

  it("spec 하나만: 그 spec과 기본 묶음", () => {
    expect(pick("apps/web/e2e/omok.spec.ts").specs).toEqual(
      ["omok", ...BASE_SPECS].sort(),
    );
  });

  it("문서만: 화면 시험 없음", () => {
    const r = pick("docs/38-test-lessons.md", "README.md", "CLAUDE.md");
    expect(r.mode).toBe("none");
    expect(shardCount(r)).toBe(0);
  });

  it("단위 시험 파일·별 따기 서버·CLI만: 화면 시험 없음", () => {
    expect(
      pick(
        "apps/web/src/hearts/store.test.ts",
        "packages/cube-engine/src/moves.test.ts",
        "apps/stardraw-server/src/server.ts",
        "packages/stardraw-cli/src/site.ts",
        "scripts/slow-tests.mjs",
      ).mode,
    ).toBe("none");
  });

  it("lockfile·루트 설정·CI·이 스크립트: 전부", () => {
    for (const f of [
      "pnpm-lock.yaml",
      "package.json",
      "tsconfig.base.json",
      ".github/workflows/ci.yml",
      "scripts/affected-e2e.mjs",
    ]) {
      expect(pick(f).mode, f).toBe("all");
    }
  });

  it("짝 없는 apps/web 파일: 전부(안전하게)", () => {
    expect(pick("apps/web/next.config.ts").mode).toBe("all");
    expect(pick("apps/web/src/new-folder/thing.ts").mode).toBe("all");
    expect(pick("apps/web/public/sw.js").mode).toBe("all");
  });

  it("짝 없는 루트 파일: 전부", () => {
    expect(pick("something-new.yml").mode).toBe("all");
  });

  it("게임 하나 + 전부인 파일이 섞이면 전부", () => {
    expect(
      pick("packages/cube-engine/src/index.ts", "pnpm-lock.yaml").mode,
    ).toBe("all");
  });

  it("지워진 spec은 고르지 않는다", () => {
    expect(pick("apps/web/e2e/gone.spec.ts").specs).toEqual(
      [...BASE_SPECS].sort(),
    );
  });
});

describe("조각 수", () => {
  it("전부는 2, 일부는 spec이 많을 때만 2, 없음은 0", () => {
    expect(shardCount({ mode: "all", specs: [] })).toBe(2);
    expect(shardCount({ mode: "some", specs: ["a", "b", "c"] })).toBe(1);
    expect(
      shardCount({ mode: "some", specs: Array.from({ length: 12 }, String) }),
    ).toBe(2);
    expect(shardCount({ mode: "none", specs: [] })).toBe(0);
  });
});
