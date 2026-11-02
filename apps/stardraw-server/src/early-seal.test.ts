import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkPublicLedger,
  earlySealDeadline,
  earlySealPath,
  ledgerId,
  roundTimes,
  type Schedule,
} from "@game/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { GitHubAnchor } from "./outside";
import {
  drawTimeOf,
  EPOCH,
  FakeGitHub,
  fakeBeacon,
  makeRig,
  type Rig,
  SCHEDULE,
} from "./testing";

/**
 * 정식 회차의 관측 전 사본(docs/36 11-51): 토큰을 받으면 먼저 앵커 저장소 main에 사본을 올리고 다시 읽어 확인한 뒤에
 * 우리 서버에 봉인 파일을 공개한다. 기한(drand − 60초)까지 확인하지 못하면 토큰을 버리고 무효로 봉인한다
 */

const REPO = "ybbarng/stardraw-ledger";
const withPhase = (phase: "trial" | "live"): Schedule => ({
  ...SCHEDULE,
  entries: SCHEDULE.entries.map((e) => ({ ...e, phase })),
});
const LIVE = withPhase("live");
const CLOSES = roundTimes(LIVE, 1).closesAt;
const DEADLINE = earlySealDeadline(LIVE, 1);

let rigs: Rig[] = [];
afterEach(() => {
  const open = rigs;
  rigs = [];
  for (const r of open) r.close();
});

/** 가짜 GitHub(시계는 회차 서버와 같은 것)와 정식 단계 서버. 처음 일정표 앵커까지 남긴다 */
async function liveRig(
  options: {
    gh?: FakeGitHub;
    dir?: string;
    at?: number;
    phase?: "trial" | "live";
  } = {},
) {
  const box = { now: () => 0 };
  const gh = options.gh ?? new FakeGitHub(() => box.now());
  const rig = await makeRig({
    schedule: withPhase(options.phase ?? "live"),
    anchor: new GitHubAnchor(REPO, "test-token", gh.fetch),
    ...(options.dir ? { dir: options.dir } : {}),
    ...(options.at ? { at: options.at } : {}),
  });
  rigs.push(rig);
  box.now = () => Math.floor(rig.clock.now() / 1000);
  if (!options.dir) {
    await rig.at(EPOCH + 10);
    await rig.engine.anchorIdle();
  }
  return { rig, gh, id: ledgerId(rig.engine.genesis) };
}

/** 서버가 공개한 봉인 파일(없으면 null) */
const servedSeal = (rig: Rig, round = 1) => {
  const path = join(
    rig.dir,
    "ledger",
    "seals",
    `${String(round).padStart(6, "0")}.json`,
  );
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

/** 시계를 옮기고 사본 올리기가 끝날 때까지 */
const step = async (rig: Rig, t: number) => {
  await rig.at(t);
  await rig.engine.earlySealIdle();
};

/** 다른 서버로 옮기려 데이터 폴더만 남기고 닫는다 */
const detach = (rig: Rig) => {
  rig.store.close();
  rigs = rigs.filter((r) => r !== rig);
};

describe("정식 회차: 사본을 확인한 뒤에 공개", () => {
  it("토큰을 받아도 사본을 확인하기 전에는 공개하지 않고, 확인하면 같은 바이트로 공개한다", async () => {
    const { rig, gh, id } = await liveRig();
    await rig.at(CLOSES);
    expect(rig.store.lastSealed()).toBe(0);
    await rig.engine.earlySealIdle();
    const copy = gh.text("main", earlySealPath(id, 1));
    expect(copy).toBeDefined();
    expect(servedSeal(rig)).toBeNull();
    await rig.at(CLOSES + 1);
    expect(servedSeal(rig)).toBe(copy);
    expect(rig.store.seal(1)?.loggedAt).toBe(CLOSES);
    expect(rig.store.pendingSeal()).toBeNull();
    await rig.at(drawTimeOf(1));
    expect(rig.store.record(1)?.void).toBe(false);
  });

  it("올리기가 실패하면 기한 안에서 다시 시도하고, 처음 받은 토큰 그대로 공개한다", async () => {
    const { rig, gh } = await liveRig();
    gh.failures = 2; // 트리 만들기 두 번이 실패한다
    await step(rig, CLOSES);
    await step(rig, CLOSES + 3); // 5초 간격 전이라 다시 보내지 않는다
    expect(gh.failures).toBe(1);
    await step(rig, CLOSES + 5);
    await step(rig, CLOSES + 10);
    await rig.at(CLOSES + 11);
    expect(rig.store.seal(1)?.loggedAt).toBe(CLOSES);
    expect(rig.logs.filter((l) => l.includes("5초 뒤 다시 시도"))).toHaveLength(
      2,
    );
  });

  it("기한까지 확인하지 못하면 토큰을 버리고 무효로 봉인한다(GitHub가 돌아와도 늦은 토큰은 어디에도 싣지 않는다)", async () => {
    const { rig, gh, id } = await liveRig();
    gh.failures = Number.POSITIVE_INFINITY;
    for (let t = CLOSES; t < DEADLINE; t += 5) await step(rig, t);
    expect(rig.store.lastSealed()).toBe(0);
    gh.failures = 0;
    await step(rig, DEADLINE);
    expect(rig.store.seal(1)).toMatchObject({ loggedAt: 0, log: null });
    expect(JSON.parse(servedSeal(rig) ?? "")).toMatchObject({
      loggedAt: 0,
      log: null,
    });
    expect(gh.text("main", earlySealPath(id, 1))).toBeUndefined();
    await step(rig, drawTimeOf(1));
    await rig.engine.anchorIdle();
    expect(rig.store.record(1)?.void).toBe(true);
    expect(gh.text("main", earlySealPath(id, 1))).toBeUndefined();
    expect(rig.logs.some((l) => l.includes("1회차를 무효로 닫는다"))).toBe(
      true,
    );
  });

  it("사본 커밋 시각이 기한보다 늦게 적히면 유효로 싣지 않는다", async () => {
    const { rig, gh, id } = await liveRig();
    gh.commitDateShift = 600;
    await step(rig, CLOSES);
    expect(gh.text("main", earlySealPath(id, 1))).toBeDefined();
    expect(rig.store.pendingSeal()?.confirmed).toBe(false);
    await step(rig, DEADLINE);
    expect(rig.store.seal(1)).toMatchObject({ loggedAt: 0, log: null });
  });
});

describe("정식 회차: 다시 띄우면", () => {
  it("DB에 남긴 공개 전 봉인으로 이어 간다(마감 뒤 다시 띄워도 처음 받은 토큰)", async () => {
    const { rig: first, gh, id } = await liveRig();
    gh.failures = Number.POSITIVE_INFINITY;
    await step(first, CLOSES);
    expect(first.store.pendingSeal()).toMatchObject({ round: 1, pushed: true });
    detach(first);
    gh.failures = 0;
    const { rig } = await liveRig({ gh, dir: first.dir, at: CLOSES + 30 });
    await step(rig, CLOSES + 30);
    await rig.at(CLOSES + 31);
    expect(rig.store.seal(1)?.loggedAt).toBe(CLOSES);
    expect(servedSeal(rig)).toBe(gh.text("main", earlySealPath(id, 1)));
  });

  it("남긴 글이 없어도(되살린 DB) 토큰 기한 뒤에 GitHub의 제때 사본을 읽어 그대로 쓴다", async () => {
    const { rig, gh, id } = await liveRig();
    await step(rig, CLOSES);
    rig.store.setPendingSeal(null);
    await step(rig, CLOSES + 200);
    expect(servedSeal(rig)).toBe(gh.text("main", earlySealPath(id, 1)));
    expect(rig.store.seal(1)?.loggedAt).toBe(CLOSES);
  });

  it("올리기를 시작한 회차는 기한 뒤 GitHub를 읽지 못하면 무효로 닫지 않고 다시 읽는다", async () => {
    const { rig, gh } = await liveRig();
    gh.failures = Number.POSITIVE_INFINITY;
    await step(rig, CLOSES);
    gh.readFailures = Number.POSITIVE_INFINITY;
    await step(rig, DEADLINE);
    expect(rig.store.lastSealed()).toBe(0);
    expect(rig.logs.some((l) => l.includes("관측 전 사본을 읽지 못해"))).toBe(
      true,
    );
    gh.readFailures = 0;
    await step(rig, DEADLINE + 1);
    expect(rig.store.seal(1)).toMatchObject({ loggedAt: 0, log: null });
  });
});

describe("시험 회차는 예전 순서", () => {
  it("봉인 파일을 먼저 공개하고 사본은 뒤에 올린다(무효가 늘지 않는다)", async () => {
    const { rig, gh, id } = await liveRig({ phase: "trial" });
    gh.failures = Number.POSITIVE_INFINITY;
    await rig.at(CLOSES);
    expect(rig.store.seal(1)?.loggedAt).toBe(CLOSES);
    expect(servedSeal(rig)).not.toBeNull();
    gh.failures = 0;
    await step(rig, CLOSES + 15);
    expect(gh.text("trial", earlySealPath(id, 1))).toBe(servedSeal(rig));
    await rig.finish(1);
    expect(rig.store.record(1)?.void).toBe(false);
  });

  it("drand가 지나 사본을 올리지 못한 회차는 올린 것으로 세지 않고 놓침으로 남긴다", async () => {
    const { rig, gh } = await liveRig({ phase: "trial" });
    gh.failures = Number.POSITIVE_INFINITY;
    await step(rig, CLOSES);
    gh.failures = 0;
    await step(rig, drawTimeOf(1) + 30);
    expect(rig.store.earlySealed()).toBe(1);
    expect(rig.engine.state().earlySealMissed).toEqual([1]);
  });
});

describe("검사기로 정식 장부 검사(서버 → 앵커 저장소 → checkPublicLedger)", () => {
  it("제때 올린 회차는 통과, 사본을 못 올려 무효로 닫은 회차는 실패가 아니다", async () => {
    const { rig, gh, id } = await liveRig();
    await rig.finish(1);
    // 2회차: GitHub 쓰기가 기한까지 막혀 무효
    gh.failures = Number.POSITIVE_INFINITY;
    const closes2 = roundTimes(rig.engine.schedule(), 2).closesAt;
    const deadline2 = earlySealDeadline(rig.engine.schedule(), 2);
    for (let t = closes2; t <= deadline2; t += 5) await step(rig, t);
    gh.failures = 0;
    await rig.finish(2);
    await rig.finish(3);
    await rig.engine.anchorIdle();
    expect(rig.store.record(2)?.void).toBe(true);

    const served = (path: string) => {
      const full = join(rig.dir, "ledger", path);
      return existsSync(full) ? readFileSync(full, "utf8") : null;
    };
    const fetchFn = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      const raw =
        /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([^/]+)\/(.+)$/.exec(
          url,
        );
      if (raw) {
        const text = gh.text(raw[1] as string, raw[2] as string);
        return text === undefined
          ? new Response("404", { status: 404 })
          : new Response(text);
      }
      if (url.startsWith("https://api.github.com/"))
        return gh.fetch(input, init);
      const text = url.startsWith("/ledger/")
        ? served(url.slice("/ledger/".length))
        : null;
      return text === null
        ? new Response("404", { status: 404 })
        : new Response(text);
    }) as typeof fetch;
    const result = await checkPublicLedger({
      base: "",
      fetch: fetchFn,
      voidBeacon: async (r) => fakeBeacon(r),
      github: { scope: "all", now: Math.floor(rig.clock.now() / 1000) + 3600 },
    });
    const byId = Object.fromEntries(result.items.map((i) => [i.id, i]));
    expect(byId["early-seal"]).toMatchObject({ status: "pass" });
    expect(byId["early-seal"]?.detail).toContain(
      "사본 2회차 · 커밋 시각 2회차 확인",
    );
    expect(byId["github-activity"]).toMatchObject({ status: "pass" });
    expect(byId["void-rounds"]?.status).toBe("warn");
    expect(id).toHaveLength(16);
  });
});
