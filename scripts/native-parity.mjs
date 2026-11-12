#!/usr/bin/env node
// 사이트 미니 큐브 화면과 Cubie 네이티브 큐브 창이 어긋나지 않게 막는 PR 검사(2026-11-12, docs/52 5-7).
//
// Cubie 0.2.0부터 큐브 창은 앱이 직접 그린다(apps/cubie, native/). 사이트 미니 화면(apps/web/src/cube/mini)과 그것이
// 쓰는 큐브 보기·키·설정·연습 코드를 고치고 네이티브를 그대로 두면, 사이트와 앱이 조용히 달라진다. 그래서 PR에서
// 아래 WATCHED에 든 파일이 바뀌었는데 apps/cubie/·native/ 아래가 하나도 안 바뀌면 실패한다.
// 네이티브와 상관없는 고침(사이트 전용 화면에만 닿는 것 등)은 PR 본문에 한 줄을 적으면 통과한다:
//   네이티브 해당 없음: <이유>
//
//   node scripts/native-parity.mjs --base <커밋>   바뀐 파일 = git diff <커밋>...HEAD
//   node scripts/native-parity.mjs --files a b c  바뀐 파일을 직접 준다
//   덧붙임: --github(GITHUB_STEP_SUMMARY에 쓰고 ::error::로 알린다)
// PR 본문은 환경 변수 PR_BODY로 받는다(셸 해석을 거치지 않게). 본문에 이유 줄이 없고 PR_API_URL·GITHUB_TOKEN이 있으면
// GitHub API로 지금 본문을 한 번 더 읽는다. 본문을 고친 뒤 작업을 다시 돌리면(Re-run) 이벤트 본문은 옛것이기 때문이다.
//
// 판 규칙·힌트·공식 연습·F1 표 글자·화면 상태(가리기·칸 색)는 공통 시험 자료(native/cube-core/fixtures ↔
// apps/web/src/cube/native)가 값으로 견준다. 이 검사는 그 자료로 못 잡는 것(그리기·연출·말풍선 자리 등)을 사람이
// 함께 고치도록 알리는 장치다.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const WEB = "apps/web/src/";

/**
 * Cubie 큐브 창 동작에 닿는 사이트 코드. 끝이 /이면 그 폴더 전부, 아니면 그 파일 하나.
 * why는 실패 글에 그대로 나온다. 고를 때 기준: 미니 화면(MiniCubeApp)이 불러오고, 네이티브가 같은 일을 따로 하는 것.
 * 기록 창·티어표·설정 창도 앱이 직접 그리므로(docs/52 5-8) 그 사이트 화면을 넣는다. 설정 화면 가운데 사용자 배치 편집
 * (`keymap-editor.ts`)은 앱이 사이트 창으로 열어 사이트 배포로 바뀌므로 넣지 않는다.
 * 수 계산 패키지(packages/cube-*)는 Rust CI 작업과 공통 시험 자료가 값으로 본다.
 */
export const WATCHED = [
  { path: `${WEB}cube/mini/`, why: "미니 큐브 화면" },
  { path: `${WEB}app/cube/mini/`, why: "미니 큐브 화면 주소" },
  { path: `${WEB}cube/view/`, why: "큐브 그리기·거울 판·카메라" },
  { path: `${WEB}cube/input/`, why: "키 해석·키 배치·사용자 배치" },
  { path: `${WEB}cube/keys/two-hand.ts`, why: "「두 손」 키 배치" },
  { path: `${WEB}cube/keys/layout.ts`, why: "키보드 배치(F1 표)" },
  { path: `${WEB}cube/keys/move-keys.ts`, why: "힌트 키캡 줄" },
  { path: `${WEB}cube/keys/reach.ts`, why: "힌트 키캡 줄(손 닿기)" },
  { path: `${WEB}cube/keys/hand-layers.ts`, why: "키 층 나누기" },
  { path: `${WEB}cube/keys/key-colors.ts`, why: "F1 표 칸 색" },
  { path: `${WEB}cube/components/KeyboardMap.tsx`, why: "F1 단축키 표" },
  { path: `${WEB}cube/settings.ts`, why: "색·돌리는 시간·소리 설정" },
  { path: `${WEB}cube/scramble-show.ts`, why: "섞기 연출" },
  { path: `${WEB}cube/solve-session.ts`, why: "한 판 기록·가리기" },
  { path: `${WEB}cube/flow/combo.ts`, why: "흐름 콤보" },
  { path: `${WEB}cube/hero/`, why: "홈 시연·첫 면 색" },
  { path: `${WEB}cube/practice/`, why: "공식 연습" },
  { path: `${WEB}cube/learn/judge.ts`, why: "단계 판정·가리기(stageMask)" },
  { path: `${WEB}cube/learn/alg-sets.ts`, why: "공식 연습 자료" },
  { path: `${WEB}cube/algs/spot.ts`, why: "힌트 상황 찾기" },
  { path: `${WEB}cube/algs/store.ts`, why: "공식 고르기" },
  { path: `${WEB}cube/game-sounds.ts`, why: "큐브 소리" },
  {
    path: `${WEB}game/sound.ts`,
    why: "소리 모양(네이티브는 같은 모양을 PCM으로)",
  },
  { path: `${WEB}cube/replay-player.ts`, why: "다시 보기" },
  { path: `${WEB}cube/records.ts`, why: "기록 한 판" },
  { path: `${WEB}cube/tiers/rank.ts`, why: "Ao5·티어" },
  {
    path: `${WEB}cube/tiers/TiersApp.tsx`,
    why: "티어표 창(앱 NativeTiersWindow)",
  },
  {
    path: `${WEB}cube/tiers/TierTable.tsx`,
    why: "티어 기준표(앱 NativeTiersWindow)",
  },
  { path: `${WEB}cube/tiers/table.ts`, why: "티어 표 자료(코어 data.rs)" },
  {
    path: `${WEB}cube/tiers/TierEmblem.tsx`,
    why: "티어 엠블럼(앱에 묶은 PNG)",
  },
  {
    path: `${WEB}cube/components/CubeSettingsApp.tsx`,
    why: "설정 창(앱 NativeSettingsWindow)",
  },
  { path: `${WEB}cube/native/`, why: "공통 시험 자료(사이트 쪽)" },
];

/** 감시 폴더 안이어도 큐브 창과 상관없는 것(사이트 전용 대결) */
export const IGNORED = [
  `${WEB}cube/practice/versus.ts`,
  `${WEB}cube/practice/versus-bot.ts`,
];

/** 이 아래가 하나라도 바뀌면 네이티브도 함께 고친 것으로 본다 */
export const NATIVE_DIRS = ["apps/cubie/", "native/"];

/** 단위 시험·시험 도우미 파일만 바뀐 것은 동작을 바꾸지 않는다 */
const TEST_FILE = /(\.test\.[cm]?[jt]sx?|-test-util\.[jt]sx?)$/;

/** PR 본문의 통과 줄. 앞에 목록 표시(-, *)·굵게(**)가 붙어도 되고, 이유가 비면 안 된다 */
const REASON_LINE =
  /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?네이티브 해당 없음(?:\*\*)?[ \t]*[:：][ \t]*(?:\*\*)?[ \t]*(\S.*)$/m;

/** 파일 하나가 감시 대상이면 그 항목, 아니면 null */
export function watchedEntry(file) {
  if (TEST_FILE.test(file) || IGNORED.includes(file)) return null;
  return (
    WATCHED.find((w) =>
      w.path.endsWith("/") ? file.startsWith(w.path) : file === w.path,
    ) ?? null
  );
}

/** PR 본문에서 「네이티브 해당 없음: <이유>」의 이유를 꺼낸다. 없으면 null */
export function reasonInBody(body) {
  if (typeof body !== "string") return null;
  const m = body.replace(/\r\n?/g, "\n").match(REASON_LINE);
  if (!m) return null;
  const reason = m[1].replace(/\*\*$/, "").trim();
  return reason.length > 0 ? reason : null;
}

/**
 * 바뀐 파일과 PR 본문으로 판정한다.
 * @returns {{ ok: boolean, state: "none"|"native"|"reason"|"missing", watched: {file:string, why:string}[], native: string[], reason: string|null }}
 */
export function checkParity(files, body) {
  const watched = [];
  for (const file of files) {
    const w = watchedEntry(file);
    if (w) watched.push({ file, why: w.why });
  }
  const native = files.filter((f) => NATIVE_DIRS.some((d) => f.startsWith(d)));
  const reason = reasonInBody(body);
  if (watched.length === 0)
    return { ok: true, state: "none", watched, native, reason };
  if (native.length > 0)
    return { ok: true, state: "native", watched, native, reason };
  if (reason) return { ok: true, state: "reason", watched, native, reason };
  return { ok: false, state: "missing", watched, native, reason };
}

/** 사람이 읽는 결과 글(줄 배열) */
export function report(result) {
  const lines = [];
  const list = result.watched.map((w) => `- \`${w.file}\` — ${w.why}`);
  switch (result.state) {
    case "none":
      lines.push("Cubie 큐브 창에 닿는 사이트 코드가 바뀌지 않았다.");
      break;
    case "native":
      lines.push(
        `Cubie 큐브 창에 닿는 사이트 코드와 네이티브(${result.native.length}개 파일)를 함께 고쳤다.`,
        ...list,
      );
      break;
    case "reason":
      lines.push(`네이티브 해당 없음: ${result.reason}`, ...list);
      break;
    case "missing":
      lines.push(
        "Cubie 큐브 창에 닿는 사이트 코드가 바뀌었는데 apps/cubie/·native/ 아래가 하나도 바뀌지 않았다.",
        ...list,
        "",
        "네이티브 큐브 창도 같은 동작으로 고치고 웹·네이티브 비교 그림을 PR에 붙인다(docs/52 5-7).",
        "네이티브와 상관없는 고침이면 PR 본문에 「네이티브 해당 없음: <이유>」 줄을 적는다.",
      );
      break;
  }
  return lines;
}

/** GitHub API로 PR의 지금 본문을 읽는다. 실패하면 null(검사는 이벤트 본문으로만 판정) */
async function fetchBody(url, token, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.body === "string" ? json.body : null;
  } catch {
    return null;
  }
}

/** 이벤트 본문에 이유가 없으면 API로 지금 본문을 한 번 더 본다 */
export async function resolveBody(env, fetchImpl = fetch) {
  const body = env.PR_BODY ?? "";
  if (reasonInBody(body) || !env.PR_API_URL || !env.GITHUB_TOKEN) return body;
  const fresh = await fetchBody(env.PR_API_URL, env.GITHUB_TOKEN, fetchImpl);
  return fresh ?? body;
}

function changedFiles(base) {
  const out = execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", `${base}...HEAD`],
    { encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

async function main(argv) {
  const github = argv.includes("--github");
  let files;
  const bi = argv.indexOf("--base");
  const fi = argv.indexOf("--files");
  if (bi >= 0 && argv[bi + 1]) files = changedFiles(argv[bi + 1]);
  else if (fi >= 0)
    files = argv.slice(fi + 1).filter((a) => !a.startsWith("--"));
  else {
    console.error(
      "쓰는 법: native-parity.mjs (--base <커밋> | --files <경로…>) [--github]",
    );
    process.exit(2);
  }
  const body = await resolveBody(process.env);
  const result = checkParity(files, body);
  const lines = report(result);
  console.log(lines.join("\n"));
  if (github && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### 네이티브 큐브 창 함께 고침\n\n${lines.join("\n")}\n`,
    );
  }
  if (!result.ok) {
    if (github)
      console.log(
        "::error::사이트 미니 큐브 화면 코드만 바뀌었다. 네이티브도 고치거나 PR 본문에 「네이티브 해당 없음: <이유>」를 적는다",
      );
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main(process.argv.slice(2));
}
