import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BASE_SPECS,
  graphGap,
  importGaps,
  linksInSource,
  loadContext,
  MAX_SHARDS,
  packageOwner,
  pathsInSpec,
  planShards,
  readGameIds,
  readTimes,
  routeOfPath,
  SHARD_SECONDS,
  selectE2e,
  shardCount,
  specSeconds,
  timesFromReports,
  webAreaOf,
} from "./affected-e2e.mjs";

// 고르기는 저장소의 지금 모습(registry, spec 목록, import, package.json)을 읽는다. 그래서 시험도 진짜 저장소로 본다
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = loadContext(ROOT);
const pick = (...files) => selectE2e(ctx, files);
const cubeSpecs = ctx.specs.filter((s) => s.startsWith("cube-"));
// 은하 spec은 늘어난다(galaxy-feel 등). 바뀐 파일만 다시 도는 단위 시험은 spec이 새로 생겨도 이 파일을 다시 돌리지 않아,
// 이름을 적어 두면 main에서 늦게 깨진다(2026-11-05). 지금 목록에서 고른다
const galaxySpecs = ctx.specs.filter(
  (s) => s === "galaxy" || s.startsWith("galaxy-"),
);

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

  it("별 따기 화면: 은하가 불러 쓰는 파일이면 은하도, 아니면 별 따기만(파일 단위, 11-11)", () => {
    const shared = pick("apps/web/src/stardraw/components/BureauMarks.tsx");
    expect(shared.specs).toEqual(
      expect.arrayContaining(["stardraw", ...galaxySpecs]),
    );
    const own = pick("apps/web/src/stardraw/wallet.ts");
    expect(own.specs).toContain("stardraw");
    expect(own.specs.some((s) => galaxySpecs.includes(s))).toBe(false);
  });

  it("윷 엔진: 윷과, 윷 엔진에 기대는 은하", () => {
    const r = pick("packages/yut-engine/src/index.ts");
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual([...galaxySpecs, "yut", ...BASE_SPECS].sort());
  });

  it("net/ 공통: 그것에 닿는 화면의 게임만(온라인 방이 없는 별 따기는 안 돈다)", () => {
    const r = pick("apps/web/src/net/guest-room.ts");
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual(
      expect.arrayContaining(["online", "hearts", "gostop", ...BASE_SPECS]),
    );
    expect(r.specs.some((s) => s.startsWith("stardraw"))).toBe(false);
  });

  it("모든 화면이 쓰는 파일(루트 layout과 그것이 불러 쓰는 것)은 전부", () => {
    expect(pick("apps/web/src/app/globals.css").mode).toBe("all");
    expect(pick("apps/web/src/app/layout.tsx").mode).toBe("all");
  });

  it("공통 폴더 파일이 공용 주소에 닿아도 그 주소를 여는 spec만(11-11, 예전에는 전부)", () => {
    const r = pick("apps/web/src/components/ChatBox.tsx");
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual(expect.arrayContaining(["online", "hearts"]));
    expect(r.specs).not.toContain("cube-timer");
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

  it("맥 앱 Cubie와 그 업데이트 목록만: 화면 시험 없음", () => {
    expect(
      pick(
        "apps/cubie/scripts/release.sh",
        "apps/cubie/VERSION",
        "apps/web/public/cubie/appcast.xml",
      ).mode,
    ).toBe("none");
  });

  it("Cubie 내려받기 페이지: 그 spec과 기본 묶음", () => {
    const r = pick("apps/web/src/app/cubie/download/page.tsx");
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual(["cubie-download", ...BASE_SPECS].sort());
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
    expect(pick("apps/web/public/sw.js").mode).toBe("all");
  });

  it("어느 화면에서도 import로 닿지 않는 src 파일: 없음(지워졌거나 아무도 안 쓰는 파일)", () => {
    expect(pick("apps/web/src/new-folder/thing.ts").mode).toBe("none");
  });

  it("spec이 직접 불러 쓰는 src 파일: 그 게임과 그 spec", () => {
    const r = pick("apps/web/src/janggi/opening-line.ts");
    expect(r.mode).toBe("some");
    expect(r.specs).toContain("janggi");
    expect(r.specs.some((s) => s.startsWith("cube-"))).toBe(false);
  });

  it("빌드가 돌리는 apps/web 스크립트: 전부", () => {
    for (const f of [
      "apps/web/scripts/build-hashes.mjs",
      "apps/web/scripts/drop-demo-pages.mjs",
      "apps/web/scripts/write-version.mjs",
    ]) {
      expect(pick(f).mode, f).toBe("all");
    }
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

// 2026-11-10 「전부」가 된 실행들(learn-terms-sweep, cubie-profile, cube-hero-color, main push 넷)의 바뀐 파일.
// 새 규칙이 무엇을 고르는지 남겨 둔다
describe("오늘 「전부」가 된 PR의 바뀐 파일", () => {
  it("시험 전용 도우미(용어 순서 틀): 없음", () => {
    expect(
      pick(
        "apps/web/src/tutorial/term-order.ts",
        "apps/web/src/tutorial/term-order-suite.ts",
      ).mode,
    ).toBe("none");
  });

  it("개발 때 손으로 돌리는 생성 스크립트(큐브 포스터): 없음", () => {
    expect(pick("apps/web/scripts/render-cube-posters.mjs").mode).toBe("none");
  });

  it("cube-hero-color: 포스터 스크립트 + 큐브 화면 → 포스터를 그리는 큐브 주소의 spec만", () => {
    const r = pick(
      "apps/web/scripts/render-cube-posters.mjs",
      "apps/web/src/cube/hero/poster.ts",
    );
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual(
      expect.arrayContaining(["cube-home", ...BASE_SPECS]),
    );
    expect(
      r.specs.every((s) => cubeSpecs.includes(s) || BASE_SPECS.includes(s)),
    ).toBe(true);
    expect(r.specs.length).toBeLessThan(cubeSpecs.length);
  });

  it("배우기 목록 화면(LearnPage)은 /learn 묶음만, 마이티 배우기 단원(lessons)은 마이티만", () => {
    expect(pick("apps/web/src/components/learn/LearnPage.tsx").specs).toEqual(
      ["learn", ...BASE_SPECS].sort(),
    );
    const r = pick("apps/web/src/tutorial/lessons.ts");
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual(expect.arrayContaining(["tutorial", "play-round"]));
    expect(r.specs.some((s) => s.startsWith("cube-"))).toBe(false);
  });

  it("용어집(glossary)은 그것을 쓰는 주소(게임 화면·복기)를 여는 spec만(11-11), globals.css는 그대로 전부", () => {
    const r = pick("apps/web/src/tutorial/glossary.ts");
    expect(r.mode).toBe("some");
    expect(r.specs).toEqual(expect.arrayContaining(["hearts", "omok"]));
    expect(r.specs).not.toContain("cube-timer");
    expect(pick("apps/web/src/app/globals.css").mode).toBe("all");
  });
});

// 2026-11-11 주소 → 그 주소를 여는 spec. 파일이 닿는 주소를 import 그래프로 계산하고, spec이 여는 주소는 spec에
// 적힌 주소 문자열·정규식으로 모은다
/** 시험 글 속 템플릿 자리는 %{…}로 적고 ${…}로 바꾼다(일반 문자열 속 ${를 lint가 막는다) */
const t = (s) => s.replaceAll("%{", "$" + "{");

describe("주소 → spec", () => {
  const routeKeys = ctx.routes.map((r) => r.key);

  it("주소 문자열 → 가장 길게 맞는 주소", () => {
    expect(routeOfPath(routeKeys, "/")).toBe("");
    expect(routeOfPath(routeKeys, "/?seed=1")).toBe("");
    expect(routeOfPath(routeKeys, "/profile?game=yut")).toBe("profile");
    expect(routeOfPath(routeKeys, "/cube/keys/drill")).toBe("cube/keys/drill");
    expect(routeOfPath(routeKeys, "/cube/icon/192.png")).toBe("cube/icon");
    expect(routeOfPath(routeKeys, t("/stardraw/mine#t-%{id}"))).toBe(
      "stardraw/mine",
    );
    // 첫 마디부터 끼운 값이면 모른다(첫 화면으로 잘못 세지 않는다)
    expect(routeOfPath(routeKeys, t("/%{id}"))).toBe(null);
    expect(routeOfPath(routeKeys, "/no-such-page")).toBe(null);
    expect(routeOfPath(routeKeys, "#learn")).toBe(null);
  });

  it("spec 글에서 주소를 읽는다: 따옴표 문자열과 \\/로 시작하는 정규식", () => {
    const text = [
      'await page.goto("/review");',
      t("await page.goto(`/stardraw/mine#t-%{id}`);"),
      "await expect(page).toHaveURL(/\\/cube\\/daily$/);",
      "await expect(page).toHaveURL(/\\/$/);",
      "await expect(page).toHaveURL(/#learn$/);",
      "const half = width / 2 / 3;",
    ].join("\n");
    expect(pathsInSpec(text)).toEqual(
      expect.arrayContaining([
        "/review",
        t("/stardraw/mine#t-%{id}"),
        "/cube/daily",
        "/",
      ]),
    );
    expect(pathsInSpec(text).some((p) => p.includes("learn"))).toBe(false);
  });

  it("화면 코드의 링크·이동만 넘겨 주는 주소로 읽는다", () => {
    const text = [
      '<a href="/review">복기</a>',
      t("<a href={`/profile?game=%{game}`}>내 기록</a>"),
      '{ href: "/profile" }',
      t("router.push(`/review?id=%{id}`)"),
      'const parts = path.split("/");',
    ].join("\n");
    expect(linksInSource(text)).toEqual([
      "/review",
      t("/profile?game=%{game}"),
      "/profile",
      t("/review?id=%{id}"),
    ]);
  });

  it("주소마다 시작 파일: page와 위 폴더의 layout, 아이콘은 따로 선 주소", () => {
    const timer = ctx.routeByKey["cube/timer"];
    expect(timer.page).toBe(true);
    expect(timer.entries).toEqual(
      expect.arrayContaining([
        "src/app/cube/timer/page.tsx",
        "src/app/layout.tsx",
      ]),
    );
    expect(timer.own).not.toContain("src/app/layout.tsx");
    expect(ctx.routeByKey["stardraw/now"].entries).toContain(
      "src/app/stardraw/layout.tsx",
    );
    expect(ctx.routeByKey["cube/icon"].page).toBe(false);
    expect(ctx.routeByKey["cube/icon"].entries).toEqual([
      "src/app/cube/icon.tsx",
    ]);
  });

  it("spec이 여는 주소: goto·toHaveURL에 적힌 주소와, 내 기록에서 링크로 가는 복기", () => {
    expect(ctx.visits.omok).toEqual(new Set(["", "omok", "profile", "review"]));
    expect(ctx.visits["cube-timer"]).toEqual(new Set(["cube/timer"]));
    // hearts·play-round는 /profile을 열고 「지난 게임 복기」 링크를 눌러 복기로 간다(주소를 적지 않는다)
    expect(ctx.visits.hearts.has("review")).toBe(true);
    expect(ctx.visits["play-round"].has("review")).toBe(true);
    // 첫 화면은 모든 주소로 이어지는 목록이라 따라가지 않는다: 큐브 첫 화면 spec이 첫 화면을 열어도 복기는 아니다
    expect(ctx.visits["cube-timer"].has("review")).toBe(false);
  });

  it("옛 주소의 page가 넘겨 주는 주소도 그 spec이 여는 주소다(<CubeRedirect to=…>)", () => {
    expect(ctx.visits["cube-keys"].has("cube/keys/learn")).toBe(true);
    expect(ctx.visits["cube-keys"].has("cube/intro")).toBe(true);
  });

  it("공용 주소의 화면(복기·내 기록·첫 화면)은 그 주소를 여는 spec만", () => {
    const review = pick("apps/web/src/review/ReviewPage.tsx");
    expect(review.mode).toBe("some");
    expect(review.specs).toEqual(
      expect.arrayContaining(["omok", "hearts", "play-round", ...BASE_SPECS]),
    );
    expect(review.specs.some((s) => s.startsWith("cube-"))).toBe(false);
    expect(review.specs.some((s) => s.startsWith("stardraw"))).toBe(false);
    const profile = pick("apps/web/src/stats/ProfilePage.tsx");
    expect(profile.specs).toEqual(
      expect.arrayContaining(["omok", "hearts", "play-round"]),
    );
    const home = pick("apps/web/src/components/GameCenterHome.tsx");
    expect(home.specs).toEqual(
      expect.arrayContaining(["home", "omok", "cube-home"]),
    );
    expect(home.specs).not.toContain("cube-timer");
  });

  it("없는 주소 화면·사이트 아이콘은 기본 묶음만(빌드는 된다)", () => {
    for (const f of [
      "apps/web/src/app/not-found.tsx",
      "apps/web/src/app/icon.tsx",
    ]) {
      const r = pick(f);
      expect(r.mode, f).toBe("some");
      expect(r.specs, f).toEqual([...BASE_SPECS].sort());
    }
  });

  it("게임 폴더 파일도 닿는 주소로: 큐브 타이머만 쓰는 것은 cube-timer만, 모든 큐브 화면이 쓰는 CubeView는 큐브 전부", () => {
    expect(pick("apps/web/src/cube/timer/CubeTimerApp.tsx").specs).toEqual(
      ["cube-timer", ...BASE_SPECS].sort(),
    );
    expect(pick("apps/web/src/app/cube/timer/page.tsx").specs).toEqual(
      ["cube-timer", ...BASE_SPECS].sort(),
    );
    expect(pick("apps/web/src/cube/view/cube-view.ts").specs).toEqual(
      [...cubeSpecs, ...BASE_SPECS].sort(),
    );
  });

  it("게임 폴더 파일이 복기에 닿아도 다른 게임 spec은 고르지 않는다(복기는 게임마다 갈래)", () => {
    const r = pick("apps/web/src/hearts/components/HeartsTable.tsx");
    expect(r.specs).toContain("hearts");
    expect(r.specs).not.toContain("omok");
  });

  it("게임 폴더 파일이 루트 layout(저장소 불러오기)으로만 닿으면 예전처럼 그 게임 묶음, 전부로 넓히지 않는다", () => {
    const only = Object.keys(ctx.reach).filter(
      (f) =>
        f.startsWith("src/") &&
        !ctx.ownReach[f] &&
        webAreaOf(ctx, f.slice(4)) !== "*common*",
    );
    for (const f of only) {
      const id = webAreaOf(ctx, f.slice(4));
      const r = pick(`apps/web/${f}`);
      expect(r.mode, f).toBe("some");
      expect(r.specs, f).toEqual(expect.arrayContaining(ctx.areas[id].specs));
    }
  });

  it("「모든 화면이 쓰는가」는 그래프로: 루트 layout에서 닿는 공통 폴더 파일은 모두 전부", () => {
    const fromLayout = [...ctx.graph.walk(["src/app/layout.tsx"])].filter(
      (f) => f.startsWith("src/") && webAreaOf(ctx, f.slice(4)) === "*common*",
    );
    expect(fromLayout).toEqual(expect.arrayContaining(["src/app/globals.css"]));
    for (const f of fromLayout)
      expect(pick(`apps/web/${f}`).mode, f).toBe("all");
  });

  it("주소로 좁힐 수 없는 게임 spec(어느 그 게임 주소도 적지 않음)은 그 게임 화면이 바뀌면 늘 함께", () => {
    for (const [id, list] of Object.entries(ctx.unmapped)) {
      for (const s of list) {
        const file = ctx.routes.find((r) => r.area === id && r.page)
          ?.entries[0];
        if (!file) continue;
        expect(pick(`apps/web/${file}`).specs, `${id} ${s}`).toContain(s);
      }
    }
  });
});

// 놓친 의존이 있으면 「닿지 않는다」고 잘못 보아 시험을 건너뛴다. 그래프가 따라가는 꼴을 시험으로 지킨다
describe("놓친 의존 막기", () => {
  it("지금 저장소의 import 그래프에는 구멍이 없다(따라가지 못하는 꼴, 찾지 못한 import)", () => {
    expect([...ctx.graph.gaps]).toEqual([]);
    expect([...ctx.graph.unresolved]).toEqual([]);
    expect(graphGap(ctx)).toBe(null);
  });

  it("따라가지 못하는 불러오기 꼴을 찾는다(주석 속 설명은 빼고)", () => {
    expect(importGaps('const m = require("./x");')).toEqual(["require()"]);
    expect(importGaps('import.meta.glob("./*.ts")')).toEqual([
      "import.meta.glob",
    ]);
    expect(importGaps("await import(name)")).toEqual(["import(값)"]);
    expect(importGaps(t("await import(`./%{name}`)"))).toEqual(["import(값)"]);
    expect(importGaps('@import url("x.css");')).toEqual(["CSS @import url()"]);
    expect(importGaps("new Worker(url)")).toEqual(["new Worker(문자열 아님)"]);
    // 따라가는 꼴: 줄을 바꾼 동적 import, 타입 import, new Worker(new URL("…", import.meta.url))
    expect(importGaps('await import(\n  "../x"\n)')).toEqual([]);
    expect(importGaps('let p: typeof import("./hint").pick;')).toEqual([]);
    expect(importGaps('new Worker(new URL("./w", import.meta.url))')).toEqual(
      [],
    );
    expect(
      importGaps(
        "/** `new Worker(new URL(…, import.meta.url))` */\nconst a = 1;",
      ),
    ).toEqual([]);
    expect(
      importGaps('// await import(name)\nconst u = "https://a.b";'),
    ).toEqual([]);
  });

  it("그래프에 구멍이 생기면 웹 src 변경은 전부로 돌린다", () => {
    const holed = {
      ...ctx,
      graph: { ...ctx.graph, gaps: new Map([["src/x.ts", ["import(값)"]]]) },
    };
    const r = selectE2e(holed, ["apps/web/src/cube/timer/CubeTimerApp.tsx"]);
    expect(r.mode).toBe("all");
    expect(r.why).toContain("src/x.ts");
  });

  it("동적 import·JSON import·CSS import·Worker도 따라간다", () => {
    // net/session.ts → import("./p2p-transport")
    expect(ctx.reach["src/net/p2p-transport.ts"]).toBeTruthy();
    // 큐브 미니 → import("./hint-pick")
    expect(ctx.reach["src/cube/mini/hint-pick.ts"]?.has("cube/mini")).toBe(
      true,
    );
    // 별 따기 하늘 → import data from "./sky-data.json"
    expect(ctx.reach["src/stardraw/sky-data.json"]).toBeTruthy();
    // 루트 layout → globals.css
    expect(ctx.reach["src/app/globals.css"]?.size).toBeGreaterThan(50);
    // new Worker(new URL("./cube-worker", import.meta.url))
    expect(ctx.reach["src/cube/worker/cube-worker.ts"]).toBeTruthy();
  });
});

describe("게임별 CSS(globals.css는 모든 화면이 쓰는 것만, docs/38 17절)", () => {
  const web = path.join(ROOT, "apps/web");
  const all = readdirSync(path.join(web, "src"), { recursive: true }).map(
    (p) => `src/${p.split(path.sep).join("/")}`,
  );
  const cssFiles = all.filter(
    (f) => f.endsWith(".css") && f !== "src/app/globals.css",
  );
  const codeFiles = all.filter(
    (f) => /\.(tsx?|mjs)$/.test(f) && !/\.test\./.test(f),
  );
  const noComments = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{}(),])\/\/.*$/gm, "$1");
  const code = Object.fromEntries(
    codeFiles.map((f) => [
      f,
      noComments(readFileSync(path.join(web, f), "utf8")),
    ]),
  );
  // 클래스가 아닌데 이름이 같은 것(SVG 그라디언트 id)
  const NOT_CLASS = { "src/stardraw/icon-art.tsx": ["sd-ball"] };

  it("따로 둔 CSS의 클래스를 쓰는 파일이 닿는 주소에는 그 CSS도 닿는다(빠지면 그 화면에서 연출이 조용히 사라진다)", () => {
    expect(cssFiles.length).toBeGreaterThan(5);
    const missing = [];
    for (const css of cssFiles) {
      const text = noComments(readFileSync(path.join(web, css), "utf8"))
        .replace(/url\([^)]*\)/g, "")
        .replace(/"[^"]*"/g, '""');
      const classes = new Set(
        [...text.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
      );
      const cssReach = ctx.reach[css] ?? new Set();
      for (const cl of classes) {
        const re = new RegExp(`(?<![\\w-])${cl}(?![\\w-])`);
        for (const f of codeFiles) {
          if (NOT_CLASS[f]?.includes(cl) || !re.test(code[f])) continue;
          const lost = [...(ctx.reach[f] ?? [])].filter(
            (k) => !cssReach.has(k),
          );
          if (lost.length)
            missing.push(`${f} .${cl} → ${css}: ${lost.join(",")}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("게임별 CSS 하나만 바뀌면 전부가 아니라 그 CSS가 닿는 주소의 spec만", () => {
    const emblem = pick("apps/web/src/cube/tiers/emblem.css");
    expect(emblem.mode).not.toBe("all");
    expect(emblem.specs.length).toBeLessThan(cubeSpecs.length);
    const sd = pick("apps/web/src/app/stardraw/stardraw.css");
    expect(sd.mode).not.toBe("all");
    expect(sd.specs.some((s) => s.startsWith("cube-"))).toBe(false);
  });
});

describe("조각 수", () => {
  const times = { seconds: { a: 300, b: 200, c: 100, d: 40, e: 20 } };

  it("전부는 MAX_SHARDS(6), 없음은 0", () => {
    expect(MAX_SHARDS).toBe(6);
    expect(shardCount({ mode: "all", specs: [] })).toBe(6);
    expect(shardCount({ mode: "all", specs: [] }, times)).toBe(6);
    expect(shardCount({ mode: "none", specs: [] }, times)).toBe(0);
  });

  it("일부는 지난 시험 시간 합을 조각 하나 몫(SHARD_SECONDS)으로 나눠 올림", () => {
    expect(SHARD_SECONDS).toBe(240);
    expect(shardCount({ mode: "some", specs: ["d", "e"] }, times)).toBe(1);
    // 300 + 200 + 100 = 600초 → 3조각
    expect(shardCount({ mode: "some", specs: ["a", "b", "c"] }, times)).toBe(3);
    // spec보다 조각이 많지는 않다
    expect(shardCount({ mode: "some", specs: ["a"] }, times)).toBe(1);
  });

  it("시간 자료가 없으면 spec 개수로: 12개 미만은 1, 12개마다 하나씩 더(최대 6)", () => {
    const n = (k) => Array.from({ length: k }, (_, i) => `s${i}`);
    expect(shardCount({ mode: "some", specs: n(3) })).toBe(1);
    expect(shardCount({ mode: "some", specs: n(12) })).toBe(2);
    expect(shardCount({ mode: "some", specs: n(30) })).toBe(3);
    expect(shardCount({ mode: "some", specs: n(500) })).toBe(6);
  });

  it("저장소의 시간 기준 파일은 지금 spec을 거의 모두 담는다(새 spec은 평균으로 친다)", () => {
    const t = readTimes(path.join(ROOT, "scripts/e2e-times.json"));
    expect(t).not.toBeNull();
    const missing = ctx.specs.filter((s) => !(s in t.seconds));
    // 자료를 새로 쓰지 않은 채 spec이 많이 늘면 나누기가 기운다. 그때는 notes대로 새로 쓴다
    expect(missing.length).toBeLessThanOrEqual(15);
  });
});

describe("조각 나누기", () => {
  const times = { seconds: { a: 300, b: 200, c: 150, d: 100, e: 50, f: 50 } };

  it("긴 spec부터 가장 가벼운 조각에 담아 시간이 고르게 된다", () => {
    const plan = planShards(["a", "b", "c", "d", "e", "f"], 3, times);
    const load = plan.map((l) => l.reduce((s, x) => s + times.seconds[x], 0));
    expect(plan.flat().sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(Math.max(...load) - Math.min(...load)).toBeLessThanOrEqual(50);
    // 같은 입력이면 늘 같은 결과(조각 사이에 spec이 겹치거나 빠지면 안 된다)
    expect(planShards(["f", "e", "d", "c", "b", "a"], 3, times)).toEqual(plan);
  });

  it("자료에 없는 spec은 평균 시간으로 친다", () => {
    expect(specSeconds(times, "new")).toBeCloseTo(850 / 6);
    expect(specSeconds({ seconds: {} }, "new")).toBe(1);
  });

  it("시간 자료가 없으면 이름 차례로 돌려 담는다", () => {
    expect(planShards(["c", "a", "b", "d"], 2)).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  it("지금 spec 전부를 6조각으로: 모두 한 번씩, 조각 사이 시간 차가 가장 긴 spec보다 작다", () => {
    const t = readTimes(path.join(ROOT, "scripts/e2e-times.json"));
    const plan = planShards(ctx.specs, 6, t);
    expect(plan.flat().sort()).toEqual([...ctx.specs].sort());
    const load = plan.map((l) => l.reduce((s, x) => s + specSeconds(t, x), 0));
    const longest = Math.max(...ctx.specs.map((s) => specSeconds(t, s)));
    expect(Math.max(...load) - Math.min(...load)).toBeLessThan(longest);
  });

  it("playwright json에서 spec마다 시간 합(초)을 읽고 건너뛴 시험은 뺀다", () => {
    const report = {
      suites: [
        {
          file: "omok.spec.ts",
          specs: [
            {
              file: "omok.spec.ts",
              tests: [
                { results: [{ status: "passed", duration: 1500 }] },
                { results: [{ status: "skipped", duration: 900 }] },
              ],
            },
          ],
          suites: [
            {
              title: "묶음",
              specs: [
                {
                  file: "omok.spec.ts",
                  tests: [{ results: [{ status: "passed", duration: 520 }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(timesFromReports([report])).toEqual({ omok: 2 });
  });
});
