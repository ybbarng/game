#!/usr/bin/env node
// 느린 시험 찾기(2026-11-03). CI가 남긴 시험 시간(vitest JSON, playwright JSON)을 scripts/slow-tests.json의
// 기준과 비교해, 최근 몇 번의 실행에서 자꾸 기준을 넘는 시험을 라벨 `slow-test` 이슈 하나에 모은다.
// 지난 실행 기록은 그 이슈 본문 끝의 숨긴 JSON 블록에 이어 둔다(따로 저장소·artifact를 뒤지지 않는다).
// .github/workflows/slow-tests.yml이 main push CI가 성공한 뒤 돌린다. 어떤 일이 있어도 0으로 끝난다.
//
//   node scripts/slow-tests.mjs --unit unit.json --e2e e2e-1.json --e2e e2e-2.json [--selection selection.json] [--dry-run]
//
// CI가 바뀐 것만 시험하게 된 뒤(2026-11-04) 실행마다 돈 시험이 다르다. --selection(CI의 고르기 기록)과 결과에 나온
// 파일로 실행마다 무엇을 쟀는지 남기고, 시험마다 그 시험을 잰 실행만 센다(돌지 않은 시험을 빨라졌다고 읽지 않게).
//
// GITHUB_TOKEN·GITHUB_REPOSITORY가 없거나 --dry-run이면 이슈를 건드리지 않고 본문만 찍는다.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LABEL = "slow-test";
const STATE_OPEN = "<!-- slow-tests-state";
const STATE_CLOSE = "-->";
/** 이슈 본문 상한은 65,536자. 숨긴 기록이 이보다 크면 옛 실행부터 버린다 */
const STATE_MAX_CHARS = 50_000;

const KIND_LABEL = {
  "unit-file": "단위 파일",
  "unit-test": "단위 시험",
  e2e: "화면 시험",
};
const KIND_ORDER = ["unit-file", "unit-test", "e2e"];

/** 저장소 기준 경로로. CI 작업마다 실행 위치(저장소를 받은 폴더)가 같지 않을 수 있어 알려진 첫 폴더로 찾는다 */
function toRepoPath(file, root) {
  const unix = path.resolve(root, file).split(path.sep).join("/");
  const m = unix.match(/\/((?:apps|packages|scripts)\/.*)$/);
  return m ? m[1] : path.relative(root, unix).split(path.sep).join("/");
}

function itemId(kind, name, file) {
  return createHash("sha1")
    .update(`${kind}\0${file}\0${name}`)
    .digest("hex")
    .slice(0, 10);
}

/** vitest JSON reporter 결과 → 파일·시험별 시간과 전체 시간 */
export function readVitest(report, root) {
  const items = [];
  const files = [];
  const start = report.startTime;
  let end = start;
  for (const f of report.testResults ?? []) {
    const file = toRepoPath(f.name, root);
    files.push(file);
    if (Number.isFinite(f.startTime) && Number.isFinite(f.endTime)) {
      end = Math.max(end, f.endTime);
      items.push({
        kind: "unit-file",
        name: file,
        file,
        ms: Math.round(f.endTime - f.startTime),
      });
    }
    for (const t of f.assertionResults ?? []) {
      if (t.status !== "passed" && t.status !== "failed") continue;
      if (typeof t.duration !== "number") continue;
      items.push({
        kind: "unit-test",
        name: t.fullName ?? t.title,
        // `-t`로 혼자 돌릴 때 쓴다(vitest는 describe까지 붙인 이름을 공백으로 잇지 않아 fullName으로는 안 맞는다)
        title: t.title,
        file,
        ms: Math.round(t.duration),
      });
    }
  }
  return { items, files, totalMs: Math.round(end - start) };
}

/** playwright JSON reporter 결과 → 화면 시험별 시간과 조각 전체 시간. 건너뛴 시험은 뺀다 */
export function readPlaywright(report, root) {
  const items = [];
  const files = new Set();
  const base = report.config?.rootDir ?? root;
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      const file = toRepoPath(path.resolve(base, spec.file), root);
      files.add(file);
      for (const test of spec.tests ?? []) {
        const last = test.results?.at(-1);
        if (!last || last.status === "skipped" || test.status === "skipped") {
          continue;
        }
        items.push({
          kind: "e2e",
          name: `[${test.projectName}] ${[...titles, spec.title].join(" › ")}`,
          file,
          line: spec.line,
          project: test.projectName,
          ms: Math.round(last.duration),
        });
      }
    }
    for (const s of suite.suites ?? []) walk(s, [...titles, s.title]);
  };
  // 맨 위 묶음은 파일이라 제목에 넣지 않는다
  for (const s of report.suites ?? []) walk(s, []);
  return {
    items,
    files: [...files],
    totalMs: Math.round(report.stats?.duration ?? 0),
  };
}

/** 이슈 본문에서 숨긴 기록을 꺼낸다. 없거나 깨졌으면 빈 기록 */
export function parseState(body) {
  const empty = { v: 1, items: {}, runs: [], firstSeen: {} };
  if (!body) return empty;
  const at = body.lastIndexOf(STATE_OPEN);
  if (at < 0) return empty;
  const end = body.indexOf(STATE_CLOSE, at + STATE_OPEN.length);
  if (end < 0) return empty;
  try {
    const s = JSON.parse(body.slice(at + STATE_OPEN.length, end));
    return {
      v: 1,
      items: s.items ?? {},
      runs: Array.isArray(s.runs) ? s.runs : [],
      firstSeen: s.firstSeen ?? {},
    };
  } catch {
    return empty;
  }
}

/** HTML 주석 안에 넣어도 닫히지 않게 `<`·`>`를 JSON 이스케이프로(JSON 밖에는 이 글자가 없다) */
function stateBlock(state) {
  const json = JSON.stringify(state)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  return `${STATE_OPEN}\n${json}\n${STATE_CLOSE}`;
}

const fileId = (file) =>
  createHash("sha1").update(file).digest("hex").slice(0, 8);

const KIND_GROUP = { "unit-file": "unit", "unit-test": "unit", e2e: "e2e" };

/**
 * 그 실행에서 이 시험을 쟀는가. CI가 바뀐 것만 시험하게 된 뒤(2026-11-04) 실행마다 돈 파일이 다르다.
 * run.ran이 없거나(옛 기록) 종류별 값이 null이면 전부 돈 실행, 배열이면 그 파일(fileId)만 돌았다
 */
function measured(run, item) {
  const ran = run.ran?.[KIND_GROUP[item.kind]];
  return ran == null || ran.includes(fileId(item.file));
}

/**
 * 이번 실행을 기록에 더하고 이슈에 올릴 시험을 고른다.
 * current: { items, unitMs, e2eMs: number[], ran?: { unit, e2e } }(ran은 종류별로 null=전부 또는 돈 파일 경로 배열),
 * meta: { at: "YYYY-MM-DD", sha }.
 * 시험마다 "그 시험을 잰" 최근 window번 실행으로 판단한다. 고른 시험만 돈 실행에서 빠진 시험을 "빨라졌다"로 읽지
 * 않게(빠진 실행은 세지 않는다). 그래서 실행 기록은 window보다 넉넉히(config.keep) 둔다
 */
export function update(prev, current, config, meta) {
  const { limits, window, minHits, watchRatio } = config;
  const keep = Math.max(config.keep ?? window, window);
  const items = { ...prev.items };
  const times = {};
  for (const it of current.items) {
    const limit = limits[it.kind];
    if (!limit || it.ms < limit * watchRatio) continue;
    const id = itemId(it.kind, it.name, it.file);
    times[id] = Math.max(times[id] ?? 0, it.ms);
    items[id] = {
      kind: it.kind,
      name: it.name,
      file: it.file,
      ...(it.title ? { title: it.title } : {}),
      ...(it.line ? { line: it.line } : {}),
      ...(it.project ? { project: it.project } : {}),
    };
  }
  const ranIds = (files) => (files == null ? null : files.map(fileId).sort());
  const partial = current.ran?.unit != null || current.ran?.e2e != null;
  let runs = [
    ...prev.runs,
    {
      at: meta.at,
      sha: meta.sha,
      unitMs: current.unitMs ?? null,
      e2eMs: current.e2eMs ?? [],
      times,
      ...(partial
        ? {
            ran: {
              unit: ranIds(current.ran.unit),
              e2e: ranIds(current.ran.e2e),
            },
          }
        : {}),
    },
  ].slice(-keep);

  // 그 시험을 잰 최근 window번
  const recent = (id, rs = runs) =>
    rs.filter((r) => items[id] && measured(r, items[id])).slice(-window);
  const overIn = (id) =>
    recent(id).filter((r) => (r.times[id] ?? 0) > limits[items[id]?.kind]);
  const slowIds = Object.keys(items).filter(
    (id) => items[id] && overIn(id).length >= minHits,
  );
  const firstSeen = {};
  for (const id of slowIds) {
    firstSeen[id] = prev.firstSeen[id] ?? overIn(id)[0].at;
  }

  let state;
  for (;;) {
    const used = new Set(runs.flatMap((r) => Object.keys(r.times)));
    const kept = Object.fromEntries(
      Object.entries(items).filter(([id]) => used.has(id)),
    );
    state = { v: 1, items: kept, runs, firstSeen };
    if (stateBlock(state).length <= STATE_MAX_CHARS || runs.length <= 1) break;
    runs = runs.slice(1);
  }

  const slow = slowIds
    .map((id) => ({
      id,
      ...items[id],
      limit: limits[items[id].kind],
      times: recent(id, state.runs).map((r) => r.times[id] ?? null),
      firstSeen: firstSeen[id],
    }))
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        Math.max(...b.times) - Math.max(...a.times),
    );
  return { state, slow };
}

const shortSha = (sha) => (sha ? `\`${sha.slice(0, 7)}\`` : "");
const sec = (ms) => `${(ms / 1000).toFixed(1)}초`;
/** 표 칸 안에서 `|`가 칸을 나누지 않고, `<`·`>`가 HTML(숨긴 기록의 주석 끝 포함)로 읽히지 않게 */
const cell = (s) =>
  String(s).replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shellQuote = (s) => `'${s.replace(/'/g, "'\\''")}'`;
const regexEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 혼자 돌려 보는 명령 한 줄(저장소 맨 위에서) */
export function soloCommand(item) {
  if (item.kind === "unit-file") {
    return `pnpm vitest run ${item.file}`;
  }
  if (item.kind === "unit-test") {
    return `pnpm vitest run ${item.file} -t ${shellQuote(`${regexEscape(item.title ?? item.name)}$`)}`;
  }
  const spec = item.file.replace(/^apps\/web\//, "");
  return `pnpm --filter @game/web exec playwright test ${spec}:${item.line} --project=${item.project} --workers=1`;
}

/** 이슈 본문(한국어). 끝에 다음 실행이 읽을 기록을 숨겨 둔다 */
export function renderBody(state, slow, config, meta = {}) {
  const { limits, window, minHits } = config;
  const last = state.runs.at(-1);
  const lines = [];
  lines.push(
    `main CI가 성공할 때마다 시험 시간을 재서, 기준을 자꾸 넘는 시험을 여기에 모은다. 그 시험을 잰 최근 ${window}번 실행 가운데 ${minHits}번 이상 넘은 것만 올린다(한 번 우연히 느린 것은 뺀다. CI는 바뀐 것만 시험하므로 그 시험이 돌지 않은 실행은 세지 않는다).`,
    "",
    `기준(CI에서 잰 시간, \`scripts/slow-tests.json\`): 단위 시험 파일 ${sec(limits["unit-file"])} · 단위 시험 하나 ${sec(limits["unit-test"])} · 화면 시험 하나 ${sec(limits.e2e)}.`,
    `마지막 갱신: ${last?.at ?? "-"} ${shortSha(last?.sha)}${meta.runUrl ? ` ([CI 실행](${meta.runUrl}))` : ""}`,
    "",
  );
  if (slow.length === 0) {
    lines.push("지금은 기준을 넘는 시험이 없다.", "");
  } else {
    lines.push(
      `### 기준을 넘는 시험 ${slow.length}개`,
      "",
      "| 종류 | 시험 | 파일 | 잰 최근 시간(옛 → 새) | 기준 | 처음 본 날 |",
      "|---|---|---|---|---|---|",
    );
    for (const s of slow) {
      const where = s.line ? `${s.file}:${s.line}` : s.file;
      const recent = s.times.map((t) => (t == null ? "—" : sec(t))).join(" · ");
      lines.push(
        `| ${KIND_LABEL[s.kind]} | ${cell(s.kind === "unit-file" ? "(파일 전체)" : s.name)} | \`${cell(where)}\` | ${recent} | ${sec(s.limit)} | ${s.firstSeen} |`,
      );
    }
    lines.push(
      "",
      "`—`는 그 실행에서 기준의 80% 아래였다는 뜻이다(기록을 줄이려고 적지 않는다). 그 시험이 돌지 않은 실행은 칸에 넣지 않는다.",
      "",
      "#### 혼자 돌려 보기(저장소 맨 위에서. 화면 시험은 먼저 `pnpm --filter @game/web build`)",
      "",
      "```sh",
      ...slow.map(soloCommand),
      "```",
      "",
      "고칠 때는 CLAUDE.md 시험 규칙을 따른다: 확인할 지점까지만 두고, 덱·판 수·참가자 수는 역할에 필요한 만큼, 운은 결정적으로, 시간 상한을 늘려 덮지 않는다. 고쳐서 main에 올리면 다음 실행들에서 기준 안으로 들어와 표에서 빠지고, 모두 빠지면 이 이슈가 닫힌다.",
      "",
    );
  }
  lines.push(
    "### 전체 시간",
    "",
    "| 실행 | 단위 시험 전체 | 화면 시험 조각 |",
    "|---|---|---|",
  );
  // 고른 시험만 돈 실행은 「일부」를 붙인다(전체 시간이 줄어도 빨라진 것이 아니다)
  const part = (ran) => (ran == null ? "" : ` (일부 ${ran.length}파일)`);
  for (const r of state.runs) {
    lines.push(
      `| ${r.at} ${shortSha(r.sha)} | ${r.unitMs == null ? "—" : `${sec(r.unitMs)}${part(r.ran?.unit)}`} | ${r.e2eMs.length ? `${r.e2eMs.map(sec).join(" · ")}${part(r.ran?.e2e)}` : "—"} |`,
    );
  }
  lines.push("", stateBlock(state), "");
  return lines.join("\n");
}

/** 이슈 제목: 남은 개수가 목록에서 바로 보이게 */
export function issueTitle(slow) {
  return slow.length
    ? `느린 시험 ${slow.length}개: 기준을 넘는 시험 고치기`
    : "느린 시험: 지금은 없음";
}

async function github(method, url, body) {
  const repo = process.env.GITHUB_REPOSITORY;
  const res = await fetch(`https://api.github.com/repos/${repo}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`${method} ${url}: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** 라벨이 붙은 이슈 하나(열린 것 우선, 없으면 가장 먼저 만든 닫힌 것) */
async function findIssue() {
  const list = await github(
    "GET",
    `/issues?labels=${LABEL}&state=all&sort=created&direction=asc&per_page=100`,
  );
  const issues = list.filter((i) => !i.pull_request);
  return issues.find((i) => i.state === "open") ?? issues[0] ?? null;
}

/**
 * CI 고르기 기록(scripts/affected-e2e.mjs --selection-out)과 결과에 나온 파일로, 종류마다 전부 돌았는지(null)
 * 돈 파일 목록인지 정한다. 기록이 없으면 결과에 나온 파일만 잰 것으로 본다(전부 돈 실행이어도 결과는 같다)
 */
export function ranOf(selection, ranFiles) {
  return {
    unit: selection?.unit === "all" ? null : ranFiles.unit,
    e2e: selection?.e2e === "all" ? null : ranFiles.e2e,
  };
}

function parseArgs(argv) {
  const args = { unit: [], e2e: [], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--unit") args.unit.push(argv[++i]);
    else if (a === "--e2e") args.e2e.push(argv[++i]);
    else if (a === "--limits") args.limits = argv[++i];
    else if (a === "--selection") args.selection = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

function readJson(file) {
  if (!file || !existsSync(file)) {
    console.log(`::warning::시험 시간 파일이 없다: ${file}`);
    return null;
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const config = JSON.parse(
    readFileSync(args.limits ?? path.join(here, "slow-tests.json"), "utf8"),
  );

  const current = { items: [], unitMs: null, e2eMs: [] };
  const ranFiles = { unit: [], e2e: [] };
  for (const f of args.unit) {
    const r = readJson(f);
    if (!r) continue;
    const v = readVitest(r, root);
    current.items.push(...v.items);
    ranFiles.unit.push(...v.files);
    current.unitMs = v.totalMs;
  }
  for (const f of args.e2e) {
    const r = readJson(f);
    if (!r) continue;
    const p = readPlaywright(r, root);
    current.items.push(...p.items);
    ranFiles.e2e.push(...p.files);
    current.e2eMs.push(p.totalMs);
  }
  current.ran = ranOf(
    args.selection ? readJson(args.selection) : null,
    ranFiles,
  );
  if (current.items.length === 0) {
    console.log("::warning::시험 시간이 하나도 없어 이슈를 건드리지 않는다");
    return;
  }

  const online =
    !args.dryRun && process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY;
  const issue = online ? await findIssue() : null;
  const { state, slow } = update(parseState(issue?.body), current, config, {
    at: new Date().toISOString().slice(0, 10),
    sha: process.env.SHA ?? process.env.GITHUB_SHA ?? "",
  });
  const body = renderBody(state, slow, config, {
    runUrl: process.env.RUN_URL,
  });
  const title = issueTitle(slow);
  console.log(`기준을 넘는 시험 ${slow.length}개`);
  for (const s of slow) console.log(`  ${KIND_LABEL[s.kind]} ${s.name}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## ${title}\n\n${body.slice(0, body.lastIndexOf(STATE_OPEN))}`,
    );
  }
  if (!online) {
    console.log(body);
    return;
  }

  // 첫 실행에서 나중을 위해 기록만 남길 때도 이슈가 있어야 한다(기록은 닫힌 이슈 본문에도 이어 둔다)
  const state_ = slow.length ? "open" : "closed";
  if (!issue) {
    try {
      await github("POST", "/labels", {
        name: LABEL,
        color: "fbca04",
        description: "CI에서 기준보다 오래 걸리는 시험(scripts/slow-tests.mjs)",
      });
    } catch (e) {
      if (e.status !== 422) throw e; // 422: 이미 있다
    }
    const created = await github("POST", "/issues", {
      title,
      body,
      labels: [LABEL],
    });
    if (state_ === "closed") {
      await github("PATCH", `/issues/${created.number}`, {
        state: "closed",
        state_reason: "completed",
      });
    }
    console.log(`이슈 #${created.number}을 만들었다(${state_})`);
    return;
  }
  await github("PATCH", `/issues/${issue.number}`, {
    title,
    body,
    state: state_,
    ...(state_ === "closed" ? { state_reason: "completed" } : {}),
  });
  console.log(`이슈 #${issue.number}을 고쳤다(${state_})`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // 느린 시험 알림 때문에 CI가 떨어지지 않게 늘 0으로 끝난다
  main().catch((e) => {
    console.log(`::warning::느린 시험 이슈를 고치지 못했다: ${e.message}`);
  });
}
