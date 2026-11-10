#!/usr/bin/env node
// 바뀐 파일로 돌릴 화면 시험(playwright spec)을 고른다(2026-11-04). 결과는 셋 가운데 하나다.
//   all  — 전부 돈다. 여러 게임이 쓰는 곳·시험 도구·설정·lockfile·짝을 모르는 파일이 바뀌었을 때
//   some — 바뀐 게임의 spec과, 그 게임에 기대는 게임의 spec, 늘 도는 기본 묶음(BASE_SPECS)
//   none — 화면에 닿지 않는 것만 바뀌었다(문서, 단위 시험 파일, 배포·저장소 도구 등)
//
//   node scripts/affected-e2e.mjs --base <커밋>      바뀐 파일 = git diff <커밋>...HEAD(merge-base 기준)
//   node scripts/affected-e2e.mjs --files a b c     바뀐 파일을 직접 준다
//   node scripts/affected-e2e.mjs --all             전부(기준 커밋을 못 찾았을 때, 매일 실행·손으로 돌리기)
//   node scripts/affected-e2e.mjs --no-e2e <까닭>   화면 시험 없음(main push, 2026-11-10: 화면 시험은 PR에서 본다)
//   덧붙임: --github(GITHUB_OUTPUT·GITHUB_STEP_SUMMARY에 쓴다) · --selection-out <파일>(느린 시험 워크플로가 읽는 기록)
//           --times <파일>(spec마다 지난 시험 시간, 기본 scripts/e2e-times.json)
//   node scripts/affected-e2e.mjs --write-times scripts/e2e-times.json <e2e.json…>   시간 기준 파일 새로 쓰기
//
// 게임과 그 폴더는 apps/web/src/games/registry.ts의 id에서 읽는다(registry 밖 화면은 EXTRA_AREAS).
// 게임 사이 기댐(은하 → 별 따기 등)과 패키지를 쓰는 게임은 실행할 때마다 import와 package.json에서 계산한다.
// 여러 게임이 함께 쓰는 폴더(components·review·stats 등)가 어느 게임 코드를 불러도 그 게임의 변경을
// 전부로 넓히지 않는다(게임 목록·복기처럼 게임마다 갈래가 있는 곳이라, 그 게임의 spec이 그 화면도 본다).
// 웹 src 파일은 화면(src/app의 page·layout 등)에서 import로 닿는지 본다(2026-11-10). 어디서도 닿지 않으면(시험 전용
// 도우미 등) 없음, 공통 폴더 파일은 닿는 주소의 게임만, 첫 화면·복기 같은 공용 주소가 닿으면 전부.
// apps/web/scripts는 빌드가 돌리는 것만 전부이고 나머지(개발 때 손으로 돌리는 생성 도구)는 없음.
//
// 고른 spec은 지난 시험 시간(scripts/e2e-times.json)으로 조각마다 고르게 나눠, 조각마다 spec 목록을 넘긴다.
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** 무엇이 바뀌든 화면 시험을 돌린다면 함께 도는 작은 묶음(첫 화면·없는 주소·뒤로 가기) */
export const BASE_SPECS = ["home", "not-found", "back-navigation"];

/**
 * registry.ts에 없는 화면 묶음. dirs는 apps/web/src 아래 폴더, app은 apps/web/src/app 아래 주소 폴더.
 * registry의 게임은 src/<id>/·src/app/<id>/·public/<id>/가 기본이고, 여기 적으면 덧붙는다.
 */
export const EXTRA_AREAS = {
  hwatu: { dirs: ["hwatu"], app: ["hwatu-cards"], specs: ["fair-multi-hwatu"] },
  lab: { dirs: ["lab"], app: ["lab"], specs: [] },
  learn: { dirs: [], app: ["learn"], specs: [] },
  security: { dirs: [], app: ["security"], specs: [] },
  sounds: { dirs: [], app: ["sounds"], specs: [] },
  // 카드 그림 모음. 따로 spec이 없어 기본 묶음만 돈다(빌드는 된다)
  cards: { dirs: [], app: ["cards"], public: ["cards"], specs: [] },
  // 맥 앱 Cubie 내려받기 주소(/cubie/download). 판을 읽는 appcast는 아래 IGNORE라 단위 시험(cubie/appcast.test.ts)이 본다
  cubie: { dirs: ["cubie"], app: ["cubie"], specs: ["cubie-download"] },
};

/** spec 이름이 게임 id로 시작하지 않는 것(마이티는 처음부터 있던 게임이라 이름이 제각각이다) */
export const EXTRA_SPECS = {
  mighty: ["play-round", "online", "tutorial", "variants", "fair-multi"],
  hearts: ["fair-multi"],
  minhwatu: ["fair-multi-hwatu"],
};

/** 화면 시험과 상관없는 파일(문서, 단위 시험, 배포·저장소 도구, 별 따기 서버와 CLI) */
const IGNORE = [
  /^docs\//,
  /\.md$/,
  /^LICENSE$/,
  /^\.gitignore$/,
  /^\.dockerignore$/,
  /^Dockerfile$/,
  /^deploy\//,
  /^lefthook\.yml$/,
  /^biome\.json$/,
  /^vitest\.config\.ts$/,
  /^\.github\/workflows\/(image|slow-tests|galaxy-bench)\.yml$/,
  // 이 스크립트 말고 저장소 도구(느린 시험 알림, 공정성 모의 등)
  /^scripts\/(?!affected-e2e\.mjs$)/,
  /\.test\.(ts|tsx|mjs)$/,
  /\.(strength|bench)\.ts$/,
  /^apps\/web\/vitest\.config\.ts$/,
  /^apps\/stardraw-server\//,
  // 맥 앱 Cubie(Swift, 이 맥에서만 빌드). 웹 화면은 사이트 주소로 열 뿐이다
  /^apps\/cubie\//,
  // Cubie 업데이트 목록(Sparkle appcast). 웹은 내려받기 페이지가 빌드 때 맨 위 판만 읽는다. 그 읽기는 단위 시험
  // (src/cubie/appcast.test.ts, 저장소 파일을 그대로 읽는다)이 보므로 새 판마다 화면 시험을 돌리지 않는다
  /^apps\/web\/public\/cubie\//,
];

/** 무엇이든 전부. 그 밖에 짝을 모르는 파일도 전부가 된다 */
const ALL = [
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^package\.json$/,
  /^tsconfig\.base\.json$/,
  /^\.node-version$/,
  /^\.github\/workflows\/ci\.yml$/,
  /^scripts\/affected-e2e\.mjs$/,
];

/**
 * 공통 폴더에 있지만 게임마다 갈래로 그 게임 패키지를 불러오는 파일. 여기서 쓰는 `@game/<id>-ai` 같은 패키지는
 * 공통이 아니라 그 게임 몫으로 센다(그 게임 spec이 그 갈래를 지난다)
 */
export const DISPATCHERS = ["game/bot-registry.ts"];

const COMMON = "*common*";

const toPosix = (p) => p.split(path.sep).join("/");

function listFiles(dir, filter) {
  const out = [];
  const walk = (d) => {
    let names;
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const n of names) {
      if (n === "node_modules" || n.startsWith(".")) continue;
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (filter(n)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** 파일 안의 import 대상(정적·동적 import, re-export, new URL(…, import.meta.url)) */
function importsOf(text) {
  const out = [];
  const re =
    /(?:from|import)\s*\(?\s*["']([^"']+)["']|new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g;
  for (const m of text.matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}

/** registry.ts의 GAMES 목록에서 id를 읽는다 */
export function readGameIds(registryText) {
  const at = registryText.indexOf("export const GAMES");
  if (at < 0) throw new Error("registry.ts에서 GAMES를 찾지 못했다");
  return [...registryText.slice(at).matchAll(/\bid:\s*"([a-z0-9-]+)"/g)].map(
    (m) => m[1],
  );
}

/** 저장소를 읽어 고르기에 필요한 것을 모은다 */
export function loadContext(root) {
  const web = path.join(root, "apps/web");
  const gameIds = readGameIds(
    readFileSync(path.join(web, "src/games/registry.ts"), "utf8"),
  );
  const areas = {};
  for (const id of gameIds) {
    areas[id] = { dirs: [id], app: [id], public: [id], specs: [] };
  }
  for (const [id, a] of Object.entries(EXTRA_AREAS)) {
    areas[id] ??= { dirs: [], app: [], public: [], specs: [] };
    areas[id].dirs.push(...a.dirs);
    areas[id].app.push(...a.app);
    areas[id].public.push(...(a.public ?? []));
    areas[id].specs.push(...a.specs);
  }
  const specs = readdirSync(path.join(web, "e2e"))
    .filter((n) => n.endsWith(".spec.ts"))
    .map((n) => n.replace(/\.spec\.ts$/, ""))
    .sort();
  // spec 이름이 게임 id(또는 묶음 id)로 시작하면 그 게임 것. 긴 id부터 맞춘다
  const ids = Object.keys(areas).sort((a, b) => b.length - a.length);
  for (const s of specs) {
    const id = ids.find((i) => s === i || s.startsWith(`${i}-`));
    if (id) areas[id].specs.push(s);
  }
  for (const [id, extra] of Object.entries(EXTRA_SPECS)) {
    areas[id].specs.push(...extra);
  }
  for (const a of Object.values(areas)) a.specs = [...new Set(a.specs)].sort();
  // 어느 게임에도 안 든 spec(새 화면 등)은 기본 묶음처럼 늘 돈다. 아무 때도 안 도는 spec이 생기지 않게
  const owned = new Set([
    ...BASE_SPECS,
    ...Object.values(areas).flatMap((a) => a.specs),
  ]);
  const orphanSpecs = specs.filter((s) => !owned.has(s));

  const srcDir = {};
  const appDir = {};
  const publicDir = {};
  for (const [id, a] of Object.entries(areas)) {
    for (const d of a.dirs) srcDir[d] = id;
    for (const d of a.app) appDir[d] = id;
    for (const d of a.public) publicDir[d] = id;
  }

  // 작업 공간 패키지: 이름 → 폴더, 의존
  const packages = {};
  for (const top of ["apps", "packages"]) {
    for (const n of readdirSync(path.join(root, top))) {
      let pkg;
      try {
        pkg = JSON.parse(
          readFileSync(path.join(root, top, n, "package.json"), "utf8"),
        );
      } catch {
        continue;
      }
      const deps = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      }).filter((d) => d.startsWith("@game/"));
      packages[pkg.name] = { dir: `${top}/${n}`, deps };
    }
  }

  // 웹 파일의 import: 게임 사이 기댐과, 어느 게임(또는 공통)이 어느 패키지를 쓰는지
  const isCode = (n) => /\.(ts|tsx|mjs|js)$/.test(n) && !/\.test\./.test(n);
  const gameDeps = {}; // 게임 B → B를 불러 쓰는 게임들
  const pkgUsers = {}; // 패키지 이름 → 그것을 불러 쓰는 묶음 id(또는 COMMON, spec:<이름>)
  const addTo = (map, key, value) => {
    if (!map[key]) map[key] = new Set();
    map[key].add(value);
  };
  const addUser = (pkgName, user) =>
    addTo(pkgUsers, pkgName.split("/").slice(0, 2).join("/"), user);
  const ctx = {
    areas,
    srcDir,
    appDir,
    publicDir,
    specs,
    orphanSpecs,
    packages,
  };
  for (const file of listFiles(path.join(web, "src"), isCode)) {
    const rel = toPosix(path.relative(path.join(web, "src"), file));
    const from = webAreaOf(ctx, rel);
    const dispatcher = DISPATCHERS.includes(rel);
    for (const spec of importsOf(readFileSync(file, "utf8"))) {
      if (spec.startsWith("@game/")) {
        addUser(spec, dispatcher ? (packageOwner(ctx, spec) ?? COMMON) : from);
        continue;
      }
      let target;
      if (spec.startsWith("@/")) target = spec.slice(2);
      else if (spec.startsWith("."))
        target = toPosix(
          path.relative(
            path.join(web, "src"),
            path.resolve(path.dirname(file), spec),
          ),
        );
      else continue;
      if (target.startsWith("..")) continue;
      const to = webAreaOf(ctx, target);
      if (to !== from && to !== COMMON && from !== COMMON) {
        addTo(gameDeps, to, from);
      }
    }
  }
  // 시험 도구·spec이 패키지를 직접 쓰기도 한다
  for (const file of listFiles(path.join(web, "e2e"), isCode)) {
    const n = path.basename(file);
    const user = n.endsWith(".spec.ts")
      ? `spec:${n.replace(/\.spec\.ts$/, "")}`
      : COMMON;
    for (const spec of importsOf(readFileSync(file, "utf8"))) {
      if (spec.startsWith("@game/")) addUser(spec, user);
    }
  }
  ctx.gameDeps = gameDeps;
  ctx.pkgUsers = pkgUsers;

  // 화면에 닿는 파일(2026-11-10). src/app의 Next 특수 파일(page·layout·icon 등)에서 import를 따라가 닿는 파일마다,
  // 그 파일에 닿는 주소 묶음(게임 id 또는 COMMON)을 모은다. 어느 화면에서도 닿지 않는 파일(시험 전용 도우미 등)은
  // 바뀌어도 화면 시험을 돌리지 않고, 공통 폴더의 파일도 닿는 게임만 돌린다
  const graph = importGraph(web);
  const reach = {};
  const entriesByArea = {};
  for (const file of listFiles(path.join(web, "src/app"), (n) =>
    PAGE_ENTRY.test(n),
  )) {
    const rel = toPosix(path.relative(path.join(web, "src"), file));
    const area = webAreaOf(ctx, rel);
    if (!entriesByArea[area]) entriesByArea[area] = [];
    entriesByArea[area].push(`src/${rel}`);
  }
  for (const [area, entries] of Object.entries(entriesByArea)) {
    for (const f of graph.walk(entries)) addTo(reach, f, area);
  }
  // spec이 src 파일을 직접 불러 쓰기도 한다(데이터·순수 함수). spec이면 그 spec, 공용 도구면 COMMON
  const specReach = {};
  for (const file of listFiles(path.join(web, "e2e"), isCode)) {
    const rel = toPosix(path.relative(web, file));
    const n = path.basename(file);
    const user = n.endsWith(".spec.ts") ? n.replace(/\.spec\.ts$/, "") : COMMON;
    for (const f of graph.walk([rel])) {
      if (!f.startsWith("e2e/")) addTo(specReach, f, user);
    }
  }
  ctx.reach = reach;
  ctx.specReach = specReach;
  // 빌드(apps/web package.json의 build)가 돌리는 스크립트. 그 밖의 apps/web/scripts는 개발 때 손으로 돌리는 도구다
  const webPkg = JSON.parse(
    readFileSync(path.join(web, "package.json"), "utf8"),
  );
  ctx.buildScripts = Object.values(webPkg.scripts ?? {}).join(" ");
  return ctx;
}

/** Next가 주소로 삼는 특수 파일(이 파일들이 화면의 시작점이다) */
const PAGE_ENTRY =
  /^(page|layout|template|not-found|error|global-error|loading|default|route|icon|apple-icon|opengraph-image|twitter-image|manifest|sitemap|robots)(\.specimen)?\.(tsx|ts|jsx|js)$/;

const RESOLVE_TAILS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

/**
 * apps/web 안의 import 그래프. `@/`와 상대 경로만 따라간다(작업 공간 패키지는 package.json으로 따로 본다).
 * 경로는 apps/web 기준. `?raw` 같은 꼬리는 뗀다
 */
function importGraph(web) {
  const isFile = new Map();
  const fileExists = (p) => {
    if (!isFile.has(p)) {
      let ok = false;
      try {
        ok = statSync(p).isFile();
      } catch {}
      isFile.set(p, ok);
    }
    return isFile.get(p);
  };
  const edges = new Map();
  const targetsOf = (rel) => {
    if (edges.has(rel)) return edges.get(rel);
    const out = [];
    if (/\.(tsx?|jsx?|mjs|css)$/.test(rel)) {
      const abs = path.join(web, rel);
      for (const spec of importsOf(readFileSync(abs, "utf8"))) {
        const clean = spec.split("?")[0];
        let base;
        if (clean.startsWith("@/"))
          base = path.join(web, "src", clean.slice(2));
        else if (clean.startsWith("."))
          base = path.resolve(path.dirname(abs), clean);
        else continue;
        const hit = RESOLVE_TAILS.map((t) => base + t).find(fileExists);
        if (!hit) continue;
        const to = toPosix(path.relative(web, hit));
        if (!to.startsWith("..")) out.push(to);
      }
    }
    edges.set(rel, out);
    return out;
  };
  return {
    /** 시작 파일들에서 닿는 모든 파일(시작 파일 포함) */
    walk(starts) {
      const seen = new Set(starts);
      const queue = [...starts];
      while (queue.length) {
        for (const to of targetsOf(queue.pop())) {
          if (!seen.has(to)) {
            seen.add(to);
            queue.push(to);
          }
        }
      }
      return seen;
    },
  };
}

/** apps/web/src 아래 경로 → 묶음 id 또는 COMMON */
export function webAreaOf(ctx, rel) {
  const parts = rel.split("/");
  if (parts[0] === "app") {
    return parts.length > 2 ? (ctx.appDir[parts[1]] ?? COMMON) : COMMON;
  }
  return parts.length > 1 ? (ctx.srcDir[parts[0]] ?? COMMON) : COMMON;
}

/** `@game/<id>-ai`·`@game/<id>-engine` → 게임 id(묶음에 있을 때만) */
export function packageOwner(ctx, name) {
  const m = name.match(/^@game\/([a-z0-9]+)(?:-[a-z0-9-]+)?(?:\/.*)?$/);
  return m && ctx.areas[m[1]] ? m[1] : null;
}

/** 게임 하나가 바뀌면 함께 볼 게임들(그 게임을 불러 쓰는 게임을 따라간다) */
function withDependents(ctx, ids) {
  const seen = new Set(ids);
  const queue = [...ids];
  while (queue.length) {
    const id = queue.pop();
    for (const user of ctx.gameDeps[id] ?? []) {
      if (!seen.has(user)) {
        seen.add(user);
        queue.push(user);
      }
    }
  }
  return seen;
}

/** 패키지와 그것에 (거쳐서라도) 기대는 작업 공간 패키지 */
export function packageDependents(ctx, name) {
  const seen = new Set([name]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [n, p] of Object.entries(ctx.packages)) {
      if (!seen.has(n) && p.deps.some((d) => seen.has(d))) {
        seen.add(n);
        grew = true;
      }
    }
  }
  return seen;
}

/**
 * 바뀐 파일 하나의 몫. { all: 까닭 } | { areas: [...], specs: [...] } | { none: true }
 * areas는 묶음 id(spec으로 바꾸기 전), specs는 바로 돌릴 spec 이름
 */
export function classify(ctx, file) {
  if (IGNORE.some((re) => re.test(file))) return { none: true };
  if (ALL.some((re) => re.test(file))) return { all: "설정·lockfile·CI" };

  const web = file.match(/^apps\/web\/(.*)$/);
  if (web) {
    const rest = web[1];
    const spec = rest.match(/^e2e\/([^/]+)\.spec\.ts$/);
    if (spec) return { areas: [], specs: [spec[1]] };
    if (rest.startsWith("e2e/")) return { all: "화면 시험 공용 도구" };
    const src = rest.match(/^src\/(.*)$/);
    if (src) return classifyWebSource(ctx, rest, src[1]);
    const script = rest.match(/^scripts\/(.+)$/);
    if (script && ctx.buildScripts != null) {
      if (
        ctx.buildScripts.includes(`scripts/${script[1]}`) ||
        ctx.reach?.[rest] ||
        ctx.specReach?.[rest]
      ) {
        return { all: "빌드가 돌리는 스크립트" };
      }
      return { none: true };
    }
    const pub = rest.match(/^public\/([^/]+)\//);
    if (pub && ctx.publicDir[pub[1]]) {
      return { areas: [ctx.publicDir[pub[1]]], specs: [] };
    }
    return { all: "웹 설정·공용 파일" };
  }

  const pkg = Object.entries(ctx.packages).find(
    ([, p]) => file.startsWith(`${p.dir}/`) && p.dir.startsWith("packages/"),
  );
  if (pkg) {
    const users = new Set();
    for (const n of packageDependents(ctx, pkg[0])) {
      for (const u of ctx.pkgUsers[n] ?? []) users.add(u);
    }
    if (users.has(COMMON)) {
      return { all: `${pkg[0]}: 여러 게임이 쓰는 웹 코드가 기댄다` };
    }
    if (users.size === 0) return { none: true };
    const areas = [...users].filter((u) => !u.startsWith("spec:"));
    const specs = [...users]
      .filter((u) => u.startsWith("spec:"))
      .map((u) => u.slice(5));
    return { areas, specs };
  }
  return { all: "짝을 모르는 파일" };
}

/**
 * apps/web/src 아래 파일의 몫. rel은 apps/web 기준(src/…), srcRel은 src 기준.
 * - 어느 화면(src/app의 page·layout 등)에서도, 어느 spec에서도 import로 닿지 않으면 없음
 * - 게임 폴더면 그 게임(예전과 같다)
 * - 공통 폴더면 그 파일에 닿는 주소 묶음만. 첫 화면·공용 주소(COMMON)가 닿으면 전부
 * - spec이 직접 불러 쓰면 그 spec도. 화면 시험 공용 도구가 불러 쓰면 전부
 */
function classifyWebSource(ctx, rel, srcRel) {
  const pages = ctx.reach?.[rel];
  const fromSpecs = ctx.specReach?.[rel] ?? new Set();
  if (ctx.reach && !pages && fromSpecs.size === 0) return { none: true };
  if (fromSpecs.has(COMMON)) return { all: "화면 시험 공용 도구가 불러 쓴다" };
  const specs = [...fromSpecs].sort();
  const id = webAreaOf(ctx, srcRel);
  if (id !== COMMON) return { areas: [id], specs };
  if (!ctx.reach) return { all: "여러 게임이 쓰는 웹 코드" };
  if (pages?.has(COMMON)) {
    return { all: "여러 게임이 쓰는 웹 코드(첫 화면·공용 주소가 불러 쓴다)" };
  }
  return { areas: [...(pages ?? [])].sort(), specs };
}

/**
 * 바뀐 파일 목록 → 돌릴 화면 시험.
 * { mode: "all"|"some"|"none", specs: string[](some일 때 spec 이름), reasons: [{ file, effect }] }
 */
export function selectE2e(ctx, files) {
  const reasons = [];
  let all = null;
  const areas = new Set();
  const specs = new Set();
  for (const file of files) {
    const c = classify(ctx, file);
    if (c.all) {
      all ??= c.all;
      reasons.push({ file, effect: `전부(${c.all})` });
    } else if (c.none) {
      reasons.push({ file, effect: "없음" });
    } else {
      for (const a of c.areas) areas.add(a);
      for (const s of c.specs) specs.add(s);
      reasons.push({
        file,
        effect: [...c.areas, ...c.specs.map((s) => `${s}.spec`)].join(", "),
      });
    }
  }
  if (all) return { mode: "all", specs: [], reasons, why: all };
  if (areas.size === 0 && specs.size === 0) {
    return { mode: "none", specs: [], reasons, why: "화면에 닿는 변경이 없다" };
  }
  for (const id of withDependents(ctx, [...areas])) {
    for (const s of ctx.areas[id]?.specs ?? []) specs.add(s);
  }
  for (const s of [...BASE_SPECS, ...(ctx.orphanSpecs ?? [])]) specs.add(s);
  // 지워진 spec(바뀐 파일 목록에는 있지만 지금은 없다)은 돌릴 수 없다
  const exist = new Set(ctx.specs);
  const picked = [...specs].filter((s) => exist.has(s)).sort();
  const games = [...withDependents(ctx, [...areas])].sort();
  return {
    mode: "some",
    specs: picked,
    reasons,
    why: games.length ? `게임: ${games.join(", ")}` : "바뀐 spec만",
  };
}

/**
 * 조각 수의 상한(2026-11-10, 2 → 6). 조각마다 설치·빌드·브라우저 준비로 약 1분 반이 따로 들어, 더 늘리면 줄어드는
 * 시험 시간보다 준비가 커진다. 한 실행의 동시 작업은 plan·check·화면 6조각·ci-ok로 많아야 8개라, 무료 공개
 * 저장소의 동시 작업 한도(20개) 안에서 PR 둘이 겹쳐 돌 수 있다
 */
export const MAX_SHARDS = 6;
/** 조각 하나가 맡을 시험 시간(작업자 시간 합, 초). 작업자 둘이면 약 2분. 이보다 적게 고르면 조각을 줄인다 */
export const SHARD_SECONDS = 240;
/** 시간 자료가 없을 때: spec 몇 개마다 조각 하나(예전 「12개 이상이면 2조각」과 같다) */
export const SPECS_PER_SHARD = 12;

/**
 * 조각 수. 전부는 늘 MAX_SHARDS. 일부는 고른 spec의 지난 시험 시간 합을 SHARD_SECONDS로 나눠 올림(시간 자료가
 * 없으면 spec 개수로), 1~MAX_SHARDS. 조각은 spec 개수보다 많지 않다
 */
export function shardCount(result, times = null) {
  if (result.mode === "none") return 0;
  const n =
    result.mode === "all"
      ? MAX_SHARDS
      : (() => {
          if (times) {
            const total = result.specs.reduce(
              (s, x) => s + specSeconds(times, x),
              0,
            );
            return Math.ceil(total / SHARD_SECONDS);
          }
          return Math.floor(result.specs.length / SPECS_PER_SHARD) + 1;
        })();
  const most = result.mode === "all" ? MAX_SHARDS : result.specs.length;
  return Math.max(1, Math.min(n, MAX_SHARDS, most));
}

/** spec 하나의 지난 시험 시간(초). 자료에 없는 spec(새로 생긴 것)은 자료의 평균으로 친다 */
export function specSeconds(times, spec) {
  const v = times.seconds[spec];
  if (typeof v === "number") return v;
  const all = Object.values(times.seconds);
  return all.length ? all.reduce((a, b) => a + b, 0) / all.length : 1;
}

/**
 * spec을 조각에 나눈다. 시간 자료가 있으면 긴 spec부터 지금 가장 가벼운 조각에 담고(같으면 앞 조각),
 * 없으면 이름 차례로 돌려 담는다. 결과는 조각마다 spec 이름 배열(이름 차례)
 */
export function planShards(specs, shards, times = null) {
  if (shards <= 0) return [];
  const bins = Array.from({ length: shards }, () => ({ load: 0, specs: [] }));
  if (!times) {
    [...specs].sort().forEach((s, i) => {
      bins[i % shards].specs.push(s);
    });
  } else {
    const order = [...specs].sort(
      (a, b) =>
        specSeconds(times, b) - specSeconds(times, a) || (a < b ? -1 : 1),
    );
    for (const s of order) {
      let best = bins[0];
      for (const b of bins) if (b.load < best.load) best = b;
      best.load += specSeconds(times, s);
      best.specs.push(s);
    }
  }
  return bins.map((b) => b.specs.sort());
}

/**
 * playwright json 결과들 → spec마다 시험 시간 합(초, 모든 화면 크기). 건너뛴 시험은 뺀다.
 * `node scripts/affected-e2e.mjs --write-times scripts/e2e-times.json <e2e.json…>`로 기준 파일을 새로 쓴다
 */
export function timesFromReports(reports) {
  const ms = {};
  const walk = (suite, file) => {
    for (const s of suite.suites ?? []) walk(s, s.file ?? file);
    for (const sp of suite.specs ?? []) {
      const name = path.basename(sp.file ?? file).replace(/\.spec\.ts$/, "");
      for (const t of sp.tests ?? []) {
        for (const r of t.results ?? []) {
          if (r.status === "skipped") continue;
          ms[name] = (ms[name] ?? 0) + (r.duration ?? 0);
        }
      }
    }
  };
  for (const r of reports) for (const s of r.suites ?? []) walk(s, s.file);
  return Object.fromEntries(
    Object.entries(ms)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, Math.round(v / 100) / 10]),
  );
}

/** 저장소의 시간 기준 파일을 읽는다. 없거나 깨졌으면 null(개수 기준으로 나눈다) */
export function readTimes(file) {
  try {
    const t = JSON.parse(readFileSync(file, "utf8"));
    return t && typeof t.seconds === "object" && Object.keys(t.seconds).length
      ? t
      : null;
  } catch {
    return null;
  }
}

export function changedFiles(root, base) {
  const out = execFileSync(
    "git",
    ["diff", "--name-only", "-z", `${base}...HEAD`],
    { cwd: root, encoding: "utf8" },
  );
  return out.split("\0").filter(Boolean);
}

function parseArgs(argv) {
  const args = { files: null, base: null, all: false, github: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--all") args.all = true;
    else if (a === "--github") args.github = true;
    else if (a === "--selection-out") args.selectionOut = argv[++i];
    else if (a === "--times") args.times = argv[++i];
    else if (a === "--no-e2e") args.noE2e = argv[++i];
    else if (a === "--files" || a === "--write-times") {
      const list = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        list.push(argv[++i]);
      }
      if (a === "--files") args.files = list;
      else args.writeTimes = list;
    }
  }
  return args;
}

/** 시간 기준 파일을 CI 결과(playwright json)로 새로 쓴다. 첫 인자가 쓸 파일 */
function writeTimes([out, ...reports]) {
  const seconds = timesFromReports(
    reports.map((f) => JSON.parse(readFileSync(f, "utf8"))),
  );
  const doc = {
    notes: [
      "화면 시험 spec마다 지난 시험 시간(초, 모든 화면 크기의 합, 건너뛴 시험 빼고). scripts/affected-e2e.mjs가 CI 조각을 고르게 나눌 때 읽는다.",
      "새로 쓰기: 매일 전부 실행(schedule)의 test-times-e2e-* artifact를 받아 node scripts/affected-e2e.mjs --write-times scripts/e2e-times.json <e2e.json…>. 없는 spec은 평균으로 친다.",
    ],
    measuredAt: new Date().toISOString().slice(0, 10),
    seconds,
  };
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`${out}: spec ${Object.keys(seconds).length}개`);
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = parseArgs(process.argv.slice(2));
  if (args.writeTimes) return writeTimes(args.writeTimes);
  const ctx = loadContext(root);
  let result;
  let files = [];
  if (args.noE2e) {
    result = { mode: "none", specs: [], reasons: [], why: args.noE2e };
  } else if (args.all || (!args.base && !args.files)) {
    result = {
      mode: "all",
      specs: [],
      reasons: [],
      why: args.all ? "전부 실행" : "기준 커밋 없음",
    };
  } else {
    files = args.files ?? changedFiles(root, args.base);
    result = selectE2e(ctx, files);
  }
  const times = readTimes(
    args.times ?? path.join(root, "scripts/e2e-times.json"),
  );
  const shards = shardCount(result, times);
  const specPaths = result.specs.map((s) => `e2e/${s}.spec.ts`);
  // 조각마다 spec 목록을 넘긴다(전부여도). Playwright --shard는 시험 개수로 잘라 조각이 기울었다(2026-11-10 1,293초 대 993초)
  const plan = planShards(
    result.mode === "all" ? ctx.specs : result.specs,
    shards,
    times,
  );
  const estimate = (list) =>
    times
      ? Math.round(list.reduce((s, x) => s + specSeconds(times, x), 0))
      : null;

  console.log(
    `화면 시험: ${result.mode} (${result.why}), 조각 ${shards}개(${times ? "지난 시험 시간으로" : "spec 개수로"} 나눔)`,
  );
  if (result.mode === "some") console.log(`  ${result.specs.join(" ")}`);
  plan.forEach((list, i) => {
    const sec = estimate(list);
    console.log(
      `  조각 ${i + 1}: spec ${list.length}개${sec == null ? "" : `, 약 ${sec}초(작업자 시간 합)`}`,
    );
  });
  for (const r of result.reasons) console.log(`  ${r.file} → ${r.effect}`);

  if (args.github && process.env.GITHUB_OUTPUT) {
    const matrix = {
      include: plan.map((list, i) => ({
        shard: i + 1,
        specs: list.map((s) => `e2e/${s}.spec.ts`).join(" "),
      })),
    };
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `e2e=${result.mode}`,
        `specs=${specPaths.join(" ")}`,
        `matrix=${JSON.stringify(matrix)}`,
        `shard_total=${shards}`,
        "",
      ].join("\n"),
    );
  }
  if (args.github && process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      "### 고른 시험",
      "",
      `- 기준 커밋: ${args.base ? `\`${args.base.slice(0, 12)}\`` : "없음(전부)"}`,
      `- 화면 시험: **${result.mode}** (${result.why}), 조각 ${shards}개(${times ? "지난 시험 시간으로" : "spec 개수로"} 나눔)`,
    ];
    if (result.mode === "some") {
      lines.push(`- spec ${result.specs.length}개: ${result.specs.join(", ")}`);
    }
    plan.forEach((list, i) => {
      const sec = estimate(list);
      lines.push(
        `- 조각 ${i + 1}: spec ${list.length}개${sec == null ? "" : `, 약 ${sec}초`}`,
      );
    });
    if (result.reasons.length) {
      lines.push("", "<details><summary>바뀐 파일과 몫</summary>", "");
      for (const r of result.reasons.slice(0, 200)) {
        lines.push(`- \`${r.file}\` → ${r.effect}`);
      }
      lines.push("", "</details>");
    }
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
  if (args.selectionOut) {
    writeFileSync(
      args.selectionOut,
      `${JSON.stringify({
        base: args.base ?? null,
        unit: args.base ? "changed" : "all",
        e2e: result.mode,
        specs: specPaths,
        files: files.length,
      })}\n`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
