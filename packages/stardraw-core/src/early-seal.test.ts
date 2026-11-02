import { describe, expect, it } from "vitest";

import { earlySealPath } from "./anchor";
import { toHex } from "./bytes";
import { drandRoundForClose, drandTime } from "./drand";
import {
  type EarlySealCommit,
  earlySealDeadline,
  earlySealItems,
  focusRounds,
  type GitHubWitness,
  githubWitness,
  type RepoActivity,
  requiresEarlySeal,
  UNKNOWN,
  type Unknown,
} from "./early-seal";
import { type PublicSealFile, voidRoundsItem } from "./public-ledger";
import type { RoundRecord } from "./record";
import { sealDigest } from "./round";
import { roundTimes, type Schedule } from "./schedule";
import { FakeTsa } from "./testing";
import { sealImprint, type TsaProof } from "./tsa";

/**
 * 정식 회차의 관측 전 사본(docs/36 11-50). 1~2회차는 시험, 3회차부터 정식인 장부
 */

const ENTRY = {
  length: 3600,
  closeMargin: 5,
  powTarget: 2 ** 31,
  registerPowTarget: 2 ** 31,
};
const SCHEDULE: Schedule = {
  epoch: 1793321700,
  entries: [
    { ...ENTRY, fromRound: 1, phase: "trial" },
    { ...ENTRY, fromRound: 3, phase: "live" },
  ],
};
const deadlineOf = (round: number) => earlySealDeadline(SCHEDULE, round);
const closesOf = (round: number) => roundTimes(SCHEDULE, round).closesAt;

/** 기록은 검사에 쓰는 칸만(회차·무효·입상자·봉인 값 칸) */
const record = (round: number, isVoid = false, winner = false): RoundRecord =>
  ({
    v: 1,
    round,
    prev: new Uint8Array(32),
    count: 0,
    merkleRoot: new Uint8Array(32).fill(round),
    registrationCount: 0,
    registrationRoot: new Uint8Array(32),
    rootLoggedAt: isVoid ? 0 : closesOf(round) + 10,
    void: isVoid,
    winners: {
      1: winner ? [new Uint8Array(32)] : [],
      2: [],
      3: [],
      4: [],
      5: [],
    },
  }) as unknown as RoundRecord;

const sealOf = (r: RoundRecord, log: unknown = { kind: "tsa", tokens: [] }) =>
  ({
    v: 1,
    round: r.round,
    digest: toHex(sealDigest(r)),
    loggedAt: r.rootLoggedAt,
    log,
  }) as PublicSealFile;
const text = (seal: PublicSealFile) => `${JSON.stringify(seal)}\n`;

/** 회차마다 사본·커밋·push 시각을 정해 두는 가짜 증인 */
class FakeWitness implements GitHubWitness {
  copies = new Map<number, string | null | Unknown>();
  commits = new Map<number, EarlySealCommit | null | Unknown>();
  pushes = new Map<string, number | null | Unknown>();
  rewritten: RepoActivity[] | Unknown = [];
  async copy(round: number) {
    return this.copies.get(round) ?? null;
  }
  async commit(round: number) {
    return this.commits.get(round) ?? null;
  }
  async pushedAt(c: EarlySealCommit) {
    return this.pushes.get(c.sha) ?? null;
  }
  async rewrites() {
    return this.rewritten;
  }
  /** 회차를 제때 올린 것으로 */
  timely(r: RoundRecord, seal = sealOf(r), late = 0) {
    this.copies.set(r.round, text(seal));
    const sha = `c${r.round}`;
    this.commits.set(r.round, { sha, date: closesOf(r.round) + 3 + late });
    this.pushes.set(sha, closesOf(r.round) + 4 + late);
  }
}

const NOW = closesOf(10) + 7200;
const check = (
  records: RoundRecord[],
  witness: GitHubWitness,
  scope: "all" | "focus" = "all",
) =>
  earlySealItems(
    records,
    records.map((r) => sealOf(r)),
    SCHEDULE,
    { witness, scope, now: NOW },
  );

describe("기한과 대상", () => {
  it("정식 단계 회차만 사본이 있어야 하고, 기한은 drand 시각 60초 앞이다", () => {
    expect(requiresEarlySeal(SCHEDULE, 2)).toBe(false);
    expect(requiresEarlySeal(SCHEDULE, 3)).toBe(true);
    expect(deadlineOf(3)).toBe(drandTime(drandRoundForClose(closesOf(3))) - 60);
    // 단계가 없는 연습 장부는 대상이 아니다
    const practice: Schedule = {
      epoch: SCHEDULE.epoch,
      entries: [{ ...ENTRY, fromRound: 1 }],
    };
    expect(requiresEarlySeal(practice, 1)).toBe(false);
  });

  it("검증 페이지는 입상·무효·최근 3회 가운데 최근 12회차만 시각을 본다", () => {
    const live = Array.from({ length: 30 }, (_, i) =>
      record(i + 3, i === 2, i === 5),
    );
    expect([...focusRounds(live)]).toEqual([5, 8, 30, 31, 32]);
  });
});

describe("정식 유효 회차", () => {
  const rounds = [record(1), record(2), record(3), record(4)];

  it("사본이 제때 같은 내용으로 오르고 push 기록도 제때면 통과, 시험 회차는 보지 않는다", async () => {
    const w = new FakeWitness();
    w.timely(rounds[2] as RoundRecord);
    w.timely(rounds[3] as RoundRecord);
    const [copy, activity] = await check(rounds, w);
    expect(copy).toMatchObject({ status: "pass" });
    expect(copy.detail).toContain("사본 2회차 · 커밋 시각 2회차 확인");
    expect(activity).toMatchObject({ status: "pass" });
    expect(activity.detail).toContain("push 시각 2회차 확인");
  });

  it("사본이 없거나 봉인 파일과 다르거나 커밋 시각이 늦으면 실패", async () => {
    const w = new FakeWitness();
    w.timely(rounds[2] as RoundRecord, {
      ...sealOf(rounds[2] as RoundRecord),
      loggedAt: 1,
    });
    // 4회차: 사본 없음
    let [copy] = await check(rounds, w);
    expect(copy.status).toBe("fail");
    expect(copy.detail).toContain("3회: 관측 전 사본이 봉인 파일과 다르다");
    expect(copy.detail).toContain("4회: 관측 전 사본이 없다");

    const late = new FakeWitness();
    late.timely(rounds[2] as RoundRecord);
    late.timely(rounds[3] as RoundRecord, undefined, 600);
    [copy] = await check(rounds, late);
    expect(copy.status).toBe("fail");
    expect(copy.detail).toMatch(/^4회: 관측 전 사본 커밋 시각\(.+\)이 기한/);
  });

  it("활동 기록이 늦거나 그 커밋을 찾지 못하면 주의(서명이 없어 실패로 보지 않는다)", async () => {
    const w = new FakeWitness();
    w.timely(rounds[2] as RoundRecord);
    w.timely(rounds[3] as RoundRecord);
    w.pushes.set("c3", deadlineOf(3) + 3600);
    w.pushes.set("c4", null);
    const [copy, activity] = await check(rounds, w);
    expect(copy.status).toBe("pass");
    expect(activity.status).toBe("warn");
    expect(activity.detail).toContain("3회: 활동 기록의 push 시각");
    expect(activity.detail).toContain(
      "4회: 활동 기록에서 사본 커밋을 찾지 못했다",
    );
  });

  it("main·trial의 강제 push·브랜치 삭제 기록이 있으면 실패", async () => {
    const w = new FakeWitness();
    w.timely(rounds[2] as RoundRecord);
    w.timely(rounds[3] as RoundRecord);
    w.rewritten = [
      { ref: "refs/heads/trial", type: "force_push", after: "x", at: NOW },
    ];
    const [, activity] = await check(rounds, w);
    expect(activity.status).toBe("fail");
    expect(activity.detail).toMatch(/^trial: 강제 push /);
  });

  it("받지 못한 것은 확인 못 함으로 적고 실패로 보지 않는다(방금 닫힌 회차의 사본도)", async () => {
    const w = new FakeWitness();
    w.copies.set(3, UNKNOWN);
    w.commits.set(3, UNKNOWN);
    w.rewritten = UNKNOWN;
    const fresh = [...rounds];
    const [copy, activity] = await earlySealItems(
      fresh,
      fresh.map((r) => sealOf(r)),
      SCHEDULE,
      // 4회차 drand 직후: raw 캐시 때문에 사본이 아직 안 보일 수 있다
      { witness: w, scope: "all", now: deadlineOf(4) + 120 },
    );
    expect(copy.status).toBe("pass");
    expect(copy.detail).toContain("사본 확인 못 함: 3, 4");
    expect(copy.detail).toContain("커밋 시각 확인 못 함: 3, 4");
    expect(activity.status).toBe("skip");
  });

  it("정식 회차가 없으면 건너뛴다", async () => {
    const [copy] = await check([record(1), record(2)], new FakeWitness());
    expect(copy.status).toBe("skip");
  });
});

describe("정식 무효 회차(무효 회차 항목)", () => {
  const voided = record(3, true);
  const tsa = new FakeTsa("tsa-a", () => closesOf(3) + 10);
  /** 3회차 봉인 값에 drand 전 토큰이 든 봉인 파일(서버가 받아 두었던 것) */
  const tokenSeal = (): PublicSealFile => {
    const genTime = closesOf(3) + 10;
    const digest = sealDigest(voided);
    return {
      round: 3,
      digest: toHex(digest),
      loggedAt: genTime,
      log: {
        kind: "tsa",
        tokens: [
          {
            tsa: "tsa-a",
            genTime,
            token: btoa(
              String.fromCharCode(...tsa.stamp(sealImprint(digest), genTime)),
            ),
          },
        ],
      } satisfies TsaProof,
    };
  };
  const run = (w: GitHubWitness, earlySeals?: PublicSealFile[]) =>
    voidRoundsItem([record(1), record(2), voided], [[], [], []], SCHEDULE, {
      witness: w,
      tsaAuthorities: [tsa.authority],
      ...(earlySeals ? { earlySeals: async () => earlySeals } : {}),
    });

  it("제때 올린 사본에 drand 전 토큰이 있는데 무효로 닫았으면 실패", async () => {
    const w = new FakeWitness();
    w.copies.set(3, text(tokenSeal()));
    w.commits.set(3, { sha: "c3", date: closesOf(3) + 20 });
    expect((await run(w)).status).toBe("fail");
  });

  it("사본이 기한보다 늦게 올랐으면 규칙대로 무효(실패 아님), 시각을 모르면 그렇게 적는다", async () => {
    const w = new FakeWitness();
    w.copies.set(3, text(tokenSeal()));
    w.commits.set(3, { sha: "c3", date: deadlineOf(3) + 1 });
    let item = await run(w);
    expect(item.status).toBe("warn");
    expect(item.detail).toContain(
      "관측 전 사본이 기한보다 늦게 올라 규칙대로 무효: 3",
    );
    w.commits.set(3, UNKNOWN);
    item = await run(w);
    expect(item.status).toBe("warn");
    expect(item.detail).toContain(
      "관측 전 사본이 있으나 올린 시각을 확인하지 못한 무효 회차: 3",
    );
  });

  it("지켜본 사람이 받아 둔 서버 봉인 파일에 토큰이 있으면 실패(정식 회차는 사본 확인 뒤에만 토큰을 공개한다)", async () => {
    expect((await run(new FakeWitness(), [tokenSeal()])).status).toBe("fail");
  });
});

describe("GitHub 증인(githubWitness)", () => {
  const LEDGER = "0123456789abcdef";
  const REPO = "ybbarng/stardraw-ledger";
  const calls: string[] = [];
  const auth: (string | null)[] = [];
  const pages: Record<string, { body: unknown; link?: string }> = {
    "/activity?ref=refs/heads/main&per_page=100": {
      body: [
        {
          ref: "refs/heads/main",
          activity_type: "push",
          after: "a2",
          timestamp: "2026-11-03T10:00:00Z",
        },
      ],
      link: `<https://api.github.com/repositories/1/activity?after=CUR>; rel="next"`,
    },
    "https://api.github.com/repositories/1/activity?after=CUR": {
      body: [
        {
          ref: "refs/heads/main",
          activity_type: "push",
          after: "a1",
          timestamp: "2026-11-03T09:00:05Z",
        },
      ],
    },
    "/activity?activity_type=force_push&per_page=100": {
      body: [
        {
          ref: "refs/heads/other",
          activity_type: "force_push",
          after: "z",
          timestamp: "2026-11-01T00:00:00Z",
        },
        {
          ref: "refs/heads/main",
          activity_type: "force_push",
          after: "y",
          timestamp: "2026-11-02T00:00:00Z",
        },
      ],
    },
    "/activity?activity_type=branch_deletion&per_page=100": { body: [] },
  };
  const commitPath = `/commits?sha=main&path=${encodeURIComponent(earlySealPath(LEDGER, 7))}&per_page=1`;
  pages[commitPath] = {
    body: [
      { sha: "a1", commit: { committer: { date: "2026-11-03T09:00:03Z" } } },
    ],
  };
  const fetchFn = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push(url);
    auth.push(new Headers(init?.headers).get("authorization"));
    if (url.startsWith("https://raw.githubusercontent.com/"))
      return url.endsWith(earlySealPath(LEDGER, 7))
        ? new Response("사본")
        : new Response("404", { status: 404 });
    const key = url.replace(`https://api.github.com/repos/${REPO}`, "");
    const page = pages[key];
    if (!page) return new Response("[]");
    return new Response(JSON.stringify(page.body), {
      headers: page.link ? { link: page.link } : {},
    });
  }) as typeof fetch;

  it("사본 글·그 경로의 커밋·활동 기록의 push 시각(다음 쪽까지)·강제 push를 읽는다", async () => {
    const w = githubWitness({
      repo: REPO,
      ledger: LEDGER,
      rawFetch: fetchFn,
      token: "t",
    });
    expect(await w.copy(7)).toBe("사본");
    expect(await w.copy(8)).toBeNull();
    const commit = await w.commit(7);
    expect(commit).toEqual({
      sha: "a1",
      date: Date.parse("2026-11-03T09:00:03Z") / 1000,
    });
    expect(await w.pushedAt(commit as EarlySealCommit)).toBe(
      Date.parse("2026-11-03T09:00:05Z") / 1000,
    );
    // 이미 받은 쪽에 없고 다음 쪽도 없으면 찾지 못함
    expect(await w.pushedAt({ sha: "none", date: 0 })).toBeNull();
    const rewrites = await w.rewrites();
    expect(rewrites).toEqual([
      {
        ref: "refs/heads/main",
        type: "force_push",
        after: "y",
        at: Date.parse("2026-11-02T00:00:00Z") / 1000,
      },
    ]);
    // 토큰은 api.github.com에만, raw에는 보내지 않는다
    const apiAuth = calls.flatMap((u, i) =>
      u.startsWith("https://api.github.com") ? [auth[i]] : [],
    );
    expect(apiAuth.every((a) => a === "Bearer t")).toBe(true);
    const rawAuth = calls.flatMap((u, i) =>
      u.startsWith("https://raw.") ? [auth[i]] : [],
    );
    expect(rawAuth.every((a) => a === null)).toBe(true);
  });

  it("요청 상한이나 한도(403)에 걸리면 확인 못 함", async () => {
    const capped = githubWitness({
      repo: REPO,
      ledger: LEDGER,
      rawFetch: fetchFn,
      maxApiCalls: 0,
    });
    expect(await capped.commit(7)).toBe(UNKNOWN);
    expect(await capped.rewrites()).toBe(UNKNOWN);
    let asked = 0;
    const limited = githubWitness({
      repo: REPO,
      ledger: LEDGER,
      rawFetch: (async () => {
        asked++;
        return new Response("rate limit", { status: 403 });
      }) as unknown as typeof fetch,
    });
    expect(await limited.commit(7)).toBe(UNKNOWN);
    expect(await limited.commit(8)).toBe(UNKNOWN);
    expect(asked).toBe(1); // 한도에 걸린 뒤로는 묻지 않는다
  });
});
