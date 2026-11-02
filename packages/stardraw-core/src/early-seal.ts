import { earlySealPath } from "./anchor";
import { drandRoundForClose, drandTime } from "./drand";
import type { CheckItem, CheckStatus, PublicSealFile } from "./public-ledger";
import type { RoundRecord } from "./record";
import { phaseOf, roundTimes, type Schedule } from "./schedule";

/**
 * 정식 회차의 관측 전 사본(docs/36 11-50, 보안 표 O10).
 * 정식 단계 회차는 봉인 파일이 앵커 저장소 main의 `early-seals/`에 「drand 시각 − EARLY_SEAL_MARGIN」까지 올라야 유효다.
 * 서버는 그 사본을 확인한 뒤에야 우리 서버에 봉인 파일을 공개하고, 기한까지 확인하지 못하면 토큰을 버리고 무효로 닫는다.
 * 그래서 「유효인데 사본이 없음」과 「무효인데 제때 올린 사본이 있음」이 모두 검사 실패다.
 * 커밋 시각은 커밋하는 쪽이 정할 수 있어, GitHub가 남기는 활동 기록(서명 없음)과 대조해 늦으면 「주의」로 둔다.
 */

/** 관측 전 사본을 올려야 하는 기한: drand 시각보다 이만큼(초) 앞 */
export const EARLY_SEAL_MARGIN = 60;

/** 사본이 있어야 유효한 회차인지(정식 단계). 시험 단계와 단계가 없는 연습 장부는 아니다 */
export function requiresEarlySeal(schedule: Schedule, round: number): boolean {
  return phaseOf(schedule, round) === "live";
}

/** 그 회차의 관측 전 사본 기한(초): drand 시각 − EARLY_SEAL_MARGIN */
export function earlySealDeadline(schedule: Schedule, round: number): number {
  const { closesAt } = roundTimes(schedule, round);
  return drandTime(drandRoundForClose(closesAt)) - EARLY_SEAL_MARGIN;
}

/** 관측 전 사본을 올린 커밋(그 경로를 마지막으로 바꾼 main 커밋) */
export interface EarlySealCommit {
  sha: string;
  /** 커밋 시각(초). 커밋하는 쪽이 정할 수 있다 */
  date: number;
}

/** 저장소 활동 기록 한 줄(GitHub Activity API) */
export interface RepoActivity {
  ref: string;
  type: string;
  after: string;
  /** GitHub가 남긴 시각(초) */
  at: number;
}

/** 받지 못했거나(네트워크·한도) 요청 수를 아끼느라 보지 않았다 */
export const UNKNOWN = "unknown" as const;
export type Unknown = typeof UNKNOWN;

/**
 * 공개 증인(앵커 저장소 main). 다른 증인(다른 저장소, 기기 사본)을 더할 때도 이 모양을 따른다
 */
export interface GitHubWitness {
  /** main의 관측 전 사본 글. 없으면 null */
  copy(round: number): Promise<string | null | Unknown>;
  /** 그 사본 경로를 마지막으로 바꾼 main 커밋. 없으면 null */
  commit(round: number): Promise<EarlySealCommit | null | Unknown>;
  /** 그 커밋으로 main을 옮긴 push의 시각(활동 기록). 기록에서 찾지 못하면 null */
  pushedAt(commit: EarlySealCommit): Promise<number | null | Unknown>;
  /** main·trial의 강제 push·브랜치 삭제 기록 */
  rewrites(): Promise<RepoActivity[] | Unknown>;
}

export interface GitHubWitnessOptions {
  repo: string;
  ledger: string;
  /** raw.githubusercontent.com 받기(사본 글) */
  rawFetch: typeof fetch;
  /** api.github.com 받기(커밋 시각·활동 기록). 기본은 rawFetch */
  apiFetch?: typeof fetch;
  /** api.github.com 인증 토큰(터미널 검사기의 GITHUB_TOKEN). 어디에도 찍지 않는다 */
  token?: string;
  /** api.github.com에 보낼 요청 수 상한(검증 페이지는 IP당 1시간 60번 한도를 아낀다). 기본 끝없음 */
  maxApiCalls?: number;
}

/** 활동 기록에서 그 커밋을 찾으며 거슬러 볼 범위: 커밋 시각보다 하루 앞까지 */
const ACTIVITY_LOOKBACK = 86400;
const REWRITE_TYPES = ["force_push", "branch_deletion"] as const;
const WATCHED_REFS = ["refs/heads/main", "refs/heads/trial"];

const seconds = (iso: unknown) =>
  typeof iso === "string" && Number.isFinite(Date.parse(iso))
    ? Math.floor(Date.parse(iso) / 1000)
    : null;

/** Link 머리글의 다음 쪽 주소 */
function nextLink(res: Response): string | null {
  const link = res.headers.get("link") ?? "";
  const m = /<([^>]+)>;\s*rel="next"/.exec(link);
  return m ? (m[1] as string) : null;
}

/** GitHub 앵커 저장소를 증인으로 */
export function githubWitness(opts: GitHubWitnessOptions): GitHubWitness {
  const api = `https://api.github.com/repos/${opts.repo}`;
  const apiFetch = opts.apiFetch ?? opts.rawFetch;
  const max = opts.maxApiCalls ?? Number.POSITIVE_INFINITY;
  let calls = 0;
  let limited = false;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
  };
  const call = async (url: string): Promise<Response | Unknown> => {
    if (limited || calls >= max) return UNKNOWN;
    calls++;
    try {
      const res = await apiFetch(url.startsWith("https://") ? url : api + url, {
        headers,
        cache: "no-store",
      });
      // 한도(403·429)에 걸리면 이번 검사에서는 더 묻지 않는다
      if (res.status === 403 || res.status === 429) {
        limited = true;
        return UNKNOWN;
      }
      return res.ok ? res : UNKNOWN;
    } catch {
      return UNKNOWN;
    }
  };

  // main 활동 기록(최근부터 쪽마다 100줄). 여러 회차가 같은 목록을 나눠 쓴다
  const activity: RepoActivity[] = [];
  let nextPage: string | null = "/activity?ref=refs/heads/main&per_page=100";
  const parse = (rows: unknown): RepoActivity[] =>
    Array.isArray(rows)
      ? rows.flatMap((r) => {
          const at = seconds(r?.timestamp);
          return at === null
            ? []
            : [
                {
                  ref: String(r.ref ?? ""),
                  type: String(r.activity_type ?? ""),
                  after: String(r.after ?? ""),
                  at,
                },
              ];
        })
      : [];

  return {
    async copy(round) {
      try {
        const res = await opts.rawFetch(
          `https://raw.githubusercontent.com/${opts.repo}/main/${earlySealPath(opts.ledger, round)}`,
          { cache: "no-store" },
        );
        if (res.status === 404) return null;
        return res.ok ? await res.text() : UNKNOWN;
      } catch {
        return UNKNOWN;
      }
    },
    async commit(round) {
      const path = encodeURIComponent(earlySealPath(opts.ledger, round));
      const res = await call(`/commits?sha=main&path=${path}&per_page=1`);
      if (res === UNKNOWN) return UNKNOWN;
      try {
        const rows = (await res.json()) as {
          sha?: string;
          commit?: { committer?: { date?: string } };
        }[];
        const row = rows[0];
        if (!row) return null;
        const date = seconds(row.commit?.committer?.date);
        return row.sha && date !== null ? { sha: row.sha, date } : UNKNOWN;
      } catch {
        return UNKNOWN;
      }
    },
    async pushedAt(commit) {
      for (;;) {
        const hit = activity.find(
          (a) => a.after === commit.sha && a.type !== "branch_deletion",
        );
        if (hit) return hit.at;
        const oldest = activity.at(-1)?.at;
        if (
          nextPage === null ||
          (oldest !== undefined && oldest < commit.date - ACTIVITY_LOOKBACK)
        )
          return null;
        const res = await call(nextPage);
        if (res === UNKNOWN) return UNKNOWN;
        try {
          activity.push(...parse(await res.json()));
        } catch {
          return UNKNOWN;
        }
        nextPage = nextLink(res);
      }
    },
    async rewrites() {
      const found: RepoActivity[] = [];
      for (const type of REWRITE_TYPES) {
        const res = await call(`/activity?activity_type=${type}&per_page=100`);
        if (res === UNKNOWN) return UNKNOWN;
        try {
          found.push(...parse(await res.json()));
        } catch {
          return UNKNOWN;
        }
      }
      return found.filter(
        (a) =>
          WATCHED_REFS.includes(a.ref) &&
          (REWRITE_TYPES as readonly string[]).includes(a.type),
      );
    },
  };
}

/** 봉인 파일 글이 공개 장부의 봉인 파일과 같은 내용인지(JSON 한 줄을 같은 차례로 다시 쓴 값으로) */
export function sameSealText(text: string, seal: PublicSealFile): boolean {
  try {
    return JSON.stringify(JSON.parse(text)) === JSON.stringify(seal);
  } catch {
    return false;
  }
}

/** 검증 페이지가 사본 글을 보는 최근 정식 회차 수 */
export const FOCUS_RECENT_COPIES = 24;
/** 검증 페이지가 커밋 시각·활동 기록을 보는 회차 수 상한과, 늘 넣는 최근 회차 수 */
export const FOCUS_API_ROUNDS = 12;
export const FOCUS_RECENT_API = 3;
/** 검증 페이지의 api.github.com 요청 상한(회차마다 커밋 1번 + 활동 기록 몇 쪽 + 강제 push·삭제 2번) */
export const FOCUS_API_CALLS = 20;
/** raw 주소 캐시(약 5분) 때문에 drand가 이만큼 안에 지난 회차의 사본이 안 보이면 확인 못 함으로 둔다 */
export const RAW_GRACE = 600;

/** 어디까지 보나: 모든 정식 회차(터미널 검사기) 또는 고른 회차(검증 페이지) */
export type EarlySealScope = "all" | "focus";

/** 검증 페이지가 고르는 회차: 입상(1~3등) 회차·무효 회차·최근 3회 가운데 최근 12회차 */
export function focusRounds(live: readonly RoundRecord[]): Set<number> {
  const picked = live.filter(
    (r) =>
      r.void ||
      r.winners?.[1]?.length ||
      r.winners?.[2]?.length ||
      r.winners?.[3]?.length,
  );
  const recent = live.slice(-FOCUS_RECENT_API);
  return new Set(
    [...new Set([...picked, ...recent].map((r) => r.round))]
      .sort((a, b) => a - b)
      .slice(-FOCUS_API_ROUNDS),
  );
}

export const EARLY_SEAL_LABEL =
  "관측 전 봉인 사본(정식 회차는 drand 1분 전까지 공개 저장소에 올라야 유효)";
export const ACTIVITY_LABEL =
  "GitHub 활동 기록(관측 전 사본을 올린 시각, 강제 push·브랜치 삭제)";

const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 19);

export interface EarlySealCheckOptions {
  witness: GitHubWitness;
  scope?: EarlySealScope;
  /** 지금(초). raw 캐시 여유 판단에만 쓴다 */
  now?: number;
}

/**
 * 정식 유효 회차의 관측 전 사본(docs/36 11-50): 사본이 없거나·봉인 파일과 다르거나·커밋 시각이 기한보다 늦으면 실패.
 * 그 커밋의 활동 기록 push 시각이 늦거나 기록에 없으면 주의, main·trial의 강제 push·브랜치 삭제는 실패.
 * 무효 회차는 「무효 회차」 항목(voidRoundsItem)이 본다. 받지 못한 회차는 「확인 못 함」으로 적고 실패로 보지 않는다
 */
export async function earlySealItems(
  records: readonly RoundRecord[],
  seals: readonly PublicSealFile[],
  schedule: Schedule,
  options: EarlySealCheckOptions,
): Promise<[CheckItem, CheckItem]> {
  const { witness } = options;
  const scope = options.scope ?? "focus";
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const live = records.filter((r) => requiresEarlySeal(schedule, r.round));
  const sealOf = new Map(records.map((r, i) => [r.round, seals[i]]));
  const focus = focusRounds(live);
  const recentCopies = new Set(
    live.slice(-FOCUS_RECENT_COPIES).map((r) => r.round),
  );
  const fails: string[] = [];
  const warns: string[] = [];
  const copyUnknown: number[] = [];
  const timeUnknown: number[] = [];
  const pushUnknown: number[] = [];
  let copies = 0;
  let timed = 0;
  let pushed = 0;
  for (const record of live) {
    if (record.void) continue;
    const round = record.round;
    if (scope === "focus" && !focus.has(round) && !recentCopies.has(round))
      continue;
    const deadline = earlySealDeadline(schedule, round);
    const seal = sealOf.get(round);
    const copy = await witness.copy(round);
    if (copy === UNKNOWN) copyUnknown.push(round);
    else if (copy === null) {
      if (now < deadline + EARLY_SEAL_MARGIN + RAW_GRACE)
        copyUnknown.push(round);
      else fails.push(`${round}회: 관측 전 사본이 없다`);
    } else if (!seal || !sameSealText(copy, seal))
      fails.push(`${round}회: 관측 전 사본이 봉인 파일과 다르다`);
    else copies++;
    if (scope === "focus" && !focus.has(round)) continue;
    const commit = await witness.commit(round);
    if (commit === UNKNOWN || commit === null) {
      timeUnknown.push(round);
      continue;
    }
    if (commit.date > deadline) {
      fails.push(
        `${round}회: 관측 전 사본 커밋 시각(${iso(commit.date)}Z)이 기한(${iso(deadline)}Z)보다 늦다`,
      );
      continue;
    }
    timed++;
    const at = await witness.pushedAt(commit);
    if (at === UNKNOWN) pushUnknown.push(round);
    else if (at === null)
      warns.push(`${round}회: 활동 기록에서 사본 커밋을 찾지 못했다`);
    else if (at > deadline)
      warns.push(
        `${round}회: 활동 기록의 push 시각(${iso(at)}Z)이 기한(${iso(deadline)}Z)보다 늦다`,
      );
    else pushed++;
  }
  const rewrites = await witness.rewrites();

  const unknownText = (label: string, rounds: number[]) =>
    rounds.length > 0 ? [`${label} 확인 못 함: ${rounds.join(", ")}`] : [];
  const item = (
    id: string,
    label: string,
    status: CheckStatus,
    detail: string,
  ): CheckItem => ({ id, label, status, detail });

  let copyItem: CheckItem;
  if (live.length === 0)
    copyItem = item(
      "early-seal",
      EARLY_SEAL_LABEL,
      "skip",
      "정식 회차가 아직 없습니다",
    );
  else if (fails.length > 0)
    copyItem = item("early-seal", EARLY_SEAL_LABEL, "fail", fails.join(" / "));
  else
    copyItem = item(
      "early-seal",
      EARLY_SEAL_LABEL,
      "pass",
      [
        `사본 ${copies}회차 · 커밋 시각 ${timed}회차 확인${scope === "focus" ? "(검증 페이지는 고른 회차만, 전체는 터미널 검사기)" : ""}`,
        ...unknownText("사본", copyUnknown),
        ...unknownText("커밋 시각", timeUnknown),
      ].join(" / "),
    );

  let activityItem: CheckItem;
  if (rewrites !== UNKNOWN && rewrites.length > 0)
    activityItem = item(
      "github-activity",
      ACTIVITY_LABEL,
      "fail",
      rewrites
        .map(
          (r) =>
            `${r.ref.replace("refs/heads/", "")}: ${r.type === "force_push" ? "강제 push" : "브랜치 삭제"} ${iso(r.at)}Z`,
        )
        .join(" / "),
    );
  else if (warns.length > 0)
    activityItem = item(
      "github-activity",
      ACTIVITY_LABEL,
      "warn",
      [
        ...warns,
        "활동 기록에는 서명이 없고 늦게 기록된 사례가 있어 실패로 보지 않습니다",
      ].join(" / "),
    );
  else if (rewrites === UNKNOWN && pushed === 0)
    activityItem = item(
      "github-activity",
      ACTIVITY_LABEL,
      "skip",
      "활동 기록을 받지 못했습니다(확인 못 함)",
    );
  else
    activityItem = item(
      "github-activity",
      ACTIVITY_LABEL,
      "pass",
      [
        live.length === 0
          ? "정식 회차가 아직 없습니다"
          : `push 시각 ${pushed}회차 확인`,
        rewrites === UNKNOWN
          ? "강제 push·브랜치 삭제 확인 못 함"
          : "강제 push·브랜치 삭제 없음",
        ...unknownText("push 시각", pushUnknown),
      ].join(" / "),
    );
  return [copyItem, activityItem];
}
