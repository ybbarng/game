import { ManualClock } from "@game/fair-play";
import { DEFAULT_GATE_TRIES, powTargetForTries } from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import { DEFAULT_PREFIX_LIMITS, frontGateConfig } from "./config";
import { BusyError, Counters, Gate, ipPrefix, PowFailures } from "./limits";
import { DEFAULT_RELAY_LIMITS } from "./relay";

describe("IP 앞부분", () => {
  it("IPv4는 /24, IPv6는 /48, IPv4가 섞인 IPv6는 IPv4로 본다", () => {
    expect(ipPrefix("203.0.113.7")).toBe("203.0.113");
    expect(ipPrefix("::ffff:203.0.113.7")).toBe("203.0.113");
    expect(ipPrefix("2001:db8:abcd:12::1")).toBe("2001:db8:abcd");
    expect(ipPrefix("2001:0db8:0abc::")).toBe("2001:db8:abc");
    expect(ipPrefix("2001:db8::1")).toBe("2001:db8:0");
  });
});

describe("계수기", () => {
  it("구간이 바뀌면 지난 구간을 지운다", () => {
    const c = new Counters();
    c.add("entry", "1", "a");
    c.add("entry", "1", "a");
    expect(c.count("entry", "1", "a")).toBe(2);
    expect(c.count("entry", "2", "a")).toBe(0);
    expect(c.count("entry", "1", "a")).toBe(0);
  });
});

describe("동시 실행 제한", () => {
  it("한도만큼만 동시에 돌리고, 줄이 꽉 차면 곧바로 거절한다", async () => {
    const gate = new Gate(1, 1);
    let running = 0;
    let most = 0;
    const releases: (() => void)[] = [];
    const job = () =>
      gate.run(async () => {
        running++;
        most = Math.max(most, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running--;
      });
    expect(gate.full()).toBe(false);
    const first = job();
    expect(gate.full()).toBe(false);
    const second = job();
    // 실행 칸과 줄이 다 차면 들어오기 전에 알 수 있다(서명 확인 전에 503, docs/36 11-30)
    expect(gate.full()).toBe(true);
    expect(gate.full({ priority: true })).toBe(false);
    await expect(job()).rejects.toBeInstanceOf(BusyError);
    // 조건이 맞을 때까지(첫 일이 돌기 시작) 기다린다
    while (releases.length === 0) await Promise.resolve();
    releases.shift()?.();
    while (releases.length === 0) await Promise.resolve();
    releases.shift()?.();
    await Promise.all([first, second]);
    expect(most).toBe(1);
  });
});

describe("Argon2 줄: 기다림 기한과 앞줄(D2)", () => {
  /** 첫 일을 붙잡아 두고 나머지를 줄에 세운다 */
  function held(gate: Gate) {
    let release = () => {};
    const first = gate.run(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    return { first, release: () => release() };
  }

  it("줄에서 기한을 넘게 기다리면 Busy로 돌려보낸다(시계를 옮길 때만)", async () => {
    const clock = new ManualClock();
    const gate = new Gate(1, 5, {
      after: (ms, fn) => clock.after(ms, fn),
      maxWaitMs: 5000,
    });
    const h = held(gate);
    let settled = false;
    const waiting = gate
      .run(async () => "늦게")
      .finally(() => {
        settled = true;
      });
    clock.advance(4999);
    await Promise.resolve();
    expect(settled).toBe(false);
    clock.advance(1);
    await expect(waiting).rejects.toBeInstanceOf(BusyError);
    h.release();
    await h.first;
  });

  it("앞줄(소속 응모)을 먼저 꺼내고, 줄마다 상한을 따로 둔다", async () => {
    const gate = new Gate(1, 1);
    const h = held(gate);
    const order: string[] = [];
    const normal = gate.run(async () => order.push("보통"));
    await expect(gate.run(async () => 0)).rejects.toBeInstanceOf(BusyError);
    const high = gate.run(async () => order.push("앞줄"), { priority: true });
    h.release();
    await Promise.all([h.first, normal, high]);
    expect(order).toEqual(["앞줄", "보통"]);
  });
});

describe("작업 증명 실패 기억(D2)", () => {
  it("같은 본문은 다시 계산하지 않고, 같은 열쇠는 3번 떨어지면 그 회차 동안 막고, 회차가 바뀌면 잊는다", () => {
    const f = new PowFailures();
    expect(f.blocked("1", "body-a", "key")).toBeNull();
    f.failed("1", "body-a", "key");
    expect(f.blocked("1", "body-a", "key")).toMatch("이미 계산이 맞지 않은");
    f.failed("1", "body-b", "key");
    expect(f.blocked("1", "body-c", "key")).toBeNull();
    f.failed("1", "body-c", "key");
    expect(f.blocked("1", "body-d", "key")).toMatch("여러 번 맞지 않아");
    expect(f.blocked("1", "body-d", "other")).toBeNull();
    expect(f.blocked("2", "body-a", "key")).toBeNull();
  });

  it("한 회차에 기억하는 수에 상한이 있어 메모리가 끝없이 늘지 않는다", () => {
    const f = new PowFailures(3, 2);
    f.failed("1", "a", "k1");
    f.failed("1", "b", "k2");
    f.failed("1", "c", "k3");
    expect(f.blocked("1", "a", "x")).toBeNull();
    expect(f.blocked("1", "c", "x")).toMatch("이미 계산이 맞지 않은");
  });

  it("앞단 작업 증명을 켜면(열쇠당 1번) 한 번 떨어진 열쇠는 다른 본문도 막는다(docs/36 11-31)", () => {
    const f = new PowFailures(1);
    f.failed("pow|1", "register-body", "key");
    expect(f.blocked("pow|1", "entry-body", "key")).toMatch(
      "여러 번 맞지 않아",
    );
    expect(f.blocked("pow|1", "entry-body", "other")).toBeNull();
  });
});

describe("응모 앞단 작업 증명 설정(docs/36 11-31)", () => {
  const get = (vars: Record<string, string>) => (name: string) => vars[name];
  it("기본은 평균 512번으로 켜고, 0이면 끈다", () => {
    expect(frontGateConfig(get({}))).toEqual({
      target: powTargetForTries(DEFAULT_GATE_TRIES),
    });
    expect(DEFAULT_GATE_TRIES).toBe(512);
    expect(frontGateConfig(get({ STARDRAW_GATE_TRIES: "0" }))).toBeNull();
    expect(() => frontGateConfig(get({ STARDRAW_GATE_TRIES: "-1" }))).toThrow();
  });

  it("유예 시각은 ISO 시각이나 유닉스 초로 받는다", () => {
    expect(
      frontGateConfig(
        get({ STARDRAW_GATE_OPTIONAL_UNTIL: "2026-11-03T00:00:00+09:00" }),
      )?.optionalUntil,
    ).toBe(1793631600);
    expect(
      frontGateConfig(get({ STARDRAW_GATE_OPTIONAL_UNTIL: "1793631600" }))
        ?.optionalUntil,
    ).toBe(1793631600);
    expect(() =>
      frontGateConfig(get({ STARDRAW_GATE_OPTIONAL_UNTIL: "내일" })),
    ).toThrow();
  });
});

describe("IP 앞부분 상한 기본값(공유 IP 기준)", () => {
  it("회사·학교 NAT처럼 외부 IP 하나에 100명이 넘어도 막히지 않게 넉넉하다", () => {
    expect(DEFAULT_PREFIX_LIMITS).toEqual({
      registrationsPerPrefixPerDay: 200,
      entriesPerPrefixPerRound: 200,
      invitesPerPrefixPerDay: 100,
    });
    // 전달 서버 기본값도 같은 값을 쓴다
    expect(DEFAULT_RELAY_LIMITS.invitesPerPrefixPerDay).toBe(
      DEFAULT_PREFIX_LIMITS.invitesPerPrefixPerDay,
    );
  });
});
