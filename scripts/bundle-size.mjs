#!/usr/bin/env node
// 페이지별 첫 로딩 JS 크기를 잰다(2026-11-25, docs/38 「첫 화면 가볍게」).
// `pnpm --filter @game/web build` 뒤에 돌린다. 내보낸 HTML(apps/web/out/<주소>.html)이 처음 받는
// `/_next/static/chunks/*.js`를 모아 파일마다 gzip한 크기를 더한다. 브라우저가 그 주소를 처음 열 때
// 받는 JS와 같다(나중에 동적 불러오기로 받는 묶음은 들지 않는다).
//
//   node scripts/bundle-size.mjs                        기본 주소들의 표
//   node scripts/bundle-size.mjs /omok /cube            고른 주소만
//   node scripts/bundle-size.mjs --json <파일>          결과를 JSON으로도 남긴다
//   node scripts/bundle-size.mjs --compare <파일>       남겨 둔 JSON과 견준 표(전·후·차이)
//   node scripts/bundle-size.mjs --sources /omok        그 주소가 처음 받는 소스를 묶음(패키지·src 폴더)별로
//                                                       (`ANALYZE=1 pnpm --filter @game/web build`로 소스 맵을 만든 뒤.
//                                                        크기는 소스 맵에 든 원본 소스 글자 수라 대강의 비율로만 본다)
//   node scripts/bundle-size.mjs --files /omok          같은 것을 파일 하나씩
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "apps/web/out");
const DEFAULT_PAGES = [
  "/",
  "/omok",
  "/baduk",
  "/mighty",
  "/stardraw",
  "/cube",
  "/profile",
  "/review",
];

/** HTML이 처음 받는 청크 경로(중복 없이, 나온 차례대로). */
export function chunksOf(html) {
  const seen = new Set();
  for (const m of html.matchAll(/\/_next\/static\/chunks\/[\w.~-]+\.js/g)) {
    seen.add(m[0]);
  }
  return [...seen];
}

function htmlPath(page) {
  return page === "/" ? join(OUT, "index.html") : join(OUT, `${page}.html`);
}

const gzCache = new Map();
function gz(chunk) {
  let size = gzCache.get(chunk);
  if (size === undefined) {
    size = gzipSync(readFileSync(join(OUT, chunk))).length;
    gzCache.set(chunk, size);
  }
  return size;
}

function measurePage(page) {
  const chunks = chunksOf(readFileSync(htmlPath(page), "utf8"));
  const raw = chunks.reduce((n, c) => n + statSync(join(OUT, c)).size, 0);
  const gzip = chunks.reduce((n, c) => n + gz(c), 0);
  return { chunks: chunks.length, raw, gzip };
}

function measureAllChunks() {
  const dir = join(OUT, "_next/static/chunks");
  let files = 0;
  let raw = 0;
  for (const name of readdirSync(dir, { recursive: true })) {
    const full = join(dir, String(name));
    if (!String(name).endsWith(".js") || !statSync(full).isFile()) continue;
    files++;
    raw += statSync(full).size;
  }
  return { files, raw };
}

const kb = (n) => (n / 1024).toFixed(1);

/** 소스 경로를 묶음 이름으로: node_modules 패키지, packages/<이름>, apps/web/src/<폴더>. */
export function groupOf(source) {
  const s = source
    .replace(/^.*?\[project\]\//, "")
    .replace(/^turbopack:\/\/\//, "");
  const nm = s.match(
    /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/,
  );
  if (nm) return `npm:${nm[1]}`;
  const pkg = s.match(/packages\/([^/]+)\//);
  if (pkg) return `packages/${pkg[1]}`;
  const web = s.match(/apps\/web\/src\/([^/]+)(\/[^/]+)?/);
  if (web)
    return web[2]
      ? `src/${web[1]}${web[2].includes(".") ? "" : web[2]}`
      : `src/${web[1]}`;
  return s;
}

function printSources(page, byFile) {
  const groups = new Map();
  for (const chunk of chunksOf(readFileSync(htmlPath(page), "utf8"))) {
    // 맵 파일 이름은 청크 이름과 다를 수 있어 청크 끝의 sourceMappingURL을 따른다
    const url = readFileSync(join(OUT, chunk), "utf8").match(
      /\/\/# sourceMappingURL=([\w.~-]+)\s*$/,
    )?.[1];
    if (!url) continue;
    let map;
    try {
      map = JSON.parse(readFileSync(join(OUT, dirname(chunk), url), "utf8"));
    } catch {
      continue;
    }
    const sections = map.sections ? map.sections.map((s) => s.map) : [map];
    for (const m of sections) {
      (m.sources ?? []).forEach((src, i) => {
        const g = byFile ? src.replace(/^.*?\[project\]\//, "") : groupOf(src);
        groups.set(
          g,
          (groups.get(g) ?? 0) + (m.sourcesContent?.[i]?.length ?? 0),
        );
      });
    }
  }
  if (groups.size === 0) {
    console.log("소스 맵이 없어요. ANALYZE=1로 빌드한 뒤 다시 돌려 주세요.");
    return;
  }
  const limit = byFile ? 80 : 40;
  const rows = [...groups].sort((a, b) => b[1] - a[1]).slice(0, limit);
  console.log(`${page} 처음 받는 소스(원본 KB, 위 ${limit}개)`);
  for (const [g, n] of rows) console.log(`${kb(n).padStart(8)}  ${g}`);
}

function main(argv) {
  const pages = [];
  let jsonOut;
  let compare;
  let sources = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") jsonOut = argv[++i];
    else if (argv[i] === "--compare") compare = argv[++i];
    else if (argv[i] === "--sources") sources = true;
    else if (argv[i] === "--files") sources = "files";
    else pages.push(argv[i]);
  }
  if (sources) {
    for (const p of pages.length ? pages : ["/"])
      printSources(p, sources === "files");
    return;
  }
  const result = { pages: {}, all: measureAllChunks() };
  for (const p of pages.length ? pages : DEFAULT_PAGES) {
    result.pages[p] = measurePage(p);
  }
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(result, null, 2)}\n`);

  const before = compare ? JSON.parse(readFileSync(compare, "utf8")) : null;
  const lines = before
    ? ["| 주소 | 전 KB(gzip) | 후 KB(gzip) | 차이 |", "|---|---:|---:|---:|"]
    : ["| 주소 | 청크 수 | KB(gzip) | KB(원본) |", "|---|---:|---:|---:|"];
  for (const [p, m] of Object.entries(result.pages)) {
    if (before) {
      const b = before.pages[p];
      const diff = b
        ? `${(((m.gzip - b.gzip) / b.gzip) * 100).toFixed(0)}%`
        : "";
      lines.push(
        `| ${p} | ${b ? kb(b.gzip) : "-"} | ${kb(m.gzip)} | ${diff} |`,
      );
    } else {
      lines.push(`| ${p} | ${m.chunks} | ${kb(m.gzip)} | ${kb(m.raw)} |`);
    }
  }
  const a = result.all;
  lines.push(
    "",
    `chunks 폴더 JS: ${a.files}개, ${kb(a.raw)} KB(원본)${
      before ? ` (전 ${before.all.files}개, ${kb(before.all.raw)} KB)` : ""
    }`,
  );
  console.log(lines.join("\n"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
